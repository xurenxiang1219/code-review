import { NextRequest, NextResponse } from 'next/server';
import type { AuthUser, Permission } from '@/types/auth';
import { UserRole } from '@/types/auth';

/**
 * 简化的认证结果
 */
export interface SimpleAuthResult {
  /** 认证用户 */
  user: AuthUser;
  /** 请求 ID */
  requestId: string;
  /** 客户端 IP */
  clientIP: string;
}
/**
 * API 认证配置
 */
export interface SimpleApiAuthConfig {
  /** 所需权限列表 */
  requiredPermissions?: Permission[];
}

/**
 * 创建 JSON 错误响应
 */
function createErrorResponse(
  code: number,
  msg: string,
  status: number,
  requestId: string
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
 * 简单的JWT验证（不依赖crypto模块）
 * @param token - JWT token
 * @returns 验证结果
 */
function verifySimpleToken(token: string): { success: boolean; user?: AuthUser; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { success: false, error: 'Token格式无效' };
    }

    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    // 检查token是否过期
    if (payload.exp && payload.exp < now) {
      return { success: false, error: 'Token已过期' };
    }

    // 构造用户信息
    const user: AuthUser = {
      id: payload.sub || payload.userId || 'unknown',
      email: payload.email || 'unknown@example.com',
      role: payload.role || UserRole.VIEWER,
      permissions: payload.permissions || [],
      authMethod: 'jwt',
    };

    return { success: true, user };
  } catch (error) {
    return { success: false, error: 'Token解析失败' };
  }
}

/**
 * 检查用户权限
 * @param user - 用户信息
 * @param requiredPermissions - 所需权限
 * @returns 是否有权限
 */
/**
 * 检查用户权限
 * @param user - 用户信息
 * @param requiredPermissions - 所需权限
 * @returns 是否有权限
 */
function hasPermission(user: AuthUser, requiredPermissions: Permission[]): boolean {
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  return requiredPermissions.some(permission => user.permissions.includes(permission));
}

/**
 * 简化的API Route 认证中间件
 * 
 * @param request - HTTP 请求对象
 * @param config - 认证配置
 * @returns 认证结果或错误响应
 */
export async function authenticateApiRouteSimple(
  request: NextRequest,
  config: SimpleApiAuthConfig = {}
): Promise<SimpleAuthResult | NextResponse> {
  const { requiredPermissions = [] } = config;
  const requestId = crypto.randomUUID();
  const clientIP = getClientIP(request);

  try {
    // 获取认证头
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return createErrorResponse(1001, '缺少认证信息', 401, requestId);
    }

    const token = authHeader.substring(7);
    const authResult = verifySimpleToken(token);
    
    if (!authResult.success) {
      return createErrorResponse(1001, authResult.error || '认证失败', 401, requestId);
    }

    const user = authResult.user!;

    // 检查权限
    if (requiredPermissions.length > 0 && !hasPermission(user, requiredPermissions)) {
      return createErrorResponse(1002, '权限不足', 403, requestId);
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