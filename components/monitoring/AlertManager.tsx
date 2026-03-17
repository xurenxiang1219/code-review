'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * 告警事件接口
 */
interface AlertEvent {
  id: string;
  ruleName: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  triggeredAt: string;
  status: 'firing' | 'resolved';
  labels?: Record<string, string>;
}

/**
 * 告警历史记录接口
 */
interface AlertHistory {
  id: string;
  alert: AlertEvent;
  channels: string[];
  status: 'pending' | 'sent' | 'failed' | 'silenced';
  sentAt?: string;
  error?: string;
  retryCount: number;
}

/**
 * 告警统计接口
 */
interface AlertStats {
  total: number;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  silencedCount: number;
}

/**
 * 告警管理组件
 */
export function AlertManager() {
  const [activeAlerts, setActiveAlerts] = useState<AlertEvent[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'active' | 'history' | 'stats'>('active');

  /**
   * 获取告警数据
   */
  const fetchAlertData = async () => {
    try {
      const [activeResponse, historyResponse, statsResponse] = await Promise.all([
        fetch('/api/monitoring/alerts?type=active'),
        fetch('/api/monitoring/alerts?type=history&limit=50'),
        fetch('/api/monitoring/alerts?type=stats'),
      ]);

      if (!activeResponse.ok || !historyResponse.ok || !statsResponse.ok) {
        throw new Error('获取告警数据失败');
      }

      const [activeResult, historyResult, statsResult] = await Promise.all([
        activeResponse.json(),
        historyResponse.json(),
        statsResponse.json(),
      ]);

      setActiveAlerts(activeResult.data);
      setAlertHistory(historyResult.data);
      setAlertStats(statsResult.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 静默告警
   */
  const silenceAlert = async (alertId: string, duration = 300000) => {
    try {
      const response = await fetch('/api/monitoring/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'silence',
          alertId,
          duration,
        }),
      });

      if (!response.ok) {
        throw new Error('静默告警失败');
      }

      await fetchAlertData(); // 刷新数据
    } catch (err) {
      setError(err instanceof Error ? err.message : '静默告警失败');
    }
  };

  /**
   * 解除静默
   */
  const unsilenceAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/monitoring/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unsilence',
          alertId,
        }),
      });

      if (!response.ok) {
        throw new Error('解除静默失败');
      }

      await fetchAlertData(); // 刷新数据
    } catch (err) {
      setError(err instanceof Error ? err.message : '解除静默失败');
    }
  };

  /**
   * 获取严重程度颜色
   */
  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'info': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'warning': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'error': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  /**
   * 获取状态颜色
   */
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'sent': return 'text-emerald-600 bg-emerald-50';
      case 'pending': return 'text-amber-600 bg-amber-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'silenced': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  useEffect(() => {
    fetchAlertData();
    const interval = setInterval(fetchAlertData, 30000); // 30秒刷新
    return () => clearInterval(interval);
  }, []);

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
          onClick={fetchAlertData}
          className="ml-4 px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
        >
          重试
        </button>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">告警管理</h1>
        <button
          onClick={fetchAlertData}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800"
        >
          刷新
        </button>
      </div>

      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'active', label: '活跃告警', count: activeAlerts.length },
            { key: 'history', label: '历史记录', count: alertHistory.length },
            { key: 'stats', label: '统计', count: null },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="ml-2 bg-gray-100 text-gray-700 py-0.5 px-2 rounded text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 活跃告警 */}
      {selectedTab === 'active' && (
        <div className="space-y-4">
          {activeAlerts.length === 0 ? (
            <Alert type="success" title="无活跃告警">
              系统运行正常
            </Alert>
          ) : (
            activeAlerts.map(alert => (
              <div key={alert.id} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="font-semibold text-gray-900">{alert.ruleName}</span>
                    </div>
                    <p className="text-gray-700 mb-2">{alert.message}</p>
                    <div className="text-sm text-gray-500 space-y-1">
                      <div>指标: {alert.metricName}</div>
                      <div>当前值: {alert.currentValue} / 阈值: {alert.threshold}</div>
                      <div>触发时间: {formatTime(alert.triggeredAt)}</div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => silenceAlert(alert.id, 300000)}
                      className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
                    >
                      静默5分钟
                    </button>
                    <button
                      onClick={() => silenceAlert(alert.id, 3600000)}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                    >
                      静默1小时
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {/* 告警历史 */}
      {selectedTab === 'history' && (
        <div className="space-y-4">
          {alertHistory.length === 0 ? (
            <Alert type="info" title="无历史记录">
              暂无告警历史
            </Alert>
          ) : (
            alertHistory.map(history => (
              <div key={history.id} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(history.alert.severity)}`}>
                        {history.alert.severity.toUpperCase()}
                      </span>
                      <span className="font-semibold text-gray-900">{history.alert.ruleName}</span>
                      <span className={`px-2 py-1 rounded text-xs border ${getStatusColor(history.status)}`}>
                        {history.status === 'sent' ? '已发送' :
                         history.status === 'pending' ? '待发送' :
                         history.status === 'failed' ? '失败' : '已静默'}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-2">{history.alert.message}</p>
                    <div className="text-sm text-gray-500 space-y-1">
                      <div>触发: {formatTime(history.alert.triggeredAt)}</div>
                      {history.sentAt && (
                        <div>发送: {formatTime(history.sentAt)}</div>
                      )}
                      {history.channels.length > 0 && (
                        <div>渠道: {history.channels.join(', ')}</div>
                      )}
                      {history.error && (
                        <div className="text-red-600">错误: {history.error}</div>
                      )}
                      <div>重试: {history.retryCount} 次</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 统计信息 */}
      {selectedTab === 'stats' && alertStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">按严重程度</h3>
            <div className="space-y-3 text-sm">
              {Object.entries(alertStats.bySeverity).map(([severity, count]) => (
                <div key={severity} className="flex justify-between items-center">
                  <span className="capitalize text-gray-600">{severity}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              ))}
              {Object.keys(alertStats.bySeverity).length === 0 && (
                <div className="text-gray-400 text-center py-4">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">按规则</h3>
            <div className="space-y-3 text-sm">
              {Object.entries(alertStats.byRule).slice(0, 10).map(([rule, count]) => (
                <div key={rule} className="flex justify-between items-center">
                  <span className="truncate text-gray-600">{rule}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              ))}
              {Object.keys(alertStats.byRule).length === 0 && (
                <div className="text-gray-400 text-center py-4">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">总体统计</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 border border-gray-200 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {alertStats.total}
                </div>
                <div className="text-sm text-gray-500">总告警数</div>
              </div>
              <div className="text-center p-4 border border-gray-200 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {alertStats.silencedCount}
                </div>
                <div className="text-sm text-gray-500">已静默</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}