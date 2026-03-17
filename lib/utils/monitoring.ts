import { EventEmitter } from 'events';
import RedisClient from '@/lib/cache/redis-client';
import { logger } from './logger';

/**
 * 监控指标类型
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

/**
 * 监控指标接口
 */
export interface Metric {
  /** 指标名称 */
  name: string;
  /** 指标类型 */
  type: MetricType;
  /** 指标值 */
  value: number;
  /** 标签 */
  labels?: Record<string, string>;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 告警规则接口
 */
export interface AlertRule {
  /** 规则名称 */
  name: string;
  /** 指标名称 */
  metricName: string;
  /** 条件表达式 */
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  /** 阈值 */
  threshold: number;
  /** 持续时间（毫秒） */
  duration: number;
  /** 告警级别 */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** 告警消息模板 */
  message: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 告警事件接口
 */
export interface AlertEvent {
  /** 事件ID */
  id: string;
  /** 规则名称 */
  ruleName: string;
  /** 指标名称 */
  metricName: string;
  /** 当前值 */
  currentValue: number;
  /** 阈值 */
  threshold: number;
  /** 告警级别 */
  severity: string;
  /** 告警消息 */
  message: string;
  /** 触发时间 */
  triggeredAt: Date;
  /** 状态 */
  status: 'firing' | 'resolved';
  /** 标签 */
  labels?: Record<string, string>;
}

/**
 * 监控统计信息
 */
export interface MonitoringStats {
  /** 指标总数 */
  totalMetrics: number;
  /** 活跃告警数 */
  activeAlerts: number;
  /** 告警规则数 */
  alertRules: number;
  /** 最近1小时的指标数 */
  metricsLastHour: number;
  /** 系统健康状态 */
  healthStatus: 'healthy' | 'warning' | 'critical';
}

/**
 * 监控系统实现类
 * 
 * 功能：
 * - 指标收集和存储
 * - 告警规则管理
 * - 告警触发和通知
 * - 健康状态监控
 * - 性能统计
 */
export class MonitoringSystem extends EventEmitter {
  private metrics = new Map<string, Metric[]>();
  private alertRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, AlertEvent>();
  private monitoringLogger: typeof logger;
  private checkTimer?: NodeJS.Timeout;
  
  // 配置
  private readonly config = {
    metricsRetentionHours: parseInt(process.env.METRICS_RETENTION_HOURS || '24'),
    alertCheckInterval: parseInt(process.env.ALERT_CHECK_INTERVAL || '30000'), // 30秒
    maxMetricsPerName: parseInt(process.env.MAX_METRICS_PER_NAME || '1000'),
    redisKeyPrefix: 'monitoring:',
  };

  constructor() {
    super();
    this.monitoringLogger = logger.child({ service: 'MonitoringSystem' });
    
    // 启动告警检查
    this.startAlertChecking();
    
    // 注册默认告警规则
    this.registerDefaultAlertRules();
  }

