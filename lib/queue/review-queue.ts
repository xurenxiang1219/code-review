import { v4 as uuidv4 } from 'uuid';
import { RedisUtils } from '@/lib/cache/redis-utils';
import RedisClient from '@/lib/cache/redis-client';
import { logger } from '@/lib/utils/logger';
import { ReviewTask, TaskStatus } from '@/types/review';
import { CommitInfo } from '@/types/git';

/**
 * 队列键名常量
 */
const QUEUE_KEYS = {
  TASKS: 'review:tasks',                 // 有序集合：任务队列
  TASK_DATA: 'review:task:',             // 哈希表：任务详情 (prefix)
  PROCESSING: 'review:processing',       // 集合：处理中的任务
  FAILED: 'review:failed',               // 集合：失败的任务
  COMPLETED: 'review:completed',         // 集合：已完成的任务
  STATS: 'review:queue:stats',           // 哈希表：队列统计信息
} as const;

/**
 * 优先级常量
 */
export const PRIORITY = {
  CRITICAL: 1000,    // 关键任务（如安全问题）
  HIGH: 800,         // 高优先级
  NORMAL: 500,       // 普通优先级
  LOW: 200,          // 低优先级
} as const;

/**
 * 队列配置
 */
interface QueueConfig {
  maxRetries: number;           // 最大重试次数
  retryDelay: number;          // 重试延迟（秒）
  taskTimeout: number;         // 任务超时时间（秒）
  maxQueueSize: number;        // 队列最大长度
  cleanupInterval: number;     // 清理间隔（秒）
}

/**
 * 默认队列配置
 */
const DEFAULT_CONFIG: QueueConfig = {
  maxRetries: 3,
  retryDelay: 60,
  taskTimeout: 600,
  maxQueueSize: 1000,
  cleanupInterval: 3600,
};

/**
 * 任务入队选项
 */
interface EnqueueOptions {
  priority?: number;
  delay?: number;              // 延迟执行（秒）
  maxRetries?: number;
}

/**
 * 队列统计信息
 */
interface QueueStats {
  total: number;               // 队列总长度
  processing: number;          // 处理中任务数
  completed: number;           // 已完成任务数
  failed: number;              // 失败任务数
  lastProcessed?: Date;        // 最后处理时间
}

/**
 * Review Queue 实现类
 * 
 * 使用 Redis 有序集合实现优先级队列，支持：
 * - 优先级排序（分数越高优先级越高）
 * - 任务重试机制
 * - 并发控制
 * - 失败恢复
 * - 统计监控
 */
