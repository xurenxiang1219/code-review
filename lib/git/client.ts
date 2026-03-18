import { 
  CommitInfo, 
  DiffInfo, 
  FileChange, 
  GitClientConfig, 
  CommentPublishResult,
  BranchInfo,
  CommitStatus
} from '@/types/git';
import { ReviewComment } from '@/types/review';
import { logger } from '@/lib/utils/logger';
import { withRetry, GIT_RETRY_OPTIONS } from '@/lib/utils/retry';

/**
 * Git API 响应接口
 */
interface GitCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    previous_filename?: string;
    status: 'added' | 'modified' | 'removed' | 'renamed';
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

interface GitBranchResponse {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

/**
 * Git 客户端类
 * 封装与 Git 仓库的 API 交互，支持 GitHub、GitLab 等平台
 */
export class GitClient {
  private readonly config: GitClientConfig;
  private readonly clientLogger = logger.child({ service: 'GitClient' });

  constructor(config: GitClientConfig) {
    this.config = config;
    this.clientLogger.info('Git client initialized', {
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
    });
  }

  /**
   * 获取单个提交信息
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @returns 提交信息
   */
  /**
   * 获取单个提交信息
   * @param commitHash 提交哈希值
   * @param repository 仓库名称
   * @returns 提交信息
   */
  async getCommit(commitHash: string, repository: string): Promise<CommitInfo> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Fetching commit', { commitHash, repository: normalizedRepo });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/commits/${commitHash}`;
        const response = await this.makeRequest<GitCommitResponse>(url);

        const commitInfo: CommitInfo = {
          hash: response.sha,
          branch: '',
          repository: normalizedRepo,
          author: {
            name: response.commit.author.name,
            email: response.commit.author.email,
          },
          message: response.commit.message,
          timestamp: new Date(response.commit.author.date),
          url: response.html_url,
        };

        this.clientLogger.debug('Commit fetched successfully', { 
          commitHash, 
          author: commitInfo.author.name 
        });