  /**
   * 记录指标
   * 
   * @param name - 指标名称
   * @param value - 指标值
   * @param type - 指标类型
   * @param labels - 标签
   */
  async recordMetric(
    name: string,
    value: number,
    type: MetricType = 'gauge',
    labels?: Record<string, string>
  ): Promise<void> {
    const metric: Metric = {
      name,
      type,
      value,
      labels,
      timestamp: Date.now(),
    };

    try {
      // 存储到内存
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      
      const metricList = this.metrics.get(name)!;
      metricList.push(metric);
      
      // 限制内存中的指标数量
      if (metricList.length > this.config.maxMetricsPerName) {
        metricList.shift();
      }

      // 存储到Redis（用于持久化和跨实例共享）
      await this.persistMetric(metric);

      this.monitoringLogger.debug('指标已记录', {
        name,
        value,
        type,
        labels,
      });

      this.emit('metricRecorded', metric);

    } catch (error) {
      this.monitoringLogger.error('记录指标失败', {
        name,
        value,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 增加计数器
   * 
   * @param name - 计数器名称
   * @param increment - 增量（默认1）
   * @param labels - 标签
   */
  async incrementCounter(
    name: string,
    increment = 1,
    labels?: Record<string, string>
  ): Promise<void> {
    const currentValue = this.getLatestMetricValue(name) || 0;
    await this.recordMetric(name, currentValue + increment, 'counter', labels);
  }

  /**
   * 设置仪表盘值
   * 
   * @param name - 仪表盘名称
   * @param value - 值
   * @param labels - 标签
   */
  async setGauge(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): Promise<void> {
    await this.recordMetric(name, value, 'gauge', labels);
  }

  /**
   * 记录直方图值
   * 
   * @param name - 直方图名称
   * @param value - 值
   * @param labels - 标签
   */
  async recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): Promise<void> {
    await this.recordMetric(name, value, 'histogram', labels);
  }

  /**
   * 计时器装饰器
   * 
   * @param name - 计时器名称
   * @param labels - 标签
   */
  timer(name: string, labels?: Record<string, string>) {
    const startTime = Date.now();
    
    return {
      end: async () => {
        const duration = Date.now() - startTime;
        await this.recordMetric(name, duration, 'timer', labels);
        return duration;
      },
    };
  }

  /**
   * 添加告警规则
   * 
   * @param rule - 告警规则
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.name, rule);
    
    this.monitoringLogger.info('告警规则已添加', {
      ruleName: rule.name,
      metricName: rule.metricName,
      condition: rule.condition,
      threshold: rule.threshold,
    });
  }

  /**
   * 移除告警规则
   * 
   * @param ruleName - 规则名称
   */
  removeAlertRule(ruleName: string): void {
    this.alertRules.delete(ruleName);
    
    // 解决相关的活跃告警
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.ruleName === ruleName) {
        this.resolveAlert(alertId);
      }
    }
    
    this.monitoringLogger.info('告警规则已移除', { ruleName });
  }

  /**
   * 获取指标值
   * 
   * @param name - 指标名称
   * @param timeRange - 时间范围（毫秒）
   */
  getMetrics(name: string, timeRange?: number): Metric[] {
    const metrics = this.metrics.get(name) || [];
    
    if (!timeRange) {
      return metrics;
    }
    
    const cutoffTime = Date.now() - timeRange;
    return metrics.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * 获取最新指标值
   * 
   * @param name - 指标名称
   */
  getLatestMetricValue(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) {
      return null;
    }
    
    return metrics[metrics.length - 1].value;
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 获取监控统计信息
   */
  async getStats(): Promise<MonitoringStats> {
    const totalMetrics = Array.from(this.metrics.values())
      .reduce((sum, metrics) => sum + metrics.length, 0);
    
    const activeAlerts = this.activeAlerts.size;
    const alertRules = this.alertRules.size;
    
    // 计算最近1小时的指标数
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const metricsLastHour = Array.from(this.metrics.values())
      .flat()
      .filter(metric => metric.timestamp >= oneHourAgo)
      .length;
    
    // 确定健康状态
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    const criticalAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'critical');
    
    const warningAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'warning' || alert.severity === 'error');
    
    if (criticalAlerts.length > 0) {
      healthStatus = 'critical';
    } else if (warningAlerts.length > 0) {
      healthStatus = 'warning';
    }

    return {
      totalMetrics,
      activeAlerts,
      alertRules,
      metricsLastHour,
      healthStatus,
    };
  }

  /**
   * 清理过期指标
   */
  async cleanup(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.metricsRetentionHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [name, metrics] of this.metrics) {
      const originalLength = metrics.length;
      const filteredMetrics = metrics.filter(metric => metric.timestamp >= cutoffTime);
      
      this.metrics.set(name, filteredMetrics);
      cleanedCount += originalLength - filteredMetrics.length;
    }

    // 清理Redis中的过期指标
    await this.cleanupRedisMetrics(cutoffTime);

    this.monitoringLogger.info('指标清理完成', {
      cleanedCount,
      retentionHours: this.config.metricsRetentionHours,
    });
  }

