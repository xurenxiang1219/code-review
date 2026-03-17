import { logger } from '@/lib/utils/logger';
import type { ReviewResult, ReviewSummary } from '@/types/review';
import type { CommitInfo } from '@/types/git';
import type { NotificationConfig } from '@/lib/db/repositories/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * 通知服务错误类
 */
export class NotificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

/**
 * 通知结果
 */
export interface NotificationResult {
  success: boolean;
  emailSent: boolean;
  imSent: boolean;
  errors: string[];
}

/**
 * 邮件配置
 */
interface EmailConfig {
  enabled: boolean;
  recipients: string[];
  criticalOnly: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  from?: string;
}

/**
 * 即时消息配置
 */
interface IMConfig {
  enabled: boolean;
  webhook?: string;
  channels: string[];
  type?: 'slack' | 'dingtalk' | 'feishu';
}

/**
 * 通知服务
 * 负责发送审查完成通知，支持邮件和即时消息
 * 根据用户偏好和消息严重程度进行智能路由
 */
export class NotificationService {
  private readonly emailConfig: EmailConfig;
  private readonly imConfig: IMConfig;
  private readonly notificationLogger = logger.child({ service: 'NotificationService' });

  constructor(config: NotificationConfig) {
    this.emailConfig = this.buildEmailConfig(config);
    this.imConfig = this.buildIMConfig(config);

    this.notificationLogger.info('Notification Service initialized', {
      emailEnabled: this.emailConfig.enabled,
      imEnabled: this.imConfig.enabled,
      criticalOnly: this.emailConfig.criticalOnly,
    });
  }

