import { NextRequest } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { 
  WebhookSignatureVerifier, 
  GitHubWebhookVerifier, 
  GitLabWebhookVerifier,
  SignatureVerificationResult 
} from '@/lib/utils/crypto';
import { WebhookPayload, CommitInfo } from '@/types/git';
import { reviewQueue } from '@/lib/queue/review-queue';
import { commitTrackerRepository } from '@/lib/db/repositories/commit-tracker';

/**
 * Webhook 响应接口
 */
export interface WebhookResponse {
  success: boolean;
  message: string;
  taskIds?: string[];
  error?: string;
  code?: string;
}

/**
 * Webhook 提供商类型
 */
export type WebhookProvider = 'github' | 'gitlab' | 'generic';

/**
 * Webhook Listener 配置
 */
interface WebhookListenerConfig {
  provider: WebhookProvider;
  secret: string;
  targetBranch: string;
  autoEnqueue: boolean;
}

/**
 * Webhook Listener 实现类
 * 
 * 负责接收和验证 Git 仓库的 webhook 事件，提取提交信息并加入审查队列
 * 
 * 功能：
 * - 验证 webhook 签名，确保请求来源合法
 * - 解析不同 Git 平台的 webhook payload
 * - 提取提交信息并过滤目标分支
 * - 检查提交是否已处理，避免重复审查
 * - 将新提交加入审查队列
 */
export class WebhookListener {
  private config: WebhookListenerConfig;
  private verifier: WebhookSignatureVerifier | GitHubWebhookVerifier | GitLabWebhookVerifier;
  private listenerLogger: typeof logger;

  constructor(config: WebhookListenerConfig) {
    this.config = config;
    this.listenerLogger = logger.child({ service: 'WebhookListener', provider: config.provider });

    // 根据提供商创建对应的签名验证器
    switch (config.provider) {
      case 'github':
        this.verifier = new GitHubWebhookVerifier(config.secret);
        break;
      case 'gitlab':
        this.verifier = new GitLabWebhookVerifier(config.secret);
        break;
      default:
        this.verifier = new WebhookSignatureVerifier(config.secret);
    }

    this.listenerLogger.info('Webhook Listener initialized', {
      provider: config.provider,
      targetBranch: config.targetBranch,
      autoEnqueue: config.autoEnqueue,
    });
  }