  /**
   * 停止监控系统
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    
    this.monitoringLogger.info('监控系统已停止');
  }

  /**
   * 持久化指标到Redis
   */
  private async persistMetric(metric: Metric): Promise<void> {
    try {
      const redis = await RedisClient.getInstance();
      const key = `${this.config.redisKeyPrefix}metrics:${metric.name}`;
      
      // 使用有序集合存储指标，时间戳作为分数
      await redis.zadd(key, metric.timestamp, JSON.stringify({
        value: metric.value,
        type: metric.type,
        labels: metric.labels,
        timestamp: metric.timestamp,
      }));
      
      // 设置过期时间
      const expireSeconds = this.config.metricsRetentionHours * 3600;
      await redis.expire(key, expireSeconds);
      
    } catch (error) {
      this.monitoringLogger.error('持久化指标失败', {
        metricName: metric.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 清理Redis中的过期指标
   */
  private async cleanupRedisMetrics(cutoffTime: number): Promise<void> {
    try {
      const redis = await RedisClient.getInstance();
      const pattern = `${this.config.redisKeyPrefix}metrics:*`;
      const keys = await redis.keys(pattern);
      
      for (const key of keys) {
        // 移除过期的指标
        await redis.zremrangebyscore(key, '-inf', cutoffTime);
      }
      
    } catch (error) {
      this.monitoringLogger.error('清理Redis指标失败', { error });
    }
  }

  /**
   * 启动告警检查
   */
  private startAlertChecking(): void {
    this.checkTimer = setInterval(() => {
      this.checkAlerts().catch(error => {
        this.monitoringLogger.error('告警检查失败', { error });
      });
    }, this.config.alertCheckInterval);
  }

  /**
   * 检查告警
   */
  private async checkAlerts(): Promise<void> {
    for (const [ruleName, rule] of this.alertRules) {
      if (!rule.enabled) {
        continue;
      }

      try {
        await this.checkSingleAlert(rule);
      } catch (error) {
        this.monitoringLogger.error('检查单个告警失败', {
          ruleName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 检查单个告警规则
   */
  private async checkSingleAlert(rule: AlertRule): Promise<void> {
    const latestValue = this.getLatestMetricValue(rule.metricName);
    
    if (latestValue === null) {
      return; // 没有指标数据
    }

    const isTriggered = this.evaluateCondition(latestValue, rule.condition, rule.threshold);
    const alertId = `${rule.name}:${rule.metricName}`;
    const existingAlert = this.activeAlerts.get(alertId);

    if (isTriggered && !existingAlert) {
      // 触发新告警
      const alert: AlertEvent = {
        id: alertId,
        ruleName: rule.name,
        metricName: rule.metricName,
        currentValue: latestValue,
        threshold: rule.threshold,
        severity: rule.severity,
        message: this.formatAlertMessage(rule.message, latestValue, rule.threshold),
        triggeredAt: new Date(),
        status: 'firing',
      };

      this.activeAlerts.set(alertId, alert);
      
      this.monitoringLogger.warn('告警触发', {
        ruleName: rule.name,
        metricName: rule.metricName,
        currentValue: latestValue,
        threshold: rule.threshold,
        severity: rule.severity,
      });

      this.emit('alertTriggered', alert);
      
    } else if (!isTriggered && existingAlert) {
      // 解决告警
      this.resolveAlert(alertId);
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * 格式化告警消息
   */
  private formatAlertMessage(template: string, currentValue: number, threshold: number): string {
    return template
      .replace('{value}', currentValue.toString())
      .replace('{threshold}', threshold.toString());
  }

  /**
   * 解决告警
   */
  private resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return;
    }

    alert.status = 'resolved';
    this.activeAlerts.delete(alertId);

    this.monitoringLogger.info('告警已解决', {
      alertId,
      ruleName: alert.ruleName,
      duration: Date.now() - alert.triggeredAt.getTime(),
    });

    this.emit('alertResolved', alert);
  }

  /**
   * 注册默认告警规则
   */
  private registerDefaultAlertRules(): void {
    // AI API调用失败率告警
    this.addAlertRule({
      name: 'ai_api_failure_rate_high',
      metricName: 'ai_api_failure_rate',
      condition: 'gt',
      threshold: 10, // 10%
      duration: 300000, // 5分钟
      severity: 'warning',
      message: 'AI API调用失败率过高: {value}% (阈值: {threshold}%)',
      enabled: true,
    });

    // 队列长度告警
    this.addAlertRule({
      name: 'review_queue_length_high',
      metricName: 'review_queue_length',
      condition: 'gt',
      threshold: 50,
      duration: 600000, // 10分钟
      severity: 'warning',
      message: '审查队列长度过长: {value} (阈值: {threshold})',
      enabled: true,
    });

    // 并发数告警
    this.addAlertRule({
      name: 'concurrent_reviews_high',
      metricName: 'concurrent_reviews',
      condition: 'gte',
      threshold: 9, // 接近最大并发数10
      duration: 300000, // 5分钟
      severity: 'info',
      message: '并发审查数接近上限: {value} (阈值: {threshold})',
      enabled: true,
    });

    // 处理时间告警
    this.addAlertRule({
      name: 'review_processing_time_high',
      metricName: 'review_processing_time_avg',
      condition: 'gt',
      threshold: 300000, // 5分钟
      duration: 600000, // 10分钟
      severity: 'warning',
      message: '平均审查处理时间过长: {value}ms (阈值: {threshold}ms)',
      enabled: true,
    });
  }
}

// 导出单例实例
export const monitoring = new MonitoringSystem();

/**
 * 监控装饰器
 * 
 * @param metricName - 指标名称
 * @param labels - 标签
 */
export function withMonitoring(metricName: string, labels?: Record<string, string>) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const timer = monitoring.timer(`${metricName}_duration`, labels);
      
      try {
        const result = await originalMethod.apply(this, args);
        
        // 记录成功指标
        await monitoring.incrementCounter(`${metricName}_success`, 1, labels);
        
        return result;
      } catch (error) {
        // 记录失败指标
        await monitoring.incrementCounter(`${metricName}_failure`, 1, labels);
        throw error;
      } finally {
        await timer.end();
      }
    };

    return descriptor;
  };
}