import { NextRequest } from 'next/server';
import { 
  handleApiRequest, 
  successResponse,
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  return handleApiRequest(async () => {
    // 从中间件获取用户信息
    const userId = request.headers.get('X-User-ID');
    const userRole = request.headers.get('X-User-Role');

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

    try {
      // 删除 API Key（会检查用户权限）
      await apiKeyManager.deleteApiKey(keyId, userId);

      reqLogger.info('API Key 删除成功');

      return successResponse(null, 'API Key 删除成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('不存在') || errorMessage.includes('无权限')) {
        reqLogger.warn('API Key 删除失败', { error: errorMessage });
        throw new ApiError(ApiCode.NOT_FOUND, 'API Key 不存在或无权限操作');
      }

      reqLogger.error('API Key 删除异常', { error: errorMessage });
      throw error;
    }
  });
}

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
export async function PUT(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  return handleApiRequest(async () => {
    // 从中间件获取用户信息
    const userId = request.headers.get('X-User-ID');
    const userRole = request.headers.get('X-User-Role');

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
    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch (error) {
      reqLogger.warn('请求体解析失败', { error });
      throw new ApiError(ApiCode.INVALID_PARAMETERS, '请求体格式错误');
    }

    const { enabled } = requestBody;

    if (typeof enabled !== 'boolean') {
      throw new ApiError(ApiCode.INVALID_PARAMETERS, 'enabled 字段必须是布尔值');
    }

    try {
      if (enabled) {
        // 启用 API Key 的逻辑（这里简化处理，实际需要实现 enableApiKey 方法）
        reqLogger.info('启用 API Key 功能暂未实现');
        throw new ApiError(ApiCode.INTERNAL_ERROR, '启用 API Key 功能暂未实现');
      } else {
        // 禁用 API Key
        await apiKeyManager.disableApiKey(keyId, userId);
        reqLogger.info('API Key 已禁用');
        return successResponse(null, 'API Key 已禁用');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('不存在') || errorMessage.includes('无权限')) {
        reqLogger.warn('API Key 更新失败', { error: errorMessage });
        throw new ApiError(ApiCode.NOT_FOUND, 'API Key 不存在或无权限操作');
      }

      reqLogger.error('API Key 更新异常', { error: errorMessage });
      throw error;
    }
  });
}