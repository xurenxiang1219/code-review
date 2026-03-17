import { NextRequest, NextResponse } from 'next/server';
import { globalErrorHandler } from '@/lib/utils/global-error-handler';
import { logDevError } from '@/lib/utils/dev-error-info';
import { logger } from '@/lib/utils/logger';
import { ApiError } from '@/lib/utils/api-response';
import { v4 as uuidv4 } from 'uuid';

/**
 * API错误处理中间件
 * 
 * 统一处理API路由中的错误，提供：
 * - 全局错误捕获和处理
 * - 结构化错误日志记录
 * - 开发环境详细错误信息
 * - 用户友好的错误响应
 * 
 * 使用方式：
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   return withErrorHandler(async () => {
 *     // 你的API逻辑
 *     return successResponse(data);
 *   }, request);
 * }
 * ```
 */

/**
 * 错误处理中间件包装器
 * @param handler - API处理函数
 * @param request - HTTP请求对象
 * @param context - 额外上下文信息
 * @returns 处理结果或错误响应
 */
export async function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>,
  request: NextRequest,
  context?: Record<string, any>
): Promise<NextResponse<T>> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // 设置请求上下文
  const requestContext = {
    requestId,
    method: request.method,
    url: request.nextUrl.pathname,
    userAgent: request.headers.get('user-agent'),
    ...context,
  };

  logger.setContext(requestContext);

  try {
    logger.debug('API请求开始处理', {
      method: request.method,
      url: request.nextUrl.pathname,
    });

    const result = await handler();
    
    const duration = Date.now() - startTime;
    logger.info('API请求处理成功', {
      duration,
      status: result.status,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // 记录开发环境详细错误信息
    if (process.env.NODE_ENV === 'development') {
      logDevError(errorObj, request, requestContext);
    }

    logger.error('API请求处理失败', {
      duration,
      error: errorObj.message,
      stack: errorObj.stack,
    });

    // 使用全局错误处理器处理错误
    return await globalErrorHandler.handleApiError(
      errorObj,
      request,
      requestContext
    ) as NextResponse<T>;
  } finally {
    logger.clearContext();
  }
}

/**
 * 异步操作错误处理装饰器
 * @param operationName - 操作名称
 * @returns 装饰器函数
 */
export function handleAsyncErrors(operationName: string) {
  return function <T extends any[], R>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const method = descriptor.value;
    if (!method) return descriptor;

    descriptor.value = async function (...args: T): Promise<R> {
      try {
        logger.debug(`开始执行异步操作: ${operationName}`);
        const result = await method.apply(this, args);
        logger.debug(`异步操作执行成功: ${operationName}`);
        return result;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        
        logger.error(`异步操作执行失败: ${operationName}`, {
          error: errorObj.message,
          stack: errorObj.stack,
          operation: operationName,
        });

        // 在开发环境记录详细错误信息
        if (process.env.NODE_ENV === 'development') {
          logDevError(errorObj, undefined, {
            operation: operationName,
            args: args.length > 0 ? '[ARGS_PROVIDED]' : undefined,
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 数据库操作错误处理包装器
 * @param operation - 数据库操作函数
 * @param operationName - 操作名称
 * @returns 操作结果
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // 检查是否为数据库连接错误
    if (errorObj.message.includes('ECONNREFUSED') || 
        errorObj.message.includes('connect ETIMEDOUT')) {
      throw new ApiError(
        2001, // DATABASE_ERROR
        `数据库连接失败: ${operationName}`,
        503
      );
    }

    // 检查是否为SQL语法错误
    if (errorObj.message.includes('ER_PARSE_ERROR') ||
        errorObj.message.includes('syntax error')) {
      logger.error(`SQL语法错误: ${operationName}`, {
        error: errorObj.message,
        operation: operationName,
      });
      
      throw new ApiError(
        2001, // DATABASE_ERROR
        process.env.NODE_ENV === 'development' 
          ? `SQL错误: ${errorObj.message}`
          : '数据库查询错误',
        500
      );
    }

    // 其他数据库错误
    logger.error(`数据库操作失败: ${operationName}`, {
      error: errorObj.message,
      operation: operationName,
    });

    throw new ApiError(
      2001, // DATABASE_ERROR
      `数据库操作失败: ${operationName}`,
      500
    );
  }
}

/**
 * 外部服务调用错误处理包装器
 * @param operation - 外部服务调用函数
 * @param serviceName - 服务名称
 * @param operationName - 操作名称
 * @returns 操作结果
 */
export async function withExternalServiceErrorHandling<T>(
  operation: () => Promise<T>,
  serviceName: string,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // 检查是否为网络错误
    if (errorObj.message.includes('ECONNREFUSED') ||
        errorObj.message.includes('ENOTFOUND') ||
        errorObj.message.includes('timeout')) {
      throw new ApiError(
        2008, // SERVICE_UNAVAILABLE
        `${serviceName}服务不可用: ${operationName}`,
        503
      );
    }

    // 检查是否为认证错误
    if (errorObj.message.includes('401') || 
        errorObj.message.includes('Unauthorized')) {
      throw new ApiError(
        2003, // AI_SERVICE_ERROR (或其他服务错误)
        `${serviceName}服务认证失败: ${operationName}`,
        401
      );
    }

    // 检查是否为配额超限
    if (errorObj.message.includes('quota') ||
        errorObj.message.includes('rate limit')) {
      throw new ApiError(
        3009, // AI_QUOTA_EXCEEDED
        `${serviceName}服务配额已用完: ${operationName}`,
        429
      );
    }

    // 其他外部服务错误
    logger.error(`外部服务调用失败: ${serviceName}.${operationName}`, {
      error: errorObj.message,
      service: serviceName,
      operation: operationName,
    });

    throw new ApiError(
      2008, // SERVICE_UNAVAILABLE
      `${serviceName}服务暂时不可用`,
      503
    );
  }
}

/**
 * 业务逻辑错误处理包装器
 * @param operation - 业务逻辑函数
 * @param operationName - 操作名称
 * @returns 操作结果
 */
export async function withBusinessLogicErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // 如果已经是ApiError，直接抛出
    if (error instanceof ApiError) {
      throw error;
    }

    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.warn(`业务逻辑错误: ${operationName}`, {
      error: errorObj.message,
      operation: operationName,
    });

    // 将业务逻辑错误转换为适当的ApiError
    throw new ApiError(
      1000, // BAD_REQUEST
      errorObj.message,
      400
    );
  }
}

/**
 * 文件操作错误处理包装器
 * @param operation - 文件操作函数
 * @param operationName - 操作名称
 * @returns 操作结果
 */
export async function withFileOperationErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // 检查是否为文件不存在错误
    if (errorObj.message.includes('ENOENT')) {
      throw new ApiError(
        1004, // NOT_FOUND
        `文件不存在: ${operationName}`,
        404
      );
    }

    // 检查是否为权限错误
    if (errorObj.message.includes('EACCES') ||
        errorObj.message.includes('EPERM')) {
      throw new ApiError(
        1003, // FORBIDDEN
        `文件权限不足: ${operationName}`,
        403
      );
    }

    // 检查是否为磁盘空间不足
    if (errorObj.message.includes('ENOSPC')) {
      throw new ApiError(
        2000, // INTERNAL_ERROR
        `磁盘空间不足: ${operationName}`,
        507
      );
    }

    // 其他文件操作错误
    logger.error(`文件操作失败: ${operationName}`, {
      error: errorObj.message,
      operation: operationName,
    });

    throw new ApiError(
      2000, // INTERNAL_ERROR
      `文件操作失败: ${operationName}`,
      500
    );
  }
}