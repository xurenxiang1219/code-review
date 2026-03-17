import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from './Card';
import { Badge } from './Badge';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import type { SystemHealth, HealthStatus } from '@/types/health';

/**
 * 系统状态组件属性
 */
export interface SystemStatusProps {
  /** 是否自动刷新 */
  autoRefresh?: boolean;
  /** 刷新间隔（毫秒） */
  refreshInterval?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 健康状态到徽章变体的映射
 */
const statusToBadgeVariant = (status: HealthStatus) => {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
      return 'danger';
    default:
      return 'default';
  }
};

/**
 * 健康状态到中文的映射
 */
const statusToText = (status: HealthStatus) => {
  switch (status) {
    case 'healthy':
      return '健康';
    case 'degraded':
      return '降级';
    case 'unhealthy':
      return '异常';
    default:
      return '未知';
  }
};

/**
 * 系统状态组件
 * 
 * 显示系统各组件的健康状态，包括数据库、Redis、AI 服务等
 * 
 * @example
 * ```tsx
 * <SystemStatus autoRefresh refreshInterval={30000} />
 * ```
 */
export const SystemStatus: React.FC<SystemStatusProps> = ({
  autoRefresh = true,
  refreshInterval = 30000,
  className,
}) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取系统健康状态
   */
  const fetchHealth = async () => {
    try {
      setError(null);
      const response = await fetch('/api/health');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.code === 0) {
        setHealth(result.data);
      } else {
        throw new Error(result.msg || '获取健康状态失败');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError(errorMessage);
      console.error('获取系统健康状态失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchHealth, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  /**
   * 格式化运行时间
   */
  const formatUptime = (uptime: number) => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} 天 ${hours % 24} 小时`;
    }
    if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟`;
    }
    if (minutes > 0) {
      return `${minutes} 分钟`;
    }
    return `${seconds} 秒`;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent>
          <LoadingSpinner size="md" text="获取系统状态中..." center />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent>
          <Alert type="error" title="获取系统状态失败">
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card className={className}>
        <CardContent>
          <Alert type="warning">
            暂无系统状态数据
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader
        title="系统状态"
        subtitle={`运行时间: ${formatUptime(health.uptime)}`}
        actions={
          <Badge variant={statusToBadgeVariant(health.status)} size="md">
            {statusToText(health.status)}
          </Badge>
        }
      />
      <CardContent>
        <div className="space-y-4">
          {/* 服务状态列表 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">服务</h4>
            <div className="space-y-2">
              {health.services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between py-2 px-3 border border-gray-200 rounded"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {service.name}
                    </span>
                    <Badge
                      variant={statusToBadgeVariant(service.status)}
                      size="sm"
                    >
                      {statusToText(service.status)}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-400">
                    {service.responseTime}ms
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 系统信息 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">系统</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded p-3">
                <div className="text-xs text-gray-500 mb-1">Node.js</div>
                <div className="text-sm font-medium text-gray-900">
                  {health.system.nodeVersion}
                </div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-xs text-gray-500 mb-1">内存</div>
                <div className="text-sm font-medium text-gray-900">
                  {health.system.memory.used}MB / {health.system.memory.total}MB
                  <span className="text-xs text-gray-400 ml-1">
                    ({health.system.memory.usage}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatus;