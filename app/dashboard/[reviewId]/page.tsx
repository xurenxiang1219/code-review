import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ReviewDetail } from '@/components/review/ReviewDetail';
import type { ReviewEntity } from '@/lib/db/repositories/review';
import type { ReviewCommentRecord } from '@/types/review';

/**
 * 审查详情页面参数
 */
interface ReviewDetailPageProps {
  params: Promise<{
    reviewId: string;
  }>;
}

/**
 * 审查详情数据结构
 */
interface ReviewDetailData {
  review: ReviewEntity;
  comments: ReviewCommentRecord[];
}

/**
 * 获取审查详情数据（服务端直接调用数据库）
 * 
 * @param reviewId - 审查记录ID
 * @returns 审查详情数据或 null（如果不存在）
 */
/**
 * 补全审查记录的Git提交信息
 *
 * @param review - 审查记录
 * @param reviewId - 审查记录ID
 * @returns 更新后的审查记录
 */
async function enrichReviewWithCommitInfo(review: ReviewEntity, reviewId: string): Promise<ReviewEntity> {
  // 如果已有完整提交信息，直接返回
  if (review.commit_message && review.commit_timestamp) {
    return review;
  }

  try {
    const { createDefaultGitClient } = await import('@/lib/git/client');
    const { db } = await import('@/lib/db/client');

    const gitClient = createDefaultGitClient();
    const commitInfo = await gitClient.getCommit(review.commit_hash, review.repository);

    // 更新数据库中的提交信息
    await db.execute(
      `UPDATE reviews SET
       commit_message = ?,
       commit_timestamp = ?,
       commit_url = ?,
       updated_at = NOW()
       WHERE id = ?`,
      [commitInfo.message, commitInfo.timestamp, commitInfo.url, reviewId]
    );

    // 返回更新后的review对象
    return {
      ...review,
      commit_message: commitInfo.message,
      commit_timestamp: commitInfo.timestamp,
      commit_url: commitInfo.url,
    };
  } catch (gitError) {
    console.warn('获取Git提交信息失败:', gitError);
    return review; // 返回原始review，不影响主要功能
  }
}

/**
 * 获取审查详情数据（服务端直接调用数据库）
 *
 * @param reviewId - 审查记录ID
 * @returns 审查详情数据或 null（如果不存在）
 */
async function getReviewDetail(reviewId: string): Promise<ReviewDetailData | null> {
  try {
    const { reviewRepository } = await import('@/lib/db/repositories/review');
    const { db } = await import('@/lib/db/client');

    // 查询审查记录
    const originalReview = await reviewRepository.getReviewById(reviewId);
    if (!originalReview) {
      return null;
    }

    // 补全提交信息
    const review = await enrichReviewWithCommitInfo(originalReview, reviewId);

    // 查询审查评论
    await db.initialize();
    const comments = await db.query(
      `SELECT * FROM review_comments
       WHERE review_id = ?
       ORDER BY severity DESC, file_path ASC, line_number ASC`,
      [reviewId]
    );

    return {
      review,
      comments: Array.isArray(comments) ? comments : [],
    };
  } catch (error) {
    console.error('获取审查详情失败:', error);
    throw error;
  }
}

/**
 * 加载状态组件
 */
function ReviewDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题骨架 */}
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
        </div>

        {/* 审查信息卡片骨架 */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>

        {/* 评论列表骨架 */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="divide-y">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-6 bg-gray-200 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 审查详情页面组件
 * 
 * 展示单个审查记录的详细信息，包括：
 * - 审查基本信息（提交、作者、状态等）
 * - 代码变更统计
 * - 问题严重程度分布
 * - 详细的审查评论列表
 * - 每个评论的代码位置、严重程度和修改建议
 * 
 * @param params - 路由参数
 * @returns JSX 元素
 */
export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { reviewId } = await params;

  // 验证 reviewId 格式
  if (!reviewId || typeof reviewId !== 'string') {
    notFound();
  }

  try {
    // 获取审查详情数据
    const reviewData = await getReviewDetail(reviewId);

    if (!reviewData) {
      notFound();
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 页面标题 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              审查详情
            </h1>
            <p className="mt-2 text-gray-600">
              提交 {reviewData.review.commit_hash?.substring(0, 8) ?? '未知'} 的详细审查结果
            </p>
          </div>

          {/* 审查详情组件 */}
          <Suspense fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail 
              review={reviewData.review} 
              comments={reviewData.comments} 
            />
          </Suspense>
        </div>
      </div>
    );
  } catch (error) {
    console.error('审查详情页面错误:', error);
    
    // 渲染错误状态
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            加载失败
          </h1>
          <p className="text-gray-600 mb-6">
            无法加载审查详情，请稍后重试
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            返回仪表板
          </a>
        </div>
      </div>
    );
  }
}

/**
 * 生成页面元数据
 */
export async function generateMetadata({ params }: ReviewDetailPageProps) {
  const { reviewId } = await params;
  
  try {
    const reviewData = await getReviewDetail(reviewId);
    
    if (!reviewData) {
      return {
        title: '审查记录不存在 - CodeReview',
        description: '请求的审查记录不存在或已被删除',
      };
    }

    const { review } = reviewData;
    const commitShort = review.commit_hash?.substring(0, 8) ?? '未知';
    
    return {
      title: `审查详情 ${commitShort} - CodeReview`,
      description: `查看提交 ${commitShort} 在 ${review.branch ?? '未知分支'} 分支的详细审查结果，包含 ${review.total_issues ?? 0} 个问题`,
      openGraph: {
        title: `审查详情 ${commitShort}`,
        description: `${review.repository ?? '未知仓库'} 仓库 ${review.branch ?? '未知分支'} 分支的代码审查结果`,
        type: 'website',
      },
    };
  } catch (error) {
    return {
      title: '审查详情 - CodeReview',
      description: '查看代码审查的详细结果',
    };
  }
}