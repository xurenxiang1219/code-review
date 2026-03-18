#!/usr/bin/env tsx

import { QueueWorker, createWorker } from '@/lib/queue/worker';
import { createCodeAnalyzer } from '@/lib/services/code-analyzer';
import { createAIReviewer } from '@/lib/services/ai-reviewer';
import { createCommentPublisher } from '@/lib/services/comment-publisher';
import { createGitClient } from '@/lib/git/client';
import { createDiffParser } from '@/lib/git/diff-parser';
import { logger } from '@/lib/utils/logger';
import { ReviewTask } from '@/types/review';
import { CommitInfo } from '@/types/git';
import RedisClient from '@/lib/cache/redis-client';
import { reviewRepository } from '@/lib/db/repositories/review';
import { configRepository } from '@/lib/db/repositories/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Worker 进程配置
 */
interface WorkerProcessConfig {
  maxConcurrency: number;
  pollInterval: number;
  taskTimeout: number;
  gracefulShutdownTimeout: number;
  healthCheckInterval: number;
  logLevel: string;
  enableMetrics: boolean;
}

/**
 * 从环境变量获取配置
 */
function getWorkerConfig(): WorkerProcessConfig {
  return {
    maxConcurrency: parseInt(process.env.WORKER_MAX_CONCURRENCY || '10'),
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000'),
    taskTimeout: parseInt(process.env.WORKER_TASK_TIMEOUT || '600000'), // 10分钟
    gracefulShutdownTimeout: parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT || '30000'), // 30秒
    healthCheckInterval: parseInt(process.env.WORKER_HEALTH_CHECK_INTERVAL || '30000'), // 30秒
    logLevel: process.env.LOG_LEVEL || 'info',
    enableMetrics: process.env.WORKER_ENABLE_METRICS === 'true',
  };
}

/**
 * 常量定义
 */
const CONSTANTS = {
  METRICS_INTERVAL_MS: 60000,        // 指标记录间隔：1分钟
  KEEP_ALIVE_INTERVAL_MS: 10000,     // 保活检查间隔：10秒
  MEMORY_LIMIT_MB: 2048,             // 内存使用限制：2GB
  ERROR_RATE_THRESHOLD: 0.5,         // 错误率阈值：50%
  MIN_PROCESSED_FOR_ERROR_CHECK: 10, // 错误率检查的最小处理数量
} as const;

/**
 * Worker 进程类
 * 负责管理 Queue Worker 的生命周期，包括启动、监控、优雅关闭
 */
class WorkerProcess {
  private worker: QueueWorker;
  private config: WorkerProcessConfig;
  private processLogger = logger.child({ service: 'WorkerProcess' });
  private isShuttingDown = false;
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.config = getWorkerConfig();
    this.processLogger.info('Worker 进程初始化', {
      pid: process.pid,
      config: this.config,
    });

    // 创建任务处理器
    const taskProcessor = this.createTaskProcessor();
    
    // 创建 Worker 实例
    this.worker = createWorker(taskProcessor, {
      maxConcurrency: this.config.maxConcurrency,
      pollInterval: this.config.pollInterval,
      taskTimeout: this.config.taskTimeout,
      gracefulShutdownTimeout: this.config.gracefulShutdownTimeout,
      healthCheckInterval: this.config.healthCheckInterval,
    });

    // 设置事件监听器
    this.setupEventListeners();
    