        return commitInfo;
      },
      GIT_RETRY_OPTIONS,
      `getCommit(${commitHash})`
    );
  }

  /**
   * 获取提交的差异信息
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @returns 差异信息
   */
  /**
   * 获取提交的差异信息
   * @param commitHash 提交哈希值
   * @param repository 仓库名称
   * @returns 差异信息
   */
  async getDiff(commitHash: string, repository: string): Promise<DiffInfo> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Fetching diff', { commitHash, repository: normalizedRepo });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/commits/${commitHash}`;
        const response = await this.makeRequest<GitCommitResponse>(url);

        // 处理无文件信息的情况
        if (!response.files) {
          return await this.handleMissingFiles(response, commitHash, repository, normalizedRepo);
        }

        // 检查空文件数组的情况
        if (Array.isArray(response.files) && response.files.length === 0 && response.stats) {
          this.clientLogger.warn('提交可能因为过大而被 GitHub API 截断', {
            commitHash,
            stats: response.stats
          });
        }

        return this.buildDiffInfoFromFiles(response.files, commitHash);
      },
      GIT_RETRY_OPTIONS,
      `getDiff(${commitHash})`
    );
  }

  /**
   * 处理 GitHub API 未返回文件信息的情况
   * @param response GitHub API 响应
   * @param commitHash 提交哈希
   * @param repository 原始仓库名
   * @param normalizedRepo 标准化仓库名
   * @returns 差异信息
   */
  private async handleMissingFiles(
    response: GitCommitResponse, 
    commitHash: string, 
    repository: string, 
    normalizedRepo: string
  ): Promise<DiffInfo> {
    this.clientLogger.warn('GitHub API 未返回文件变更信息，尝试使用 Compare API', { 
      commitHash, 
      repository: normalizedRepo,
      responseKeys: Object.keys(response),
      hasStats: !!response.stats
    });
    
    // 尝试使用 Compare API 作为备用方案
    const compareResult = await this.getDiffUsingCompareAPI(commitHash, repository);
    if (compareResult.totalFiles > 0) {
      this.clientLogger.info('Compare API 成功获取到文件变更信息', {
        commitHash,
        filesCount: compareResult.totalFiles,
        additions: compareResult.totalAdditions,
        deletions: compareResult.totalDeletions,
      });
      return compareResult;
    }
    
    // 尝试从 stats 字段获取统计信息
    const statsInfo = this.extractStatsFromResponse(response);
    
    return {
      commitHash,
      files: [],
      totalAdditions: statsInfo.additions,
      totalDeletions: statsInfo.deletions,
      totalFiles: statsInfo.total,
    };
  }

  /**
   * 从文件数组构建差异信息
   * @param files 文件变更数组
   * @param commitHash 提交哈希
   * @returns 差异信息
   */
  private buildDiffInfoFromFiles(files: GitCommitResponse['files'], commitHash: string): DiffInfo {
    const fileChanges: FileChange[] = (files ?? []).map(file => ({
      path: file.filename,
      previousPath: file.previous_filename,
      type: this.mapFileStatus(file.status),
      language: this.detectLanguage(file.filename),
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      patch: file.patch ?? '',
    }));

    const diffInfo: DiffInfo = {
      commitHash,
      files: fileChanges,
      totalAdditions: fileChanges.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: fileChanges.reduce((sum, file) => sum + file.deletions, 0),
      totalFiles: fileChanges.length,
    };

    this.clientLogger.debug('Diff fetched successfully', {
      commitHash,
      filesCount: diffInfo.totalFiles,
      additions: diffInfo.totalAdditions,
      deletions: diffInfo.totalDeletions,
    });

    return diffInfo;
  }

  /**
   * 使用 Compare API 获取提交差异（备用方案）
   * @param commitHash 提交哈希
   * @param repository 仓库名
   * @returns 差异信息
   */
  private async getDiffUsingCompareAPI(commitHash: string, repository: string): Promise<DiffInfo> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    try {
      const url = `${this.config.baseUrl}/repos/${normalizedRepo}/compare/${commitHash}^...${commitHash}`;
      const response = await this.makeRequest<any>(url);
      
      this.clientLogger.debug('使用 Compare API 获取 diff', {
        commitHash,
        filesCount: response.files?.length ?? 0,
      });
      
      if (!response.files) {
        return this.createEmptyDiffInfo(commitHash);
      }
      
      return this.buildDiffInfoFromCompareResponse(response, commitHash);
    } catch (error) {
      this.clientLogger.error('Compare API 调用失败', {
        commitHash,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.createEmptyDiffInfo(commitHash);
    }
  }

  /**
   * 创建空的差异信息
   * @param commitHash 提交哈希
   * @returns 空的差异信息
   */
  private createEmptyDiffInfo(commitHash: string): DiffInfo {
    return {
      commitHash,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      totalFiles: 0,
    };
  }

  /**
   * 从 Compare API 响应构建差异信息
   * @param response Compare API 响应
   * @param commitHash 提交哈希
   * @returns 差异信息
   */
  private buildDiffInfoFromCompareResponse(response: any, commitHash: string): DiffInfo {
    const files: FileChange[] = response.files.map((file: any) => ({
      path: file.filename,
      previousPath: file.previous_filename,
      type: this.mapFileStatus(file.status),
      language: this.detectLanguage(file.filename),
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      patch: file.patch ?? '',
    }));
    
    return {
      commitHash,
      files,
      totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
      totalFiles: files.length,
    };
  }

  /**
   * 从 GitHub API 响应中提取统计信息
   * @param response GitHub API 响应
   * @returns 统计信息
   */
  private extractStatsFromResponse(response: any): { additions: number; deletions: number; total: number } {
    // GitHub API 可能在 stats 字段中包含统计信息
    if (response.stats) {
      return {
        additions: response.stats.additions ?? 0,
        deletions: response.stats.deletions ?? 0,
        total: response.stats.total ?? 0,
      };
    }
    
    return { additions: 0, deletions: 0, total: 0 };
  }

  /**
   * 获取分支的提交列表
   * @param repository - 仓库路径 (owner/repo)
   * @param branch - 分支名称
   * @param since - 起始时间
   * @param limit - 限制数量
   * @returns 提交列表
   */
  /**
   * 规范化仓库名称，移除.git后缀
   * @param repository 原始仓库名称
   * @returns 规范化后的仓库名称
   */
  private normalizeRepository(repository: string): string {
    return repository.replace(/\.git$/, '');
  }

  /**
   * 获取提交列表
   * @param repository 仓库名称
   * @param branch 分支名称
   * @param since 起始时间
   * @param limit 限制数量
   * @returns 提交信息列表
   */
  async getCommits(
    repository: string, 
    branch: string, 
    since?: Date, 
    limit = 50
  ): Promise<CommitInfo[]> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Fetching commits', { repository: normalizedRepo, branch, since, limit });

        const params = new URLSearchParams({
          sha: branch,
          per_page: limit.toString(),
        });

        if (since) {
          params.append('since', since.toISOString());
        }

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/commits?${params}`;
        const response = await this.makeRequest<GitCommitResponse[]>(url);

        const commits: CommitInfo[] = response.map(commit => ({
          hash: commit.sha,
          branch,
          repository: normalizedRepo,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
          },
          message: commit.commit.message,
          timestamp: new Date(commit.commit.author.date),
          url: commit.html_url,
        }));

        this.clientLogger.debug('Commits fetched successfully', {
          repository: normalizedRepo,
          branch,
          count: commits.length,
        });

        return commits;
      },
      GIT_RETRY_OPTIONS,
      `getCommits(${normalizedRepo}/${branch})`
    );
  }

  /**
   * 发布评论到提交
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @param comment - 审查评论
   * @returns 发布结果
   */
  async postComment(
    commitHash: string, 
    repository: string, 
    comment: ReviewComment
  ): Promise<CommentPublishResult> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Publishing comment', { 
          commitHash, 
          repository: normalizedRepo, 
          file: comment.file, 
          line: comment.line 
        });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/commits/${commitHash}/comments`;
        const body = {
          body: this.formatComment(comment),
          path: comment.file,
          line: comment.line,
        };

        const response = await this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        this.clientLogger.info('Comment published successfully', {
          commitHash,
          commentId: response.id,
          file: comment.file,
          line: comment.line,
        });

        return {
          success: true,
          commentId: response.id,
          retryable: false,
        };
      },
      {
        ...GIT_RETRY_OPTIONS,
        shouldRetry: (error: Error) => {
          const errorMessage = error.message.toLowerCase();
          
          // 不重试的错误类型
          const nonRetryableErrors = [
            'unauthorized',
            'forbidden',
            'not found',
            'bad request',
            'validation failed',
          ];
          
          if (nonRetryableErrors.some(pattern => errorMessage.includes(pattern))) {
            return false;
          }
          
          // 重试网络和服务器错误
          return GIT_RETRY_OPTIONS.shouldRetry!(error, 0);
        },
      },
      `postComment(${commitHash})`
    );
  }

  /**
   * 发布摘要评论到提交
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @param summary - 审查摘要内容
   * @returns 发布结果
   */
  async postSummaryComment(
    commitHash: string, 
    repository: string, 
    summary: string
  ): Promise<CommentPublishResult> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Publishing summary comment', { commitHash, repository: normalizedRepo });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/commits/${commitHash}/comments`;
        const body = {
          body: summary,
        };

        const response = await this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        this.clientLogger.info('Summary comment published successfully', {
          commitHash,
          commentId: response.id,
        });

        return {
          success: true,
          commentId: response.id,
          retryable: false,
        };
      },
      GIT_RETRY_OPTIONS,
      `postSummaryComment(${commitHash})`
    );
  }

  /**
   * 获取分支信息
   * @param repository - 仓库路径 (owner/repo)
   * @param branch - 分支名称
   * @returns 分支信息
   */
  async getBranch(repository: string, branch: string): Promise<BranchInfo> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Fetching branch info', { repository: normalizedRepo, branch });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/branches/${branch}`;
        const response = await this.makeRequest<GitBranchResponse>(url);

        const branchInfo: BranchInfo = {
          name: response.name,
          commit: {
            sha: response.commit.sha,
            url: response.commit.url,
          },
          protected: response.protected,
        };

        this.clientLogger.debug('Branch info fetched successfully', { 
          repository: normalizedRepo, 
          branch, 
          commitSha: branchInfo.commit.sha 
        });

        return branchInfo;
      },
      GIT_RETRY_OPTIONS,
      `getBranch(${normalizedRepo}/${branch})`
    );
  }

  /**
   * 更新提交状态
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @param status - 提交状态
   * @returns 是否成功
   */
  async updateCommitStatus(
    commitHash: string, 
    repository: string, 
    status: CommitStatus
  ): Promise<boolean> {
    const normalizedRepo = this.normalizeRepository(repository);
    
    return withRetry(
      async () => {
        this.clientLogger.debug('Updating commit status', { 
          commitHash, 
          repository: normalizedRepo, 
          state: status.state 
        });

        const url = `${this.config.baseUrl}/repos/${normalizedRepo}/statuses/${commitHash}`;
        const body = {
          state: status.state,
          target_url: status.targetUrl,
          description: status.description,
          context: status.context,
        };

        await this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        this.clientLogger.info('Commit status updated successfully', {
          commitHash,
          state: status.state,
          context: status.context,
        });

        return true;
      },
      GIT_RETRY_OPTIONS,
      `updateCommitStatus(${commitHash})`
    );
  }

  /**
   * 执行 HTTP 请求
   * @param url - 请求 URL
   * @param options - 请求选项
   * @returns 响应数据
   */
  private async makeRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Code-Review-System/1.0',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(
          `Git API request failed: ${response.status} ${response.statusText} - ${errorText}`
        );
        
        this.clientLogger.error('Git API request failed', {
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        throw error;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Git API request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * 映射文件状态
   * @param status - Git 文件状态
   * @returns 标准化的文件变更类型
   */
  private mapFileStatus(status: string): FileChange['type'] {
    switch (status) {
      case 'added':
        return 'added';
      case 'modified':
        return 'modified';
      case 'removed':
        return 'deleted';
      case 'renamed':
        return 'renamed';
      default:
        return 'modified';
    }
  }

  /**
   * 检测文件编程语言
   * @param filename - 文件名
   * @returns 编程语言
   */
  private detectLanguage(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'kt': 'kotlin',
      'swift': 'swift',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'scala': 'scala',
      'sh': 'shell',
      'sql': 'sql',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'dockerfile': 'dockerfile',
    };

    return languageMap[extension || ''] || 'text';
  }

  /**
   * 格式化审查评论
   * @param comment - 审查评论
   * @returns 格式化的评论内容
   */
  private formatComment(comment: ReviewComment): string {
    const severityEmoji = {
      critical: '🚨',
      major: '⚠️',
      minor: '💡',
      suggestion: '💭',
    };

    const emoji = severityEmoji[comment.severity];
    let formattedComment = `${emoji} **${comment.severity.toUpperCase()}**: ${comment.message}`;

    if (comment.suggestion) {
      formattedComment += `\n\n**建议修改:**\n${comment.suggestion}`;
    }

    if (comment.codeSnippet) {
      formattedComment += `\n\n**相关代码:**\n\`\`\`\n${comment.codeSnippet}\n\`\`\``;
    }

    formattedComment += `\n\n*由 CodeReview 自动生成*`;

    return formattedComment;
  }
}

