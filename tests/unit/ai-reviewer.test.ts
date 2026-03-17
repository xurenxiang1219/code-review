import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIReviewer } from '@/lib/services/ai-reviewer';
import { AIClient } from '@/lib/ai/client';
import { PromptBuilder } from '@/lib/ai/prompt-builder';
import type { AnalysisResult } from '@/types/git';
import type { ReviewConfig } from '@/types/review';
import type { AIResponse } from '@/types/ai';

describe('AIReviewer', () => {
  let mockAIClient: AIClient;
  let mockPromptBuilder: PromptBuilder;
  let aiReviewer: AIReviewer;

  const mockAnalysis: AnalysisResult = {
    commit: {
      hash: 'abc123',
      branch: 'uat',
      repository: 'test-repo',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
      message: 'Test commit',
      timestamp: new Date(),
      url: 'https://github.com/test/repo/commit/abc123',
    },
    diff: {
      commitHash: 'abc123',
      files: [],
      totalAdditions: 10,
      totalDeletions: 5,
      totalFiles: 1,
    },
    batches: [],
    codeFiles: [
      {
        path: 'test.ts',
        type: 'modified',
        language: 'typescript',
        additions: 10,
        deletions: 5,
        patch: '@@ -1,5 +1,10 @@\n+console.log("test");',
      },
    ],
    nonCodeFiles: [],
  };

  const mockConfig: ReviewConfig = {
    id: 'config-1',
    repository: 'test-repo',
    reviewFocus: ['security', 'performance'],
    fileWhitelist: ['*.ts'],
    ignorePatterns: ['node_modules/**'],
    aiModel: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
    },
    polling: {
      enabled: false,
      interval: 300,
    },
    notification: {
      email: {
        enabled: false,
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'test@example.com',
          password: 'password',
        },
        from: 'noreply@example.com',
        templates: {
          subject: 'Code Review',
          body: 'Review completed',
        },
        criticalOnly: false,
      },
      im: {
        enabled: false,
        webhook: 'https://example.com/webhook',
      },
      gitComment: {
        enabled: true,
        summaryOnly: false,
        includePositiveFeedback: true,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // 创建 mock 实例
    mockAIClient = {
      complete: vi.fn(),
      healthCheck: vi.fn(),
      getConfig: vi.fn(),
    } as any;

    mockPromptBuilder = {
      buildReviewPrompt: vi.fn(),
      validatePromptLength: vi.fn(),
      truncatePrompt: vi.fn(),
    } as any;

    aiReviewer = new AIReviewer(mockAIClient, mockPromptBuilder);
  });

  describe('review', () => {
    it('应该成功完成代码审查', async () => {
      // 准备 mock 数据
      const mockPrompt = {
        system: 'You are a code reviewer',
        user: 'Review this code',
      };

      const mockAIResponse: AIResponse = {
        content: JSON.stringify({
          comments: [
            {
              filePath: 'test.ts',
              lineNumber: 1,
              severity: 'minor',
              category: 'style',
              message: 'Consider using const instead of let',
              suggestion: 'Use const for immutable variables',
              confidence: 0.9,
            },
          ],
          summary: {
            overallAssessment: 'Code looks good',
            keyIssues: [],
            positiveAspects: ['Clean code'],
            recommendations: ['Keep up the good work'],
          },
          metadata: {
            reviewTime: 1000,
            tokensUsed: 500,
            model: 'gpt-4',
          },
        }),
        model: 'gpt-4',
        usage: {
          promptTokens: 100,
          completionTokens: 400,
          totalTokens: 500,
        },
      };

      // 设置 mock 行为
      vi.mocked(mockPromptBuilder.buildReviewPrompt).mockReturnValue(mockPrompt);
      vi.mocked(mockPromptBuilder.validatePromptLength).mockReturnValue(true);
      vi.mocked(mockAIClient.complete).mockResolvedValue(mockAIResponse);

      // 执行审查
      const result = await aiReviewer.review(mockAnalysis, mockConfig);

      // 验证结果
      expect(result).toBeDefined();
      expect(result.commitHash).toBe('abc123');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].severity).toBe('minor');
      expect(result.summary.total).toBe(1);
      expect(result.summary.minor).toBe(1);
      expect(result.status).toBe('completed');

      // 验证调用
      expect(mockPromptBuilder.buildReviewPrompt).toHaveBeenCalledWith(
        mockAnalysis,
        mockConfig
      );
      expect(mockAIClient.complete).toHaveBeenCalled();
    });

    it('应该处理 AI 响应解析失败的情况', async () => {
      const mockPrompt = {
        system: 'You are a code reviewer',
        user: 'Review this code',
      };

      const mockAIResponse: AIResponse = {
        content: 'Invalid JSON response',
        model: 'gpt-4',
      };

      vi.mocked(mockPromptBuilder.buildReviewPrompt).mockReturnValue(mockPrompt);
      vi.mocked(mockPromptBuilder.validatePromptLength).mockReturnValue(true);
      vi.mocked(mockAIClient.complete).mockResolvedValue(mockAIResponse);

      const result = await aiReviewer.review(mockAnalysis, mockConfig);

      // 应该使用备用解析
      expect(result).toBeDefined();
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].message).toContain('无法解析');
    });
  });

  describe('buildPrompt', () => {
    it('应该成功构建提示词', () => {
      const mockPrompt = {
        system: 'You are a code reviewer',
        user: 'Review this code',
      };

      vi.mocked(mockPromptBuilder.buildReviewPrompt).mockReturnValue(mockPrompt);
      vi.mocked(mockPromptBuilder.validatePromptLength).mockReturnValue(true);

      const result = aiReviewer.buildPrompt(mockAnalysis, mockConfig);

      expect(result).toEqual(mockPrompt);
      expect(mockPromptBuilder.buildReviewPrompt).toHaveBeenCalledWith(
        mockAnalysis,
        mockConfig
      );
    });

    it('应该在提示词过长时进行截断', () => {
      const mockPrompt = {
        system: 'You are a code reviewer',
        user: 'Very long prompt...',
      };

      const truncatedPrompt = 'Truncated prompt';

      vi.mocked(mockPromptBuilder.buildReviewPrompt).mockReturnValue(mockPrompt);
      vi.mocked(mockPromptBuilder.validatePromptLength).mockReturnValue(false);
      vi.mocked(mockPromptBuilder.truncatePrompt).mockReturnValue(truncatedPrompt);

      const result = aiReviewer.buildPrompt(mockAnalysis, mockConfig);

      expect(result.user).toBe(truncatedPrompt);
      expect(mockPromptBuilder.truncatePrompt).toHaveBeenCalled();
    });
  });

  describe('parseResponse', () => {
    it('应该成功解析有效的 JSON 响应', () => {
      const validResponse = JSON.stringify({
        comments: [
          {
            filePath: 'test.ts',
            lineNumber: 1,
            severity: 'minor',
            category: 'style',
            message: 'Test message',
            confidence: 0.9,
          },
        ],
        summary: {
          overallAssessment: 'Good',
          keyIssues: [],
          positiveAspects: [],
          recommendations: [],
        },
        metadata: {
          reviewTime: 1000,
          tokensUsed: 500,
          model: 'gpt-4',
        },
      });

      const result = aiReviewer.parseResponse(validResponse);

      expect(result).toBeDefined();
      expect(result.comments).toHaveLength(1);
      expect(result.summary).toBeDefined();
    });

    it('应该处理无效的 JSON 响应', () => {
      const invalidResponse = 'This is not JSON';

      const result = aiReviewer.parseResponse(invalidResponse);

      // 应该返回备用解析结果
      expect(result).toBeDefined();
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].message).toContain('无法解析');
    });
  });

  describe('healthCheck', () => {
    it('应该返回健康状态', async () => {
      vi.mocked(mockAIClient.healthCheck).mockResolvedValue(true);

      const result = await aiReviewer.healthCheck();

      expect(result).toBe(true);
      expect(mockAIClient.healthCheck).toHaveBeenCalled();
    });

    it('应该处理健康检查失败', async () => {
      vi.mocked(mockAIClient.healthCheck).mockRejectedValue(
        new Error('Health check failed')
      );

      const result = await aiReviewer.healthCheck();

      expect(result).toBe(false);
    });
  });
});
