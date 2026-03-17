import RedisClient from '@/lib/cache/redis-client';
import { logger } from './logger';

/**
 * 增强的速率限制配置
 */
export interface EnhancedRateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 最大请求数 */
  maxRequests: number;
  /** 突发请求限制 */
  burstLimit?: number;
  /** 突发时间窗口（毫秒） */
  burstWindowMs?: number;
  /** 是否启用渐进式限制 */
  enableProgressive?: boolean;
  /** 渐进式限制阈值（百分比） */
  progressiveThreshold?: number;
  /** 键生成器 */
  keyGenerator: (identifier: string) => string;
  /** 跳过条件 */
  skipCondition?: (identifier: string) => boolean;
  /** 自定义错误消息 */
  errorMessage?: string;
}

/**
 * 速率限制结果
 */
export interface EnhancedRateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间（Unix时间戳） */
  resetTime: number;
  /** 总限制数 */
  limit: number;
  /** 当前请求数 */
  current: number;
  /** 是否触发突发限制 */
  burstLimited?: boolean;
  /** 是否触发渐进式限制 */
  progressiveLimited?: boolean;
  /** 建议重试延迟（毫秒） */
  retryAfter?: number;
}

/**
 * 速率限制统计信息
 */
export interface RateLimitStats {
  /** 总请求数 */
  totalRequests: number;
  /** 被限制的请求数 */
  limitedRequests: number;
  /** 限制率 */
  limitRate: number;
  /** 平均请求间隔 */
  averageInterval: number;
  /** 最后请求时间 */
  lastRequestTime: Date;
}

/**
 * 增强的速率限制器
 * 
 * 支持功能：
 * - 滑动窗口限制
 * - 突发请求控制
 * - 渐进式限制
 * - 分布式限制
 * - 统计监控
 * - 背压处理
 */
export class EnhancedRateLimiter {
  private config: EnhancedRateLimitConfig;
  private limiterLogger: typeof logger;
  private name: string;

  constructor(name: string, config: EnhancedRateLimitConfig) {
    this.name = name;
    this.config = config;
    this.limiterLogger = logger.child({ 
      service: 'EnhancedRateLimiter',
      limiter: name 
    });
  }

