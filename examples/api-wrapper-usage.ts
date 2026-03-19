/**
 * API包装器使用示例
 * 
 * 这个文件展示了如何使用新的API包装器来简化API路由的编写
 */

import { NextRequest } from 'next/server';
import { createApiRoute, createApiRoutes, withAuthApiWrapper } from '@/lib/middleware/api-wrapper';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

// ============================================================================
// 示例1: 简单的GET API
// ============================================================================

// 旧的写法（需要手动调用handleApiRequest）
/*
export async function GET(request: NextRequest) {
  return handleApiRequest(async () => {
    const data = { message: 'Hello World' };
    return data;
  });
}
*/

// 新的写法（使用API包装器）
export const GET = createApiRoute(async (request: NextRequest) => {
  const data = { message: 'Hello World' };
  return data;
});

// ============================================================================
// 示例2: 支持多个HTTP方法的API
// ============================================================================

// 旧的写法
/*
export async function GET(request: NextRequest) {
  return handleApiRequest(async () => {
    return { method: 'GET' };
  });
}

export async function POST(request: NextRequest) {
  return handleApiRequest(async () => {
    const body = await request.json();
    return { method: 'POST', body };
  });
}
*/

// 新的写法
const { GET: getHandler, POST: postHandler } = createApiRoutes({
  GET: async (request) => {
    return { method: 'GET' };
  },
  POST: async (request) => {
    const body = await request.json();
    return { method: 'POST', body };
  },
});

export { getHandler as GET, postHandler as POST };

// ============================================================================
// 示例3: 带认证的API
// ============================================================================

// 旧的写法
/*
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    return { userId: auth.user.id };
  });
}
*/

// 新的写法
export const authenticatedGET = withAuthApiWrapper(
  async (request: NextRequest) => {
    // 这里可以直接访问认证后的用户信息
    const userId = request.headers.get('X-User-ID');
    return { userId };
  },
  {
    authMiddleware: async (request) => {
      const auth = await authenticateApiRoute(request, {
        requiredPermissions: [Permission.CONFIG_READ],
        enableRateLimit: true,
      });
      
      if (auth instanceof NextResponse) {
        throw new Error('认证失败');
      }
      
      return auth;
    },
  }
);

// ============================================================================
// 示例4: 自定义选项的API
// ============================================================================

export const customAPI = createApiRoute(
  async (request: NextRequest) => {
    return { timestamp: new Date().toISOString() };
  },
  {
    successMessage: '时间戳获取成功',
    errorMessage: '时间戳获取失败',
    enableLogging: true,
  }
);

// ============================================================================
// 示例5: 原始响应模式（不包装响应格式）
// ============================================================================

export const rawAPI = createApiRoute(
  async (request: NextRequest) => {
    // 直接返回NextResponse，不会被包装
    return new Response('Plain text response', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
  {
    rawResponse: true,
  }
);

// ============================================================================
// 示例6: 重构现有的监控API
// ============================================================================

// 原来的监控API（app/api/monitoring/route.ts）可以这样重构：
/*
export const { GET: monitoringGET, POST: monitoringPOST } = createApiRoutes({
  GET: async (request) => {
    const auth = await authenticateApiRoute(request, {
      requiredPermissions: [Permission.CONFIG_READ],
      enableRateLimit: true,
    });
    
    if (auth instanceof NextResponse) {
      throw new Error('认证失败');
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') ?? 'dashboard';
    
    // 监控逻辑...
    return monitoringData;
  },
  
  POST: async (request) => {
    const auth = await authenticateApiRoute(request, {
      requiredPermissions: [Permission.CONFIG_WRITE],
      enableRateLimit: true,
    });
    
    if (auth instanceof NextResponse) {
      throw new Error('认证失败');
    }

    const body = await request.json();
    // 处理POST逻辑...
    return result;
  },
});
*/