import { logger } from '@/lib/utils/logger';
import { monitoring } from '@/lib/utils/monitoring';
import { alertManager } from './alert-manager';
import RedisClient from '@/lib/cache/redis-client';

/**
 * 仪表板指标数据
 */
export interface DashboardMetrics {
  /** 系统概览 */
  overview: {
    /** 总处理请求数 */
    totalRequests: number;
    /** 成功率 */
    successRate: number;
    /** 平均处理时间 */
    avgProcessingTime: number;
    /** 当前并发数 */
    currentConcurrency: number;
    /** 队列长度 */
    queueLength: number;
  };
  
  /** 性能指标 */
  performance: {
    /** AI API调用统计 */
    aiApiCalls: {
      total: number;
      success: number;
      failure: number;
      avgResponseTime: number;
    };
    /** 数据库操作统计 */
    database: {
      connections: number;
      avgQueryTime: number;
      slowQueries: number;
    };
    /** Redis操作统计 */
    redis: {
      connections: number;
      avgResponseTime: number;
      memoryUsage: number;
    };
  };
  
  /** 业务指标 */
  business: {
    /** 审查统计 */
    reviews: {
      total: number;
      completed: number;
      failed: number;
      avgIssuesPerReview: number;
    };
    /** 问题分布 */
    issues: {
      critical: number;
      major: number;
      minor: number;
      suggestions: number;
    };
  };
  
  /** 告警状态 */
  alerts: {
    active: number;
    resolved: number;
    silenced: number;
    bySeverity: Record<string, number>;
  };
  
  /** 时间戳 */
  timestamp: number;
}

/**
 * 时间序列数据点
 */
export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

/**
 * 时间序列数据
 */
export interface TimeSeriesData {
  metricName: string;
  dataPoints: TimeSeriesDataPoint[];
  aggregation: 'avg' | 'sum' | 'max' | 'min' | 'count';
}

/**
 * 监控仪表板服务
 * 
 * 功能：
 * - 收集和聚合监控指标
 * - 提供实时仪表板数据
 * - 生成时间序列数据
 * - 计算性能统计
 */
export class MonitoringDashboardService {
  private dashboardLogger = logger.child({ service: 'MonitoringDashboard' });
  private metricsCache = new Map<string, any>();
  private readonly cacheTimeout = 30000; // 30秒缓存

  constructor() {
    this.dashboardLogger.info('监控仪表板服务已初始化');
  }

