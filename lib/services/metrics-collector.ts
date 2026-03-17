import { logger } from '@/lib/utils/logger';
import { monitoring } from '@/lib/utils/monitoring';
import RedisClient from '@/lib/cache/redis-client';
import { getReviewStats } from '@/lib/db/repositories/review';

/**
 * 系统指标收集器
 * 
 * 功能：
 * - 定期收集系统关键指标
 * - 监控资源使用情况
 * - 记录业务指标
 * - 计算性能统计
 */
export class MetricsCollector {
  private collectTimer?: NodeJS.Timeout;
  private metricsLogger = logger.child({ service: 'MetricsCollector' });
  private isCollecting = false;
  
  // 配置
  private readonly config = {
    collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL || '30000'), // 30秒
    enableSystemMetrics: process.env.ENABLE_SYSTEM_METRICS !== 'false',
    enableBusinessMetrics: process.env.ENABLE_BUSINESS_METRICS !== 'false',
    enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS !== 'false',
  };

  constructor() {
    this.metricsLogger.info('指标收集器已初始化', {
      collectInterval: this.config.collectInterval,
      systemMetrics: this.config.enableSystemMetrics,
      businessMetrics: this.config.enableBusinessMetrics,
      performanceMetrics: this.config.enablePerformanceMetrics,
    });
  }

  /**
   * 启动指标收集
   */
  start(): void {
    if (this.collectTimer) {
      this.metricsLogger.warn('指标收集器已在运行');
      return;
    }

    this.collectTimer = setInterval(() => {
      this.collectMetrics().catch(error => {
        this.metricsLogger.error('指标收集失败', { error });
      });
    }, this.config.collectInterval);

    // 立即执行一次收集
    this.collectMetrics().catch(error => {
      this.metricsLogger.error('初始指标收集失败', { error });
    });

    this.metricsLogger.info('指标收集器已启动');
  }

  /**
   * 停止指标收集
   */
  stop(): void {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = undefined;
      this.metricsLogger.info('指标收集器已停止');
    }
  }

  /**
   * 手动触发指标收集
   */
  async collectNow(): Promise<void> {
    await this.collectMetrics();
  }

  /**
   * 收集所有指标
   */
  private async collectMetrics(): Promise<void> {
    if (this.isCollecting) {
      this.metricsLogger.debug('指标收集正在进行中，跳过本次收集');
      return;
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      const tasks = [];

      if (this.config.enableSystemMetrics) {
        tasks.push(this.collectSystemMetrics());
      }

      if (this.config.enableBusinessMetrics) {
        tasks.push(this.collectBusinessMetrics());
      }

      if (this.config.enablePerformanceMetrics) {
        tasks.push(this.collectPerformanceMetrics());
      }

      await Promise.all(tasks);

      const duration = Date.now() - startTime;
      await monitoring.recordMetric('metrics_collection_duration', duration, 'timer');

      this.metricsLogger.debug('指标收集完成', { duration: `${duration}ms` });

    } catch (error) {
      this.metricsLogger.error('指标收集过程中发生错误', { error });
      await monitoring.incrementCounter('metrics_collection_errors');
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 收集系统指标
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const memUsage = process.memoryUsage();
      await Promise.all([
        monitoring.setGauge('process_memory_rss', memUsage.rss),
        monitoring.setGauge('process_memory_heap_used', memUsage.heapUsed),
        monitoring.setGauge('process_memory_heap_total', memUsage.heapTotal),
        monitoring.setGauge('process_memory_external', memUsage.external),
      ]);

      const cpuUsage = process.cpuUsage();
      await Promise.all([
        monitoring.setGauge('process_cpu_user', cpuUsage.user),
        monitoring.setGauge('process_cpu_system', cpuUsage.system),
        monitoring.setGauge('process_uptime', process.uptime()),
      ]);

      this.metricsLogger.debug('系统指标收集完成');
    } catch (error) {
      this.metricsLogger.error('收集系统指标失败', { error });
    }
  }

  /**
   * 收集业务指标
   */
  private async collectBusinessMetrics(): Promise<void> {
    try {
      const reviewStats = await getReviewStats();
      
      await Promise.all([
        monitoring.setGauge('reviews_total', reviewStats.total),
        monitoring.setGauge('reviews_completed', reviewStats.completed),
        monitoring.setGauge('reviews_failed', reviewStats.failed),
        monitoring.setGauge('reviews_pending', reviewStats.pending),
      ]);

      const successRate = reviewStats.total > 0 
        ? (reviewStats.completed / reviewStats.total) * 100 
        : 100;
      await monitoring.setGauge('review_success_rate', successRate);

      await Promise.all([
        monitoring.setGauge('issues_critical', reviewStats.issues.critical),
        monitoring.setGauge('issues_major', reviewStats.issues.major),
        monitoring.setGauge('issues_minor', reviewStats.issues.minor),
        monitoring.setGauge('issues_suggestions', reviewStats.issues.suggestions),
      ]);

      const avgIssues = reviewStats.completed > 0 
        ? reviewStats.issues.total / reviewStats.completed 
        : 0;
      await monitoring.setGauge('avg_issues_per_review', avgIssues);

      this.metricsLogger.debug('业务指标收集完成', {
        totalReviews: reviewStats.total,
        successRate: `${successRate.toFixed(2)}%`,
      });
    } catch (error) {
      this.metricsLogger.error('收集业务指标失败', { error });
    }
  }

  /**
   * 收集性能指标
   */
  private async collectPerformanceMetrics(): Promise<void> {
    try {
      // Redis 连接状态
      const redisHealthy = await this.checkRedisHealth();
      await monitoring.setGauge('redis_healthy', redisHealthy ? 1 : 0);

      if (redisHealthy) {
        const redis = await RedisClient.getInstance();
        
        // Redis 内存使用情况
        const info = await redis.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        if (memoryMatch) {
          const usedMemory = parseInt(memoryMatch[1]);
          await monitoring.setGauge('redis_memory_usage', usedMemory);
        }

        // Redis 连接数
        const clientInfo = await redis.info('clients');
        const clientsMatch = clientInfo.match(/connected_clients:(\d+)/);
        if (clientsMatch) {
          const connectedClients = parseInt(clientsMatch[1]);
          await monitoring.setGauge('redis_connections_active', connectedClients);
        }
      }

      // 队列长度（从Redis获取）
      const queueLength = await this.getQueueLength();
      await monitoring.setGauge('review_queue_length', queueLength);

      // 并发审查数（从Redis获取）
      const concurrentReviews = await this.getConcurrentReviews();
      await monitoring.setGauge('concurrent_reviews', concurrentReviews);

      this.metricsLogger.debug('性能指标收集完成', {
        redisHealthy,
        queueLength,
        concurrentReviews,
      });

    } catch (error) {
      this.metricsLogger.error('收集性能指标失败', { error });
    }
  }

  /**
   * 检查Redis健康状态
   */
  private async checkRedisHealth(): Promise<boolean> {
    try {
      const redis = await RedisClient.getInstance();
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取队列长度
   */
  private async getQueueLength(): Promise<number> {
    try {
      const redis = await RedisClient.getInstance();
      const length = await redis.zcard('review:queue');
      return length;
    } catch (error) {
      this.metricsLogger.error('获取队列长度失败', { error });
      return 0;
    }
  }

  /**
   * 获取并发审查数
   */
  private async getConcurrentReviews(): Promise<number> {
    try {
      const redis = await RedisClient.getInstance();
      const count = await redis.scard('review:processing');
      return count;
    } catch (error) {
      this.metricsLogger.error('获取并发审查数失败', { error });
      return 0;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return !this.isCollecting || this.collectTimer !== undefined;
  }
}

// 导出单例实例
export const metricsCollector = new MetricsCollector();