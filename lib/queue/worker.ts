import { EventEmitter } from 'events';
import { reviewQueue, ReviewQueue } from './review-queue';
import { logger } from '@/lib/utils/logger';
import { ReviewTask } from '@/types/review';
import { CommitInfo } from '@/types/git';

/**
 * Worker 配置
 */
interface WorkerConfig {
  maxConcurrency: number;        // 最大并发数
  pollInterval: number;          // 轮询间隔（毫秒）
  taskTimeout: number;           // 任务超时时间（毫秒）
  gracefulShutdownTimeout: number; // 优雅关闭超时时间（毫秒）
  retryDelay: number;           // 重试延迟（毫秒）
  healthCheckInterval: number;   // 健康检查间隔（毫秒）
}

/**
 * 默认 Worker 配置
 */
const DEFAULT_CONFIG: WorkerConfig = {
  maxConcurrency: 10,
  pollInterval: 1000,
  taskTimeout: 10 * 60 * 1000,  // 10分钟
  gracefulShutdownTimeout: 30 * 1000, // 30秒
  retryDelay: 5000,
  healthCheckInterval: 30 * 1000, // 30秒
};

/**
 * Worker 状态
 */
type WorkerStatus = 'idle' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * 任务处理器函数类型
 */
type TaskProcessor = (task: ReviewTask) => Promise<any>;

/**
 * Worker 统计信息
 */
interface WorkerStats {
  status: WorkerStatus;
  activeTasks: number;
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  averageProcessingTime: number;
  uptime: number;
  lastError?: string;
  lastErrorAt?: Date;
}

/**
 * 活跃任务信息
 */
interface ActiveTask {
  task: ReviewTask;
  startTime: number;
  timeoutId: NodeJS.Timeout;
  promise: Promise<any>;
}

/**
 * Queue Worker 实现类
 * 
 * 负责从队列中获取任务并处理，支持：
 * - 并发控制（最多 10 个并发任务）
 * - 任务超时处理
 * - 错误恢复和重试
 * - 优雅关闭
 * - 健康检查和监控
 * - 事件通知
 */
export class QueueWorker extends EventEmitter {
  private config: WorkerConfig;
  private status: WorkerStatus = 'idle';
  private queue: ReviewQueue;
  private taskProcessor: TaskProcessor;
  private workerLogger: typeof logger;

  // 运行时状态
  private pollTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private activeTasks = new Map<string, ActiveTask>();
  private shutdownPromise?: Promise<void>;
  private shutdownResolver?: () => void;

  // 统计信息
  private stats = {
    totalProcessed: 0,
    totalSucceeded: 0,
    totalFailed: 0,
    processingTimes: [] as number[],
    startTime: 0,
    lastError: undefined as string | undefined,
    lastErrorAt: undefined as Date | undefined,
  };

  constructor(
    taskProcessor: TaskProcessor,
    queue: ReviewQueue = reviewQueue,
    config: Partial<WorkerConfig> = {}
  ) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = queue;
    this.taskProcessor = taskProcessor;
    this.workerLogger = logger.child({ service: 'QueueWorker' });

