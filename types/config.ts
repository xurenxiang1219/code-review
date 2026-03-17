/**
 * 数据库配置
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  acquireTimeout: number;
  timeout: number;
  reconnect: boolean;
  charset: string;
}

/**
 * Redis 配置
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  lazyConnect: boolean;
  maxRetriesPerRequest: number;
  retryStrategy?: (times: number) => number | void | null;
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
  logDir: string;
  maxFiles: number;
  maxSize: string;
}

/**
 * Git 配置
 */
export interface GitConfig {
  repositoryUrl: string;
  accessToken: string;
  webhookSecret: string;
  targetBranch: string;
  apiBaseUrl?: string;
  timeout: number;
  retryAttempts: number;
}

/**
 * 轮询配置
 */
export interface PollingConfig {
  enabled: boolean;
  interval: number; // 秒
  maxCommitsPerScan: number;
  branches: string[];
}

/**
 * SMTP 配置
 */
interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

/**
 * 邮件模板配置
 */
interface EmailTemplates {
  subject: string;
  body: string;
}

/**
 * 邮件通知配置
 */
interface EmailNotificationConfig {
  enabled: boolean;
  smtp: SMTPConfig;
  from: string;
  templates: EmailTemplates;
  criticalOnly: boolean;
}

/**
 * 即时消息通知配置
 */
interface IMNotificationConfig {
  enabled: boolean;
  webhook: string;
  channel?: string;
  mentionUsers?: string[];
}

/**
 * Git 评论通知配置
 */
interface GitCommentNotificationConfig {
  enabled: boolean;
  summaryOnly: boolean;
  includePositiveFeedback: boolean;
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  email: EmailNotificationConfig;
  im: IMNotificationConfig;
  gitComment: GitCommentNotificationConfig;
}

/**
 * Redis 默认任务选项
 */
interface RedisJobOptions {
  removeOnComplete: number;
  removeOnFail: number;
}

/**
 * Redis 队列配置
 */
interface RedisQueueConfig {
  keyPrefix: string;
  defaultJobOptions: RedisJobOptions;
}

/**
 * 队列配置
 */
export interface QueueConfig {
  maxConcurrentJobs: number;
  defaultJobTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  cleanupInterval: number;
  redis: RedisQueueConfig;
}

/**
 * API 速率限制配置
 */
interface APIRateLimit {
  windowMs: number;
  maxRequests: number;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  jwtSecret: string;
  apiRateLimit: APIRateLimit;
  webhookSignatureValidation: boolean;
  allowedOrigins: string[];
  encryptionKey: string;
}

/**
 * CORS 配置
 */
interface CORSConfig {
  enabled: boolean;
  origins: string[];
}

/**
 * 应用配置
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  baseUrl: string;
  cors: CORSConfig;
  compression: boolean;
  trustProxy: boolean;
}

/**
 * 审查引擎配置
 */
export interface ReviewEngineConfig {
  maxConcurrentReviews: number;
  reviewTimeout: number;
  maxDiffLines: number;
  maxFileSize: number;
  supportedLanguages: string[];
  skipPatterns: string[];
  binaryFileExtensions: string[];
}

/**
 * 系统配置（所有配置的聚合）
 */
export interface SystemConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  logger: LoggerConfig;
  git: GitConfig;
  ai: import('./ai').AIModelConfig;
  polling: PollingConfig;
  notification: NotificationConfig;
  queue: QueueConfig;
  security: SecurityConfig;
  reviewEngine: ReviewEngineConfig;
}

/**
 * 配置验证错误
 */
interface ConfigValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationError[];
}

/**
 * 环境变量映射
 */
export interface EnvironmentVariables {
  // 数据库
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_CONNECTION_LIMIT?: string;
  DB_ACQUIRE_TIMEOUT?: string;
  DB_TIMEOUT?: string;

  // Redis
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;
  REDIS_DB?: string;

  // Git
  ?: string;
  GIT_ACCESS_TOKEN?: string;
  GIT_WEBHOOK_SECRET?: string;
  GIT_TARGET_BRANCH?: string;

  // AI
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  AI_API_BASE_URL?: string;
  AI_TEMPERATURE?: string;
  AI_MAX_TOKENS?: string;

  // 应用
  NODE_ENV?: string;
  PORT?: string;
  HOST?: string;
  BASE_URL?: string;

  // 日志
  LOG_LEVEL?: string;
  LOG_CONSOLE?: string;
  LOG_FILE?: string;
  LOG_DIR?: string;
  LOG_MAX_FILES?: string;
  LOG_MAX_SIZE?: string;

  // 轮询
  POLLING_ENABLED?: string;
  POLLING_INTERVAL?: string;

  // 通知
  NOTIFICATION_EMAIL_ENABLED?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  NOTIFICATION_FROM_EMAIL?: string;

  // 安全
  JWT_SECRET?: string;
  API_RATE_LIMIT?: string;
  ENCRYPTION_KEY?: string;

  // 审查引擎
  MAX_CONCURRENT_REVIEWS?: string;
  REVIEW_TIMEOUT?: string;
  MAX_DIFF_LINES?: string;
  MAX_FILE_SIZE?: string;
}