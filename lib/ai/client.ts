import { logger } from '@/lib/utils/logger';
import { withRetry, AI_SERVICE_RETRY_OPTIONS } from '@/lib/utils/retry';
import { createAIApiRateLimiter } from '@/lib/utils/rate-limit-enhanced';
import { createAIReviewConcurrencyController } from '@/lib/utils/concurrency-control';
import type {
  AIModelConfig,
  AIRequest,
  AIResponse,
  AIProvider,
} from '@/types/ai';

/**
 * AI 客户端错误类
 */
export class AIClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AIClientError';
  }
}

/**
 * AI 客户端接口
 */
interface IAIClient {
  complete(request: AIRequest): Promise<AIResponse>;
  healthCheck(): Promise<boolean>;
}

/**
 * OpenAI 客户端实现
 */
class OpenAIClient implements IAIClient {
  private readonly config: AIModelConfig;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: AIModelConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || '';

    if (!this.apiKey) {
      throw new AIClientError(
        'OpenAI API key is required',
        'MISSING_API_KEY',
        false
      );
    }
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: request.context || '你是一个专业的代码审查助手。',
            },
            {
              role: 'user',
              content: request.prompt,
            },
          ],
          temperature: request.temperature ?? this.config.temperature,
          max_tokens: request.maxTokens ?? this.config.maxTokens,
        }),
        signal: AbortSignal.timeout(this.config.timeout || 60000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.handleHttpError(response.status, errorData);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      logger.debug('OpenAI API call completed', {
        model: this.config.model,
        duration,
        usage: data.usage,
      });

      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        model: data.model,
        finishReason: data.choices[0]?.finish_reason,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof AIClientError) {
        logger.error('OpenAI API error', {
          code: error.code,
          message: error.message,
          duration,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          throw new AIClientError(
            'OpenAI API request timeout',
            'TIMEOUT',
            true,
            { duration }
          );
        }

        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new AIClientError(
            'Network error when calling OpenAI API',
            'NETWORK_ERROR',
            true,
            { originalError: error.message }
          );
        }
      }

      throw new AIClientError(
        'Unexpected error when calling OpenAI API',
        'UNKNOWN_ERROR',
        false,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.warn('OpenAI health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private handleHttpError(status: number, errorData: any): AIClientError {
    const errorMessage = errorData?.error?.message || 'Unknown error';
    const errorCode = errorData?.error?.code || 'UNKNOWN';

    switch (status) {
      case 400:
        return new AIClientError(
          `Bad request: ${errorMessage}`,
          'BAD_REQUEST',
          false,
          errorData
        );
      case 401:
        return new AIClientError(
          'Invalid API key',
          'INVALID_API_KEY',
          false,
          errorData
        );
      case 403:
        return new AIClientError(
          'Access forbidden',
          'FORBIDDEN',
          false,
          errorData
        );
      case 429:
        return new AIClientError(
          'Rate limit exceeded',
          'RATE_LIMIT',
          true,
          errorData
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AIClientError(
          `OpenAI service error: ${errorMessage}`,
          'SERVICE_ERROR',
          true,
          errorData
        );
      default:
        return new AIClientError(
          `HTTP error ${status}: ${errorMessage}`,
          errorCode,
          status >= 500,
          errorData
        );
    }
  }
}

/**
 * Claude 客户端实现（占位符）
 */
class ClaudeClient implements IAIClient {
  private readonly config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
    throw new AIClientError(
      'Claude client not implemented yet',
      'NOT_IMPLEMENTED',
      false
    );
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    throw new AIClientError(
      'Claude client not implemented yet',
      'NOT_IMPLEMENTED',
      false
    );
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}

/**
 * Gemini 客户端实现（占位符）
 */
class GeminiClient implements IAIClient {
  private readonly config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
    throw new AIClientError(
      'Gemini client not implemented yet',
      'NOT_IMPLEMENTED',
      false
    );
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    throw new AIClientError(
      'Gemini client not implemented yet',
      'NOT_IMPLEMENTED',
      false
    );
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}

/**
 * AI 客户端工厂
 */
export class AIClientFactory {
  /**
   * 创建 AI 客户端实例
   */
  static create(config: AIModelConfig): IAIClient {
    switch (config.provider) {
      case 'openai':
        return new OpenAIClient(config);
      case 'claude':
        return new ClaudeClient(config);
      case 'gemini':
        return new GeminiClient(config);
      case 'local':
        throw new AIClientError(
          'Local AI client not implemented yet',
          'NOT_IMPLEMENTED',
          false
        );
      default:
        throw new AIClientError(
          `Unsupported AI provider: ${config.provider}`,
          'UNSUPPORTED_PROVIDER',
          false
        );
    }
  }
}

/**
 * AI 客户端包装器，提供重试、速率限制和并发控制功能
 */
export class AIClient {
  private readonly client: IAIClient;
  private readonly config: AIModelConfig;
  private readonly logger = logger.child({ service: 'AIClient' });
  private readonly rateLimiter = createAIApiRateLimiter();
  private readonly concurrencyController = createAIReviewConcurrencyController();

  constructor(config: AIModelConfig) {
    this.config = config;
    this.client = AIClientFactory.create(config);
    
    this.logger.info('AI client initialized', {
      provider: config.provider,
      model: config.model,
    });
  }

  /**
   * 调用 AI 模型完成请求（带重试、速率限制和并发控制）
   */
  async complete(request: AIRequest): Promise<AIResponse> {
    const taskId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.debug('AI completion request', {
      taskId,
      promptLength: request.prompt.length,
      codeLanguage: request.codeLanguage,
    });

    // 检查速率限制
    const rateLimitResult = await this.rateLimiter.checkLimit(this.config.provider);
    
    if (!rateLimitResult.allowed) {
      const error = new AIClientError(
        `AI API调用频率超限，请在 ${Math.ceil((rateLimitResult.retryAfter || 0) / 1000)} 秒后重试`,
        'RATE_LIMIT_EXCEEDED',
        true,
        {
          retryAfter: rateLimitResult.retryAfter,
          limit: rateLimitResult.limit,
          current: rateLimitResult.current,
        }
      );
      
      this.logger.warn('AI API调用被速率限制', {
        taskId,
        limit: rateLimitResult.limit,
        current: rateLimitResult.current,
        retryAfter: rateLimitResult.retryAfter,
      });
      
      throw error;
    }

    // 获取并发控制权限
    const concurrencyResult = await this.concurrencyController.acquire(taskId);
    
    if (!concurrencyResult.acquired) {
      // 等待获取权限
      const acquired = await this.concurrencyController.waitForAcquisition(taskId);
      
      if (!acquired) {
        throw new AIClientError(
          'AI API并发控制超时，系统繁忙请稍后重试',
          'CONCURRENCY_TIMEOUT',
          true,
          {
            currentConcurrency: concurrencyResult.currentConcurrency,
            queueLength: concurrencyResult.queueLength,
          }
        );
      }
    }

    try {
      const response = await withRetry(
        () => this.client.complete(request),
        AI_SERVICE_RETRY_OPTIONS,
        'AI completion'
      );

      this.logger.info('AI completion successful', {
        taskId,
        contentLength: response.content.length,
        tokensUsed: response.usage?.totalTokens,
        model: response.model,
      });

      return response;
      
    } catch (error) {
      this.logger.error('AI completion failed', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
        provider: this.config.provider,
        model: this.config.model,
      });
      throw error;
      
    } finally {
      // 释放并发控制权限
      await this.concurrencyController.release(taskId);
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isHealthy = await this.client.healthCheck();
      
      this.logger.debug('AI client health check', {
        provider: this.config.provider,
        healthy: isHealthy,
      });

      return isHealthy;
    } catch (error) {
      this.logger.warn('AI client health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 获取配置信息
   */
  getConfig(): AIModelConfig {
    return { ...this.config };
  }
}

/**
 * 从环境变量创建默认 AI 客户端
 */
export function createDefaultAIClient(): AIClient {
  const config: AIModelConfig = {
    provider: (process.env.AI_PROVIDER as AIProvider) || 'openai',
    model: process.env.AI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
    timeout: parseInt(process.env.AI_TIMEOUT || '60000'),
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_API_BASE_URL,
  };

  return new AIClient(config);
}
