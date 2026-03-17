import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * 日志上下文接口
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  commitHash?: string;
  reviewId?: string;
  taskId?: string;
  [key: string]: any;
}

/**
 * 敏感信息脱敏配置
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'session',
  'apiKey',
  'accessToken',
  'refreshToken',
  'webhookSecret',
  'jwtSecret',
  'encryptionKey',
  'masterKey',
  'dbPassword',
  'redisPassword',
  'smtpPassword',
  'privateKey',
  'publicKey',
  'certificate',
];

/**
 * 增强的脱敏处理函数
 * 支持加密字段识别和深度嵌套对象处理
 * @param obj - 需要脱敏的对象
 * @returns 脱敏后的对象
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // 检查是否为加密字段
    if (obj.startsWith('enc:')) {
      return '[ENCRYPTED]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = SENSITIVE_FIELDS.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = typeof value === 'string' 
          ? maskSensitiveValue(value)
          : '[SENSITIVE_DATA]';
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * 增强的敏感值掩码函数
 * @param value - 敏感值
 * @returns 掩码后的值
 */
function maskSensitiveValue(value: string): string {
  if (!value) {
    return '***';
  }

  // 检查是否为加密字段
  if (value.startsWith('enc:')) {
    return '[ENCRYPTED]';
  }

  if (value.length <= 6) {
    return '***';
  }
  
  if (value.length <= 12) {
    return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
  }
  
  return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
}

/**
 * 检测并标记可能的敏感信息
 * @param obj - 要检测的对象
 * @returns 检测结果
 */
function detectSensitiveData(obj: any): {
  hasSensitiveData: boolean;
  sensitiveFields: string[];
} {
  const sensitiveFields: string[] = [];
  
  const detect = (current: any, path: string = ''): void => {
    if (current && typeof current === 'object') {
      for (const [key, value] of Object.entries(current)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        // 检查字段名是否敏感
        const isSensitiveField = SENSITIVE_FIELDS.some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        );
        
        if (isSensitiveField) {
          sensitiveFields.push(currentPath);
        }
        
        // 检查值是否为加密数据
        if (typeof value === 'string' && value.startsWith('enc:')) {
          sensitiveFields.push(`${currentPath}[encrypted]`);
        }
        
        // 递归检测嵌套对象
        if (value && typeof value === 'object') {
          detect(value, currentPath);
        }
      }
    }
  };
  
  detect(obj);
  
  return {
    hasSensitiveData: sensitiveFields.length > 0,
    sensitiveFields,
  };
}

/**
 * 自定义日志格式化器
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const sanitizedMeta = sanitizeObject(meta);
    
    // 检测敏感数据并添加标记
    const sensitiveDetection = detectSensitiveData(meta);
    if (sensitiveDetection.hasSensitiveData) {
      sanitizedMeta._sensitiveDataDetected = true;
      sanitizedMeta._sensitiveFields = sensitiveDetection.sensitiveFields;
    }
    
    const logEntry = {
      timestamp,
      level,
      message,
      ...sanitizedMeta,
    };
    return JSON.stringify(logEntry);
  })
);

/**
 * 创建 Winston Logger 实例
 */
const createLogger = (): winston.Logger => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const isDevelopment = process.env.NODE_ENV === 'development';

  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: logLevel,
      format: isDevelopment
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : customFormat,
    }),
  ];

  // 生产环境添加文件日志
  if (!isDevelopment) {
    const fileOptions = {
      format: customFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
    };

    transports.push(
      new winston.transports.File({
        ...fileOptions,
        filename: 'logs/error.log',
        level: 'error',
        maxFiles: 5,
      }),
      new winston.transports.File({
        ...fileOptions,
        filename: 'logs/combined.log',
        maxFiles: 10,
      })
    );
  }

  return winston.createLogger({
    level: logLevel,
    format: customFormat,
    transports,
    exceptionHandlers: [
      new winston.transports.File({ filename: 'logs/exceptions.log' }),
    ],
    rejectionHandlers: [
      new winston.transports.File({ filename: 'logs/rejections.log' }),
    ],
  });
};

/**
 * Logger 类，提供结构化日志功能
 */
class Logger {
  private winston: winston.Logger;
  private context: LogContext = {};

  constructor() {
    this.winston = createLogger();
  }

  /**
   * 设置全局上下文
   * @param context - 上下文信息
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * 生成请求ID
   * @returns 唯一请求ID
   */
  generateRequestId(): string {
    const requestId = uuidv4();
    this.setContext({ requestId });
    return requestId;
  }

  /**
   * 记录错误日志
   * @param message - 日志消息
   * @param meta - 附加信息
   */
  error(message: string, meta: LogContext = {}): void {
    this.winston.error(message, { ...this.context, ...meta });
  }

  /**
   * 记录警告日志
   * @param message - 日志消息
   * @param meta - 附加信息
   */
  warn(message: string, meta: LogContext = {}): void {
    this.winston.warn(message, { ...this.context, ...meta });
  }

