import { NextRequest } from 'next/server';
import { 
  apiRoute, 
  paginatedResponse,
  ApiError 
} from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { auditLogger } from '@/lib/services/audit-logger';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/auth/audit-logs - 查询审计日志
 * 
 * 查询参数:
 * - userId?: string - 用户 ID
 * - action?: string - 操作类型
 * - resource?: string - 资源类型
 * - startTime?: string - 开始时间 (ISO 8601 格式)
 * - endTime?: string - 结束时间 (ISO 8601 格式)
 * - page?: number - 页码 (默认: 1)
 * - pageSize?: number - 每页大小 (默认: 20, 最大: 100)
 * 
 * 响应:
 * - 200: 返回审计日志列表
 * - 400: 参数错误
 * - 401: 未认证
 * - 403: 权限不足
 * - 500: 服务器错误
 */
export const GET = apiRoute(async (request: NextRequest) => {
  // 从中间件获取用户信息
  const currentUserId = request.headers.get('X-User-ID');
  const userRole = request.headers.get('X-User-Role');

  if (!currentUserId) {
    throw new ApiError(ApiCode.UNAUTHORIZED, '用户未认证');
  }

  // 只有管理员可以查看所有审计日志
  if (userRole !== 'admin') {
    throw new ApiError(ApiCode.FORBIDDEN, '权限不足，只有管理员可以查看审计日志');
  }

  const reqLogger = logger.child({ 
    operation: 'getAuditLogs',
    currentUserId 
  });

  reqLogger.info('开始查询审计日志');

  const searchParams = request.nextUrl.searchParams;

  // 解析查询参数
  const params: any = {};

  // 基础过滤参数
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const resource = searchParams.get('resource');
  
  if (userId) params.userId = userId;
  if (action) params.action = action;
  if (resource) params.resource = resource;

  // 时间范围过滤
  const startTimeStr = searchParams.get('startTime');
  const endTimeStr = searchParams.get('endTime');

  if (startTimeStr) {
    const startTime = new Date(startTimeStr);
    if (isNaN(startTime.getTime())) {
      reqLogger.warn('无效的开始时间', { startTime: startTimeStr });
      throw new ApiError(ApiCode.BAD_REQUEST, '无效的开始时间格式，请使用 ISO 8601 格式');
    }
    params.startTime = startTime;
  }

  if (endTimeStr) {
    const endTime = new Date(endTimeStr);
    if (isNaN(endTime.getTime())) {
      reqLogger.warn('无效的结束时间', { endTime: endTimeStr });
      throw new ApiError(ApiCode.BAD_REQUEST, '无效的结束时间格式，请使用 ISO 8601 格式');
    }
    params.endTime = endTime;
  }

  // 分页参数
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
  params.page = page;
  params.pageSize = pageSize;

  reqLogger.debug('查询参数解析完成', { params });

  // 查询审计日志
  const { items, total } = await auditLogger.getAuditLogs(params);

  reqLogger.info('审计日志查询成功', {
    total,
    itemCount: items.length,
    page,
    pageSize,
  });

  // 返回分页响应
  return paginatedResponse(items, page, pageSize, total, '审计日志查询成功');
});