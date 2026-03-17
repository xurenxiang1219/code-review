import { EventEmitter } from 'events';
import { ConcurrencyController, createAIReviewConcurrencyController, createWebhookConcurrencyController } from '@/lib/utils/concurrency-control';
import { EnhancedRateLimiter, createAIApiRateLimiter, createWebhookRateLimiter } from '@/lib/utils/rate-limit-enhanced';
import { BackpressureController, createAIReviewBackpressureController, createWebhookBackpressureController } from '@/lib/utils/backpressure';
import { monitoring } from '@/lib/utils/monitoring';
import { logger } from '@/lib/utils/logger';

/**
 * 服务类型
 */
export type ServiceType = 'ai-review' | 'webhook' | 'general';

/**
 * 服务状态
 */
export interface ServiceStatus {
  /** 服务类型 */
  type: ServiceType;
  /** 并发控制状态 */
  concurrency: {
    activeTasks: number;
    queueLength: number;
    maxConcurrency: number;
  };
  /** 速率限制状态 */
  rateLimit: {
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
  };
  /** 背压控制状态 */
  backpressure: {
    state: string;
    queueLength: number;
    processingRate: number;
    droppedItems: number;
  };
  /** 健康状态 */
  healthy: boolean;
  /** 最后更新时间 */
  lastUpdated: Date;
}

/**
 * 系统整体状态
 */
export interface SystemStatus {
  /** 各服务状态 */
  services: Record<ServiceType, ServiceStatus>;
  /** 系统健康状态 */
  overallHealth: 'healthy' | 'warning' | 'critical';
  /** 活跃告警数 */
  activeAlerts: number;
  /** 系统负载 */
  systemLoad: {
    cpu: number;
    memory: number;
    activeConnections: number;
  };
}

/**
 * 并发控制和速率限制管理器
 * 
 * 统一管理系统的并发控制、速率限制和背压处理，提供：
 * - 集中化的服务管理
 * - 统一的监控和告警
 * - 自适应的流量控制
 * - 健康检查和自动恢复
 */
export class ConcurrencyRateLimitManager extends EventEmitter {
  private controllers = new Map<ServiceType, {
    concurrency: ConcurrencyController;
    rateLimit: EnhancedRateLimiter;
    backpressure: BackpressureController<any>;
  }>();
  
  private healthCheckTimer?: NodeJS.Timeout;
  private managerLogger: typeof logger;
  private isShuttingDown = false;

  constructor() {
    super();
    this.managerLogger = logger.child({ service: 'ConcurrencyRateLimitManager' });
    
    // 初始化各服务的控制器
    this.initializeControllers();
    
    // 启动健康检查
    this.startHealthCheck();
    
    // 设置监控指标
    this.setupMonitoring();
  }

  /**
   * 获取AI审查服务的控制器
   */
  getAIReviewControllers() {
    return this.controllers.get('ai-review')!;
  }

  /**
   * 获取Webhook服务的控制器
   */
  getWebhookControllers() {
    return this.controllers.get('webhook')!;
  }

