import { logger } from '@/lib/utils/logger';
import { ApiError } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';

/**
 * 重试配置接口
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟时间（毫秒） */
  baseDelayMs: number;
  /** 是否使用指数退避 */
  exponentialBackoff: boolean;
  /** 最大延迟时间（毫秒） */
  maxDelayMs?: number;
  /** 抖动因子（0-1） */
  jitterFactor?: number;
  /** 重试条件判断函数 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * 重试结果接口
 */
export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: T;
  /** 错误信息 */
  error?: Error;
  /** 实际重试次数 */
  attempts: number;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
}

/**
 * 断路器状态枚举
 */
export enum CircuitBreakerState {
  /** 关闭状态 - 正常工作 */
  CLOSED = 'closed',
  /** 开启状态 - 快速失败 */
  OPEN = 'open',
  /** 半开状态 - 尝试恢复 */
  HALF_OPEN = 'half_open',
}

/**
 * 断路器配置接口
 */
export interface CircuitBreakerConfig {
  /** 失败阈值 */
  failureThreshold: number;
  /** 恢复超时时间（毫秒） */
  recoveryTimeoutMs: number;
  /** 监控窗口时间（毫秒） */
  monitoringWindowMs: number;
  /** 最小请求数 */
  minimumRequests: number;
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  exponentialBackoff: true,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
  shouldRetry: (error: Error, attempt: number) => {
    // 默认重试条件：网络错误、超时错误、5xx服务器错误
    if (error instanceof ApiError) {
      return error.code >= 2000 && error.code < 3000; // 服务端错误
    }
    
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('econnrefused') ||
           errorMessage.includes('enotfound');
  },
};

/**
 * 重试机制实现类
 */
export class RetryMechanism {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * 执行带重试的异步操作
   * @param operation - 要执行的异步操作
   * @param operationName - 操作名称（用于日志）
   * @returns 重试结果
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = '未知操作'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;
    const maxAttempts = this.config.maxRetries + 1;

    logger.debug(`开始执行重试操作: ${operationName}`, {
      maxRetries: this.config.maxRetries,
      baseDelayMs: this.config.baseDelayMs,
    });

    for (attempts = 1; attempts <= maxAttempts; attempts++) {
      try {
        const result = await operation();
        const totalDurationMs = Date.now() - startTime;

        if (attempts > 1) {
          logger.info(`重试操作成功: ${operationName}`, {
            attempts,
            totalDurationMs,
            finalAttempt: attempts,
          });
        }

        return {
          success: true,
          data: result,
          attempts,
          totalDurationMs,
        };
      } catch (error) {
        const currentError = error instanceof Error ? error : new Error(String(error));
        lastError = currentError;

        logger.warn(`操作失败: ${operationName} (尝试 ${attempts}/${maxAttempts})`, {
          error: currentError.message,
          attempt: attempts,
        });

        // 检查是否应该重试
        const shouldContinue = attempts <= this.config.maxRetries && 
                              this.config.shouldRetry?.(currentError, attempts);
        
        if (!shouldContinue) break;

        // 计算延迟时间并等待
        const delayMs = this.calculateDelay(attempts - 1);
        logger.debug(`等待 ${delayMs}ms 后重试`, { attempt: attempts, delayMs });
        await this.delay(delayMs);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    logger.error(`重试操作最终失败: ${operationName}`, {
      attempts,
      totalDurationMs,
      finalError: lastError?.message,
    });

    return {
      success: false,
      error: lastError,
      attempts,
      totalDurationMs,
    };
  }

  /**
   * 计算延迟时间
   * @param attemptNumber - 尝试次数（从0开始）
   * @returns 延迟时间（毫秒）
   */
  private calculateDelay(attemptNumber: number): number {
    let delay = this.config.exponentialBackoff
      ? this.config.baseDelayMs * Math.pow(2, attemptNumber)
      : this.config.baseDelayMs;

    // 应用最大延迟限制
    if (this.config.maxDelayMs) {
      delay = Math.min(delay, this.config.maxDelayMs);
    }

    // 添加抖动
    if (this.config.jitterFactor && this.config.jitterFactor > 0) {
      const jitter = delay * this.config.jitterFactor * Math.random();
      delay += jitter;
    }

    return Math.floor(delay);
  }

  /**
   * 延迟函数
   * @param ms - 延迟时间（毫秒）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 断路器实现类
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private requestCount = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeoutMs: 60000,
      monitoringWindowMs: 60000,
      minimumRequests: 10,
      ...config,
    };
  }

  /**
   * 执行带断路器保护的操作
   * @param operation - 要执行的操作
   * @param operationName - 操作名称
   * @returns 操作结果
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = '未知操作'
  ): Promise<T> {
    // 检查断路器状态
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.recoveryTimeoutMs) {
        throw new ApiError(
          ApiCode.SERVICE_UNAVAILABLE,
          `服务暂时不可用 (断路器开启): ${operationName}`
        );
      } else {
        // 尝试半开状态
        this.state = CircuitBreakerState.HALF_OPEN;
        logger.info(`断路器进入半开状态: ${operationName}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)), operationName);
      throw error;
    }
  }

  /**
   * 处理成功情况
   * @param operationName - 操作名称
   */
  private onSuccess(operationName: string): void {
    this.successCount++;
    this.requestCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // 半开状态下成功，关闭断路器
      this.state = CircuitBreakerState.CLOSED;
      this.failureCount = 0;
      logger.info(`断路器关闭: ${operationName}`);
    }

    this.resetCountersIfNeeded();
  }

