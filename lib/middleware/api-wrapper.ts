import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse, ApiError } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * API处理函数类型
 */
type ApiHandler<T = any> = (request: NextRequest, context?: any) => Promise<T>;

/**
 * API包装器选项
 */
interface ApiWrapperOptions {
  /** 是否启用请求日志 */
  enableLogging?: boolean;
  /** 自定义成功消息 */
  successMessage?: string;
  /** 自定义错误消息 */
  errorMessage?: string;
  /** 是否返回原始响应（不包装） */
  rawResponse?: boolean;
}

/**
 * 统一的API包装器
 * 
 * 这个函数提供了统一的API处理逻辑，包括：
 * - 错误处理和响应格式化
 * - 请求日志记录
 * - 性能监控
 * - 统一的响应格式
 * 
 * @param handler API处理函数
 * @param options 包装器选项
 * @returns Next.js API路由处理函数
 */
export function withApiWrapper<T = any>(
  handler: ApiHandler<T>,
  options: ApiWrapperOptions = {}
): (request: NextRequest, context?: any) => Promise<NextResponse> {
  const {
    enableLogging = true,
    successMessage = '操作成功',
    rawResponse = false,
  } = options;

  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // 创建请求日志器
    const reqLogger = enableLogging ? logger.child({
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
    }) : null;

    try {
      reqLogger?.info('API请求开始');

      // 执行API处理函数
      const result = await handler(request, context);

      const duration = Date.now() - startTime;
      reqLogger?.info('API请求成功', { duration });

      // 如果是原始响应模式，直接返回结果
      if (rawResponse) {
        return result instanceof NextResponse ? result : NextResponse.json(result);
      }

      // 包装成功响应
      return successResponse(result, successMessage);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      reqLogger?.error('API请求失败', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        duration,
      });

      // 处理ApiError
      if (error instanceof ApiError) {
        return errorResponse(error.code, error.message, error.statusCode);
      }

      // 处理其他错误
      return errorResponse(
        ApiCode.INTERNAL_ERROR,
        options.errorMessage ?? errorMessage,
        500
      );
    }
  };
}

/**
 * 创建API路由的便捷函数
 * 
 * 使用示例：
 * ```typescript
 * export const GET = createApiRoute(async (request) => {
 *   return { message: 'Hello World' };
 * });
 * ```
 */
export function createApiRoute<T = any>(
  handler: ApiHandler<T>,
  options?: ApiWrapperOptions
) {
  return withApiWrapper(handler, options);
}

/**
 * 支持多个HTTP方法的API路由创建器
 * 
 * 使用示例：
 * ```typescript
 * const { GET, POST } = createApiRoutes({
 *   GET: async (request) => ({ data: 'get' }),
 *   POST: async (request) => ({ data: 'post' }),
 * });
 * 
 * export { GET, POST };
 * ```
 */
export function createApiRoutes<T = any>(
  handlers: Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', ApiHandler<T>>>,
  options?: ApiWrapperOptions
) {
  const routes: Partial<Record<string, (request: NextRequest, context?: any) => Promise<NextResponse>>> = {};

  for (const [method, handler] of Object.entries(handlers)) {
    if (handler) {
      routes[method] = withApiWrapper(handler, options);
    }
  }

  return routes;
}

/**
 * 带认证的API包装器
 * 
 * 这个包装器会自动处理认证逻辑
 */
export function withAuthApiWrapper<T = any>(
  handler: ApiHandler<T>,
  options: ApiWrapperOptions & {
    /** 认证中间件 */
    authMiddleware?: (request: NextRequest) => Promise<any>;
  } = {}
): (request: NextRequest, context?: any) => Promise<NextResponse> {
  return withApiWrapper(async (request: NextRequest, context?: any) => {
    // 执行认证
    if (options.authMiddleware) {
      const authResult = await options.authMiddleware(request);
      if (authResult instanceof NextResponse) {
        throw new ApiError(ApiCode.UNAUTHORIZED, '认证失败');
      }
    }

    // 执行原始处理函数
    return handler(request, context);
  }, options);
}