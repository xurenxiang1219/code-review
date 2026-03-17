/**
 * AI 服务提供商
 */
export type AIProvider = 'openai' | 'claude' | 'gemini' | 'local';

/**
 * AI 完成原因
 */
export type AIFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls';

/**
 * AI 审查严重程度
 */
export type AISeverity = 'critical' | 'major' | 'minor' | 'suggestion';

/**
 * AI 模型配置
 */
export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * AI 使用统计
 */
interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * AI 请求参数
 */
export interface AIRequest {
  prompt: string;
  context?: string;
  codeLanguage?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * AI 响应
 */
export interface AIResponse {
  content: string;
  usage?: AIUsage;
  model: string;
  finishReason?: AIFinishReason;
}

/**
 * 提交信息简化版
 */
interface CommitInfoSimple {
  hash: string;
  message: string;
  author: string;
  branch: string;
}

/**
 * 代码变更信息
 */
interface CodeChangeInfo {
  filePath: string;
  language: string;
  additions: number;
  deletions: number;
  patch: string;
  context?: string;
}

/**
 * AI 审查请求
 */
export interface AIReviewRequest {
  commitInfo: CommitInfoSimple;
  codeChanges: CodeChangeInfo[];
  reviewFocus: string[];
  previousComments?: string[];
}

/**
 * AI 审查评论
 */
interface AIReviewComment {
  filePath: string;
  lineNumber: number;
  severity: AISeverity;
  category: string;
  message: string;
  suggestion?: string;
  confidence: number;
}

/**
 * AI 审查摘要
 */
interface AIReviewSummary {
  overallAssessment: string;
  keyIssues: string[];
  positiveAspects: string[];
  recommendations: string[];
}

/**
 * AI 审查元数据
 */
interface AIReviewMetadata {
  reviewTime: number;
  tokensUsed: number;
  model: string;
}

/**
 * AI 审查响应
 */
export interface AIReviewResponse {
  comments: AIReviewComment[];
  summary: AIReviewSummary;
  metadata: AIReviewMetadata;
}

/**
 * 提示词模板
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  language?: string;
  category: string;
}

/**
 * 代码上下文
 */
interface CodeContext {
  language: string;
  filePath: string;
  changes: string;
  surroundingCode?: string;
}

/**
 * 审查配置
 */
interface ReviewConfigSimple {
  focus: string[];
  severity: string[];
  style: string;
}

/**
 * 提示词构建参数
 */
export interface PromptBuildParams {
  template: string;
  variables: Record<string, any>;
  codeContext: CodeContext;
  reviewConfig: ReviewConfigSimple;
}

/**
 * AI 客户端错误
 */
export interface AIClientError {
  code: string;
  message: string;
  retryable: boolean;
  details?: any;
}

/**
 * AI 服务状态
 */
export interface AIServiceStatus {
  provider: AIProvider;
  available: boolean;
  responseTime?: number;
  error?: string;
  lastCheck: Date;
}

/**
 * 项目上下文
 */
interface ProjectContext {
  language: string;
  framework?: string;
  conventions?: string[];
}

/**
 * 代码审查上下文
 */
export interface ReviewContext {
  repository: string;
  branch: string;
  commitHash: string;
  author: string;
  timestamp: Date;
  previousReviews?: string[];
  projectContext?: ProjectContext;
}

/**
 * AI 审查规则
 */
interface AIReviewRules {
  maxFileSize: number;
  maxDiffLines: number;
  skipBinaryFiles: boolean;
  skipGeneratedFiles: boolean;
}

/**
 * AI 审查输出配置
 */
interface AIReviewOutput {
  includePositiveFeedback: boolean;
  includeConfidenceScore: boolean;
  groupSimilarIssues: boolean;
}

/**
 * AI 审查提示词配置
 */
interface AIReviewPrompts {
  system: string;
  codeReview: string;
  summary: string;
}

/**
 * AI 审查配置
 */
export interface AIReviewConfig {
  model: AIModelConfig;
  prompts: AIReviewPrompts;
  rules: AIReviewRules;
  output: AIReviewOutput;
}