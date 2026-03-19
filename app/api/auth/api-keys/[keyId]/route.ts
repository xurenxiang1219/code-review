import { NextRequest } from 'next/server';
import { 
  apiRoute,
  ApiError 
} from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { apiKeyManager } from '@/lib/services/api-key-manager';
import { logger } from '@/lib/utils/logger';

/**
 * DELETE /api/auth/api-keys/[keyId] - 删除指定的 API Key
 * 
 * 路径参数:
 * - keyId: string - API Key ID
 * 
 * 响应:
 * - 200: 删除成功
 * - 401: 未认证
 * - 403: 权限不足
 * - 404: API Key 不存在
 * - 500: 服务器错误
 */
export const DELETE = apiRoute(async (request: NextRequest, { params }: { params: { keyId: string } }) => {
  const userId = request.headers.get('X-User-ID');

  if (!userId) {
    throw new ApiError(ApiCode.UNAUTHORIZED, '用户未认证');
  }

  const { keyId } = params;
  const reqLogger = logger.child({ 
    operation: 'deleteApiKey',
    userId,
    keyId 
  });

  reqLogger.info('开始删除 API Key');

  // 删除 API Key（会检查用户权限）
  await apiKeyManager.deleteApiKey(keyId, userId);
  reqLogger.info('API Key 删除成功');

  return null;
});

/**
 * PUT /api/auth/api-keys/[keyId] - 禁用/启用指定的 API Key
 * 
 * 路径参数:
 * - keyId: string - API Key ID
 * 
 * 请求体:
 * - enabled: boolean - 是否启用
 * 
 * 响应:
 * - 200: 操作成功
 * - 400: 参数错误
 * - 401: 未认证
 * - 403: 权限不足
 * - 404: API Key 不存在
 * - 500: 服务器错误
 */
export const PUT = apiRoute(async (request: NextRequest, { params }: { params: { keyId: string } }) => {
  const userId = request.headers.get('X-User-ID');

  if (!userId) {
    throw new ApiError(ApiCode.UNAUTHORIZED, '用户未认证');
  }

  const { keyId } = params;
  const reqLogger = logger.child({ 
    operation: 'updateApiKey',
    userId,
    keyId 
  });

  reqLogger.info('开始更新 API Key');

  // 解析请求体
  const requestBody = await request.json().catch(() => {
    throw new ApiError(ApiCode.INVALID_PARAMETERS, '请求体格式错误');
  });

  const { enabled } = requestBody;

  if (typeof enabled !== 'boolean') {
    throw new ApiError(ApiCode.INVALID_PARAMETERS, 'enabled 字段必须是布尔值');
  }

  if (enabled) {
    // 启用 API Key 功能暂未实现
    reqLogger.info('启用 API Key 功能暂未实现');
    throw new ApiError(ApiCode.INTERNAL_ERROR, '启用 API Key 功能暂未实现');
  }

  // 禁用 API Key
  await apiKeyManager.disableApiKey(keyId, userId);
  reqLogger.info('API Key 已禁用');
  
  return null;
});