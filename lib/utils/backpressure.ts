import { EventEmitter } from 'events';
import { logger } from './logger';

/**
 * 背压控制配置
 */
export interface BackpressureConfig {
  /** 高水位线（队列长度） */
  highWaterMark: number;
  /** 低水位线（队列长度） */
  lowWaterMark: number;
  /** 最大队列长度 */
  maxQueueSize: number;
  /** 背压检查间隔（毫秒） */
  checkInterval: number;
  /** 恢复延迟（毫秒） */
  recoveryDelay: number;
  /** 丢弃策略 */
  dropStrategy: 'oldest' | 'newest' | 'random';
  /** 优先级函数 */
  priorityFn?: (item: any) => number;
}

/**
 * 背压状态
 */
export type BackpressureState = 'normal' | 'warning' | 'critical' | 'overload';

/**
 * 背压统计信息
 */
export interface BackpressureStats {
  /** 当前状态 */
  state: BackpressureState;
  /** 当前队列长度 */
  queueLength: number;
  /** 处理速率（项/秒） */
  processingRate: number;
  /** 丢弃的项目数 */
  droppedItems: number;
  /** 总处理项目数 */
  totalProcessed: number;
  /** 平均处理时间（毫秒） */
  averageProcessingTime: number;
  /** 背压触发次数 */
  backpressureEvents: number;
}

/**
 * 队列项目接口
 */
interface QueueItem<T> {
  /** 项目数据 */
  data: T;
  /** 优先级 */
  priority: number;
  /** 创建时间 */
  timestamp: number;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
}

/**
 * 背压控制器
 * 
 * 实现功能：
 * - 队列长度监控
 * - 自适应背压控制
 * - 优先级队列
 * - 丢弃策略
 * - 流量整形
 * - 统计监控
 */
export class BackpressureController<T> extends EventEmitter {
  private config: BackpressureConfig;
  private queue: QueueItem<T>[] = [];
  private state: BackpressureState = 'normal';
  private isProcessing = false;
  private checkTimer?: NodeJS.Timeout;
  private controllerLogger: typeof logger;
  
  // 统计信息
  private stats = {
    droppedItems: 0,
    totalProcessed: 0,
    processingTimes: [] as number[],
    backpressureEvents: 0,
    lastProcessedTime: 0,
    processedInLastSecond: 0,
  };

  constructor(name: string, config: BackpressureConfig) {
    super();
    this.config = config;
    this.controllerLogger = logger.child({ 
      service: 'BackpressureController',
      controller: name 
    });

    // 启动背压检查
    this.startBackpressureCheck();
  }

  /**
   * 添加项目到队列
   * 
   * @param data - 项目数据
   * @param priority - 优先级（可选）
   * @param maxRetries - 最大重试次数（可选）
   * @returns 是否成功添加
   */
  async enqueue(data: T, priority?: number, maxRetries = 3): Promise<boolean> {
    const now = Date.now();
    
    // 检查队列是否已满
    if (this.queue.length >= this.config.maxQueueSize) {
      // 根据丢弃策略处理
      const dropped = this.dropItems(1);
      
      if (dropped === 0) {
        this.controllerLogger.warn('队列已满，无法添加新项目', {
          queueLength: this.queue.length,
          maxQueueSize: this.config.maxQueueSize,
        });
        return false;
      }
    }

    // 计算优先级
    const itemPriority = priority ?? (this.config.priorityFn ? this.config.priorityFn(data) : 0);

    // 创建队列项目
    const item: QueueItem<T> = {
      data,
      priority: itemPriority,
      timestamp: now,
      retryCount: 0,
      maxRetries,
    };

    // 插入到正确位置（按优先级排序）
    this.insertByPriority(item);

    this.controllerLogger.debug('项目已加入队列', {
      queueLength: this.queue.length,
      priority: itemPriority,
      state: this.state,
    });

    this.emit('enqueued', data, itemPriority);
    
    return true;
  }

  /**
   * 从队列中获取项目
   * 
   * @returns 队列项目或null
   */
  async dequeue(): Promise<T | null> {
    if (this.queue.length === 0) {
      return null;
    }

    // 获取最高优先级的项目
    const item = this.queue.shift()!;
    
    this.controllerLogger.debug('项目已出队', {
      queueLength: this.queue.length,
      priority: item.priority,
      waitTime: Date.now() - item.timestamp,
    });

    this.emit('dequeued', item.data, item.priority);
    
    return item.data;
  }

  /**
   * 处理队列项目
   * 
   * @param processor - 处理函数
   * @param concurrency - 并发数（可选）
   */
  async process(
    processor: (data: T) => Promise<void>,
    concurrency = 1
  ): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const workers: Promise<void>[] = [];
      
      for (let i = 0; i < concurrency; i++) {
        workers.push(this.processWorker(processor));
      }
      
