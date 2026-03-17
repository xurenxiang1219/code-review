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
  TASKS: 'review:queue:tasks',           // 有序集合：任务队列
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

type PriorityValue = typeof PRIORITY[keyof typeof PRIORITY];

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
      await RedisClient.pipeline([
        ['zadd', QUEUE_KEYS.TASKS, score, taskId],
        ['hmset', `${QUEUE_KEYS.TASK_DATA}${taskId}`, 
          'id', taskId,
          'commitHash', commit.hash,
          'branch', commit.branch,
          'repository', commit.repository,
          'authorName', commit.author.name,
          'authorEmail', commit.author.email,
          'commitMessage', commit.message,
          'commitUrl', commit.url,
          'priority', priority.toString(),
          'retryCount', '0',
          'maxRetries', task.maxRetries.toString(),
          'status', 'queued',
          'createdAt', task.createdAt.toISOString(),
          'executeAt', new Date(executeAt).toISOString()
        ],
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
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 从队列中获取下一个任务
   * 
   * @returns 审查任务或 null
   */
  async dequeue(): Promise<ReviewTask | null> {
    try {
      const now = Date.now() / 1000; // Redis 分数使用秒

      // 获取可执行的任务（分数 <= 当前时间，按分数升序）
      const taskResults = await RedisUtils.sortedSetRangeByScore(
        QUEUE_KEYS.TASKS,
        '-inf',
        now,
        true // 包含分数
      );

      if (taskResults.length === 0) {
        return null;
      }

      // 解析结果：[member1, score1, member2, score2, ...]
      const taskId = taskResults[0];
      const score = parseFloat(taskResults[1]);

      // 原子性地移除任务并添加到处理中集合
      const pipelineResults = await RedisClient.pipeline([
        ['zrem', QUEUE_KEYS.TASKS, taskId],
        ['sadd', QUEUE_KEYS.PROCESSING, taskId],
        ['hset', `${QUEUE_KEYS.TASK_DATA}${taskId}`, 'status', 'processing'],
        ['hset', `${QUEUE_KEYS.TASK_DATA}${taskId}`, 'startedAt', new Date().toISOString()],
        ['hincrby', QUEUE_KEYS.STATS, 'total', -1],
        ['hincrby', QUEUE_KEYS.STATS, 'processing', 1],
      ]);

      // 检查是否成功移除（避免并发问题）
      const removedCount = pipelineResults[0] as number;
      if (removedCount === 0) {
        // 任务已被其他进程处理
        return this.dequeue(); // 递归获取下一个任务
      }

      // 获取任务详情
      const taskData = await RedisUtils.hashGetAll(`${QUEUE_KEYS.TASK_DATA}${taskId}`);
      if (!taskData.id) {
        this.queueLogger.error('任务数据不存在', { taskId });
        return null;
      }

      const task: ReviewTask = {
        id: taskData.id,
        commitHash: taskData.commitHash,
        branch: taskData.branch,
        repository: taskData.repository,
        priority: parseInt(taskData.priority),
        retryCount: parseInt(taskData.retryCount),
        maxRetries: parseInt(taskData.maxRetries),
        status: 'processing' as TaskStatus,
        createdAt: new Date(taskData.createdAt),
        startedAt: new Date(taskData.startedAt),
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
        error: error instanceof Error ? error.message : String(error),
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
      
      await RedisClient.pipeline([
        ['srem', QUEUE_KEYS.PROCESSING, taskId],
        ['sadd', QUEUE_KEYS.COMPLETED, taskId],
        ['hmset', `${QUEUE_KEYS.TASK_DATA}${taskId}`,
          'status', 'completed',
          'completedAt', completedAt,
          'result', result ? JSON.stringify(result) : ''
        ],
        ['hincrby', QUEUE_KEYS.STATS, 'processing', -1],
        ['hincrby', QUEUE_KEYS.STATS, 'completed', 1],
        ['hset', QUEUE_KEYS.STATS, 'lastCompleted', Date.now().toString()],
      ]);

      // 设置任务数据过期时间（保留 7 天）
      await RedisUtils.expireCache(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 7 * 24 * 3600);

      this.queueLogger.info('任务已完成', {
        taskId,
        completedAt,
        hasResult: !!result,
      });

    } catch (error) {
      this.queueLogger.error('标记任务完成失败', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 标记任务失败
   * 
   * @param taskId - 任务 ID
   * @param error - 错误信息
   */
  async fail(taskId: string, error: Error): Promise<void> {
    try {
      // 获取当前任务信息
      const taskData = await RedisUtils.hashGetAll(`${QUEUE_KEYS.TASK_DATA}${taskId}`);
      if (!taskData.id) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      const retryCount = parseInt(taskData.retryCount) + 1;
      const maxRetries = parseInt(taskData.maxRetries);
      const failedAt = new Date().toISOString();

      if (retryCount <= maxRetries) {
        // 重试：重新加入队列
        const priority = parseInt(taskData.priority);
        const retryDelay = this.calculateRetryDelay(retryCount);
        const executeAt = Date.now() + (retryDelay * 1000);
        const score = priority + (executeAt / 1000000);

        await RedisClient.pipeline([
          ['srem', QUEUE_KEYS.PROCESSING, taskId],
          ['zadd', QUEUE_KEYS.TASKS, score, taskId],
          ['hmset', `${QUEUE_KEYS.TASK_DATA}${taskId}`,
            'status', 'queued',
            'retryCount', retryCount.toString(),
            'lastError', error.message,
            'lastFailedAt', failedAt,
            'executeAt', new Date(executeAt).toISOString()
          ],
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
        await RedisClient.pipeline([
          ['srem', QUEUE_KEYS.PROCESSING, taskId],
          ['sadd', QUEUE_KEYS.FAILED, taskId],
          ['hmset', `${QUEUE_KEYS.TASK_DATA}${taskId}`,
            'status', 'failed',
            'retryCount', retryCount.toString(),
            'finalError', error.message,
            'failedAt', failedAt
          ],
          ['hincrby', QUEUE_KEYS.STATS, 'processing', -1],
          ['hincrby', QUEUE_KEYS.STATS, 'failed', 1],
          ['hset', QUEUE_KEYS.STATS, 'lastFailed', Date.now().toString()],
        ]);

        // 设置失败任务数据过期时间（保留 30 天用于分析）
        await RedisUtils.expireCache(`${QUEUE_KEYS.TASK_DATA}${taskId}`, 30 * 24 * 3600);

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
        processingError: err instanceof Error ? err.message : String(err),
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
   * 
   * @param taskId - 任务 ID
   * @returns 任务详情或 null
   */
  async getTask(taskId: string): Promise<ReviewTask | null> {
    try {
      const taskData = await RedisUtils.hashGetAll(`${QUEUE_KEYS.TASK_DATA}${taskId}`);
      if (!taskData.id) {
        return null;
      }

      return {
        id: taskData.id,
        commitHash: taskData.commitHash,
        branch: taskData.branch,
        repository: taskData.repository,
        priority: parseInt(taskData.priority),
        retryCount: parseInt(taskData.retryCount),
        maxRetries: parseInt(taskData.maxRetries),
        status: taskData.status as TaskStatus,
        errorMessage: taskData.finalError || taskData.lastError,
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
   * 
   * @param commit - 提交信息
   * @returns 优先级分数
   */
  private calculatePriority(commit: CommitInfo): number {
    const message = commit.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('urgent') || message.includes('hotfix')) {
      return PRIORITY.CRITICAL;
    }
    
    if (message.includes('security') || message.includes('vulnerability')) {
      return PRIORITY.CRITICAL;
    }
    
    if (message.includes('bug') || message.includes('fix')) {
      return PRIORITY.HIGH;
    }
    
    if (message.includes('feature') || message.includes('enhancement')) {
      return PRIORITY.NORMAL;
    }
    
    if (message.includes('refactor') || message.includes('cleanup')) {
      return PRIORITY.LOW;
    }

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