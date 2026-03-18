import RedisClient from '@/lib/cache/redis-client';
import { logger } from './logger';

/**
 * 并发控制配置接口
 */
export interface ConcurrencyConfig {
  /** 最大并发数 */
  maxConcurrency: number;
  /** 获取锁的超时时间（毫秒） */
  acquireTimeout: number;
  /** 锁的过期时间（毫秒） */
  lockExpiration: number;
  /** 等待队列最大长度 */
  maxQueueSize: number;
}

/**
 * 并发控制结果
 */
export interface ConcurrencyResult {
  /** 是否获取到执行权限 */
  acquired: boolean;
  /** 当前并发数 */
  currentConcurrency: number;
  /** 等待队列长度 */
  queueLength: number;
  /** 预估等待时间（毫秒） */
  estimatedWaitTime?: number;
}

/**
 * 并发控制器类
 * 
 * 使用Redis实现分布式并发控制，支持：
 * - 最大并发数限制
 * - 公平队列调度
 * - 超时处理
 * - 资源泄漏防护
 */
export class ConcurrencyController {
  private config: ConcurrencyConfig;
  private keyPrefix: string;
  private controllerLogger: typeof logger;

  constructor(name: string, config: ConcurrencyConfig) {
    this.config = config;
    this.keyPrefix = `concurrency:${name}`;
    this.controllerLogger = logger.child({ 
      service: 'ConcurrencyController',
      controller: name 
    });
  }

