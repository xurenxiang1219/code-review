/**
 * 认证相关类型定义
 */

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'admin',           // 管理员：完全访问权限
  DEVELOPER = 'developer',   // 开发者：查看审查结果、配置管理
  VIEWER = 'viewer',         // 查看者：只读权限
  SYSTEM = 'system',         // 系统：内部服务调用
}

/**
 * 权限枚举
 */
export enum Permission {
  // 审查相关权限
  REVIEW_READ = 'review:read',
  REVIEW_WRITE = 'review:write',
  REVIEW_DELETE = 'review:delete',
  
  // 配置相关权限
  CONFIG_READ = 'config:read',
  CONFIG_WRITE = 'config:write',
  
  // Webhook 相关权限
  WEBHOOK_RECEIVE = 'webhook:receive',
  
  // 系统管理权限
  SYSTEM_ADMIN = 'system:admin',
  HEALTH_CHECK = 'health:check',
}

/**
 * JWT 载荷接口
 */
export interface JWTPayload {
  /** 用户 ID */
  sub: string;
  /** 用户邮箱 */
  email: string;
  /** 用户角色 */
  role: UserRole;
  /** 权限列表 */
  permissions: Permission[];
  /** 签发时间 */
  iat: number;
  /** 过期时间 */
  exp: number;
  /** 签发者 */
  iss: string;
  /** 受众 */
  aud: string;
}

/**
 * API Key 信息接口
 */
export interface ApiKeyInfo {
  /** API Key ID */
  id: string;
  /** API Key 名称 */
  name: string;
  /** 关联的用户 ID */
  userId: string;
  /** 权限列表 */
  permissions: Permission[];
  /** 是否启用 */
  enabled: boolean;
  /** 过期时间 */
  expiresAt?: Date;
  /** 最后使用时间 */
  lastUsedAt?: Date;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 认证用户信息接口
 */
export interface AuthUser {
  /** 用户 ID */
  id: string;
  /** 用户邮箱 */
  email: string;
  /** 用户角色 */
  role: UserRole;
  /** 权限列表 */
  permissions: Permission[];
  /** 认证方式 */
  authMethod: 'jwt' | 'apikey';
  /** API Key 信息（如果使用 API Key 认证） */
  apiKey?: Pick<ApiKeyInfo, 'id' | 'name'>;
}

/**
 * 认证结果接口
 */
export interface AuthResult {
  /** 是否认证成功 */
  success: boolean;
  /** 认证用户信息 */
  user?: AuthUser;
  /** 错误信息 */
  error?: string;
  /** 错误代码 */
  errorCode?: string;
}

/**
 * 速率限制配置接口
 */
export interface RateLimitConfig {
  /** 时间窗口（秒） */
  windowMs: number;
  /** 最大请求数 */
  maxRequests: number;
  /** 限制键生成函数 */
  keyGenerator?: (request: Request) => string;
  /** 跳过条件 */
  skip?: (request: Request) => boolean;
}

/**
 * 中间件配置接口
 */
export interface MiddlewareConfig {
  /** JWT 密钥 */
  jwtSecret: string;
  /** JWT 签发者 */
  jwtIssuer: string;
  /** JWT 受众 */
  jwtAudience: string;
  /** 速率限制配置 */
  rateLimit: RateLimitConfig;
  /** 跳过认证的路径 */
  skipAuthPaths: string[];
  /** 公开访问的路径 */
  publicPaths: string[];
  /** CORS 配置 */
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

/**
 * 审计日志接口
 */
export interface AuditLog {
  /** 日志 ID */
  id: string;
  /** 用户 ID */
  userId: string;
  /** 用户邮箱 */
  userEmail: string;
  /** 操作类型 */
  action: string;
  /** 资源类型 */
  resource: string;
  /** 资源 ID */
  resourceId?: string;
  /** 请求方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 请求 IP */
  ip: string;
  /** 用户代理 */
  userAgent: string;
  /** 请求 ID */
  requestId: string;
  /** 操作结果 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 响应状态码 */
  statusCode: number;
  /** 处理时间（毫秒） */
  duration: number;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 安全事件类型枚举
 */
export enum SecurityEventType {
  INVALID_TOKEN = 'invalid_token',
  EXPIRED_TOKEN = 'expired_token',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
}

/**
 * 安全事件接口
 */
export interface SecurityEvent {
  /** 事件 ID */
  id: string;
  /** 事件类型 */
  type: SecurityEventType;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 事件描述 */
  description: string;
  /** 请求 IP */
  ip: string;
  /** 用户代理 */
  userAgent: string;
  /** 请求路径 */
  path: string;
  /** 用户 ID（如果已认证） */
  userId?: string;
  /** 附加数据 */
  metadata: Record<string, any>;
  /** 创建时间 */
  createdAt: Date;
}