import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { ApiError, errorResponse, internalErrorResponse } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { v4 as uuidv4 } from 'uuid';

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  /** 客户端错误 - 请求参数、格式等问题 */
  CLIENT_ERROR = 'client_error',
  /** 服务端错误 - 系统内部错误 */
  SERVER_ERROR = 'server_error',
  /** 业务逻辑错误 - 业务规则违反 */
  BUSINESS_ERROR = 'business_error',
  /** 外部服务错误 - 第三方服务不可用 */
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
  /** 网络错误 - 连接、超时等 */
  NETWORK_ERROR = 'network_error',
  /** 安全错误 - 认证、授权等 */
  SECURITY_ERROR = 'security_error',
}

/**
 * 错误严重程度枚举
 */
export enum ErrorSeverity {
  /** 低 - 不影响核心功能 */
  LOW = 'low',
  /** 中 - 影响部分功能 */
  MEDIUM = 'medium',
  /** 高 - 影响核心功能 */
  HIGH = 'high',
  /** 严重 - 系统不可用 */
  CRITICAL = 'critical',
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 请求ID */
  requestId?: string;
  /** 用户ID */
  userId?: string;
  /** 请求路径 */
  path?: string;
  /** HTTP方法 */
  method?: string;
  /** 客户端IP */
  clientIp?: string;
  /** 用户代理 */
  userAgent?: string;
  /** 请求参数 */
  params?: Record<string, any>;
  /** 请求体 */
  body?: any;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 结构化错误信息
 */
export interface StructuredError {
  /** 错误ID */
  id: string;
  /** 错误代码 */
  code: number;
  /** 错误消息 */
  message: string;
  /** 错误分类 */
  category: ErrorCategory;
  /** 严重程度 */
  severity: ErrorSeverity;
  /** 是否可重试 */
  retryable: boolean;
  /** 错误上下文 */
  context: ErrorContext;
  /** 原始错误 */
  originalError?: Error;
  /** 错误堆栈 */
  stack?: string;
  /** 发生时间 */
  timestamp: number;
}

/**
 * 错误恢复策略
 */
export interface ErrorRecoveryStrategy {
  /** 策略名称 */
  name: string;
  /** 是否可以自动恢复 */
  canAutoRecover: boolean;
  /** 恢复建议 */
  suggestion: string;
  /** 重试配置 */
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
    exponential: boolean;
  };
}

