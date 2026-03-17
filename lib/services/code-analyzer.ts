import { 
  CommitInfo, 
  DiffInfo, 
  FileChange, 
  DiffBatch, 
  AnalysisResult 
} from '@/types/git';
import { GitClient } from '@/lib/git/client';
import { DiffParser } from '@/lib/git/diff-parser';
import { logger } from '@/lib/utils/logger';

/**
 * Code Analyzer 配置
 */
interface CodeAnalyzerConfig {
  maxLinesPerBatch: number;
  contextLines: number;
  filterNonCodeFiles: boolean;
}

/**
 * Code Analyzer 类
 * 负责分析代码变更，过滤非代码文件，拆分大型差异
 * 
 * 需求覆盖:
 * - 3.1: 获取 Commit 的 Diff 信息
 * - 3.2: 识别变更文件的编程语言类型
 * - 3.3: 过滤掉非代码文件
 * - 3.4: 拆分超过 10000 行的 Diff
 * - 3.5: 提取每个变更文件的上下文代码
 */
export class CodeAnalyzer {
  private readonly config: CodeAnalyzerConfig;
  private readonly gitClient: GitClient;
  private readonly diffParser: DiffParser;
  private readonly analyzerLogger = logger.child({ service: 'CodeAnalyzer' });

  constructor(
    gitClient: GitClient,
    diffParser: DiffParser,
    config?: Partial<CodeAnalyzerConfig>
  ) {
    this.gitClient = gitClient;
    this.diffParser = diffParser;
    this.config = {
      maxLinesPerBatch: 10000,
      contextLines: 5,
      filterNonCodeFiles: true,
      ...config,
    };

    this.analyzerLogger.info('Code Analyzer initialized', {
      maxLinesPerBatch: this.config.maxLinesPerBatch,
      contextLines: this.config.contextLines,
      filterNonCodeFiles: this.config.filterNonCodeFiles,
    });
  }

  /**
   * 分析代码变更
   * 
   * @param commit - 提交信息
   * @returns 分析结果，包含差异信息、批次和分类的文件
   * 
   * 需求: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async analyze(commit: CommitInfo): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    this.analyzerLogger.info('Starting code analysis', {
      commitHash: commit.hash,
      repository: commit.repository,
      branch: commit.branch,
    });

    try {
      // 获取差异信息 (需求 3.1)
      const diff = await this.getDiff(commit.hash, commit.repository);

      // 过滤代码文件 (需求 3.3)
      const codeFiles = this.config.filterNonCodeFiles 
        ? this.filterCodeFiles(diff.files) 
        : diff.files;
      
      const nonCodeFiles = this.config.filterNonCodeFiles
        ? diff.files.filter(file => !codeFiles.includes(file))
        : [];

      // 创建只包含代码文件的差异信息
      const codeDiff: DiffInfo = {
        ...diff,
        files: codeFiles,
        totalFiles: codeFiles.length,
        totalAdditions: codeFiles.reduce((sum, file) => sum + file.additions, 0),
        totalDeletions: codeFiles.reduce((sum, file) => sum + file.deletions, 0),
      };

      // 拆分大型差异 (需求 3.4)
      const batches = this.splitDiff(codeDiff, this.config.maxLinesPerBatch);

      const analysisResult: AnalysisResult = {
        commit,
        diff: codeDiff,
        batches,
        codeFiles,
        nonCodeFiles,
      };

      const duration = Date.now() - startTime;
      this.analyzerLogger.performance('Code analysis', duration, {
        commitHash: commit.hash,
        totalFiles: diff.totalFiles,
        codeFiles: codeFiles.length,
        nonCodeFiles: nonCodeFiles.length,
        batches: batches.length,
        totalAdditions: codeDiff.totalAdditions,
        totalDeletions: codeDiff.totalDeletions,
      });

      return analysisResult;
    } catch (error) {
      this.analyzerLogger.error('Code analysis failed', {
        commitHash: commit.hash,
        error,
      });
      throw new Error(
        `Code analysis failed for commit ${commit.hash}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 获取代码差异
   * 
   * @param commitHash - 提交哈希值
   * @param repository - 仓库路径 (owner/repo)
   * @returns 差异信息
   * 
   * 需求: 3.1 - 获取 Commit 的 Diff 信息
   */
  async getDiff(commitHash: string, repository: string): Promise<DiffInfo> {
    this.analyzerLogger.debug('Fetching diff', { commitHash, repository });

    try {
      const diff = await this.gitClient.getDiff(commitHash, repository);

      this.analyzerLogger.debug('Diff fetched successfully', {
        commitHash,
        filesCount: diff.totalFiles,
        additions: diff.totalAdditions,
        deletions: diff.totalDeletions,
      });

      return diff;
    } catch (error) {
      this.analyzerLogger.error('Failed to fetch diff', {
        commitHash,
        repository,
        error,
      });
      throw error;
    }
  }

