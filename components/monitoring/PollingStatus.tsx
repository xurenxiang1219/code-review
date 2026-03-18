'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { authApiClient } from '@/lib/utils/auth-api-client';

/**
 * 轮询状态接口
 */
interface PollingStatus {
  id: string;
  repository: string;
  branch: string;
  enabled: boolean;
  interval: number;
  lastScanTime?: string;
  nextScanTime?: string;
  status: 'running' | 'stopped' | 'error';
  errorMessage?: string;
  scanCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * 轮询监控数据接口
 */
interface PollingMonitoringData {
  pollingStatuses: PollingStatus[];
  totalConfigs: number;
  activeConfigs: number;
  timestamp: string;
}

/**
 * 轮询状态监控组件
 */
export function PollingStatus() {
  const [data, setData] = useState<PollingMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取轮询状态数据
   */
  const fetchPollingStatus = async () => {
    try {
      const result = await authApiClient.get<PollingMonitoringData>('/api/monitoring/polling');
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取轮询状态失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 格式化时间显示
   * @param timeStr 时间字符串
   * @returns 格式化后的时间
   */
  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return '未知';
    const time = new Date(timeStr);
    return time.toLocaleString('zh-CN');
  };

  /**
   * 格式化相对时间
   * @param timeStr 时间字符串
   * @returns 相对时间描述
   */
  const formatRelativeTime = (timeStr?: string): string => {
    if (!timeStr) return '未知';
    const time = new Date(timeStr);
    const now = new Date();
    const diffMs = time.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    
    if (diffMinutes < 0) {
      return `${Math.abs(diffMinutes)} 分钟前`;
    }
    
    if (diffMinutes === 0) {
      return '现在';
    }
    
    return `${diffMinutes} 分钟后`;
  };

  /**
   * 获取状态样式
   */
  const getStatusStyles = (status: string): string => {
    const statusMap: Record<string, string> = {
      running: 'text-emerald-600 bg-emerald-50',
      stopped: 'text-gray-600 bg-gray-50',
      error: 'text-red-600 bg-red-50',
    };
    return statusMap[status] || 'text-gray-600 bg-gray-50';
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (status: string): string => {
    const statusMap: Record<string, string> = {
      running: '运行中',
      stopped: '已停止',
      error: '错误',
    };
    return statusMap[status] || '未知';
  };

  // 自动刷新
  useEffect(() => {
    fetchPollingStatus();
    const interval = setInterval(fetchPollingStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner size="md" />
            <span className="ml-3 text-gray-500">加载轮询状态...</span>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="p-6">
          <Alert type="error" title="加载失败">
            {error}
            <button
              onClick={fetchPollingStatus}
              className="ml-4 px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
            >
              重试
            </button>
          </Alert>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div className="p-6">
          <Alert type="warning" title="数据不可用">
            轮询状态数据暂时不可用
          </Alert>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">轮询状态监控</h2>
          <div className="flex space-x-3">
            <Link
              href="/monitoring/polling"
              className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded hover:bg-blue-200"
            >
              查看详情
            </Link>
            <button
              onClick={fetchPollingStatus}
              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
            >
              刷新
            </button>
          </div>
        </div>

        {/* 概览统计 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-gray-900">
              {data.totalConfigs}
            </div>
            <div className="text-sm text-gray-500">总配置数</div>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-emerald-600">
              {data.activeConfigs}
            </div>
            <div className="text-sm text-gray-500">活跃配置</div>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-gray-600">
              {data.totalConfigs - data.activeConfigs}
            </div>
            <div className="text-sm text-gray-500">停用配置</div>
          </div>
        </div>

        {/* 轮询配置列表 */}
        {data.pollingStatuses.length === 0 ? (
          <Alert type="info" title="暂无轮询配置">
            请在配置页面添加轮询配置
          </Alert>
        ) : (
          <div className="space-y-4">
            {data.pollingStatuses.map((polling) => (
              <div
                key={polling.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {polling.repository}
                    </h3>
                    <p className="text-sm text-gray-500">
                      分支: {polling.branch} | 间隔: {polling.interval}秒
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(polling.status)}`}
                  >
                    {getStatusText(polling.status)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">上次扫描:</span>
                    <div className="font-medium text-gray-900">
                      {formatTime(polling.lastScanTime)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">下次扫描:</span>
                    <div className="font-medium text-gray-900">
                      {formatRelativeTime(polling.nextScanTime)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">扫描次数:</span>
                    <div className="font-medium text-gray-900">
                      {polling.scanCount}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">成功率:</span>
                    <div className="font-medium text-gray-900">
                      {polling.scanCount > 0 
                        ? `${((polling.successCount / polling.scanCount) * 100).toFixed(1)}%`
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>

                {polling.errorMessage && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    错误: {polling.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 最后更新时间 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          最后更新: {formatTime(data.timestamp)}
        </div>
      </div>
    </Card>
  );
}