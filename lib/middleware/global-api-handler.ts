import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse, ApiError } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * 全局API处理中间件
 * 
 * 这个中间件会自动拦截所有/api路由的响应，
 * 并统一处理错误和响应格式化
 */

/**
 * API响应包装器
 * 
 * 这个函数会在middleware.ts中被调用，
 * 自动包装所有API路由的响应
 */
export async function wrapApiResponse(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  // 只处理API路由
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return response;
  }

  // 如果响应已经是错误状态，不需要再包装
  if (!response.ok) {
    return response;
  }

  try {
    // 获取响应内容
    const responseText = await response.text();
    
    // 如果响应为空，返回默认成功响应
    if (!responseText) {
      return successResponse(null, '操作成功');
    }

    // 尝试解析JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // 如果不是JSON，直接返回原响应
      return response;
    }

    // 检查是否已经是标准API响应格式
    if (isStandardApiResponse(responseData)) {
      return response;
    }

    // 包装成标准格式
    return successResponse(responseData, '操作成功');

  } catch (error) {
    logger.error('API响应包装失败', {
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
    });

    return response; // 返回原响应
  }
}

/**
 * 检查是否是标准API响应格式
 */
function isStandardApiResponse(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    'msg' in data &&
    'data' in data &&
    'timestamp' in data
  );
}

/**
 * 全局错误处理中间件
 * 
 * 这个中间件会捕获所有未处理的错误，
 * 并返回统一的错误响应格式
 */
export function createGlobalErrorHandler() {
  return async (request: NextRequest, error: Error): Promise<NextResponse> => {
    const requestId = uuidv4();
    
    logger.error('全局API错误', {
      requestId,
      url: request.url,
      method: request.method,
      error: error.message,
      stack: error.stack,
    });

    // 处理ApiError
    if (error instanceof ApiError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }

    // 处理其他错误
    return errorResponse(
      ApiCode.INTERNAL_ERROR,
      '服务器内部错误',
      500
    );
  };
}

/**
 * API性能监控中间件
 */
export function createPerformanceMonitor() {
  return (request: NextRequest, response: NextResponse, duration: number) => {
    // 只监控API路由
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return;
    }

    const requestId = request.headers.get('x-request-id') ?? uuidv4();
    
    logger.info('API性能监控', {
      requestId,
      method: request.method,
      url: request.url,
      status: response.status,
      duration,
      userAgent: request.headers.get('user-agent'),
    });

    // 如果响应时间过长，记录警告
    if (duration > 5000) {
      logger.warn('API响应时间过长', {
        requestId,
        url: request.url,
        duration,
      });
    }
  };
}

/**
 * 请求日志中间件
 */
export function createRequestLogger() {
  return (request: NextRequest) => {
    // 只记录API路由
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return;
    }

    const requestId = uuidv4();
    
    logger.info('API请求开始', {
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
    });

    // 将requestId添加到请求头中，供后续中间件使用
    request.headers.set('x-request-id', requestId);
  };
}