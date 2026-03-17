'use client';

import { useState, useEffect } from 'react';

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

  // 获取统计数据
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // 由于没有专门的统计API，我们从reviews API获取数据并计算统计
      const response = await fetch('/api/reviews?pageSize=1000');
      const data = await response.json();

      if (data.code !== 0) {
        throw new Error(data.msg || '获取统计数据失败');
      }

      const reviews = data.data?.items || [];
      
      // 计算统计数据
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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

      {/* 问题分布详情 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 md:col-span-2">
        <h3 className="text-base font-semibold text-gray-900 mb-4">问题分布</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.issueDistribution.critical}</div>
            <div className="text-sm text-gray-500">严重</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.issueDistribution.major}</div>
            <div className="text-sm text-gray-500">重要</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.issueDistribution.minor}</div>
            <div className="text-sm text-gray-500">次要</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.issueDistribution.suggestion}</div>
            <div className="text-sm text-gray-500">建议</div>
          </div>
        </div>
      </div>

      {/* 状态分布 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 md:col-span-2">
        <h3 className="text-base font-semibold text-gray-900 mb-4">审查状态</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.statusDistribution.pending}</div>
            <div className="text-sm text-gray-500">待处理</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.statusDistribution.processing}</div>
            <div className="text-sm text-gray-500">处理中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.statusDistribution.completed}</div>
            <div className="text-sm text-gray-500">已完成</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.statusDistribution.failed}</div>
            <div className="text-sm text-gray-500">失败</div>
          </div>
        </div>
      </div>
    </div>
  );
}