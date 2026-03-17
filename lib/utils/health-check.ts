import { db } from '@/lib/db/client';
import RedisClient from '@/lib/cache/redis-client';
import { logger } from './logger';

/**
 * 健康检查结果
 */
interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

/**
 * 系统健康检查结果
 */
interface SystemHealthResult {
  overall: 'healthy' | 'unhealthy';
  timestamp: Date;
  services: HealthCheckResult[];
}

/**
 * 健康检查工具类
 */
export class HealthChecker {
  /**
   * 检查数据库连接
   */
  static async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await db.healthCheck();
      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        return {
          service: 'database',
          status: 'healthy',
          responseTime,
          details: {
            type: 'MySQL',
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || '3306',
            database: process.env.DB_NAME || 'ai_code_review',
          },
        };
      } else {
        return {
          service: 'database',
          status: 'unhealthy',
          responseTime,
          error: '数据库健康检查失败',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查 Redis 连接
   */
  static async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await RedisClient.healthCheck();
      const responseTime = Date.now() - startTime;
      const status = RedisClient.getStatus();
      
      if (isHealthy) {
        return {
          service: 'redis',
          status: 'healthy',
          responseTime,
          details: {
            connected: status.connected,
            status: status.status,
            host: status.host,
            port: status.port,
            db: status.db,
          },
        };
      } else {
        return {
          service: 'redis',
          status: 'unhealthy',
          responseTime,
          error: 'Redis 健康检查失败',
          details: {
            connected: status.connected,
            status: status.status,
          },
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        service: 'redis',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行完整的系统健康检查
   */
  static async checkSystem(): Promise<SystemHealthResult> {
    logger.info('开始系统健康检查');
    
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    
    const services: HealthCheckResult[] = checks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceName = index === 0 ? 'database' : 'redis';
        return {
          service: serviceName,
          status: 'unhealthy',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
    
    const overall = services.every(service => service.status === 'healthy') 
      ? 'healthy' 
      : 'unhealthy';
    
    const result: SystemHealthResult = {
      overall,
      timestamp: new Date(),
      services,
    };
    
    logger.info('系统健康检查完成', {
      overall,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      totalServices: services.length,
    });
    
    return result;
  }

  /**
   * 检查单个服务
   */
  static async checkService(serviceName: string): Promise<HealthCheckResult> {
    switch (serviceName.toLowerCase()) {
      case 'database':
      case 'db':
      case 'mysql':
        return this.checkDatabase();
      
      case 'redis':
      case 'cache':
        return this.checkRedis();
      
      default:
        return {
          service: serviceName,
          status: 'unhealthy',
          error: `未知的服务: ${serviceName}`,
        };
    }
  }

  /**
   * 等待服务就绪
   */
  static async waitForServices(
    services: string[] = ['database', 'redis'],
    maxRetries = 30,
    retryInterval = 1000
  ): Promise<boolean> {
    logger.info('等待服务就绪', { services, maxRetries, retryInterval });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const results = await Promise.all(
        services.map(service => this.checkService(service))
      );
      
      const allHealthy = results.every(result => result.status === 'healthy');
      
      if (allHealthy) {
        logger.info('所有服务已就绪', { attempt, services });
        return true;
      }
      
      const unhealthyServices = results
        .filter(result => result.status === 'unhealthy')
        .map(result => result.service);
      
      logger.warn('部分服务未就绪，等待重试', {
        attempt,
        maxRetries,
        unhealthyServices,
        nextRetryIn: `${retryInterval}ms`,
      });
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    logger.error('服务等待超时', { maxRetries, services });
    return false;
  }
}

// 导出便捷方法
export const {
  checkDatabase,
  checkRedis,
  checkSystem,
  checkService,
  waitForServices,
} = HealthChecker;

// 导出类型
export type { HealthCheckResult, SystemHealthResult };