  /**
   * 记录信息日志
   * @param message - 日志消息
   * @param meta - 附加信息
   */
  info(message: string, meta: LogContext = {}): void {
    this.winston.info(message, { ...this.context, ...meta });
  }

  /**
   * 记录调试日志
   * @param message - 日志消息
   * @param meta - 附加信息
   */
  debug(message: string, meta: LogContext = {}): void {
    this.winston.debug(message, { ...this.context, ...meta });
  }

  /**
   * 记录性能日志
   * @param operation - 操作名称
   * @param duration - 执行时间（毫秒）
   * @param meta - 附加信息
   */
  performance(operation: string, duration: number, meta: LogContext = {}): void {
    this.info(`Performance: ${operation}`, {
      ...meta,
      operation,
      duration,
      type: 'performance',
    });
  }

  /**
   * 记录审查流程日志
   * @param stage - 审查阶段
   * @param commitHash - 提交哈希
   * @param meta - 附加信息
   */
  reviewFlow(stage: string, commitHash: string, meta: LogContext = {}): void {
    this.info(`Review Flow: ${stage}`, {
      ...meta,
      stage,
      commitHash,
      type: 'review_flow',
    });
  }

  /**
   * 记录安全相关日志
   * @param event - 安全事件
   * @param meta - 附加信息
   */
  security(event: string, meta: LogContext = {}): void {
    this.warn(`Security Event: ${event}`, {
      ...meta,
      event,
      type: 'security',
    });
  }

  /**
   * 记录敏感数据操作日志
   * @param operation - 操作类型（encrypt、decrypt、sanitize等）
   * @param dataType - 数据类型（config、database、log等）
   * @param meta - 附加信息
   */
  sensitiveData(operation: string, dataType: string, meta: LogContext = {}): void {
    this.info(`Sensitive Data Operation: ${operation}`, {
      ...meta,
      operation,
      dataType,
      type: 'sensitive_data',
    });
  }

  /**
   * 记录加密操作日志
   * @param operation - 加密操作（encrypt、decrypt、rotate_key等）
   * @param target - 目标对象类型
   * @param meta - 附加信息
   */
  encryption(operation: string, target: string, meta: LogContext = {}): void {
    this.info(`Encryption Operation: ${operation}`, {
      ...meta,
      operation,
      target,
      type: 'encryption',
    });
  }

  /**
   * 安全地记录包含敏感信息的对象
   * 自动进行脱敏处理并标记敏感字段
   * @param message - 日志消息
   * @param data - 包含敏感信息的数据
   * @param level - 日志级别
   */
  secureLog(message: string, data: any, level: LogLevel = LogLevel.INFO): void {
    const sanitizedData = sanitizeObject(data);
    const detection = detectSensitiveData(data);
    
    const logMeta: LogContext = {
      data: sanitizedData,
      _secureLog: true,
    };
    
    if (detection.hasSensitiveData) {
      logMeta._sensitiveDataDetected = true;
      logMeta._sensitiveFieldsCount = detection.sensitiveFields.length;
      // 不记录具体的敏感字段路径，避免泄露结构信息
    }
    
    switch (level) {
      case LogLevel.ERROR:
        this.error(message, logMeta);
        break;
      case LogLevel.WARN:
        this.warn(message, logMeta);
        break;
      case LogLevel.DEBUG:
        this.debug(message, logMeta);
        break;
      default:
        this.info(message, logMeta);
    }
  }

  /**
   * 记录数据脱敏操作
   * @param originalFieldsCount - 原始字段数量
   * @param sanitizedFieldsCount - 脱敏字段数量
   * @param meta - 附加信息
   */
  dataSanitization(
    originalFieldsCount: number, 
    sanitizedFieldsCount: number, 
    meta: LogContext = {}
  ): void {
    this.info('Data sanitization completed', {
      ...meta,
      originalFieldsCount,
      sanitizedFieldsCount,
      sanitizationRatio: sanitizedFieldsCount / originalFieldsCount,
      type: 'data_sanitization',
    });
  }

  /**
   * 创建子Logger，继承当前上下文
   * @param additionalContext - 额外上下文
   * @returns 新的Logger实例
   */
  child(additionalContext: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.setContext({ ...this.context, ...additionalContext });
    return childLogger;
  }
}

// 导出单例实例
export const logger = new Logger();

// 导出Logger类，用于创建子实例
export { Logger };

/**
 * 性能监控装饰器
 * @param operation - 操作名称
 */
export function logPerformance(operation: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const requestId = logger.generateRequestId();
      
      logger.info(`Starting ${operation}`, { operation, requestId });
      
      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        
        logger.performance(operation, duration, { requestId, success: true });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.performance(operation, duration, { 
          requestId, 
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 错误处理装饰器
 * @param operation - 操作名称
 */
export function logErrors(operation: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        logger.error(`Error in ${operation}`, {
          operation,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          } : String(error),
          args: sanitizeObject(args),
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}