  /**
   * 检查服务是否可用
   * 
   * @param serviceType - 服务类型
   * @param identifier - 标识符（用于速率限制）
   * @returns 服务可用性信息
   */
  async checkServiceAvailability(
    serviceType: ServiceType,
    identifier: string
  ): Promise<{
    available: boolean;
    reason?: string;
    retryAfter?: number;
    queuePosition?: number;
  }> {
    const controllers = this.controllers.get(serviceType);
    if (!controllers) {
      return { available: false, reason: '服务不存在' };
    }

    try {
      // 检查速率限制
      const rateLimitResult = await controllers.rateLimit.checkLimit(identifier);
      if (!rateLimitResult.allowed) {
        return {
          available: false,
          reason: '速率限制',
          retryAfter: rateLimitResult.retryAfter,
        };
      }

      // 检查背压状态
      const backpressureState = controllers.backpressure.getState();
      if (backpressureState === 'overload') {
        return {
          available: false,
          reason: '系统过载',
          retryAfter: 30000, // 30秒后重试
        };
      }

      // 检查并发控制
      const taskId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const concurrencyResult = await controllers.concurrency.acquire(taskId);
      
      if (concurrencyResult.acquired) {
        // 立即释放，只是检查可用性
        await controllers.concurrency.release(taskId);
        return { available: true };
      } else {
        return {
          available: false,
          reason: '并发限制',
          queuePosition: concurrencyResult.queueLength,
          retryAfter: concurrencyResult.estimatedWaitTime,
        };
      }

    } catch (error) {
      this.managerLogger.error('检查服务可用性失败', {
        serviceType,
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        available: false,
        reason: '系统错误',
      };
    }
  }

  /**
   * 执行受控制的操作
   * 
   * @param serviceType - 服务类型
   * @param identifier - 标识符
   * @param operation - 操作函数
   * @param priority - 优先级（可选）
   */
  async executeControlledOperation<T>(
    serviceType: ServiceType,
    identifier: string,
    operation: () => Promise<T>,
    priority?: number
  ): Promise<T> {
    const controllers = this.controllers.get(serviceType);
    if (!controllers) {
      throw new Error(`服务不存在: ${serviceType}`);
    }

    const taskId = `${serviceType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    this.managerLogger.debug('开始执行受控操作', {
      serviceType,
      taskId,
      identifier,
      priority,
    });

    try {
      // 检查速率限制
      const rateLimitResult = await controllers.rateLimit.checkLimit(identifier);
      if (!rateLimitResult.allowed) {
        throw new Error(`速率限制: 请在 ${Math.ceil((rateLimitResult.retryAfter || 0) / 1000)} 秒后重试`);
      }

      // 获取并发控制权限
      const concurrencyResult = await controllers.concurrency.acquire(taskId);
      if (!concurrencyResult.acquired) {
        const acquired = await controllers.concurrency.waitForAcquisition(taskId);
        if (!acquired) {
          throw new Error('并发控制超时');
        }
      }

      // 添加到背压队列
      const enqueued = await controllers.backpressure.enqueue(
        { taskId, identifier, operation },
        priority
      );
      
      if (!enqueued) {
        throw new Error('系统过载，请稍后重试');
      }

      // 执行操作
      const result = await operation();

      // 记录成功指标
      await monitoring.incrementCounter(`${serviceType}_operations_success`, 1, {
        identifier: this.sanitizeIdentifier(identifier),
      });

      const duration = Date.now() - startTime;
      await monitoring.recordHistogram(`${serviceType}_operation_duration`, duration, {
        identifier: this.sanitizeIdentifier(identifier),
      });

      this.managerLogger.info('受控操作执行成功', {
        serviceType,
        taskId,
        duration,
      });

      return result;

    } catch (error) {
      // 记录失败指标
      await monitoring.incrementCounter(`${serviceType}_operations_failure`, 1, {
        identifier: this.sanitizeIdentifier(identifier),
        error: error instanceof Error ? error.constructor.name : 'Unknown',
      });

      const duration = Date.now() - startTime;
      this.managerLogger.error('受控操作执行失败', {
        serviceType,
        taskId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;

    } finally {
      // 释放并发控制权限
      await controllers.concurrency.release(taskId);
    }
  }

  /**
   * 获取服务状态
   * 
   * @param serviceType - 服务类型
   */
  async getServiceStatus(serviceType: ServiceType): Promise<ServiceStatus | null> {
    const controllers = this.controllers.get(serviceType);
    if (!controllers) {
      return null;
    }

    try {
      const [concurrencyStatus, rateLimitStatus, backpressureStats] = await Promise.all([
        controllers.concurrency.getStatus(),
        controllers.rateLimit.getStatus('system'), // 使用系统标识符
        controllers.backpressure.getStats(),
      ]);

      return {
        type: serviceType,
        concurrency: {
          activeTasks: concurrencyStatus.activeTasks,
          queueLength: concurrencyStatus.queueLength,
          maxConcurrency: concurrencyStatus.maxConcurrency,
        },
        rateLimit: {
          current: rateLimitStatus.current,
          limit: rateLimitStatus.limit,
          remaining: rateLimitStatus.remaining,
          resetTime: rateLimitStatus.resetTime,
        },
        backpressure: {
          state: backpressureStats.state,
          queueLength: backpressureStats.queueLength,
          processingRate: backpressureStats.processingRate,
          droppedItems: backpressureStats.droppedItems,
        },
        healthy: this.isServiceHealthy(concurrencyStatus, rateLimitStatus, backpressureStats),
        lastUpdated: new Date(),
      };

    } catch (error) {
      this.managerLogger.error('获取服务状态失败', {
        serviceType,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return null;
    }
  }

  /**
   * 获取系统整体状态
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const services: Record<ServiceType, ServiceStatus> = {} as any;
    
    // 获取各服务状态
    for (const serviceType of ['ai-review', 'webhook', 'general'] as ServiceType[]) {
      const status = await this.getServiceStatus(serviceType);
      if (status) {
        services[serviceType] = status;
      }
    }

    // 获取监控统计
    const monitoringStats = await monitoring.getStats();
    
    // 确定整体健康状态
    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    const serviceHealthStates = Object.values(services).map(s => s.healthy);
    if (serviceHealthStates.some(healthy => !healthy)) {
      overallHealth = 'warning';
    }
    
    if (monitoringStats.healthStatus === 'critical') {
      overallHealth = 'critical';
    }

    // 获取系统负载（简化版本）
    const systemLoad = {
      cpu: 0, // 需要实际的CPU监控
      memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100,
      activeConnections: Object.values(services).reduce((sum, s) => sum + s.concurrency.activeTasks, 0),
    };

    return {
      services,
      overallHealth,
      activeAlerts: monitoringStats.activeAlerts,
      systemLoad,
    };
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.managerLogger.info('开始关闭并发控制和速率限制管理器');

    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // 停止各服务的背压控制器
    for (const [serviceType, controllers] of this.controllers) {
      try {
        controllers.backpressure.stop();
        this.managerLogger.debug('背压控制器已停止', { serviceType });
      } catch (error) {
        this.managerLogger.error('停止背压控制器失败', {
          serviceType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 停止监控系统
    monitoring.stop();

    this.managerLogger.info('并发控制和速率限制管理器已关闭');
  }

  /**
   * 初始化控制器
   */
  private initializeControllers(): void {
    // AI审查服务控制器
    this.controllers.set('ai-review', {
      concurrency: createAIReviewConcurrencyController(),
      rateLimit: createAIApiRateLimiter(),
      backpressure: createAIReviewBackpressureController(),
    });

    // Webhook服务控制器
    this.controllers.set('webhook', {
      concurrency: createWebhookConcurrencyController(),
      rateLimit: createWebhookRateLimiter(),
      backpressure: createWebhookBackpressureController(),
    });

    this.managerLogger.info('控制器初始化完成', {
      services: Array.from(this.controllers.keys()),
    });
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'); // 30秒
    
    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.performHealthCheck();
      } catch (error) {
        this.managerLogger.error('健康检查失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, interval);
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    const systemStatus = await this.getSystemStatus();
    
    // 记录系统状态指标
    await monitoring.setGauge('system_health_score', this.calculateHealthScore(systemStatus));
    await monitoring.setGauge('active_alerts_count', systemStatus.activeAlerts);
    await monitoring.setGauge('system_memory_usage', systemStatus.systemLoad.memory);
    await monitoring.setGauge('active_connections_count', systemStatus.systemLoad.activeConnections);

    // 记录各服务状态
    for (const [serviceType, status] of Object.entries(systemStatus.services)) {
      const labels = { service: serviceType };
      
      await monitoring.setGauge('service_concurrency_active', status.concurrency.activeTasks, labels);
      await monitoring.setGauge('service_concurrency_queue', status.concurrency.queueLength, labels);
      await monitoring.setGauge('service_rate_limit_current', status.rateLimit.current, labels);
      await monitoring.setGauge('service_backpressure_queue', status.backpressure.queueLength, labels);
      await monitoring.setGauge('service_backpressure_rate', status.backpressure.processingRate, labels);
    }

    this.managerLogger.debug('健康检查完成', {
      overallHealth: systemStatus.overallHealth,
      activeAlerts: systemStatus.activeAlerts,
    });

    this.emit('healthCheck', systemStatus);
  }

  /**
   * 设置监控
   */
  private setupMonitoring(): void {
    // 监听告警事件
    monitoring.on('alertTriggered', (alert) => {
      this.managerLogger.warn('系统告警触发', {
        ruleName: alert.ruleName,
        severity: alert.severity,
        message: alert.message,
      });
      
      this.emit('alert', alert);
    });

    monitoring.on('alertResolved', (alert) => {
      this.managerLogger.info('系统告警解决', {
        ruleName: alert.ruleName,
        duration: Date.now() - alert.triggeredAt.getTime(),
      });
      
      this.emit('alertResolved', alert);
    });
  }

  /**
   * 判断服务是否健康
   */
  private isServiceHealthy(
    concurrencyStatus: any,
    rateLimitStatus: any,
    backpressureStats: any
  ): boolean {
    // 并发控制健康检查
    const concurrencyUtilization = concurrencyStatus.activeTasks / concurrencyStatus.maxConcurrency;
    if (concurrencyUtilization > 0.9) {
      return false; // 并发利用率过高
    }

    // 速率限制健康检查
    const rateLimitUtilization = rateLimitStatus.current / rateLimitStatus.limit;
    if (rateLimitUtilization > 0.8) {
      return false; // 速率限制利用率过高
    }

    // 背压控制健康检查
    if (backpressureStats.state === 'critical' || backpressureStats.state === 'overload') {
      return false; // 背压状态异常
    }

    return true;
  }

  /**
   * 计算健康分数
   */
  private calculateHealthScore(systemStatus: SystemStatus): number {
    let score = 100;

    // 根据整体健康状态扣分
    switch (systemStatus.overallHealth) {
      case 'warning':
        score -= 20;
        break;
      case 'critical':
        score -= 50;
        break;
    }

    // 根据活跃告警数扣分
    score -= Math.min(systemStatus.activeAlerts * 5, 30);

    // 根据系统负载扣分
    if (systemStatus.systemLoad.memory > 80) {
      score -= 10;
    }

    return Math.max(score, 0);
  }

  /**
   * 清理标识符（用于监控标签）
   */
  private sanitizeIdentifier(identifier: string): string {
    // 移除敏感信息，只保留有用的标识部分
    return identifier.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
  }
}

// 导出单例实例
export const concurrencyRateLimitManager = new ConcurrencyRateLimitManager();