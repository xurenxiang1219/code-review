/**
 * 文件变更类型
 */
export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Git 提交状态
 */
export type CommitState = 'pending' | 'success' | 'error' | 'failure';

/**
 * 代码行类型
 */
export type CodeLineType = 'added' | 'deleted' | 'unchanged';

/**
 * 提交作者信息
 */
interface CommitAuthor {
  name: string;
  email: string;
}

/**
 * 提交信息
 */
export interface CommitInfo {
  hash: string;
  branch: string;
  repository: string;
  author: CommitAuthor;
  message: string;
  timestamp: Date;
  url: string;
}

/**
 * 文件变更
 */
export interface FileChange {
  path: string;
  previousPath?: string;
  type: FileChangeType;
  language: string;
  additions: number;
  deletions: number;
  patch: string;
}

/**
 * 差异信息
 */
export interface DiffInfo {
  commitHash: string;
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

/**
 * 差异批次（用于大型差异的分割）
 */
export interface DiffBatch {
  id: string;
  files: FileChange[];
  lineCount: number;
  batchIndex: number;
  totalBatches: number;
}

/**
 * 代码分析结果
 */
export interface AnalysisResult {
  commit: CommitInfo;
  diff: DiffInfo;
  batches: DiffBatch[];
  codeFiles: FileChange[];
  nonCodeFiles: FileChange[];
}

/**
 * Git 仓库信息
 */
export interface GitRepository {
  name: string;
  url: string;
  defaultBranch: string;
  owner?: string;
}

/**
 * Webhook 提交信息
 */
interface WebhookCommit {
  id: string;
  message: string;
  author: CommitAuthor;
  timestamp: string;
  url: string;
  added: string[];
  modified: string[];
  removed: string[];
}

/**
 * Webhook 载荷
 */
export interface WebhookPayload {
  ref: string;
  repository: GitRepository;
  commits: WebhookCommit[];
  pusher?: CommitAuthor;
}

/**
 * Git API 客户端配置
 */
export interface GitClientConfig {
  baseUrl: string;
  token: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Git 评论发布结果
 */
export interface CommentPublishResult {
  success: boolean;
  commentId?: string;
  error?: string;
  retryable: boolean;
}

/**
 * Git 分支信息
 */
export interface BranchInfo {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

/**
 * Git 提交状态更新
 */
export interface CommitStatus {
  state: CommitState;
  targetUrl?: string;
  description?: string;
  context: string;
}

/**
 * 代码行信息
 */
export interface CodeLine {
  number: number;
  content: string;
  type: CodeLineType;
}

/**
 * 代码块信息
 */
export interface CodeBlock {
  startLine: number;
  endLine: number;
  lines: CodeLine[];
  language: string;
  filePath: string;
}