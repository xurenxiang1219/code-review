'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/lib/contexts/auth-context';
import { authApiClient } from '@/lib/utils/auth-api-client';

/**
 * 轮询日志接口
 */
interface PollingLog {
  id: string;
  timestamp: string;
  repository: string;
  branch: string;
  status: 'success' | 'error' | 'running';
  message: string;
  duration?: number;
  commitsFound?: number;
  errorDetails?: string;
}

/**
 * 轮询统计接口
 */
interface PollingStats {
  repository: string;
  branch: string;
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  successRate: string;
  avgDuration: number;
  lastScanAt?: string;
  lastErrorMessage?: string;
}

/**
 * API响应接口
 */
interface PollingLogsResponse {
  logs: PollingLog[];
  stats: PollingStats[];
  total: number;
  timestamp: string;
}

/**
 * 轮询详情页面
 */
export default function PollingDetailPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [logs, setLogs] = useState<PollingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取轮询日志数据
   */
  const fetchPollingLogs = async () => {
    try {
      setLoading(true);
      const result = await authApiClient.get<PollingLogsResponse>('/api/monitoring/polling/logs');
      setLogs(result.logs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 格式化时间显示
   */
  const formatTime = (timeStr: string): string => {
    const time = new Date(timeStr);
    return time.toLocaleString('zh-CN');
  };

  /**
   * 格式化持续时间
   */
  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A';
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}分钟`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}秒`;
    return `${ms}毫秒`;
  };

  /**
   * 获取状态样式
   */
  const getStatusStyles = (status: string): string => {
    const statusMap: Record<string, string> = {
      success: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      error: 'text-red-600 bg-red-50 border-red-200',
      running: 'text-blue-600 bg-blue-50 border-blue-200',
    };
    return statusMap[status] || 'text-gray-600 bg-gray-50 border-gray-200';
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (status: string): string => {
    const statusMap: Record<string, string> = {
      success: '成功',
      error: '失败',
      running: '运行中',
    };
    return statusMap[status] || '未知';
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPollingLogs();
      const interval = setInterval(fetchPollingLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="加载中..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center space-x-4 mb-4">
          <Link
            href="/monitoring"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← 返回监控页面
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">轮询日志</h1>
        <p className="text-gray-600">查看轮询扫描的详细日志和状态</p>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">扫描日志</h2>
            <div className="flex space-x-3">
              <button
                onClick={() => window.open('/api/monitoring/polling/logs', '_blank')}
                className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded hover:bg-green-200"
              >
                实时日志
              </button>
              <button
                onClick={fetchPollingLogs}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
              >
                刷新
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <LoadingSpinner size="md" />
              <span className="ml-3 text-gray-500">加载日志...</span>
            </div>
          ) : error ? (
            <Alert type="error" title="加载失败">
              {error}
            </Alert>
          ) : logs.length === 0 ? (
            <Alert type="info" title="暂无日志">
              还没有轮询扫描日志
            </Alert>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`border rounded-lg p-4 ${getStatusStyles(log.status)}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">
                        {log.repository}
                      </span>
                      <span className="text-sm text-gray-500">
                        {log.branch}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusStyles(log.status)}`}>
                        {getStatusText(log.status)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatTime(log.timestamp)}
                    </div>
                  </div>

                  <div className="mb-2">
                    <p className="text-gray-900">{log.message}</p>
                  </div>

                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <span>持续时间: {formatDuration(log.duration)}</span>
                    {log.commitsFound !== undefined && (
                      <span>发现提交: {log.commitsFound}</span>
                    )}
                  </div>

                  {log.errorDetails && (
                    <div className="mt-3 p-2 bg-white border border-red-300 rounded text-sm text-red-700">
                      <strong>错误详情:</strong> {log.errorDetails}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}