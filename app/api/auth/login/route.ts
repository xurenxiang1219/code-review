import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils, PermissionUtils, SecurityUtils } from '@/lib/utils/auth';
import { auditLogger } from '@/lib/services/audit-logger';
import { ApiCode } from '@/lib/constants/api-codes';
import { UserRole, Permission } from '@/types/auth';
import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';
import '@/lib/init/auth';

/**
 * 登录 API - 提供基于邮箱的简化登录功能
 */

interface LoginRequestBody {
  email: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  enabled: boolean;
}

/**
 * 验证登录请求参数
 * @param body - 请求体
 * @returns 验证结果
 */
function validateLoginRequest(body: any): { valid: boolean; error?: string } {
  if (!body.email) {
    return { valid: false, error: '邮箱地址不能为空' };
  }

  if (!SecurityUtils.isValidEmail(body.email)) {
    return { valid: false, error: '邮箱格式无效' };
  }

  return { valid: true };
}

/**
 * 获取或创建用户
 * @param email - 用户邮箱
 * @returns 用户信息
 */
async function getOrCreateUser(email: string): Promise<UserInfo> {
  await db.initialize();

  const existingUser = await db.queryOne(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );

  if (existingUser) {
    return {
      id: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
      role: existingUser.role as UserRole,
      enabled: existingUser.enabled,
    };
  }

  // 创建新用户
  const userId = crypto.randomUUID();
  const name = email.split('@')[0];
  const role = UserRole.DEVELOPER;

  await db.execute(
    'INSERT INTO users (id, email, name, role, enabled) VALUES (?, ?, ?, ?, ?)',
    [userId, email, name, role, true]
  );

  return { id: userId, email, name, role, enabled: true };
}

/**
 * 创建标准响应
 * @param success - 是否成功
 * @param code - 响应代码
 * @param message - 响应消息
 * @param data - 响应数据
 * @param requestId - 请求ID
 * @param status - HTTP状态码
 * @returns Next.js响应对象
 */
function createResponse(
  success: boolean,
  code: number,
  message: string,
  requestId: string,
  data?: any,
  status = 200
): NextResponse {
  const response = {
    code,
    msg: message,
    timestamp: Date.now(),
    requestId,
    ...(data && { data }),
  };

  return NextResponse.json(response, { status });
}

/**
 * 记录用户审计日志
 * @param user - 用户信息
 * @param permissions - 用户权限
 * @param request - 请求对象
 * @param requestId - 请求ID
 */
async function logUserAudit(
  user: UserInfo,
  permissions: Permission[],
  request: NextRequest,
  requestId: string
): Promise<void> {
  await auditLogger.logAudit({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions,
      authMethod: 'jwt',
    },
    action: 'login',
    resource: 'auth',
    method: 'POST',
    path: '/api/auth/login',
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || '',
    requestId,
    success: true,
    statusCode: 200,
    duration: 0,
  });
}

/**
 * POST /api/auth/login - 用户登录
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({
    requestId,
    endpoint: '/api/auth/login',
    method: 'POST',
  });

  try {
    const body: LoginRequestBody = await request.json();
    reqLogger.info('用户登录请求', { email: body.email });

    // 验证请求参数
    const validation = validateLoginRequest(body);
    if (!validation.valid) {
      return createResponse(false, ApiCode.BAD_REQUEST, validation.error!, requestId, null, 400);
    }

    // 获取或创建用户
    const user = await getOrCreateUser(body.email);

    if (!user.enabled) {
      reqLogger.warn('用户已被禁用', { email: body.email, userId: user.id });
      return createResponse(false, ApiCode.FORBIDDEN, '用户已被禁用', requestId, null, 403);
    }

    // 获取用户权限并生成JWT Token
    const permissions = PermissionUtils.getDefaultPermissions(user.role);
    const token = JWTUtils.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions,
    }, '24h');

    // 记录审计日志
    await logUserAudit(user, permissions, request, requestId);

    reqLogger.info('用户登录成功', { 
      email: body.email, 
      userId: user.id, 
      role: user.role 
    });

    return createResponse(true, ApiCode.SUCCESS, '登录成功', requestId, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reqLogger.error('登录失败', { error: errorMessage });
    
    return createResponse(false, ApiCode.INTERNAL_ERROR, '登录失败', requestId, null, 500);
  }
}