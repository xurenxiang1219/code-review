import { logger } from '@/lib/utils/logger';
import { AIClient, AIClientError, createDefaultAIClient } from '@/lib/ai/client';
import { PromptBuilder, createPromptBuilder } from '@/lib/ai/prompt-builder';
import type { AnalysisResult } from '@/types/git';
import type { ReviewConfig, ReviewResult, ReviewComment, ReviewSummary } from '@/types/review';
import type { AIReviewResponse } from '@/types/ai';
import { v4 as uuidv4 } from 'uuid';

/**
 * AI 审查器错误类
 */
export class AIReviewerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'AIReviewerError';
  }
}

/**
 * AI 审查器服务
 */
export class AIReviewer {
  private readonly aiClient: AIClient;
  private readonly promptBuilder: PromptBuilder;
  private readonly logger = logger.child({ service: 'AIReviewer' });

  constructor(aiClient?: AIClient, promptBuilder?: PromptBuilder) {
    this.aiClient = aiClient || createDefaultAIClient();
    this.promptBuilder = promptBuilder || createPromptBuilder();
    
    this.logger.info('AI Reviewer initialized');
  }

  /**
   * 审查代码变更
   */
  async review(
    analysis: AnalysisResult,
    config: ReviewConfig
  ): Promise<ReviewResult> {
    const startTime = Date.now();
    const reviewId = uuidv4();

    this.logger.info('Starting code review', {
      reviewId,
      commitHash: analysis.commit.hash,
      filesCount: analysis.codeFiles.length,
      linesAdded: analysis.diff.totalAdditions,
      linesDeleted: analysis.diff.totalDeletions,
    });

    try {
      // 构建提示词
      const prompt = this.buildPrompt(analysis, config);
      
      this.logger.debug('Prompt built', {
        reviewId,
        systemPromptLength: prompt.system.length,
        userPromptLength: prompt.user.length,
      });

      // 调用 AI 模型
      const aiResponse = await this.aiClient.complete({
        prompt: prompt.user,
        context: prompt.system,
        codeLanguage: this.detectPrimaryLanguage(analysis),
        maxTokens: config.aiModel.maxTokens,
        temperature: config.aiModel.temperature,
      });

      this.logger.debug('AI response received', {
        reviewId,
        contentLength: aiResponse.content.length,
        tokensUsed: aiResponse.usage?.totalTokens,
      });

      // 解析 AI 响应
      const parsedResponse = this.parseResponse(aiResponse.content);
      
      // 转换为标准审查结果
      const reviewResult = this.convertToReviewResult(
        reviewId,
        analysis.commit.hash,
        parsedResponse,
        Date.now() - startTime
      );

      this.logger.info('Code review completed', {
        reviewId,
        commitHash: analysis.commit.hash,
        totalIssues: reviewResult.summary.total,
        criticalCount: reviewResult.summary.critical,
        processingTime: reviewResult.processingTimeMs,
      });

      return reviewResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Code review failed', {
        reviewId,
        commitHash: analysis.commit.hash,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      if (error instanceof AIClientError) {
        throw new AIReviewerError(
          `AI 审查失败: ${error.message}`,
          error.code,
          error.retryable
        );
      }

      throw new AIReviewerError(
        'AI 审查过程中发生未知错误',
        'UNKNOWN_ERROR',
        false
      );
    }
  }

