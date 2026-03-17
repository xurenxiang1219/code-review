#!/usr/bin/env tsx

/**
 * 密钥轮换定时任务
 * 
 * 功能：
 * - 定期检查密钥是否需要轮换
 * - 自动执行密钥轮换操作
 * - 验证加密数据完整性
 * - 发送轮换结果通知
 * 
 * 使用方式：
 * - 开发环境：tsx scripts/key-rotation-scheduler.ts
 * - 生产环境：node dist/scripts/key-rotation-scheduler.js
 * - 定时任务：添加到 crontab 中每天执行一次
 */

import { keyRotationService } from '../lib/services/key-rotation';
import { logger } from '../lib/utils/logger';
import { notificationService } from '../lib/services/notification';

/**
 * 密钥轮换调度器配置
 */
interface SchedulerConfig {
  /** 是否启用自动轮换 */
  autoRotationEnabled: boolean;
  /** 检查间隔（毫秒） */
  checkInterval: number;
  /** 是否发送通知 */
  notificationEnabled: boolean;
  /** 通知收件人 */
  notificationRecipients: string[];
}

/**
 * 密钥轮换调度器
 */
class KeyRotationScheduler {
  private config: SchedulerConfig;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.config = {
      autoRotationEnabled: process.env.AUTO_KEY_ROTATION_ENABLED === 'true',
      checkInterval: parseInt(process.env.KEY_ROTATION_CHECK_INTERVAL || '3600000'), // 默认1小时
      notificationEnabled: process.env.KEY_ROTATION_NOTIFICATION_ENABLED === 'true',
      notificationRecipients: (process.env.KEY_ROTATION_NOTIFICATION_RECIPIENTS || '')
        .split(',')
        .filter(email => email.trim()),
    };
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('密钥轮换调度器已在运行中');
      return;
    }

    this.isRunning = true;
    logger.info('启动密钥轮换调度器', {
      autoRotationEnabled: this.config.autoRotationEnabled,
      checkInterval: this.config.checkInterval,
      notificationEnabled: this.config.notificationEnabled,
    });

    // 立即执行一次检查
    await this.performCheck();

    // 设置定时检查
    this.intervalId = setInterval(async () => {
      try {
        await this.performCheck();
      } catch (error) {
        logger.error('定时检查密钥轮换失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.checkInterval);

    // 监听进程退出信号
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('密钥轮换调度器已停止');
    process.exit(0);
  }

  /**
   * 执行密钥轮换检查
   */
  private async performCheck(): Promise<void> {
    logger.info('开始检查密钥轮换状态');

    const checkResults = {
      config: await this.checkAndRotateKey('config'),
      database: await this.checkAndRotateKey('database'),
      log: await this.checkAndRotateKey('log'),
    };

    // 验证加密数据完整性
    const validationResult = await this.validateEncryptedData();

    // 发送通知（如果启用）
    if (this.config.notificationEnabled) {
      await this.sendNotification(checkResults, validationResult);
    }

    logger.info('密钥轮换检查完成', {
      configRotated: checkResults.config.rotated,
      databaseRotated: checkResults.database.rotated,
      logRotated: checkResults.log.rotated,
      validationPassed: validationResult.valid,
    });
  }

  /**
   * 检查并轮换指定类型的密钥
   * @param keyType - 密钥类型
   * @returns 检查结果
   */
  private async checkAndRotateKey(keyType: 'config' | 'database' | 'log'): Promise<{
    needed: boolean;
    rotated: boolean;
    error?: string;
    affectedRecords?: number;
  }> {
    try {
      const needed = await keyRotationService.shouldRotateKey(keyType);
      
      if (!needed) {
        logger.debug(`${keyType} 密钥无需轮换`);
        return { needed: false, rotated: false };
      }

      logger.info(`${keyType} 密钥需要轮换`);

      if (!this.config.autoRotationEnabled) {
        logger.warn(`自动轮换已禁用，跳过 ${keyType} 密钥轮换`);
        return { needed: true, rotated: false };
      }

      // 执行密钥轮换
      let rotationResult;
      switch (keyType) {
        case 'config':
          rotationResult = await keyRotationService.rotateConfigKeys();
          break;
        case 'database':
          rotationResult = await keyRotationService.rotateDatabaseKeys();
          break;
        default:
          logger.warn(`暂不支持 ${keyType} 类型的自动轮换`);
          return { needed: true, rotated: false };
      }

      logger.info(`${keyType} 密钥轮换完成`, {
        rotationId: rotationResult.id,
        affectedRecords: rotationResult.affectedRecords,
      });

      return {
        needed: true,
        rotated: true,
        affectedRecords: rotationResult.affectedRecords,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`${keyType} 密钥轮换失败`, { error: errorMessage });
      
      return {
        needed: true,
        rotated: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 验证加密数据完整性
   * @returns 验证结果
   */
  private async validateEncryptedData(): Promise<{
    valid: boolean;
    errorsCount: number;
    errors?: Array<{ type: string; id: string; error: string }>;
  }> {
    try {
      logger.info('开始验证加密数据完整性');
      
      const validationResult = await keyRotationService.validateAllEncryptedData();
      
      if (validationResult.valid) {
        logger.info('加密数据完整性验证通过');
      } else {
        logger.warn('加密数据完整性验证发现问题', {
          errorsCount: validationResult.errors.length,
        });
      }

      return {
        valid: validationResult.valid,
        errorsCount: validationResult.errors.length,
        errors: validationResult.errors,
      };
    } catch (error) {
      logger.error('加密数据完整性验证失败', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        errorsCount: 1,
        errors: [{
          type: 'system',
          id: 'validation',
          error: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }

  /**
   * 发送轮换结果通知
   * @param checkResults - 检查结果
   * @param validationResult - 验证结果
   */
  private async sendNotification(
    checkResults: Record<string, any>,
    validationResult: { valid: boolean; errorsCount: number }
  ): Promise<void> {
    if (this.config.notificationRecipients.length === 0) {
      logger.debug('未配置通知收件人，跳过发送通知');
      return;
    }

    try {
      const hasRotations = Object.values(checkResults).some((result: any) => result.rotated);
      const hasErrors = Object.values(checkResults).some((result: any) => result.error) || 
                       !validationResult.valid;

      if (!hasRotations && !hasErrors) {
        logger.debug('无需发送通知：没有轮换操作且无错误');
        return;
      }

      const subject = hasErrors 
        ? '密钥轮换检查发现问题' 
        : '密钥轮换操作完成';

      const content = this.buildNotificationContent(checkResults, validationResult);

      for (const recipient of this.config.notificationRecipients) {
        await notificationService.sendEmail({
          to: recipient,
          subject,
          content,
          type: hasErrors ? 'alert' : 'info',
        });
      }

      logger.info('密钥轮换通知发送完成', {
        recipientsCount: this.config.notificationRecipients.length,
        hasErrors,
      });
    } catch (error) {
      logger.error('发送密钥轮换通知失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 构建通知内容
   * @param checkResults - 检查结果
   * @param validationResult - 验证结果
   * @returns 通知内容
   */
  private buildNotificationContent(
    checkResults: Record<string, any>,
    validationResult: { valid: boolean; errorsCount: number }
  ): string {
    const lines = [
      '# 密钥轮换检查报告',
      '',
      `**检查时间**: ${new Date().toLocaleString('zh-CN')}`,
      '',
      '## 密钥轮换状态',
    ];

    for (const [keyType, result] of Object.entries(checkResults)) {
      const status = result.error 
        ? '❌ 失败' 
        : result.rotated 
        ? '✅ 已轮换' 
        : result.needed 
        ? '⚠️ 需要轮换（自动轮换已禁用）'
        : '✅ 无需轮换';

      lines.push(`- **${keyType}**: ${status}`);
      
      if (result.affectedRecords) {
        lines.push(`  - 影响记录数: ${result.affectedRecords}`);
      }
      
      if (result.error) {
        lines.push(`  - 错误信息: ${result.error}`);
      }
    }

    lines.push('', '## 数据完整性验证');
    
    if (validationResult.valid) {
      lines.push('✅ 验证通过');
    } else {
      lines.push(`❌ 验证失败 (${validationResult.errorsCount} 个错误)`);
    }

    lines.push('', '---', '此邮件由 CodeReview 自动发送');

    return lines.join('\n');
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    logger.info('密钥轮换调度器启动中...');
    
    const scheduler = new KeyRotationScheduler();
    await scheduler.start();
    
    // 保持进程运行
    process.stdin.resume();
  } catch (error) {
    logger.error('密钥轮换调度器启动失败', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// 如果直接运行此脚本，则启动调度器
if (require.main === module) {
  main().catch(error => {
    console.error('密钥轮换调度器异常退出:', error);
    process.exit(1);
  });
}

export { KeyRotationScheduler };