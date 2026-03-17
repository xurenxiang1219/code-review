import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse, handleApiRequest } from '@/lib/utils/api-response';
import { alertManager } from '@/lib/services/alert-manager';
import { monitoring } from '@/lib/utils/monitoring';
import { ApiCode } from '@/lib/constants/api-codes';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

/**
 * 获取告警信息
 * 
 * GET /api/monitoring/alerts
 * 
 * 查询参数：
 * - type: 数据类型 (active|history|stats|policies)
 * - limit: 限制数量（仅对history有效）
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
    const type = searchParams.get('type') || 'active';
    const limit = parseInt(searchParams.get('limit') || '50');

    switch (type) {
      case 'active':
        const activeAlerts = monitoring.getActiveAlerts();
        return successResponse(activeAlerts, '获取活跃告警成功');

      case 'history':
        const alertHistory = alertManager.getAlertHistory(limit);
        return successResponse(alertHistory, '获取告警历史成功');

      case 'stats':
        const alertStats = alertManager.getAlertStats();
        return successResponse(alertStats, '获取告警统计成功');

      case 'policies':
        const policies = alertManager.getAllAlertPolicies();
        return successResponse(policies, '获取告警策略成功');

      default:
        return errorResponse(ApiCode.BAD_REQUEST, `不支持的类型: ${type}`);
    }
  });
}

/**
 * 管理告警
 * 
 * POST /api/monitoring/alerts
 * 
 * 请求体：
 * {
 *   "action": "silence|unsilence|addPolicy|removePolicy",
 *   "alertId": "alert_id", // 仅对silence/unsilence有效
 *   "duration": 300000, // 静默时长（毫秒），仅对silence有效
 *   "policy": {...} // 告警策略，仅对addPolicy有效
 *   "policyName": "policy_name" // 策略名称，仅对removePolicy有效
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
    const { action, alertId, duration, policy, policyName } = body;

    if (!action) {
      return errorResponse(ApiCode.VALIDATION_ERROR, '缺少action参数');
    }

    switch (action) {
      case 'silence': {
        if (!alertId) {
          return errorResponse(ApiCode.VALIDATION_ERROR, '缺少alertId参数');
        }
        
        const silenceDuration = duration || 300000;
        await alertManager.silenceAlert(alertId, silenceDuration);
        
        return successResponse({ alertId, duration: silenceDuration }, '告警已静默');
      }

      case 'unsilence': {
        if (!alertId) {
          return errorResponse(ApiCode.VALIDATION_ERROR, '缺少alertId参数');
        }
        
        await alertManager.unsilenceAlert(alertId);
        return successResponse({ alertId }, '告警静默已解除');
      }

      case 'addPolicy': {
        if (!policy) {
          return errorResponse(ApiCode.VALIDATION_ERROR, '缺少policy参数');
        }
        
        if (!policy.name || !policy.channels || !Array.isArray(policy.channels)) {
          return errorResponse(ApiCode.VALIDATION_ERROR, '告警策略格式不正确');
        }
        
        alertManager.addAlertPolicy(policy);
        return successResponse({ policyName: policy.name }, '告警策略已添加');
      }

      case 'removePolicy': {
        if (!policyName) {
          return errorResponse(ApiCode.VALIDATION_ERROR, '缺少policyName参数');
        }
        
        alertManager.removeAlertPolicy(policyName);
        return successResponse({ policyName }, '告警策略已移除');
      }

      default:
        return errorResponse(ApiCode.BAD_REQUEST, `不支持的操作: ${action}`);
    }
  });
}