import Redis from 'ioredis';
import { logger } from '@/lib/utils/logger';

/**
 * Redis 连接配置
 */
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  lazyConnect: boolean;
  maxRetriesPerRequest: number;
  retryStrategy?: (times: number) => number | void | null;
}

/**
 * 获取 Redis 配置
 * @returns RedisConfig Redis配置对象
 */
function getRedisConfig(): RedisConfig {
  // 确保加载环境变量文件
  if (!process.env.REDIS_HOST) {
    require('dotenv').config();
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  };
}

/**
 * Redis 客户端管理类
 */
class RedisClient {
  private static instance: Redis | null = null;
  private static connecting: Promise<Redis> | null = null;
  private static config: RedisConfig;

  /**
   * 获取 Redis 客户端实例（单例模式）
   */
  static async getInstance(): Promise<Redis> {
    if (this.instance && this.instance.status === 'ready') {
      return this.instance;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.createConnection();
    this.instance = await this.connecting;
    this.connecting = null;

    return this.instance;
  }

  /**
   * 创建 Redis 连接
   */
  private static async createConnection(): Promise<Redis> {
    this.config = getRedisConfig();
    
    const client = new Redis(this.config);

    // 连接事件监听
    client.on('connect', () => {
      logger.info('Redis 客户端正在连接', { 
        host: this.config.host, 
        port: this.config.port,
        db: this.config.db 
      });
    });

    client.on('ready', () => {
      logger.info('Redis 客户端连接就绪', { 
        host: this.config.host, 
        port: this.config.port,
        db: this.config.db 
      });
    });

    client.on('error', (error) => {
      logger.error('Redis 客户端错误', { 
        error: error.message, 
        stack: error.stack,
        host: this.config.host,
        port: this.config.port 
      });
    });

    client.on('close', () => {
      logger.warn('Redis 客户端连接关闭');
    });

    client.on('reconnecting', (delay: number) => {
      logger.info('Redis 客户端正在重连', { 
        delay: `${delay}ms`,
        host: this.config.host,
        port: this.config.port 
      });
    });

    client.on('end', () => {
      logger.info('Redis 客户端连接结束');
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis 连接超时 (${this.config.connectTimeout}ms)`));
      }, this.config.connectTimeout);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return client;
  }

  /**
   * 关闭 Redis 连接
   */
  static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
      logger.info('Redis 客户端连接已关闭');
    }
  }

  /**
   * 健康检查
   * @returns 健康状态，true 表示健康，false 表示不健康
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getInstance();
      const result = await client.ping();
      const isHealthy = result === 'PONG';
      
      if (isHealthy) {
        logger.debug('Redis 健康检查通过');
      } else {
        logger.warn('Redis 健康检查失败：PING 响应异常', { response: result });
      }
      
      return isHealthy;
    } catch (error) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      logger.error('Redis 健康检查失败', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // 在开发环境中，Redis 连接失败不应该阻止应用启动
      if (isDevelopment) {
        logger.warn('开发环境中 Redis 连接失败，但继续运行');
      }
      
      return false;
    }
  }

  /**
   * 获取连接状态
   */
  static getStatus(): {
    connected: boolean;
    status: string;
    host?: string;
    port?: number;
    db?: number;
  } {
    if (!this.instance) {
      return {
        connected: false,
        status: 'not_initialized',
      };
    }

    return {
      connected: this.instance.status === 'ready',
      status: this.instance.status,
      host: this.config?.host,
      port: this.config?.port,
      db: this.config?.db,
    };
  }

  /**
   * 强制重连
   */
  static async reconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.disconnect();
      this.instance = null;
    }
    
    await this.getInstance();
    logger.info('Redis 客户端重连完成');
  }

  /**
   * 执行 Redis 命令（带错误处理和日志）
   */
  static async executeCommand<T = any>(
    command: string,
    ...args: any[]
  ): Promise<T> {
    try {
      const client = await this.getInstance();
      const startTime = Date.now();
      
      const result = await (client as any)[command](...args);
      const duration = Date.now() - startTime;
      
      if (duration > 100) {
        logger.warn('Redis 慢查询', {
          command,
          args: args.length > 0 ? `${args.length} 个参数` : '无参数',
          duration: `${duration}ms`,
        });
      } else {
        logger.debug('Redis 命令执行', {
          command,
          args: args.length > 0 ? `${args.length} 个参数` : '无参数',
          duration: `${duration}ms`,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Redis 命令执行失败', {
        command,
        args: args.length > 0 ? `${args.length} 个参数` : '无参数',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 批量执行命令（管道）
   */
  static async pipeline(commands: Array<[string, ...any[]]>): Promise<any[]> {
    try {
      const client = await this.getInstance();
      const pipeline = client.pipeline();
      
      commands.forEach(([command, ...args]) => {
        (pipeline as any)[command](...args);
      });
      
      const startTime = Date.now();
      const results = await pipeline.exec();
      const duration = Date.now() - startTime;
      
      logger.debug('Redis 管道执行完成', {
        commandCount: commands.length,
        duration: `${duration}ms`,
      });
      
      const errors = results?.filter(([error]) => error !== null);
      if (errors && errors.length > 0) {
        logger.error('Redis 管道执行部分失败', {
          errorCount: errors.length,
          totalCount: commands.length,
          errors: errors.map(([error]) => error?.message),
        });
      }
      
      return results?.map(([error, result]) => {
        if (error) throw error;
        return result;
      }) || [];
    } catch (error) {
      logger.error('Redis 管道执行失败', {
        commandCount: commands.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 事务执行
   */
  static async transaction(commands: Array<[string, ...any[]]>): Promise<any[]> {
    try {
      const client = await this.getInstance();
      const multi = client.multi();
      
      commands.forEach(([command, ...args]) => {
        (multi as any)[command](...args);
      });
      
      const startTime = Date.now();
      const results = await multi.exec();
      const duration = Date.now() - startTime;
      
      logger.debug('Redis 事务执行完成', {
        commandCount: commands.length,
        duration: `${duration}ms`,
      });
      
      return results?.map(([error, result]) => {
        if (error) throw error;
        return result;
      }) || [];
    } catch (error) {
      logger.error('Redis 事务执行失败', {
        commandCount: commands.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// 导出单例访问方法
export default RedisClient;

// 导出类型
export type { RedisConfig };
export { RedisClient };