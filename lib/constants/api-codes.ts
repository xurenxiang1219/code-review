/**
 * API 业务状态码定义
 * 
 * 状态码规则：
 * - 0: 成功
 * - 1xxx: 客户端错误
 * - 2xxx: 服务端错误  
 * - 3xxx: 业务逻辑错误
 */
export const ApiCode = {
  // 成功
  SUCCESS: 0,
  
  // 客户端错误 (1xxx)
  BAD_REQUEST: 1000,
  UNAUTHORIZED: 1001,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  CONFLICT: 1009,
  VALIDATION_ERROR: 1005,
  RATE_LIMIT_EXCEEDED: 1006,
  INVALID_PARAMETERS: 1007,
  MISSING_REQUIRED_FIELD: 1008,
  
  // 服务端错误 (2xxx)
  INTERNAL_ERROR: 2000,
  DATABASE_ERROR: 2001,
  REDIS_ERROR: 2002,
  AI_SERVICE_ERROR: 2003,
  GIT_SERVICE_ERROR: 2004,
  QUEUE_ERROR: 2005,
  NETWORK_ERROR: 2006,
  TIMEOUT_ERROR: 2007,
  SERVICE_UNAVAILABLE: 2008,
  
  // 业务错误 (3xxx)
  REVIEW_NOT_FOUND: 3001,
  COMMIT_ALREADY_PROCESSED: 3002,
  INVALID_WEBHOOK_SIGNATURE: 3003,
  REVIEW_IN_PROGRESS: 3004,
  CONFIG_NOT_FOUND: 3005,
  INVALID_COMMIT_HASH: 3006,
  BRANCH_NOT_SUPPORTED: 3007,
  DIFF_TOO_LARGE: 3008,
  AI_QUOTA_EXCEEDED: 3009,
  REPOSITORY_ACCESS_DENIED: 3010,
  INVALID_REVIEW_CONFIG: 3011,
  COMMENT_PUBLISH_FAILED: 3012,
  NOTIFICATION_SEND_FAILED: 3013,
} as const;

/**
 * 状态码对应的中文消息
 */
export const ApiMessage: Record<number, string> = {
  // 成功
  [ApiCode.SUCCESS]: '操作成功',
  
  // 客户端错误
  [ApiCode.BAD_REQUEST]: '请求参数错误',
  [ApiCode.UNAUTHORIZED]: '未授权访问',
  [ApiCode.FORBIDDEN]: '禁止访问',
  [ApiCode.NOT_FOUND]: '资源不存在',
  [ApiCode.CONFLICT]: '资源冲突',
  [ApiCode.VALIDATION_ERROR]: '数据验证失败',
  [ApiCode.RATE_LIMIT_EXCEEDED]: '请求频率超限',
  [ApiCode.INVALID_PARAMETERS]: '参数格式错误',
  [ApiCode.MISSING_REQUIRED_FIELD]: '缺少必填字段',
  
  // 服务端错误
  [ApiCode.INTERNAL_ERROR]: '服务器内部错误',
  [ApiCode.DATABASE_ERROR]: '数据库连接错误',
  [ApiCode.REDIS_ERROR]: '缓存服务错误',
  [ApiCode.AI_SERVICE_ERROR]: 'AI 服务不可用',
  [ApiCode.GIT_SERVICE_ERROR]: 'Git 服务连接失败',
  [ApiCode.QUEUE_ERROR]: '任务队列服务错误',
  [ApiCode.NETWORK_ERROR]: '网络连接错误',
  [ApiCode.TIMEOUT_ERROR]: '请求超时',
  [ApiCode.SERVICE_UNAVAILABLE]: '服务暂时不可用',
  
  // 业务错误
  [ApiCode.REVIEW_NOT_FOUND]: '审查记录不存在',
  [ApiCode.COMMIT_ALREADY_PROCESSED]: '该提交已被处理',
  [ApiCode.INVALID_WEBHOOK_SIGNATURE]: 'Webhook 签名验证失败',
  [ApiCode.REVIEW_IN_PROGRESS]: '审查正在进行中',
  [ApiCode.CONFIG_NOT_FOUND]: '审查配置不存在',
  [ApiCode.INVALID_COMMIT_HASH]: '无效的提交哈希',
  [ApiCode.BRANCH_NOT_SUPPORTED]: '不支持的分支',
  [ApiCode.DIFF_TOO_LARGE]: '代码变更过大',
  [ApiCode.AI_QUOTA_EXCEEDED]: 'AI 服务配额已用完',
  [ApiCode.REPOSITORY_ACCESS_DENIED]: '仓库访问被拒绝',
  [ApiCode.INVALID_REVIEW_CONFIG]: '审查配置格式错误',
  [ApiCode.COMMENT_PUBLISH_FAILED]: '评论发布失败',
  [ApiCode.NOTIFICATION_SEND_FAILED]: '通知发送失败',
};

/**
 * 状态码类型定义
 */
export type ApiCodeType = typeof ApiCode[keyof typeof ApiCode];

/**
 * 获取状态码对应的消息
 * @param code - 状态码
 * @returns 对应的中文消息
 */
export function getApiMessage(code: ApiCodeType): string {
  return ApiMessage[code] || '未知错误';
}

/**
 * 检查是否为成功状态码
 * @param code - 状态码
 * @returns 是否成功
 */
export function isSuccessCode(code: ApiCodeType): boolean {
  return code === ApiCode.SUCCESS;
}

/**
 * 检查是否为客户端错误
 * @param code - 状态码
 * @returns 是否为客户端错误
 */
export function isClientError(code: ApiCodeType): boolean {
  return code >= 1000 && code < 2000;
}

/**
 * 检查是否为服务端错误
 * @param code - 状态码
 * @returns 是否为服务端错误
 */
export function isServerError(code: ApiCodeType): boolean {
  return code >= 2000 && code < 3000;
}

/**
 * 检查是否为业务错误
 * @param code - 状态码
 * @returns 是否为业务错误
 */
export function isBusinessError(code: ApiCodeType): boolean {
  return code >= 3000 && code < 4000;
}