import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { ApiCode, ApiCodeType, getApiMessage } from '@/lib/constants/api-codes';
import { logger } from '@/lib/utils/logger';

/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = any> {
  /** 业务状态码 */
  code: number;
  /** 响应消息 */
  msg: string;
  /** 响应数据 */
  data: T | null;
  /** 时间戳 */
  timestamp: number;
  /** 请求追踪 ID */
  requestId?: string;
}

/**
 * 分页响应数据格式
 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  items: T[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页大小 */
    pageSize: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
  };
}

/**
 * 错误详情
 */
export interface ErrorDetail {
  /** 错误字段 */
  field?: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
}

/**
 * 自定义 API 错误类
 */
export class ApiError extends Error {
  constructor(
    public code: ApiCodeType,
    message?: string,
    public statusCode?: number,
    public details?: ErrorDetail[]
  ) {
    super(message || getApiMessage(code));
    this.name = 'ApiError';
  }
}

/**
 * 映射业务状态码到 HTTP 状态码
 * @param code - 业务状态码
 * @returns HTTP 状态码
 */
function mapCodeToHttpStatus(code: ApiCodeType): number {
  if (code === ApiCode.SUCCESS) return 200;
  
  // 客户端错误 (1xxx)
  if (code >= 1000 && code < 2000) {
    switch (code) {
      case ApiCode.UNAUTHORIZED:
        return 401;
      case ApiCode.FORBIDDEN:
        return 403;
      case ApiCode.NOT_FOUND:
        return 404;
      case ApiCode.RATE_LIMIT_EXCEEDED:
        return 429;
      default:
        return 400;
    }
  }
  
  // 服务端错误 (2xxx) 和业务错误 (3xxx)
  if (code >= 2000) {
    switch (code) {
      case ApiCode.SERVICE_UNAVAILABLE:
        return 503;
      case ApiCode.TIMEOUT_ERROR:
        return 504;
      default:
        return 500;
    }
  }
  
  return 500;
}

/**
 * 创建成功响应
 * @param data - 响应数据
 * @param message - 自定义消息
 * @param statusCode - HTTP 状态码
 * @param existingRequestId - 已存在的请求ID（可选）
 * @returns NextResponse 对象
 */
export function successResponse<T>(
  data: T,
  message?: string,
  statusCode = 200,
  existingRequestId?: string
): NextResponse<ApiResponse<T>> {
  const requestId = existingRequestId ?? uuidv4();
  const response: ApiResponse<T> = {
    code: ApiCode.SUCCESS,
    msg: message || getApiMessage(ApiCode.SUCCESS),
    data,
    timestamp: Date.now(),
    requestId,
  };

  logger.debug('API Success Response', { 
    requestId, 
    statusCode,
    dataType: typeof data,
    hasData: data !== null && data !== undefined
  });

  return NextResponse.json(response, { status: statusCode });
}

/**
 * 创建分页成功响应
 * @param items - 数据列表
 * @param page - 当前页码
 * @param pageSize - 每页大小
 * @param total - 总记录数
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function paginatedResponse<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
  message?: string
): NextResponse<ApiResponse<PaginatedResponse<T>>> {
  const data: PaginatedResponse<T> = {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };

  const requestId = uuidv4();
  logger.debug('API Paginated Response', {
    requestId,
    page,
    pageSize,
    total,
    itemCount: items.length,
  });

  return successResponse(data, message);
}

/**
 * 创建错误响应
 * @param code - 业务状态码
 * @param message - 自定义错误消息
 * @param statusCode - HTTP 状态码
 * @param details - 错误详情
 * @param existingRequestId - 已存在的请求ID（可选）
 * @returns NextResponse 对象
 */
export function errorResponse(
  code: ApiCodeType,
  message?: string,
  statusCode?: number,
  details?: ErrorDetail[],
  existingRequestId?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  const requestId = existingRequestId ?? uuidv4();
  const httpStatus = statusCode || mapCodeToHttpStatus(code);
  const errorMessage = message || getApiMessage(code);
  
  const response: ApiResponse<{ errors: ErrorDetail[] } | null> = {
    code,
    msg: errorMessage,
    data: details ? { errors: details } : null,
    timestamp: Date.now(),
    requestId,
  };

  logger.warn('API Error Response', {
    requestId,
    code,
    message: errorMessage,
    httpStatus,
    hasDetails: !!details,
  });

  return NextResponse.json(response, { status: httpStatus });
}

