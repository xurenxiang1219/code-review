import { NextRequest, NextResponse } from 'next/server';
import { apiRoute } from '@/lib/utils/api-response';
import { monitoring } from '@/lib/utils/monitoring';
import { checkAuth } from '@/lib/utils/api-auth-helper';
import { Permission } from '@/types/auth';
import type { AlertRule } from '@/lib/utils/monitoring';

/**
 * 获取告警规则
 * 
 * GET /api/monitoring/rules
 */
export const GET = apiRoute(async (request: NextRequest) => {
  await checkAuth(request, [Permission.CONFIG_READ]);

  const rules: AlertRule[] = [];
  return rules;
});

/**
 * 添加或更新告警规则
 * 
 * POST /api/monitoring/rules
 */
export const POST = apiRoute(async (request: NextRequest) => {
  await checkAuth(request, [Permission.CONFIG_WRITE]);

  const body = await request?.json?.() ?? {};
  
  const requiredFields = ['name', 'metricName', 'condition', 'threshold', 'severity', 'message'];
  const missingFields = requiredFields.filter(field => !body?.[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`缺少必要字段: ${missingFields.join(', ')}`);
  }

  // 验证条件类型
  const validConditions = ['gt', 'lt', 'eq', 'gte', 'lte'];
  if (!validConditions.includes(body?.condition)) {
    throw new Error(`无效的条件类型: ${body?.condition}，支持的类型: ${validConditions.join(', ')}`);
  }

  // 验证严重程度
  const validSeverities = ['info', 'warning', 'error', 'critical'];
  if (!validSeverities.includes(body?.severity)) {
    throw new Error(`无效的严重程度: ${body?.severity}，支持的类型: ${validSeverities.join(', ')}`);
  }

  // 验证阈值是数字
  if (typeof body?.threshold !== 'number') {
    throw new Error('threshold必须是数字类型');
  }

  const rule: AlertRule = {
    name: body?.name,
    metricName: body?.metricName,
    condition: body?.condition,
    threshold: body?.threshold,
    duration: body?.duration ?? 300000, // 默认5分钟
    severity: body?.severity,
    message: body?.message,
    enabled: body?.enabled !== false, // 默认启用
  };

  monitoring.addAlertRule(rule);

  return rule;
});

/**
 * 删除告警规则
 * 
 * DELETE /api/monitoring/rules
 */
export const DELETE = apiRoute(async (request: NextRequest) => {
  await checkAuth(request, [Permission.CONFIG_WRITE]);

  const body = await request?.json?.() ?? {};
  const { ruleName } = body;

  if (!ruleName) {
    throw new Error('缺少ruleName参数');
  }

  monitoring.removeAlertRule(ruleName);

  return { ruleName };
});