/**
 * 创建 Git 客户端实例
 * @param config - Git 客户端配置
 * @returns Git 客户端实例
 */
export function createGitClient(config: GitClientConfig): GitClient {
  return new GitClient(config);
}

/**
 * 从数据库配置创建Git客户端配置
 * @param gitConfig 数据库中的Git配置对象
 * @returns Git客户端配置
 * @throws 当访问令牌缺失且在生产环境时抛出错误
 */
export function createGitClientConfigFromDb(gitConfig: {
  baseUrl?: string;
  accessToken?: string;
  timeout?: number;
}): GitClientConfig {
  const baseUrl = gitConfig?.baseUrl ?? process.env.GIT_API_BASE_URL ?? 'https://api.github.com';
  const token = gitConfig?.accessToken ?? process.env.GIT_ACCESS_TOKEN;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (!token && !isDevelopment) {
    throw new Error('Git access token is required (either in database config or GIT_ACCESS_TOKEN environment variable)');
  }

  return {
    baseUrl,
    token: token ?? '', // 开发环境中允许空 token
    timeout: gitConfig?.timeout ?? parseInt(process.env.GIT_TIMEOUT ?? '30000'),
    retryAttempts: parseInt(process.env.GIT_RETRY_ATTEMPTS ?? '2'),
    retryDelay: parseInt(process.env.GIT_RETRY_DELAY ?? '1000'),
  };
}

