import { NextRequest, NextResponse } from 'next/server';
import { initializeApp } from '@/lib/init/app';
import { logger } from '@/lib/utils/logger';

/**
 * 系统初始化API
 * 
 * POST /api/system/init
 * 
 * 执行应用初始化操作（无需认证）
 */
export async function POST(request: NextRequest) {
  const initLogger = logger.child({ 
    endpoint: '/api/system/init',
    method: 'POST',
  });

  try {
    initLogger.info('收到系统初始化请求');
    
    await initializeApp();
    
    initLogger.info('系统初始化成功');
    
    return NextResponse.json({
      code: 0,
      msg: '系统初始化成功',
      timestamp: Date.now(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    initLogger.error('系统初始化失败', { error: errorMessage });
    
    return NextResponse.json({
      code: 2000,
      msg: '系统初始化失败',
      error: errorMessage,
      timestamp: Date.now(),
    }, { status: 500 });
  }
}