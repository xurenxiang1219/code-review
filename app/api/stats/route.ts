import { NextRequest, NextResponse } from 'next/server';
import { reviewRepository } from '@/lib/db/repositories/review';
import { apiRoute } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRouteSimple } from '@/lib/middleware/api-auth-simple';
import { Permission } from '@/types/auth';
import '@/lib/init/auth';

/**
 * 系统统计数据 API
 * 
 * 提供系统统计信息，需要认证
 */

/**
 * GET /api/stats
 * 
 * 获取系统统计数据
 */
export const GET = apiRoute(async (request: NextRequest) => {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.REVIEW_READ],
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }

  const { requestId } = auth;
  const reqLogger = logger.child({ 
    requestId, 
    endpoint: '/api/stats',
    method: 'GET',
    userId: auth.user.id,
  });

  reqLogger.info('获取统计数据请求');

  const [stats, todayStats, firstReview] = await Promise.all([
    reviewRepository.getReviewStats(),
    reviewRepository.getReviewStats({
      from: getTodayStart(),
    }),
    reviewRepository.getReviews({ page: 1, pageSize: 1 }),
  ]);

  const avgIssuesPerReview = stats?.completed > 0 
    ? Math.round(((stats?.issues?.total ?? 0) / stats.completed) * 10) / 10
    : 0;

  const systemUptime = (firstReview?.items?.length ?? 0) > 0 
    ? new Date(firstReview.items[0].created_at).getTime()
    : Date.now();

  const responseData = {
    totalReviews: stats.total,
    todayReviews: todayStats.total,
    avgIssuesPerReview,
    systemUptime,
  };

  reqLogger.info('统计数据查询成功', responseData);
  
  return responseData;
});

/**
 * 获取今日开始时间
 */
function getTodayStart(): Date {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}