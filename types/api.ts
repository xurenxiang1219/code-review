/**
 * API 响应基础接口
 */
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T | null;
  timestamp: number;
  requestId?: string;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 错误详情接口
 */
export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Webhook 响应接口
 */
export interface WebhookResponse {
  taskId: string;
  message: string;
  accepted: boolean;
}

/**
 * 服务健康状态
 */
interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}

/**
 * 健康检查响应接口
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
}

/**
 * 审查列表查询参数
 */
export interface ReviewListQuery {
  branch?: string;
  repository?: string;
  author?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * AI 模型配置
 */
interface AIModelConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 轮询配置
 */
interface PollingConfig {
  enabled?: boolean;
  interval?: number;
}

/**
 * 邮件通知配置
 */
interface EmailConfig {
  enabled?: boolean;
  criticalOnly?: boolean;
}

/**
 * 即时消息配置
 */
interface IMConfig {
  enabled?: boolean;
  webhook?: string;
}

/**
 * Git 评论配置
 */
interface GitCommentConfig {
  enabled?: boolean;
  summaryOnly?: boolean;
}

/**
 * 通知配置
 */
interface NotificationConfig {
  email?: EmailConfig;
  im?: IMConfig;
  gitComment?: GitCommentConfig;
}

/**
 * 配置更新请求
 */
export interface ConfigUpdateRequest {
  reviewFocus?: string[];
  fileWhitelist?: string[];
  ignorePatterns?: string[];
  aiModel?: AIModelConfig;
  polling?: PollingConfig;
  notification?: NotificationConfig;
}
/**
 * 问题分布统计
 */
interface IssueDistribution {
  critical: number;
  major: number;
  minor: number;
  suggestion: number;
}

/**
 * 作者统计信息
 */
interface AuthorStats {
  name: string;
  email: string;
  reviewCount: number;
  averageIssues: number;
}

/**
 * 语言统计信息
 */
interface LanguageStats {
  language: string;
  fileCount: number;
  issueCount: number;
}

/**
 * 统计数据响应
 */
export interface StatsResponse {
  totalReviews: number;
  reviewsThisWeek: number;
  averageProcessingTime: number;
  issueDistribution: IssueDistribution;
  topAuthors: AuthorStats[];
  languageStats: LanguageStats[];
}

/**
 * 批量操作请求
 */
export interface BatchOperationRequest {
  action: 'retry' | 'cancel' | 'delete';
  reviewIds: string[];
  reason?: string;
}

/**
 * 批量操作错误
 */
interface BatchOperationError {
  reviewId: string;
  error: string;
}

/**
 * 批量操作响应
 */
export interface BatchOperationResponse {
  success: number;
  failed: number;
  errors: BatchOperationError[];
}

/**
 * 导出请求参数
 */
export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx';
  filters: ReviewListQuery;
  fields?: string[];
}

/**
 * 导出响应
 */
export interface ExportResponse {
  downloadUrl: string;
  expiresAt: Date;
  fileSize: number;
  recordCount: number;
}

/**
 * API 错误响应
 */
export interface ApiErrorResponse extends ApiResponse<{ errors?: ErrorDetail[] } | null> {
  data: {
    errors?: ErrorDetail[];
  } | null;
}

/**
 * 请求上下文
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
}

/**
 * 速率限制配置
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * 认证配置
 */
interface AuthConfig {
  required: boolean;
  roles?: string[];
}

/**
 * 验证配置
 */
interface ValidationConfig {
  body?: any;
  query?: any;
  params?: any;
}

/**
 * 缓存配置
 */
interface CacheConfig {
  ttl: number;
  key?: string;
}

/**
 * API 中间件选项
 */
export interface ApiMiddlewareOptions {
  rateLimit?: RateLimitConfig;
  auth?: AuthConfig;
  validation?: ValidationConfig;
  cache?: CacheConfig;
}