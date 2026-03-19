import { NextRequest } from 'next/server';
import { initializeApp } from '@/lib/init/app';
import { logger } from '@/lib/utils/logger';
import { apiRoute } from '@/lib/utils/api-response';

/**
 * 系统初始化API
 * 
 * POST /api/system/init
 * 
 * 执行应用初始化操作（无需认证）
 */
export const POST = apiRoute(async (request: NextRequest) => {
  const initLogger = logger.child({ 
    endpoint: '/api/system/init',
    method: 'POST',
  });

  initLogger.info('收到系统初始化请求');
  
  await initializeApp();
  
  initLogger.info('系统初始化成功');
  
  return {
    code: 0,
    msg: '系统初始化成功',
    timestamp: Date.now(),
  };
});