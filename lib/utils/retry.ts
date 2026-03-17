import { logger } from '@/lib/utils/logger';

/**
 * 重试配置选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟时间（毫秒） */
  initialDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 退避倍数 */
  backoffMultiplier: number;
  /** 是否添加随机抖动 */
  jitter: boolean;
  /** 重试条件判断函数 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** 重试前的回调函数 */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  /** 操作结果 */
  result: T;
  /** 实际重试次数 */
  attempts: number;
  /** 总耗时（毫秒） */
  totalTime: number;
}

/**
 * 重试错误类
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly allErrors: Error[]
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: Error) => {
    // 默认重试条件：网络错误、超时错误、服务不可用
    const retryableErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'EPIPE',
      'timeout',
      'network',
      'service unavailable',
      '503',
      '502',
      '504',
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  },
};

/**
 * 指数退避重试工具类
 */
export class ExponentialBackoffRetry {
  private readonly options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * 执行带重试的异步操作
   * @param operation - 要执行的异步操作
   * @param operationName - 操作名称（用于日志）
   * @returns 重试结果
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName = 'operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const errors: Error[] = [];
    let lastError: Error;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        logger.debug(`Executing ${operationName}`, { 
          attempt: attempt + 1, 
          maxRetries: this.options.maxRetries + 1 
        });

        const result = await operation();
        const totalTime = Date.now() - startTime;

        if (attempt > 0) {
          logger.info(`${operationName} succeeded after retries`, {
            attempts: attempt + 1,
            totalTime,
          });
        }

        return {
          result,
          attempts: attempt + 1,
          totalTime,
        };
      } catch (error) {
        const currentError = error instanceof Error ? error : new Error(String(error));
        lastError = currentError;
        errors.push(currentError);

        logger.warn(`${operationName} failed`, {
          attempt: attempt + 1,
          error: currentError.message,
          willRetry: attempt < this.options.maxRetries,
        });

        // 如果是最后一次尝试，不再重试
        if (attempt === this.options.maxRetries) {
          break;
        }

        // 检查是否应该重试
        if (this.options.shouldRetry && !this.options.shouldRetry(currentError, attempt + 1)) {
          logger.info(`${operationName} will not retry due to shouldRetry condition`, {
            attempt: attempt + 1,
            error: currentError.message,
          });
          break;
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt);

        // 调用重试回调
        if (this.options.onRetry) {
          this.options.onRetry(currentError, attempt + 1, delay);
        }

        logger.debug(`Retrying ${operationName} in ${delay}ms`, {
          attempt: attempt + 1,
          delay,
        });

        // 等待延迟
        await this.sleep(delay);
      }
    }

    const totalTime = Date.now() - startTime;
    const finalError = new RetryError(
      `${operationName} failed after ${errors.length} attempts`,
      errors.length,
      lastError!,
      errors
    );

    logger.error(`${operationName} failed permanently`, {
      attempts: errors.length,
      totalTime,
      lastError: lastError!.message,
    });

    throw finalError;
  }

  /**
   * 计算延迟时间（指数退避 + 可选抖动）
   * @param attempt - 当前重试次数（从0开始）
   * @returns 延迟时间（毫秒）
   */
  private calculateDelay(attempt: number): number {
    let delay = this.options.initialDelay * Math.pow(this.options.backoffMultiplier, attempt);
    delay = Math.min(delay, this.options.maxDelay);
    
    if (this.options.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  /**
   * 异步睡眠
   * @param ms - 睡眠时间（毫秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 便捷的重试函数
 * @param operation - 要执行的异步操作
 * @param options - 重试配置
 * @param operationName - 操作名称
 * @returns 操作结果
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  operationName = 'operation'
): Promise<T> {
  const retry = new ExponentialBackoffRetry(options);
  const result = await retry.execute(operation, operationName);
  return result.result;
}

/**
 * 网络请求专用重试配置
 */
export const NETWORK_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: Error) => {
    const networkErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'EPIPE',
      'timeout',
      'network',
      'fetch',
    ];
    
    const errorMessage = error.message.toLowerCase();
    return networkErrors.some(pattern => errorMessage.includes(pattern));
  },
};

/**
 * AI 服务专用重试配置
 */
export const AI_SERVICE_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: Error) => {
    const errorMessage = error.message.toLowerCase();
    
    const nonRetryableErrors = [
      'invalid api key',
      'unauthorized',
      'forbidden',
      'quota exceeded',
      'rate limit',
      'bad request',
      'invalid request',
    ];
    
    if (nonRetryableErrors.some(pattern => errorMessage.includes(pattern))) {
      return false;
    }
    
    const retryableErrors = [
      'timeout',
      'network',
      'service unavailable',
      'internal server error',
      '500',
      '502',
      '503',
      '504',
    ];
    
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  },
  onRetry: (error: Error, attempt: number, delay: number) => {
    logger.warn('AI service retry', {
      attempt,
      delay,
      error: error.message,
    });
  },
};

/**
 * 数据库操作专用重试配置
 */
export const DATABASE_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 5000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: Error) => {
    const retryableErrors = [
      'connection',
      'timeout',
      'deadlock',
      'lock wait timeout',
      'too many connections',
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  },
};

/**
 * Git 操作专用重试配置
 */
export const GIT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 2,
  initialDelay: 1000,
  maxDelay: 8000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: Error) => {
    const retryableErrors = [
      'network',
      'timeout',
      'connection',
      'temporary failure',
      '502',
      '503',
      '504',
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  },
};

/**
 * 创建自定义重试器
 * @param options - 重试配置
 * @returns 重试器实例
 */
export function createRetry(options: Partial<RetryOptions> = {}): ExponentialBackoffRetry {
  return new ExponentialBackoffRetry(options);
}

/**
 * 重试装饰器
 * @param options - 重试配置
 */
export function retry(options: Partial<RetryOptions> = {}) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    const retryInstance = new ExponentialBackoffRetry(options);

    descriptor.value = async function (...args: any[]) {
      const result = await retryInstance.execute(
        () => method.apply(this, args),
        `${target.constructor.name}.${propertyName}`
      );
      return result.result;
    };

    return descriptor;
  };
}