import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils, PermissionUtils } from '@/lib/utils/auth';
import { apiKeyManager } from '@/lib/services/api-key-manager';
import { auditLogger } from '@/lib/services/audit-logger';
import { createDefaultRateLimiter, createApiKeyRateLimiter } from '@/lib/utils/rate-limit';
import type { AuthUser, Permission, SecurityEventType } from '@/types/auth';
import { v4 as uuidv4 } from 'uuid';

const defaultRateLimiter = createDefaultRateLimiter();
const apiKeyRateLimiter = createApiKeyRateLimiter();

/**
 * API 认证配置
 */
export interface ApiAuthConfig {
  /** 所需权限列表 */
  requiredPermissions?: Permission[];
  /** 是否启用速率限制 */
  enableRateLimit?: boolean;
  /** 是否记录审计日志 */
  enableAudit?: boolean;
}

/**
 * 认证结果
 */
export interface AuthenticatedRequest {
  /** 认证用户 */
  user: AuthUser;
  /** 请求 ID */
  requestId: string;
  /** 客户端 IP */
  clientIP: string;
}

/**
 * 创建 JSON 错误响应
 */
function createErrorResponse(
  code: number,
  msg: string,
  status: number,
  requestId: string,
  additionalHeaders: Record<string, string> = {}
): NextResponse {
  return new NextResponse(
    JSON.stringify({ 
      code,
      msg,
      timestamp: Date.now(),
      requestId,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...additionalHeaders,
      },
    }
  );
}

/**
 * 从请求中提取客户端 IP
 */
function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * 记录安全事件
 */
async function logSecurityEvent(
  request: NextRequest,
  type: SecurityEventType,
  severity: 'low' | 'medium' | 'high',
  description: string,
  clientIP: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await auditLogger.logSecurityEvent({
    type,
    severity,
    description,
    ip: clientIP,
    userAgent: request.headers.get('user-agent') || '',
    path: request.nextUrl.pathname,
    userId,
    metadata: metadata || {},
  });
}

/**
 * 认证请求
 */
async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return JWTUtils.verifyToken(token);
  }

  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    return await apiKeyManager.verifyApiKey(apiKey);
  }

  return {
    success: false,
    error: '缺少认证信息',
    errorCode: 'MISSING_AUTH',
  };
}

/**
 * API Route 认证中间件
 * 
 * @param request - HTTP 请求对象
 * @param config - 认证配置
 * @returns 认证结果或错误响应
 * 
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const auth = await authenticateApiRoute(request, {
 *     requiredPermissions: ['review:read'],
 *     enableRateLimit: true,
 *   });
 *   
 *   if (auth instanceof NextResponse) {
 *     return auth; // 认证失败，返回错误响应
 *   }
 *   
 *   // 认证成功，继续处理
 *   const { user, requestId } = auth;
 *   // ...
 * }
 * ```
 */
export async function authenticateApiRoute(
  request: NextRequest,
  config: ApiAuthConfig = {}
): Promise<AuthenticatedRequest | NextResponse> {
  const {
    requiredPermissions = [],
    enableRateLimit = true,
    enableAudit = true,
  } = config;

  const requestId = uuidv4();
  const clientIP = getClientIP(request);
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  try {
    const authResult = await authenticateRequest(request);
    
    if (!authResult.success) {
      const eventType = authResult.errorCode === 'TOKEN_EXPIRED' 
        ? 'expired_token' as SecurityEventType
        : 'invalid_token' as SecurityEventType;

      if (enableAudit) {
        await logSecurityEvent(
          request,
          eventType,
          'low',
          authResult.error || '认证失败',
          clientIP,
          undefined,
          { errorCode: authResult.errorCode }
        );
      }

      return createErrorResponse(
        1001,
        authResult.error || '认证失败',
        401,
        requestId,
        { 'WWW-Authenticate': 'Bearer realm="API", error="invalid_token"' }
      );
    }

    const user = authResult.user!;

    if (requiredPermissions.length > 0 && !PermissionUtils.hasAnyPermission(user, requiredPermissions)) {
      const permissionDebugInfo = {
        requiredPermissions,
        userPermissions: user.permissions,
        userRole: user.role,
        hasPermission: requiredPermissions.map(p => ({
          permission: p,
          hasIt: PermissionUtils.hasPermission(user, p)
        }))
      };

      console.log('权限检查失败:', permissionDebugInfo);

      if (enableAudit) {
        await logSecurityEvent(
          request,
          'insufficient_permissions' as SecurityEventType,
          'medium',
          '权限不足',
          clientIP,
          user.id,
          { 
            requiredPermissions,
            userPermissions: user.permissions,
            userRole: user.role 
          }
        );
      }

      return createErrorResponse(1002, '权限不足', 403, requestId);
    }

    if (enableRateLimit) {
      const rateLimiter = user.authMethod === 'apikey' ? apiKeyRateLimiter : defaultRateLimiter;
      const key = rateLimiter.config.keyGenerator?.(request as any) || user.id;
      const rateLimitResult = await rateLimiter.checkLimit(key);
      
      if (!rateLimitResult.allowed) {
        if (enableAudit) {
          await logSecurityEvent(
            request,
            'rate_limit_exceeded' as SecurityEventType,
            'low',
            '速率限制超出',
            clientIP,
            user.id,
            { 
              limit: rateLimitResult.limit,
              resetTime: rateLimitResult.resetTime 
            }
          );
        }

        return createErrorResponse(
          1007,
          '请求过于频繁，请稍后再试',
          429,
          requestId,
          {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        );
      }
    }

    if (enableAudit) {
      await auditLogger.logAudit({
        user,
        action: 'access',
        resource: 'api',
        method,
        path: pathname,
        ip: clientIP,
        userAgent: request.headers.get('user-agent') || '',
        requestId,
        success: true,
        statusCode: 200,
        duration: 0,
      });
    }

    return {
      user,
      requestId,
      clientIP,
    };
  } catch (error) {
    console.error('API 认证错误:', error);
    return createErrorResponse(2000, '认证服务异常', 500, requestId);
  }
}