  /**
   * 处理 webhook 请求
   * 
   * @param request - HTTP 请求对象
   * @returns 处理结果
   */
  async handleWebhook(request: NextRequest): Promise<WebhookResponse> {
    const requestId = logger.generateRequestId();
    const startTime = Date.now();

    this.listenerLogger.info('Webhook request received', {
      requestId,
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
    });

    try {
      // 1. 读取请求体
      const rawBody = await request.text();
      if (!rawBody) {
        this.listenerLogger.warn('Empty webhook payload', { requestId });
        return {
          success: false,
          message: 'Webhook payload 为空',
          code: 'EMPTY_PAYLOAD',
        };
      }

      // 2. 验证签名
      const signature = this.extractSignature(request);
      if (!signature) {
        this.listenerLogger.security('Missing webhook signature', { requestId });
        return {
          success: false,
          message: '缺少 webhook 签名',
          code: 'MISSING_SIGNATURE',
        };
      }

      const verificationResult = this.verifySignature(rawBody, signature);
      if (!verificationResult.valid) {
        this.listenerLogger.security('Webhook signature verification failed', {
          requestId,
          error: verificationResult.error,
        });
        return {
          success: false,
          message: verificationResult.error || 'Webhook 签名验证失败',
          code: 'INVALID_SIGNATURE',
        };
      }

      // 3. 解析 payload
      let payload: WebhookPayload;
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        this.listenerLogger.error('Failed to parse webhook payload', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          message: 'Webhook payload 解析失败',
          code: 'INVALID_JSON',
        };
      }

      // 4. 提取提交信息
      const commits = this.extractCommits(payload);
      if (commits.length === 0) {
        this.listenerLogger.info('No commits to process', {
          requestId,
          ref: payload.ref,
          targetBranch: this.config.targetBranch,
        });
        return {
          success: true,
          message: '没有需要处理的提交',
          taskIds: [],
        };
      }

      this.listenerLogger.info('Commits extracted from webhook', {
        requestId,
        commitsCount: commits.length,
        commits: commits.map(c => ({
          hash: c.hash,
          branch: c.branch,
          author: c.author.email,
        })),
      });

      // 5. 处理提交（检查去重并加入队列）
      const taskIds: string[] = [];
      const skippedCommits: string[] = [];

      for (const commit of commits) {
        try {
          // 检查提交是否已处理
          const isTracked = await commitTrackerRepository.isTracked(commit.hash);
          if (isTracked) {
            this.listenerLogger.info('Commit already processed, skipping', {
              requestId,
              commitHash: commit.hash,
            });
            skippedCommits.push(commit.hash);
            continue;
          }

          // 加入审查队列
          if (this.config.autoEnqueue) {
            const taskId = await reviewQueue.enqueue(commit);
            taskIds.push(taskId);

            this.listenerLogger.info('Commit enqueued for review', {
              requestId,
              commitHash: commit.hash,
              taskId,
            });
          }
        } catch (error) {
          this.listenerLogger.error('Failed to process commit', {
            requestId,
            commitHash: commit.hash,
            error: error instanceof Error ? error.message : String(error),
          });
          // 继续处理其他提交
        }
      }

      const duration = Date.now() - startTime;
      this.listenerLogger.performance('Webhook processing completed', duration, {
        requestId,
        totalCommits: commits.length,
        enqueuedCommits: taskIds.length,
        skippedCommits: skippedCommits.length,
      });

      return {
        success: true,
        message: `成功处理 ${commits.length} 个提交，${taskIds.length} 个已加入队列，${skippedCommits.length} 个已跳过`,
        taskIds,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.listenerLogger.error('Webhook processing failed', {
        requestId,
        duration,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
      });

      return {
        success: false,
        message: '处理 webhook 请求时发生错误',
        error: error instanceof Error ? error.message : String(error),
        code: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * 验证 webhook 签名
   * 
   * @param payload - 请求体内容
   * @param signature - 签名字符串
   * @returns 验证结果
   */
  verifySignature(payload: string, signature: string): SignatureVerificationResult {
    try {
      if (this.verifier instanceof GitHubWebhookVerifier) {
        return this.verifier.verifyGitHubSignature(payload, signature);
      } else if (this.verifier instanceof GitLabWebhookVerifier) {
        return this.verifier.verifyGitLabToken(signature);
      } else {
        return this.verifier.verify(payload, signature);
      }
    } catch (error) {
      this.listenerLogger.error('Signature verification error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        valid: false,
        error: '签名验证过程中发生错误',
      };
    }
  }

  /**
   * 提取提交信息
   * 
   * @param payload - webhook payload
   * @returns 提交信息列表
   */
  extractCommits(payload: WebhookPayload): CommitInfo[] {
    try {
      // 检查是否是目标分支
      const branch = this.extractBranchName(payload.ref);
      if (branch !== this.config.targetBranch) {
        this.listenerLogger.debug('Branch does not match target branch', {
          branch,
          targetBranch: this.config.targetBranch,
        });
        return [];
      }

      // 提取提交信息
      const commits: CommitInfo[] = [];
      
      if (!payload.commits || !Array.isArray(payload.commits)) {
        this.listenerLogger.warn('No commits found in payload', {
          hasCommits: !!payload.commits,
          isArray: Array.isArray(payload.commits),
        });
        return [];
      }

      for (const commit of payload.commits) {
        try {
          const commitInfo: CommitInfo = {
            hash: commit.id,
            branch,
            repository: payload.repository.url,
            author: {
              name: commit.author.name,
              email: commit.author.email,
            },
            message: commit.message,
            timestamp: new Date(commit.timestamp),
            url: commit.url,
          };

          commits.push(commitInfo);
        } catch (error) {
          this.listenerLogger.warn('Failed to parse commit', {
            commitId: commit.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // 继续处理其他提交
        }
      }

      return commits;
    } catch (error) {
      this.listenerLogger.error('Failed to extract commits', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 从 ref 中提取分支名
   * 
   * @param ref - Git ref（如 refs/heads/main）
   * @returns 分支名
   */
  private extractBranchName(ref: string): string {
    // GitHub/GitLab 格式: refs/heads/branch-name
    if (ref.startsWith('refs/heads/')) {
      return ref.replace('refs/heads/', '');
    }
    
    // 其他格式直接返回
    return ref;
  }

  /**
   * 从请求中提取签名
   * 
   * @param request - HTTP 请求对象
   * @returns 签名字符串或 null
   */
  private extractSignature(request: NextRequest): string | null {
    const headers = request.headers;

    switch (this.config.provider) {
      case 'github':
        // GitHub 使用 X-Hub-Signature-256
        return headers.get('x-hub-signature-256') || headers.get('x-hub-signature');
      
      case 'gitlab':
        // GitLab 使用 X-Gitlab-Token
        return headers.get('x-gitlab-token');
      
      default:
        // 通用签名头
        return headers.get('x-webhook-signature') || headers.get('x-signature');
    }
  }

  /**
   * 清理请求头用于日志记录（移除敏感信息）
   * 
   * @param headers - 请求头
   * @returns 清理后的请求头
   */
  private sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'x-hub-signature', 'x-hub-signature-256', 'x-gitlab-token'];

    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }
}

/**
 * 创建 Webhook Listener 实例的工厂函数
 * 
 * @param provider - Webhook 提供商
 * @param secret - Webhook 密钥
 * @param targetBranch - 目标分支
 * @param autoEnqueue - 是否自动加入队列
 * @returns Webhook Listener 实例
 */
export function createWebhookListener(
  provider: WebhookProvider,
  secret: string,
  targetBranch: string = 'uat',
  autoEnqueue: boolean = true
): WebhookListener {
  return new WebhookListener({
    provider,
    secret,
    targetBranch,
    autoEnqueue,
  });
}

/**
 * 从环境变量创建 Webhook Listener
 * 
 * @returns Webhook Listener 实例
 */
export function createWebhookListenerFromEnv(): WebhookListener {
  const provider = (process.env.GIT_PROVIDER || 'github') as WebhookProvider;
  const secret = process.env.GIT_WEBHOOK_SECRET;
  const targetBranch = process.env.GIT_TARGET_BRANCH || 'uat';
  const autoEnqueue = process.env.WEBHOOK_AUTO_ENQUEUE !== 'false';

  if (!secret) {
    throw new Error('GIT_WEBHOOK_SECRET environment variable is required');
  }

  return createWebhookListener(provider, secret, targetBranch, autoEnqueue);
}
