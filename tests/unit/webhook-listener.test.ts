import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { WebhookListener, createWebhookListener } from '@/lib/services/webhook-listener';
import { WebhookPayload } from '@/types/git';
import * as crypto from 'crypto';

// Mock dependencies
vi.mock('@/lib/utils/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
    performance: vi.fn(),
  };

  return {
    logger: {
      ...mockLogger,
      child: vi.fn(() => mockLogger),
      generateRequestId: vi.fn(() => 'test-request-id'),
    },
  };
});

vi.mock('@/lib/queue/review-queue', () => ({
  reviewQueue: {
    enqueue: vi.fn(async (commit) => `task-${commit.hash}`),
  },
}));

vi.mock('@/lib/db/repositories/commit-tracker', () => ({
  commitTrackerRepository: {
    isTracked: vi.fn(async () => false),
  },
}));

describe('WebhookListener', () => {
  const testSecret = 'test-webhook-secret';
  const targetBranch = 'uat';

  /**
   * 生成 GitHub 签名
   */
  function generateGitHubSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * 创建测试用的 webhook payload
   */
  function createTestPayload(branch: string = 'uat'): WebhookPayload {
    return {
      ref: `refs/heads/${branch}`,
      repository: {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        defaultBranch: 'main',
      },
      commits: [
        {
          id: 'abc123def456',
          message: 'Fix bug in authentication',
          author: {
            name: 'Test User',
            email: 'test@example.com',
          },
          timestamp: '2024-01-01T00:00:00Z',
          url: 'https://github.com/test/repo/commit/abc123def456',
          added: ['src/auth.ts'],
          modified: ['src/utils.ts'],
          removed: [],
        },
        {
          id: 'def456ghi789',
          message: 'Add new feature',
          author: {
            name: 'Another User',
            email: 'another@example.com',
          },
          timestamp: '2024-01-01T01:00:00Z',
          url: 'https://github.com/test/repo/commit/def456ghi789',
          added: ['src/feature.ts'],
          modified: [],
          removed: [],
        },
      ],
    };
  }

  /**
   * 创建测试用的 NextRequest
   */
  function createTestRequest(payload: WebhookPayload, signature: string): NextRequest {
    const body = JSON.stringify(payload);
    const headers = new Headers({
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    });

    // 创建一个 ReadableStream 来模拟请求体
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });

    return new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleWebhook', () => {
    it('应该成功处理有效的 webhook 请求', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      const body = JSON.stringify(payload);
      const signature = generateGitHubSignature(body, testSecret);
      
      const encoder = new TextEncoder();
      const bodyBytes = encoder.encode(body);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bodyBytes);
          controller.close();
        },
      });

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        }),
        body: stream,
        duplex: 'half',
      } as any);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(true);
      expect(response.taskIds).toHaveLength(2);
      expect(response.taskIds).toEqual(['task-abc123def456', 'task-def456ghi789']);
    });

    it('应该拒绝空的 payload', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(''));
          controller.close();
        },
      });

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid',
        }),
        body: stream,
        duplex: 'half',
      } as any);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(false);
      expect(response.code).toBe('EMPTY_PAYLOAD');
      expect(response.message).toContain('为空');
    });

    it('应该拒绝缺少签名的请求', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      const body = JSON.stringify(payload);
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      });

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
        }),
        body: stream,
        duplex: 'half',
      } as any);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(false);
      expect(response.code).toBe('MISSING_SIGNATURE');
    });

    it('应该拒绝签名无效的请求', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      const body = JSON.stringify(payload);
      const request = createTestRequest(payload, 'sha256=invalid-signature');

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(false);
      expect(response.code).toBe('INVALID_SIGNATURE');
    });

    it('应该拒绝无效的 JSON payload', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const invalidBody = 'not a json';
      const signature = generateGitHubSignature(invalidBody, testSecret);
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(invalidBody));
          controller.close();
        },
      });

      const request = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        }),
        body: stream,
        duplex: 'half',
      } as any);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(false);
      expect(response.code).toBe('INVALID_JSON');
    });

    it('应该跳过非目标分支的提交', async () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload('main'); // 不是 uat 分支
      const body = JSON.stringify(payload);
      const signature = generateGitHubSignature(body, testSecret);
      const request = createTestRequest(payload, signature);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(true);
      expect(response.taskIds).toHaveLength(0);
      expect(response.message).toContain('没有需要处理的提交');
    });

    it('应该跳过已处理的提交', async () => {
      const { commitTrackerRepository } = await import('@/lib/db/repositories/commit-tracker');
      vi.mocked(commitTrackerRepository.isTracked).mockResolvedValueOnce(true);

      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      const body = JSON.stringify(payload);
      const signature = generateGitHubSignature(body, testSecret);
      const request = createTestRequest(payload, signature);

      const response = await listener.handleWebhook(request);

      expect(response.success).toBe(true);
      expect(response.taskIds).toHaveLength(1); // 只有一个未处理的提交
    });
  });

  describe('verifySignature', () => {
    it('应该验证有效的 GitHub 签名', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = 'test payload';
      const signature = generateGitHubSignature(payload, testSecret);

      const result = listener.verifySignature(payload, signature);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝无效的 GitHub 签名', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = 'test payload';
      const signature = 'sha256=invalid';

      const result = listener.verifySignature(payload, signature);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该验证有效的 GitLab token', () => {
      const listener = createWebhookListener('gitlab', testSecret, targetBranch);
      const payload = 'test payload';

      const result = listener.verifySignature(payload, testSecret);

      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的 GitLab token', () => {
      const listener = createWebhookListener('gitlab', testSecret, targetBranch);
      const payload = 'test payload';

      const result = listener.verifySignature(payload, 'wrong-token');

      expect(result.valid).toBe(false);
    });
  });

  describe('extractCommits', () => {
    it('应该从 payload 中提取提交信息', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();

      const commits = listener.extractCommits(payload);

      expect(commits).toHaveLength(2);
      expect(commits[0]).toMatchObject({
        hash: 'abc123def456',
        branch: 'uat',
        repository: 'https://github.com/test/repo',
        author: {
          name: 'Test User',
          email: 'test@example.com',
        },
        message: 'Fix bug in authentication',
      });
    });

    it('应该过滤非目标分支的提交', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload('main');

      const commits = listener.extractCommits(payload);

      expect(commits).toHaveLength(0);
    });

    it('应该处理空的 commits 数组', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      payload.commits = [];

      const commits = listener.extractCommits(payload);

      expect(commits).toHaveLength(0);
    });

    it('应该处理缺少 commits 字段的 payload', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      const payload = createTestPayload();
      // @ts-ignore - 测试边界情况
      delete payload.commits;

      const commits = listener.extractCommits(payload);

      expect(commits).toHaveLength(0);
    });

    it('应该正确解析不同格式的 ref', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      
      // GitHub/GitLab 格式
      const payload1 = createTestPayload();
      payload1.ref = 'refs/heads/uat';
      expect(listener.extractCommits(payload1)).toHaveLength(2);

      // 简单格式
      const payload2 = createTestPayload();
      payload2.ref = 'uat';
      expect(listener.extractCommits(payload2)).toHaveLength(2);
    });
  });

  describe('createWebhookListener', () => {
    it('应该创建 GitHub webhook listener', () => {
      const listener = createWebhookListener('github', testSecret, targetBranch);
      expect(listener).toBeInstanceOf(WebhookListener);
    });

    it('应该创建 GitLab webhook listener', () => {
      const listener = createWebhookListener('gitlab', testSecret, targetBranch);
      expect(listener).toBeInstanceOf(WebhookListener);
    });

    it('应该使用默认配置', () => {
      const listener = createWebhookListener('github', testSecret);
      expect(listener).toBeInstanceOf(WebhookListener);
    });
  });
});