    // 设置进程信号处理
    this.setupSignalHandlers();
  }

  /**
   * 提取错误信息的工具方法
   */
  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.status !== 'idle' && this.status !== 'stopped') {
      throw new Error(`Worker 已在运行，当前状态: ${this.status}`);
    }

    this.workerLogger.info('启动 Queue Worker', {
      maxConcurrency: this.config.maxConcurrency,
      pollInterval: this.config.pollInterval,
      taskTimeout: this.config.taskTimeout,
    });

    this.status = 'running';
    this.stats.startTime = Date.now();
    this.emit('started');

    // 启动轮询
    this.startPolling();
    
    // 启动健康检查
    this.startHealthCheck();

    this.workerLogger.info('Queue Worker 启动完成');
  }

  /**
   * 停止 Worker（优雅关闭）
   */
  async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return this.shutdownPromise;
    }

    this.workerLogger.info('开始停止 Queue Worker', {
      activeTasks: this.activeTasks.size,
      gracefulTimeout: this.config.gracefulShutdownTimeout,
    });

    this.status = 'stopping';
    this.emit('stopping');

    // 创建关闭 Promise
    this.shutdownPromise = new Promise<void>((resolve) => {
      this.shutdownResolver = resolve;
    });

    // 停止轮询
    this.stopPolling();
    this.stopHealthCheck();

    // 等待活跃任务完成或超时
    await this.waitForActiveTasks();

    this.status = 'stopped';
    this.emit('stopped');
    
    if (this.shutdownResolver) {
      this.shutdownResolver();
    }

    this.workerLogger.info('Queue Worker 已停止');
  }

  /**
   * 强制停止 Worker
   */
  async forceStop(): Promise<void> {
    this.workerLogger.warn('强制停止 Queue Worker', {
      activeTasks: this.activeTasks.size,
    });

    this.status = 'stopping';
    
    // 停止轮询和健康检查
    this.stopPolling();
    this.stopHealthCheck();

    // 取消所有活跃任务
    for (const [taskId, activeTask] of this.activeTasks) {
      clearTimeout(activeTask.timeoutId);
      this.workerLogger.warn('强制取消任务', { taskId });
    }
    
    this.activeTasks.clear();
    this.status = 'stopped';
    this.emit('stopped');

    if (this.shutdownResolver) {
      this.shutdownResolver();
    }
  }

  /**
   * 获取 Worker 状态
   */
  getStatus(): WorkerStatus {
    return this.status;
  }

  /**
   * 获取 Worker 统计信息
   */
  getStats(): WorkerStats {
    const now = Date.now();
    const averageProcessingTime = this.stats.processingTimes.length > 0
      ? this.stats.processingTimes.reduce((sum, time) => sum + time, 0) / this.stats.processingTimes.length
      : 0;

    return {
      status: this.status,
      activeTasks: this.activeTasks.size,
      totalProcessed: this.stats.totalProcessed,
      totalSucceeded: this.stats.totalSucceeded,
      totalFailed: this.stats.totalFailed,
      averageProcessingTime,
      uptime: this.stats.startTime > 0 ? now - this.stats.startTime : 0,
      lastError: this.stats.lastError,
      lastErrorAt: this.stats.lastErrorAt,
    };
  }

  /**
   * 获取活跃任务列表
   */
  getActiveTasks(): Array<{ taskId: string; startTime: number; duration: number }> {
    const now = Date.now();
    return Array.from(this.activeTasks.entries()).map(([taskId, activeTask]) => ({
      taskId,
      startTime: activeTask.startTime,
      duration: now - activeTask.startTime,
    }));
  }

  /**
   * 启动轮询
   */
  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(async () => {
      if (this.status !== 'running') {
        return;
      }

      try {
        await this.pollAndProcess();
      } catch (error) {
        this.handleError('轮询处理失败', error);
      }
    }, this.config.pollInterval);
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
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
   * 轮询并处理任务
   */
  private async pollAndProcess(): Promise<void> {
    // 检查是否还有可用的并发槽位
    if (this.activeTasks.size >= this.config.maxConcurrency) {
      return;
    }

    // 计算可以处理的任务数量
    const availableSlots = this.config.maxConcurrency - this.activeTasks.size;
    
    // 批量获取任务
    const tasks: ReviewTask[] = [];
    for (let i = 0; i < availableSlots; i++) {
      const task = await this.queue.dequeue();
      if (task) {
        tasks.push(task);
      } else {
        break; // 队列为空
      }
    }

    if (tasks.length === 0) {
      return;
    }

    this.workerLogger.info('获取到待处理任务', {
      taskCount: tasks.length,
      activeTasks: this.activeTasks.size,
      availableSlots,
      taskIds: tasks.map(t => t.id.substring(0, 8)),
    });

    // 并发处理任务
    for (const task of tasks) {
      this.processTask(task).catch((error) => {
        this.handleError(`任务处理失败: ${task.id}`, error);
      });
    }
  }

  /**
   * 处理单个任务
   */
  private async processTask(task: ReviewTask): Promise<void> {
    const taskId = task.id;
    const startTime = Date.now();

    this.workerLogger.info('开始处理任务', {
      taskId,
      commitHash: task.commitHash,
      retryCount: task.retryCount,
    });

    // 设置任务超时
    const timeoutId = setTimeout(() => {
      this.handleTaskTimeout(taskId);
    }, this.config.taskTimeout);

    // 创建任务处理 Promise
    let taskPromise: Promise<any>;
    
    try {
      taskPromise = this.executeTask(task);
    } catch (error) {
      this.workerLogger.error('创建任务处理 Promise 失败', {
        taskId,
        error: this.extractErrorMessage(error),
      });
      clearTimeout(timeoutId);
      throw error;
    }

    // 记录活跃任务
    const activeTask: ActiveTask = {
      task,
      startTime,
      timeoutId,
      promise: taskPromise,
    };
    this.activeTasks.set(taskId, activeTask);

    this.emit('taskStarted', task);

    try {
      // 执行任务
      const result = await taskPromise;
      
      // 清理超时定时器
      clearTimeout(timeoutId);
      
      // 从活跃任务中移除
      this.activeTasks.delete(taskId);
      
      // 标记任务完成
      await this.queue.complete(taskId, result);
      
      // 更新统计信息
      const processingTime = Date.now() - startTime;
      this.updateStats(true, processingTime);
      
      this.workerLogger.info('任务处理完成', {
        taskId,
        commitHash: task.commitHash,
        processingTime: `${processingTime}ms`,
      });

      this.emit('taskCompleted', task, result);

    } catch (error) {
      this.workerLogger.error('任务处理过程中出错', {
        taskId,
        commitHash: task.commitHash,
        error: this.extractErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // 清理超时定时器
      clearTimeout(timeoutId);
      
      // 从活跃任务中移除
      this.activeTasks.delete(taskId);
      
      // 标记任务失败
      const taskError = error instanceof Error ? error : new Error(String(error));
      
      try {
        await this.queue.fail(taskId, taskError);
      } catch (failError) {
        this.workerLogger.error('标记任务失败时出错', {
          taskId,
          originalError: taskError.message,
          failError: this.extractErrorMessage(failError),
        });
      }
      
      // 更新统计信息
      const processingTime = Date.now() - startTime;
      this.updateStats(false, processingTime);
      
      this.workerLogger.error('任务处理失败', {
        taskId,
        commitHash: task.commitHash,
        processingTime: `${processingTime}ms`,
        error: taskError.message,
        retryCount: task.retryCount,
      });

      this.emit('taskFailed', task, taskError);
    }
  }

  /**
   * 执行任务处理逻辑
   */
  private async executeTask(task: ReviewTask): Promise<any> {
    try {
      return await this.taskProcessor(task);
    } catch (error) {
      // 包装错误以提供更多上下文
      const wrappedError = new Error(
        `任务处理器执行失败: ${this.extractErrorMessage(error)}`
      );
      
      if (error instanceof Error && error.stack) {
        wrappedError.stack = error.stack;
      }
      
      throw wrappedError;
    }
  }

  /**
   * 处理任务超时
   */
  private handleTaskTimeout(taskId: string): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    this.workerLogger.error('任务执行超时', {
      taskId,
      commitHash: activeTask.task.commitHash,
      timeout: this.config.taskTimeout,
      duration: Date.now() - activeTask.startTime,
    });

    // 从活跃任务中移除
    this.activeTasks.delete(taskId);

    // 标记任务失败
    const timeoutError = new Error(`任务执行超时 (${this.config.taskTimeout}ms)`);
    this.queue.fail(taskId, timeoutError).catch((error) => {
      this.handleError(`标记超时任务失败: ${taskId}`, error);
    });

    // 更新统计信息
    const processingTime = Date.now() - activeTask.startTime;
    this.updateStats(false, processingTime);

    this.emit('taskTimeout', activeTask.task);
  }

  /**
   * 等待活跃任务完成
   */
  private async waitForActiveTasks(): Promise<void> {
    if (this.activeTasks.size === 0) {
      return;
    }

    this.workerLogger.info('等待活跃任务完成', {
      activeTasks: this.activeTasks.size,
      timeout: this.config.gracefulShutdownTimeout,
    });

    const activePromises = Array.from(this.activeTasks.values()).map(
      (activeTask) => activeTask.promise
    );

    try {
      // 等待所有任务完成或超时
      await Promise.race([
        Promise.allSettled(activePromises),
        new Promise<void>((resolve) => {
          setTimeout(resolve, this.config.gracefulShutdownTimeout);
        }),
      ]);
    } catch (error) {
      this.workerLogger.warn('等待活跃任务时出错', { error });
    }

    // 强制清理剩余的活跃任务
    if (this.activeTasks.size > 0) {
      this.workerLogger.warn('强制清理剩余活跃任务', {
        remainingTasks: this.activeTasks.size,
      });

      for (const [taskId, activeTask] of this.activeTasks) {
        clearTimeout(activeTask.timeoutId);
        this.workerLogger.warn('强制取消任务', { taskId });
      }
      
      this.activeTasks.clear();
    }
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    const stats = this.getStats();
    
    this.workerLogger.debug('Worker 健康检查', {
      status: stats.status,
      activeTasks: stats.activeTasks,
      totalProcessed: stats.totalProcessed,
      uptime: `${Math.round(stats.uptime / 1000)}s`,
    });

    // 检查是否有任务卡住
    const now = Date.now();
    const stuckTasks = Array.from(this.activeTasks.entries()).filter(
      ([, activeTask]) => now - activeTask.startTime > this.config.taskTimeout * 1.5
    );

    if (stuckTasks.length > 0) {
      this.workerLogger.warn('发现可能卡住的任务', {
        stuckTaskCount: stuckTasks.length,
        tasks: stuckTasks.map(([taskId, activeTask]) => ({
          taskId,
          duration: now - activeTask.startTime,
        })),
      });
    }

    this.emit('healthCheck', stats);
  }

  /**
   * 更新统计信息
   */
  private updateStats(success: boolean, processingTime: number): void {
    this.stats.totalProcessed++;
    
    if (success) {
      this.stats.totalSucceeded++;
    } else {
      this.stats.totalFailed++;
    }

    // 保留最近 100 次处理时间用于计算平均值
    this.stats.processingTimes.push(processingTime);
    if (this.stats.processingTimes.length > 100) {
      this.stats.processingTimes.shift();
    }
  }

  /**
   * 处理错误
   */
  private handleError(message: string, error: any): void {
    const errorMessage = this.extractErrorMessage(error);
    
    this.stats.lastError = errorMessage;
    this.stats.lastErrorAt = new Date();
    
    this.workerLogger.error(message, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // 如果错误过于频繁，考虑暂停 Worker
    if (this.shouldPauseOnError()) {
      this.pauseOnError();
    }

    this.emit('error', error);
  }

  /**
   * 判断是否应该因错误暂停
   */
  private shouldPauseOnError(): boolean {
    // 简单的错误率检查：如果最近失败率超过 50%，暂停
    const recentTotal = Math.min(this.stats.totalProcessed, 10);
    const recentFailed = Math.min(this.stats.totalFailed, recentTotal);
    
    return recentTotal > 0 && (recentFailed / recentTotal) > 0.5;
  }

  /**
   * 因错误暂停 Worker
   */
  private pauseOnError(): void {
    this.workerLogger.error('错误率过高，暂停 Worker', {
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      failureRate: this.stats.totalProcessed > 0 
        ? (this.stats.totalFailed / this.stats.totalProcessed * 100).toFixed(2) + '%'
        : '0%',
    });

    this.status = 'error';
    this.stopPolling();
    
    // 延迟后尝试恢复
    setTimeout(() => {
      if (this.status === 'error') {
        this.workerLogger.info('尝试从错误状态恢复');
        this.status = 'running';
        this.startPolling();
      }
    }, this.config.retryDelay);

    this.emit('paused');
  }

  /**
   * 设置进程信号处理
   */
  private setupSignalHandlers(): void {
    const handleShutdown = (signal: string) => {
      this.workerLogger.info(`收到 ${signal} 信号，开始优雅关闭`);
      this.stop().catch((error) => {
        this.workerLogger.error('优雅关闭失败', { error });
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.workerLogger.error('未捕获的异常', { error: error.message, stack: error.stack });
      this.forceStop().finally(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason) => {
      this.workerLogger.error('未处理的 Promise 拒绝', { reason });
      this.handleError('未处理的 Promise 拒绝', reason);
    });
  }
}

// 导出默认实例创建函数
export function createWorker(
  taskProcessor: TaskProcessor,
  config?: Partial<WorkerConfig>
): QueueWorker {
  return new QueueWorker(taskProcessor, reviewQueue, config);
}

// 导出类型
export type { WorkerConfig, WorkerStats, TaskProcessor };