  /**
   * 处理失败情况
   * @param error - 错误对象
   * @param operationName - 操作名称
   */
  private onFailure(error: Error, operationName: string): void {
    this.failureCount++;
    this.requestCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`断路器记录失败: ${operationName}`, {
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state,
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // 半开状态下失败，重新开启断路器
      this.state = CircuitBreakerState.OPEN;
      logger.warn(`断路器重新开启: ${operationName}`);
    } else if (this.shouldOpenCircuit()) {
      // 达到失败阈值，开启断路器
      this.state = CircuitBreakerState.OPEN;
      logger.error(`断路器开启: ${operationName}`, {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
      });
    }

    this.resetCountersIfNeeded();
  }

  /**
   * 判断是否应该开启断路器
   * @returns 是否应该开启
   */
  private shouldOpenCircuit(): boolean {
    return this.requestCount >= this.config.minimumRequests &&
           this.failureCount >= this.config.failureThreshold;
  }

  /**
   * 重置计数器（如果需要）
   */
  private resetCountersIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastFailureTime > this.config.monitoringWindowMs) {
      this.failureCount = 0;
      this.successCount = 0;
      this.requestCount = 0;
    }
  }

  /**
   * 获取断路器状态
   * @returns 断路器状态信息
   */
  getState(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    requestCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * 错误恢复管理器
 */
export class ErrorRecoveryManager {
  private retryMechanism: RetryMechanism;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(defaultRetryConfig?: Partial<RetryConfig>) {
    this.retryMechanism = new RetryMechanism(defaultRetryConfig);
  }

  /**
   * 获取或创建断路器
   * @param serviceName - 服务名称
   * @param config - 断路器配置
   * @returns 断路器实例
   */
  private getCircuitBreaker(
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(config));
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * 执行带重试和断路器保护的操作
   * @param operation - 要执行的操作
   * @param options - 配置选项
   * @returns 操作结果
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      operationName: string;
      serviceName?: string;
      retryConfig?: Partial<RetryConfig>;
      circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
      useCircuitBreaker?: boolean;
    }
  ): Promise<T> {
    const {
      operationName,
      serviceName = 'default',
      retryConfig,
      circuitBreakerConfig,
      useCircuitBreaker = true,
    } = options;

    // 创建重试机制
    const retryMechanism = retryConfig 
      ? new RetryMechanism({ ...this.retryMechanism.config, ...retryConfig })
      : this.retryMechanism;

    // 包装操作（可选择性添加断路器保护）
    const wrappedOperation = useCircuitBreaker
      ? async () => {
          const circuitBreaker = this.getCircuitBreaker(serviceName, circuitBreakerConfig);
          return await circuitBreaker.execute(operation, operationName);
        }
      : operation;

    // 执行带重试的操作
    const result = await retryMechanism.execute(wrappedOperation, operationName);

    if (!result.success) {
      throw result.error || new Error(`操作失败: ${operationName}`);
    }

    return result.data!;
  }

  /**
   * 获取所有断路器状态
   * @returns 断路器状态映射
   */
  getCircuitBreakerStates(): Record<string, ReturnType<CircuitBreaker['getState']>> {
    const states: Record<string, ReturnType<CircuitBreaker['getState']>> = {};
    
    for (const [serviceName, circuitBreaker] of this.circuitBreakers) {
      states[serviceName] = circuitBreaker.getState();
    }
    
    return states;
  }

  /**
   * 重置指定服务的断路器
   * @param serviceName - 服务名称
   */
  resetCircuitBreaker(serviceName: string): void {
    this.circuitBreakers.delete(serviceName);
    logger.info(`断路器已重置: ${serviceName}`);
  }

  /**
   * 重置所有断路器
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.clear();
    logger.info('所有断路器已重置');
  }
}

/**
 * 导出默认错误恢复管理器实例
 */
export const errorRecoveryManager = new ErrorRecoveryManager();

/**
 * 便捷函数：执行带重试的操作
 * @param operation - 要执行的操作
 * @param operationName - 操作名称
 * @param retryConfig - 重试配置
 * @returns 操作结果
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  retryConfig?: Partial<RetryConfig>
): Promise<T> {
  return errorRecoveryManager.executeWithRecovery(operation, {
    operationName,
    retryConfig,
    useCircuitBreaker: false,
  });
}

/**
 * 便捷函数：执行带断路器保护的操作
 * @param operation - 要执行的操作
 * @param serviceName - 服务名称
 * @param operationName - 操作名称
 * @param circuitBreakerConfig - 断路器配置
 * @returns 操作结果
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  serviceName: string,
  operationName: string,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): Promise<T> {
  return errorRecoveryManager.executeWithRecovery(operation, {
    operationName,
    serviceName,
    circuitBreakerConfig,
    useCircuitBreaker: true,
  });
}

/**
 * 便捷函数：执行带完整错误恢复的操作
 * @param operation - 要执行的操作
 * @param serviceName - 服务名称
 * @param operationName - 操作名称
 * @param config - 配置选项
 * @returns 操作结果
 */
export async function withFullRecovery<T>(
  operation: () => Promise<T>,
  serviceName: string,
  operationName: string,
  config?: {
    retryConfig?: Partial<RetryConfig>;
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  }
): Promise<T> {
  return errorRecoveryManager.executeWithRecovery(operation, {
    operationName,
    serviceName,
    retryConfig: config?.retryConfig,
    circuitBreakerConfig: config?.circuitBreakerConfig,
    useCircuitBreaker: true,
  });
}