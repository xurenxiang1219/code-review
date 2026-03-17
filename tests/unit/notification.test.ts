import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService, NotificationError } from '@/lib/services/notification';
import type { ReviewResult, ReviewSummary } from '@/types/review';
import type { CommitInfo } from '@/types/git';
import type { NotificationConfig } from '@/lib/db/repositories/config';

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockConfig: NotificationConfig;
  let mockReview: ReviewResult;
  let mockCommit: CommitInfo;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      email: {
        enabled: true,
        recipients: ['dev@example.com'],
        criticalOnly: false,
      },
      im: {
        enabled: true,
        webhook: 'https://hooks.slack.com/test',
        channels: ['#dev'],
      },
      gitComment: {
        enabled: true,
        summaryOnly: false,
      },
    };

    mockReview = {
      id: 'review-123',
      commitHash: 'abc123',
      comments: [
        {
          id: 'comment-1',
          file: 'src/test.ts',
          line: 10,
          severity: 'major',
          category: 'security',
          message: '潜在的安全问题',
          suggestion: '添加输入验证',
        },
      ],
      summary: {
        total: 1,
        critical: 0,
        major: 1,
        minor: 0,
        suggestion: 0,
      },
      processingTimeMs: 1000,
      status: 'completed',
    };

    mockCommit = {
      hash: 'abc123def456',
      branch: 'uat',
      repository: 'test-repo',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
      message: 'Fix bug',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      url: 'https://github.com/test/repo/commit/abc123',
    };

    notificationService = new NotificationService(mockConfig);
  });

  describe('sendReviewNotification', () => {
    it('应该成功发送通知', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await notificationService.sendReviewNotification(
        mockReview,
        mockCommit,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(result.imSent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该在 criticalOnly 模式下跳过非严重问题通知', async () => {
      const criticalOnlyConfig = {
        ...mockConfig,
        email: {
          ...mockConfig.email,
          criticalOnly: true,
        },
      };

      const result = await notificationService.sendReviewNotification(
        mockReview,
        mockCommit,
        criticalOnlyConfig
      );

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(result.imSent).toBe(false);
    });

    it('应该为严重问题发送额外告警', async () => {
      const criticalReview: ReviewResult = {
        ...mockReview,
        comments: [
          {
            id: 'comment-1',
            file: 'src/test.ts',
            line: 10,
            severity: 'critical',
            category: 'security',
            message: '严重的安全漏洞',
            suggestion: '立即修复',
          },
        ],
        summary: {
          total: 1,
          critical: 1,
          major: 0,
          minor: 0,
          suggestion: 0,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await notificationService.sendReviewNotification(
        criticalReview,
        mockCommit,
        mockConfig
      );

      expect(result.success).toBe(true);
    });

    it('应该处理 IM webhook 失败但邮件成功', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await notificationService.sendReviewNotification(
        mockReview,
        mockCommit,
        mockConfig
      );

      // 邮件发送成功（模拟），所以整体成功
      expect(result.success).toBe(true);
      expect(result.imSent).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('即时消息发送失败');
    });

    it('应该在禁用通知时返回成功', async () => {
      const disabledConfig: NotificationConfig = {
        email: {
          enabled: false,
          recipients: [],
          criticalOnly: false,
        },
        im: {
          enabled: false,
          webhook: '',
          channels: [],
        },
        gitComment: {
          enabled: true,
          summaryOnly: false,
        },
      };

      const result = await notificationService.sendReviewNotification(
        mockReview,
        mockCommit,
        disabledConfig
      );

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(result.imSent).toBe(false);
    });
  });

  describe('健康检查', () => {
    it('应该返回健康状态', async () => {
      const isHealthy = await notificationService.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });
});
