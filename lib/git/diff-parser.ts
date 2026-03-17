import { 
  DiffInfo, 
  FileChange, 
  DiffBatch, 
  CodeLine, 
  CodeBlock,
  FileChangeType,
  CodeLineType 
} from '@/types/git';
import { logger } from '@/lib/utils/logger';

/**
 * Diff 解析器配置
 */
interface DiffParserConfig {
  maxLinesPerBatch: number;
  contextLines: number;
  supportedLanguages: string[];
  binaryFileExtensions: string[];
}

/**
 * 解析后的 Diff 行信息
 */
interface ParsedDiffLine {
  type: CodeLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * 解析后的文件头信息
 */
interface ParsedFileHeader {
  oldPath: string;
  newPath: string;
  changeType: FileChangeType;
  oldMode?: string;
  newMode?: string;
  isBinary: boolean;
}

/**
 * Diff 解析器类
 * 负责解析 Git diff 格式，提取文件变更信息，识别编程语言
 */
export class DiffParser {
  private readonly config: DiffParserConfig;
  private readonly parserLogger = logger.child({ service: 'DiffParser' });

  constructor(config?: Partial<DiffParserConfig>) {
    this.config = {
      maxLinesPerBatch: 10000,
      contextLines: 5,
      supportedLanguages: [
        'typescript', 'javascript', 'python', 'java', 'kotlin', 'swift',
        'go', 'rust', 'cpp', 'c', 'csharp', 'php', 'ruby', 'scala',
        'shell', 'sql', 'html', 'css', 'scss', 'less', 'json', 'xml',
        'yaml', 'markdown'
      ],
      binaryFileExtensions: [
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'zip', 'tar', 'gz', 'rar', '7z',
        'exe', 'dll', 'so', 'dylib',
        'mp3', 'mp4', 'avi', 'mov', 'wav',
        'ttf', 'otf', 'woff', 'woff2'
      ],
      ...config,
    };

    this.parserLogger.debug('Diff parser initialized', {
      maxLinesPerBatch: this.config.maxLinesPerBatch,
      contextLines: this.config.contextLines,
      supportedLanguages: this.config.supportedLanguages.length,
    });
  }

