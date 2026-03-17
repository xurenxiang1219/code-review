'use client';

import { useState, useEffect } from 'react';
import { authApiClient } from '@/lib/utils/auth-api-client';

interface StatsData {
  totalReviews: number;
  reviewsThisWeek: number;
  averageProcessingTime: number;
  issueDistribution: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
  };
  statusDistribution: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

/**
 * 格式化处理时间
 */
const formatProcessingTime = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
};

export function ReviewStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取统计数据
   */
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await authApiClient.get('/api/reviews', { pageSize: '1000' });
      const reviews = data?.items || [];
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 计算基础统计
      const totalReviews = reviews.length;
      const reviewsThisWeek = reviews.filter((review: any) => 
        new Date(review.created_at) >= weekAgo
      ).length;

      // 计算平均处理时间（只计算已完成的）
      const completedReviews = reviews.filter((review: any) => 
        review.status === 'completed' && review.processing_time_ms
      );
      const averageProcessingTime = completedReviews.length > 0
        ? completedReviews.reduce((sum: number, review: any) => sum + review.processing_time_ms, 0) / completedReviews.length
        : 0;

      // 计算问题分布
      const issueDistribution = reviews.reduce((acc: any, review: any) => ({
        critical: acc.critical + review.critical_count,
        major: acc.major + review.major_count,
        minor: acc.minor + review.minor_count,
        suggestion: acc.suggestion + review.suggestion_count,
      }), { critical: 0, major: 0, minor: 0, suggestion: 0 });

      // 计算状态分布
      const statusDistribution = reviews.reduce((acc: any, review: any) => {
        acc[review.status] = (acc[review.status] || 0) + 1;
        return acc;
      }, { pending: 0, processing: 0, completed: 0, failed: 0 });

      setStats({
        totalReviews,
        reviewsThisWeek,
        averageProcessingTime,
        issueDistribution,
        statusDistribution,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取统计数据失败';
      setError(errorMessage);
      console.error('获取统计数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center">
          <div className="text-red-600 text-sm mb-2">统计数据加载失败</div>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  /**
   * 统计卡片组件
   */
  const StatCard = ({ title, value, bgColor, textColor }: {
    title: string;
    value: string | number;
    bgColor: string;
    textColor: string;
  }) => (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="flex-shrink-0">
          <div className={`w-2 h-12 ${bgColor} rounded-full`}></div>
        </div>
      </div>
    </div>
  );

  /**
   * 分布详情组件
   */
  const DistributionCard = ({ title, items, className = "" }: {
    title: string;
    items: Array<{ label: string; value: number; color: string }>;
    className?: string;
  }) => (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="text-center">
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-sm text-gray-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="总审查数"
        value={stats.totalReviews}
        bgColor="bg-slate-900"
        textColor="text-slate-900"
      />
      <StatCard
        title="本周审查"
        value={stats.reviewsThisWeek}
        bgColor="bg-slate-900"
        textColor="text-slate-900"
      />
      <StatCard
        title="平均处理时间"
        value={formatProcessingTime(stats.averageProcessingTime)}
        bgColor="bg-slate-900"
        textColor="text-slate-900"
      />
      <StatCard
        title="总问题数"
        value={stats.issueDistribution.critical + 
               stats.issueDistribution.major + 
               stats.issueDistribution.minor + 
               stats.issueDistribution.suggestion}
        bgColor="bg-slate-900"
        textColor="text-slate-900"
      />

      <DistributionCard
        title="问题分布"
        className="md:col-span-2"
        items={[
          { label: '严重', value: stats.issueDistribution.critical, color: 'text-red-600' },
          { label: '重要', value: stats.issueDistribution.major, color: 'text-orange-600' },
          { label: '次要', value: stats.issueDistribution.minor, color: 'text-amber-600' },
          { label: '建议', value: stats.issueDistribution.suggestion, color: 'text-blue-600' },
        ]}
      />

      <DistributionCard
        title="审查状态"
        className="md:col-span-2"
        items={[
          { label: '待处理', value: stats.statusDistribution.pending, color: 'text-amber-600' },
          { label: '处理中', value: stats.statusDistribution.processing, color: 'text-blue-600' },
          { label: '已完成', value: stats.statusDistribution.completed, color: 'text-emerald-600' },
          { label: '失败', value: stats.statusDistribution.failed, color: 'text-red-600' },
        ]}
      />
    </div>
  );
}