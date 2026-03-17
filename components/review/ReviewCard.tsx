import Link from 'next/link';
import type { ReviewEntity } from '@/lib/db/repositories/review';

interface ReviewCardProps {
  review: ReviewEntity;
}

/**
 * 获取状态显示信息
 */
const getStatusInfo = (status: ReviewEntity['status']) => {
  switch (status) {
    case 'pending':
      return { text: '待处理', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'processing':
      return { text: '处理中', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'completed':
      return { text: '已完成', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'failed':
      return { text: '失败', color: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { text: '未知', color: 'bg-gray-50 text-gray-700 border-gray-200' };
  }
};

/**
 * 获取严重程度颜色
 */
const getSeverityColor = (count: number, severity: 'critical' | 'major' | 'minor' | 'suggestion') => {
  if (count === 0) return 'text-gray-400';
  
  const colorMap = {
    critical: 'text-red-600',
    major: 'text-orange-600',
    minor: 'text-amber-600',
    suggestion: 'text-blue-600',
  };
  
  return colorMap[severity] || 'text-gray-600';
};

/**
 * 格式化时间
 */
const formatTime = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * 格式化处理时间
 */
const formatProcessingTime = (ms?: number) => {
  if (!ms) return '-';
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
};

export function ReviewCard({ review }: ReviewCardProps) {
  const statusInfo = getStatusInfo(review.status);

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href={`/dashboard/${review.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-gray-600 truncate"
            >
              {review.commit_hash.substring(0, 8)}
            </Link>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${statusInfo.color}`}>
              {statusInfo.text}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
            <span>仓库: {review.repository}</span>
            <span>分支: {review.branch}</span>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
            <span>作者: {review.author_name} ({review.author_email})</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
            <span>文件: {review.files_changed}</span>
            <span className="text-green-600">+{review.lines_added}</span>
            <span className="text-red-600">-{review.lines_deleted}</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>开始: {formatTime(review.started_at)}</span>
            {review.completed_at && (
              <span>完成: {formatTime(review.completed_at)}</span>
            )}
            <span>耗时: {formatProcessingTime(review.processing_time_ms)}</span>
          </div>
        </div>

        <div className="ml-6 flex-shrink-0">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {review.total_issues}
            </div>
            <div className="text-sm text-gray-500 mb-3">总问题</div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`text-center ${getSeverityColor(review.critical_count, 'critical')}`}>
                <div className="font-semibold">{review.critical_count}</div>
                <div>严重</div>
              </div>
              <div className={`text-center ${getSeverityColor(review.major_count, 'major')}`}>
                <div className="font-semibold">{review.major_count}</div>
                <div>重要</div>
              </div>
              <div className={`text-center ${getSeverityColor(review.minor_count, 'minor')}`}>
                <div className="font-semibold">{review.minor_count}</div>
                <div>次要</div>
              </div>
              <div className={`text-center ${getSeverityColor(review.suggestion_count, 'suggestion')}`}>
                <div className="font-semibold">{review.suggestion_count}</div>
                <div>建议</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {review.error_message && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-sm text-red-800">
            <span className="font-medium">错误:</span> {review.error_message}
          </div>
        </div>
      )}
    </div>
  );
}