    // 设置进程信号处理
    this.setupSignalHandlers();
  }

  /**
   * 提取错误信息的工具方法
   */
  private extractErrorInfo(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  /**
   * 启动 Worker 进程
   */
  async start(): Promise<void> {
    try {
      this.processLogger.info('启动 Worker 进程', {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      });

      await this.checkDependencies();
      await this.worker.start();
      this.startMonitoring();

      this.processLogger.info('Worker 进程启动成功', {
        pid: process.pid,
        status: this.worker.getStatus(),
      });

      this.keepAlive();

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('Worker 进程启动失败', errorInfo);
      await this.shutdown(1);
    }
  }

  /**
   * 优雅关闭 Worker 进程
   */
  async shutdown(exitCode = 0): Promise<void> {
    if (this.isShuttingDown) {
      this.processLogger.warn('关闭已在进行中');
      return;
    }

    this.isShuttingDown = true;
    
    this.processLogger.info('开始优雅关闭 Worker 进程', {
      pid: process.pid,
      exitCode,
    });

    try {
      this.stopMonitoring();
      await this.worker.stop();
      await RedisClient.close();

      this.processLogger.info('Worker 进程已优雅关闭', {
        pid: process.pid,
        exitCode,
      });

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('优雅关闭过程中出错', errorInfo);
      await this.worker.forceStop();
    } finally {
      process.exit(exitCode);
    }
  }

  /**
   * 创建任务处理器
   */
  /**
   * 从数据库配置创建 Git 客户端
   * @param config 数据库配置对象
   * @returns Git 客户端实例
   */
  private async createGitClientFromConfig(config: any) {
    const { createGitClientConfigFromDb, createGitClient } = await import('@/lib/git/client');
    const gitClientConfig = createGitClientConfigFromDb({
      baseUrl: config.git?.baseUrl,
      accessToken: config.git?.accessToken,
      timeout: config.git?.timeout,
    });
    return createGitClient(gitClientConfig);
  }

  /**
   * 创建任务处理器
   */
  private createTaskProcessor() {
    const diffParser = createDiffParser();
    // const aiReviewer = createAIReviewer(); // 暂时注释，等待 AI 客户端接入

    /**
     * 任务处理函数
     * 执行完整的代码审查流程：分析 -> AI审查 -> 发布评论 -> 保存结果
     */
    return async (task: ReviewTask): Promise<void> => {
      const taskLogger = this.processLogger.child({
        taskId: task.id,
        commitHash: task.commitHash,
      });

      taskLogger.info('开始处理审查任务', {
        branch: task.branch,
        repository: task.repository,
        retryCount: task.retryCount,
      });

      try {
        const config = await configRepository.getConfig(task.repository);
        if (!config) {
          throw new Error(`未找到仓库配置: ${task.repository}`);
        }

        const gitClient = await this.createGitClientFromConfig(config);
        const codeAnalyzer = createCodeAnalyzer(gitClient, diffParser);
        const commentPublisher = createCommentPublisher(gitClient);
        const commit = await this.buildCommitInfo(task);

        taskLogger.debug('开始代码分析');
        const analysis = await codeAnalyzer.analyze(commit);
        
        taskLogger.info('代码分析完成', {
          filesCount: analysis.codeFiles.length,
          batchesCount: analysis.batches.length,
          totalAdditions: analysis.diff.totalAdditions,
          totalDeletions: analysis.diff.totalDeletions,
        });

        // 临时使用模拟的 AI 审查结果，等待真实 AI 客户端接入
        taskLogger.debug('开始 AI 审查（模拟）');
        const reviewResult = {
          id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          summary: {
            total: 0,
            critical: 0,
            major: 0,
            minor: 0,
            suggestion: 0,
          },
          processingTimeMs: 100,
          comments: [],
        };

        taskLogger.info('AI 审查完成（模拟）', {
          reviewId: reviewResult.id,
          totalIssues: reviewResult.summary.total,
          criticalCount: reviewResult.summary.critical,
          processingTime: reviewResult.processingTimeMs,
        });

        taskLogger.debug('保存审查记录');
        await reviewRepository.createReview({
          id: reviewResult.id,
          commitHash: commit.hash,
          branch: commit.branch,
          repository: commit.repository,
          authorName: commit.author.name,
          authorEmail: commit.author.email,
          filesChanged: analysis.codeFiles.length,
          linesAdded: analysis.diff.totalAdditions,
          linesDeleted: analysis.diff.totalDeletions,
          totalIssues: reviewResult.summary.total,
          criticalCount: reviewResult.summary.critical,
          majorCount: reviewResult.summary.major,
          minorCount: reviewResult.summary.minor,
          suggestionCount: reviewResult.summary.suggestion,
          status: 'processing',
          startedAt: new Date(),
          processingTimeMs: reviewResult.processingTimeMs,
        }, reviewResult.comments);

        taskLogger.debug('开始发布评论');
        const publishResult = await commentPublisher.publish(reviewResult, commit);

        taskLogger.info('评论发布完成', {
          success: publishResult.success,
          publishedComments: publishResult.publishedComments,
          failedComments: publishResult.failedComments,
          summaryPublished: publishResult.summaryPublished,
          fallbackUsed: publishResult.fallbackUsed,
        });

        const finalStatus = publishResult.success ? 'completed' : 'failed';
        const errorMessage = publishResult.success ? undefined : publishResult.errors?.join('; ');
        
        await reviewRepository.updateReviewStatus(reviewResult.id, finalStatus, errorMessage);

        taskLogger.info('审查任务处理完成', {
          reviewId: reviewResult.id,
          totalProcessingTime: Date.now() - task.createdAt.getTime(),
        });

      } catch (error) {
        const errorInfo = this.extractErrorInfo(error);
        taskLogger.error('审查任务处理失败', errorInfo);
        throw error;
      }
    };
  }

  /**
   * 构建提交信息
   */
  private async buildCommitInfo(task: ReviewTask): Promise<CommitInfo> {
    // 这里应该从 Git API 获取完整的提交信息
    // 为了简化，我们先构建一个基本的提交信息对象
    return {
      hash: task.commitHash,
      branch: task.branch,
      repository: task.repository,
      author: {
        name: 'Unknown', // 实际应该从 Git API 获取
        email: 'unknown@example.com',
      },
      message: 'Commit message', // 实际应该从 Git API 获取
      timestamp: task.createdAt,
      url: `https://github.com/${task.repository}/commit/${task.commitHash}`,
    };
  }

  /**
   * 检查依赖服务
   */
  /**
   * 检查依赖服务健康状态
   */
  private async checkDependencies(): Promise<void> {
    this.processLogger.info('检查依赖服务健康状态');

    const isProduction = process.env.NODE_ENV === 'production';
    const checks = [
      { 
        name: 'Redis', 
        check: () => RedisClient.healthCheck(),
        required: isProduction // 生产环境必需，开发环境可选
      },
      // 可以添加更多依赖检查，如数据库、AI 服务等
    ];

    for (const { name, check, required = true } of checks) {
      try {
        const isHealthy = await check();
        
        if (isHealthy) {
          this.processLogger.info(`${name} 健康检查通过`);
          continue;
        }

        // 健康检查失败的处理
        if (required) {
          throw new Error(`${name} 健康检查失败`);
        }
        
        this.processLogger.warn(`${name} 健康检查失败，但在开发环境中继续运行`);
      } catch (error) {
        const errorInfo = this.extractErrorInfo(error);
        this.processLogger.error(`${name} 健康检查失败`, errorInfo);
        
        if (required) {
          throw new Error(`依赖服务 ${name} 不可用`);
        }
        
        this.processLogger.warn(`依赖服务 ${name} 不可用，但在开发环境中继续运行`);
      }
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.worker.on('started', () => {
      this.processLogger.info('Worker 已启动');
    });

    this.worker.on('stopped', () => {
      this.processLogger.info('Worker 已停止');
    });

    this.worker.on('stopping', () => {
      this.processLogger.info('Worker 正在停止');
    });

    this.worker.on('taskStarted', (task) => {
      this.processLogger.debug('任务开始处理', {
        taskId: task.id,
        commitHash: task.commitHash,
      });
    });

    this.worker.on('taskCompleted', (task, result) => {
      this.processLogger.info('任务处理完成', {
        taskId: task.id,
        commitHash: task.commitHash,
      });
    });

    this.worker.on('taskFailed', (task, error) => {
      this.processLogger.error('任务处理失败', {
        taskId: task.id,
        commitHash: task.commitHash,
        error: error.message,
      });
    });

    this.worker.on('taskTimeout', (task) => {
      this.processLogger.error('任务执行超时', {
        taskId: task.id,
        commitHash: task.commitHash,
        timeout: this.config.taskTimeout,
      });
    });

    this.worker.on('error', (error) => {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('Worker 错误', errorInfo);
    });

    this.worker.on('paused', () => {
      this.processLogger.warn('Worker 因错误率过高而暂停');
    });

    this.worker.on('healthCheck', (stats) => {
      this.processLogger.debug('Worker 健康检查', stats);
    });
  }

  /**
   * 设置进程信号处理
   */
  private setupSignalHandlers(): void {
    // 优雅关闭信号
    process.on('SIGTERM', () => {
      this.processLogger.info('收到 SIGTERM 信号');
      this.shutdown(0);
    });

    process.on('SIGINT', () => {
      this.processLogger.info('收到 SIGINT 信号');
      this.shutdown(0);
    });

    // 错误处理
    process.on('uncaughtException', (error) => {
      this.processLogger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack,
      });
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const errorInfo = this.extractErrorInfo(reason);
      this.processLogger.error('未处理的 Promise 拒绝', errorInfo);
    });

    // 内存警告
    process.on('warning', (warning) => {
      this.processLogger.warn('进程警告', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      });
    });
  }

  /**
   * 启动监控
   */
  private startMonitoring(): void {
    if (this.config.enableMetrics) {
      this.metricsInterval = setInterval(() => {
        this.logMetrics();
      }, CONSTANTS.METRICS_INTERVAL_MS);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * 停止监控
   */
  private stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * 记录指标
   */
  private logMetrics(): void {
    const stats = this.worker.getStats();
    const memUsage = process.memoryUsage();

    this.processLogger.info('Worker 指标', {
      worker: {
        status: stats.status,
        activeTasks: stats.activeTasks,
        totalProcessed: stats.totalProcessed,
        totalSucceeded: stats.totalSucceeded,
        totalFailed: stats.totalFailed,
        averageProcessingTime: Math.round(stats.averageProcessingTime),
        uptime: Math.round(stats.uptime / 1000),
        successRate: stats.totalProcessed > 0 
          ? ((stats.totalSucceeded / stats.totalProcessed) * 100).toFixed(2) + '%'
          : '0%',
      },
      process: {
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
        },
        cpu: process.cpuUsage(),
      },
    });
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const stats = this.worker.getStats();
      
      // 检查 Worker 状态
      if (stats.status === 'error') {
        this.processLogger.error('Worker 处于错误状态');
        return;
      }

      // 检查内存使用
      const memUsage = process.memoryUsage();
      const memUsageMB = memUsage.rss / 1024 / 1024;
      
      if (memUsageMB > CONSTANTS.MEMORY_LIMIT_MB) {
        this.processLogger.warn('内存使用过高', {
          memoryUsage: Math.round(memUsageMB) + 'MB',
          limit: `${CONSTANTS.MEMORY_LIMIT_MB}MB`,
        });
      }

      // 检查错误率
      if (stats.totalProcessed > CONSTANTS.MIN_PROCESSED_FOR_ERROR_CHECK) {
        const errorRate = stats.totalFailed / stats.totalProcessed;
        if (errorRate > CONSTANTS.ERROR_RATE_THRESHOLD) {
          this.processLogger.error('错误率过高', {
            errorRate: (errorRate * 100).toFixed(2) + '%',
            totalProcessed: stats.totalProcessed,
            totalFailed: stats.totalFailed,
          });
        }
      }

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('健康检查失败', errorInfo);
    }
  }

  /**
   * 保持进程运行
   */
  private keepAlive(): void {
    const keepAliveInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(keepAliveInterval);
      }
    }, CONSTANTS.KEEP_ALIVE_INTERVAL_MS);
  }
}

/**
 * 主函数
 */
/**
 * 主函数：启动 Worker 进程
 */
async function main(): Promise<void> {
  try {
    console.log('开始启动 Worker 进程...');
    
    const workerProcess = new WorkerProcess();
    console.log('WorkerProcess 实例创建成功');
    
    await workerProcess.start();
    console.log('Worker 进程启动完成');
  } catch (error) {
    const errorInfo = error instanceof Error 
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
    
    console.error('Worker 进程启动失败:', errorInfo);
    logger.error('Worker 进程启动失败', errorInfo);
    process.exit(1);
  }
}

/**
 * 设置全局异常处理器
 */
function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    logger.error('未捕获的异常', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
    logger.error('未处理的 Promise 拒绝', { reason: String(reason), promise });
    process.exit(1);
  });
}

// 设置全局异常处理
setupGlobalErrorHandlers();

// 如果直接运行此脚本，则启动 Worker 进程
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { WorkerProcess };