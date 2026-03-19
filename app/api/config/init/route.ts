import { NextRequest, NextResponse } from 'next/server';
import { configRepository } from '@/lib/db/repositories/config';
import { ApiCode } from '@/lib/constants/api-codes';
import { logger } from '@/lib/utils/logger';
import { apiRoute, apiRoutes } from '@/lib/utils/api-response';

/**
 * 配置初始化 API
 * 
 * 提供无需认证的配置初始化功能，用于首次设置
 */

/**
 * 验证仓库参数并创建日志器
 * @param request - Next.js请求对象
 * @param method - HTTP方法
 * @returns 验证结果，包含requestId、logger和repository，或错误响应
 */
function validateAndCreateLogger(request: NextRequest, method: string) {
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({
    requestId,
    endpoint: '/api/config/init',
    method,
  });

  const repository = request.nextUrl.searchParams.get('repository');

  if (!repository) {
    return {
      error: NextResponse.json({
        code: ApiCode.BAD_REQUEST,
        msg: '缺少仓库参数',
        timestamp: Date.now(),
        requestId,
      }, { status: 400 })
    };
  }

  return { requestId, reqLogger, repository };
}

/**
 * 创建成功响应
 * @param data - 响应数据
 * @param message - 成功消息
 * @param requestId - 请求ID
 * @returns Next.js响应对象
 */
function createSuccessResponse(data: any, message: string, requestId: string) {
  return NextResponse.json({
    code: ApiCode.SUCCESS,
    msg: message,
    data,
    timestamp: Date.now(),
    requestId,
  });
}

/**
 * 创建错误响应
 * @param code - 错误代码
 * @param message - 错误消息
 * @param requestId - 请求ID
 * @param status - HTTP状态码
 * @returns Next.js响应对象
 */
function createErrorResponse(code: number, message: string, requestId: string, status: number) {
  return NextResponse.json({
    code,
    msg: message,
    timestamp: Date.now(),
    requestId,
  }, { status });
}

/**
 * 转换数据库结果为配置对象
 * @param result - 数据库查询结果
 * @returns 格式化的配置对象
 */
function transformDatabaseResult(result: any) {
  return {
    id: result.id,
    repository: result.repository,
    reviewFocus: JSON.parse(result.review_focus),
    fileWhitelist: JSON.parse(result.file_whitelist),
    ignorePatterns: JSON.parse(result.ignore_patterns),
    aiModel: JSON.parse(result.ai_model_config),
    pollingEnabled: Boolean(result.polling_enabled),
    pollingInterval: result.polling_interval,
    notificationConfig: JSON.parse(result.notification_config),
    createdAt: result.created_at,
    updatedAt: result.updated_at
  };
}

/**
 * 统一的错误处理逻辑
 * @param error - 错误对象
 * @param reqLogger - 日志器
 * @param operation - 操作描述
 * @param requestId - 请求ID
 * @returns 错误响应
 */
function handleError(error: unknown, reqLogger: any, operation: string, requestId: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  reqLogger.error(`${operation}失败`, { error: errorMessage });
  return createErrorResponse(ApiCode.INTERNAL_ERROR, `${operation}失败`, requestId, 500);
}

/**
 * GET /api/config/init
 * 
 * 获取仓库配置（无需认证）
 */
const GET = apiRoute(async (request: NextRequest) => {
  const validation = validateAndCreateLogger(request, 'GET');
  if ('error' in validation) {
    throw new Error(validation.error.status === 404 ? '配置不存在' : '缺少仓库参数');
  }

  const { requestId, reqLogger, repository } = validation;

  reqLogger.info('获取配置初始化请求', { repository });

  // 直接使用数据库查询，跳过复杂的仓库层
  const { db } = await import('@/lib/db/client');
  await db.initialize();

  const result = await db.queryOne(
    'SELECT * FROM review_config WHERE repository = ?',
    [repository]
  );

  if (!result) {
    throw new Error('配置不存在');
  }

  const config = transformDatabaseResult(result);

  reqLogger.info('配置查询成功', { repository, configId: config.id });
  return config;
});

/**
 * POST /api/config/init
 * 
 * 创建默认配置（无需认证）
 */
const POST = apiRoute(async (request: NextRequest) => {
  const validation = validateAndCreateLogger(request, 'POST');
  if ('error' in validation) {
    throw new Error('缺少仓库参数');
  }

  const { requestId, reqLogger, repository } = validation;

  reqLogger.info('创建默认配置请求', { repository });

  const existingConfig = await configRepository.getConfigWithoutDecryption(repository);
  if (existingConfig) {
    throw new Error('配置已存在');
  }

  const config = await configRepository.createDefaultConfigWithoutEncryption(repository);

  reqLogger.info('默认配置创建成功', { repository, configId: config.id });
  return config;
});

/**
 * PUT /api/config/init
 * 
 * 更新配置（无需认证，仅用于初始化）
 */
const PUT = apiRoute(async (request: NextRequest) => {
  const validation = validateAndCreateLogger(request, 'PUT');
  if ('error' in validation) {
    throw new Error('缺少仓库参数');
  }

  const { requestId, reqLogger, repository } = validation;

  const body = await request.json();
  reqLogger.info('更新配置初始化请求', { repository });

  const config = await configRepository.updateConfig(repository, body);

  reqLogger.info('配置更新成功', { repository, configId: config.id });
  return config;
});

export { GET, POST, PUT };