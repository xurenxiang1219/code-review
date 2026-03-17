import type { AnalysisResult } from '@/types/git';
import type { ReviewConfig } from '@/types/review';

/**
 * 提示词模板变量
 */
interface PromptVariables {
  commitHash: string;
  commitMessage: string;
  author: string;
  branch: string;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  reviewFocus: string;
  codeChanges: string;
  language: string;
}

/**
 * 代码变更格式化选项
 */
interface CodeChangeFormatOptions {
  includeContext: boolean;
  maxLinesPerFile: number;
  showLineNumbers: boolean;
}

/**
 * 提示词构建器类
 */
export class PromptBuilder {
  private readonly defaultSystemPrompt = `你是一个专业的代码审查助手，具有丰富的软件工程经验。
你的任务是审查代码变更，识别潜在问题，并提供具体的改进建议。

审查时请关注以下方面：
- 代码质量和可维护性
- 潜在的 bug 和逻辑错误
- 性能问题
- 安全漏洞
- 代码规范和最佳实践
- 可读性和文档

请以 JSON 格式返回审查结果，包含以下字段：
{
  "comments": [
    {
      "filePath": "文件路径",
      "lineNumber": 行号,
      "severity": "critical|major|minor|suggestion",
      "category": "问题分类（如：bug、performance、security、style）",
      "message": "问题描述",
      "suggestion": "改进建议（可选）",
      "confidence": 0.0-1.0 的置信度
    }
  ],
  "summary": {
    "overallAssessment": "整体评价",
    "keyIssues": ["关键问题列表"],
    "positiveAspects": ["积极方面"],
    "recommendations": ["总体建议"]
  }
}`;

