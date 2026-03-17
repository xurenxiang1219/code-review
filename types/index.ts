// 审查相关类型
export * from './review';

// Git 相关类型
export * from './git';

// AI 相关类型
export * from './ai';

// 配置相关类型
export * from './config';

// API 相关类型
export * from './api';

// 通用工具类型
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 时间戳类型
export type Timestamp = number;
export type DateString = string;

// ID 类型
export type UUID = string;
export type EntityId = string;

// 状态类型
export type Status = 'active' | 'inactive' | 'pending' | 'disabled';

// 排序类型
export type SortOrder = 'asc' | 'desc';
export interface SortOptions {
  field: string;
  order: SortOrder;
}

// 分页类型
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

// 过滤器类型
export interface FilterOptions {
  [key: string]: any;
}

// 查询选项类型
export interface QueryOptions {
  pagination?: PaginationOptions;
  sort?: SortOptions;
  filters?: FilterOptions;
}

// 操作结果类型
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// 异步操作结果类型
export type AsyncOperationResult<T = any> = Promise<OperationResult<T>>;

// 事件类型
export interface SystemEvent {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
}

// 监控指标类型
export interface Metric {
  name: string;
  value: number;
  unit?: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

// 系统信息类型
export interface SystemInfo {
  version: string;
  environment: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
}