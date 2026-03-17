import { logger } from '@/lib/utils/logger';
import { GitClient } from '@/lib/git/client';
import { withRetry } from '@/lib/utils/retry';
import type { ReviewResult, ReviewComment, ReviewSummary } from '@/types/review';
import type { CommitInfo, CommentPublishResult } from '@/types/git';
import { v4 as uuidv4 } from 'uuid';

/**
 * 评论发布器错误类
 */
export class CommentPublisherError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'CommentPublisherError';
  }
}

/**
 * 发布结果
 */
export interface PublishResult {
  success: boolean;
  publishedComments: number;
  failedComments: number;
  summaryPublished: boolean;
  fallbackUsed: boolean;
  errors: string[];
}

/**
 * 邮件通知配置
 */
interface EmailNotificationConfig {
  enabled: boolean;
  recipients: string[];
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

/**
 * 评论发布器服务
 * 负责将审查结果发布到 Git 仓库，支持行内评论和摘要评论
 * 在发布失败时提供邮件备用方案
 */
export class CommentPublisher {
  private readonly gitClient: GitClient;
  private readonly emailConfig: EmailNotificationConfig;
  private readonly publishLogger = logger.child({ service: 'CommentPublisher' });
  private readonly maxRetries = 2;
  private readonly concurrencyLimit = 5;
  
  // 不可重试的错误模式
  private readonly nonRetryablePatterns = [
    'unauthorized',
    'forbidden',
    'not found',
    'validation failed',
  ];

