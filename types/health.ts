/**
 * 健康检查相关类型定义
 */

/**
 * 服务健康状态
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

/**
 * 单个服务的健康检查结果
 */
export interface ServiceHealth {
  /** 服务名称 */
  name: string;
  /** 健康状态 */
  status: HealthStatus;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 详细信息 */
  details?: Record<string, any>;
  /** 错误信息 */
  error?: string;
  /** 检查时间戳 */
  timestamp: number;
}

/**
 * 系统整体健康检查结果
 */
export interface SystemHealth {
  /** 系统整体状态 */
  status: HealthStatus;
  /** 检查时间戳 */
  timestamp: number;
  /** 系统运行时间（毫秒） */
  uptime: number;
  /** 各服务健康状态 */
  services: ServiceHealth[];
  /** 系统信息 */
  system: {
    /** Node.js 版本 */
    nodeVersion: string;
    /** 内存使用情况 */
    memory: {
      /** 已使用内存（MB） */
      used: number;
      /** 总内存（MB） */
      total: number;
      /** 使用率（%） */
      usage: number;
    };
    /** CPU 使用情况 */
    cpu: {
      /** CPU 使用率（%） */
      usage: number;
    };
  };
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  /** 超时时间（毫秒） */
  timeout: number;
  /** 是否检查数据库 */
  checkDatabase: boolean;
  /** 是否检查 Redis */
  checkRedis: boolean;
  /** 是否检查 AI 服务 */
  checkAI: boolean;
}