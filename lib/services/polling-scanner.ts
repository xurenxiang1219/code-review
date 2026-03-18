import { logger } from '@/lib/utils/logger';
import { GitClient } from '@/lib/git/client';
import { commitTrackerRepository } from '@/lib/db/repositories/commit-tracker';
import { reviewQueue } from '@/lib/queue/review-queue';

/**
 * 轮询扫描器配置
 */
export interface PollingScannerConfig {
  repository: string;           // 仓库路径 (owner/repo)
  branch: string;               // 目标分支
  interval: number;             // 扫描间隔（秒）
  enabled: boolean;             // 是否启用
  autoEnqueue: boolean;         // 是否自动加入队列
  maxCommitsPerScan: number;    // 每次扫描最多处理的提交数
}

/**
 * 扫描结果
 */
export interface ScanResult {
  scannedAt: Date;
  totalCommits: number;
  newCommits: number;
  processedCommits: number;
  skippedCommits: number;
  errors: number;
  taskIds: string[];
}

/**
 * Polling Scanner 实现类
 * 
 * 负责定期主动扫描 Git 仓库的新提交，并将未处理的提交加入审查队列
 * 
 * 功能：
 * - 定时扫描指定分支的新提交
 * - 检查提交是否已处理，避免重复审查
 * - 将新提交加入审查队列
 * - 支持配置扫描间隔（30-3600秒）
 * - 错误处理和自动重试
 */
export class PollingScanner {
  private config: PollingScannerConfig;
  private scannerLogger: typeof logger;
  private timerId: NodeJS.Timeout | null = null;
  private isScanning = false;
  private gitClient: GitClient;
  private lastScanTime: Date | null = null;
  private scanCount = 0;
  private currentScanLogId: string | null = null; // 当前扫描的日志ID

  constructor(config: PollingScannerConfig, gitClientInstance?: GitClient) {
    // 验证扫描间隔
    if (config.interval < 30 || config.interval > 3600) {
      throw new Error('扫描间隔必须在 30-3600 秒之间');
    }

    if (!gitClientInstance) {
      throw new Error('GitClient instance is required');
    }

    this.config = config;
    this.gitClient = gitClientInstance;
    this.scannerLogger = logger.child({ 
      service: 'PollingScanner',
      repository: config.repository,
      branch: config.branch,
    });

    this.scannerLogger.info('Polling Scanner 已初始化', {
      interval: config.interval,
      enabled: config.enabled,
      autoEnqueue: config.autoEnqueue,
      maxCommitsPerScan: config.maxCommitsPerScan,
    });
  }

