import { NextRequest, NextResponse } from 'next/server';
import { apiRoute } from '@/lib/utils/api-response';
import { configRepository } from '@/lib/db/repositories/config';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRouteSimple } from '@/lib/middleware/api-auth-simple';
import { Permission } from '@/types/auth';
import '@/lib/init/auth';

/**
 * 配置脱敏处理
 * @param config - 原始配置对象
 * @returns 脱敏后的配置对象
 */
function sanitizeConfig(config: any) {
  const aiModel = config?.aiModel ?? {};
  
  return {
    ...config,
    aiModel: {
      ...aiModel,
      apiKey: aiModel.apiKey ? '***已配置***' : undefined,
    },
  };
}

/**
 * GET /api/config/all - 获取所有配置
 * 
 * 响应:
 * - 200: 返回所有配置列表
 * - 500: 服务器错误
 */
export const GET = apiRoute(async (request: NextRequest) => {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.CONFIG_READ],
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }

  const reqLogger = logger.child({ 
    operation: 'getAllConfigs',
    requestId: auth.requestId,
    userId: auth.user.id,
  });

  reqLogger.info('开始获取所有配置');

  const configs = await configRepository.getAllConfigs();
  
  // 对配置进行脱敏处理
  const sanitizedConfigs = (configs || []).map(config => sanitizeConfig(config));

  reqLogger.info('配置获取和脱敏完成', { 
    originalCount: configs?.length ?? 0,
    sanitizedCount: sanitizedConfigs.length,
    firstSanitized: sanitizedConfigs[0] 
  });

  return sanitizedConfigs;
});