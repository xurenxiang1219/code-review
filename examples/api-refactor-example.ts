/**
 * API重构示例
 * 
 * 展示如何使用新的apiRoute和apiRoutes函数来简化API编写
 */

import { NextRequest } from 'next/server';
import { apiRoute, apiRoutes } from '@/lib/utils/api-response';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

// ============================================================================
// 示例1: 重构监控API (app/api/monitoring/route.ts)
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
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') ?? 'dashboard';
    
    // 监控逻辑...
    return monitoringData;
  });
}
*/

// 新的写法
export const GET = apiRoute(async (request: NextRequest) => {
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
  const monitoringData = { type, timestamp: Date.now() };
  return monitoringData;
});

// ============================================================================
// 示例2: 重构加密API (app/api/encryption/route.ts)
// ============================================================================

// 使用apiRoutes同时处理多个HTTP方法
const { GET: encryptionGET, POST: encryptionPOST, PUT: encryptionPUT } = apiRoutes({
  // GET - 获取加密状态
  GET: async (request: NextRequest) => {
    const auth = await authenticateApiRoute(request, {
      requiredPermissions: [Permission.CONFIG_READ],
      enableRateLimit: true,
    });
    
    if (auth instanceof NextResponse) {
      throw new Error('认证失败');
    }

    // 加密状态逻辑...
    return { status: 'active', keyRotation: {} };
  },

  // POST - 执行密钥轮换
  POST: async (request: NextRequest) => {
    const auth = await authenticateApiRoute(request, {
      requiredPermissions: [Permission.CONFIG_WRITE],
      enableRateLimit: true,
    });
    
    if (auth instanceof NextResponse) {
      throw new Error('认证失败');
    }

    const body = await request.json();
    const { keyType, force = false } = body;

    const validKeyTypes = ['config', 'database', 'log'];
    if (!keyType || !validKeyTypes.includes(keyType)) {
      throw new Error(`无效的密钥类型，支持的类型：${validKeyTypes.join(', ')}`);
    }

    // 密钥轮换逻辑...
    return { success: true, keyType };
  },

  // PUT - 验证加密数据完整性
  PUT: async (request: NextRequest) => {
    const auth = await authenticateApiRoute(request, {
      requiredPermissions: [Permission.CONFIG_READ],
      enableRateLimit: true,
    });
    
    if (auth instanceof NextResponse) {
      throw new Error('认证失败');
    }

    // 验证逻辑...
    return { valid: true, errors: [] };
  },
});

export { encryptionGET as GET, encryptionPOST as POST, encryptionPUT as PUT };

// ============================================================================
// 示例3: 重构Webhook API (app/api/webhook/route.ts)
// ============================================================================

export const webhookRoutes = apiRoutes({
  // POST - 处理webhook推送
  POST: async (request: NextRequest) => {
    // Webhook处理逻辑...
    const body = await request.json();
    
    // 验证签名、处理提交等...
    return {
      taskIds: ['task-1', 'task-2'],
      totalCommits: 2,
      enqueuedCommits: 2,
      skippedCommits: 0,
    };
  },

  // GET - 获取webhook配置
  GET: async (request: NextRequest) => {
    return {
      provider: process.env.GIT_PROVIDER ?? 'github',
      targetBranch: process.env.GIT_TARGET_BRANCH ?? 'uat',
      autoEnqueue: process.env.WEBHOOK_AUTO_ENQUEUE !== 'false',
      endpoint: `${request.nextUrl.origin}/api/webhook`,
    };
  },
}, {
  errorMessage: 'Webhook处理失败',
});

export const { GET: webhookGET, POST: webhookPOST } = webhookRoutes;

// ============================================================================
// 示例4: 重构审查详情API (app/api/reviews/[reviewId]/route.ts)
// ============================================================================

export const reviewDetailGET = apiRoute(async (request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) => {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.REVIEW_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }

  const { reviewId } = await params;
  
  // 查询审查记录...
  const review = { id: reviewId, status: 'completed' };
  const comments = [];

  if (!review) {
    throw new Error('审查记录不存在');
  }

  return { review, comments };
});

// ============================================================================
// 对比总结
// ============================================================================

/*
优势：
1. 代码更简洁 - 不需要手动调用handleApiRequest
2. 错误处理统一 - 直接throw Error即可
3. 类型安全 - 更好的TypeScript支持
4. 易于测试 - 纯函数更容易单元测试
5. 一致性 - 所有API都使用相同的模式

使用方法：
1. 单个HTTP方法：使用apiRoute()
2. 多个HTTP方法：使用apiRoutes()
3. 错误处理：直接throw Error或ApiError
4. 认证失败：throw Error而不是return NextResponse

迁移步骤：
1. 将handleApiRequest包装的函数改为apiRoute
2. 将return errorResponse改为throw Error
3. 将return successResponse改为return data
4. 保持认证逻辑不变，但认证失败时throw Error
*/