  /**
   * 构建完整的审查提示词
   */
  buildReviewPrompt(
    analysis: AnalysisResult,
    config: ReviewConfig
  ): { system: string; user: string } {
    const variables = this.extractVariables(analysis);
    const systemPrompt = this.buildSystemPrompt(config);
    const userPrompt = this.buildUserPrompt(variables, config);

    return {
      system: systemPrompt,
      user: userPrompt,
    };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(config: ReviewConfig): string {
    let prompt = this.defaultSystemPrompt;

    // 如果有自定义模板，使用自定义模板
    if (config.promptTemplate) {
      prompt = config.promptTemplate;
    }

    // 添加审查关注点
    if (config.reviewFocus && config.reviewFocus.length > 0) {
      prompt += `\n\n特别关注以下方面：\n${config.reviewFocus.map(f => `- ${f}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(
    variables: PromptVariables,
    config: ReviewConfig
  ): string {
    const sections: string[] = [];

    // 提交信息部分
    sections.push(this.buildCommitInfoSection(variables));

    // 代码变更部分
    sections.push(this.buildCodeChangesSection(variables));

    // 审查要求部分
    sections.push(this.buildReviewRequirementsSection(config));

    return sections.join('\n\n---\n\n');
  }

  /**
   * 构建提交信息部分
   */
  private buildCommitInfoSection(variables: PromptVariables): string {
    return `## 提交信息

- **提交哈希**: ${variables.commitHash}
- **提交消息**: ${variables.commitMessage}
- **作者**: ${variables.author}
- **分支**: ${variables.branch}
- **变更统计**: ${variables.filesChanged} 个文件，+${variables.linesAdded} -${variables.linesDeleted} 行`;
  }

  /**
   * 构建代码变更部分
   */
  private buildCodeChangesSection(variables: PromptVariables): string {
    return `## 代码变更

${variables.codeChanges}`;
  }

  /**
   * 构建审查要求部分
   */
  private buildReviewRequirementsSection(config: ReviewConfig): string {
    const requirements: string[] = [
      '## 审查要求',
      '',
      '请仔细审查上述代码变更，并提供详细的反馈。',
    ];

    if (config.reviewFocus && config.reviewFocus.length > 0) {
      requirements.push('');
      requirements.push('**重点关注**：');
      config.reviewFocus.forEach(focus => {
        requirements.push(`- ${focus}`);
      });
    }

    requirements.push('');
    requirements.push('**输出格式**：请严格按照 JSON 格式返回审查结果。');
    requirements.push('');
    requirements.push('**严重程度说明**：');
    requirements.push('- critical: 严重问题，必须修复（如安全漏洞、严重 bug）');
    requirements.push('- major: 重要问题，强烈建议修复（如性能问题、逻辑错误）');
    requirements.push('- minor: 次要问题，建议修复（如代码规范、可读性）');
    requirements.push('- suggestion: 改进建议（如优化建议、最佳实践）');

    return requirements.join('\n');
  }

  /**
   * 从分析结果中提取变量
   */
  private extractVariables(analysis: AnalysisResult): PromptVariables {
    const codeChanges = this.formatCodeChanges(analysis);

    return {
      commitHash: analysis.commit.hash,
      commitMessage: analysis.commit.message,
      author: analysis.commit.author.name,
      branch: analysis.commit.branch,
      filesChanged: analysis.diff.totalFiles,
      linesAdded: analysis.diff.totalAdditions,
      linesDeleted: analysis.diff.totalDeletions,
      reviewFocus: '',
      codeChanges,
      language: this.detectPrimaryLanguage(analysis),
    };
  }

  /**
   * 格式化代码变更
   */
  private formatCodeChanges(
    analysis: AnalysisResult,
    options: Partial<CodeChangeFormatOptions> = {}
  ): string {
    const opts: CodeChangeFormatOptions = {
      includeContext: true,
      maxLinesPerFile: 500,
      showLineNumbers: true,
      ...options,
    };

    const formattedFiles = analysis.codeFiles.map(file => {
      const header = `### ${file.path} (${file.language})`;
      const stats = `**变更**: +${file.additions} -${file.deletions}`;
      
      let patch = file.patch;
      
      // 如果补丁太长，截断
      const lines = patch.split('\n');
      if (lines.length > opts.maxLinesPerFile) {
        const truncatedLines = lines.slice(0, opts.maxLinesPerFile);
        patch = truncatedLines.join('\n') + `\n\n... (省略 ${lines.length - opts.maxLinesPerFile} 行)`;
      }

      return `${header}\n${stats}\n\n\`\`\`diff\n${patch}\n\`\`\``;
    });

    return formattedFiles.join('\n\n');
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
   * 构建简化的审查提示词（用于快速审查）
   */
  buildQuickReviewPrompt(
    analysis: AnalysisResult,
    focusAreas: string[]
  ): string {
    const variables = this.extractVariables(analysis);
    
    return `请快速审查以下代码变更，重点关注：${focusAreas.join('、')}

${this.buildCommitInfoSection(variables)}

${this.buildCodeChangesSection(variables)}

请简要指出主要问题和改进建议。`;
  }

  /**
   * 构建批次审查提示词（用于大型差异）
   */
  buildBatchReviewPrompt(
    batchIndex: number,
    totalBatches: number,
    files: string,
    config: ReviewConfig
  ): string {
    return `这是一个大型代码变更的第 ${batchIndex + 1}/${totalBatches} 批次审查。

${files}

请审查这批文件的变更，并按照标准格式返回审查结果。`;
  }

  /**
   * 验证提示词长度
   */
  validatePromptLength(prompt: string, maxTokens: number): boolean {
    // 粗略估算：1 token ≈ 4 字符（对于中文和代码混合）
    const estimatedTokens = Math.ceil(prompt.length / 4);
    return estimatedTokens <= maxTokens;
  }

  /**
   * 截断提示词以适应 token 限制
   */
  truncatePrompt(prompt: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    
    if (prompt.length <= maxChars) {
      return prompt;
    }

    const truncated = prompt.substring(0, maxChars - 100);
    return truncated + '\n\n... (内容已截断以适应 token 限制)';
  }
}

/**
 * 创建默认提示词构建器实例
 */
export function createPromptBuilder(): PromptBuilder {
  return new PromptBuilder();
}