  /**
   * 发送审查完成通知
   */
  async sendReviewNotification(
    review: ReviewResult,
    commit: CommitInfo,
    config: NotificationConfig
  ): Promise<NotificationResult> {
    const notificationId = uuidv4();

    this.notificationLogger.info('Sending review notification', {
      notificationId,
      reviewId: review.id,
      commitHash: commit.hash,
      totalIssues: review.summary.total,
      criticalIssues: review.summary.critical,
    });

    const result: NotificationResult = {
      success: false,
      emailSent: false,
      imSent: false,
      errors: [],
    };

    const hasCriticalIssues = review.summary.critical > 0;
    const shouldNotify = this.shouldSendNotification(config, hasCriticalIssues);

    if (!shouldNotify) {
      this.notificationLogger.debug('Notification skipped based on preferences', {
        notificationId,
        criticalOnly: config.email.criticalOnly,
        hasCriticalIssues,
      });
      result.success = true;
      return result;
    }

    // 发送邮件通知
    if (config.email.enabled) {
      try {
        await this.sendEmailNotification(review, commit, config.email.recipients);
        result.emailSent = true;
        this.notificationLogger.info('Email notification sent', {
          notificationId,
          recipients: config.email.recipients.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`邮件发送失败: ${errorMsg}`);
        this.notificationLogger.error('Failed to send email notification', {
          notificationId,
          error: errorMsg,
        });
      }
    }

    // 发送即时消息通知
    if (config.im.enabled) {
      try {
        await this.sendIMNotification(review, commit, config.im);
        result.imSent = true;
        this.notificationLogger.info('IM notification sent', {
          notificationId,
          channels: config.im.channels.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`即时消息发送失败: ${errorMsg}`);
        this.notificationLogger.error('Failed to send IM notification', {
          notificationId,
          error: errorMsg,
        });
      }
    }

    // Critical 级别问题需要额外通知项目负责人
    if (hasCriticalIssues) {
      await this.sendCriticalAlert(review, commit, config);
    }

    result.success = result.emailSent || result.imSent;

    this.notificationLogger.info('Review notification completed', {
      notificationId,
      success: result.success,
      emailSent: result.emailSent,
      imSent: result.imSent,
      errorsCount: result.errors.length,
    });

    return result;
  }

  /**
   * 发送邮件通知
   */
  private async sendEmailNotification(
    review: ReviewResult,
    commit: CommitInfo,
    recipients: string[]
  ): Promise<void> {
    if (recipients.length === 0) {
      this.notificationLogger.warn('No email recipients configured');
      return;
    }

    const subject = this.buildEmailSubject(review, commit);
    const content = this.buildEmailContent(review, commit);

    this.notificationLogger.debug('Sending email', {
      recipients: recipients.length,
      subject,
    });

    await this.sendEmail(recipients, subject, content);
  }

  /**
   * 发送即时消息通知
   */
  private async sendIMNotification(
    review: ReviewResult,
    commit: CommitInfo,
    imConfig: IMConfig
  ): Promise<void> {
    if (!imConfig.webhook) {
      throw new NotificationError(
        'IM webhook 未配置',
        'IM_WEBHOOK_NOT_CONFIGURED',
        false
      );
    }

    const message = this.buildIMMessage(review, commit);

    this.notificationLogger.debug('Sending IM notification', {
      webhook: imConfig.webhook,
      channels: imConfig.channels,
    });

    await this.sendIMWebhook(imConfig.webhook, message, imConfig.type);
  }

  /**
   * 发送 Critical 级别告警
   */
  private async sendCriticalAlert(
    review: ReviewResult,
    commit: CommitInfo,
    config: NotificationConfig
  ): Promise<void> {
    this.notificationLogger.warn('Critical issues detected, sending alert', {
      reviewId: review.id,
      criticalCount: review.summary.critical,
      commitHash: commit.hash,
    });

    const alertRecipients = this.getCriticalAlertRecipients(config);
    
    if (alertRecipients.length === 0) {
      this.notificationLogger.warn('No critical alert recipients configured');
      return;
    }

    const subject = `🚨 [严重] AI 代码审查发现 ${review.summary.critical} 个严重问题`;
    const content = this.buildCriticalAlertContent(review, commit);

    try {
      await this.sendEmail(alertRecipients, subject, content);
      this.notificationLogger.info('Critical alert sent', {
        recipients: alertRecipients.length,
      });
    } catch (error) {
      this.notificationLogger.error('Failed to send critical alert', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 判断是否应该发送通知
   */
  private shouldSendNotification(
    config: NotificationConfig,
    hasCriticalIssues: boolean
  ): boolean {
    if (config.email.criticalOnly && !hasCriticalIssues) {
      return false;
    }
    return config.email.enabled || config.im.enabled;
  }

  /**
   * 获取 Critical 告警接收人
   */
  private getCriticalAlertRecipients(config: NotificationConfig): string[] {
    const projectLeaderEmail = process.env.PROJECT_LEADER_EMAIL;
    const recipients = [...config.email.recipients];

    if (projectLeaderEmail && !recipients.includes(projectLeaderEmail)) {
      recipients.push(projectLeaderEmail);
    }

    return recipients;
  }

  /**
   * 构建邮件主题
   */
  private buildEmailSubject(review: ReviewResult, commit: CommitInfo): string {
    const { total, critical } = review.summary;
    const emoji = critical > 0 ? '🚨' : total > 0 ? '⚠️' : '✅';
    const status = critical > 0 ? '严重问题' : total > 0 ? '发现问题' : '通过审查';

    return `${emoji} [AI 代码审查] ${commit.repository} - ${status} (${total} 个问题)`;
  }

  /**
   * 构建邮件内容
   */
  private buildEmailContent(review: ReviewResult, commit: CommitInfo): string {
    const sections = [
      this.buildEmailHeader(commit),
      this.buildReviewSummarySection(review.summary),
      this.buildIssueBreakdownSection(review),
      this.buildEmailFooter(review, commit),
    ];

    return sections.join('\n\n');
  }

  /**
   * 构建邮件头部
   */
  private buildEmailHeader(commit: CommitInfo): string {
    return `# AI 代码审查报告

## 提交信息

- **提交哈希:** ${commit.hash}
- **作者:** ${commit.author.name} (${commit.author.email})
- **分支:** ${commit.branch}
- **仓库:** ${commit.repository}
- **提交信息:** ${commit.message}
- **提交时间:** ${commit.timestamp.toISOString()}
- **查看提交:** ${commit.url}`;
  }

  /**
   * 构建审查摘要部分
   */
  private buildReviewSummarySection(summary: ReviewSummary): string {
    const { total, critical, major, minor, suggestion } = summary;

    let content = '## 📊 审查摘要\n\n';
    content += `- **总问题数:** ${total}\n`;

    if (critical > 0) {
      content += `- 🚨 **严重问题:** ${critical}\n`;
    }
    if (major > 0) {
      content += `- ⚠️ **重要问题:** ${major}\n`;
    }
    if (minor > 0) {
      content += `- 💡 **次要问题:** ${minor}\n`;
    }
    if (suggestion > 0) {
      content += `- 💭 **建议:** ${suggestion}\n`;
    }

    if (total === 0) {
      content += '\n✅ **未发现明显问题，代码质量良好！**';
    }

    return content;
  }

  /**
   * 构建问题详情部分
   */
  private buildIssueBreakdownSection(review: ReviewResult): string {
    if (review.comments.length === 0) {
      return '';
    }

    const criticalComments = review.comments.filter(c => c.severity === 'critical');
    const majorComments = review.comments.filter(c => c.severity === 'major');

    let content = '## 📝 主要问题\n\n';

    if (criticalComments.length > 0) {
      content += '### 🚨 严重问题\n\n';
      criticalComments.slice(0, 3).forEach((comment, index) => {
        content += `${index + 1}. **${comment.file}:${comment.line}** - ${comment.message}\n`;
      });
      if (criticalComments.length > 3) {
        content += `\n*还有 ${criticalComments.length - 3} 个严重问题，请查看完整报告*\n`;
      }
      content += '\n';
    }

    if (majorComments.length > 0) {
      content += '### ⚠️ 重要问题\n\n';
      majorComments.slice(0, 3).forEach((comment, index) => {
        content += `${index + 1}. **${comment.file}:${comment.line}** - ${comment.message}\n`;
      });
      if (majorComments.length > 3) {
        content += `\n*还有 ${majorComments.length - 3} 个重要问题，请查看完整报告*\n`;
      }
    }

    return content;
  }

  /**
   * 构建邮件尾部
   */
  private buildEmailFooter(review: ReviewResult, commit: CommitInfo): string {
    return `---

**审查 ID:** ${review.id}  
**处理时间:** ${review.processingTimeMs}ms  
**查看详情:** ${commit.url}

*此邮件由 CodeReview 自动发送*`;
  }

  /**
   * 构建 Critical 告警内容
   */
  private buildCriticalAlertContent(review: ReviewResult, commit: CommitInfo): string {
    const criticalComments = review.comments.filter(c => c.severity === 'critical');

    let content = `# 🚨 严重问题告警

检测到 **${review.summary.critical}** 个严重问题，需要立即处理！

## 提交信息

- **提交哈希:** ${commit.hash}
- **作者:** ${commit.author.name} (${commit.author.email})
- **分支:** ${commit.branch}
- **仓库:** ${commit.repository}

## 严重问题列表

`;

    criticalComments.forEach((comment, index) => {
      content += `### ${index + 1}. ${comment.file}:${comment.line}\n\n`;
      content += `**类别:** ${comment.category}\n\n`;
      content += `**问题:** ${comment.message}\n\n`;
      if (comment.suggestion) {
        content += `**建议:** ${comment.suggestion}\n\n`;
      }
    });

    content += `---

**立即查看:** ${commit.url}

*此告警由 CodeReview 自动发送*`;

    return content;
  }

  /**
   * 构建即时消息内容
   */
  private buildIMMessage(review: ReviewResult, commit: CommitInfo): any {
    const { total, critical, major } = review.summary;
    const emoji = critical > 0 ? '🚨' : total > 0 ? '⚠️' : '✅';
    const status = critical > 0 ? '发现严重问题' : total > 0 ? '发现问题' : '通过审查';

    return {
      msgtype: 'markdown',
      markdown: {
        title: `AI 代码审查 - ${status}`,
        text: `## ${emoji} AI 代码审查报告

**仓库:** ${commit.repository}  
**分支:** ${commit.branch}  
**作者:** ${commit.author.name}  
**提交:** ${commit.hash.substring(0, 7)}

### 审查结果

- 总问题数: **${total}**
- 严重问题: **${critical}**
- 重要问题: **${major}**

${critical > 0 ? '⚠️ **请立即处理严重问题！**' : ''}

[查看详情](${commit.url})`,
      },
    };
  }

  /**
   * 发送邮件
   */
  private async sendEmail(
    recipients: string[],
    subject: string,
    content: string
  ): Promise<void> {
    if (!this.emailConfig.smtpHost) {
      this.notificationLogger.warn('SMTP not configured, email not sent');
      return;
    }

    this.notificationLogger.debug('Sending email via SMTP', {
      recipients: recipients.length,
      smtpHost: this.emailConfig.smtpHost,
    });

    // TODO: 实现实际的邮件发送逻辑
    // 使用 nodemailer 或其他邮件服务
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail({...});

    this.notificationLogger.info('Email sent (simulated)', {
      recipients,
      subject,
    });
  }

  /**
   * 发送即时消息 Webhook
   */
  private async sendIMWebhook(
    webhook: string,
    message: any,
    type: string = 'slack'
  ): Promise<void> {
    this.notificationLogger.debug('Sending IM webhook', {
      webhook,
      type,
    });

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new NotificationError(
          `IM webhook 请求失败: ${response.status} ${response.statusText}`,
          'IM_WEBHOOK_FAILED',
          true
        );
      }

      this.notificationLogger.debug('IM webhook sent successfully');
    } catch (error) {
      if (error instanceof NotificationError) {
        throw error;
      }

      throw new NotificationError(
        `发送 IM webhook 失败: ${error instanceof Error ? error.message : String(error)}`,
        'IM_WEBHOOK_ERROR',
        true
      );
    }
  }

  /**
   * 构建邮件配置
   */
  private buildEmailConfig(config: NotificationConfig): EmailConfig {
    return {
      enabled: config.email.enabled,
      recipients: config.email.recipients,
      criticalOnly: config.email.criticalOnly,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM || 'noreply@ai-review.com',
    };
  }

  /**
   * 构建即时消息配置
   */
  private buildIMConfig(config: NotificationConfig): IMConfig {
    return {
      enabled: config.im.enabled,
      webhook: config.im.webhook,
      channels: config.im.channels,
      type: (process.env.IM_TYPE as 'slack' | 'dingtalk' | 'feishu') || 'slack',
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.notificationLogger.debug('Notification Service health check');
      return true;
    } catch (error) {
      this.notificationLogger.error('Notification Service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * 创建通知服务实例
 */
export function createNotificationService(config: NotificationConfig): NotificationService {
  return new NotificationService(config);
}
