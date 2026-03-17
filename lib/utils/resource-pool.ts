import { EventEmitter } from 'events';
import { logger } from './logger';

/**
 * 资源池配置
 */
export interface ResourcePoolConfig<T> {
  /** 最小资源数 */
  minSize: number;
  /** 最大资源数 */
  maxSize: number;
  /** 资源创建函数 */
  createResource: () => Promise<T>;
  /** 资源销毁函数 */
  destroyResource: (resource: T) => Promise<void>;
  /** 资源验证函数 */
  validateResource?: (resource: T) => Promise<boolean>;
  /** 资源重置函数 */
  resetResource?: (resource: T) => Promise<void>;
  /** 获取资源超时时间（毫秒） */
  acquireTimeout: number;
  /** 资源空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 资源最大生存时间（毫秒） */
  maxLifetime?: number;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval: number;
}

/**
 * 资源包装器
 */
interface ResourceWrapper<T> {
  /** 资源实例 */
  resource: T;
  /** 创建时间 */
  createdAt: number;
  /** 最后使用时间 */
  lastUsedAt: number;
  /** 使用次数 */
  usageCount: number;
  /** 是否正在使用 */
  inUse: boolean;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * 资源池统计信息
 */
export interface ResourcePoolStats {
  /** 总资源数 */
  totalResources: number;
  /** 可用资源数 */
  availableResources: number;
  /** 使用中资源数 */
  inUseResources: number;
  /** 等待队列长度 */
  waitingCount: number;
  /** 创建的资源总数 */
  totalCreated: number;
  /** 销毁的资源总数 */
  totalDestroyed: number;
  /** 平均获取时间（毫秒） */
  averageAcquireTime: number;
  /** 平均使用时间（毫秒） */
  averageUsageTime: number;
}

/**
 * 资源池实现类
 * 
 * 支持功能：
 * - 动态资源管理
 * - 资源生命周期控制
 * - 健康检查和自动恢复
 * - 统计监控
 * - 优雅关闭
 */
export class ResourcePool<T> extends EventEmitter {
  private config: ResourcePoolConfig<T>;
  private resources: ResourceWrapper<T>[] = [];
  private waitingQueue: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private isShuttingDown = false;
  private healthCheckTimer?: NodeJS.Timeout;
  private poolLogger: typeof logger;
  
  // 统计信息
  private stats = {
    totalCreated: 0,
    totalDestroyed: 0,
    acquireTimes: [] as number[],
    usageTimes: [] as number[],
  };

  constructor(name: string, config: ResourcePoolConfig<T>) {
    super();
    this.config = config;
    this.poolLogger = logger.child({ 
      service: 'ResourcePool',
      pool: name 
    });

    // 启动健康检查
    this.startHealthCheck();
    
    // 初始化最小资源数
    this.initializePool().catch(error => {
      this.poolLogger.error('资源池初始化失败', { error });
    });
  }

  /**
   * 获取资源
   * 
   * @returns 资源实例
   */
  async acquire(): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('资源池正在关闭');
    }

    const startTime = Date.now();