/**
 * 全局错误处理器类
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private errorPatterns: Map<RegExp, ErrorCategory> = new Map();
  private recoveryStrategies: Map<ErrorCategory, ErrorRecoveryStrategy> = new Map();

  private constructor() {
    this.initializeErrorPatterns();
    this.initializeRecoveryStrategies();
    this.setupGlobalHandlers();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  /**
   * 初始化错误模式匹配
   */
  private initializeErrorPatterns(): void {
    const patterns = [
      // 网络错误模式
      [/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i, ErrorCategory.NETWORK_ERROR],
      [/timeout|timed out/i, ErrorCategory.NETWORK_ERROR],
      
      // 数据库错误模式
      [/mysql|database|connection|sql/i, ErrorCategory.EXTERNAL_SERVICE_ERROR],
      
      // Redis错误模式
      [/redis|cache/i, ErrorCategory.EXTERNAL_SERVICE_ERROR],
      
      // AI服务错误模式
      [/ai service|openai|claude|model/i, ErrorCategory.EXTERNAL_SERVICE_ERROR],
      
      // Git服务错误模式
      [/git|github|gitlab|repository/i, ErrorCategory.EXTERNAL_SERVICE_ERROR],
      
      // 认证错误模式
      [/unauthorized|forbidden|authentication|authorization/i, ErrorCategory.SECURITY_ERROR],
      
      // 验证错误模式
      [/validation|invalid|required|missing/i, ErrorCategory.CLIENT_ERROR],
    ] as const;

    patterns.forEach(([pattern, category]) => {
      this.errorPatterns.set(pattern, category);
    });
  }

  /**
   * 初始化恢复策略
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies.set(ErrorCategory.NETWORK_ERROR, {
      name: '网络重试',
      canAutoRecover: true,
      suggestion: '检查网络连接，稍后重试',
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        exponential: true,
      },
    });

    this.recoveryStrategies.set(ErrorCategory.EXTERNAL_SERVICE_ERROR, {
      name: '服务重试',
      canAutoRecover: true,
      suggestion: '外部服务暂时不可用，请稍后重试',
      retryConfig: {
        maxRetries: 2,
        backoffMs: 2000,
        exponential: true,
      },
    });

    this.recoveryStrategies.set(ErrorCategory.CLIENT_ERROR, {
      name: '参数修正',
      canAutoRecover: false,
      suggestion: '请检查请求参数格式和内容',
    });

    this.recoveryStrategies.set(ErrorCategory.SECURITY_ERROR, {
      name: '权限验证',
      canAutoRecover: false,
      suggestion: '请检查认证信息和访问权限',
    });

    this.recoveryStrategies.set(ErrorCategory.BUSINESS_ERROR, {
      name: '业务规则检查',
      canAutoRecover: false,
      suggestion: '请检查业务逻辑和数据状态',
    });

    this.recoveryStrategies.set(ErrorCategory.SERVER_ERROR, {
      name: '系统恢复',
      canAutoRecover: false,
      suggestion: '系统内部错误，请联系管理员',
    });
  }

  /**
   * 设置全局异常处理器
   */
  private setupGlobalHandlers(): void {
    // 处理未捕获的异常
    process.on('uncaughtException', (error: Error) => {
      const structuredError = this.createStructuredError(error, {
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.CRITICAL,
      });
      
      logger.error('未捕获的异常', {
        errorId: structuredError.id,
        error: structuredError.message,
        stack: structuredError.stack,
        category: structuredError.category,
        severity: structuredError.severity,
      });

      // 在生产环境中，可能需要优雅关闭
      if (process.env.NODE_ENV === 'production') {
        setTimeout(() => {
          process.exit(1);
        }, 1000);
      }
    });

    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const structuredError = this.createStructuredError(error, {
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.HIGH,
      });

      logger.error('未处理的Promise拒绝', {
        errorId: structuredError.id,
        error: structuredError.message,
        stack: structuredError.stack,
        category: structuredError.category,
        severity: structuredError.severity,
        promise: promise.toString(),
      });
    });
  }

  /**
   * 分析错误并确定分类
   * @param error - 错误对象
   * @returns 错误分类
   */
  public analyzeError(error: Error): ErrorCategory {
    const searchTexts = [
      error.message.toLowerCase(),
      error.name.toLowerCase(),
      error.stack?.toLowerCase() || '',
    ];

    // 检查错误消息和堆栈
    for (const [pattern, category] of this.errorPatterns) {
      if (searchTexts.some(text => pattern.test(text))) {
        return category;
      }
    }

    // 根据错误类型判断
    if (error instanceof ApiError) {
      if (error.code >= 1000 && error.code < 2000) return ErrorCategory.CLIENT_ERROR;
      if (error.code >= 2000 && error.code < 3000) return ErrorCategory.SERVER_ERROR;
      if (error.code >= 3000) return ErrorCategory.BUSINESS_ERROR;
    }

    return ErrorCategory.SERVER_ERROR;
  }

  /**
   * 确定错误严重程度
   * @param error - 错误对象
   * @param category - 错误分类
   * @returns 错误严重程度
   */
  public determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    // 根据分类确定基础严重程度
    const baseSeverity = {
      [ErrorCategory.SECURITY_ERROR]: ErrorSeverity.HIGH,
      [ErrorCategory.NETWORK_ERROR]: ErrorSeverity.MEDIUM,
      [ErrorCategory.CLIENT_ERROR]: ErrorSeverity.LOW,
    }[category];

    if (baseSeverity) return baseSeverity;

    // 根据错误消息关键词判断
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('critical') || errorMessage.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (errorMessage.includes('database') || errorMessage.includes('redis')) {
      return ErrorSeverity.HIGH;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * 创建结构化错误信息
   */
  public createStructuredError(
    error: Error,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      retryable?: boolean;
    } = {}
  ): StructuredError {
    const category = options.category || this.analyzeError(error);
    const severity = options.severity || this.determineSeverity(error, category);
    const retryable = options.retryable ?? this.isRetryable(category);

    return {
      id: uuidv4(),
      code: error instanceof ApiError ? error.code : ApiCode.INTERNAL_ERROR,
      message: error.message,
      category,
      severity,
      retryable,
      context: options.context || {},
      originalError: error,
      stack: error.stack,
      timestamp: Date.now(),
    };
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryable(category: ErrorCategory): boolean {
    const strategy = this.recoveryStrategies.get(category);
    return strategy?.canAutoRecover || false;
  }

  /**
   * 获取错误恢复策略
   */
  public getRecoveryStrategy(category: ErrorCategory): ErrorRecoveryStrategy | undefined {
    return this.recoveryStrategies.get(category);
  }

  /**
   * 处理API错误并返回响应
   * @param error - 错误对象
   * @param request - HTTP请求对象
   * @param context - 错误上下文
   * @returns NextResponse对象
   */
  public async handleApiError(
    error: Error,
    request?: NextRequest,
    context?: ErrorContext
  ): Promise<NextResponse> {
    const requestId = context?.requestId || uuidv4();
    
    // 创建结构化错误
    const structuredError = this.createStructuredError(error, {
      context: {
        ...context,
        requestId,
        path: request?.nextUrl.pathname,
        method: request?.method,
        clientIp: this.getClientIp(request),
        userAgent: request?.headers.get('user-agent') || undefined,
      },
    });

    // 记录错误日志
    await this.logError(structuredError);

    // 如果是ApiError，直接返回对应响应
    if (error instanceof ApiError) {
      return errorResponse(error.code, error.message, error.statusCode, error.details);
    }

    // 根据错误分类返回相应的响应
    const recoveryStrategy = this.getRecoveryStrategy(structuredError.category);
    const errorMappings = {
      [ErrorCategory.CLIENT_ERROR]: () => errorResponse(ApiCode.BAD_REQUEST, structuredError.message, 400),
      [ErrorCategory.SECURITY_ERROR]: () => errorResponse(ApiCode.UNAUTHORIZED, '认证或授权失败', 401),
      [ErrorCategory.NETWORK_ERROR]: () => errorResponse(ApiCode.SERVICE_UNAVAILABLE, recoveryStrategy?.suggestion || '外部服务暂时不可用', 503),
      [ErrorCategory.EXTERNAL_SERVICE_ERROR]: () => errorResponse(ApiCode.SERVICE_UNAVAILABLE, recoveryStrategy?.suggestion || '外部服务暂时不可用', 503),
      [ErrorCategory.BUSINESS_ERROR]: () => errorResponse(ApiCode.INTERNAL_ERROR, structuredError.message, 400),
    };

    const errorHandler = errorMappings[structuredError.category];
    if (errorHandler) {
      return errorHandler();
    }

    return internalErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? structuredError.message 
        : '服务器内部错误'
    );
  }

  /**
   * 记录错误日志
   * @param structuredError - 结构化错误信息
   */
  private async logError(structuredError: StructuredError): Promise<void> {
    const logLevel = this.getLogLevel(structuredError.severity);
    const logData = {
      errorId: structuredError.id,
      code: structuredError.code,
      category: structuredError.category,
      severity: structuredError.severity,
      retryable: structuredError.retryable,
      context: structuredError.context,
      timestamp: structuredError.timestamp,
    };

    const logMethods = {
      error: () => logger.error(structuredError.message, { ...logData, stack: structuredError.stack }),
      warn: () => logger.warn(structuredError.message, logData),
      info: () => logger.info(structuredError.message, logData),
    };

    const logMethod = logMethods[logLevel] || logMethods.info;
    logMethod();

    // 对于严重错误，发送告警通知
    if (structuredError.severity === ErrorSeverity.CRITICAL) {
      await this.sendCriticalErrorAlert(structuredError);
    }
  }

  /**
   * 根据严重程度确定日志级别
   * @param severity - 错误严重程度
   * @returns 日志级别
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    const levelMap = {
      [ErrorSeverity.CRITICAL]: 'error' as const,
      [ErrorSeverity.HIGH]: 'error' as const,
      [ErrorSeverity.MEDIUM]: 'warn' as const,
      [ErrorSeverity.LOW]: 'info' as const,
    };
    
    return levelMap[severity] || 'info';
  }

  /**
   * 发送严重错误告警
   */
  private async sendCriticalErrorAlert(structuredError: StructuredError): Promise<void> {
    try {
      // 这里可以集成告警系统，如邮件、短信、Slack等
      logger.error('严重错误告警', {
        errorId: structuredError.id,
        message: structuredError.message,
        category: structuredError.category,
        context: structuredError.context,
        timestamp: new Date(structuredError.timestamp).toISOString(),
      });

      // TODO: 实现具体的告警通知逻辑
      // await notificationService.sendAlert({
      //   type: 'critical_error',
      //   title: '系统严重错误',
      //   message: structuredError.message,
      //   metadata: structuredError,
      // });
    } catch (alertError) {
      logger.error('发送错误告警失败', {
        originalErrorId: structuredError.id,
        alertError: alertError instanceof Error ? alertError.message : String(alertError),
      });
    }
  }

  /**
   * 获取客户端IP地址
   * @param request - HTTP请求对象
   * @returns 客户端IP地址
   */
  private getClientIp(request?: NextRequest): string | undefined {
    if (!request) return undefined;

    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    
    return request.headers.get('x-real-ip') || undefined;
  }

  /**
   * 创建API错误处理中间件
   */
  public createApiErrorMiddleware() {
    return async (
      handler: (request: NextRequest) => Promise<NextResponse>,
      request: NextRequest
    ): Promise<NextResponse> => {
      try {
        return await handler(request);
      } catch (error) {
        return await this.handleApiError(
          error instanceof Error ? error : new Error(String(error)),
          request
        );
      }
    };
  }
}

/**
 * 导出单例实例
 */
export const globalErrorHandler = GlobalErrorHandler.getInstance();

/**
 * API错误处理装饰器
 */
export function withErrorHandling(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return await globalErrorHandler.handleApiError(
        error instanceof Error ? error : new Error(String(error)),
        request
      );
    }
  };
}

/**
 * 异步操作错误处理包装器
 */
export async function withAsyncErrorHandling<T>(
  operation: () => Promise<T>,
  context?: {
    operationName: string;
    category?: ErrorCategory;
    retryable?: boolean;
  }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const structuredError = globalErrorHandler.createStructuredError(
      error instanceof Error ? error : new Error(String(error)),
      {
        category: context?.category,
        retryable: context?.retryable,
        context: {
          operation: context?.operationName,
        },
      }
    );

    logger.error(`操作失败: ${context?.operationName || '未知操作'}`, {
      errorId: structuredError.id,
      category: structuredError.category,
      severity: structuredError.severity,
      retryable: structuredError.retryable,
    });

    throw error;
  }
}