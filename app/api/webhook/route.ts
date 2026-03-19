import { NextRequest } from 'next/server';
import { createWebhookListenerFromEnv } from '@/lib/services/webhook-listener';
import { apiRoute } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';
import { createWebhookRateLimiter, createRateLimitMiddleware } from '@/lib/utils/rate-limit-enhanced';
import { createWebhookConcurrencyController } from '@/lib/utils/concurrency-control';
import { v4 as uuidv4 } from 'uuid';

// 创建速率限制器和并发控制器
const webhookRateLimiter = createWebhookRateLimiter();
const rateLimitMiddleware = createRateLimitMiddleware(webhookRateLimiter);
const concurrencyController = createWebhookConcurrencyController();

/**
 * Webhook API 端点
 * 
 * 接收来自 Git 仓库的 webhook 推送事件，验证签名后将提交加入审查队列
 * 
 * 支持的 Git 平台：
 * - GitHub
 * - GitLab
 * - 通用 webhook
 * 
 * 环境变量配置：
 * - GIT_PROVIDER: Git 平台类型 (github/gitlab/generic)
 * - GIT_WEBHOOK_SECRET: Webhook 密钥
 * - GIT_TARGET_BRANCH: 目标分支 (默认: uat)
 * - WEBHOOK_AUTO_ENQUEUE: 是否自动加入队列 (默认: true)
 */

/**
 * POST /api/webhook
 * 
 * 处理 webhook 推送事件
 */
export const POST = apiRoute(async (request: NextRequest) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  const reqLogger = logger.child({ 
    requestId, 
    endpoint: '/api/webhook',
    method: 'POST' 
  });

  reqLogger.info('Webhook 请求接收');

  // 获取客户端IP用于速率限制
  const clientIp = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() 
    ?? request?.headers?.get('x-real-ip') 
    ?? 'unknown';

  // 应用速率限制
  const rateLimitResult = await rateLimitMiddleware(request, clientIp);
  
  if (!rateLimitResult.allowed) {
    reqLogger.warn('Webhook请求被速率限制', {
      clientIp,
      error: rateLimitResult.error,
    });
    
    throw new Error(rateLimitResult.error ?? 'Webhook请求频率超限');
  }

  // 应用并发控制
  const concurrencyResult = await concurrencyController.acquire(requestId);
  
  if (!concurrencyResult.acquired) {
    // 等待获取权限
    const acquired = await concurrencyController.waitForAcquisition(requestId, 30000);
    
    if (!acquired) {
      reqLogger.warn('Webhook并发控制超时', {
        clientIp,
        currentConcurrency: concurrencyResult.currentConcurrency,
        queueLength: concurrencyResult.queueLength,
      });
      
      throw new Error('系统繁忙，请稍后重试');
    }
  }

  try {
    // 创建 Webhook Listener 实例
    const listener = createWebhookListenerFromEnv();

    // 处理 webhook 请求
    const result = await listener.handleWebhook(request);

    // 检查处理结果
    if (!result.success) {
      throw new Error(result.message ?? '处理 webhook 请求失败');
    }

    // 构建响应数据
    const responseData = {
      taskIds: result?.taskIds ?? [],
      totalCommits: result?.taskIds?.length ?? 0,
      enqueuedCommits: result?.taskIds?.length ?? 0,
      skippedCommits: 0,
    };

    const duration = Date.now() - startTime;
    reqLogger.info('Webhook 处理成功', {
      taskIds: responseData.taskIds,
      totalCommits: responseData.totalCommits,
      duration,
    });

    return responseData;

  } finally {
    // 释放并发控制权限
    await concurrencyController.release(requestId);
  }
});

/**
 * GET /api/webhook
 * 
 * 返回 webhook 配置信息（用于调试和验证）
 */
export const GET = apiRoute(async (request: NextRequest) => {
  const requestId = uuidv4();
  const reqLogger = logger.child({ 
    requestId, 
    endpoint: '/api/webhook',
    method: 'GET' 
  });

  reqLogger.info('Webhook 配置查询');

  // 返回 webhook 配置信息（不包含敏感信息）
  const config = {
    provider: process.env.GIT_PROVIDER ?? 'github',
    targetBranch: process.env.GIT_TARGET_BRANCH ?? 'uat',
    autoEnqueue: process.env.WEBHOOK_AUTO_ENQUEUE !== 'false',
    endpoint: `${request?.nextUrl?.origin}/api/webhook`,
    supportedProviders: ['github', 'gitlab', 'generic'],
    requiredHeaders: {
      github: 'X-Hub-Signature-256 或 X-Hub-Signature',
      gitlab: 'X-Gitlab-Token',
      generic: 'X-Webhook-Signature 或 X-Signature',
    },
  };

  reqLogger.info('Webhook 配置返回', { provider: config.provider });

  return config;
});

/**
 * OPTIONS /api/webhook
 * 
 * 处理 CORS 预检请求
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256, X-Hub-Signature, X-Gitlab-Token, X-Webhook-Signature, X-Signature',
      'Access-Control-Max-Age': '86400',
    },
  });
}
