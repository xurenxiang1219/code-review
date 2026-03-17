#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createPollingScannerFromEnv, PollingScanner } from '@/lib/services/polling-scanner';
import { logger } from '@/lib/utils/logger';
import RedisClient from '@/lib/cache/redis-client';

// 加载环境变量
dotenv.config();

/**
 * Polling Scanner 进程配置
 */
interface PollingScannerProcessConfig {
  repositories: string[];
  defaultBranch: string;
  defaultInterval: number;
  gracefulShutdownTimeout: number;
  healthCheckInterval: number;
  logLevel: string;
  enableMetrics: boolean;
  maxConcurrentScanners: number;
}

/**
 * 扫描器实例信息
 */
interface ScannerInstance {
  id: string;
  scanner: PollingScanner;
  repository: string;
  branch: string;
  config: any;
}

/**
 * 从环境变量获取配置
 */
function getPollingScannerConfig(): PollingScannerProcessConfig {
  const repositories = process.env.POLLING_REPOSITORIES?.split(',') || [];
  
  return {
    repositories,
    defaultBranch: process.env.POLLING_DEFAULT_BRANCH || 'uat',
    defaultInterval: parseInt(process.env.POLLING_DEFAULT_INTERVAL || '300'),
    gracefulShutdownTimeout: parseInt(process.env.POLLING_SHUTDOWN_TIMEOUT || '30000'),
    healthCheckInterval: parseInt(process.env.POLLING_HEALTH_CHECK_INTERVAL || '60000'),
    logLevel: process.env.LOG_LEVEL || 'info',
    enableMetrics: process.env.POLLING_ENABLE_METRICS === 'true',
    maxConcurrentScanners: parseInt(process.env.POLLING_MAX_CONCURRENT || '10'),
  };
}

/**
 * 常量定义
 */
const CONSTANTS = {
  METRICS_INTERVAL_MS: 60000,        // 指标记录间隔：1分钟
  KEEP_ALIVE_INTERVAL_MS: 10000,     // 保活检查间隔：10秒
  MEMORY_LIMIT_MB: 1024,             // 内存使用限制：1GB
  ERROR_RATE_THRESHOLD: 0.3,         // 错误率阈值：30%
  MIN_SCANS_FOR_ERROR_CHECK: 5,      // 错误率检查的最小扫描数量
} as const;
/**
 * Polling Scanner 进程类
 * 负责管理多个 Polling Scanner 实例的生命周期
 */
class PollingScannerProcess {
  private config: PollingScannerProcessConfig;
  private processLogger = logger.child({ service: 'PollingScannerProcess' });
  private scanners = new Map<string, ScannerInstance>();
  private isShuttingDown = false;
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.config = getPollingScannerConfig();
    this.processLogger.info('Polling Scanner 进程初始化', {
      pid: process.pid,
      config: this.config,
    });

    // 设置事件监听器
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
   * 启动 Polling Scanner 进程
   */
  async start(): Promise<void> {
    try {
      this.processLogger.info('启动 Polling Scanner 进程', {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      });

      await this.checkDependencies();
      await this.initializeScanners();
      this.startMonitoring();

      this.processLogger.info('Polling Scanner 进程启动成功', {
        pid: process.pid,
        scannersCount: this.scanners.size,
      });

      this.keepAlive();

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('Polling Scanner 进程启动失败', errorInfo);
      await this.shutdown(1);
    }
  }

