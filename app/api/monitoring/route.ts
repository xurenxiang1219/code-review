import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse, handleApiRequest } from '@/lib/utils/api-response';
import { monitoringDashboard } from '@/lib/services/monitoring-dashboard';
import { monitoring } from '@/lib/utils/monitoring';
import { alertManager } from '@/lib/services/alert-manager';
import { ApiCode } from '@/lib/constants/api-codes';
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
    const type = searchParams.get('type') || 'dashboard';
    const timeRange = parseInt(searchParams.get('timeRange') || '3600000');
    const metricName = searchParams.get('metricName');
    const aggregation = searchParams.get('aggregation') as 'avg' | 'sum' | 'max' | 'min' | 'count' || 'avg';

    switch (type) {
      case 'dashboard':
        const dashboardData = await monitoringDashboard.getDashboardMetrics();
        return successResponse(dashboardData, '获取仪表板数据成功');

      case 'metrics':
        if (!metricName) {
          throw new Error('缺少metricName参数');
        }
        const timeSeriesData = await monitoringDashboard.getTimeSeriesData(
          metricName,
          timeRange,
          aggregation
        );
        return successResponse(timeSeriesData, '获取时间序列数据成功');

      case 'health':
        const healthData = await monitoringDashboard.getSystemHealth();
        return successResponse(healthData, '获取系统健康状态成功');

      case 'performance':
        const performanceData = await monitoringDashboard.getPerformanceReport(timeRange);
        return successResponse(performanceData, '获取性能报告成功');

      case 'alerts':
        const alertStats = alertManager.getAlertStats();
        const activeAlerts = monitoring.getActiveAlerts();
        const alertHistory = alertManager.getAlertHistory(50);
        
        return successResponse({
          stats: alertStats,
          activeAlerts,
          history: alertHistory,
        }, '获取告警数据成功');

      default:
        return errorResponse(ApiCode.BAD_REQUEST, `不支持的数据类型: ${type}`);
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
      return errorResponse(ApiCode.VALIDATION_ERROR, '缺少必要参数：name和value');
    }

    if (typeof value !== 'number') {
      return errorResponse(ApiCode.VALIDATION_ERROR, 'value必须是数字类型');
    }

    await monitoring.recordMetric(name, value, type, labels);

    return successResponse(
      { name, value, type, labels, timestamp: Date.now() },
      '指标记录成功'
    );
  });
}