import { NextRequest, NextResponse } from 'next/server';
import { reviewRepository } from '@/lib/db/repositories/review';
import { apiRoute } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';
import { db } from '@/lib/db/client';

/**
 * Review Detail API 端点
 * 
 * 提供单个审查记录的详细信息查询，包括审查评论
 */

/**
 * GET /api/reviews/[reviewId]
 * 
 * 查询审查记录详情
 * 
 * @param request - HTTP 请求对象
 * @param params - 路由参数
 * @returns API 响应
 * 
 * 示例请求：
 * GET /api/reviews/abc-123-def-456
 * 
 * 响应：
 * {
 *   "code": 0,
 *   "msg": "操作成功",
 *   "data": {
 *     "review": {
 *       "id": "review-uuid",
 *       "commit_hash": "abc123",
 *       "branch": "uat",
 *       "repository": "my-repo",
 *       "author_name": "John Doe",
 *       "author_email": "john@example.com",
 *       "files_changed": 5,
 *       "lines_added": 100,
 *       "lines_deleted": 50,
 *       "total_issues": 10,
 *       "critical_count": 2,
 *       "major_count": 3,
 *       "minor_count": 3,
 *       "suggestion_count": 2,
 *       "status": "completed",
 *       "started_at": "2024-01-01T00:00:00Z",
 *       "completed_at": "2024-01-01T00:05:00Z",
 *       "processing_time_ms": 300000,
 *       "created_at": "2024-01-01T00:00:00Z",
 *       "updated_at": "2024-01-01T00:05:00Z"
 *     },
 *     "comments": [
 *       {
 *         "id": "comment-uuid",
 *         "review_id": "review-uuid",
 *         "file_path": "src/utils.ts",
 *         "line_number": 42,
 *         "severity": "major",
 *         "category": "security",
 *         "message": "潜在的空指针异常",
 *         "suggestion": "在访问属性前添加空值检查",
 *         "code_snippet": "const value = obj.property;",
 *         "published": true,
 *         "published_at": "2024-01-01T00:05:00Z",
 *         "created_at": "2024-01-01T00:05:00Z"
 *       }
 *     ]
 *   },
 *   "timestamp": 1234567890,
 *   "requestId": "uuid"
 * }
 */
export const GET = apiRoute(async (request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) => {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.REVIEW_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }

  const { reviewId } = await params;
  const { requestId } = auth;
  
  const reqLogger = logger.child({ 
    requestId, 
    endpoint: `/api/reviews/${reviewId}`,
    method: 'GET',
    reviewId,
    userId: auth.user.id,
  });

  reqLogger.info('审查详情查询请求');

  // 查询审查记录
  const review = await reviewRepository.getReviewById(reviewId);

  if (!review) {
    reqLogger.warn('审查记录不存在', { reviewId });
    throw new Error('审查记录不存在');
  }

  reqLogger.debug('审查记录查询成功', {
    reviewId,
    status: review.status,
    totalIssues: review.total_issues,
  });

  // 查询审查评论
  await db.initialize();
  const comments = await db.query(
    `SELECT * FROM review_comments 
     WHERE review_id = ? 
     ORDER BY severity DESC, file_path ASC, line_number ASC`,
    [reviewId]
  );

  reqLogger.info('审查详情查询成功', {
    reviewId,
    commentCount: comments.length,
  });

  // 返回审查详情和评论
  return {
    review,
    comments,
  };
});
