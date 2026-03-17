import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PollingScanner, createPollingScanner, PollingScannerConfig } from '@/lib/services/polling-scanner';
import { GitClient } from '@/lib/git/client';
import { commitTrackerRepository } from '@/lib/db/repositories/commit-tracker';
import { reviewQueue } from '@/lib/queue/review-queue';
import { CommitInfo } from '@/types/git';

// Mock 依赖
vi.mock('@/lib/db/repositories/commit-tracker');
vi.mock('@/lib/queue/review-queue');
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      performance: vi.fn(),
    }),
  },
}));

describe('PollingScanner', () => {
  let scanner: PollingScanner;
  let mockGitClient: GitClient;
  let config: PollingScannerConfig;

  // 测试数据
  const mockCommits: CommitInfo[] = [
    {
      hash: 'abc123',
      branch: 'uat',
      repository: 'owner/repo',
      author: { name: 'Test User', email: 'test@example.com' },
      message: 'Test commit 1',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      url: 'https://github.com/owner/repo/commit/abc123',
    },
    {
      hash: 'def456',
      branch: 'uat',
      repository: 'owner/repo',
      author: { name: 'Test User', email: 'test@example.com' },
      message: 'Test commit 2',
      timestamp: new Date('2024-01-01T11:00:00Z'),
      url: 'https://github.com/owner/repo/commit/def456',
    },
  ];

  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 创建 mock Git 客户端
    mockGitClient = {
      getCommits: vi.fn(),
      getCommit: vi.fn(),
      getDiff: vi.fn(),
      postComment: vi.fn(),
      postSummaryComment: vi.fn(),
      getBranch: vi.fn(),
      updateCommitStatus: vi.fn(),
    } as any;

    // 默认配置
    config = {
      repository: 'owner/repo',
      branch: 'uat',
      interval: 300,
      enabled: true,
      autoEnqueue: true,
      maxCommitsPerScan: 50,
    };

    scanner = new PollingScanner(config, mockGitClient);
  });

  afterEach(() => {
    // 确保停止扫描器
    scanner.stop();
  });

  describe('构造函数', () => {
    it('应该成功创建扫描器实例', () => {
      expect(scanner).toBeDefined();
      const status = scanner.getStatus();
      expect(status.config).toEqual(config);
      expect(status.isRunning).toBe(false);
      expect(status.scanCount).toBe(0);
    });

    it('应该拒绝无效的扫描间隔（小于30秒）', () => {
      expect(() => {
        new PollingScanner({ ...config, interval: 20 }, mockGitClient);
      }).toThrow('扫描间隔必须在 30-3600 秒之间');
    });

    it('应该拒绝无效的扫描间隔（大于3600秒）', () => {
      expect(() => {
        new PollingScanner({ ...config, interval: 4000 }, mockGitClient);
      }).toThrow('扫描间隔必须在 30-3600 秒之间');
    });

    it('应该接受有效的扫描间隔（边界值）', () => {
      expect(() => {
        new PollingScanner({ ...config, interval: 30 }, mockGitClient);
      }).not.toThrow();

      expect(() => {
        new PollingScanner({ ...config, interval: 3600 }, mockGitClient);
      }).not.toThrow();
    });
  });

  describe('start', () => {
    it('应该启动扫描器并立即执行一次扫描', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      scanner.start();

      // 等待初始扫描完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = scanner.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.scanCount).toBe(1);
      expect(mockGitClient.getCommits).toHaveBeenCalled();
    });

    it('应该在禁用时拒绝启动', () => {
      const disabledScanner = new PollingScanner(
        { ...config, enabled: false },
        mockGitClient
      );

      disabledScanner.start();

      const status = disabledScanner.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('应该拒绝重复启动', () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      scanner.start();
      scanner.start(); // 第二次启动

      const status = scanner.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('应该拒绝无效的扫描间隔参数', () => {
      expect(() => {
        scanner.start(20); // 小于 30
      }).toThrow('扫描间隔必须在 30-3600 秒之间');

      expect(() => {
        scanner.start(4000); // 大于 3600
      }).toThrow('扫描间隔必须在 30-3600 秒之间');
    });
  });

  describe('stop', () => {
    it('应该停止正在运行的扫描器', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      scanner.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      scanner.stop();

      const status = scanner.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('应该处理未运行时的停止调用', () => {
      expect(() => {
        scanner.stop();
      }).not.toThrow();
    });
  });

  describe('scan', () => {
    it('应该成功扫描并处理新提交', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue(mockCommits);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);
      vi.mocked(commitTrackerRepository.isTracked).mockResolvedValue(false);
      vi.mocked(reviewQueue.enqueue).mockResolvedValue('task-1');

      const result = await scanner.scan();

      expect(result.totalCommits).toBe(2);
      expect(result.newCommits).toBe(2);
      expect(result.processedCommits).toBe(2);
      expect(result.skippedCommits).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.taskIds).toHaveLength(2);
      expect(mockGitClient.getCommits).toHaveBeenCalledWith(
        config.repository,
        config.branch,
        expect.any(Date),
        config.maxCommitsPerScan
      );
    });

    it('应该跳过已处理的提交', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue(mockCommits);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue('abc123');
      vi.mocked(commitTrackerRepository.isTracked)
        .mockResolvedValueOnce(true)  // abc123 已处理
        .mockResolvedValueOnce(false); // def456 未处理
      vi.mocked(reviewQueue.enqueue).mockResolvedValue('task-1');

      const result = await scanner.scan();

      expect(result.totalCommits).toBe(2);
      expect(result.newCommits).toBe(1);
      expect(result.processedCommits).toBe(1);
      expect(result.skippedCommits).toBe(1);
      expect(result.taskIds).toHaveLength(1);
    });

    it('应该在未发现新提交时返回空结果', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      const result = await scanner.scan();

      expect(result.totalCommits).toBe(0);
      expect(result.newCommits).toBe(0);
      expect(result.processedCommits).toBe(0);
      expect(result.taskIds).toHaveLength(0);
    });

    it('应该在禁用自动入队时不加入队列', async () => {
      const noEnqueueScanner = new PollingScanner(
        { ...config, autoEnqueue: false },
        mockGitClient
      );

      vi.mocked(mockGitClient.getCommits).mockResolvedValue(mockCommits);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);
      vi.mocked(commitTrackerRepository.isTracked).mockResolvedValue(false);

      const result = await noEnqueueScanner.scan();

      expect(result.newCommits).toBe(2);
      expect(result.processedCommits).toBe(0);
      expect(result.taskIds).toHaveLength(0);
      expect(reviewQueue.enqueue).not.toHaveBeenCalled();
    });

    it('应该处理单个提交的错误并继续处理其他提交', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue(mockCommits);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);
      vi.mocked(commitTrackerRepository.isTracked).mockResolvedValue(false);
      vi.mocked(reviewQueue.enqueue)
        .mockRejectedValueOnce(new Error('入队失败'))
        .mockResolvedValueOnce('task-2');

      const result = await scanner.scan();

      expect(result.totalCommits).toBe(2);
      expect(result.newCommits).toBe(2);
      expect(result.processedCommits).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.taskIds).toHaveLength(1);
    });

    it('应该处理 Git API 错误', async () => {
      vi.mocked(mockGitClient.getCommits).mockRejectedValue(new Error('Git API 错误'));
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      const result = await scanner.scan();

      expect(result.errors).toBe(1);
      expect(result.totalCommits).toBe(0);
    });

    it('应该防止并发扫描', async () => {
      vi.mocked(mockGitClient.getCommits).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 1000))
      );
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      const scan1 = scanner.scan();
      const scan2 = scanner.scan(); // 应该被跳过

      const [result1, result2] = await Promise.all([scan1, scan2]);

      expect(result1.totalCommits).toBe(0);
      expect(result2.totalCommits).toBe(0);
      expect(mockGitClient.getCommits).toHaveBeenCalledTimes(1);
    });
  });

  describe('isProcessed', () => {
    it('应该正确检查提交是否已处理', async () => {
      vi.mocked(commitTrackerRepository.isTracked).mockResolvedValue(true);

      const result = await scanner.isProcessed('abc123');

      expect(result).toBe(true);
      expect(commitTrackerRepository.isTracked).toHaveBeenCalledWith('abc123');
    });

    it('应该在检查失败时返回 false', async () => {
      vi.mocked(commitTrackerRepository.isTracked).mockRejectedValue(
        new Error('数据库错误')
      );

      const result = await scanner.isProcessed('abc123');

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('应该返回正确的状态信息', () => {
      const status = scanner.getStatus();

      expect(status).toEqual({
        isRunning: false,
        isScanning: false,
        scanCount: 0,
        lastScanTime: null,
        config,
      });
    });

    it('应该在扫描后更新状态', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      await scanner.scan();

      const status = scanner.getStatus();
      expect(status.scanCount).toBe(1);
      expect(status.lastScanTime).not.toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('应该成功更新配置', () => {
      scanner.updateConfig({ interval: 600 });

      const status = scanner.getStatus();
      expect(status.config.interval).toBe(600);
    });

    it('应该拒绝无效的扫描间隔', () => {
      expect(() => {
        scanner.updateConfig({ interval: 20 });
      }).toThrow('扫描间隔必须在 30-3600 秒之间');

      // 配置应该保持不变
      const status = scanner.getStatus();
      expect(status.config.interval).toBe(300);
    });

    it('应该在禁用时停止运行中的扫描器', async () => {
      vi.mocked(mockGitClient.getCommits).mockResolvedValue([]);
      vi.mocked(commitTrackerRepository.getLastProcessed).mockResolvedValue(null);

      scanner.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      scanner.updateConfig({ enabled: false });

      const status = scanner.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('工厂函数', () => {
    it('createPollingScanner 应该创建扫描器实例', () => {
      const newScanner = createPollingScanner(config, mockGitClient);
      expect(newScanner).toBeInstanceOf(PollingScanner);
    });
  });
});
