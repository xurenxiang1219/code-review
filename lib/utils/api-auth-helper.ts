import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

/**
 * 统一认证检查辅助函数
 * @param request - HTTP请求对象
 * @param permissions - 所需权限列表
 * @returns 认证结果，失败时抛出错误
 */
export async function checkAuth(request: NextRequest, permissions: Permission[]) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: permissions,
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }
  
  return auth;
}