  constructor(
    gitClient: GitClient,
    emailConfig?: EmailNotificationConfig
  ) {
    this.gitClient = gitClient;
    this.emailConfig = emailConfig || this.getDefaultEmailConfig();
    
    this.publishLogger.info('Comment Publisher initialized', {
      emailEnabled: this.emailConfig.enabled,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * 发布审查结果
   * 包括所有行内评论和摘要评论
   */
  async publish(
    review: ReviewResult,
    commit: CommitInfo
  ): Promise<PublishResult> {
    const publishId = uuidv4();
    
    this.publishLogger.info('Starting review publication', {
      publishId,
      reviewId: review.id,
      commitHash: commit.hash,
      commentsCount: review.comments.length,
      repository: commit.repository,
    });

    const result: PublishResult = {
      success: false,
      publishedComments: 0,
      failedComments: 0,
      summaryPublished: false,
      fallbackUsed: false,
      errors: [],
    };

    try {
      // 1. 发布行内评论
      if (review.comments.length > 0) {
        const commentResults = await this.publishAllComments(
          review.comments,
          commit,
          publishId
        );
        
        result.publishedComments = commentResults.published;
        result.failedComments = commentResults.failed;
        result.errors.push(...commentResults.errors);
      }

      // 2. 发布摘要评论
      try {
        await this.publishSummary(review.summary, commit);
        result.summaryPublished = true;
        
        this.publishLogger.info('Summary published successfully', {
          publishId,
          commitHash: commit.hash,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`摘要发布失败: ${errorMsg}`);
        
        this.publishLogger.error('Failed to publish summary', {
          publishId,
          commitHash: commit.hash,
          error: errorMsg,
        });
      }

      // 3. 判断是否需要使用备用方案
      const hasFailures = result.failedComments > 0 || !result.summaryPublished;
      
      if (hasFailures && this.emailConfig.enabled) {
        this.publishLogger.warn('Publishing had failures, using email fallback', {
          publishId,
          failedComments: result.failedComments,
          summaryPublished: result.summaryPublished,
        });

        await this.sendEmailFallback(review, commit, result);
        result.fallbackUsed = true;
      }

      // 4. 确定整体成功状态
      result.success = result.summaryPublished || result.publishedComments > 0;

      this.publishLogger.info('Review publication completed', {
        publishId,
        reviewId: review.id,
        commitHash: commit.hash,
        success: result.success,
        publishedComments: result.publishedComments,
        failedComments: result.failedComments,
        summaryPublished: result.summaryPublished,
        fallbackUsed: result.fallbackUsed,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.publishLogger.error('Review publication failed', {
        publishId,
        reviewId: review.id,
        commitHash: commit.hash,
        error: errorMsg,
      });

      // 尝试邮件备用方案
      if (this.emailConfig.enabled) {
        try {
          await this.sendEmailFallback(review, commit, result);
          result.fallbackUsed = true;
        } catch (fallbackError) {
          this.publishLogger.error('Email fallback also failed', {
            publishId,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
        }
      }

      throw new CommentPublisherError(
        `发布审查结果失败: ${errorMsg}`,
        'PUBLISH_FAILED',
        false
      );
    }
  }

  /**
   * 发布单条行内评论
   */
  async publishLineComment(
    comment: ReviewComment,
    commit: CommitInfo
  ): Promise<CommentPublishResult> {
    this.publishLogger.debug('Publishing line comment', {
      commitHash: commit.hash,
      file: comment.file,
      line: comment.line,
      severity: comment.severity,
    });

    return withRetry(
      async () => {
        const result = await this.gitClient.postComment(
          commit.hash,
          commit.repository,
          comment
        );

        if (result.success) {
          this.publishLogger.debug('Line comment published successfully', {
            commitHash: commit.hash,
            commentId: result.commentId,
            file: comment.file,
            line: comment.line,
          });
        }

        return result;
      },
      this.getRetryOptions(),
      `publishLineComment(${comment.file}:${comment.line})`
    );
  }

  /**
   * 发布摘要评论
   */
  async publishSummary(
    summary: ReviewSummary,
    commit: CommitInfo
  ): Promise<CommentPublishResult> {
    this.publishLogger.debug('Publishing summary comment', {
      commitHash: commit.hash,
      totalIssues: summary.total,
    });

    const summaryText = this.formatSummary(summary, commit);

    return withRetry(
      async () => {
        const result = await this.gitClient.postSummaryComment(
          commit.hash,
          commit.repository,
          summaryText
        );

        if (result.success) {
          this.publishLogger.info('Summary comment published successfully', {
            commitHash: commit.hash,
            commentId: result.commentId,
          });
        }

        return result;
      },
      this.getRetryOptions(),
      `publishSummary(${commit.hash})`
    );
  }

  /**
   * 发布所有评论
   */
  private async publishAllComments(
    comments: ReviewComment[],
    commit: CommitInfo,
    publishId: string
  ): Promise<{ published: number; failed: number; errors: string[] }> {
    const result = {
      published: 0,
      failed: 0,
      errors: [] as string[],
    };

    this.publishLogger.info('Publishing all comments', {
      publishId,
      commentsCount: comments.length,
      commitHash: commit.hash,
    });

    // 并发发布评论，但限制并发数
    const chunks = this.chunkArray(comments, this.concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(async (comment) => {
        try {
          const publishResult = await this.publishLineComment(comment, commit);
          
          if (publishResult.success) {
            result.published++;
          } else {
            result.failed++;
            result.errors.push(
              `评论发布失败 (${comment.file}:${comment.line}): ${publishResult.error}`
            );
          }
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(
            `评论发布异常 (${comment.file}:${comment.line}): ${errorMsg}`
          );
          
          this.publishLogger.error('Failed to publish comment', {
            publishId,
            file: comment.file,
            line: comment.line,
            error: errorMsg,
          });
        }
      });

      await Promise.all(promises);
    }

    this.publishLogger.info('All comments processed', {
      publishId,
      published: result.published,
      failed: result.failed,
    });

    return result;
  }

  /**
   * 格式化摘要评论
   */
  private formatSummary(summary: ReviewSummary, commit: CommitInfo): string {
    const { total, critical, major, minor, suggestion } = summary;

    let summaryText = '## 🤖 AI 代码审查报告\n\n';
    summaryText += `**提交:** ${commit.hash.substring(0, 7)}\n`;
    summaryText += `**作者:** ${commit.author.name} (${commit.author.email})\n`;
    summaryText += `**分支:** ${commit.branch}\n\n`;

    summaryText += '### 📊 问题统计\n\n';
    summaryText += `- **总计:** ${total} 个问题\n`;
    
    if (critical > 0) {
      summaryText += `- 🚨 **严重 (Critical):** ${critical}\n`;
    }
    if (major > 0) {
      summaryText += `- ⚠️ **重要 (Major):** ${major}\n`;
    }
    if (minor > 0) {
      summaryText += `- 💡 **次要 (Minor):** ${minor}\n`;
    }
    if (suggestion > 0) {
      summaryText += `- 💭 **建议 (Suggestion):** ${suggestion}\n`;
    }

    summaryText += '\n';

    if (total === 0) {
      summaryText += '### ✅ 审查结果\n\n';
      summaryText += '未发现明显问题，代码质量良好！\n\n';
    } else {
      summaryText += '### 📝 详细评论\n\n';
      summaryText += '请查看上方的行内评论以了解具体问题和改进建议。\n\n';
      
      if (critical > 0) {
        summaryText += '⚠️ **注意:** 发现严重问题，建议优先处理。\n\n';
      }
    }

    summaryText += '---\n';
    summaryText += '*由 CodeReview 自动生成*';

    return summaryText;
  }

  /**
   * 发送邮件备用方案
   */
  private async sendEmailFallback(
    review: ReviewResult,
    commit: CommitInfo,
    publishResult: PublishResult
  ): Promise<void> {
    if (!this.emailConfig.enabled) {
      this.publishLogger.debug('Email fallback disabled');
      return;
    }

    this.publishLogger.info('Sending email fallback notification', {
      reviewId: review.id,
      commitHash: commit.hash,
      recipients: this.emailConfig.recipients,
    });

    const emailContent = this.formatEmailContent(review, commit, publishResult);

    try {
      await this.sendEmail(
        this.emailConfig.recipients,
        `[AI 代码审查] ${commit.repository} - ${commit.hash.substring(0, 7)}`,
        emailContent
      );

      this.publishLogger.info('Email fallback sent successfully', {
        reviewId: review.id,
        commitHash: commit.hash,
        recipientsCount: this.emailConfig.recipients.length,
      });
    } catch (error) {
      this.publishLogger.error('Failed to send email fallback', {
        reviewId: review.id,
        commitHash: commit.hash,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new CommentPublisherError(
        '邮件备用方案发送失败',
        'EMAIL_FALLBACK_FAILED',
        false
      );
    }
  }

  /**
   * 格式化邮件内容
   */
  private formatEmailContent(
    review: ReviewResult,
    commit: CommitInfo,
    publishResult: PublishResult
  ): string {
    const sections = [
      this.buildEmailHeader(commit),
      this.buildPublishStatus(publishResult),
      this.buildReviewSummary(review),
      this.buildDetailedComments(review),
      this.buildEmailFooter(review),
    ];

    return sections.join('\n');
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
- **提交链接:** ${commit.url}
`;
  }

  /**
   * 构建发布状态
   */
  private buildPublishStatus(publishResult: PublishResult): string {
    let content = `## 发布状态

- **发布成功:** ${publishResult.success ? '是' : '否'}
- **已发布评论:** ${publishResult.publishedComments}
- **失败评论:** ${publishResult.failedComments}
- **摘要已发布:** ${publishResult.summaryPublished ? '是' : '否'}
`;

    if (publishResult.errors.length > 0) {
      content += '\n## 发布错误\n\n';
      publishResult.errors.forEach((error, index) => {
        content += `${index + 1}. ${error}\n`;
      });
    }

    return content;
  }

  /**
   * 构建审查摘要
   */
  private buildReviewSummary(review: ReviewResult): string {
    return `## 审查摘要

- **总问题数:** ${review.summary.total}
- **严重问题:** ${review.summary.critical}
- **重要问题:** ${review.summary.major}
- **次要问题:** ${review.summary.minor}
- **建议:** ${review.summary.suggestion}
`;
  }

  /**
   * 构建详细评论
   */
  private buildDetailedComments(review: ReviewResult): string {
    if (review.comments.length === 0) {
      return '';
    }

    const commentsBySeverity = {
      critical: { title: '🚨 严重问题', comments: review.comments.filter(c => c.severity === 'critical') },
      major: { title: '⚠️ 重要问题', comments: review.comments.filter(c => c.severity === 'major') },
      minor: { title: '💡 次要问题', comments: review.comments.filter(c => c.severity === 'minor') },
      suggestion: { title: '💭 建议', comments: review.comments.filter(c => c.severity === 'suggestion') },
    };

    let content = '## 详细评论\n';

    Object.values(commentsBySeverity).forEach(({ title, comments }) => {
      if (comments.length > 0) {
        content += `\n### ${title}\n\n`;
        comments.forEach((comment, index) => {
          content += this.formatCommentForEmail(comment, index + 1);
        });
      }
    });

    return content;
  }

  /**
   * 构建邮件尾部
   */
  private buildEmailFooter(review: ReviewResult): string {
    return `
---
*此邮件由 CodeReview 自动发送，因为无法将评论直接发布到代码仓库。*
*审查 ID: ${review.id}*
*处理时间: ${review.processingTimeMs}ms*
`;
  }

  /**
   * 格式化单条评论用于邮件
   */
  private formatCommentForEmail(comment: ReviewComment, index: number): string {
    let formatted = `#### ${index}. ${comment.file}:${comment.line}\n\n`;
    formatted += `**类别:** ${comment.category}\n\n`;
    formatted += `**问题:** ${comment.message}\n\n`;
    
    if (comment.suggestion) {
      formatted += `**建议修改:**\n${comment.suggestion}\n\n`;
    }
    
    if (comment.codeSnippet) {
      formatted += `**相关代码:**\n\`\`\`\n${comment.codeSnippet}\n\`\`\`\n\n`;
    }
    
    return formatted;
  }

  /**
   * 发送邮件
   * TODO: 实现实际的邮件发送逻辑（使用 nodemailer 或其他邮件服务 API）
   */
  private async sendEmail(
    recipients: string[],
    subject: string,
    content: string
  ): Promise<void> {
    this.publishLogger.debug('Sending email', {
      recipients,
      subject,
      contentLength: content.length,
    });

    if (!this.emailConfig.smtpHost) {
      this.publishLogger.warn('SMTP not configured, email not sent', {
        recipients,
        subject,
      });
      return;
    }

    // 实际的邮件发送逻辑应该在这里实现
    // 例如：const transporter = nodemailer.createTransport({...});
    //      await transporter.sendMail({...});
    
    this.publishLogger.info('Email sent (simulated)', {
      recipients,
      subject,
    });
  }

  /**
   * 获取重试配置
   */
  private getRetryOptions() {
    return {
      maxRetries: this.maxRetries,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true,
      shouldRetry: (error: Error, attempt: number) => {
        const errorMessage = error.message.toLowerCase();

        if (this.nonRetryablePatterns.some(pattern => errorMessage.includes(pattern))) {
          this.publishLogger.warn('Non-retryable error, skipping retry', {
            error: error.message,
            attempt,
          });
          return false;
        }

        return attempt < this.maxRetries;
      },
    };
  }

  /**
   * 将数组分块
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 获取默认邮件配置
   */
  private getDefaultEmailConfig(): EmailNotificationConfig {
    return {
      enabled: process.env.EMAIL_NOTIFICATION_ENABLED === 'true',
      recipients: process.env.EMAIL_RECIPIENTS?.split(',') || [],
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.publishLogger.debug('Comment Publisher health check');
      return true;
    } catch (error) {
      this.publishLogger.error('Comment Publisher health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * 创建评论发布器实例
 */
export function createCommentPublisher(
  gitClient: GitClient,
  emailConfig?: EmailNotificationConfig
): CommentPublisher {
  return new CommentPublisher(gitClient, emailConfig);
}
