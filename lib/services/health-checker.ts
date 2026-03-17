import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';
import RedisClient from '@/lib/cache/redis-client';
import { createDefaultAIClient } from '@/lib/ai/client';
import type {
  SystemHealth,
  ServiceHealth,
  HealthStatus,
  HealthCheckConfig,
} from '@/types/health';

/**
 * 健康检查服务类
 */
export class HealthChecker {
  private readonly logger = logger.child({ service: 'HealthChecker' });
  private readonly startTime = Date.now();

  /**
   * 执行系统健康检查
   * @param config - 健康检查配置
   * @returns 系统健康状态
   */
  async checkSystemHealth(config: HealthCheckConfig): Promise<SystemHealth> {
    this.logger.info('开始系统健康检查');
    const startTime = Date.now();

    const services: ServiceHealth[] = [];

    // 并行检查各个服务
    const checks = await Promise.allSettled([
      config.checkDatabase ? this.checkDatabase(config.timeout) : null,
      config.checkRedis ? this.checkRedis(config.timeout) : null,
      config.checkAI ? this.checkAIService(config.timeout) : null,
    ]);

    // 处理检查结果
    if (config.checkDatabase && checks[0]) {
      services.push(this.getServiceResult(checks[0], 'database'));
    }
    if (config.checkRedis && checks[1]) {
      services.push(this.getServiceResult(checks[1], 'redis'));
    }
    if (config.checkAI && checks[2]) {
      services.push(this.getServiceResult(checks[2], 'ai'));
    }

    // 计算系统整体状态
    const systemStatus = this.calculateSystemStatus(services);
    const systemInfo = this.getSystemInfo();

    const result: SystemHealth = {
      status: systemStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      services,
      system: systemInfo,
    };

    const duration = Date.now() - startTime;
    this.logger.info('系统健康检查完成', {
      status: systemStatus,
      duration: `${duration}ms`,
      servicesCount: services.length,
    });

    return result;
  }

  /**
   * 检查数据库健康状态
   * @param timeout - 超时时间
   * @returns 数据库健康状态
   */
  private async checkDatabase(timeout: number): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      await db.initialize();

      const isHealthy = await this.performHealthCheck(
        db.healthCheck(),
        timeout,
        '数据库健康检查超时'
      );
      
      const responseTime = Date.now() - startTime;

      if (!isHealthy) {
        return {
          name: 'database',
          status: 'unhealthy',
          responseTime,
          error: '数据库连接检查失败',
          timestamp: Date.now(),
        };
      }

      let poolStatus;
      try {
        poolStatus = db.getPoolStatus();
      } catch (error) {
        poolStatus = null;
      }
      
      const details = poolStatus 
        ? { type: 'MySQL', poolStatus }
        : { type: 'MySQL' };

      return {
        name: 'database',
        status: 'healthy',
        responseTime,
        details,
        timestamp: Date.now(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.warn('数据库健康检查失败', { error: errorMessage, responseTime });
      
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 执行健康检查并处理超时
   * @param healthCheckPromise - 健康检查 Promise
   * @param timeout - 超时时间
   * @param timeoutMessage - 超时错误消息
   * @returns 健康检查结果
   */
  private performHealthCheck(
    healthCheckPromise: Promise<boolean>,
    timeout: number,
    timeoutMessage: string
  ): Promise<boolean> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeout);
    });
    return Promise.race([healthCheckPromise, timeoutPromise]);
  }

  /**
   * 检查 Redis 健康状态
   * @param timeout - 超时时间
   * @returns Redis 健康状态
   */
  private async checkRedis(timeout: number): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.performHealthCheck(
        RedisClient.healthCheck(),
        timeout,
        'Redis 健康检查超时'
      );
      
      const responseTime = Date.now() - startTime;

      if (!isHealthy) {
        return {
          name: 'redis',
          status: 'unhealthy',
          responseTime,
          error: 'Redis 连接检查失败',
          timestamp: Date.now(),
        };
      }

      const status = RedisClient.getStatus();
      
      return {
        name: 'redis',
        status: 'healthy',
        responseTime,
        details: {
          connected: status.connected,
          status: status.status,
          host: status.host,
          port: status.port,
          db: status.db,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.warn('Redis 健康检查失败', { error: errorMessage, responseTime });
      
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 检查 AI 服务健康状态
   * @param timeout - 超时时间
   * @returns AI 服务健康状态
   */
  private async checkAIService(timeout: number): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const aiClient = createDefaultAIClient();
      const isHealthy = await this.performHealthCheck(
        aiClient.healthCheck(),
        timeout,
        'AI 服务健康检查超时'
      );
      
      const responseTime = Date.now() - startTime;

      if (!isHealthy) {
        return {
          name: 'ai',
          status: 'unhealthy',
          responseTime,
          error: 'AI 服务连接检查失败',
          timestamp: Date.now(),
        };
      }

      const config = aiClient.getConfig();
      
      return {
        name: 'ai',
        status: 'healthy',
        responseTime,
        details: {
          provider: config.provider,
          model: config.model,
          hasApiKey: !!config.apiKey,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.warn('AI 服务健康检查失败', { error: errorMessage, responseTime });
      
      return {
        name: 'ai',
        status: 'unhealthy',
        responseTime,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 从 Promise.allSettled 结果中提取服务健康状态
   * @param result - Promise 结果
   * @param serviceName - 服务名称
   * @returns 服务健康状态
   */
  private getServiceResult(
    result: PromiseSettledResult<ServiceHealth | null>,
    serviceName: string
  ): ServiceHealth {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }

    const error = result.status === 'rejected' ? result.reason : '未知错误';
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      name: serviceName,
      status: 'unhealthy',
      responseTime: 0,
      error: errorMessage,
      timestamp: Date.now(),
    };
  }

  /**
   * 计算系统整体健康状态
   * @param services - 各服务健康状态
   * @returns 系统整体状态
   */
  private calculateSystemStatus(services: ServiceHealth[]): HealthStatus {
    if (services.length === 0) {
      return 'healthy';
    }

    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    if (unhealthyCount > 0) {
      return 'unhealthy';
    }

    const degradedCount = services.filter(s => s.status === 'degraded').length;
    if (degradedCount > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * 获取系统信息
   * @returns 系统信息
   */
  private getSystemInfo() {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    const usedMemory = memUsage.heapUsed;

    return {
      nodeVersion: process.version,
      memory: {
        used: Math.round(usedMemory / 1024 / 1024), // MB
        total: Math.round(totalMemory / 1024 / 1024), // MB
        usage: Math.round((usedMemory / totalMemory) * 100), // %
      },
      cpu: {
        usage: 0, // Node.js 无法直接获取 CPU 使用率，需要第三方库
      },
    };
  }

  /**
   * 获取默认健康检查配置
   * @returns 默认配置
   */
  static getDefaultConfig(): HealthCheckConfig {
    return {
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
      checkDatabase: process.env.HEALTH_CHECK_DATABASE !== 'false',
      checkRedis: process.env.HEALTH_CHECK_REDIS !== 'false',
      checkAI: process.env.HEALTH_CHECK_AI !== 'false',
    };
  }
}

/**
 * 创建默认健康检查器实例
 */
export function createHealthChecker(): HealthChecker {
  return new HealthChecker();
}