  /**
   * 过滤非代码文件
   * 
   * @param files - 文件变更列表
   * @returns 代码文件列表
   * 
   * 需求: 3.2 - 识别变更文件的编程语言类型
   * 需求: 3.3 - 过滤掉非代码文件（如图片、二进制文件）
   */
  filterCodeFiles(files: FileChange[]): FileChange[] {
    this.analyzerLogger.debug('Filtering code files', { totalFiles: files.length });

    const codeFiles = this.diffParser.filterCodeFiles(files);

    this.analyzerLogger.debug('Code files filtered', {
      totalFiles: files.length,
      codeFiles: codeFiles.length,
      filteredOut: files.length - codeFiles.length,
    });

    // 记录被过滤的文件类型统计
    const filteredFiles = files.filter(file => !codeFiles.includes(file));
    if (filteredFiles.length > 0) {
      const filteredByLanguage = filteredFiles.reduce((acc, file) => {
        const lang = file.language || 'unknown';
        acc[lang] = (acc[lang] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      this.analyzerLogger.debug('Filtered files by language', filteredByLanguage);
    }

    return codeFiles;
  }

  /**
   * 拆分大型差异
   * 
   * @param diff - 差异信息
   * @param maxLines - 每批次最大行数（默认 10000）
   * @returns 差异批次列表
   * 
   * 需求: 3.4 - 当 Diff 超过 10000 行时，将变更拆分为多个审查批次
   */
  splitDiff(diff: DiffInfo, maxLines?: number): DiffBatch[] {
    const maxLinesPerBatch = maxLines || this.config.maxLinesPerBatch;
    const totalLines = diff.totalAdditions + diff.totalDeletions;

    this.analyzerLogger.debug('Splitting diff', {
      commitHash: diff.commitHash,
      totalLines,
      maxLinesPerBatch,
      needsSplit: totalLines > maxLinesPerBatch,
    });

    // 使用 DiffParser 拆分差异
    const batches = this.diffParser.splitDiff(diff, maxLinesPerBatch);

    // 更新批次 ID 以包含 commitHash
    batches.forEach((batch, index) => {
      batch.id = `${diff.commitHash}-batch-${index}`;
    });

    this.analyzerLogger.info('Diff split into batches', {
      commitHash: diff.commitHash,
      totalLines,
      totalBatches: batches.length,
      maxLinesPerBatch,
      batchSizes: batches.map(b => b.lineCount),
    });

    return batches;
  }

  /**
   * 提取文件的上下文代码
   * 
   * @param file - 文件变更信息
   * @param targetLine - 目标行号
   * @param contextLines - 上下文行数（默认 5）
   * @returns 代码块信息，如果无法提取则返回 null
   * 
   * 需求: 3.5 - 提取每个变更文件的上下文代码（变更前后各 5 行）
   */
  extractContext(
    file: FileChange, 
    targetLine: number, 
    contextLines?: number
  ): string | null {
    const lines = contextLines || this.config.contextLines;

    this.analyzerLogger.debug('Extracting context', {
      file: file.path,
      targetLine,
      contextLines: lines,
    });

    try {
      const codeBlock = this.diffParser.extractContext(file.patch, targetLine, lines);
      
      if (!codeBlock) {
        this.analyzerLogger.warn('Failed to extract context', {
          file: file.path,
          targetLine,
        });
        return null;
      }

      // 格式化代码块为字符串
      const contextString = codeBlock.lines
        .map(line => {
          const prefix = line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' ';
          return `${prefix} ${line.content}`;
        })
        .join('\n');

      this.analyzerLogger.debug('Context extracted successfully', {
        file: file.path,
        targetLine,
        startLine: codeBlock.startLine,
        endLine: codeBlock.endLine,
        linesCount: codeBlock.lines.length,
      });

      return contextString;
    } catch (error) {
      this.analyzerLogger.error('Failed to extract context', {
        file: file.path,
        targetLine,
        error,
      });
      return null;
    }
  }

  /**
   * 获取分析统计信息
   * 
   * @param analysis - 分析结果
   * @returns 统计信息对象
   */
  getAnalysisStats(analysis: AnalysisResult): {
    totalFiles: number;
    codeFiles: number;
    nonCodeFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    totalBatches: number;
    languageDistribution: Record<string, number>;
    fileTypeDistribution: Record<string, number>;
  } {
    const languageDistribution = analysis.codeFiles.reduce((acc, file) => {
      const lang = file.language || 'unknown';
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const fileTypeDistribution = analysis.codeFiles.reduce((acc, file) => {
      const type = file.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalFiles: analysis.diff.totalFiles + analysis.nonCodeFiles.length,
      codeFiles: analysis.codeFiles.length,
      nonCodeFiles: analysis.nonCodeFiles.length,
      totalAdditions: analysis.diff.totalAdditions,
      totalDeletions: analysis.diff.totalDeletions,
      totalBatches: analysis.batches.length,
      languageDistribution,
      fileTypeDistribution,
    };
  }
}

/**
 * 创建 Code Analyzer 实例
 * 
 * @param gitClient - Git 客户端实例
 * @param diffParser - Diff 解析器实例
 * @param config - 配置选项
 * @returns Code Analyzer 实例
 */
export function createCodeAnalyzer(
  gitClient: GitClient,
  diffParser: DiffParser,
  config?: Partial<CodeAnalyzerConfig>
): CodeAnalyzer {
  return new CodeAnalyzer(gitClient, diffParser, config);
}
