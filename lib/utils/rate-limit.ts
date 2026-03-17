import RedisClient from '@/lib/cache/redis-client';
import type { RateLimitConfig } from '@/types/auth';
import { logger } from './logger';

/**
 * 速率限制结果接口
 */
export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间（Unix 时间戳） */
  resetTime: number;
  /** 总限制数 */
  limit: number;
}

/**
 * 速率限制器类
 */
export class RateLimiter {
  public readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 检查速率限制
   * @param key - 限制键
   * @returns 限制结果
   */
  async checkLimit(key: string): Promise<RateLimitResult> {
    try {
      const redis = await RedisClient.getInstance();
      const now = Date.now();
      const windowStart = Math.floor(now / (this.config.windowMs * 1000)) * this.config.windowMs;
      const windowKey = `rate_limit:${key}:${windowStart}`;

      // 使用 Redis 管道提高性能
      const pipeline = redis.pipeline();
      pipeline.incr(windowKey);
      pipeline.expire(windowKey, Math.ceil(this.config.windowMs / 1000));
      
      const results = await pipeline.exec();
      
      if (!results || results.length < 2) {
        throw new Error('Redis 管道执行失败');
      }

      const count = results[0][1] as number;
      const resetTime = windowStart + this.config.windowMs;
      const remaining = Math.max(0, this.config.maxRequests - count);
      const allowed = count <= this.config.maxRequests;

      return {
        allowed,
        remaining,
        resetTime,
        limit: this.config.maxRequests,
      };
    } catch (error) {
      logger.error('速率限制检查失败', { key, error });
      
      // 发生错误时允许请求通过，避免影响正常服务
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: Date.now() + this.config.windowMs,
        limit: this.config.maxRequests,
      };
    }
  }

  /**
   * 重置速率限制
   * @param key - 限制键
   */
  async resetLimit(key: string): Promise<void> {
    try {
      const redis = await RedisClient.getInstance();
      const pattern = `rate_limit:${key}:*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      logger.info('速率限制已重置', { key });
    } catch (error) {
      logger.error('重置速率限制失败', { key, error });
    }
  }
}

/**
 * 从请求中提取客户端 IP
 * @param request - HTTP 请求对象
 * @returns 客户端 IP 地址
 */
function extractClientIP(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  return realIp || 'unknown';
}

/**
 * 创建默认速率限制器
 */
export function createDefaultRateLimiter(): RateLimiter {
  const config: RateLimitConfig = {
    windowMs: 60 * 1000,
    maxRequests: parseInt(process.env.API_RATE_LIMIT || '100'),
    keyGenerator: extractClientIP,
  };

  return new RateLimiter(config);
}

/**
 * 创建 API Key 速率限制器
 */
export function createApiKeyRateLimiter(): RateLimiter {
  const config: RateLimitConfig = {
    windowMs: 60 * 1000,
    maxRequests: parseInt(process.env.API_KEY_RATE_LIMIT || '1000'),
    keyGenerator: (request: Request) => {
      const apiKey = request.headers.get('x-api-key');
      return apiKey ? `apikey:${apiKey}` : 'anonymous';
    },
  };

  return new RateLimiter(config);
}

/**
 * 创建 Webhook 速率限制器
 */
export function createWebhookRateLimiter(): RateLimiter {
  const config: RateLimitConfig = {
    windowMs: 60 * 1000,
    maxRequests: parseInt(process.env.WEBHOOK_RATE_LIMIT || '50'),
    keyGenerator: (request: Request) => `webhook:${extractClientIP(request)}`,
  };

  return new RateLimiter(config);
}