    try {
      // 尝试获取可用资源
      const resource = await this.tryAcquireResource();
      
      if (resource) {
        const acquireTime = Date.now() - startTime;
        this.recordAcquireTime(acquireTime);
        
        this.poolLogger.debug('获取资源成功', {
          acquireTime,
          availableResources: this.getAvailableCount(),
        });
        
        return resource;
      }

      // 没有可用资源，加入等待队列
      return await this.waitForResource(startTime);

    } catch (error) {
      this.poolLogger.error('获取资源失败', {
        error: error instanceof Error ? error.message : String(error),
        acquireTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 释放资源
   * 
   * @param resource - 要释放的资源
   */
  async release(resource: T): Promise<void> {
    try {
      const wrapper = this.findResourceWrapper(resource);
      
      if (!wrapper) {
        this.poolLogger.warn('尝试释放未知资源');
        return;
      }

      if (!wrapper.inUse) {
        this.poolLogger.warn('尝试释放未使用的资源');
        return;
      }

      // 记录使用时间
      const usageTime = Date.now() - wrapper.lastUsedAt;
      this.recordUsageTime(usageTime);

      // 重置资源状态
      wrapper.inUse = false;
      wrapper.usageCount++;

      // 尝试重置资源
      if (this.config.resetResource) {
        try {
          await this.config.resetResource(resource);
        } catch (error) {
          this.poolLogger.warn('资源重置失败，标记为无效', {
            error: error instanceof Error ? error.message : String(error),
          });
          wrapper.isValid = false;
        }
      }

      // 检查资源是否需要销毁
      if (this.shouldDestroyResource(wrapper)) {
        await this.destroyResourceWrapper(wrapper);
      } else {
        // 尝试满足等待队列
        this.processWaitingQueue();
      }

      this.poolLogger.debug('释放资源', {
        usageTime,
        usageCount: wrapper.usageCount,
        availableResources: this.getAvailableCount(),
      });

    } catch (error) {
      this.poolLogger.error('释放资源失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 获取资源池统计信息
   */
  getStats(): ResourcePoolStats {
    const availableCount = this.getAvailableCount();
    const inUseCount = this.getInUseCount();
    
    const averageAcquireTime = this.stats.acquireTimes.length > 0
      ? this.stats.acquireTimes.reduce((sum, time) => sum + time, 0) / this.stats.acquireTimes.length
      : 0;
      
    const averageUsageTime = this.stats.usageTimes.length > 0
      ? this.stats.usageTimes.reduce((sum, time) => sum + time, 0) / this.stats.usageTimes.length
      : 0;

    return {
      totalResources: this.resources.length,
      availableResources: availableCount,
      inUseResources: inUseCount,
      waitingCount: this.waitingQueue.length,
      totalCreated: this.stats.totalCreated,
      totalDestroyed: this.stats.totalDestroyed,
      averageAcquireTime,
      averageUsageTime,
    };
  }

  /**
   * 关闭资源池
   */
  async shutdown(): Promise<void> {
    this.poolLogger.info('开始关闭资源池');
    
    this.isShuttingDown = true;
    
    // 停止健康检查
    this.stopHealthCheck();
    
    // 拒绝所有等待中的请求
    while (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      waiter.reject(new Error('资源池正在关闭'));
    }
    
    // 等待所有资源释放或超时
    const timeout = 30000; // 30秒超时
    const startTime = Date.now();
    
    while (this.getInUseCount() > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 销毁所有资源
    const destroyPromises = this.resources.map(wrapper => 
      this.destroyResourceWrapper(wrapper)
    );
    
    await Promise.allSettled(destroyPromises);
    
    this.resources = [];
    
    this.poolLogger.info('资源池已关闭', {
      totalDestroyed: this.stats.totalDestroyed,
    });
  }

  /**
   * 初始化资源池
   */
  private async initializePool(): Promise<void> {
    const createPromises: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.minSize; i++) {
      createPromises.push(this.createNewResource());
    }
    
    await Promise.allSettled(createPromises);
    
    this.poolLogger.info('资源池初始化完成', {
      minSize: this.config.minSize,
      actualSize: this.resources.length,
    });
  }

  /**
   * 尝试获取可用资源
   */
  private async tryAcquireResource(): Promise<T | null> {
    // 查找可用资源
    const availableWrapper = this.resources.find(wrapper => 
      !wrapper.inUse && wrapper.isValid
    );
    
    if (availableWrapper) {
      // 验证资源
      if (this.config.validateResource) {
        try {
          const isValid = await this.config.validateResource(availableWrapper.resource);
          if (!isValid) {
            availableWrapper.isValid = false;
            await this.destroyResourceWrapper(availableWrapper);
            return this.tryAcquireResource(); // 递归尝试
          }
        } catch (error) {
          this.poolLogger.warn('资源验证失败', { error });
          availableWrapper.isValid = false;
          await this.destroyResourceWrapper(availableWrapper);
          return this.tryAcquireResource(); // 递归尝试
        }
      }
      
      // 标记为使用中
      availableWrapper.inUse = true;
      availableWrapper.lastUsedAt = Date.now();
      
      return availableWrapper.resource;
    }
    
    // 没有可用资源，尝试创建新资源
    if (this.resources.length < this.config.maxSize) {
      try {
        const newWrapper = await this.createNewResource();
        newWrapper.inUse = true;
        newWrapper.lastUsedAt = Date.now();
        
        return newWrapper.resource;
      } catch (error) {
        this.poolLogger.error('创建新资源失败', { error });
      }
    }
    
    return null;
  }

  /**
   * 等待资源可用
   */
  private async waitForResource(startTime: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 从等待队列中移除
        const index = this.waitingQueue.findIndex(waiter => waiter.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        
        reject(new Error(`获取资源超时 (${this.config.acquireTimeout}ms)`));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({
        resolve: (resource: T) => {
          clearTimeout(timeoutId);
          const acquireTime = Date.now() - startTime;
          this.recordAcquireTime(acquireTime);
          resolve(resource);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * 处理等待队列
   */
  private async processWaitingQueue(): Promise<void> {
    while (this.waitingQueue.length > 0) {
      const resource = await this.tryAcquireResource();
      
      if (!resource) {
        break; // 没有可用资源
      }
      
      const waiter = this.waitingQueue.shift()!;
      waiter.resolve(resource);
    }
  }

  /**
   * 创建新资源
   */
  private async createNewResource(): Promise<ResourceWrapper<T>> {
    try {
      const resource = await this.config.createResource();
      
      const wrapper: ResourceWrapper<T> = {
        resource,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        usageCount: 0,
        inUse: false,
        isValid: true,
      };
      
      this.resources.push(wrapper);
      this.stats.totalCreated++;
      
      this.emit('resourceCreated', resource);
      
      this.poolLogger.debug('创建新资源', {
        totalResources: this.resources.length,
        totalCreated: this.stats.totalCreated,
      });
      
      return wrapper;
      
    } catch (error) {
      this.poolLogger.error('创建资源失败', { error });
      throw error;
    }
  }

  /**
   * 销毁资源包装器
   */
  private async destroyResourceWrapper(wrapper: ResourceWrapper<T>): Promise<void> {
    try {
      // 从资源列表中移除
      const index = this.resources.indexOf(wrapper);
      if (index !== -1) {
        this.resources.splice(index, 1);
      }
      
      // 销毁资源
      await this.config.destroyResource(wrapper.resource);
      
      this.stats.totalDestroyed++;
      
      this.emit('resourceDestroyed', wrapper.resource);
      
      this.poolLogger.debug('销毁资源', {
        usageCount: wrapper.usageCount,
        lifetime: Date.now() - wrapper.createdAt,
        totalDestroyed: this.stats.totalDestroyed,
      });
      
    } catch (error) {
      this.poolLogger.error('销毁资源失败', { error });
    }
  }

  /**
   * 判断资源是否需要销毁
   */
  private shouldDestroyResource(wrapper: ResourceWrapper<T>): boolean {
    const now = Date.now();
    
    // 资源无效
    if (!wrapper.isValid) {
      return true;
    }
    
    // 超过最大生存时间
    if (this.config.maxLifetime && now - wrapper.createdAt > this.config.maxLifetime) {
      return true;
    }
    
    // 资源池大小超过最小值且资源空闲时间过长
    if (this.resources.length > this.config.minSize && 
        now - wrapper.lastUsedAt > this.config.idleTimeout) {
      return true;
    }
    
    return false;
  }

  /**
   * 查找资源包装器
   */
  private findResourceWrapper(resource: T): ResourceWrapper<T> | undefined {
    return this.resources.find(wrapper => wrapper.resource === resource);
  }

  /**
   * 获取可用资源数量
   */
  private getAvailableCount(): number {
    return this.resources.filter(wrapper => !wrapper.inUse && wrapper.isValid).length;
  }

  /**
   * 获取使用中资源数量
   */
  private getInUseCount(): number {
    return this.resources.filter(wrapper => wrapper.inUse).length;
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.poolLogger.error('健康检查失败', { error });
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    const toDestroy: ResourceWrapper<T>[] = [];
    
    // 检查需要销毁的资源
    for (const wrapper of this.resources) {
      if (this.shouldDestroyResource(wrapper)) {
        toDestroy.push(wrapper);
      }
    }
    
    // 销毁过期资源
    for (const wrapper of toDestroy) {
      if (!wrapper.inUse) {
        await this.destroyResourceWrapper(wrapper);
      }
    }
    
    // 确保最小资源数
    const currentSize = this.resources.length;
    if (currentSize < this.config.minSize) {
      const needCreate = this.config.minSize - currentSize;
      const createPromises: Promise<void>[] = [];
      
      for (let i = 0; i < needCreate; i++) {
        createPromises.push(
          this.createNewResource().catch(error => {
            this.poolLogger.warn('健康检查中创建资源失败', { error });
          })
        );
      }
      
      await Promise.allSettled(createPromises);
    }
    
    // 清理超时的等待请求
    const timeoutThreshold = now - this.config.acquireTimeout;
    const timedOutWaiters = this.waitingQueue.filter(waiter => 
      waiter.timestamp < timeoutThreshold
    );
    
    for (const waiter of timedOutWaiters) {
      const index = this.waitingQueue.indexOf(waiter);
      if (index !== -1) {
        this.waitingQueue.splice(index, 1);
        waiter.reject(new Error('等待资源超时'));
      }
    }
    
    this.poolLogger.debug('健康检查完成', {
      totalResources: this.resources.length,
      availableResources: this.getAvailableCount(),
      destroyedCount: toDestroy.length,
      timedOutWaiters: timedOutWaiters.length,
    });
  }

  /**
   * 记录获取时间
   */
  private recordAcquireTime(time: number): void {
    this.stats.acquireTimes.push(time);
    
    // 保留最近100次记录
    if (this.stats.acquireTimes.length > 100) {
      this.stats.acquireTimes.shift();
    }
  }

  /**
   * 记录使用时间
   */
  private recordUsageTime(time: number): void {
    this.stats.usageTimes.push(time);
    
    // 保留最近100次记录
    if (this.stats.usageTimes.length > 100) {
      this.stats.usageTimes.shift();
    }
  }
}

/**
 * 资源池装饰器
 * 
 * @param pool - 资源池实例
 */
export function withResourcePool<T, Args extends any[], R>(
  pool: ResourcePool<T>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: Args): Promise<R> {
      const resource = await pool.acquire();
      
      try {
        // 将资源作为第一个参数传递给原始方法
        return await originalMethod.call(this, resource, ...args);
      } finally {
        await pool.release(resource);
      }
    };

    return descriptor;
  };
}