  /**
   * 优雅关闭 Polling Scanner 进程
   */
  async shutdown(exitCode = 0): Promise<void> {
    if (this.isShuttingDown) {
      this.processLogger.warn('关闭已在进行中');
      return;
    }

    this.isShuttingDown = true;
    
    this.processLogger.info('开始优雅关闭 Polling Scanner 进程', {
      pid: process.pid,
      exitCode,
      scannersCount: this.scanners.size,
    });

    try {
      this.stopMonitoring();
      await this.stopAllScanners();
      await RedisClient.close();

      this.processLogger.info('Polling Scanner 进程已优雅关闭', {
        pid: process.pid,
        exitCode,
      });

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('优雅关闭过程中出错', errorInfo);
    } finally {
      process.exit(exitCode);
    }
  }
  /**
   * 检查依赖服务
   */
  /**
   * 检查依赖服务健康状态
   */
  private async checkDependencies(): Promise<void> {
    this.processLogger.info('检查依赖服务健康状态');

    // 初始化数据库连接
    const { db } = await import('@/lib/db/client');
    await db.initialize();

    const checks = [
      { name: 'Redis', check: () => RedisClient.healthCheck() },
      { name: 'MySQL', check: () => db.healthCheck() },
    ];

    for (const { name, check } of checks) {
      try {
        const isHealthy = await check();
        if (!isHealthy) {
          throw new Error(`${name} 健康检查失败`);
        }
        this.processLogger.info(`${name} 健康检查通过`);
      } catch (error) {
        const errorInfo = this.extractErrorInfo(error);
        this.processLogger.error(`${name} 健康检查失败`, errorInfo);
        throw new Error(`依赖服务 ${name} 不可用`);
      }
    }
  }