      await Promise.all(workers);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取背压统计信息
   */
  getStats(): BackpressureStats {
    const now = Date.now();
    
    // 计算处理速率
    let processingRate = 0;
    if (now - this.stats.lastProcessedTime < 1000) {
      processingRate = this.stats.processedInLastSecond;
    } else {
      this.stats.processedInLastSecond = 0;
      this.stats.lastProcessedTime = now;
    }

    // 计算平均处理时间
    const averageProcessingTime = this.stats.processingTimes.length > 0
      ? this.stats.processingTimes.reduce((sum, time) => sum + time, 0) / this.stats.processingTimes.length
      : 0;

    return {
      state: this.state,
      queueLength: this.queue.length,
      processingRate,
      droppedItems: this.stats.droppedItems,
      totalProcessed: this.stats.totalProcessed,
      averageProcessingTime,
      backpressureEvents: this.stats.backpressureEvents,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): BackpressureState {
    return this.state;
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear(): void {
    const droppedCount = this.queue.length;
    this.queue = [];
    this.stats.droppedItems += droppedCount;
    
    this.controllerLogger.info('队列已清空', { droppedCount });
    this.emit('cleared', droppedCount);
  }

  /**
   * 停止背压控制器
   */
  stop(): void {
    this.stopBackpressureCheck();
    this.clear();
    
    this.controllerLogger.info('背压控制器已停止');
    this.emit('stopped');
  }

  /**
   * 处理工作器
   */
  private async processWorker(processor: (data: T) => Promise<void>): Promise<void> {
    while (this.isProcessing && this.queue.length > 0) {
      // 检查背压状态
      if (this.state === 'overload') {
        // 过载状态，暂停处理
        await new Promise(resolve => setTimeout(resolve, this.config.recoveryDelay));
        continue;
      }

      const data = await this.dequeue();
      if (!data) {
        break;
      }

      const startTime = Date.now();
      
      try {
        await processor(data);
        
        // 记录成功处理
        const processingTime = Date.now() - startTime;
        this.recordProcessingTime(processingTime);
        this.stats.totalProcessed++;
        this.stats.processedInLastSecond++;
        
        this.emit('processed', data, processingTime);
        
      } catch (error) {
        this.controllerLogger.error('处理项目失败', {
          error: error instanceof Error ? error.message : String(error),
          processingTime: Date.now() - startTime,
        });
        
        this.emit('processingError', data, error);
        
        // 可以在这里实现重试逻辑
        // 暂时跳过重试，直接丢弃
      }
    }
  }

  /**
   * 按优先级插入项目
   */
  private insertByPriority(item: QueueItem<T>): void {
    let insertIndex = this.queue.length;
    
    // 找到正确的插入位置（优先级高的在前面）
    for (let i = 0; i < this.queue.length; i++) {
      if (item.priority > this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * 丢弃项目
   * 
   * @param count - 要丢弃的项目数
   * @returns 实际丢弃的项目数
   */
  private dropItems(count: number): number {
    if (this.queue.length === 0) {
      return 0;
    }

    let dropped = 0;
    
    for (let i = 0; i < count && this.queue.length > 0; i++) {
      let dropIndex: number;
      
      switch (this.config.dropStrategy) {
        case 'oldest':
          // 丢弃最旧的项目（队列末尾，因为新项目插入到前面）
          dropIndex = this.queue.length - 1;
          break;
          
        case 'newest':
          // 丢弃最新的项目（队列开头）
          dropIndex = 0;
          break;
          
        case 'random':
          // 随机丢弃
          dropIndex = Math.floor(Math.random() * this.queue.length);
          break;
          
        default:
          dropIndex = this.queue.length - 1;
      }
      
      const droppedItem = this.queue.splice(dropIndex, 1)[0];
      dropped++;
      
      this.controllerLogger.debug('丢弃队列项目', {
        strategy: this.config.dropStrategy,
        priority: droppedItem.priority,
        age: Date.now() - droppedItem.timestamp,
      });
      
      this.emit('dropped', droppedItem.data, droppedItem.priority);
    }
    
    this.stats.droppedItems += dropped;
    return dropped;
  }

  /**
   * 启动背压检查
   */
  private startBackpressureCheck(): void {
    this.checkTimer = setInterval(() => {
      this.checkBackpressure();
    }, this.config.checkInterval);
  }

  /**
   * 停止背压检查
   */
  private stopBackpressureCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * 检查背压状态
   */
  private checkBackpressure(): void {
    const queueLength = this.queue.length;
    const previousState = this.state;
    
    // 确定新状态
    let newState: BackpressureState;
    
    if (queueLength >= this.config.maxQueueSize * 0.9) {
      newState = 'overload';
    } else if (queueLength >= this.config.highWaterMark) {
      newState = 'critical';
    } else if (queueLength >= this.config.lowWaterMark) {
      newState = 'warning';
    } else {
      newState = 'normal';
    }
    
    // 状态变化处理
    if (newState !== previousState) {
      this.state = newState;
      
      this.controllerLogger.info('背压状态变化', {
        previousState,
        newState,
        queueLength,
        highWaterMark: this.config.highWaterMark,
        lowWaterMark: this.config.lowWaterMark,
      });
      
      if (newState !== 'normal') {
        this.stats.backpressureEvents++;
      }
      
      this.emit('stateChanged', newState, previousState, queueLength);
      
      // 根据状态执行相应动作
      this.handleStateChange(newState, previousState);
    }
  }

  /**
   * 处理状态变化
   */
  private handleStateChange(newState: BackpressureState, previousState: BackpressureState): void {
    switch (newState) {
      case 'warning':
        // 警告状态：开始限制新请求
        this.emit('backpressureWarning', this.queue.length);
        break;
        
      case 'critical':
        // 临界状态：更严格的限制
        this.emit('backpressureCritical', this.queue.length);
        
        // 可以考虑丢弃一些低优先级的项目
        if (this.queue.length > this.config.highWaterMark * 1.2) {
          const toDrop = Math.ceil(this.queue.length * 0.1); // 丢弃10%
          this.dropLowPriorityItems(toDrop);
        }
        break;
        
      case 'overload':
        // 过载状态：停止接受新请求，大量丢弃
        this.emit('backpressureOverload', this.queue.length);
        
        const toDrop = Math.ceil(this.queue.length * 0.3); // 丢弃30%
        this.dropLowPriorityItems(toDrop);
        break;
        
      case 'normal':
        // 恢复正常状态
        if (previousState !== 'normal') {
          this.emit('backpressureRecovered', this.queue.length);
        }
        break;
    }
  }

  /**
   * 丢弃低优先级项目
   */
  private dropLowPriorityItems(count: number): void {
    if (this.queue.length === 0) {
      return;
    }

    // 按优先级排序（低优先级在前）
    const sortedIndices = this.queue
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.priority - b.item.priority)
      .slice(0, count)
      .map(({ index }) => index)
      .sort((a, b) => b - a); // 从后往前删除，避免索引变化

    let dropped = 0;
    for (const index of sortedIndices) {
      if (index < this.queue.length) {
        const droppedItem = this.queue.splice(index, 1)[0];
        dropped++;
        
        this.controllerLogger.debug('丢弃低优先级项目', {
          priority: droppedItem.priority,
          age: Date.now() - droppedItem.timestamp,
        });
        
        this.emit('dropped', droppedItem.data, droppedItem.priority);
      }
    }
    
    this.stats.droppedItems += dropped;
    
    this.controllerLogger.info('丢弃低优先级项目', {
      droppedCount: dropped,
      remainingCount: this.queue.length,
    });
  }

  /**
   * 记录处理时间
   */
  private recordProcessingTime(time: number): void {
    this.stats.processingTimes.push(time);
    
    // 保留最近100次记录
    if (this.stats.processingTimes.length > 100) {
      this.stats.processingTimes.shift();
    }
  }
}

/**
 * 创建AI审查背压控制器
 */
export function createAIReviewBackpressureController(): BackpressureController<any> {
  const config: BackpressureConfig = {
    highWaterMark: parseInt(process.env.AI_BACKPRESSURE_HIGH_WATER || '50'),
    lowWaterMark: parseInt(process.env.AI_BACKPRESSURE_LOW_WATER || '20'),
    maxQueueSize: parseInt(process.env.AI_BACKPRESSURE_MAX_QUEUE || '100'),
    checkInterval: parseInt(process.env.AI_BACKPRESSURE_CHECK_INTERVAL || '5000'),
    recoveryDelay: parseInt(process.env.AI_BACKPRESSURE_RECOVERY_DELAY || '10000'),
    dropStrategy: (process.env.AI_BACKPRESSURE_DROP_STRATEGY as any) || 'oldest',
    priorityFn: (item: any) => {
      // 根据提交消息确定优先级
      if (item.commitMessage?.toLowerCase().includes('critical')) return 100;
      if (item.commitMessage?.toLowerCase().includes('security')) return 90;
      if (item.commitMessage?.toLowerCase().includes('bug')) return 80;
      if (item.commitMessage?.toLowerCase().includes('feature')) return 50;
      return 30;
    },
  };

  return new BackpressureController('ai-review', config);
}

/**
 * 创建Webhook背压控制器
 */
export function createWebhookBackpressureController(): BackpressureController<any> {
  const config: BackpressureConfig = {
    highWaterMark: parseInt(process.env.WEBHOOK_BACKPRESSURE_HIGH_WATER || '100'),
    lowWaterMark: parseInt(process.env.WEBHOOK_BACKPRESSURE_LOW_WATER || '50'),
    maxQueueSize: parseInt(process.env.WEBHOOK_BACKPRESSURE_MAX_QUEUE || '200'),
    checkInterval: parseInt(process.env.WEBHOOK_BACKPRESSURE_CHECK_INTERVAL || '2000'),
    recoveryDelay: parseInt(process.env.WEBHOOK_BACKPRESSURE_RECOVERY_DELAY || '5000'),
    dropStrategy: (process.env.WEBHOOK_BACKPRESSURE_DROP_STRATEGY as any) || 'newest',
    priorityFn: (item: any) => {
      // Webhook请求优先级相对简单
      return item.priority || 50;
    },
  };

  return new BackpressureController('webhook', config);
}