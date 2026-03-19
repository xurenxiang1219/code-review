import { NextRequest } from 'next/server';
import { apiRoute } from '@/lib/utils/api-response';
import { concurrencyRateLimitManager } from '@/lib/services/concurrency-rate-limit-manager';
import { monitoring } from '@/lib/utils/monitoring';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/system/status
 * 
 * 获取系统状态信息，包括：
 * - 各服务的并发控制状态
 * - 速率限制状态
 * - 背压控制状态
 * - 监控指标
 * - 活跃告警
 */
export const GET = apiRoute(async (request: NextRequest) => {
  const reqLogger = logger.child({ 
    endpoint: '/api/system/status',
    method: 'GET' 
  });

  // 获取系统整体状态
  const systemStatus = await concurrencyRateLimitManager.getSystemStatus();
  
  // 获取监控统计
  const monitoringStats = await monitoring.getStats();
  
  // 获取活跃告警
  const activeAlerts = monitoring.getActiveAlerts();

  const responseData = {
    system: systemStatus,
    monitoring: monitoringStats,
    alerts: activeAlerts,
    timestamp: new Date().toISOString(),
  };

  reqLogger.info('系统状态查询成功', {
    overallHealth: systemStatus.overallHealth,
    activeAlerts: systemStatus.activeAlerts,
    servicesCount: Object.keys(systemStatus.services).length,
  });

  return responseData;
});