  /**
   * 解析完整的 diff 字符串
   * @param diffText - Git diff 文本
   * @param commitHash - 提交哈希值
   * @returns 解析后的差异信息
   */
  parseDiff(diffText: string, commitHash: string): DiffInfo {
    this.parserLogger.debug('Parsing diff', { commitHash, textLength: diffText.length });

    try {
      const files = this.parseFiles(diffText);
      
      const diffInfo: DiffInfo = {
        commitHash,
        files,
        totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
        totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
        totalFiles: files.length,
      };

      this.parserLogger.info('Diff parsed successfully', {
        commitHash,
        filesCount: diffInfo.totalFiles,
        additions: diffInfo.totalAdditions,
        deletions: diffInfo.totalDeletions,
      });

      return diffInfo;
    } catch (error) {
      this.parserLogger.error('Failed to parse diff', { commitHash, error });
      throw new Error(`Diff parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 过滤代码文件
   * @param files - 文件变更列表
   * @returns 代码文件列表
   */
  filterCodeFiles(files: FileChange[]): FileChange[] {
    const codeFiles = files.filter(file => {
      // 检查是否为二进制文件
      if (this.isBinaryFile(file.path)) {
        return false;
      }

      // 检查是否为支持的编程语言
      const language = this.detectLanguage(file.path);
      return this.config.supportedLanguages.includes(language);
    });

    this.parserLogger.debug('Filtered code files', {
      totalFiles: files.length,
      codeFiles: codeFiles.length,
      filteredOut: files.length - codeFiles.length,
    });

    return codeFiles;
  }

  /**
   * 拆分大型差异为多个批次
   * @param diff - 差异信息
   * @param maxLines - 每批次最大行数
   * @returns 差异批次列表
   */
  splitDiff(diff: DiffInfo, maxLines?: number): DiffBatch[] {
    const maxLinesPerBatch = maxLines || this.config.maxLinesPerBatch;
    const batches: DiffBatch[] = [];
    
    let currentBatch: FileChange[] = [];
    let currentLineCount = 0;
    let batchIndex = 0;

    for (const file of diff.files) {
      const fileLineCount = file.additions + file.deletions;
      
      // 如果单个文件就超过限制，单独成批
      if (fileLineCount > maxLinesPerBatch) {
        // 先处理当前批次
        if (currentBatch.length > 0) {
          batches.push(this.createDiffBatch(currentBatch, currentLineCount, batchIndex++, 0));
          currentBatch = [];
          currentLineCount = 0;
        }
        
        // 单个大文件成批
        batches.push(this.createDiffBatch([file], fileLineCount, batchIndex++, 0));
        continue;
      }
      
      // 检查是否需要开始新批次
      if (currentLineCount + fileLineCount > maxLinesPerBatch && currentBatch.length > 0) {
        batches.push(this.createDiffBatch(currentBatch, currentLineCount, batchIndex++, 0));
        currentBatch = [];
        currentLineCount = 0;
      }
      
      currentBatch.push(file);
      currentLineCount += fileLineCount;
    }

    // 处理最后一个批次
    if (currentBatch.length > 0) {
      batches.push(this.createDiffBatch(currentBatch, currentLineCount, batchIndex++, 0));
    }

    // 更新总批次数
    const totalBatches = batches.length;
    batches.forEach((batch, index) => {
      batch.totalBatches = totalBatches;
    });

    this.parserLogger.info('Diff split into batches', {
      commitHash: diff.commitHash,
      totalFiles: diff.files.length,
      totalBatches: batches.length,
      maxLinesPerBatch,
    });

    return batches;
  }

  /**
   * 提取代码上下文
   * @param patch - 文件补丁内容
   * @param targetLine - 目标行号
   * @param contextLines - 上下文行数
   * @returns 代码块信息
   */
  extractContext(patch: string, targetLine: number, contextLines?: number): CodeBlock | null {
    const lines = this.parsePatchLines(patch);
    const context = contextLines || this.config.contextLines;
    
    // 找到目标行
    const targetIndex = lines.findIndex(line => 
      line.newLineNumber === targetLine || line.oldLineNumber === targetLine
    );
    
    if (targetIndex === -1) {
      return null;
    }
    
    // 提取上下文
    const startIndex = Math.max(0, targetIndex - context);
    const endIndex = Math.min(lines.length - 1, targetIndex + context);
    const contextLinesSlice = lines.slice(startIndex, endIndex + 1);
    
    const startLine = contextLinesSlice[0]?.newLineNumber || contextLinesSlice[0]?.oldLineNumber || 1;
    const endLine = contextLinesSlice[contextLinesSlice.length - 1]?.newLineNumber || 
                   contextLinesSlice[contextLinesSlice.length - 1]?.oldLineNumber || startLine;
    
    return {
      startLine,
      endLine,
      lines: contextLinesSlice.map(line => ({
        number: line.newLineNumber || line.oldLineNumber || 0,
        content: line.content,
        type: line.type,
      })),
      language: 'text', // 需要从文件路径推断
      filePath: '', // 需要从外部传入
    };
  }

  /**
   * 检测文件编程语言
   * @param filePath - 文件路径
   * @returns 编程语言标识
   */
  detectLanguage(filePath: string): string {
    const extension = this.getFileExtension(filePath);
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'mjs': 'javascript',
      'cjs': 'javascript',
      'py': 'python',
      'pyx': 'python',
      'pyi': 'python',
      'java': 'java',
      'kt': 'kotlin',
      'kts': 'kotlin',
      'swift': 'swift',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'cxx': 'cpp',
      'cc': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'scala': 'scala',
      'sc': 'scala',
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      'fish': 'shell',
      'sql': 'sql',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'scss',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'markdown': 'markdown',
      'dockerfile': 'dockerfile',
      'vue': 'vue',
      'svelte': 'svelte',
    };

    // 特殊文件名处理
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    if (fileName === 'dockerfile' || fileName.startsWith('dockerfile.')) {
      return 'dockerfile';
    }
    if (fileName === 'makefile' || fileName.startsWith('makefile.')) {
      return 'makefile';
    }

    return languageMap[extension] || 'text';
  }

  /**
   * 检查是否为二进制文件
   * @param filePath - 文件路径
   * @returns 是否为二进制文件
   */
  isBinaryFile(filePath: string): boolean {
    const extension = this.getFileExtension(filePath);
    return this.config.binaryFileExtensions.includes(extension);
  }

  /**
   * 解析文件列表
   * @param diffText - Diff 文本
   * @returns 文件变更列表
   */
  private parseFiles(diffText: string): FileChange[] {
    const files: FileChange[] = [];
    const fileSections = this.splitIntoFileSections(diffText);

    for (const section of fileSections) {
      try {
        const file = this.parseFileSection(section);
        if (file) {
          files.push(file);
        }
      } catch (error) {
        this.parserLogger.warn('Failed to parse file section', { error });
        // 继续处理其他文件，不中断整个解析过程
      }
    }

    return files;
  }

  /**
   * 将 diff 文本分割为文件段落
   * @param diffText - Diff 文本
   * @returns 文件段落列表
   */
  private splitIntoFileSections(diffText: string): string[] {
    const sections: string[] = [];
    const lines = diffText.split('\n');
    let currentSection: string[] = [];

    for (const line of lines) {
      // 检查是否为新文件的开始
      if (line.startsWith('diff --git ') && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      currentSection.push(line);
    }

    // 添加最后一个段落
    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
    }

    return sections;
  }

  /**
   * 解析单个文件段落
   * @param section - 文件段落文本
   * @returns 文件变更信息
   */
  private parseFileSection(section: string): FileChange | null {
    const lines = section.split('\n');
    
    // 解析文件头
    const header = this.parseFileHeader(lines);
    if (!header) {
      return null;
    }

    // 解析补丁内容
    const patch = this.extractPatchContent(lines);
    const { additions, deletions } = this.countChanges(patch);

    const fileChange: FileChange = {
      path: header.newPath,
      previousPath: header.oldPath !== header.newPath ? header.oldPath : undefined,
      type: header.changeType,
      language: this.detectLanguage(header.newPath),
      additions,
      deletions,
      patch,
    };

    return fileChange;
  }

  /**
   * 解析文件头信息
   * @param lines - 文件段落行
   * @returns 解析后的文件头信息
   */
  private parseFileHeader(lines: string[]): ParsedFileHeader | null {
    let oldPath = '';
    let newPath = '';
    let changeType: FileChangeType = 'modified';
    let oldMode: string | undefined;
    let newMode: string | undefined;
    let isBinary = false;

    for (const line of lines) {
      // diff --git a/path b/path
      if (line.startsWith('diff --git ')) {
        const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
        if (match) {
          oldPath = match[1];
          newPath = match[2];
        }
      }
      // new file mode
      else if (line.startsWith('new file mode ')) {
        changeType = 'added';
        newMode = line.substring('new file mode '.length);
      }
      // deleted file mode
      else if (line.startsWith('deleted file mode ')) {
        changeType = 'deleted';
        oldMode = line.substring('deleted file mode '.length);
      }
      // rename from/to
      else if (line.startsWith('rename from ')) {
        changeType = 'renamed';
        oldPath = line.substring('rename from '.length);
      }
      else if (line.startsWith('rename to ')) {
        newPath = line.substring('rename to '.length);
      }
      // old mode/new mode
      else if (line.startsWith('old mode ')) {
        oldMode = line.substring('old mode '.length);
      }
      else if (line.startsWith('new mode ')) {
        newMode = line.substring('new mode '.length);
      }
      // Binary files differ
      else if (line.includes('Binary files') && line.includes('differ')) {
        isBinary = true;
      }
      // --- a/path 或 +++ b/path
      else if (line.startsWith('--- ')) {
        const path = line.substring(4);
        if (path.startsWith('a/')) {
          oldPath = path.substring(2);
        } else if (path === '/dev/null') {
          changeType = 'added';
        }
      }
      else if (line.startsWith('+++ ')) {
        const path = line.substring(4);
        if (path.startsWith('b/')) {
          newPath = path.substring(2);
        } else if (path === '/dev/null') {
          changeType = 'deleted';
        }
      }
    }

    if (!oldPath && !newPath) {
      return null;
    }

    return {
      oldPath: oldPath || newPath,
      newPath: newPath || oldPath,
      changeType,
      oldMode,
      newMode,
      isBinary,
    };
  }

  /**
   * 提取补丁内容
   * @param lines - 文件段落行
   * @returns 补丁内容
   */
  private extractPatchContent(lines: string[]): string {
    const patchLines: string[] = [];
    let inPatch = false;

    for (const line of lines) {
      // 开始补丁内容的标志
      if (line.startsWith('@@')) {
        inPatch = true;
      }
      
      if (inPatch) {
        patchLines.push(line);
      }
    }

    return patchLines.join('\n');
  }

  /**
   * 统计变更行数
   * @param patch - 补丁内容
   * @returns 添加和删除的行数
   */
  private countChanges(patch: string): { additions: number; deletions: number } {
    const lines = patch.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    return { additions, deletions };
  }

  /**
   * 解析补丁行
   * @param patch - 补丁内容
   * @returns 解析后的行信息
   */
  private parsePatchLines(patch: string): ParsedDiffLine[] {
    const lines = patch.split('\n');
    const parsedLines: ParsedDiffLine[] = [];
    let oldLineNumber = 0;
    let newLineNumber = 0;

    for (const line of lines) {
      // 解析 @@ -oldStart,oldCount +newStart,newCount @@ 格式
      if (line.startsWith('@@')) {
        const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNumber = parseInt(match[1]) - 1;
          newLineNumber = parseInt(match[2]) - 1;
        }
        continue;
      }

      let type: CodeLineType;
      let content = line;

      if (line.startsWith('+')) {
        type = 'added';
        content = line.substring(1);
        newLineNumber++;
      } else if (line.startsWith('-')) {
        type = 'deleted';
        content = line.substring(1);
        oldLineNumber++;
      } else {
        type = 'unchanged';
        content = line.startsWith(' ') ? line.substring(1) : line;
        oldLineNumber++;
        newLineNumber++;
      }

      parsedLines.push({
        type,
        content,
        oldLineNumber: type !== 'added' ? oldLineNumber : undefined,
        newLineNumber: type !== 'deleted' ? newLineNumber : undefined,
      });
    }

    return parsedLines;
  }

  /**
   * 创建差异批次
   * @param files - 文件列表
   * @param lineCount - 行数
   * @param batchIndex - 批次索引
   * @param totalBatches - 总批次数
   * @returns 差异批次
   */
  private createDiffBatch(
    files: FileChange[], 
    lineCount: number, 
    batchIndex: number, 
    totalBatches: number
  ): DiffBatch {
    return {
      id: `batch-${batchIndex}`,
      files,
      lineCount,
      batchIndex,
      totalBatches,
    };
  }

  /**
   * 获取文件扩展名
   * @param filePath - 文件路径
   * @returns 文件扩展名（小写）
   */
  private getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }
}

/**
 * 创建 Diff 解析器实例
 * @param config - 解析器配置
 * @returns Diff 解析器实例
 */
export function createDiffParser(config?: Partial<DiffParserConfig>): DiffParser {
  return new DiffParser(config);
}

/**
 * 默认 Diff 解析器实例
 */
export const diffParser = createDiffParser();