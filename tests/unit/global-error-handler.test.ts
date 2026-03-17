import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { 
  GlobalErrorHandler, 
  ErrorCategory, 
  ErrorSeverity 
} from '@/lib/utils/global-error-handler';
import { ApiError } from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GlobalErrorHandler', () => {
  let errorHandler: GlobalErrorHandler;

  beforeEach(() => {
    errorHandler = GlobalErrorHandler.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('错误分析', () => {
    it('应该正确识别网络错误', () => {
      const networkError = new Error('ECONNREFUSED connection failed');
      const category = errorHandler.analyzeError(networkError);
      expect(category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('应该正确识别数据库错误', () => {
      const dbError = new Error('MySQL connection timeout');
      const category = errorHandler.analyzeError(dbError);
      expect(category).toBe(ErrorCategory.EXTERNAL_SERVICE_ERROR);
    });

    it('应该正确识别认证错误', () => {
      const authError = new Error('Unauthorized access');
      const category = errorHandler.analyzeError(authError);
      expect(category).toBe(ErrorCategory.SECURITY_ERROR);
    });

    it('应该正确识别验证错误', () => {
      const validationError = new Error('Invalid input parameters');
      const category = errorHandler.analyzeError(validationError);
      expect(category).toBe(ErrorCategory.CLIENT_ERROR);
    });

    it('应该为ApiError返回正确分类', () => {
      const clientError = new ApiError(ApiCode.BAD_REQUEST, 'Bad request');
      const serverError = new ApiError(ApiCode.INTERNAL_ERROR, 'Internal error');
      const businessError = new ApiError(ApiCode.REVIEW_NOT_FOUND, 'Review not found');

      expect(errorHandler.analyzeError(clientError)).toBe(ErrorCategory.CLIENT_ERROR);
      expect(errorHandler.analyzeError(serverError)).toBe(ErrorCategory.SERVER_ERROR);
      expect(errorHandler.analyzeError(businessError)).toBe(ErrorCategory.BUSINESS_ERROR);
    });

    it('应该为未知错误返回服务端错误分类', () => {
      const unknownError = new Error('Some unknown error');
      const category = errorHandler.analyzeError(unknownError);
      expect(category).toBe(ErrorCategory.SERVER_ERROR);
    });
  });

  describe('严重程度判断', () => {
    it('应该为安全错误返回高严重程度', () => {
      const error = new Error('Unauthorized');
      const severity = errorHandler.determineSeverity(error, ErrorCategory.SECURITY_ERROR);
      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('应该为网络错误返回中等严重程度', () => {
      const error = new Error('Network timeout');
      const severity = errorHandler.determineSeverity(error, ErrorCategory.NETWORK_ERROR);
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('应该为客户端错误返回低严重程度', () => {
      const error = new Error('Invalid input');
      const severity = errorHandler.determineSeverity(error, ErrorCategory.CLIENT_ERROR);
      expect(severity).toBe(ErrorSeverity.LOW);
    });

    it('应该根据错误消息关键词判断严重程度', () => {
      const criticalError = new Error('Critical system failure');
      const dbError = new Error('Database connection lost');
      
      const criticalSeverity = errorHandler.determineSeverity(criticalError, ErrorCategory.SERVER_ERROR);
      const dbSeverity = errorHandler.determineSeverity(dbError, ErrorCategory.SERVER_ERROR);
      
      expect(criticalSeverity).toBe(ErrorSeverity.CRITICAL);
      expect(dbSeverity).toBe(ErrorSeverity.HIGH);
    });
  });

  describe('结构化错误创建', () => {
    it('应该创建完整的结构化错误信息', () => {
      const error = new Error('Test error');
      const context = { userId: '123', operation: 'test' };
      
      const structuredError = errorHandler.createStructuredError(error, {
        context,
        category: ErrorCategory.BUSINESS_ERROR,
        severity: ErrorSeverity.MEDIUM,
      });

      expect(structuredError).toMatchObject({
        code: ApiCode.INTERNAL_ERROR,
        message: 'Test error',
        category: ErrorCategory.BUSINESS_ERROR,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context,
        originalError: error,
      });
      
      expect(structuredError.id).toBeDefined();
      expect(structuredError.timestamp).toBeDefined();
      expect(structuredError.stack).toBe(error.stack);
    });

    it('应该为ApiError使用正确的错误代码', () => {
      const apiError = new ApiError(ApiCode.VALIDATION_ERROR, 'Validation failed');
      
      const structuredError = errorHandler.createStructuredError(apiError);
      
      expect(structuredError.code).toBe(ApiCode.VALIDATION_ERROR);
      expect(structuredError.message).toBe('Validation failed');
    });
  });

  describe('API错误处理', () => {
    it('应该为ApiError返回正确的响应', async () => {
      const apiError = new ApiError(ApiCode.NOT_FOUND, 'Resource not found', 404);
      
      const response = await errorHandler.handleApiError(apiError);
      const responseData = await response.json();
      
      expect(response.status).toBe(404);
      expect(responseData.code).toBe(ApiCode.NOT_FOUND);
      expect(responseData.msg).toBe('Resource not found');
    });

    it('应该为网络错误返回503状态码', async () => {
      const networkError = new Error('ECONNREFUSED');
      
      const response = await errorHandler.handleApiError(networkError);
      const responseData = await response.json();
      
      expect(response.status).toBe(503);
      expect(responseData.code).toBe(ApiCode.SERVICE_UNAVAILABLE);
    });

    it('应该为认证错误返回401状态码', async () => {
      const authError = new Error('Unauthorized access');
      
      const response = await errorHandler.handleApiError(authError);
      const responseData = await response.json();
      
      expect(response.status).toBe(401);
      expect(responseData.code).toBe(ApiCode.UNAUTHORIZED);
    });

    it('应该包含请求上下文信息', async () => {
      const error = new Error('Test error');
      const mockRequest = {
        nextUrl: { pathname: '/api/test' },
        method: 'POST',
        headers: new Map([['user-agent', 'test-agent']]),
      } as any;
      
      const context = { userId: '123' };
      
      await errorHandler.handleApiError(error, mockRequest, context);
      
      // 验证日志记录包含上下文信息
      // 这里需要检查logger.error是否被正确调用
      // 由于logger被mock了，我们可以验证调用参数
    });
  });

  describe('恢复策略', () => {
    it('应该为网络错误提供重试策略', () => {
      const strategy = errorHandler.getRecoveryStrategy(ErrorCategory.NETWORK_ERROR);
      
      expect(strategy).toBeDefined();
      expect(strategy?.canAutoRecover).toBe(true);
      expect(strategy?.retryConfig).toBeDefined();
      expect(strategy?.retryConfig?.maxRetries).toBe(3);
    });

    it('应该为客户端错误提供非重试策略', () => {
      const strategy = errorHandler.getRecoveryStrategy(ErrorCategory.CLIENT_ERROR);
      
      expect(strategy).toBeDefined();
      expect(strategy?.canAutoRecover).toBe(false);
      expect(strategy?.retryConfig).toBeUndefined();
    });

    it('应该为外部服务错误提供重试策略', () => {
      const strategy = errorHandler.getRecoveryStrategy(ErrorCategory.EXTERNAL_SERVICE_ERROR);
      
      expect(strategy).toBeDefined();
      expect(strategy?.canAutoRecover).toBe(true);
      expect(strategy?.retryConfig?.maxRetries).toBe(2);
    });
  });

  describe('单例模式', () => {
    it('应该返回同一个实例', () => {
      const instance1 = GlobalErrorHandler.getInstance();
      const instance2 = GlobalErrorHandler.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('错误处理装饰器', () => {
    it('应该捕获并处理函数中的错误', async () => {
      const mockRequest = {
        nextUrl: { pathname: '/api/test' },
        method: 'GET',
        headers: new Map(),
      } as any;

      const errorHandler = GlobalErrorHandler.getInstance();
      const middleware = errorHandler.createApiErrorMiddleware();

      const failingHandler = async () => {
        throw new Error('Handler error');
      };

      const response = await middleware(failingHandler, mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe(ApiCode.INTERNAL_ERROR);
    });
  });
});