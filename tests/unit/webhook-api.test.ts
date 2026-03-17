import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, GET } from '@/app/api/webhook/route';
import { NextRequest } from 'next/server';
import { createWebhookListenerFromEnv } from '@/lib/services/webhook-listener';
import { WebhookResponse } from '@/lib/services/webhook-listener';

// Mock 依赖
vi.mock('@/lib/services/webhook-listener', () => ({
  createWebhookListenerFromEnv: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    generateRequestId: vi.fn(() => 'test-request-id'),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
    setContext: vi.fn(),
    clearContext: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    performance: vi.fn(),
  },
}));

describe('Webhook API', () => {
  let mockListener: any;

  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 创建 mock listener
    mockListener = {
      handleWebhook: vi.fn(),
    };

    (createWebhookListenerFromEnv as any).mockReturnValue(mockListener);

    // Mock 环境变量
    process.env.GIT_PROVIDER = 'github';
    process.env.GIT_WEBHOOK_SECRET = 'test-secret';
    process.env.GIT_TARGET_BRANCH = 'uat';
    process.env.WEBHOOK_AUTO_ENQUEUE = 'true';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/webhook', () => {
    it('应该成功处理有效的 webhook 请求', async () => {
      // 准备测试数据
      const webhookPayload = {
        ref: 'refs/heads/uat',
        repository: {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Fix bug',
            author: {
              name: 'Test User',
              email: 'test@example.com',
            },
            timestamp: '2024-01-01T00:00:00Z',
            url: 'https://github.com/test/repo/commit/abc123',
          },
        ],
      };

      const mockResponse: WebhookResponse = {
        success: true,
        message: '成功处理 1 个提交',
        taskIds: ['task-123'],
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      // 创建请求
      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test-signature',
        },
        body: JSON.stringify(webhookPayload),
      });

      // 执行请求
      const response = await POST(request);
      const data = await response.json();

      // 验证响应
      expect(response.status).toBe(202);
      expect(data.code).toBe(0);
      expect(data.msg).toBe(mockResponse.message);
      expect(data.data.taskIds).toEqual(['task-123']);
      expect(data.data.totalCommits).toBe(1);
      expect(data.data.enqueuedCommits).toBe(1);

      // 验证 listener 被调用
      expect(mockListener.handleWebhook).toHaveBeenCalledWith(request);
    });

    it('应该拒绝空的 webhook payload', async () => {
      const mockResponse: WebhookResponse = {
        success: false,
        message: 'Webhook payload 为空',
        code: 'EMPTY_PAYLOAD',
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(1000); // BAD_REQUEST
      expect(data.msg).toContain('Webhook payload 为空');
    });

    it('应该拒绝缺少签名的请求', async () => {
      const mockResponse: WebhookResponse = {
        success: false,
        message: '缺少 webhook 签名',
        code: 'MISSING_SIGNATURE',
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'refs/heads/uat' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe(3003); // INVALID_WEBHOOK_SIGNATURE
      expect(data.msg).toContain('缺少 webhook 签名');
    });

    it('应该拒绝签名验证失败的请求', async () => {
      const mockResponse: WebhookResponse = {
        success: false,
        message: 'Webhook 签名验证失败',
        code: 'INVALID_SIGNATURE',
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=invalid-signature',
        },
        body: JSON.stringify({ ref: 'refs/heads/uat' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe(3003); // INVALID_WEBHOOK_SIGNATURE
    });

    it('应该拒绝无效的 JSON payload', async () => {
      const mockResponse: WebhookResponse = {
        success: false,
        message: 'Webhook payload 解析失败',
        code: 'INVALID_JSON',
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test-signature',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(1000); // BAD_REQUEST
    });

    it('应该处理多个提交', async () => {
      const mockResponse: WebhookResponse = {
        success: true,
        message: '成功处理 3 个提交',
        taskIds: ['task-1', 'task-2', 'task-3'],
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const webhookPayload = {
        ref: 'refs/heads/uat',
        repository: {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
        },
        commits: [
          {
            id: 'commit-1',
            message: 'Commit 1',
            author: { name: 'User', email: 'user@example.com' },
            timestamp: '2024-01-01T00:00:00Z',
            url: 'https://github.com/test/repo/commit/1',
          },
          {
            id: 'commit-2',
            message: 'Commit 2',
            author: { name: 'User', email: 'user@example.com' },
            timestamp: '2024-01-01T00:01:00Z',
            url: 'https://github.com/test/repo/commit/2',
          },
          {
            id: 'commit-3',
            message: 'Commit 3',
            author: { name: 'User', email: 'user@example.com' },
            timestamp: '2024-01-01T00:02:00Z',
            url: 'https://github.com/test/repo/commit/3',
          },
        ],
      };

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test-signature',
        },
        body: JSON.stringify(webhookPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.code).toBe(0);
      expect(data.data.taskIds).toHaveLength(3);
      expect(data.data.totalCommits).toBe(3);
    });

    it('应该处理没有提交的 webhook', async () => {
      const mockResponse: WebhookResponse = {
        success: true,
        message: '没有需要处理的提交',
        taskIds: [],
      };

      mockListener.handleWebhook.mockResolvedValue(mockResponse);

      const webhookPayload = {
        ref: 'refs/heads/main', // 非目标分支
        repository: {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
        },
        commits: [],
      };

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test-signature',
        },
        body: JSON.stringify(webhookPayload),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.code).toBe(0);
      expect(data.data.taskIds).toHaveLength(0);
      expect(data.data.totalCommits).toBe(0);
    });

    it('应该处理内部错误', async () => {
      mockListener.handleWebhook.mockRejectedValue(new Error('Internal error'));

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test-signature',
        },
        body: JSON.stringify({ ref: 'refs/heads/uat' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe(2000); // INTERNAL_ERROR
      expect(data.msg).toContain('Internal error');
    });
  });

  describe('GET /api/webhook', () => {
    it('应该返回 webhook 配置信息', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.code).toBe(0);
      expect(data.data).toHaveProperty('provider', 'github');
      expect(data.data).toHaveProperty('targetBranch', 'uat');
      expect(data.data).toHaveProperty('autoEnqueue', true);
      expect(data.data).toHaveProperty('endpoint');
      expect(data.data).toHaveProperty('supportedProviders');
      expect(data.data).toHaveProperty('requiredHeaders');
    });

    it('应该不包含敏感信息', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.data).not.toHaveProperty('secret');
      expect(data.data).not.toHaveProperty('token');
      expect(data.data).not.toHaveProperty('password');
    });

    it('应该返回正确的端点 URL', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.data.endpoint).toBe('http://localhost:3000/api/webhook');
    });
  });
});
