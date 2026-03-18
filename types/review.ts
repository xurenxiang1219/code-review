/**
 * 审查评论严重程度
 */
export type ReviewSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

/**
 * 审查状态
 */
export type ReviewStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 队列任务状态
 */
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * 触发来源
 */
export type TriggerSource = 'webhook' | 'polling';

/**
 * 通知类型
 */
export type NotificationType = 'email' | 'im' | 'git_comment';

/**
 * 通知状态
 */
export type NotificationStatus = 'pending' | 'sent' | 'failed';

/**
 * 审查评论
 */
export interface ReviewComment {
  id: string;
  file: string;
  line: number;
  severity: ReviewSeverity;
  category: string;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
}

/**
 * 审查摘要
 */
export interface ReviewSummary {
  total: number;
  critical: number;
  major: number;
  minor: number;
  suggestion: number;
}

/**
 * 审查结果
 */
export interface ReviewResult {
  id: string;
  commitHash: string;
  comments: ReviewComment[];
  summary: ReviewSummary;
  processingTimeMs: number;
  status: ReviewStatus;
  error?: string;
}

/**
 * 审查记录（数据库实体）
 */
export interface ReviewRecord {
  id: string;
  commitHash: string;
  branch: string;
  repository: string;
  authorName: string;
  authorEmail: string;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalIssues: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  suggestionCount: number;
  status: ReviewStatus;
  startedAt: Date;
  completedAt?: Date;
  processingTimeMs?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 审查评论记录（数据库实体）
 */
export interface ReviewCommentRecord {
  id: string;
  reviewId: string;
  filePath: string;
  lineNumber: number;
  severity: ReviewSeverity;
  category: string;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
  published: boolean;
  publishedAt?: Date;
  createdAt: Date;
}

/**
 * AI 模型配置
 */
interface AIModelConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout?: number;
}

/**
 * 轮询配置
 */
interface PollingConfig {
  enabled: boolean;
  interval: number;
}

/**
 * 通知配置
 */
interface NotificationConfig {
  email: {
    enabled: boolean;
    criticalOnly: boolean;
  };
  im: {
    enabled: boolean;
    webhook: string;
  };
  gitComment: {
    enabled: boolean;
    summaryOnly: boolean;
  };
}

/**
 * 审查配置
 */
export interface ReviewConfig {
  id: string;
  repository: string;
  reviewFocus: string[];
  fileWhitelist: string[];
  ignorePatterns: string[];
  aiModel: AIModelConfig;
  promptTemplate?: string;
  polling: PollingConfig;
  notification: NotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 审查任务
 */
export interface ReviewTask {
  id: string;
  commitHash: string;
  branch: string;
  repository: string;
  authorName?: string;
  authorEmail?: string;
  commitMessage?: string;
  commitUrl?: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  status: TaskStatus;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 提交追踪记录
 */
export interface CommitTracker {
  id: string;
  commitHash: string;
  branch: string;
  repository: string;
  triggerSource: TriggerSource;
  processedAt: Date;
  reviewId?: string;
  createdAt: Date;
}

/**
 * 通知记录
 */
export interface NotificationRecord {
  id: string;
  reviewId: string;
  recipientEmail: string;
  notificationType: NotificationType;
  status: NotificationStatus;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
}

/**
 * 审查查询参数
 */
export interface ReviewQueryParams {
  branch?: string;
  repository?: string;
  author?: string;
  status?: ReviewStatus;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}