  /**
   * 获取仪表板指标数据
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const cacheKey = 'dashboard_metrics';
    const cached = this.metricsCache.get(cacheKey);
    
    if (cached?.timestamp && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const metrics = await this.collectDashboardMetrics();
    
    this.metricsCache.set(cacheKey, {
      data: metrics,
      timestamp: Date.now(),
    });

    return metrics;
  }

  /**
   * 获取时间序列数据
   */
  async getTimeSeriesData(
    metricName: string,
    timeRange: number,
    aggregation: 'avg' | 'sum' | 'max' | 'min' | 'count' = 'avg',
    interval = 60000 // 1分钟间隔
  ): Promise<TimeSeriesData> {
    const metrics = monitoring.getMetrics(metricName, timeRange);
    
    if (metrics.length === 0) {
      return {
        metricName,
        dataPoints: [],
        aggregation,
      };
    }

    // 按时间间隔聚合数据
    const dataPoints = this.aggregateMetrics(metrics, interval, aggregation);

    return {
      metricName,
      dataPoints,
      aggregation,
    };
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    components: Record<string, boolean>;
    uptime: number;
    version: string;
  }> {
    const components = {
      database: await this.checkDatabaseHealth(),
      redis: await this.checkRedisHealth(),
      monitoring: await this.checkMonitoringHealth(),
      alertManager: await alertManager.healthCheck(),
    };

    const failedComponents = Object.values(components).filter(status => !status).length;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (failedComponents > 0) {
      status = failedComponents >= 2 ? 'critical' : 'warning';
    }

    return {
      status,
      components,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  /**
   * 获取性能报告
   */
  async getPerformanceReport(timeRange = 3600000): Promise<{
    summary: {
      avgProcessingTime: number;
      successRate: number;
      throughput: number;
      errorRate: number;
    };
    trends: {
      processingTime: TimeSeriesData;
      successRate: TimeSeriesData;
      errorRate: TimeSeriesData;
    };
    topErrors: Array<{
      error: string;
      count: number;
      percentage: number;
    }>;
  }> {
    const [
      processingTimeData,
      successRateData,
      errorRateData,
    ] = await Promise.all([
      this.getTimeSeriesData('review_processing_time', timeRange, 'avg'),
      this.getTimeSeriesData('review_success_rate', timeRange, 'avg'),
      this.getTimeSeriesData('review_error_rate', timeRange, 'avg'),
    ]);

    // 计算汇总统计
    const avgProcessingTime = this.calculateAverage(processingTimeData.dataPoints);
    const successRate = this.calculateAverage(successRateData.dataPoints);
    const errorRate = this.calculateAverage(errorRateData.dataPoints);
    const throughput = this.calculateThroughput(timeRange);

    return {
      summary: {
        avgProcessingTime,
        successRate,
        throughput,
        errorRate,
      },
      trends: {
        processingTime: processingTimeData,
        successRate: successRateData,
        errorRate: errorRateData,
      },
      topErrors: await this.getTopErrors(),
    };
  }

  /**
   * 收集仪表板指标数据
   */
  private async collectDashboardMetrics(): Promise<DashboardMetrics> {
    this.dashboardLogger.debug('开始收集仪表板指标数据');
    
    try {
      const systemMetrics = await this.collectSystemMetrics();
      this.dashboardLogger.debug('系统指标收集完成', { systemMetrics });
      
      const alertStats = alertManager.getAlertStats();
      this.dashboardLogger.debug('告警统计获取完成', { alertStats });

      const result = {
        overview: {
          totalRequests: systemMetrics.totalRequests,
          successRate: systemMetrics.successRate,
          avgProcessingTime: systemMetrics.avgProcessingTime,
          currentConcurrency: systemMetrics.currentConcurrency,
          queueLength: systemMetrics.queueLength,
        },
        performance: {
          aiApiCalls: systemMetrics.aiApiCalls,
          database: systemMetrics.database,
          redis: systemMetrics.redis,
        },
        business: {
          reviews: systemMetrics.reviews,
          issues: systemMetrics.issues,
        },
        alerts: {
          active: alertStats.total,
          resolved: 0,
          silenced: alertStats.silencedCount,
          bySeverity: alertStats.bySeverity,
        },
        timestamp: Date.now(),
      };

      this.dashboardLogger.debug('仪表板指标数据构建完成', { result });
      return result;
      
    } catch (error) {
      this.dashboardLogger.error('收集仪表板指标数据失败', { error });
      throw error;
    }
  }
  /**
   * 收集系统指标
   */
  private async collectSystemMetrics(): Promise<any> {
    this.dashboardLogger.debug('开始收集系统指标');
    
    // 获取基础指标（从Redis获取实际数据）
    const [
      totalRequests,
      successfulRequests,
      avgProcessingTime,
      currentConcurrency,
      queueLength,
      // AI API调用统计
      aiApiTotal,
      aiApiSuccess,
      aiApiFailure,
      aiApiAvgTime,
      // 数据库统计
      dbConnections,
      dbAvgQueryTime,
      dbSlowQueries,
      // Redis统计
      redisConnections,
      redisAvgTime,
      redisMemory,
      redisHealthy,
      // 业务指标
      reviewsTotal,
      reviewsCompleted,
      reviewsFailed,
      reviewsPending,
      avgIssuesPerReview,
      successRateFromMetrics,
      // 问题分布
      criticalIssues,
      majorIssues,
      minorIssues,
      suggestions,
    ] = await Promise.all([
      monitoring.getLatestMetricValueFromRedis('total_requests'),
      monitoring.getLatestMetricValueFromRedis('successful_requests'),
      monitoring.getLatestMetricValueFromRedis('avg_processing_time'),
      monitoring.getLatestMetricValueFromRedis('concurrent_reviews'),
      monitoring.getLatestMetricValueFromRedis('review_queue_length'),
      monitoring.getLatestMetricValueFromRedis('ai_api_calls_total'),
      monitoring.getLatestMetricValueFromRedis('ai_api_calls_success'),
      monitoring.getLatestMetricValueFromRedis('ai_api_calls_failure'),
      monitoring.getLatestMetricValueFromRedis('ai_api_response_time_avg'),
      monitoring.getLatestMetricValueFromRedis('db_connections_active'),
      monitoring.getLatestMetricValueFromRedis('db_query_time_avg'),
      monitoring.getLatestMetricValueFromRedis('db_slow_queries'),
      monitoring.getLatestMetricValueFromRedis('redis_connections_active'),
      monitoring.getLatestMetricValueFromRedis('redis_response_time_avg'),
      monitoring.getLatestMetricValueFromRedis('redis_memory_usage'),
      monitoring.getLatestMetricValueFromRedis('redis_healthy'),
      monitoring.getLatestMetricValueFromRedis('reviews_total'),
      monitoring.getLatestMetricValueFromRedis('reviews_completed'),
      monitoring.getLatestMetricValueFromRedis('reviews_failed'),
      monitoring.getLatestMetricValueFromRedis('reviews_pending'),
      monitoring.getLatestMetricValueFromRedis('avg_issues_per_review'),
      monitoring.getLatestMetricValueFromRedis('review_success_rate'),
      monitoring.getLatestMetricValueFromRedis('issues_critical'),
      monitoring.getLatestMetricValueFromRedis('issues_major'),
      monitoring.getLatestMetricValueFromRedis('issues_minor'),
      monitoring.getLatestMetricValueFromRedis('issues_suggestions'),
    ]);

    this.dashboardLogger.debug('Redis指标获取完成', {
      reviewsTotal,
      reviewsCompleted,
      reviewsFailed,
      totalRequests,
      successfulRequests,
    });

    // 计算成功率（如果Redis中没有，则计算）
    const calculatedSuccessRate = (totalRequests ?? 0) > 0 
      ? ((successfulRequests ?? 0) / (totalRequests ?? 0)) * 100 
      : 100;

    const result = {
      totalRequests: totalRequests ?? 0,
      successRate: successRateFromMetrics ?? calculatedSuccessRate,
      avgProcessingTime: avgProcessingTime ?? 0,
      currentConcurrency: currentConcurrency ?? 0,
      queueLength: queueLength ?? 0,
      aiApiCalls: {
        total: aiApiTotal ?? 0,
        success: aiApiSuccess ?? 0,
        failure: aiApiFailure ?? 0,
        avgResponseTime: aiApiAvgTime ?? 0,
      },
      database: {
        connections: dbConnections ?? 0,
        avgQueryTime: dbAvgQueryTime ?? 0,
        slowQueries: dbSlowQueries ?? 0,
      },
      redis: {
        connections: redisConnections ?? 0,
        avgResponseTime: redisAvgTime ?? 0,
        memoryUsage: redisMemory ?? 0,
        healthy: redisHealthy ?? 1,
      },
      reviews: {
        total: reviewsTotal ?? 0,
        completed: reviewsCompleted ?? 0,
        failed: reviewsFailed ?? 0,
        pending: reviewsPending ?? 0,
        avgIssuesPerReview: avgIssuesPerReview ?? 0,
      },
      issues: {
        critical: criticalIssues ?? 0,
        major: majorIssues ?? 0,
        minor: minorIssues ?? 0,
        suggestions: suggestions ?? 0,
      },
    };

    this.dashboardLogger.debug('系统指标收集完成', { result });
    return result;
  }

  /**
   * 聚合指标数据
   */
  private aggregateMetrics(
    metrics: Array<{ timestamp: number; value: number; labels?: Record<string, string> }>,
    interval: number,
    aggregation: 'avg' | 'sum' | 'max' | 'min' | 'count'
  ): TimeSeriesDataPoint[] {
    if (metrics.length === 0) return [];

    // 按时间间隔分组
    const groups = new Map<number, number[]>();
    
    metrics.forEach(metric => {
      const bucketTime = Math.floor(metric.timestamp / interval) * interval;
      if (!groups.has(bucketTime)) {
        groups.set(bucketTime, []);
      }
      groups.get(bucketTime)!.push(metric.value);
    });

    // 聚合每个时间桶的数据
    const dataPoints: TimeSeriesDataPoint[] = [];
    
    for (const [timestamp, values] of groups) {
      let aggregatedValue: number;
      
      switch (aggregation) {
        case 'avg':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
          break;
        case 'sum':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        default:
          aggregatedValue = values[0];
      }

      dataPoints.push({
        timestamp,
        value: aggregatedValue,
      });
    }

    return dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 计算平均值
   */
  private calculateAverage(dataPoints: TimeSeriesDataPoint[]): number {
    if (dataPoints.length === 0) return 0;
    
    const sum = dataPoints.reduce((total, point) => total + point.value, 0);
    return sum / dataPoints.length;
  }

  /**
   * 计算吞吐量
   */
  private calculateThroughput(timeRange: number): number {
    const totalRequests = monitoring.getLatestMetricValue('total_requests') || 0;
    const timeRangeInSeconds = timeRange / 1000;
    return totalRequests / timeRangeInSeconds;
  }

  /**
   * 获取错误排行
   */
  private async getTopErrors(): Promise<Array<{
    error: string;
    count: number;
    percentage: number;
  }>> {
    // 这里需要从日志或错误记录中统计
    // 简化实现，返回模拟数据
    const totalErrors = monitoring.getLatestMetricValue('total_errors') || 0;
    
    if (totalErrors === 0) return [];

    return [
      { error: 'AI API超时', count: Math.floor(totalErrors * 0.4), percentage: 40 },
      { error: '数据库连接失败', count: Math.floor(totalErrors * 0.3), percentage: 30 },
      { error: 'Git仓库访问失败', count: Math.floor(totalErrors * 0.2), percentage: 20 },
      { error: '其他错误', count: Math.floor(totalErrors * 0.1), percentage: 10 },
    ];
  }

  /**
   * 检查数据库健康状态
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // 这里应该调用数据库健康检查
      // 简化实现
      return true;
    } catch (error) {
      this.dashboardLogger.error('数据库健康检查失败', { error });
      return false;
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
      this.dashboardLogger.error('Redis健康检查失败', { error });
      return false;
    }
  }

  /**
   * 检查监控系统健康状态
   */
  private async checkMonitoringHealth(): Promise<boolean> {
    try {
      const stats = await monitoring.getStats();
      return stats.healthStatus !== 'critical';
    } catch (error) {
      this.dashboardLogger.error('监控系统健康检查失败', { error });
      return false;
    }
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.metricsCache.clear();
    this.dashboardLogger.debug('仪表板缓存已清理');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
  } {
    return {
      size: this.metricsCache.size,
      hitRate: 0, // 简化实现
    };
  }
}

// 导出单例实例
export const monitoringDashboard = new MonitoringDashboardService();