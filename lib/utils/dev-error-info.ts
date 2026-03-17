import { logger } from '@/lib/utils/logger';

/**
 * 开发环境错误信息接口
 */
export interface DevErrorInfo {
  /** 错误ID */
  id: string;
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
  /** 请求信息 */
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  /** 响应信息 */
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: any;
  };
  /** 环境信息 */
  environment: {
    nodeVersion: string;
    platform: string;
    timestamp: string;
  };
  /** 上下文信息 */
  context?: Record<string, any>;
}

/**
 * 开发环境错误信息收集器
 */
export class DevErrorInfoCollector {
  /**
   * 收集详细错误信息
   * @param error - 错误对象
   * @param request - 请求对象
   * @param context - 上下文信息
   * @returns 详细错误信息
   */
  static collect(
    error: Error,
    request?: any,
    context?: Record<string, any>
  ): DevErrorInfo {
    return {
      id: `dev_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: error.message,
      stack: error.stack,
      request: request ? this.extractRequestInfo(request) : undefined,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString(),
      },
      context: this.sanitizeContext(context),
    };
  }

  /**
   * 提取请求信息
   * @param request - 请求对象
   * @returns 请求信息
   */
  private static extractRequestInfo(request: any): DevErrorInfo['request'] {
    try {
      return {
        method: request.method || 'UNKNOWN',
        url: request.url || request.nextUrl?.pathname || 'UNKNOWN',
        headers: this.sanitizeHeaders(request.headers),
        body: request.body ? this.sanitizeBody(request.body) : undefined,
      };
    } catch (err) {
      logger.warn('提取请求信息失败', { error: err });
      return {
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        headers: {},
      };
    }
  }

  /**
   * 清理请求头信息
   * @param headers - 原始请求头
   * @returns 清理后的请求头
   */
  private static sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    try {
      const headerEntries = headers instanceof Headers 
        ? Array.from(headers.entries())
        : Object.entries(headers || {});

      for (const [key, value] of headerEntries) {
        const lowerKey = key.toLowerCase();
        if (sensitiveHeaders.includes(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = String(value);
        }
      }
    } catch (err) {
      logger.warn('清理请求头失败', { error: err });
    }

    return sanitized;
  }

  /**
   * 清理请求体信息
   * @param body - 原始请求体
   * @returns 清理后的请求体
   */
  private static sanitizeBody(body: any): any {
    try {
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          return this.sanitizeObject(parsed);
        } catch {
          return '[NON_JSON_BODY]';
        }
      }
      return this.sanitizeObject(body);
    } catch (err) {
      return '[BODY_SANITIZATION_ERROR]';
    }
  }

  /**
   * 清理上下文信息
   * @param context - 原始上下文
   * @returns 清理后的上下文
   */
  private static sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;
    return this.sanitizeObject(context);
  }

  /**
   * 清理对象中的敏感信息
   * @param obj - 原始对象
   * @returns 清理后的对象
   */
  private static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 格式化错误信息为可读字符串
   * @param errorInfo - 错误信息
   * @returns 格式化的字符串
   */
  static format(errorInfo: DevErrorInfo): string {
    const sections = [
      `错误ID: ${errorInfo.id}`,
      `时间: ${errorInfo.environment.timestamp}`,
      `消息: ${errorInfo.message}`,
    ];

    if (errorInfo.request) {
      sections.push(`请求: ${errorInfo.request.method} ${errorInfo.request.url}`);
    }

    if (errorInfo.stack) {
      sections.push(`堆栈:\n${errorInfo.stack}`);
    }

    if (errorInfo.context) {
      sections.push(`上下文:\n${JSON.stringify(errorInfo.context, null, 2)}`);
    }

    return sections.join('\n\n');
  }
}

/**
 * 开发环境错误详情组件数据
 */
export interface DevErrorDisplayData {
  /** 错误信息 */
  errorInfo: DevErrorInfo;
  /** 是否展开详情 */
  expanded: boolean;
  /** 复制到剪贴板的回调 */
  onCopy?: (text: string) => void;
}

/**
 * 生成开发环境错误报告
 * @param error - 错误对象
 * @param request - 请求对象
 * @param context - 上下文信息
 * @returns 错误报告
 */
export function generateDevErrorReport(
  error: Error,
  request?: any,
  context?: Record<string, any>
): string {
  const errorInfo = DevErrorInfoCollector.collect(error, request, context);
  return DevErrorInfoCollector.format(errorInfo);
}

/**
 * 记录开发环境错误
 * @param error - 错误对象
 * @param request - 请求对象
 * @param context - 上下文信息
 */
export function logDevError(
  error: Error,
  request?: any,
  context?: Record<string, any>
): void {
  if (process.env.NODE_ENV !== 'development') return;

  const errorInfo = DevErrorInfoCollector.collect(error, request, context);
  
  logger.error('开发环境详细错误信息', {
    errorId: errorInfo.id,
    errorInfo,
    type: 'dev_error_detail',
  });

  // 在控制台输出格式化的错误信息
  console.group(`🚨 开发环境错误详情 [${errorInfo.id}]`);
  console.error('错误消息:', errorInfo.message);
  
  if (errorInfo.request) {
    console.log('请求信息:', errorInfo.request);
  }
  
  if (errorInfo.context) {
    console.log('上下文:', errorInfo.context);
  }
  
  if (errorInfo.stack) {
    console.error('错误堆栈:', errorInfo.stack);
  }
  
  console.groupEnd();
}