/**
 * 从环境变量创建 Git 客户端配置（向后兼容）
 * @returns Git 客户端配置
 */
export function createGitClientConfig(): GitClientConfig {
  const baseUrl = process.env.GIT_API_BASE_URL ?? 'https://api.github.com';
  const token = process.env.GIT_ACCESS_TOKEN;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (!token && !isDevelopment) {
    throw new Error('GIT_ACCESS_TOKEN environment variable is required');
  }

  return {
    baseUrl,
    token: token ?? '', // 开发环境中允许空 token
    timeout: parseInt(process.env.GIT_TIMEOUT ?? '30000'),
    retryAttempts: parseInt(process.env.GIT_RETRY_ATTEMPTS ?? '2'),
    retryDelay: parseInt(process.env.GIT_RETRY_DELAY ?? '1000'),
  };
}

/**
 * 创建默认 Git 客户端实例
 * 在开发环境中提供容错机制，避免启动时的配置检查失败
 * @returns Git 客户端实例
 */
/**
 * 创建默认 Git 客户端实例
 * 在开发环境中提供容错机制，避免启动时的配置检查失败
 * @returns Git 客户端实例
 */
function createDefaultGitClient(): GitClient {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  try {
    return createGitClient(createGitClientConfig());
  } catch (error) {
    if (!isDevelopment) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Git 配置失败，使用模拟客户端:', errorMessage);
    
    // 开发环境使用默认配置创建模拟客户端
    return createGitClient({
      baseUrl: 'https://api.github.com',
      token: '',
      timeout: 30000,
      retryAttempts: 2,
      retryDelay: 1000,
    });
  }
}

/**
 * 默认 Git 客户端实例
 */
export const gitClient = createDefaultGitClient();