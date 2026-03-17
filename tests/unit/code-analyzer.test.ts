import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeAnalyzer } from '@/lib/services/code-analyzer';
import { GitClient } from '@/lib/git/client';
import { DiffParser } from '@/lib/git/diff-parser';
import { CommitInfo, DiffInfo, FileChange } from '@/types/git';

// Mock dependencies
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      performance: vi.fn(),
    })),
  },
}));

describe('CodeAnalyzer', () => {
  let codeAnalyzer: CodeAnalyzer;
  let mockGitClient: GitClient;
  let mockDiffParser: DiffParser;

  const mockCommit: CommitInfo = {
    hash: 'abc123',
    branch: 'uat',
    repository: 'owner/repo',
    author: {
      name: 'Test User',
      email: 'test@example.com',
    },
    message: 'Test commit',
    timestamp: new Date('2024-01-01'),
    url: 'https://github.com/owner/repo/commit/abc123',
  };

  const mockCodeFile: FileChange = {
    path: 'src/utils.ts',
    type: 'modified',
    language: 'typescript',
    additions: 10,
    deletions: 5,
    patch: '@@ -1,5 +1,10 @@\n-old line\n+new line',
  };

  const mockBinaryFile: FileChange = {
    path: 'assets/image.png',
    type: 'added',
    language: 'text',
    additions: 0,
    deletions: 0,
    patch: '',
  };

  const mockDiff: DiffInfo = {
    commitHash: 'abc123',
    files: [mockCodeFile, mockBinaryFile],
    totalAdditions: 10,
    totalDeletions: 5,
    totalFiles: 2,
  };

  beforeEach(() => {
    mockGitClient = {
      getDiff: vi.fn().mockResolvedValue(mockDiff),
    } as any;

    mockDiffParser = {
      filterCodeFiles: vi.fn().mockReturnValue([mockCodeFile]),
      splitDiff: vi.fn().mockReturnValue([
        {
          id: 'batch-0',
          files: [mockCodeFile],
          lineCount: 15,
          batchIndex: 0,
          totalBatches: 1,
        },
      ]),
      extractContext: vi.fn().mockReturnValue({
        startLine: 1,
        endLine: 10,
        lines: [
          { number: 1, content: 'old line', type: 'deleted' },
          { number: 2, content: 'new line', type: 'added' },
        ],
        language: 'typescript',
        filePath: 'src/utils.ts',
      }),
    } as any;

    codeAnalyzer = new CodeAnalyzer(mockGitClient, mockDiffParser);
  });

  describe('analyze', () => {
    it('应该成功分析代码变更', async () => {
      const result = await codeAnalyzer.analyze(mockCommit);

      expect(result).toBeDefined();
      expect(result.commit).toEqual(mockCommit);
      expect(result.diff).toBeDefined();
      expect(result.batches).toHaveLength(1);
      expect(result.codeFiles).toHaveLength(1);
      expect(result.nonCodeFiles).toHaveLength(1);
    });

    it('应该调用 getDiff 获取差异信息', async () => {
      await codeAnalyzer.analyze(mockCommit);

      expect(mockGitClient.getDiff).toHaveBeenCalledWith(
        mockCommit.hash,
        mockCommit.repository
      );
    });

    it('应该过滤非代码文件', async () => {
      const result = await codeAnalyzer.analyze(mockCommit);

      expect(mockDiffParser.filterCodeFiles).toHaveBeenCalledWith(mockDiff.files);
      expect(result.codeFiles).toEqual([mockCodeFile]);
      expect(result.nonCodeFiles).toEqual([mockBinaryFile]);
    });

    it('应该拆分大型差异', async () => {
      const result = await codeAnalyzer.analyze(mockCommit);

      expect(mockDiffParser.splitDiff).toHaveBeenCalled();
      expect(result.batches).toHaveLength(1);
    });

    it('当 getDiff 失败时应该抛出错误', async () => {
      const error = new Error('Git API error');
      vi.mocked(mockGitClient.getDiff).mockRejectedValue(error);

      await expect(codeAnalyzer.analyze(mockCommit)).rejects.toThrow(
        'Code analysis failed for commit abc123'
      );
    });
  });

  describe('getDiff', () => {
    it('应该成功获取差异信息', async () => {
      const result = await codeAnalyzer.getDiff('abc123', 'owner/repo');

      expect(result).toEqual(mockDiff);
      expect(mockGitClient.getDiff).toHaveBeenCalledWith('abc123', 'owner/repo');
    });

    it('当 Git 客户端失败时应该抛出错误', async () => {
      const error = new Error('Network error');
      vi.mocked(mockGitClient.getDiff).mockRejectedValue(error);

      await expect(codeAnalyzer.getDiff('abc123', 'owner/repo')).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('filterCodeFiles', () => {
    it('应该过滤掉非代码文件', () => {
      const files = [mockCodeFile, mockBinaryFile];
      const result = codeAnalyzer.filterCodeFiles(files);

      expect(mockDiffParser.filterCodeFiles).toHaveBeenCalledWith(files);
      expect(result).toEqual([mockCodeFile]);
    });

    it('应该返回空数组当没有代码文件时', () => {
      vi.mocked(mockDiffParser.filterCodeFiles).mockReturnValue([]);

      const result = codeAnalyzer.filterCodeFiles([mockBinaryFile]);

      expect(result).toEqual([]);
    });
  });

  describe('splitDiff', () => {
    it('当差异小于限制时应该返回单个批次', () => {
      const smallDiff: DiffInfo = {
        commitHash: 'abc123',
        files: [mockCodeFile],
        totalAdditions: 10,
        totalDeletions: 5,
        totalFiles: 1,
      };

      const result = codeAnalyzer.splitDiff(smallDiff, 10000);

      expect(result).toHaveLength(1);
      expect(result[0].files).toEqual([mockCodeFile]);
      expect(result[0].lineCount).toBe(15);
      expect(result[0].batchIndex).toBe(0);
      expect(result[0].totalBatches).toBe(1);
    });

    it('当差异超过限制时应该拆分为多个批次', () => {
      const largeDiff: DiffInfo = {
        commitHash: 'abc123',
        files: [mockCodeFile],
        totalAdditions: 6000,
        totalDeletions: 5000,
        totalFiles: 1,
      };

      vi.mocked(mockDiffParser.splitDiff).mockReturnValue([
        {
          id: 'batch-0',
          files: [mockCodeFile],
          lineCount: 5500,
          batchIndex: 0,
          totalBatches: 2,
        },
        {
          id: 'batch-1',
          files: [mockCodeFile],
          lineCount: 5500,
          batchIndex: 1,
          totalBatches: 2,
        },
      ]);

      const result = codeAnalyzer.splitDiff(largeDiff, 10000);

      expect(result).toHaveLength(2);
      expect(mockDiffParser.splitDiff).toHaveBeenCalledWith(largeDiff, 10000);
    });

    it('应该使用自定义的最大行数', () => {
      const diff: DiffInfo = {
        commitHash: 'abc123',
        files: [mockCodeFile],
        totalAdditions: 100,
        totalDeletions: 50,
        totalFiles: 1,
      };

      codeAnalyzer.splitDiff(diff, 5000);

      expect(mockDiffParser.splitDiff).toHaveBeenCalledWith(diff, 5000);
    });

    it('应该更新批次 ID 包含 commitHash', () => {
      const diff: DiffInfo = {
        commitHash: 'xyz789',
        files: [mockCodeFile],
        totalAdditions: 10,
        totalDeletions: 5,
        totalFiles: 1,
      };

      const result = codeAnalyzer.splitDiff(diff);

      expect(result[0].id).toBe('xyz789-batch-0');
    });
  });

  describe('extractContext', () => {
    it('应该成功提取代码上下文', () => {
      const result = codeAnalyzer.extractContext(mockCodeFile, 5, 3);

      expect(result).toBeDefined();
      expect(result).toContain('- old line');
      expect(result).toContain('+ new line');
      expect(mockDiffParser.extractContext).toHaveBeenCalledWith(
        mockCodeFile.patch,
        5,
        3
      );
    });

    it('当无法提取上下文时应该返回 null', () => {
      vi.mocked(mockDiffParser.extractContext).mockReturnValue(null);

      const result = codeAnalyzer.extractContext(mockCodeFile, 999);

      expect(result).toBeNull();
    });

    it('应该使用默认的上下文行数', () => {
      codeAnalyzer.extractContext(mockCodeFile, 5);

      expect(mockDiffParser.extractContext).toHaveBeenCalledWith(
        mockCodeFile.patch,
        5,
        5
      );
    });

    it('当解析失败时应该返回 null', () => {
      vi.mocked(mockDiffParser.extractContext).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = codeAnalyzer.extractContext(mockCodeFile, 5);

      expect(result).toBeNull();
    });
  });

  describe('getAnalysisStats', () => {
    it('应该返回正确的统计信息', () => {
      const analysisResult = {
        commit: mockCommit,
        diff: {
          commitHash: 'abc123',
          files: [mockCodeFile],
          totalAdditions: 10,
          totalDeletions: 5,
          totalFiles: 1,
        },
        batches: [
          {
            id: 'batch-0',
            files: [mockCodeFile],
            lineCount: 15,
            batchIndex: 0,
            totalBatches: 1,
          },
        ],
        codeFiles: [mockCodeFile],
        nonCodeFiles: [mockBinaryFile],
      };

      const stats = codeAnalyzer.getAnalysisStats(analysisResult);

      expect(stats.totalFiles).toBe(2);
      expect(stats.codeFiles).toBe(1);
      expect(stats.nonCodeFiles).toBe(1);
      expect(stats.totalAdditions).toBe(10);
      expect(stats.totalDeletions).toBe(5);
      expect(stats.totalBatches).toBe(1);
      expect(stats.languageDistribution).toEqual({ typescript: 1 });
      expect(stats.fileTypeDistribution).toEqual({ modified: 1 });
    });

    it('应该正确统计多种语言的分布', () => {
      const jsFile: FileChange = {
        path: 'src/app.js',
        type: 'added',
        language: 'javascript',
        additions: 20,
        deletions: 0,
        patch: '',
      };

      const analysisResult = {
        commit: mockCommit,
        diff: {
          commitHash: 'abc123',
          files: [mockCodeFile, jsFile],
          totalAdditions: 30,
          totalDeletions: 5,
          totalFiles: 2,
        },
        batches: [],
        codeFiles: [mockCodeFile, jsFile],
        nonCodeFiles: [],
      };

      const stats = codeAnalyzer.getAnalysisStats(analysisResult);

      expect(stats.languageDistribution).toEqual({
        typescript: 1,
        javascript: 1,
      });
    });

    it('应该正确统计文件变更类型分布', () => {
      const addedFile: FileChange = {
        path: 'src/new.ts',
        type: 'added',
        language: 'typescript',
        additions: 50,
        deletions: 0,
        patch: '',
      };

      const deletedFile: FileChange = {
        path: 'src/old.ts',
        type: 'deleted',
        language: 'typescript',
        additions: 0,
        deletions: 30,
        patch: '',
      };

      const analysisResult = {
        commit: mockCommit,
        diff: {
          commitHash: 'abc123',
          files: [mockCodeFile, addedFile, deletedFile],
          totalAdditions: 60,
          totalDeletions: 35,
          totalFiles: 3,
        },
        batches: [],
        codeFiles: [mockCodeFile, addedFile, deletedFile],
        nonCodeFiles: [],
      };

      const stats = codeAnalyzer.getAnalysisStats(analysisResult);

      expect(stats.fileTypeDistribution).toEqual({
        modified: 1,
        added: 1,
        deleted: 1,
      });
    });
  });

  describe('配置选项', () => {
    it('应该使用自定义配置', () => {
      const customAnalyzer = new CodeAnalyzer(mockGitClient, mockDiffParser, {
        maxLinesPerBatch: 5000,
        contextLines: 10,
        filterNonCodeFiles: false,
      });

      expect(customAnalyzer).toBeDefined();
    });

    it('当 filterNonCodeFiles 为 false 时不应该过滤文件', async () => {
      const noFilterAnalyzer = new CodeAnalyzer(mockGitClient, mockDiffParser, {
        filterNonCodeFiles: false,
      });

      const result = await noFilterAnalyzer.analyze(mockCommit);

      expect(mockDiffParser.filterCodeFiles).not.toHaveBeenCalled();
      expect(result.codeFiles).toEqual(mockDiff.files);
      expect(result.nonCodeFiles).toEqual([]);
    });
  });
});
