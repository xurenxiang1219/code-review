import type { MiddlewareConfig, RateLimitConfig } from '@/types/auth';

/**
 * 认证中间件配置
 */
export const authConfig: MiddlewareConfig = {
  // JWT 配置
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  jwtIssuer: process.env.JWT_ISSUER || 'ai-code-review-system',
  jwtAudience: process.env.JWT_AUDIENCE || 'ai-code-review-api',

  // 速率限制配置
  rateLimit: {
    windowMs: 60 * 1000, // 1 分钟
    maxRequests: parseInt(process.env.API_RATE_LIMIT || '100'),
    keyGenerator: (request: Request) => {
      const forwardedFor = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      
      if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
      }
      
      return realIp || 'unknown';
    },
  },

  // 跳过认证的路径
  skipAuthPaths: [
    '/api/webhook', // Webhook 使用签名验证
  ],

  // 公开访问的路径
  publicPaths: [
    '/',
    '/api/health',
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
  ],

  // CORS 配置
  cors: {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'],
    credentials: true,
  },
};

/**
 * API Key 速率限制配置
 */
export const apiKeyRateLimitConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 分钟
  maxRequests: parseInt(process.env.API_KEY_RATE_LIMIT || '1000'),
  keyGenerator: (request: Request) => {
    const apiKey = request.headers.get('x-api-key');
    return apiKey ? `apikey:${apiKey.substring(0, 8)}` : 'anonymous';
  },
};

/**
 * Webhook 速率限制配置
 */
export const webhookRateLimitConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 分钟
  maxRequests: parseInt(process.env.WEBHOOK_RATE_LIMIT || '50'),
  keyGenerator: (request: Request) => {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    
    const ip = forwardedFor?.split(',')[0].trim() || realIp || 'unknown';
    return `webhook:${ip}`;
  },
};

/**
 * 安全配置
 */
export const securityConfig = {
  // 密码强度要求
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },

  // API Key 配置
  apiKey: {
    defaultPrefix: 'ak',
    defaultExpiryDays: 365,
    maxKeysPerUser: 10,
  },

  // JWT 配置
  jwt: {
    defaultExpiresIn: '24h',
    refreshTokenExpiresIn: '7d',
    algorithm: 'HS256' as const,
  },

  // 审计日志配置
  audit: {
    retentionDays: 90,
    enabledEvents: [
      'login',
      'logout',
      'api_access',
      'config_change',
      'review_access',
      'security_event',
    ],
  },

  // 安全事件配置
  securityEvents: {
    alertThresholds: {
      failedLogins: 5, // 5 次失败登录后告警
      rateLimitExceeded: 10, // 10 次速率限制后告警
      suspiciousActivity: 3, // 3 次可疑活动后告警
    },
    alertCooldown: 300, // 5 分钟冷却期
  },
};

/**
 * 环境变量验证
 */
export function validateAuthConfig(): void {
  const requiredEnvVars = [
    'JWT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `缺少必需的环境变量: ${missingVars.join(', ')}\n` +
      '请检查 .env 文件或环境变量配置'
    );
  }

  // 验证 JWT 密钥强度
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    console.warn('警告: JWT_SECRET 长度过短，建议使用至少 32 个字符的强密钥');
  }

  // 验证速率限制配置
  const rateLimit = parseInt(process.env.API_RATE_LIMIT || '100');
  if (rateLimit < 1 || rateLimit > 10000) {
    console.warn('警告: API_RATE_LIMIT 配置可能不合理，建议设置在 1-10000 之间');
  }
}