  /**
   * 尝试获取执行权限
   * 
   * @param taskId - 任务唯一标识
   * @returns 并发控制结果
   */
  async acquire(taskId: string): Promise<ConcurrencyResult> {
    const redis = await RedisClient.getInstance();
    const now = Date.now();
    
    try {
      // 清理过期的锁
      await this.cleanupExpiredLocks();
      
      // 检查当前并发数
      const currentCount = await redis.scard(`${this.keyPrefix}:active`);
      
      if (currentCount < this.config.maxConcurrency) {
        // 直接获取执行权限
        const acquired = await this.tryAcquireLock(taskId, now);
        
        if (acquired) {
          this.controllerLogger.debug('直接获取执行权限', {
            taskId,
            currentConcurrency: currentCount + 1,
          });
          
          return {
            acquired: true,
            currentConcurrency: currentCount + 1,
            queueLength: 0,
          };
        }
      }
      
      // 加入等待队列
      const queueLength = await this.enqueueWaiting(taskId, now);
      
      if (queueLength > this.config.maxQueueSize) {
        // 队列已满，拒绝请求
        await redis.zrem(`${this.keyPrefix}:queue`, taskId);
        
        this.controllerLogger.warn('等待队列已满，拒绝请求', {
          taskId,
          queueLength,
          maxQueueSize: this.config.maxQueueSize,
        });
        
        return {
          acquired: false,
          currentConcurrency: currentCount,
          queueLength: queueLength - 1,
        };
      }
      
      // 计算预估等待时间
      const estimatedWaitTime = this.calculateEstimatedWaitTime(queueLength);
      
      this.controllerLogger.debug('任务加入等待队列', {
        taskId,
        queuePosition: queueLength,
        estimatedWaitTime,
      });
      
      return {
        acquired: false,
        currentConcurrency: currentCount,
        queueLength,
        estimatedWaitTime,
      };
      
    } catch (error) {
      this.controllerLogger.error('获取执行权限失败', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 释放执行权限
   * 
   * @param taskId - 任务唯一标识
   */
  async release(taskId: string): Promise<void> {
    const redis = await RedisClient.getInstance();
    
    try {
      // 从活跃集合中移除
      const removed = await redis.srem(`${this.keyPrefix}:active`, taskId);
      
      if (removed === 0) {
        this.controllerLogger.warn('释放不存在的锁', { taskId });
        return;
      }
      
      // 删除锁的详细信息
      await redis.del(`${this.keyPrefix}:lock:${taskId}`);
      
      // 尝试从队列中激活下一个任务
      await this.activateNextTask();
      
      this.controllerLogger.debug('释放执行权限', { taskId });
      
    } catch (error) {
      this.controllerLogger.error('释放执行权限失败', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 等待获取执行权限
   * 
   * @param taskId - 任务唯一标识
   * @param timeout - 超时时间（毫秒）
   * @returns 是否成功获取权限
   */
  async waitForAcquisition(taskId: string, timeout?: number): Promise<boolean> {
    const actualTimeout = timeout || this.config.acquireTimeout;
    const startTime = Date.now();
    const pollInterval = Math.min(1000, actualTimeout / 10); // 轮询间隔
    
    this.controllerLogger.debug('开始等待执行权限', {
      taskId,
      timeout: actualTimeout,
    });
    
    while (Date.now() - startTime < actualTimeout) {
      const result = await this.checkAcquisition(taskId);
      
      if (result.acquired) {
        this.controllerLogger.debug('等待获取执行权限成功', {
          taskId,
          waitTime: Date.now() - startTime,
        });
        return true;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    // 超时，从队列中移除
    await this.removeFromQueue(taskId);
    
    this.controllerLogger.warn('等待执行权限超时', {
      taskId,
      timeout: actualTimeout,
    });
    
    return false;
  }

  /**
   * 获取并发控制状态
   */
  async getStatus(): Promise<{
    activeTasks: number;
    queueLength: number;
    maxConcurrency: number;
    activeTasks_list: string[];
  }> {
    const redis = await RedisClient.getInstance();
    
    try {
      const [activeTasks, queueLength, activeTasksList] = await Promise.all([
        redis.scard(`${this.keyPrefix}:active`),
        redis.zcard(`${this.keyPrefix}:queue`),
        redis.smembers(`${this.keyPrefix}:active`),
      ]);
      
      return {
        activeTasks,
        queueLength,
        maxConcurrency: this.config.maxConcurrency,
        activeTasks_list: activeTasksList,
      };
    } catch (error) {
      this.controllerLogger.error('获取并发控制状态失败', { error });
      throw error;
    }
  }

  /**
   * 尝试获取锁
   */
  private async tryAcquireLock(taskId: string, timestamp: number): Promise<boolean> {
    const redis = await RedisClient.getInstance();
    const lockKey = `${this.keyPrefix}:lock:${taskId}`;
    const expireAt = timestamp + this.config.lockExpiration;
    
    // 使用Redis事务确保原子性
    const pipeline = redis.pipeline();
    pipeline.sadd(`${this.keyPrefix}:active`, taskId);
    pipeline.hset(lockKey, 'taskId', taskId);
    pipeline.hset(lockKey, 'acquiredAt', timestamp.toString());
    pipeline.hset(lockKey, 'expireAt', expireAt.toString());
    pipeline.expire(lockKey, Math.ceil(this.config.lockExpiration / 1000));
    
    const results = await pipeline.exec();
    
    // 检查是否成功添加到活跃集合（如果已存在则返回0）
    const added = results?.[0]?.[1] as number;
    return added === 1;
  }

  /**
   * 加入等待队列
   */
  private async enqueueWaiting(taskId: string, timestamp: number): Promise<number> {
    const redis = await RedisClient.getInstance();
    
    // 使用时间戳作为分数，确保FIFO顺序
    await redis.zadd(`${this.keyPrefix}:queue`, timestamp, taskId);
    
    // 返回队列中的位置（从1开始）
    const rank = await redis.zrank(`${this.keyPrefix}:queue`, taskId);
    return (rank ?? -1) + 1;
  }

  /**
   * 检查是否可以获取执行权限
   */
  private async checkAcquisition(taskId: string): Promise<ConcurrencyResult> {
    const redis = await RedisClient.getInstance();
    
    // 检查是否已经在活跃集合中
    const isActive = await redis.sismember(`${this.keyPrefix}:active`, taskId);
    if (isActive) {
      return {
        acquired: true,
        currentConcurrency: await redis.scard(`${this.keyPrefix}:active`),
        queueLength: 0,
      };
    }
    
    // 检查是否可以从队列中激活
    const activated = await this.tryActivateFromQueue(taskId);
    
    return {
      acquired: activated,
      currentConcurrency: await redis.scard(`${this.keyPrefix}:active`),
      queueLength: await redis.zcard(`${this.keyPrefix}:queue`),
    };
  }

  /**
   * 尝试从队列中激活任务
   */
  private async tryActivateFromQueue(taskId: string): Promise<boolean> {
    const redis = await RedisClient.getInstance();
    
    // 检查当前并发数
    const currentCount = await redis.scard(`${this.keyPrefix}:active`);
    if (currentCount >= this.config.maxConcurrency) {
      return false;
    }
    
    // 获取队列中的第一个任务
    const firstTask = await redis.zrange(`${this.keyPrefix}:queue`, 0, 0);
    if (firstTask.length === 0 || firstTask[0] !== taskId) {
      return false; // 不是队列中的第一个任务
    }
    
    // 尝试激活任务
    const now = Date.now();
    const acquired = await this.tryAcquireLock(taskId, now);
    
    if (acquired) {
      // 从队列中移除
      await redis.zrem(`${this.keyPrefix}:queue`, taskId);
      return true;
    }
    
    return false;
  }

  /**
   * 激活队列中的下一个任务
   */
  private async activateNextTask(): Promise<void> {
    const redis = await RedisClient.getInstance();
    
    try {
      // 检查是否还有可用的并发槽位
      const currentCount = await redis.scard(`${this.keyPrefix}:active`);
      if (currentCount >= this.config.maxConcurrency) {
        return;
      }
      
      // 获取队列中的第一个任务
      const nextTasks = await redis.zrange(`${this.keyPrefix}:queue`, 0, 0);
      if (nextTasks.length === 0) {
        return;
      }
      
      const nextTaskId = nextTasks[0];
      const now = Date.now();
      
      // 尝试激活任务
      const acquired = await this.tryAcquireLock(nextTaskId, now);
      
      if (acquired) {
        // 从队列中移除
        await redis.zrem(`${this.keyPrefix}:queue`, nextTaskId);
        
        this.controllerLogger.debug('从队列激活任务', {
          taskId: nextTaskId,
          currentConcurrency: currentCount + 1,
        });
      }
    } catch (error) {
      this.controllerLogger.error('激活下一个任务失败', { error });
    }
  }

  /**
   * 清理过期的锁
   */
  private async cleanupExpiredLocks(): Promise<void> {
    const redis = await RedisClient.getInstance();
    const now = Date.now();
    
    try {
      const activeTasks = await redis.smembers(`${this.keyPrefix}:active`);
      const expiredTasks: string[] = [];
      
      for (const taskId of activeTasks) {
        const lockKey = `${this.keyPrefix}:lock:${taskId}`;
        const lockData = await redis.hmget(lockKey, 'expireAt');
        
        if (!lockData[0]) {
          // 锁信息不存在，认为已过期
          expiredTasks.push(taskId);
          continue;
        }
        
        const expireAt = parseInt(lockData[0]);
        if (now > expireAt) {
          expiredTasks.push(taskId);
        }
      }
      
      // 清理过期的锁
      if (expiredTasks.length > 0) {
        const pipeline = redis.pipeline();
        
        for (const taskId of expiredTasks) {
          pipeline.srem(`${this.keyPrefix}:active`, taskId);
          pipeline.del(`${this.keyPrefix}:lock:${taskId}`);
        }
        
        await pipeline.exec();
        
        this.controllerLogger.warn('清理过期锁', {
          expiredCount: expiredTasks.length,
          expiredTasks,
        });
        
        // 尝试激活等待中的任务
        for (let i = 0; i < expiredTasks.length; i++) {
          await this.activateNextTask();
        }
      }
    } catch (error) {
      this.controllerLogger.error('清理过期锁失败', { error });
    }
  }

  /**
   * 从队列中移除任务
   */
  private async removeFromQueue(taskId: string): Promise<void> {
    const redis = await RedisClient.getInstance();
    await redis.zrem(`${this.keyPrefix}:queue`, taskId);
  }

  /**
   * 计算预估等待时间
   */
  private calculateEstimatedWaitTime(queuePosition: number): number {
    // 简单估算：假设每个任务平均执行5分钟
    const averageTaskDuration = 5 * 60 * 1000; // 5分钟
    const throughput = this.config.maxConcurrency;
    
    return Math.ceil((queuePosition * averageTaskDuration) / throughput);
  }
}

/**
 * 并发控制装饰器
 * 
 * @param controller - 并发控制器
 * @param taskIdGenerator - 任务ID生成器
 */
export function withConcurrencyControl<T extends any[], R>(
  controller: ConcurrencyController,
  taskIdGenerator: (...args: T) => string
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: T): Promise<R> {
      const taskId = taskIdGenerator(...args);
      
      // 尝试获取执行权限
      const result = await controller.acquire(taskId);
      
      if (!result.acquired) {
        // 等待获取权限
        const acquired = await controller.waitForAcquisition(taskId);
        
        if (!acquired) {
          throw new Error(`并发控制超时，任务ID: ${taskId}`);
        }
      }
      
      try {
        // 执行原始方法
        return await originalMethod.apply(this, args);
      } finally {
        // 释放执行权限
        await controller.release(taskId);
      }
    };

    return descriptor;
  };
}

/**
 * 创建AI审查并发控制器
 */
export function createAIReviewConcurrencyController(): ConcurrencyController {
  const config: ConcurrencyConfig = {
    maxConcurrency: parseInt(process.env.AI_MAX_CONCURRENCY || '10'),
    acquireTimeout: parseInt(process.env.AI_ACQUIRE_TIMEOUT || '300000'), // 5分钟
    lockExpiration: parseInt(process.env.AI_LOCK_EXPIRATION || '600000'), // 10分钟
    maxQueueSize: parseInt(process.env.AI_MAX_QUEUE_SIZE || '100'),
  };
  
  return new ConcurrencyController('ai-review', config);
}

/**
 * 创建Webhook处理并发控制器
 */
export function createWebhookConcurrencyController(): ConcurrencyController {
  const config: ConcurrencyConfig = {
    maxConcurrency: parseInt(process.env.WEBHOOK_MAX_CONCURRENCY || '50'),
    acquireTimeout: parseInt(process.env.WEBHOOK_ACQUIRE_TIMEOUT || '30000'), // 30秒
    lockExpiration: parseInt(process.env.WEBHOOK_LOCK_EXPIRATION || '60000'), // 1分钟
    maxQueueSize: parseInt(process.env.WEBHOOK_MAX_QUEUE_SIZE || '200'),
  };
  
  return new ConcurrencyController('webhook', config);
}