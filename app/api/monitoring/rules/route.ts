import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse, handleApiRequest } from '@/lib/utils/api-response';
import { monitoring } from '@/lib/utils/monitoring';
import { ApiCode } from '@/lib/constants/api-codes';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';
import type { AlertRule } from '@/lib/utils/monitoring';

/**
 * 获取告警规则
 * 
 * GET /api/monitoring/rules
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const rules: AlertRule[] = [];
    return successResponse(rules, '获取告警规则成功');
  });
}

/**
 * 添加或更新告警规则
 * 
 * POST /api/monitoring/rules
 * 
 * 请求体：
 * {
 *   "name": "rule_name",
 *   "metricName": "metric_name",
 *   "condition": "gt|lt|eq|gte|lte",
 *   "threshold": 100,
 *   "duration": 300000,
 *   "severity": "info|warning|error|critical",
 *   "message": "Alert message template",
 *   "enabled": true
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
    
    const requiredFields = ['name', 'metricName', 'condition', 'threshold', 'severity', 'message'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      return errorResponse(
        ApiCode.VALIDATION_ERROR,
        `缺少必要字段: ${missingFields.join(', ')}`
      );
    }

    // 验证条件类型
    const validConditions = ['gt', 'lt', 'eq', 'gte', 'lte'];
    if (!validConditions.includes(body.condition)) {
      return errorResponse(
        ApiCode.VALIDATION_ERROR,
        `无效的条件类型: ${body.condition}，支持的类型: ${validConditions.join(', ')}`
      );
    }

    // 验证严重程度
    const validSeverities = ['info', 'warning', 'error', 'critical'];
    if (!validSeverities.includes(body.severity)) {
      return errorResponse(
        ApiCode.VALIDATION_ERROR,
        `无效的严重程度: ${body.severity}，支持的类型: ${validSeverities.join(', ')}`
      );
    }

    // 验证阈值是数字
    if (typeof body.threshold !== 'number') {
      return errorResponse(ApiCode.VALIDATION_ERROR, 'threshold必须是数字类型');
    }

    const rule: AlertRule = {
      name: body.name,
      metricName: body.metricName,
      condition: body.condition,
      threshold: body.threshold,
      duration: body.duration || 300000, // 默认5分钟
      severity: body.severity,
      message: body.message,
      enabled: body.enabled !== false, // 默认启用
    };

    monitoring.addAlertRule(rule);

    return successResponse(rule, '告警规则已添加');
  });
}

/**
 * 删除告警规则
 * 
 * DELETE /api/monitoring/rules
 * 
 * 请求体：
 * {
 *   "ruleName": "rule_name"
 * }
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const body = await request.json();
    const { ruleName } = body;

    if (!ruleName) {
      return errorResponse(ApiCode.VALIDATION_ERROR, '缺少ruleName参数');
    }

    monitoring.removeAlertRule(ruleName);

    return successResponse(
      { ruleName },
      '告警规则已删除'
    );
  });
}