export class ReviewQueue {
  private config: QueueConfig;
  private queueLogger: typeof logger;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queueLogger = logger.child({ service: 'ReviewQueue' });
  }

  /**
   * 提取错误信息的工具方法
   */
  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * 添加审查任务到队列
   * 
   * @param commit - 提交信息
   * @param options - 入队选项
   * @returns 任务 ID
   */
  async enqueue(commit: CommitInfo, options: EnqueueOptions = {}): Promise<string> {
    const taskId = uuidv4();
    const now = Date.now();
    
    // 计算优先级和分数
    const priority = options.priority || this.calculatePriority(commit);
    const delay = options.delay || 0;
    const executeAt = now + (delay * 1000);
    
    // 分数 = 优先级 + 时间戳（确保同优先级按时间排序）
    const score = priority + (executeAt / 1000000); // 时间戳缩小避免溢出

    // 创建任务对象
    const task: ReviewTask = {
      id: taskId,
      commitHash: commit.hash,
      branch: commit.branch,
      repository: commit.repository,
      priority,
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.maxRetries,
      status: 'queued',
      createdAt: new Date(now),
    };

    try {
      // 检查队列长度限制
      const queueLength = await this.length();
      if (queueLength >= this.config.maxQueueSize) {
        throw new Error(`队列已满，当前长度: ${queueLength}, 最大长度: ${this.config.maxQueueSize}`);
      }

      // 检查是否已存在相同提交的任务
      const existingTaskId = await this.findTaskByCommit(commit.hash);
      if (existingTaskId) {
        this.queueLogger.warn('提交已在队列中，跳过重复任务', {
          commitHash: commit.hash,
          existingTaskId,
          newTaskId: taskId,
        });
        return existingTaskId;
      }

      // 使用事务确保原子性
      const taskDataKey = `${QUEUE_KEYS.TASK_DATA}${taskId}`;
      
      // 构建任务数据，使用空值合并操作符确保数据安全
      const taskData = {
        id: taskId,
        commitHash: commit.hash ?? '',
        branch: commit.branch ?? '',
        repository: commit.repository ?? '',
        authorName: commit.author?.name ?? '',
        authorEmail: commit.author?.email ?? '',
        commitMessage: commit.message ?? '',
        commitUrl: commit.url ?? '',
        priority: priority.toString(),
        retryCount: '0',
        maxRetries: task.maxRetries.toString(),
        status: 'queued',
        createdAt: task.createdAt.toISOString(),
        executeAt: new Date(executeAt).toISOString()
      };

      // 构建 hset 命令参数 - Redis 8.x 兼容性优化
      const hsetArgs: (string | number)[] = [taskDataKey];
      Object.entries(taskData).forEach(([key, value]) => {
        hsetArgs.push(key, value);
      });

      // 使用 pipeline 确保原子性操作
      await RedisClient.pipeline([
        ['zadd', QUEUE_KEYS.TASKS, score, taskId],
        ['hset', ...hsetArgs],
        ['hincrby', QUEUE_KEYS.STATS, 'total', 1],
        ['hset', QUEUE_KEYS.STATS, 'lastEnqueued', now.toString()],
      ]);

      this.queueLogger.info('任务已加入队列', {
        taskId,
        commitHash: commit.hash,
        priority,
        score,
        delay,
        queueLength: queueLength + 1,
      });

      return taskId;

    } catch (error) {
      this.queueLogger.error('任务入队失败', {
        taskId,
        commitHash: commit.hash,
        error: this.extractErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * 从队列中获取下一个任务
   */
  async dequeue(): Promise<ReviewTask | null> {
    try {
      const now = Date.now() / 1000; // Redis 分数使用秒
      
      this.queueLogger.debug('开始出队操作', { currentTime: now });

      // 获取可执行的任务（分数 <= 当前时间，按分数升序）
      const taskResults = await RedisUtils.sortedSetRangeByScore(
        QUEUE_KEYS.TASKS,
        '-inf',
        now,
        true // 包含分数
      );

      this.queueLogger.debug('查询队列结果', { 
        resultCount: taskResults.length,
        results: taskResults.slice(0, 4) // 只显示前2个任务的信息
      });

      if (taskResults.length === 0) {
        this.queueLogger.debug('队列为空，返回 null');
        return null;
      }

      // 解析结果：[member1, score1, member2, score2, ...]
      const taskId = taskResults[0];
      const taskDataKey = `${QUEUE_KEYS.TASK_DATA}${taskId}`;
      
      this.queueLogger.debug('尝试获取任务', { taskId, taskDataKey });

      // 先检查任务数据是否存在
      const taskData = await RedisUtils.hashGetAll(taskDataKey);
      
      if (!taskData?.id) {
        // 任务数据不存在，清理无效的队列项
        this.queueLogger.warn('发现无效任务，开始清理', { 
          taskId,
          reason: 'taskData?.id 检查失败'
        });
        await RedisClient.executeCommand('zrem', QUEUE_KEYS.TASKS, taskId);
        this.queueLogger.warn('无效任务已清理，递归获取下一个任务', { taskId });
        return this.dequeue(); // 递归获取下一个任务
      }

      this.queueLogger.debug('任务数据验证通过', { 
        taskId, 
        commitHash: taskData.commitHash,
        status: taskData.status 
      });

      // 原子性地移除任务并添加到处理中集合
      const currentTime = new Date().toISOString();
      
      this.queueLogger.debug('执行原子性操作：移除任务并标记为处理中', { taskId });
      
      const pipelineCommands: [string, ...any[]][] = [
        ['zrem', QUEUE_KEYS.TASKS, taskId],
        ['sadd', QUEUE_KEYS.PROCESSING, taskId],
        ['hset', taskDataKey, 'status', 'processing'],
        ['hset', taskDataKey, 'startedAt', currentTime],
        ['hincrby', QUEUE_KEYS.STATS, 'total', -1],
        ['hincrby', QUEUE_KEYS.STATS, 'processing', 1],
      ];
      
      this.queueLogger.debug('准备执行 pipeline 命令', { 
        taskId, 
        commandCount: pipelineCommands.length,
        commands: pipelineCommands.map(cmd => cmd[0])
      });
      
      const pipelineResults = await RedisClient.pipeline(pipelineCommands);
      
      this.queueLogger.debug('Pipeline 执行完成', { 
        taskId, 
        resultCount: pipelineResults.length,
        removedFromQueue: pipelineResults[0]
      });

      // 检查是否成功移除（避免并发问题）
      const removedCount = pipelineResults[0] as number;
      this.queueLogger.debug('原子性操作结果', { 
        taskId, 
        removedCount
      });
      
      if (removedCount === 0) {
        // 任务已被其他进程处理
        this.queueLogger.warn('任务已被其他进程处理，递归获取下一个任务', { taskId });
        return this.dequeue(); // 递归获取下一个任务
      }

      // 构建任务对象，使用默认值防止解析错误
      const task: ReviewTask = {
        id: taskData.id,
        commitHash: taskData.commitHash ?? '',
        branch: taskData.branch ?? '',
        repository: taskData.repository ?? '',
        priority: parseInt(taskData.priority) || 0,
        retryCount: parseInt(taskData.retryCount) || 0,
        maxRetries: parseInt(taskData.maxRetries) || 0,
        status: 'processing' as TaskStatus,
        createdAt: new Date(taskData.createdAt),
        startedAt: new Date(currentTime),
      };

      this.queueLogger.info('任务已出队', {
        taskId,
        commitHash: task.commitHash,
        priority: task.priority,
        retryCount: task.retryCount,
        waitTime: Date.now() - task.createdAt.getTime(),
      });

      return task;

    } catch (error) {
      this.queueLogger.error('任务出队失败', {
        error: this.extractErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * 获取队列长度
   * 
   * @returns 队列中等待处理的任务数量
   */
  async length(): Promise<number> {
    try {
      return await RedisUtils.sortedSetCount(QUEUE_KEYS.TASKS);
    } catch (error) {
      this.queueLogger.error('获取队列长度失败', { error });
      throw error;
    }
  }

  /**
   * 标记任务完成
   * 
   * @param taskId - 任务 ID
   * @param result - 处理结果（可选）
   */
  async complete(taskId: string, result?: any): Promise<void> {
    try {
      const completedAt = new Date().toISOString();
      const taskDataKey = `${QUEUE_KEYS.TASK_DATA}${taskId}`;
      
      await RedisClient.pipeline([
        ['srem', QUEUE_KEYS.PROCESSING, taskId],
        ['sadd', QUEUE_KEYS.COMPLETED, taskId],
        ['hset', taskDataKey, 'status', 'completed'],
        ['hset', taskDataKey, 'completedAt', completedAt],
        ['hset', taskDataKey, 'result', result ? JSON.stringify(result) : ''],
        ['hincrby', QUEUE_KEYS.STATS, 'processing', -1],
        ['hincrby', QUEUE_KEYS.STATS, 'completed', 1],
        ['hset', QUEUE_KEYS.STATS, 'lastCompleted', Date.now().toString()],
      ]);

      // 设置任务数据过期时间（保留 7 天）
      await RedisUtils.expireCache(taskDataKey, 7 * 24 * 3600);

      this.queueLogger.info('任务已完成', {
        taskId,
        completedAt,
        hasResult: !!result,
      });

    } catch (error) {
      this.queueLogger.error('标记任务完成失败', {
        taskId,
        error: this.extractErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * 标记任务失败
   */
  async fail(taskId: string, error: Error): Promise<void> {
    try {
      // 获取当前任务信息，使用空值安全检查
      const taskData = await RedisUtils.hashGetAll(`${QUEUE_KEYS.TASK_DATA}${taskId}`);
      if (!taskData?.id) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      const retryCount = (parseInt(taskData.retryCount) || 0) + 1;
      const maxRetries = parseInt(taskData.maxRetries) || 0;
      const failedAt = new Date().toISOString();

      if (retryCount <= maxRetries) {
        // 重试：重新加入队列
        const priority = parseInt(taskData.priority) || 0;
        const retryDelay = this.calculateRetryDelay(retryCount);
        const executeAt = Date.now() + (retryDelay * 1000);
        const score = priority + (executeAt / 1000000);

        const taskDataKey = `${QUEUE_KEYS.TASK_DATA}${taskId}`;
        await RedisClient.pipeline([
          ['srem', QUEUE_KEYS.PROCESSING, taskId],
          ['zadd', QUEUE_KEYS.TASKS, score, taskId],
          ['hset', taskDataKey, 'status', 'queued'],
          ['hset', taskDataKey, 'retryCount', retryCount.toString()],
          ['hset', taskDataKey, 'lastError', error.message ?? ''],
          ['hset', taskDataKey, 'lastFailedAt', failedAt],
          ['hset', taskDataKey, 'executeAt', new Date(executeAt).toISOString()],
          ['hincrby', QUEUE_KEYS.STATS, 'processing', -1],
          ['hincrby', QUEUE_KEYS.STATS, 'total', 1],
        ]);

        this.queueLogger.warn('任务失败，已重新入队', {
          taskId,
          retryCount,
          maxRetries,
          retryDelay,
          error: error.message,
        });

      } else {
        // 超过最大重试次数：标记为最终失败
        const taskDataKey = `${QUEUE_KEYS.TASK_DATA}${taskId}`;
        await RedisClient.pipeline([
          ['srem', QUEUE_KEYS.PROCESSING, taskId],
          ['sadd', QUEUE_KEYS.FAILED, taskId],
          ['hset', taskDataKey, 'status', 'failed'],
          ['hset', taskDataKey, 'retryCount', retryCount.toString()],
          ['hset', taskDataKey, 'finalError', error.message ?? ''],
          ['hset', taskDataKey, 'failedAt', failedAt],
          ['hincrby', QUEUE_KEYS.STATS, 'processing', -1],
          ['hincrby', QUEUE_KEYS.STATS, 'failed', 1],
          ['hset', QUEUE_KEYS.STATS, 'lastFailed', Date.now().toString()],
        ]);

        // 设置失败任务数据过期时间（保留 30 天用于分析）
        await RedisUtils.expireCache(taskDataKey, 30 * 24 * 3600);

        this.queueLogger.error('任务最终失败', {
          taskId,
          retryCount,
          maxRetries,
          error: error.message,
          stack: error.stack,
        });
      }

    } catch (err) {
      this.queueLogger.error('标记任务失败时出错', {
        taskId,
        originalError: error.message,
        processingError: this.extractErrorMessage(err),
      });
      throw err;
    }
  }

  /**
   * 获取队列统计信息
   * 
   * @returns 队列统计信息
   */
  async getStats(): Promise<QueueStats> {
    try {
      const stats = await RedisUtils.hashGetAll(QUEUE_KEYS.STATS);
      
      return {
        total: parseInt(stats.total || '0'),
        processing: parseInt(stats.processing || '0'),
        completed: parseInt(stats.completed || '0'),
        failed: parseInt(stats.failed || '0'),
        lastProcessed: stats.lastCompleted ? new Date(parseInt(stats.lastCompleted)) : undefined,
      };
    } catch (error) {
      this.queueLogger.error('获取队列统计失败', { error });
      throw error;
    }
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<ReviewTask | null> {
    try {
      const taskData = await RedisUtils.hashGetAll(`${QUEUE_KEYS.TASK_DATA}${taskId}`);
      if (!taskData?.id) {
        return null;
      }

      return {
        id: taskData.id,
        commitHash: taskData.commitHash,
        branch: taskData.branch,
        repository: taskData.repository,
        authorName: taskData.authorName ?? undefined,
        authorEmail: taskData.authorEmail ?? undefined,
        commitMessage: taskData.commitMessage ?? undefined,
        commitUrl: taskData.commitUrl ?? undefined,
        priority: parseInt(taskData.priority),
        retryCount: parseInt(taskData.retryCount),
        maxRetries: parseInt(taskData.maxRetries),
        status: taskData.status as TaskStatus,
        errorMessage: taskData.finalError ?? taskData.lastError,
        createdAt: new Date(taskData.createdAt),
        startedAt: taskData.startedAt ? new Date(taskData.startedAt) : undefined,
        completedAt: taskData.completedAt ? new Date(taskData.completedAt) : undefined,
      };
    } catch (error) {
      this.queueLogger.error('获取任务详情失败', { taskId, error });
      throw error;
    }
  }

  /**
   * 清理过期和完成的任务
   * 
   * @param olderThanHours - 清理多少小时前的任务
   */
  async cleanup(olderThanHours = 24): Promise<{ cleaned: number; errors: number }> {
    let cleaned = 0;
    let errors = 0;

    try {
      const cutoffTime = Date.now() - (olderThanHours * 3600 * 1000);
      
      // 清理已完成的任务
      const completedTasks = await RedisUtils.setMembers(QUEUE_KEYS.COMPLETED);
      for (const taskId of completedTasks) {
        try {
          const taskData = await RedisUtils.hashGet(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 'completedAt');
          if (taskData && new Date(taskData).getTime() < cutoffTime) {
            await RedisClient.pipeline([
              ['srem', QUEUE_KEYS.COMPLETED, taskId],
              ['del', `${QUEUE_KEYS.TASK_DATA}${taskId}`],
            ]);
            cleaned++;
          }
        } catch (err) {
          errors++;
          this.queueLogger.warn('清理已完成任务失败', { taskId, error: err });
        }
      }

      // 清理失败的任务（保留更长时间）
      const failedCutoffTime = Date.now() - (7 * 24 * 3600 * 1000); // 7天
      const failedTasks = await RedisUtils.setMembers(QUEUE_KEYS.FAILED);
      for (const taskId of failedTasks) {
        try {
          const taskData = await RedisUtils.hashGet(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 'failedAt');
          if (taskData && new Date(taskData).getTime() < failedCutoffTime) {
            await RedisClient.pipeline([
              ['srem', QUEUE_KEYS.FAILED, taskId],
              ['del', `${QUEUE_KEYS.TASK_DATA}${taskId}`],
            ]);
            cleaned++;
          }
        } catch (err) {
          errors++;
          this.queueLogger.warn('清理失败任务失败', { taskId, error: err });
        }
      }

      this.queueLogger.info('队列清理完成', {
        cleaned,
        errors,
        olderThanHours,
      });

      return { cleaned, errors };

    } catch (error) {
      this.queueLogger.error('队列清理失败', { error });
      throw error;
    }
  }

  /**
   * 计算任务优先级
   */
  private calculatePriority(commit: CommitInfo): number {
    const message = commit.message.toLowerCase();
    
    // 关键任务关键词
    const criticalKeywords = ['critical', 'urgent', 'hotfix', 'security', 'vulnerability'];
    if (criticalKeywords.some(keyword => message.includes(keyword))) {
      return PRIORITY.CRITICAL;
    }
    
    // 高优先级关键词
    const highKeywords = ['bug', 'fix'];
    if (highKeywords.some(keyword => message.includes(keyword))) {
      return PRIORITY.HIGH;
    }
    
    // 低优先级关键词
    const lowKeywords = ['refactor', 'cleanup'];
    if (lowKeywords.some(keyword => message.includes(keyword))) {
      return PRIORITY.LOW;
    }
    
    // 普通优先级关键词和默认值
    return PRIORITY.NORMAL;
  }

  /**
   * 计算重试延迟（指数退避）
   * 
   * @param retryCount - 重试次数
   * @returns 延迟秒数
   */
  private calculateRetryDelay(retryCount: number): number {
    // 指数退避：基础延迟 * 2^(重试次数-1)
    return this.config.retryDelay * Math.pow(2, retryCount - 1);
  }

  /**
   * 查找指定提交的任务
   * 
   * @param commitHash - 提交哈希
   * @returns 任务 ID 或 null
   */
  private async findTaskByCommit(commitHash: string): Promise<string | null> {
    try {
      // 检查队列中的任务
      const queuedTasks = await RedisUtils.sortedSetRangeByScore(QUEUE_KEYS.TASKS, '-inf', '+inf');
      for (const taskId of queuedTasks) {
        const hash = await RedisUtils.hashGet(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 'commitHash');
        if (hash === commitHash) {
          return taskId;
        }
      }

      // 检查处理中的任务
      const processingTasks = await RedisUtils.setMembers(QUEUE_KEYS.PROCESSING);
      for (const taskId of processingTasks) {
        const hash = await RedisUtils.hashGet(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 'commitHash');
        if (hash === commitHash) {
          return taskId;
        }
      }

      return null;
    } catch (error) {
      this.queueLogger.error('查找提交任务失败', { commitHash, error });
      return null;
    }
  }
}

// 导出单例实例
export const reviewQueue = new ReviewQueue();

// 导出类型和常量
export type { QueueConfig, EnqueueOptions, QueueStats };