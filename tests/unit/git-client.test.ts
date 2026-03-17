import { GitClient, createGitClientConfig } from '@/lib/git/client';
import { GitClientConfig } from '@/types/git';

// Mock fetch 全局函数
global.fetch = jest.fn();

describe('GitClient', () => {
  let gitClient: GitClient;
  let mockConfig: GitClientConfig;

  beforeEach(() => {
    mockConfig = {
      baseUrl: 'https://api.github.com',
      token: 'test-token',
      timeout: 30000,
      retryAttempts: 2,
      retryDelay: 1000,
    };
    gitClient = new GitClient(mockConfig);
    
    // 重置 fetch mock
    (fetch as jest.MockedFunction<typeof fetch>).mockReset();
  });

  describe('getCommit', () => {
    it('应该成功获取提交信息', async () => {
      const mockResponse = {
        sha: 'abc123',
        commit: {
          message: 'Test commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2024-01-01T00:00:00Z',
          },
        },
        html_url: 'https://github.com/owner/repo/commit/abc123',
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await gitClient.getCommit('abc123', 'owner/repo');

      expect(result).toEqual({
        hash: 'abc123',
        branch: '',
        repository: 'owner/repo',
        author: {
          name: 'Test User',
          email: 'test@example.com',
        },
        message: 'Test commit',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        url: 'https://github.com/owner/repo/commit/abc123',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/commits/abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('应该处理 API 错误', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Commit not found',
      } as Response);

      await expect(gitClient.getCommit('invalid', 'owner/repo')).rejects.toThrow(
        'Git API request failed: 404 Not Found - Commit not found'
      );
    });
  });

  describe('getDiff', () => {
    it('应该成功获取差异信息', async () => {
      const mockResponse = {
        sha: 'abc123',
        commit: {
          message: 'Test commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2024-01-01T00:00:00Z',
          },
        },
        html_url: 'https://github.com/owner/repo/commit/abc123',
        files: [
          {
            filename: 'src/test.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            patch: '@@ -1,3 +1,3 @@\n-old line\n+new line',
          },
        ],
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await gitClient.getDiff('abc123', 'owner/repo');

      expect(result).toEqual({
        commitHash: 'abc123',
        files: [
          {
            path: 'src/test.ts',
            previousPath: undefined,
            type: 'modified',
            language: 'typescript',
            additions: 10,
            deletions: 5,
            patch: '@@ -1,3 +1,3 @@\n-old line\n+new line',
          },
        ],
        totalAdditions: 10,
        totalDeletions: 5,
        totalFiles: 1,
      });
    });

    it('应该处理没有文件变更的提交', async () => {
      const mockResponse = {
        sha: 'abc123',
        commit: {
          message: 'Empty commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2024-01-01T00:00:00Z',
          },
        },
        html_url: 'https://github.com/owner/repo/commit/abc123',
        files: undefined,
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await gitClient.getDiff('abc123', 'owner/repo');

      expect(result).toEqual({
        commitHash: 'abc123',
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 0,
      });
    });
  });

  describe('postComment', () => {
    it('应该成功发布评论', async () => {
      const mockResponse = {
        id: 'comment-123',
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const comment = {
        id: 'test-comment',
        file: 'src/test.ts',
        line: 10,
        severity: 'major' as const,
        category: 'security',
        message: 'Potential security issue',
        suggestion: 'Add input validation',
      };

      const result = await gitClient.postComment('abc123', 'owner/repo', comment);

      expect(result).toEqual({
        success: true,
        commentId: 'comment-123',
        retryable: false,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/commits/abc123/comments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('Potential security issue'),
        })
      );
    });
  });

  describe('detectLanguage', () => {
    it('应该正确检测文件语言', () => {
      // 通过反射访问私有方法进行测试
      const detectLanguage = (gitClient as any).detectLanguage.bind(gitClient);

      expect(detectLanguage('test.ts')).toBe('typescript');
      expect(detectLanguage('test.js')).toBe('javascript');
      expect(detectLanguage('test.py')).toBe('python');
      expect(detectLanguage('test.java')).toBe('java');
      expect(detectLanguage('test.unknown')).toBe('text');
    });
  });

  describe('formatComment', () => {
    it('应该正确格式化评论', () => {
      // 通过反射访问私有方法进行测试
      const formatComment = (gitClient as any).formatComment.bind(gitClient);

      const comment = {
        id: 'test',
        file: 'test.ts',
        line: 1,
        severity: 'critical' as const,
        category: 'security',
        message: 'Critical issue',
        suggestion: 'Fix immediately',
        codeSnippet: 'const x = 1;',
      };

      const result = formatComment(comment);

      expect(result).toContain('🚨 **CRITICAL**: Critical issue');
      expect(result).toContain('**建议修改:**\nFix immediately');
      expect(result).toContain('**相关代码:**\n```\nconst x = 1;\n```');
      expect(result).toContain('*由 CodeReview 自动生成*');
    });
  });
});

describe('createGitClientConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('应该从环境变量创建配置', () => {
    process.env.GIT_ACCESS_TOKEN = 'test-token';
    process.env.GIT_API_BASE_URL = 'https://custom-git.com';
    process.env.GIT_TIMEOUT = '60000';

    const config = createGitClientConfig();

    expect(config).toEqual({
      baseUrl: 'https://custom-git.com',
      token: 'test-token',
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 1000,
    });
  });

  it('应该使用默认值', () => {
    process.env.GIT_ACCESS_TOKEN = 'test-token';

    const config = createGitClientConfig();

    expect(config).toEqual({
      baseUrl: 'https://api.github.com',
      token: 'test-token',
      timeout: 30000,
      retryAttempts: 2,
      retryDelay: 1000,
    });
  });

  it('应该在缺少 token 时抛出错误', () => {
    delete process.env.GIT_ACCESS_TOKEN;

    expect(() => createGitClientConfig()).toThrow(
      'GIT_ACCESS_TOKEN environment variable is required'
    );
  });
});