  /**
   * 启动轮询扫描
   * @param interval - 扫描间隔（秒），如果不提供则使用配置中的值
   */
  start(interval?: number): void {
    if (this.timerId) {
      this.scannerLogger.warn('Polling Scanner 已在运行中');
      return;
    }

    if (!this.config.enabled) {
      this.scannerLogger.warn('Polling Scanner 未启用，无法启动');
      return;
    }

    const scanInterval = interval || this.config.interval;

    // 验证间隔范围
    if (scanInterval < 30 || scanInterval > 3600) {
      throw new Error('扫描间隔必须在 30-3600 秒之间');
    }

    this.scannerLogger.info('启动 Polling Scanner', {
      interval: scanInterval,
      intervalMs: scanInterval * 1000,
    });

    // 立即执行一次扫描
    this.scan().catch(error => {
      this.scannerLogger.error('初始扫描失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // 设置定时器
    this.timerId = setInterval(() => {
      this.scan().catch(error => {
        this.scannerLogger.error('定时扫描失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, scanInterval * 1000);

    this.scannerLogger.info('Polling Scanner 已启动');
  }

  /**
   * 停止轮询扫描
   */
  stop(): void {
    if (!this.timerId) {
      this.scannerLogger.warn('Polling Scanner 未在运行');
      return;
    }

    clearInterval(this.timerId);
    this.timerId = null;

    this.scannerLogger.info('Polling Scanner 已停止', {
      totalScans: this.scanCount,
      lastScanTime: this.lastScanTime,
    });
  }

  /**
   * 执行一次扫描
   * @returns 扫描结果
   */
  async scan(): Promise<ScanResult> {
    if (this.isScanning) {
      this.scannerLogger.warn('扫描正在进行中，跳过本次扫描');
      return this.createEmptyResult();
    }

    this.isScanning = true;
    const scanStartTime = Date.now();
    const scannedAt = new Date();

    this.scanCount++;
    this.scannerLogger.info('开始扫描', {
      scanNumber: this.scanCount,
      repository: this.config.repository,
      branch: this.config.branch,
    });

    const result: ScanResult = {
      scannedAt,
      totalCommits: 0,
      newCommits: 0,
      processedCommits: 0,
      skippedCommits: 0,
      errors: 0,
      taskIds: [],
    };

    // 记录扫描开始日志
    await this.logScanStart(scannedAt);

    try {
      // 1. 获取最后处理的提交
      const lastProcessedHash = await commitTrackerRepository.getLastProcessed(
        this.config.branch,
        this.config.repository
      );

      this.scannerLogger.debug('最后处理的提交', {
        lastProcessedHash: lastProcessedHash || 'none',
      });

      // 2. 获取分支的最新提交列表
      const since = this.lastScanTime || await this.calculateSinceTime();
      const commits = await this.gitClient.getCommits(
        this.config.repository,
        this.config.branch,
        since,
        this.config.maxCommitsPerScan
      );

      result.totalCommits = commits.length;

      if (commits.length === 0) {
        this.scannerLogger.debug('未发现新提交');
        this.lastScanTime = scannedAt;
        
        // 记录成功日志
        await this.logScanSuccess(scannedAt, Date.now() - scanStartTime, result);
        return result;
      }

      this.scannerLogger.info('发现提交', {
        count: commits.length,
        since: since?.toISOString(),
      });

      // 3. 过滤和处理提交
      for (const commit of commits) {
        try {
          // 检查提交是否已处理
          const isTracked = await this.isProcessed(commit.hash);
          
          if (isTracked) {
            this.scannerLogger.debug('提交已处理，跳过', {
              commitHash: commit.hash,
            });
            result.skippedCommits++;
            continue;
          }

          result.newCommits++;

          // 加入审查队列
          if (this.config.autoEnqueue) {
            const taskId = await reviewQueue.enqueue(commit);
            result.taskIds.push(taskId);
            result.processedCommits++;

            this.scannerLogger.info('新提交已加入队列', {
              commitHash: commit.hash,
              taskId,
              author: commit.author.email,
              message: commit.message.substring(0, 50),
            });
          } else {
            this.scannerLogger.debug('自动入队已禁用，跳过提交', {
              commitHash: commit.hash,
            });
          }
        } catch (error) {
          result.errors++;
          this.scannerLogger.error('处理提交失败', {
            commitHash: commit.hash,
            error: error instanceof Error ? error.message : String(error),
          });
          // 继续处理其他提交
        }
      }

      // 4. 更新最后扫描时间
      this.lastScanTime = scannedAt;

      const duration = Date.now() - scanStartTime;
      this.scannerLogger.performance('扫描完成', duration, {
        scanNumber: this.scanCount,
        totalCommits: result.totalCommits,
        newCommits: result.newCommits,
        processedCommits: result.processedCommits,
        skippedCommits: result.skippedCommits,
        errors: result.errors,
      });

      // 记录成功日志
      await this.logScanSuccess(scannedAt, duration, result);
      return result;

    } catch (error) {
      const duration = Date.now() - scanStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.scannerLogger.error('扫描失败', {
        scanNumber: this.scanCount,
        duration,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
      });

      result.errors++;
      
      // 记录失败日志
      await this.logScanError(scannedAt, duration, errorMessage, error);
      return result;

    } finally {
      this.isScanning = false;
    }
  }

  /**
   * 检查提交是否已处理
   * @param commitHash - 提交哈希
   * @returns 是否已处理
   */
  async isProcessed(commitHash: string): Promise<boolean> {
    try {
      return await commitTrackerRepository.isTracked(commitHash);
    } catch (error) {
      this.scannerLogger.error('检查提交状态失败', {
        commitHash,
        error: error instanceof Error ? error.message : String(error),
      });
      // 发生错误时，保守地返回 false，允许重新处理
      return false;
    }
  }

  /**
   * 获取扫描器状态
   * @returns 扫描器状态信息
   */
  getStatus(): {
    isRunning: boolean;
    isScanning: boolean;
    scanCount: number;
    lastScanTime: Date | null;
    config: PollingScannerConfig;
  } {
    return {
      isRunning: this.timerId !== null,
      isScanning: this.isScanning,
      scanCount: this.scanCount,
      lastScanTime: this.lastScanTime,
      config: this.config,
    };
  }

  /**
   * 更新配置
   * @param config - 新的配置（部分更新）
   */
  updateConfig(config: Partial<PollingScannerConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // 验证新的扫描间隔
    if (config.interval !== undefined) {
      if (config.interval < 30 || config.interval > 3600) {
        this.config.interval = oldConfig.interval;
        throw new Error('扫描间隔必须在 30-3600 秒之间');
      }
    }

    this.scannerLogger.info('配置已更新', {
      oldConfig,
      newConfig: this.config,
    });

    // 如果扫描器正在运行且间隔改变，需要重启
    if (this.timerId && config.interval !== undefined && config.interval !== oldConfig.interval) {
      this.scannerLogger.info('扫描间隔已改变，重启扫描器');
      this.stop();
      this.start();
    }

    // 如果禁用了扫描器，停止运行
    if (config.enabled === false && this.timerId) {
      this.scannerLogger.info('扫描器已禁用，停止运行');
      this.stop();
    }
  }

  /**
   * 计算起始时间（用于获取提交列表）
   * @returns 起始时间
   */
  private async calculateSinceTime(): Promise<Date> {
    const DAYS_7_IN_MS = 7 * 24 * 60 * 60 * 1000;
    
    try {
      // 优先使用上次成功扫描的时间，确保不遗漏任何提交
      const { pollingLogsRepository } = await import('@/lib/db/repositories/polling-logs');
      const lastSuccessLog = await pollingLogsRepository.getLastSuccessfulScan(
        this.config.repository,
        this.config.branch
      );
      
      if (lastSuccessLog?.completedAt) {
        this.scannerLogger.debug('使用上次成功扫描时间作为起始点', {
          lastScanTime: lastSuccessLog.completedAt,
        });
        return new Date(lastSuccessLog.completedAt);
      }
      
      // 没有成功扫描记录时的默认处理
      return this.createDefaultSinceTime(DAYS_7_IN_MS);
    } catch (error) {
      this.scannerLogger.warn('获取上次扫描时间失败，使用默认时间范围', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.createDefaultSinceTime(DAYS_7_IN_MS);
    }
  }

  /**
   * 创建默认的起始时间
   * @param daysInMs 天数对应的毫秒数
   * @returns 默认起始时间
   */
  private createDefaultSinceTime(daysInMs: number): Date {
    const defaultSince = new Date(Date.now() - daysInMs);
    
    this.scannerLogger.debug('使用默认时间范围', {
      defaultSince: defaultSince.toISOString(),
    });
    
    return defaultSince;
  }

  /**
   * 创建空的扫描结果
   * @returns 空的扫描结果
   */
  private createEmptyResult(): ScanResult {
    return {
      scannedAt: new Date(),
      totalCommits: 0,
      newCommits: 0,
      processedCommits: 0,
      skippedCommits: 0,
      errors: 0,
      taskIds: [],
    };
  }

  /**
   * 记录扫描开始日志
   * @param startedAt 开始时间
   */
  private async logScanStart(startedAt: Date): Promise<void> {
    try {
      const { pollingLogsRepository } = await import('@/lib/db/repositories/polling-logs');
      const log = await pollingLogsRepository.createLog({
        repository: this.config.repository,
        branch: this.config.branch,
        scanType: 'scheduled',
        status: 'running',
        message: `开始扫描 ${this.config.repository}/${this.config.branch}`,
        startedAt,
      });
      
      this.currentScanLogId = log?.id ?? null;
    } catch (error) {
      this.scannerLogger.error('记录扫描开始日志失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 记录扫描成功日志
   * @param startedAt 开始时间
   * @param durationMs 持续时间
   * @param result 扫描结果
   */
  private async logScanSuccess(startedAt: Date, durationMs: number, result: ScanResult): Promise<void> {
    try {
      const { pollingLogsRepository } = await import('@/lib/db/repositories/polling-logs');
      
      if (this.currentScanLogId) {
        // 更新现有日志记录
        await pollingLogsRepository.updateLog(this.currentScanLogId, {
          status: 'success',
          message: `扫描完成，发现 ${result.totalCommits} 个提交，处理 ${result.processedCommits} 个新提交`,
          durationMs,
          commitsFound: result.totalCommits,
          commitsProcessed: result.processedCommits,
          completedAt: new Date(),
        });
        this.currentScanLogId = null;
      } else {
        // 如果没有现有记录，创建新记录（兜底逻辑）
        await pollingLogsRepository.createLog({
          repository: this.config.repository,
          branch: this.config.branch,
          scanType: 'scheduled',
          status: 'success',
          message: `扫描完成，发现 ${result.totalCommits} 个提交，处理 ${result.processedCommits} 个新提交`,
          durationMs,
          commitsFound: result.totalCommits,
          commitsProcessed: result.processedCommits,
          startedAt,
          completedAt: new Date(),
        });
      }
    } catch (error) {
      this.scannerLogger.error('记录扫描成功日志失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 记录扫描失败日志
   * @param startedAt 开始时间
   * @param durationMs 持续时间
   * @param errorMessage 错误消息
   * @param error 错误对象
   */
  private async logScanError(startedAt: Date, durationMs: number, errorMessage: string, error: unknown): Promise<void> {
    try {
      const { pollingLogsRepository } = await import('@/lib/db/repositories/polling-logs');
      const errorDetails = error instanceof Error ? error.stack : String(error);
      
      if (this.currentScanLogId) {
        // 更新现有日志记录
        await pollingLogsRepository.updateLog(this.currentScanLogId, {
          status: 'error',
          message: `扫描失败: ${errorMessage}`,
          errorDetails,
          durationMs,
          commitsFound: 0,
          commitsProcessed: 0,
          completedAt: new Date(),
        });
        this.currentScanLogId = null;
      } else {
        // 如果没有现有记录，创建新记录（兜底逻辑）
        await pollingLogsRepository.createLog({
          repository: this.config.repository,
          branch: this.config.branch,
          scanType: 'scheduled',
          status: 'error',
          message: `扫描失败: ${errorMessage}`,
          errorDetails,
          durationMs,
          commitsFound: 0,
          commitsProcessed: 0,
          startedAt,
          completedAt: new Date(),
        });
      }
    } catch (logError) {
      this.scannerLogger.error('记录扫描失败日志失败', {
        error: logError instanceof Error ? logError.message : String(logError),
      });
    }
  }
}

/**
 * 创建 Polling Scanner 实例的工厂函数
 * @param config - 扫描器配置
 * @param gitClientInstance - Git 客户端实例
 * @returns Polling Scanner 实例
 */
export function createPollingScanner(
  config: PollingScannerConfig,
  gitClientInstance: GitClient
): PollingScanner {
  return new PollingScanner(config, gitClientInstance);
}

/**
 * 从环境变量创建 Polling Scanner
 * @returns Polling Scanner 实例
 */
export function createPollingScannerFromEnv(): PollingScanner {
  // 动态导入 gitClient 以避免模块加载时的环境变量检查
  const { gitClient } = require('@/lib/git/client');
  
  const repository = process.env.GIT_REPOSITORY;
  const branch = process.env.GIT_TARGET_BRANCH || 'uat';
  const interval = parseInt(process.env.POLLING_INTERVAL || '300');
  const enabled = process.env.POLLING_ENABLED === 'true';
  const autoEnqueue = process.env.POLLING_AUTO_ENQUEUE !== 'false';
  const maxCommitsPerScan = parseInt(process.env.POLLING_MAX_COMMITS || '50');

  if (!repository) {
    throw new Error('GIT_REPOSITORY environment variable is required');
  }

  return createPollingScanner({
    repository,
    branch,
    interval,
    enabled,
    autoEnqueue,
    maxCommitsPerScan,
  }, gitClient);
}
