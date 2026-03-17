import { NextRequest, NextResponse } from 'next/server';
import { reviewRepository } from '@/lib/db/repositories/review';
import { ApiCode } from '@/lib/constants/api-codes';
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
    endpoint: '/api/stats',
    method: 'GET',
    userId: auth.user.id,
  });

  reqLogger.info('获取统计数据请求');

  try {
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
      totalReviews: stats.total,
      todayReviews: todayStats.total,
      avgIssuesPerReview,
      systemUptime,
    };

    reqLogger.info('统计数据查询成功', responseData);
    
    return NextResponse.json({
      code: ApiCode.SUCCESS,
      msg: '查询成功',
      data: responseData,
      timestamp: Date.now(),
      requestId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reqLogger.error('查询统计数据失败', { error: errorMessage });
    
    return NextResponse.json({
      code: ApiCode.INTERNAL_ERROR,
      msg: '查询统计数据失败',
      timestamp: Date.now(),
      requestId,
    }, { status: 500 });
  }
}

/**
 * 获取今日开始时间
 */
function getTodayStart(): Date {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}