/**
 * 创建验证错误响应
 * @param errors - 验证错误列表
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function validationErrorResponse(
  errors: ErrorDetail[],
  message?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    ApiCode.VALIDATION_ERROR,
    message || getApiMessage(ApiCode.VALIDATION_ERROR),
    400,
    errors
  );
}

/**
 * 创建未授权响应
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function unauthorizedResponse(
  message?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    ApiCode.UNAUTHORIZED,
    message || getApiMessage(ApiCode.UNAUTHORIZED),
    401
  );
}

/**
 * 创建禁止访问响应
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function forbiddenResponse(
  message?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    ApiCode.FORBIDDEN,
    message || getApiMessage(ApiCode.FORBIDDEN),
    403
  );
}

/**
 * 创建资源不存在响应
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function notFoundResponse(
  message?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    ApiCode.NOT_FOUND,
    message || getApiMessage(ApiCode.NOT_FOUND),
    404
  );
}

/**
 * 创建服务器错误响应
 * @param message - 自定义消息
 * @param code - 业务状态码
 * @param existingRequestId - 已存在的请求ID（可选）
 * @returns NextResponse 对象
 */
export function internalErrorResponse(
  message?: string,
  code: ApiCodeType = ApiCode.INTERNAL_ERROR,
  existingRequestId?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    code,
    message || getApiMessage(code),
    500,
    undefined,
    existingRequestId
  );
}

/**
 * 创建业务错误响应
 * @param code - 业务状态码
 * @param message - 自定义消息
 * @returns NextResponse 对象
 */
export function businessErrorResponse(
  code: ApiCodeType,
  message?: string
): NextResponse<ApiResponse<{ errors: ErrorDetail[] } | null>> {
  return errorResponse(
    code,
    message || getApiMessage(code)
  );
}

/**
 * API 请求处理包装器
 * 统一处理异常和响应格式
 * @param handler - 请求处理函数
 * @param errorMessage - 默认错误消息
 * @param existingRequestId - 已存在的请求ID（可选）
 * @returns NextResponse 对象
 */
export async function handleApiRequest<T>(
  handler: () => Promise<T>,
  errorMessage?: string,
  existingRequestId?: string
): Promise<NextResponse<ApiResponse<T | { errors: ErrorDetail[] } | null>>> {
  const requestId = existingRequestId ?? uuidv4();
  const startTime = Date.now();
  let success = false;
  
  logger.setContext({ requestId });
  logger.debug('API Request Start', { requestId });
  
  try {
    const result = await handler();
    success = true;
    return successResponse(result, undefined, 200, requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      logger.warn('API Business Error', {
        requestId,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
      
      return errorResponse(error.code, error.message, error.statusCode, error.details, requestId);
    }
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('API Unexpected Error', {
      requestId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    const finalErrorMessage = errorMessage ?? errorMsg ?? '服务器内部错误';
    return internalErrorResponse(finalErrorMessage, ApiCode.INTERNAL_ERROR, requestId);
  } finally {
    const duration = Date.now() - startTime;
    logger.performance('API Request', duration, { requestId, success });
    logger.clearContext();
  }
}

/**
 * 异步操作包装器，自动处理常见错误
 * @param operation - 异步操作
 * @param operationName - 操作名称，用于日志
 * @returns 操作结果
 */
export async function wrapAsyncOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    logger.debug(`Starting ${operationName}`);
    const result = await operation();
    logger.debug(`Completed ${operationName}`);
    return result;
  } catch (error) {
    logger.error(`Failed ${operationName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('timeout')) {
        throw new ApiError(ApiCode.TIMEOUT_ERROR, `${operationName} 超时`);
      }
      if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        throw new ApiError(ApiCode.NETWORK_ERROR, `${operationName} 网络错误`);
      }
      if (errorMessage.includes('database') || errorMessage.includes('mysql')) {
        throw new ApiError(ApiCode.DATABASE_ERROR, `${operationName} 数据库错误`);
      }
      if (errorMessage.includes('redis')) {
        throw new ApiError(ApiCode.REDIS_ERROR, `${operationName} 缓存错误`);
      }
    }
    
    throw new ApiError(ApiCode.INTERNAL_ERROR, `${operationName} 执行失败`);
  }
}

/**
 * 参数验证辅助函数
 * @param params - 参数对象
 * @param requiredFields - 必填字段列表
 * @throws ApiError 当验证失败时
 */
export function validateRequiredFields(
  params: Record<string, any>,
  requiredFields: string[]
): void {
  const errors: ErrorDetail[] = [];
  
  for (const field of requiredFields) {
    const value = params[field];
    if (value === undefined || value === null || value === '') {
      errors.push({
        field,
        message: `${field} 是必填字段`,
        code: 'REQUIRED',
      });
    }
  }
  
  if (errors.length > 0) {
    throw new ApiError(ApiCode.MISSING_REQUIRED_FIELD, '缺少必填字段', 400, errors);
  }
}

/**
 * 分页参数验证和标准化
 * @param page - 页码
 * @param pageSize - 每页大小
 * @returns 标准化的分页参数
 */
export function validatePaginationParams(
  page?: string | number,
  pageSize?: string | number
): { page: number; pageSize: number } {
  const normalizedPage = Math.max(1, parseInt(String(page || 1)));
  const normalizedPageSize = Math.min(100, Math.max(1, parseInt(String(pageSize || 20))));
  
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}