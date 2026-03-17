import { NextRequest } from 'next/server';
import { handleApiRequest, successResponse } from '@/lib/utils/api-response';
import { createHealthChecker, HealthChecker } from '@/lib/services/health-checker';
import { logger } from '@/lib/utils/logger';
import type { SystemHealth } from '@/types/health';

/**
 * 健康检查 API
 * GET /api/health
 * 
 * 检查系统各组件的健康状态，包括：
 * - 数据库连接状态
 * - Redis 连接状态  
 * - AI 服务状态
 * - 系统资源使用情况
 */
export async function GET(request: NextRequest): Promise<Response> {
  const requestLogger = logger.child({ 
    endpoint: '/api/health',
    method: 'GET',
  });

  return handleApiRequest(async (): Promise<SystemHealth> => {
    requestLogger.info('开始健康检查请求');

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const services = searchParams.get('services')?.split(',') || [];
    const timeout = parseInt(searchParams.get('timeout') || '5000');

    // 创建健康检查器
    const healthChecker = createHealthChecker();
    
    // 根据查询参数确定要检查的服务
    const config = {
      timeout: Math.min(Math.max(timeout, 1000), 30000), // 限制在 1-30 秒之间
      checkDatabase: services.length === 0 || services.includes('database'),
      checkRedis: services.length === 0 || services.includes('redis'),
      checkAI: services.length === 0 || services.includes('ai'),
    };

    requestLogger.debug('健康检查配置', {
      timeout: config.timeout,
      services: {
        database: config.checkDatabase,
        redis: config.checkRedis,
        ai: config.checkAI,
      },
    });

    // 执行健康检查
    const healthResult = await healthChecker.checkSystemHealth(config);

    requestLogger.info('健康检查完成', {
      systemStatus: healthResult.status,
      servicesCount: healthResult.services.length,
      uptime: healthResult.uptime,
    });

    return healthResult;
  }, '健康检查失败');
}

/**
 * 简化的健康检查端点
 * HEAD /api/health
 * 
 * 仅返回 HTTP 状态码，不返回详细信息
 * - 200: 系统健康
 * - 503: 系统不健康
 */
export async function HEAD(request: NextRequest): Promise<Response> {
  const requestLogger = logger.child({ 
    endpoint: '/api/health',
    method: 'HEAD',
  });

  try {
    requestLogger.debug('开始简化健康检查');

    const healthChecker = createHealthChecker();
    const config = HealthChecker.getDefaultConfig();
    
    // 使用较短的超时时间进行快速检查
    config.timeout = 3000;
    
    const healthResult = await healthChecker.checkSystemHealth(config);
    
    const isHealthy = healthResult.status === 'healthy';
    const statusCode = isHealthy ? 200 : 503;

    requestLogger.debug('简化健康检查完成', {
      status: healthResult.status,
      statusCode,
    });

    return new Response(null, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': healthResult.status,
      },
    });
  } catch (error) {
    requestLogger.error('简化健康检查失败', {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(null, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': 'unhealthy',
      },
    });
  }
}