  /**
   * 构建审查提示词
   */
  buildPrompt(
    analysis: AnalysisResult,
    config: ReviewConfig
  ): { system: string; user: string } {
    try {
      const prompt = this.promptBuilder.buildReviewPrompt(analysis, config);
      
      // 验证提示词长度
      const maxTokens = config.aiModel.maxTokens || 4000;
      const totalPrompt = prompt.system + prompt.user;
      
      if (!this.promptBuilder.validatePromptLength(totalPrompt, maxTokens * 0.6)) {
        this.logger.warn('Prompt too long, truncating', {
          originalLength: totalPrompt.length,
          maxTokens,
        });
        
        prompt.user = this.promptBuilder.truncatePrompt(prompt.user, maxTokens * 0.5);
      }

      return prompt;
    } catch (error) {
      this.logger.error('Failed to build prompt', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new AIReviewerError(
        '构建审查提示词失败',
        'PROMPT_BUILD_ERROR',
        false
      );
    }
  }

  /**
   * 解析 AI 响应
   */
  parseResponse(response: string): AIReviewResponse {
    try {
      // 尝试提取 JSON 内容
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        this.logger.warn('No JSON found in AI response, using fallback parsing');
        return this.fallbackParse(response);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证响应结构
      if (!this.validateResponseStructure(parsed)) {
        this.logger.warn('Invalid response structure, using fallback parsing');
        return this.fallbackParse(response);
      }

      return parsed as AIReviewResponse;
    } catch (error) {
      this.logger.error('Failed to parse AI response', {
        error: error instanceof Error ? error.message : String(error),
        responsePreview: response.substring(0, 200),
      });

      // 使用备用解析方法
      return this.fallbackParse(response);
    }
  }

  /**
   * 验证响应结构
   */
  private validateResponseStructure(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') {
      return false;
    }

    if (!Array.isArray(parsed.comments)) {
      return false;
    }

    if (!parsed.summary || typeof parsed.summary !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * 备用解析方法（当 JSON 解析失败时）
   */
  private fallbackParse(response: string): AIReviewResponse {
    this.logger.info('Using fallback parsing for AI response');

    // 创建一个基本的响应结构
    return {
      comments: [
        {
          filePath: 'unknown',
          lineNumber: 0,
          severity: 'suggestion',
          category: 'general',
          message: '无法解析 AI 响应，请检查响应格式',
          suggestion: response.substring(0, 500),
          confidence: 0.5,
        },
      ],
      summary: {
        overallAssessment: '响应解析失败',
        keyIssues: ['AI 响应格式不正确'],
        positiveAspects: [],
        recommendations: ['请检查 AI 模型配置和提示词模板'],
      },
      metadata: {
        reviewTime: 0,
        tokensUsed: 0,
        model: 'unknown',
      },
    };
  }

  /**
   * 转换为标准审查结果
   */
  private convertToReviewResult(
    reviewId: string,
    commitHash: string,
    aiResponse: AIReviewResponse,
    processingTimeMs: number
  ): ReviewResult {
    // 转换评论
    const comments: ReviewComment[] = aiResponse.comments.map(comment => ({
      id: uuidv4(),
      file: comment.filePath,
      line: comment.lineNumber,
      severity: comment.severity,
      category: comment.category,
      message: comment.message,
      suggestion: comment.suggestion,
    }));

    // 计算摘要
    const summary: ReviewSummary = {
      total: comments.length,
      critical: comments.filter(c => c.severity === 'critical').length,
      major: comments.filter(c => c.severity === 'major').length,
      minor: comments.filter(c => c.severity === 'minor').length,
      suggestion: comments.filter(c => c.severity === 'suggestion').length,
    };

    return {
      id: reviewId,
      commitHash,
      comments,
      summary,
      processingTimeMs,
      status: 'completed',
    };
  }

  /**
   * 检测主要编程语言
   */
  private detectPrimaryLanguage(analysis: AnalysisResult): string {
    const languageCounts = new Map<string, number>();

    analysis.codeFiles.forEach(file => {
      const count = languageCounts.get(file.language) || 0;
      languageCounts.set(file.language, count + file.additions + file.deletions);
    });

    let maxCount = 0;
    let primaryLanguage = 'unknown';

    languageCounts.forEach((count, language) => {
      if (count > maxCount) {
        maxCount = count;
        primaryLanguage = language;
      }
    });

    return primaryLanguage;
  }

  /**
   * 批量审查（用于大型差异）
   */
  async reviewBatches(
    analysis: AnalysisResult,
    config: ReviewConfig
  ): Promise<ReviewResult> {
    const startTime = Date.now();
    const reviewId = uuidv4();

    this.logger.info('Starting batch review', {
      reviewId,
      commitHash: analysis.commit.hash,
      batchCount: analysis.batches.length,
    });

    const allComments: ReviewComment[] = [];

    // 逐批审查
    for (let i = 0; i < analysis.batches.length; i++) {
      const batch = analysis.batches[i];
      
      this.logger.debug('Processing batch', {
        reviewId,
        batchIndex: i,
        filesCount: batch.files.length,
      });

      try {
        // 为每个批次创建临时分析结果
        const batchAnalysis: AnalysisResult = {
          ...analysis,
          codeFiles: batch.files,
          diff: {
            ...analysis.diff,
            files: batch.files,
            totalFiles: batch.files.length,
          },
        };

        const batchResult = await this.review(batchAnalysis, config);
        allComments.push(...batchResult.comments);
      } catch (error) {
        this.logger.error('Batch review failed', {
          reviewId,
          batchIndex: i,
          error: error instanceof Error ? error.message : String(error),
        });
        
        // 继续处理下一批次
        continue;
      }
    }

    // 合并结果
    const summary: ReviewSummary = {
      total: allComments.length,
      critical: allComments.filter(c => c.severity === 'critical').length,
      major: allComments.filter(c => c.severity === 'major').length,
      minor: allComments.filter(c => c.severity === 'minor').length,
      suggestion: allComments.filter(c => c.severity === 'suggestion').length,
    };

    const processingTimeMs = Date.now() - startTime;

    this.logger.info('Batch review completed', {
      reviewId,
      commitHash: analysis.commit.hash,
      totalIssues: summary.total,
      processingTime: processingTimeMs,
    });

    return {
      id: reviewId,
      commitHash: analysis.commit.hash,
      comments: allComments,
      summary,
      processingTimeMs,
      status: 'completed',
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isHealthy = await this.aiClient.healthCheck();
      
      this.logger.debug('AI Reviewer health check', { healthy: isHealthy });
      
      return isHealthy;
    } catch (error) {
      this.logger.error('AI Reviewer health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return false;
    }
  }
}

/**
 * 创建默认 AI 审查器实例
 */
export function createAIReviewer(): AIReviewer {
  return new AIReviewer();
}
