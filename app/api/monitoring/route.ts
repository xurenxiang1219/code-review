import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@/lib/utils/api-response';
import { monitoringDashboard } from '@/lib/services/monitoring-dashboard';
import { monitoring } from '@/lib/utils/monitoring';
import { alertManager } from '@/lib/services/alert-manager';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';
import '@/lib/init/auth';

/**
 * 获取监控仪表板数据
 * 
 * GET /api/monitoring
 * 
 * 查询参数：
 * - type: 数据类型 (dashboard|metrics|health|performance)
 * - timeRange: 时间范围（毫秒）
 * - metricName: 指标名称（仅当type=metrics时）
 * - aggregation: 聚合方式（avg|sum|max|min|count）
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.REVIEW_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') ?? 'dashboard';
    const timeRange = parseInt(searchParams.get('timeRange') ?? '3600000');
    const metricName = searchParams.get('metricName');
    const aggregation = (searchParams.get('aggregation') as 'avg' | 'sum' | 'max' | 'min' | 'count') ?? 'avg';

    switch (type) {
      case 'dashboard':
        return await monitoringDashboard.getDashboardMetrics();

      case 'metrics':
        if (!metricName) {
          throw new Error('缺少metricName参数');
        }
        return await monitoringDashboard.getTimeSeriesData(
          metricName,
          timeRange,
          aggregation
        );

      case 'health':
        return await monitoringDashboard.getSystemHealth();

      case 'performance':
        return await monitoringDashboard.getPerformanceReport(timeRange);

      case 'alerts':
        const alertStats = alertManager.getAlertStats();
        const activeAlerts = monitoring.getActiveAlerts();
        const alertHistory = alertManager.getAlertHistory(50);
        
        return {
          stats: alertStats,
          activeAlerts,
          history: alertHistory,
        };

      default:
        throw new Error(`不支持的数据类型: ${type}`);
    }
  });
}

/**
 * 记录自定义指标
 * 
 * POST /api/monitoring
 * 
 * 请求体：
 * {
 *   "name": "metric_name",
 *   "value": 123,
 *   "type": "gauge|counter|histogram|timer",
 *   "labels": { "key": "value" }
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const body = await request.json();
    const { name, value, type = 'gauge', labels } = body;

    if (!name || value === undefined) {
      throw new Error('缺少必要参数：name和value');
    }

    if (typeof value !== 'number') {
      throw new Error('value必须是数字类型');
    }

    await monitoring.recordMetric(name, value, type, labels);

    return { name, value, type, labels, timestamp: Date.now() };
  });
}