'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ReviewEntity } from '@/lib/db/repositories/review';
import type { ReviewCommentRecord } from '@/types/review';

/**
 * 审查详情组件属性
 */
interface ReviewDetailProps {
  review: ReviewEntity;
  comments: ReviewCommentRecord[];
}

/**
 * 获取状态显示信息
 */
const getStatusInfo = (status: ReviewEntity['status']) => {
  const statusMap = {
    pending: { text: '待处理', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    processing: { text: '处理中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    completed: { text: '已完成', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    failed: { text: '失败', color: 'bg-red-50 text-red-700 border-red-200' }
  };
  return statusMap[status] || { text: '未知', color: 'bg-gray-50 text-gray-700 border-gray-200' };
};

/**
 * 获取严重程度显示信息
 */
const getSeverityInfo = (severity: ReviewCommentRecord['severity']) => {
  const severityMap = {
    critical: { text: '严重', color: 'bg-red-50 text-red-700 border-red-200' },
    major: { text: '重要', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    minor: { text: '次要', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    suggestion: { text: '建议', color: 'bg-blue-50 text-blue-700 border-blue-200' }
  };
  return severityMap[severity] || { text: '未知', color: 'bg-gray-50 text-gray-700 border-gray-200' };
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
    second: '2-digit'
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

/**
 * 审查详情组件
 * 
 * 展示审查记录的完整信息，包括：
 * - 基本信息卡片（状态、时间、统计等）
 * - 问题严重程度分布
 * - 详细的审查评论列表
 * - 支持按严重程度和文件过滤评论
 * 
 * @param review - 审查记录
 * @param comments - 审查评论列表
 * @returns JSX 元素
 */
export function ReviewDetail({ review, comments }: ReviewDetailProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<string>('all');

  const statusInfo = getStatusInfo(review.status);
  const uniqueFiles = Array.from(new Set(comments.map(c => c.filePath))).sort();

  const filteredComments = comments.filter(comment => {
    const severityMatch = selectedSeverity === 'all' || comment.severity === selectedSeverity;
    const fileMatch = selectedFile === 'all' || comment.filePath === selectedFile;
    return severityMatch && fileMatch;
  });

  const commentsByFile = filteredComments.reduce((acc, comment) => {
    if (!acc[comment.filePath]) {
      acc[comment.filePath] = [];
    }
    acc[comment.filePath].push(comment);
    return acc;
  }, {} as Record<string, ReviewCommentRecord[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span>←</span>
          <span>返回</span>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {review.commit_hash.substring(0, 8)}
              </h2>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded text-sm font-medium border ${statusInfo.color}`}>
                <span>{statusInfo.text}</span>
              </span>
            </div>
            <p className="text-gray-600 mb-4">
              完整提交哈希: <code className="bg-gray-100 px-2 py-1 rounded text-sm">{review.commit_hash}</code>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">仓库信息</h3>
            <p className="text-lg font-semibold text-gray-900">{review.repository}</p>
            <p className="text-sm text-gray-600">分支: {review.branch}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">作者信息</h3>
            <p className="text-lg font-semibold text-gray-900">{review.author_name}</p>
            <p className="text-sm text-gray-600">{review.author_email}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">代码变更</h3>
            <p className="text-lg font-semibold text-gray-900">{review.files_changed} 个文件</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-600">+{review.lines_added}</span>
              <span className="text-red-600">-{review.lines_deleted}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">处理时间</h3>
            <p className="text-lg font-semibold text-gray-900">
              {formatProcessingTime(review.processing_time_ms)}
            </p>
            <p className="text-sm text-gray-600">
              {review.completed_at ? formatTime(review.completed_at) : '进行中'}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">开始时间:</span> {formatTime(review.started_at)}
          </div>
          {review.completed_at && (
            <div>
              <span className="font-medium">完成时间:</span> {formatTime(review.completed_at)}
            </div>
          )}
        </div>

        {review.error_message && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded">
            <h4 className="text-sm font-medium text-red-800 mb-2">错误信息</h4>
            <p className="text-sm text-red-700">{review.error_message}</p>
          </div>
        )}
      </div>

      {/* 问题统计卡片 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">问题统计</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{review.total_issues}</div>
            <div className="text-sm text-gray-600">总问题数</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{review.critical_count}</div>
            <div className="text-sm text-gray-600">严重</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{review.major_count}</div>
            <div className="text-sm text-gray-600">重要</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">{review.minor_count}</div>
            <div className="text-sm text-gray-600">次要</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{review.suggestion_count}</div>
            <div className="text-sm text-gray-600">建议</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">
              审查评论 ({filteredComments.length})
            </h3>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                严重程度
              </label>
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded shadow-sm text-sm focus:outline-none focus:ring-gray-900 focus:border-gray-900"
              >
                <option value="all">全部</option>
                <option value="critical">严重</option>
                <option value="major">重要</option>
                <option value="minor">次要</option>
                <option value="suggestion">建议</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                文件
              </label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded shadow-sm text-sm focus:outline-none focus:ring-gray-900 focus:border-gray-900"
              >
                <option value="all">全部文件</option>
                {uniqueFiles.map(file => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredComments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p>没有找到匹配的评论</p>
          </div>
        ) : (
          <div className="divide-y">
            {Object.entries(commentsByFile).map(([filePath, fileComments]) => (
              <div key={filePath} className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-base font-semibold text-gray-900">{filePath}</h4>
                  <span className="text-sm text-gray-400">({fileComments.length})</span>
                </div>

                <div className="space-y-4 ml-6">
                  {fileComments
                    .sort((a, b) => a.lineNumber - b.lineNumber)
                    .map((comment) => {
                      const severityInfo = getSeverityInfo(comment.severity);
                      return (
                        <div
                          key={comment.id}
                          className={`border rounded p-4 ${severityInfo.color.replace('text-', 'border-').replace('bg-', 'bg-opacity-50 bg-')}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${severityInfo.color}`}>
                                <span>{severityInfo.text}</span>
                              </span>
                              <span className="text-sm text-gray-600">
                                第 {comment.lineNumber} 行
                              </span>
                              <span className="text-sm text-gray-500">
                                {comment.category}
                              </span>
                            </div>
                          </div>

                          <div className="mb-3">
                            <p className="text-gray-900">{comment.message}</p>
                          </div>

                          {comment.codeSnippet && (
                            <div className="mb-3">
                              <h5 className="text-sm font-medium text-gray-700 mb-1">相关代码:</h5>
                              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                                <code>{comment.codeSnippet}</code>
                              </pre>
                            </div>
                          )}

                          {comment.suggestion && (
                            <div className="bg-slate-50 border border-slate-200 rounded p-3">
                              <h5 className="text-sm font-medium text-slate-700 mb-1">建议:</h5>
                              <p className="text-slate-600 text-sm">{comment.suggestion}</p>
                            </div>
                          )}

                          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-400">
                            {comment.published ? (
                              <span>
                                已发布 {comment.publishedAt && `· ${formatTime(comment.publishedAt)}`}
                              </span>
                            ) : (
                              <span>待发布</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}