  /**
   * 检查速率限制
   * 
   * @param identifier - 限制标识符
   * @returns 限制结果
   */
  async checkLimit(identifier: string): Promise<EnhancedRateLimitResult> {
    try {
      // 检查跳过条件
      if (this.config.skipCondition?.(identifier)) {
        return this.createAllowedResult();
      }

      const redis = await RedisClient.getInstance();
      const now = Date.now();
      const key = this.config.keyGenerator(identifier);

      // 滑动窗口限制检查
      const windowResult = await this.checkSlidingWindow(redis, key, now);
      
      if (!windowResult.allowed) {
        return windowResult;
      }

      // 突发限制检查
      if (this.config.burstLimit && this.config.burstWindowMs) {
        const burstResult = await this.checkBurstLimit(redis, key, now);
        
        if (!burstResult.allowed) {
          return { ...burstResult, burstLimited: true };
        }
      }

      // 渐进式限制检查
      if (this.config.enableProgressive) {
        const progressiveResult = await this.checkProgressiveLimit(redis, key, now, windowResult.current);
        
        if (!progressiveResult.allowed) {
          return { ...progressiveResult, progressiveLimited: true };
        }
      }

      // 记录请求
      await this.recordRequest(redis, key, now);

      // 更新统计信息
      await this.updateStats(redis, key, true);

      return windowResult;

    } catch (error) {
      this.limiterLogger.error('速率限制检查失败', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });

      // 发生错误时允许请求通过
      return this.createAllowedResult();
    }
  }

  /**
   * 获取限制状态
   * 
   * @param identifier - 限制标识符
   */
  async getStatus(identifier: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
    burstCurrent?: number;
    burstLimit?: number;
  }> {
    const redis = await RedisClient.getInstance();
    const key = this.config.keyGenerator(identifier);
    const now = Date.now();

    const windowStart = this.getWindowStart(now);
    const windowKey = `${key}:${windowStart}`;

    const current = await redis.get(windowKey);
    const currentCount = current ? parseInt(current) : 0;

    const result: any = {
      current: currentCount,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - currentCount),
      resetTime: windowStart + this.config.windowMs,
    };

    // 获取突发限制状态
    if (this.config.burstLimit && this.config.burstWindowMs) {
      const burstWindowStart = this.getBurstWindowStart(now);
      const burstKey = `${key}:burst:${burstWindowStart}`;
      const burstCurrent = await redis.get(burstKey);
      
      result.burstCurrent = burstCurrent ? parseInt(burstCurrent) : 0;
      result.burstLimit = this.config.burstLimit;
    }

    return result;
  }

  /**
   * 获取统计信息
   * 
   * @param identifier - 限制标识符
   */
  async getStats(identifier: string): Promise<RateLimitStats> {
    const redis = await RedisClient.getInstance();
    const key = this.config.keyGenerator(identifier);
    const statsKey = `${key}:stats`;

    const stats = await redis.hmget(
      statsKey,
      'totalRequests',
      'limitedRequests',
      'lastRequestTime',
      'requestTimes'
    );

    const totalRequests = parseInt(stats[0] || '0');
    const limitedRequests = parseInt(stats[1] || '0');
    const lastRequestTime = stats[2] ? new Date(parseInt(stats[2])) : new Date();
    const requestTimes = stats[3] ? JSON.parse(stats[3]) : [];

    // 计算平均请求间隔
    let averageInterval = 0;
    if (requestTimes.length > 1) {
      const intervals = [];
      for (let i = 1; i < requestTimes.length; i++) {
        intervals.push(requestTimes[i] - requestTimes[i - 1]);
      }
      averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    return {
      totalRequests,
      limitedRequests,
      limitRate: totalRequests > 0 ? (limitedRequests / totalRequests) * 100 : 0,
      averageInterval,
      lastRequestTime,
    };
  }

  /**
   * 重置限制
   * 
   * @param identifier - 限制标识符
   */
  async reset(identifier: string): Promise<void> {
    const redis = await RedisClient.getInstance();
    const key = this.config.keyGenerator(identifier);
    
    // 删除所有相关的键
    const pattern = `${key}*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    this.limiterLogger.info('速率限制已重置', { identifier });
  }

  /**
   * 滑动窗口限制检查
   */
  private async checkSlidingWindow(
    redis: any,
    key: string,
    now: number
  ): Promise<EnhancedRateLimitResult> {
    const windowStart = this.getWindowStart(now);
    const windowKey = `${key}:${windowStart}`;

    // 获取当前窗口的请求数
    const current = await redis.get(windowKey);
    const currentCount = current ? parseInt(current) : 0;

    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    const resetTime = windowStart + this.config.windowMs;

    if (currentCount >= this.config.maxRequests) {
      // 计算建议重试延迟
      const retryAfter = resetTime - now;

      await this.updateStats(redis, key, false);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        limit: this.config.maxRequests,
        current: currentCount,
        retryAfter: Math.max(0, retryAfter),
      };
    }

    return {
      allowed: true,
      remaining: remaining - 1, // 减1因为即将记录这次请求
      resetTime,
      limit: this.config.maxRequests,
      current: currentCount,
    };
  }

  /**
   * 突发限制检查
   */
  private async checkBurstLimit(
    redis: any,
    key: string,
    now: number
  ): Promise<EnhancedRateLimitResult> {
    if (!this.config.burstLimit || !this.config.burstWindowMs) {
      return this.createAllowedResult();
    }

    const burstWindowStart = this.getBurstWindowStart(now);
    const burstKey = `${key}:burst:${burstWindowStart}`;

    const burstCurrent = await redis.get(burstKey);
    const burstCount = burstCurrent ? parseInt(burstCurrent) : 0;

    if (burstCount >= this.config.burstLimit) {
      const retryAfter = burstWindowStart + this.config.burstWindowMs - now;

      return {
        allowed: false,
        remaining: 0,
        resetTime: burstWindowStart + this.config.burstWindowMs,
        limit: this.config.burstLimit,
        current: burstCount,
        retryAfter: Math.max(0, retryAfter),
      };
    }

    return this.createAllowedResult();
  }

  /**
   * 渐进式限制检查
   */
  private async checkProgressiveLimit(
    redis: any,
    key: string,
    now: number,
    currentCount: number
  ): Promise<EnhancedRateLimitResult> {
    if (!this.config.enableProgressive || !this.config.progressiveThreshold) {
      return this.createAllowedResult();
    }

    const threshold = this.config.maxRequests * (this.config.progressiveThreshold / 100);
    
    if (currentCount >= threshold) {
      // 计算延迟时间（渐进式增加）
      const progressRatio = (currentCount - threshold) / (this.config.maxRequests - threshold);
      const maxDelay = this.config.windowMs / 10; // 最大延迟为窗口时间的10%
      const delay = progressRatio * maxDelay;

      // 检查最近请求的时间间隔
      const lastRequestKey = `${key}:last_request`;
      const lastRequestTime = await redis.get(lastRequestKey);
      
      if (lastRequestTime) {
        const timeSinceLastRequest = now - parseInt(lastRequestTime);
        
        if (timeSinceLastRequest < delay) {
          return {
            allowed: false,
            remaining: 0,
            resetTime: now + delay,
            limit: this.config.maxRequests,
            current: currentCount,
            retryAfter: delay - timeSinceLastRequest,
          };
        }
      }
    }

    return this.createAllowedResult();
  }

  /**
   * 记录请求
   */
  private async recordRequest(redis: any, key: string, now: number): Promise<void> {
    const windowStart = this.getWindowStart(now);
    const windowKey = `${key}:${windowStart}`;

    // 使用管道提高性能
    const pipeline = redis.pipeline();
    
    // 增加窗口计数
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, Math.ceil(this.config.windowMs / 1000));

    // 记录突发请求
    if (this.config.burstLimit && this.config.burstWindowMs) {
      const burstWindowStart = this.getBurstWindowStart(now);
      const burstKey = `${key}:burst:${burstWindowStart}`;
      pipeline.incr(burstKey);
      pipeline.expire(burstKey, Math.ceil(this.config.burstWindowMs / 1000));
    }

    // 记录最后请求时间（用于渐进式限制）
    if (this.config.enableProgressive) {
      const lastRequestKey = `${key}:last_request`;
      pipeline.set(lastRequestKey, now.toString());
      pipeline.expire(lastRequestKey, Math.ceil(this.config.windowMs / 1000));
    }

    await pipeline.exec();
  }

  /**
   * 更新统计信息
   */
  private async updateStats(redis: any, key: string, allowed: boolean): Promise<void> {
    const statsKey = `${key}:stats`;
    const now = Date.now();

    const pipeline = redis.pipeline();
    
    // 增加总请求数
    pipeline.hincrby(statsKey, 'totalRequests', 1);
    
    // 如果被限制，增加限制请求数
    if (!allowed) {
      pipeline.hincrby(statsKey, 'limitedRequests', 1);
    }
    
    // 更新最后请求时间
    pipeline.hset(statsKey, 'lastRequestTime', now.toString());
    
    // 更新请求时间序列（保留最近20次）
    const requestTimes = await redis.hget(statsKey, 'requestTimes');
    const times = requestTimes ? JSON.parse(requestTimes) : [];
    times.push(now);
    
    if (times.length > 20) {
      times.shift();
    }
    
    pipeline.hset(statsKey, 'requestTimes', JSON.stringify(times));
    
    // 设置统计信息过期时间（24小时）
    pipeline.expire(statsKey, 24 * 3600);
    
    await pipeline.exec();
  }

  /**
   * 获取窗口开始时间
   */
  private getWindowStart(now: number): number {
    return Math.floor(now / this.config.windowMs) * this.config.windowMs;
  }

  /**
   * 获取突发窗口开始时间
   */
  private getBurstWindowStart(now: number): number {
    const burstWindowMs = this.config.burstWindowMs || this.config.windowMs;
    return Math.floor(now / burstWindowMs) * burstWindowMs;
  }

  /**
   * 创建允许的结果
   */
  private createAllowedResult(): EnhancedRateLimitResult {
    return {
      allowed: true,
      remaining: this.config.maxRequests,
      resetTime: Date.now() + this.config.windowMs,
      limit: this.config.maxRequests,
      current: 0,
    };
  }
}

/**
 * 创建AI API速率限制器
 */
export function createAIApiRateLimiter(): EnhancedRateLimiter {
  const config: EnhancedRateLimitConfig = {
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW || '60000'), // 1分钟
    maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX || '100'),
    burstLimit: parseInt(process.env.AI_BURST_LIMIT || '20'),
    burstWindowMs: parseInt(process.env.AI_BURST_WINDOW || '10000'), // 10秒
    enableProgressive: process.env.AI_PROGRESSIVE_LIMIT === 'true',
    progressiveThreshold: parseInt(process.env.AI_PROGRESSIVE_THRESHOLD || '80'),
    keyGenerator: (identifier: string) => `ai_api_rate_limit:${identifier}`,
    skipCondition: (identifier: string) => {
      // 跳过内部系统调用
      return identifier.startsWith('system:');
    },
    errorMessage: 'AI API调用频率超限，请稍后重试',
  };

  return new EnhancedRateLimiter('ai-api', config);
}

/**
 * 创建Webhook速率限制器
 */
export function createWebhookRateLimiter(): EnhancedRateLimiter {
  const config: EnhancedRateLimitConfig = {
    windowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW || '60000'), // 1分钟
    maxRequests: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '50'),
    burstLimit: parseInt(process.env.WEBHOOK_BURST_LIMIT || '10'),
    burstWindowMs: parseInt(process.env.WEBHOOK_BURST_WINDOW || '5000'), // 5秒
    enableProgressive: process.env.WEBHOOK_PROGRESSIVE_LIMIT === 'true',
    progressiveThreshold: parseInt(process.env.WEBHOOK_PROGRESSIVE_THRESHOLD || '70'),
    keyGenerator: (identifier: string) => `webhook_rate_limit:${identifier}`,
    skipCondition: (identifier: string) => {
      // 跳过白名单IP
      const whitelist = process.env.WEBHOOK_IP_WHITELIST?.split(',') || [];
      return whitelist.includes(identifier);
    },
    errorMessage: 'Webhook请求频率超限，请稍后重试',
  };

  return new EnhancedRateLimiter('webhook', config);
}

/**
 * 速率限制中间件工厂
 */
export function createRateLimitMiddleware(limiter: EnhancedRateLimiter) {
  return async (request: Request, identifier: string): Promise<{
    allowed: boolean;
    headers: Record<string, string>;
    error?: string;
  }> => {
    const result = await limiter.checkLimit(identifier);
    
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    };

    if (!result.allowed) {
      headers['Retry-After'] = Math.ceil((result.retryAfter || 0) / 1000).toString();
      
      let errorMessage = '请求频率超限';
      
      if (result.burstLimited) {
        errorMessage = '突发请求过多，请稍后重试';
      } else if (result.progressiveLimited) {
        errorMessage = '请求过于频繁，请适当降低频率';
      }

      return {
        allowed: false,
        headers,
        error: errorMessage,
      };
    }

    return {
      allowed: true,
      headers,
    };
  };
}