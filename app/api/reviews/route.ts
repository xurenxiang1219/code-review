import { NextRequest, NextResponse } from 'next/server';
import { reviewRepository } from '@/lib/db/repositories/review';
import { paginatedResponse, errorResponse } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRouteSimple } from '@/lib/middleware/api-auth-simple';
import { Permission } from '@/types/auth';
import type { ReviewQueryParams } from '@/lib/db/repositories/review';

/**
 * Reviews API 端点
 * 
 * 提供审查记录的查询功能，支持分页、过滤和排序
 * 
 * 查询参数：
 * - branch: 分支名称
 * - repository: 仓库名称
 * - author: 作者邮箱
 * - status: 审查状态 (pending/processing/completed/failed)
 * - from: 开始时间 (ISO 8601 格式)
 * - to: 结束时间 (ISO 8601 格式)
 * - page: 页码 (默认: 1)
 * - pageSize: 每页大小 (默认: 20, 最大: 100)
 */

/**
 * GET /api/reviews
 * 
 * 查询审查记录列表
 * 
 * @param request - HTTP 请求对象
 * @returns API 响应
 * 
 * 示例请求：
 * GET /api/reviews?branch=uat&status=completed&page=1&pageSize=20
 * 
 * 响应：
 * {
 *   "code": 0,
 *   "msg": "操作成功",
 *   "data": {
 *     "items": [
 *       {
 *         "id": "review-uuid",
 *         "commit_hash": "abc123",
 *         "branch": "uat",
 *         "repository": "my-repo",
 *         "author_name": "John Doe",
 *         "author_email": "john@example.com",
 *         "files_changed": 5,
 *         "lines_added": 100,
 *         "lines_deleted": 50,
 *         "total_issues": 10,
 *         "critical_count": 2,
 *         "major_count": 3,
 *         "minor_count": 3,
 *         "suggestion_count": 2,
 *         "status": "completed",
 *         "started_at": "2024-01-01T00:00:00Z",
 *         "completed_at": "2024-01-01T00:05:00Z",
 *         "processing_time_ms": 300000,
 *         "created_at": "2024-01-01T00:00:00Z",
 *         "updated_at": "2024-01-01T00:05:00Z"
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "pageSize": 20,
 *       "total": 100,
 *       "totalPages": 5
 *     }
 *   },
 *   "timestamp": 1234567890,
 *   "requestId": "uuid"
 * }
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.REVIEW_READ],
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { requestId } = auth;
  const reqLogger = logger.child({ 
    requestId, 
    endpoint: '/api/reviews',
    method: 'GET',
    userId: auth.user.id,
  });

  try {
    const searchParams = request.nextUrl.searchParams;
    
    if (searchParams.get('stats') === 'true') {
      return await handleStatsRequest(reqLogger, requestId);
    }

    return await handleReviewsListRequest(searchParams, reqLogger);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reqLogger.error('查询审查列表失败', { error: errorMessage });
    return errorResponse(ApiCode.INTERNAL_ERROR, '查询审查列表失败', 500);
  }
}

/**
 * 处理统计数据请求
 */
async function handleStatsRequest(reqLogger: any, requestId: string) {
  reqLogger.info('获取审查统计数据请求');
  
  const [stats, todayStats, firstReview] = await Promise.all([
    reviewRepository.getReviewStats(),
    reviewRepository.getReviewStats({
      from: getTodayStart(),
    }),
    reviewRepository.getReviews({ page: 1, pageSize: 1 }),
  ]);

  const avgIssuesPerReview = stats.completed > 0 
    ? Math.round((stats.issues.total / stats.completed) * 10) / 10
    : 0;

  const systemUptime = firstReview.items.length > 0 
    ? new Date(firstReview.items[0].created_at).getTime()
    : Date.now();

  const responseData = {
    stats: {
      totalReviews: stats.total,
      todayReviews: todayStats.total,
      avgIssuesPerReview,
      systemUptime,
    },
  };

  reqLogger.info('统计数据查询成功', responseData.stats);
  
  return NextResponse.json({
    code: ApiCode.SUCCESS,
    msg: '查询成功',
    data: responseData,
    timestamp: Date.now(),
    requestId,
  });
}

/**
 * 处理审查列表请求
 */
async function handleReviewsListRequest(searchParams: URLSearchParams, reqLogger: any) {
  reqLogger.info('审查列表查询请求');

  const params = parseQueryParams(searchParams, reqLogger);
  if (params instanceof NextResponse) {
    return params;
  }

  reqLogger.debug('查询参数解析完成', { params });

  const { items, total } = await reviewRepository.getReviews(params);

  reqLogger.info('审查列表查询成功', {
    total,
    itemCount: items.length,
    page: params.page,
    pageSize: params.pageSize,
  });

  return paginatedResponse(items, params.page!, params.pageSize!, total, '查询成功');
}

/**
 * 解析查询参数
 */
function parseQueryParams(searchParams: URLSearchParams, reqLogger: any): ReviewQueryParams | NextResponse {
  const params: ReviewQueryParams = {};

  // 基础参数
  const branch = searchParams.get('branch');
  const repository = searchParams.get('repository');
  const author = searchParams.get('author');
  
  if (branch) params.branch = branch;
  if (repository) params.repository = repository;
  if (author) params.author = author;

  // 状态参数
  const status = searchParams.get('status');
  if (status) {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      reqLogger.warn('无效的状态参数', { status });
      return errorResponse(
        ApiCode.BAD_REQUEST,
        `无效的状态值: ${status}，有效值为: ${validStatuses.join(', ')}`,
        400
      );
    }
    params.status = status as 'pending' | 'processing' | 'completed' | 'failed';
  }

  // 时间参数
  const timeParseResult = parseTimeParams(searchParams, reqLogger);
  if (timeParseResult instanceof NextResponse) {
    return timeParseResult;
  }
  Object.assign(params, timeParseResult);

  // 分页参数
  params.page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  params.pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));

  return params;
}

/**
 * 解析时间参数
 */
function parseTimeParams(searchParams: URLSearchParams, reqLogger: any): Partial<ReviewQueryParams> | NextResponse {
  const timeParams = [
    { key: 'from', field: 'from' as const, label: '开始时间' },
    { key: 'to', field: 'to' as const, label: '结束时间' }
  ];

  const result: Partial<ReviewQueryParams> = {};

  for (const { key, field, label } of timeParams) {
    const timeValue = searchParams.get(key);
    if (timeValue) {
      const date = new Date(timeValue);
      if (isNaN(date.getTime())) {
        reqLogger.warn(`无效的${label}`, { [key]: timeValue });
        return errorResponse(
          ApiCode.BAD_REQUEST,
          `无效的${label}格式，请使用 ISO 8601 格式`,
          400
        );
      }
      result[field] = date;
    }
  }

  return result;
}

/**
 * 获取今日开始时间
 */
function getTodayStart(): Date {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}
