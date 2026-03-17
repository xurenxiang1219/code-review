'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { authApiClient } from '@/lib/utils/auth-api-client';

/**
 * 监控仪表板数据接口
 */
interface DashboardData {
  overview: {
    totalRequests: number;
    successRate: number;
    avgProcessingTime: number;
    currentConcurrency: number;
    queueLength: number;
  };
  performance: {
    aiApiCalls: {
      total: number;
      success: number;
      failure: number;
      avgResponseTime: number;
    };
    database: {
      connections: number;
      avgQueryTime: number;
      slowQueries: number;
    };
    redis: {
      connections: number;
      avgResponseTime: number;
      memoryUsage: number;
    };
  };
  business: {
    reviews: {
      total: number;
      completed: number;
      failed: number;
      avgIssuesPerReview: number;
    };
    issues: {
      critical: number;
      major: number;
      minor: number;
      suggestions: number;
    };
  };
  alerts: {
    active: number;
    resolved: number;
    silenced: number;
    bySeverity: Record<string, number>;
  };
  timestamp: number;
}

/**
 * 系统健康状态接口
 */
interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  components: Record<string, boolean>;
  uptime: number;
  version: string;
}

/**
 * 监控仪表板组件
 */
export function MonitoringDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /**
   * 获取仪表板数据
   */
  const fetchDashboardData = async () => {
    try {
      const [dashboardResult, healthResult] = await Promise.all([
        authApiClient.get<DashboardData>('/api/monitoring', { type: 'dashboard' }),
        authApiClient.get<SystemHealth>('/api/monitoring', { type: 'health' }),
      ]);

      setDashboardData(dashboardResult);
      setSystemHealth(healthResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 格式化数字显示
   */
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  /**
   * 格式化时间显示
   */
  const formatTime = (ms: number): string => {
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}分钟`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}秒`;
    return `${ms}毫秒`;
  };

  /**
   * 格式化内存大小
   */
  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  /**
   * 获取状态样式类名
   */
  const getStatusStyles = (status: string): string => {
    const statusMap: Record<string, string> = {
      healthy: 'text-emerald-600',
      warning: 'text-amber-600',
      critical: 'text-red-600',
    };
    return statusMap[status] || 'text-gray-600';
  };

  // 自动刷新逻辑
  useEffect(() => {
    fetchDashboardData();

    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" title="加载失败">
        {error}
        <button
          onClick={fetchDashboardData}
          className="ml-4 px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
        >
          重试
        </button>
      </Alert>
    );
  }

  if (!dashboardData || !systemHealth) {
    return (
      <Alert type="warning" title="数据不可用">
        监控数据暂时不可用
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和控制 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">监控面板</h1>
        <div className="flex items-center space-x-4">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            <span className="text-gray-600">自动刷新</span>
          </label>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
          >
            刷新
          </button>
        </div>
      </div>

      {/* 系统健康状态 */}
      <Card>
        <div className="p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">系统健康</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 border border-gray-200 rounded">
              <div className={`text-2xl font-bold mb-1 ${getStatusStyles(systemHealth?.status || 'unknown')}`}>
                {systemHealth?.status === 'healthy' ? '正常' : 
                 systemHealth?.status === 'warning' ? '警告' : '异常'}
              </div>
              <div className="text-sm text-gray-500">整体状态</div>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded">
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {formatTime((systemHealth?.uptime || 0) * 1000)}
              </div>
              <div className="text-sm text-gray-500">运行时间</div>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded">
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {systemHealth?.version || 'N/A'}
              </div>
              <div className="text-sm text-gray-500">版本</div>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded">
              <div className="text-sm space-y-1">
                {Object.entries(systemHealth?.components || {}).map(([name, healthy]) => (
                  <div key={name} className={healthy ? 'text-emerald-600' : 'text-red-600'}>
                    {name}: {healthy ? '正常' : '异常'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
      {/* 系统概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-1">总请求数</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(dashboardData?.overview?.totalRequests || 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">累计处理</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-1">成功率</div>
          <div className="text-3xl font-bold text-emerald-600">
            {(dashboardData?.overview?.successRate || 0).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">审查成功率</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-1">平均处理时间</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatTime(dashboardData?.overview?.avgProcessingTime || 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">单次审查</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-1">当前并发</div>
          <div className="text-3xl font-bold text-gray-900">
            {dashboardData?.overview?.currentConcurrency || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">处理中</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-1">队列长度</div>
          <div className="text-3xl font-bold text-gray-900">
            {dashboardData?.overview?.queueLength || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">等待中</div>
        </div>
      </div>

      {/* 性能指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">API 调用</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">总调用数</span>
              <span className="font-semibold text-gray-900">
                {formatNumber(dashboardData?.performance?.aiApiCalls?.total || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">成功</span>
              <span className="font-semibold text-emerald-600">
                {formatNumber(dashboardData?.performance?.aiApiCalls?.success || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">失败</span>
              <span className="font-semibold text-red-600">
                {formatNumber(dashboardData?.performance?.aiApiCalls?.failure || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">平均响应</span>
              <span className="font-semibold text-gray-900">
                {formatTime(dashboardData?.performance?.aiApiCalls?.avgResponseTime || 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">数据库</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">活跃连接</span>
              <span className="font-semibold text-gray-900">
                {dashboardData?.performance?.database?.connections || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">平均查询</span>
              <span className="font-semibold text-gray-900">
                {formatTime(dashboardData?.performance?.database?.avgQueryTime || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">慢查询</span>
              <span className="font-semibold text-amber-600">
                {dashboardData?.performance?.database?.slowQueries || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Redis</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">活跃连接</span>
              <span className="font-semibold text-gray-900">
                {dashboardData?.performance?.redis?.connections || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">平均响应</span>
              <span className="font-semibold text-gray-900">
                {formatTime(dashboardData?.performance?.redis?.avgResponseTime || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">内存使用</span>
              <span className="font-semibold text-gray-900">
                {formatBytes(dashboardData?.performance?.redis?.memoryUsage || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 业务指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">审查统计</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">总审查数</span>
              <span className="font-semibold text-gray-900">
                {formatNumber(dashboardData?.business?.reviews?.total || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">已完成</span>
              <span className="font-semibold text-emerald-600">
                {formatNumber(dashboardData?.business?.reviews?.completed || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">失败</span>
              <span className="font-semibold text-red-600">
                {formatNumber(dashboardData?.business?.reviews?.failed || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">平均问题数</span>
              <span className="font-semibold text-gray-900">
                {(dashboardData?.business?.reviews?.avgIssuesPerReview || 0).toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">问题分布</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">严重</span>
              <span className="font-semibold text-red-600">
                {formatNumber(dashboardData?.business?.issues?.critical || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">重要</span>
              <span className="font-semibold text-orange-600">
                {formatNumber(dashboardData?.business?.issues?.major || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">次要</span>
              <span className="font-semibold text-amber-600">
                {formatNumber(dashboardData?.business?.issues?.minor || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">建议</span>
              <span className="font-semibold text-blue-600">
                {formatNumber(dashboardData?.business?.issues?.suggestions || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 告警状态 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">告警状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-red-600">
              {dashboardData?.alerts?.active || 0}
            </div>
            <div className="text-sm text-gray-500">活跃</div>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-emerald-600">
              {dashboardData?.alerts?.resolved || 0}
            </div>
            <div className="text-sm text-gray-500">已解决</div>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-2xl font-bold text-gray-600">
              {dashboardData?.alerts?.silenced || 0}
            </div>
            <div className="text-sm text-gray-500">已静默</div>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded">
            <div className="text-sm space-y-1">
              {Object.entries(dashboardData?.alerts?.bySeverity || {}).map(([severity, count]) => (
                <div key={severity} className="flex justify-between">
                  <span className="capitalize text-gray-600">{severity}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 最后更新时间 */}
      <div className="text-center text-sm text-gray-500">
        最后更新: {new Date(dashboardData?.timestamp || Date.now()).toLocaleString('zh-CN')}
      </div>
    </div>
  );
}