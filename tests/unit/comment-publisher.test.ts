import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommentPublisher, CommentPublisherError } from '@/lib/services/comment-publisher';
import { GitClient } from '@/lib/git/client';
import type { ReviewResult, ReviewComment, ReviewSummary } from '@/types/review';
import type { CommitInfo, CommentPublishResult } from '@/types/git';

// Mock GitClient
vi.mock('@/lib/git/client');

// Mock logger - 必须在顶层定义
vi.mock('@/lib/utils/logger', () => {
  const mockLoggerInstance = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  
  return {
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLoggerInstance),
    },
  };
});

describe('CommentPublisher', () => {
  let commentPublisher: CommentPublisher;
  let mockGitClient: GitClient;
  let mockCommit: CommitInfo;
  let mockReview: ReviewResult;

  beforeEach(() => {
    // 创建 mock Git 客户端
    mockGitClient = {
      postComment: vi.fn(),
      postSummaryComment: vi.fn(),
    } as any;

    // 创建测试数据
    mockCommit = {
      hash: 'abc123def456',
      branch: 'uat',
      repository: 'owner/repo',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
      message: 'Fix bug in authentication',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      url: 'https://github.com/owner/repo/commit/abc123',
    };

    mockReview = {
      id: 'review-123',
      commitHash: 'abc123def456',
      comments: [
        {
          id: 'comment-1',
          file: 'src/auth.ts',
          line: 42,
          severity: 'critical',
          category: 'security',
          message: 'Potential SQL injection vulnerability',
          suggestion: 'Use parameterized queries',
        },
        {
          id: 'comment-2',
          file: 'src/utils.ts',
          line: 15,
          severity: 'minor',
          category: 'style',
          message: 'Consider using const instead of let',
        },
      ],
      summary: {
        total: 2,
        critical: 1,
        major: 0,
        minor: 1,
        suggestion: 0,
      },
      processingTimeMs: 1500,
      status: 'completed',
    };

    // 创建 CommentPublisher 实例
    commentPublisher = new CommentPublisher(mockGitClient, {
      enabled: false,
      recipients: [],
    });
  });

  describe('publishLineComment', () => {
    it('应该成功发布单条行内评论', async () => {
      const comment: ReviewComment = mockReview.comments[0];
      const expectedResult: CommentPublishResult = {
        success: true,
        commentId: 'git-comment-123',
        retryable: false,
      };

      vi.mocked(mockGitClient.postComment).mockResolvedValue(expectedResult);

      const result = await commentPublisher.publishLineComment(comment, mockCommit);

      expect(result.success).toBe(true);
      expect(result.commentId).toBe('git-comment-123');
      expect(mockGitClient.postComment).toHaveBeenCalledWith(
        mockCommit.hash,
        mockCommit.repository,
        comment
      );
    });

    it('应该在发布失败时重试', async () => {
      const comment: ReviewComment = mockReview.comments[0];
      
      // 第一次失败，第二次成功
      vi.mocked(mockGitClient.postComment)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          commentId: 'git-comment-123',
          retryable: true,
        });

      const result = await commentPublisher.publishLineComment(comment, mockCommit);

      expect(result.success).toBe(true);
      expect(mockGitClient.postComment).toHaveBeenCalledTimes(2);
    });

    it('应该在遇到不可重试错误时立即失败', async () => {
      const comment: ReviewComment = mockReview.comments[0];
      
      vi.mocked(mockGitClient.postComment)
        .mockRejectedValue(new Error('Unauthorized'));

      await expect(
        commentPublisher.publishLineComment(comment, mockCommit)
      ).rejects.toThrow();

      // 不应该重试
      expect(mockGitClient.postComment).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishSummary', () => {
    it('应该成功发布摘要评论', async () => {
      const summary: ReviewSummary = mockReview.summary;
      const expectedResult: CommentPublishResult = {
        success: true,
        commentId: 'summary-comment-123',
        retryable: false,
      };

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue(expectedResult);

      const result = await commentPublisher.publishSummary(summary, mockCommit);

      expect(result.success).toBe(true);
      expect(result.commentId).toBe('summary-comment-123');
      expect(mockGitClient.postSummaryComment).toHaveBeenCalledWith(
        mockCommit.hash,
        mockCommit.repository,
        expect.stringContaining('AI 代码审查报告')
      );
    });

    it('摘要应该包含正确的统计信息', async () => {
      const summary: ReviewSummary = {
        total: 5,
        critical: 2,
        major: 1,
        minor: 1,
        suggestion: 1,
      };

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      await commentPublisher.publishSummary(summary, mockCommit);

      const summaryCall = vi.mocked(mockGitClient.postSummaryComment).mock.calls[0];
      const summaryText = summaryCall[2];

      expect(summaryText).toContain('总计:** 5 个问题');
      expect(summaryText).toContain('严重 (Critical):** 2');
      expect(summaryText).toContain('重要 (Major):** 1');
      expect(summaryText).toContain('次要 (Minor):** 1');
      expect(summaryText).toContain('建议 (Suggestion):** 1');
    });

    it('当没有问题时应该显示正面反馈', async () => {
      const summary: ReviewSummary = {
        total: 0,
        critical: 0,
        major: 0,
        minor: 0,
        suggestion: 0,
      };

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      await commentPublisher.publishSummary(summary, mockCommit);

      const summaryCall = vi.mocked(mockGitClient.postSummaryComment).mock.calls[0];
      const summaryText = summaryCall[2];

      expect(summaryText).toContain('未发现明显问题');
      expect(summaryText).toContain('代码质量良好');
    });
  });

  describe('publish', () => {
    it('应该成功发布所有评论和摘要', async () => {
      vi.mocked(mockGitClient.postComment).mockResolvedValue({
        success: true,
        commentId: 'comment-123',
        retryable: false,
      });

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      const result = await commentPublisher.publish(mockReview, mockCommit);

      expect(result.success).toBe(true);
      expect(result.publishedComments).toBe(2);
      expect(result.failedComments).toBe(0);
      expect(result.summaryPublished).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(mockGitClient.postComment).toHaveBeenCalledTimes(2);
      expect(mockGitClient.postSummaryComment).toHaveBeenCalledTimes(1);
    });

    it('应该处理部分评论发布失败的情况', async () => {
      // 第一条评论成功，第二条失败
      vi.mocked(mockGitClient.postComment)
        .mockResolvedValueOnce({
          success: true,
          commentId: 'comment-1',
          retryable: false,
        })
        .mockRejectedValueOnce(new Error('Failed to publish'));

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      const result = await commentPublisher.publish(mockReview, mockCommit);

      expect(result.success).toBe(true);
      expect(result.publishedComments).toBe(1);
      expect(result.failedComments).toBe(1);
      expect(result.summaryPublished).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该在没有评论时只发布摘要', async () => {
      const reviewWithoutComments: ReviewResult = {
        ...mockReview,
        comments: [],
        summary: {
          total: 0,
          critical: 0,
          major: 0,
          minor: 0,
          suggestion: 0,
        },
      };

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      const result = await commentPublisher.publish(reviewWithoutComments, mockCommit);

      expect(result.success).toBe(true);
      expect(result.publishedComments).toBe(0);
      expect(result.summaryPublished).toBe(true);
      expect(mockGitClient.postComment).not.toHaveBeenCalled();
      expect(mockGitClient.postSummaryComment).toHaveBeenCalledTimes(1);
    });

    it('应该在发布失败时使用邮件备用方案', async () => {
      // 创建启用邮件的 publisher
      const publisherWithEmail = new CommentPublisher(mockGitClient, {
        enabled: true,
        recipients: ['admin@example.com'],
      });

      // Mock 发送邮件方法
      const sendEmailSpy = vi.spyOn(publisherWithEmail as any, 'sendEmail')
        .mockResolvedValue(undefined);

      // 所有发布都失败
      vi.mocked(mockGitClient.postComment).mockRejectedValue(
        new Error('Git API unavailable')
      );
      vi.mocked(mockGitClient.postSummaryComment).mockRejectedValue(
        new Error('Git API unavailable')
      );

      const result = await publisherWithEmail.publish(mockReview, mockCommit);

      expect(result.fallbackUsed).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('应该返回健康状态', async () => {
      const isHealthy = await commentPublisher.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理空评论列表', async () => {
      const emptyReview: ReviewResult = {
        ...mockReview,
        comments: [],
        summary: {
          total: 0,
          critical: 0,
          major: 0,
          minor: 0,
          suggestion: 0,
        },
      };

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      const result = await commentPublisher.publish(emptyReview, mockCommit);

      expect(result.success).toBe(true);
      expect(result.publishedComments).toBe(0);
    });

    it('应该处理大量评论', async () => {
      // 创建 100 条评论
      const manyComments: ReviewComment[] = Array.from({ length: 100 }, (_, i) => ({
        id: `comment-${i}`,
        file: `src/file${i}.ts`,
        line: i + 1,
        severity: 'minor' as const,
        category: 'style',
        message: `Issue ${i}`,
      }));

      const largeReview: ReviewResult = {
        ...mockReview,
        comments: manyComments,
        summary: {
          total: 100,
          critical: 0,
          major: 0,
          minor: 100,
          suggestion: 0,
        },
      };

      vi.mocked(mockGitClient.postComment).mockResolvedValue({
        success: true,
        commentId: 'comment-123',
        retryable: false,
      });

      vi.mocked(mockGitClient.postSummaryComment).mockResolvedValue({
        success: true,
        commentId: 'summary-123',
        retryable: false,
      });

      const result = await commentPublisher.publish(largeReview, mockCommit);

      expect(result.success).toBe(true);
      expect(result.publishedComments).toBe(100);
      expect(mockGitClient.postComment).toHaveBeenCalledTimes(100);
    });

    it('应该处理特殊字符和长文本', async () => {
      const specialComment: ReviewComment = {
        id: 'comment-special',
        file: 'src/特殊文件.ts',
        line: 1,
        severity: 'major',
        category: 'security',
        message: '包含特殊字符: <>&"\'`\n换行符\t制表符',
        suggestion: '很长的建议'.repeat(100),
      };

      vi.mocked(mockGitClient.postComment).mockResolvedValue({
        success: true,
        commentId: 'comment-123',
        retryable: false,
      });

      const result = await commentPublisher.publishLineComment(specialComment, mockCommit);

      expect(result.success).toBe(true);
      expect(mockGitClient.postComment).toHaveBeenCalledWith(
        mockCommit.hash,
        mockCommit.repository,
        specialComment
      );
    });
  });
});
