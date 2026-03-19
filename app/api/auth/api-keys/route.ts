import { NextRequest } from 'next/server';
import { z } from 'zod';
import { 
  apiRoute, 
  validationErrorResponse,
  ApiError 
} from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { apiKeyManager } from '@/lib/services/api-key-manager';
import { PermissionUtils } from '@/lib/utils/auth';
import { Permission } from '@/types/auth';
import { logger } from '@/lib/utils/logger';

/**
 * 创建 API Key 请求验证 Schema
 */
const CreateApiKeySchema = z.object({
  name: z.string().min(1, 'API Key 名称不能为空').max(100, 'API Key 名称不能超过 100 个字符'),
  permissions: z.array(z.string()).min(1, '至少需要一个权限'),
  expiresInDays: z.number().min(1).max(365).optional(),
});

/**
 * GET /api/auth/api-keys - 获取用户的 API Key 列表
 */
export const GET = apiRoute(async (request: NextRequest) => {
  // 从中间件获取用户信息
  const userId = request?.headers?.get('X-User-ID');
  const userRole = request?.headers?.get('X-User-Role');

  if (!userId) {
    throw new ApiError(ApiCode.UNAUTHORIZED, '用户未认证');
  }

  const reqLogger = logger.child({ 
    operation: 'getApiKeys',
    userId 
  });

  reqLogger.info('开始获取 API Key 列表');

  // 获取用户的 API Key 列表
  const apiKeys = await apiKeyManager.getUserApiKeys(userId);

  reqLogger.info('API Key 列表获取成功', { 
    count: apiKeys?.length ?? 0
  });

  // 脱敏处理：不返回哈希值
  const sanitizedKeys = (apiKeys || []).map(key => ({
    id: key?.id,
    name: key?.name,
    permissions: key?.permissions,
    enabled: key?.enabled,
    expiresAt: key?.expiresAt,
    lastUsedAt: key?.lastUsedAt,
    createdAt: key?.createdAt,
  }));

  return sanitizedKeys;
});

/**
 * POST /api/auth/api-keys - 创建新的 API Key
 */
export const POST = apiRoute(async (request: NextRequest) => {
  // 从中间件获取用户信息
  const userId = request?.headers?.get('X-User-ID');
  const userRole = request?.headers?.get('X-User-Role');

  if (!userId) {
    throw new ApiError(ApiCode.UNAUTHORIZED, '用户未认证');
  }

  const reqLogger = logger.child({ 
    operation: 'createApiKey',
    userId 
  });

  reqLogger.info('开始创建 API Key');

  // 解析请求体
  const requestBody = await request?.json?.() ?? {};

  // 验证请求数据
  const validation = CreateApiKeySchema.safeParse(requestBody);
  if (!validation.success) {
    const errors = validation.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    reqLogger.warn('API Key 创建验证失败', { errors });
    throw new ApiError(ApiCode.INVALID_PARAMETERS, '请求参数验证失败', 400, errors);
  }

  const { name, permissions, expiresInDays } = validation.data;

  // 验证权限格式
  const validPermissions = (permissions || []).filter(p => 
    Object.values(Permission).includes(p as Permission)
  ) as Permission[];

  if (validPermissions.length !== (permissions?.length ?? 0)) {
    const invalidPermissions = (permissions || []).filter(p => 
      !Object.values(Permission).includes(p as Permission)
    );
    
    reqLogger.warn('包含无效权限', { invalidPermissions });
    throw new ApiError(
      ApiCode.INVALID_PARAMETERS, 
      `无效的权限: ${invalidPermissions.join(', ')}`
    );
  }

  // 检查用户是否有权限创建具有这些权限的 API Key
  if (userRole !== 'admin') {
    const restrictedPermissions = [Permission.SYSTEM_ADMIN, Permission.WEBHOOK_RECEIVE];
    const hasRestrictedPermission = validPermissions.some(p => 
      restrictedPermissions.includes(p)
    );

    if (hasRestrictedPermission) {
      reqLogger.warn('尝试创建超出权限范围的 API Key', { 
        requestedPermissions: validPermissions 
      });
      throw new ApiError(ApiCode.FORBIDDEN, '无权限创建包含系统级权限的 API Key');
    }
  }

  // 计算过期时间
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  // 创建 API Key
  const result = await apiKeyManager.createApiKey({
    name,
    userId,
    permissions: validPermissions,
    expiresAt,
  });

  reqLogger.info('API Key 创建成功', { 
    keyId: result?.info?.id,
    name: result?.info?.name,
    permissions: result?.info?.permissions,
  });

  // 返回 API Key 和信息（注意：API Key 只返回一次）
  return {
    apiKey: result?.apiKey,
    info: {
      id: result?.info?.id,
      name: result?.info?.name,
      permissions: result?.info?.permissions,
      enabled: result?.info?.enabled,
      expiresAt: result?.info?.expiresAt,
      createdAt: result?.info?.createdAt,
    },
  };
});