  /**
   * 初始化扫描器实例
   */
  /**
   * 初始化轮询扫描器实例
   */
  private async initializeScanners(): Promise<void> {
    this.processLogger.info('初始化扫描器实例');

    try {
      const { configRepository } = await import('@/lib/db/repositories/config');
      const pollingConfigs = await configRepository.getPollingEnabledConfigs();

      if (!Array.isArray(pollingConfigs) || pollingConfigs.length === 0) {
        this.processLogger.warn('数据库中未找到启用轮询的配置');
        return;
      }

      this.processLogger.info('从数据库获取到轮询配置', { 
        count: pollingConfigs.length,
        repositories: pollingConfigs.map(c => c?.repository).filter(Boolean)
      });

      // 为每个配置创建扫描器
      for (const config of pollingConfigs) {
        if (!config?.repository) {
          this.processLogger.warn('跳过无效配置：缺少仓库信息', { config });
          continue;
        }

        try {
          const scannerId = this.generateScannerId(config.repository);
          const scanner = await this.createScannerFromDbConfig(config);
          
          this.scanners.set(scannerId, {
            id: scannerId,
            scanner,
            repository: config.repository,
            branch: config.git?.defaultBranch ?? 'main',
            config: scanner.getStatus().config,
          });

          scanner.start();
          
          this.processLogger.info('扫描器已启动', {
            scannerId,
            repository: config.repository,
            branch: config.git?.defaultBranch ?? 'main',
            interval: config.pollingInterval,
          });

        } catch (error) {
          const errorInfo = this.extractErrorInfo(error);
          this.processLogger.error('创建扫描器失败', {
            repository: config.repository,
            ...errorInfo,
          });
        }
      }

      if (this.scanners.size === 0) {
        throw new Error('未能成功创建任何扫描器实例');
      }

      this.processLogger.info('扫描器初始化完成', {
        totalConfigs: pollingConfigs.length,
        successfulScanners: this.scanners.size,
      });

    } catch (error) {
      const errorInfo = this.extractErrorInfo(error);
      this.processLogger.error('初始化扫描器失败', errorInfo);
      throw error;
    }
  }
  /**
   * 生成扫描器 ID
   */
  private generateScannerId(repository: string): string {
    return repository.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  /**
   * 构建扫描器配置
   */
  private buildScannerConfig(repository: string) {
    const envPrefix = `POLLING_${repository.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_`;
    
    return {
      repository,
      branch: process.env[`${envPrefix}BRANCH`] || this.config.defaultBranch,
      interval: parseInt(process.env[`${envPrefix}INTERVAL`] || String(this.config.defaultInterval)),
      enabled: process.env[`${envPrefix}ENABLED`] !== 'false',
      autoEnqueue: process.env[`${envPrefix}AUTO_ENQUEUE`] !== 'false',
      maxCommitsPerScan: parseInt(process.env[`${envPrefix}MAX_COMMITS`] || '50'),
    };
  }

  /**
   * 从数据库配置创建扫描器实例
   */
  /**
   * 从数据库配置创建轮询扫描器
   * @param config 数据库中的配置对象
   * @returns 轮询扫描器实例
   */
  private async createScannerFromDbConfig(config: any): Promise<PollingScanner> {
    const { createPollingScanner } = await import('@/lib/services/polling-scanner');
    const { createGitClient, createGitClientConfigFromDb } = await import('@/lib/git/client');
    
    // 从数据库配置创建 Git 客户端配置，使用空值合并操作符确保安全访问
    const gitClientConfig = createGitClientConfigFromDb({
      baseUrl: config.git?.baseUrl,
      accessToken: config.git?.accessToken,
      timeout: config.git?.timeout,
    });
    
    const gitClient = createGitClient(gitClientConfig);
    
    // 创建轮询扫描器配置，使用空值合并操作符提供默认值
    const scannerConfig = {
      repository: config.repository,
      branch: config.git?.defaultBranch ?? 'main',
      interval: config.pollingInterval,
      enabled: config.pollingEnabled,
      autoEnqueue: true,
      maxCommitsPerScan: 50,
    };
    
    return createPollingScanner(scannerConfig, gitClient);
  }

  /**
   * 创建扫描器实例（向后兼容）
   */
  private createScanner(config: any): PollingScanner {
    const { createPollingScanner } = require('@/lib/services/polling-scanner');
    const { createGitClient } = require('@/lib/git/client');
    const gitClient = createGitClient();
    return createPollingScanner(config, gitClient);
  }

  /**
   * 停止所有扫描器
   */
  private async stopAllScanners(): Promise<void> {
    this.processLogger.info('停止所有扫描器', {
      count: this.scanners.size,
    });

    const stopPromises = Array.from(this.scanners.values()).map(async (instance) => {
      try {
        instance.scanner.stop();
        this.processLogger.debug('扫描器已停止', {
          scannerId: instance.id,
          repository: instance.repository,
        });
      } catch (error) {
        const errorInfo = this.extractErrorInfo(error);
        this.processLogger.error('停止扫描器失败', {
          scannerId: instance.id,
          ...errorInfo,
        });
      }
    });

    await Promise.allSettled(stopPromises);
    this.scanners.clear();
    
    this.processLogger.info('所有扫描器已停止');
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

    process.on('unhandledRejection', (reason) => {
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
    const memUsage = process.memoryUsage();
    const scannerStats = Array.from(this.scanners.values()).map(instance => {
      const status = instance.scanner.getStatus();
      return {
        id: instance.id,
        repository: instance.repository,
        branch: instance.branch,
        isRunning: status.isRunning,
        isScanning: status.isScanning,
        scanCount: status.scanCount,
        lastScanTime: status.lastScanTime,
      };
    });

    this.processLogger.info('Polling Scanner 指标', {
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
      scanners: {
        total: this.scanners.size,
        running: scannerStats.filter(s => s.isRunning).length,
        scanning: scannerStats.filter(s => s.isScanning).length,
        details: scannerStats,
      },
    });
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 检查内存使用
      const memUsage = process.memoryUsage();
      const memUsageMB = memUsage.rss / 1024 / 1024;
      
      if (memUsageMB > CONSTANTS.MEMORY_LIMIT_MB) {
        this.processLogger.warn('内存使用过高', {
          memoryUsage: Math.round(memUsageMB) + 'MB',
          limit: `${CONSTANTS.MEMORY_LIMIT_MB}MB`,
        });
      }

      // 检查扫描器状态
      let healthyScanners = 0;
      for (const [scannerId, instance] of this.scanners) {
        const status = instance.scanner.getStatus();
        if (status.isRunning) {
          healthyScanners++;
        } else {
          this.processLogger.warn('扫描器未运行', {
            scannerId,
            repository: instance.repository,
          });
        }
      }

      if (healthyScanners === 0 && this.scanners.size > 0) {
        this.processLogger.error('所有扫描器都已停止运行');
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
async function main(): Promise<void> {
  try {
    const scannerProcess = new PollingScannerProcess();
    await scannerProcess.start();
  } catch (error) {
    const errorInfo = error instanceof Error 
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
    
    logger.error('Polling Scanner 进程启动失败', errorInfo);
    process.exit(1);
  }
}

// 如果直接运行此脚本，则启动 Polling Scanner 进程
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { PollingScannerProcess };