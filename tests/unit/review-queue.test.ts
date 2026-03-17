import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { ReviewQueue, PRIORITY } from '@/lib/queue/review-queue';
import { RedisUtils } from '@/lib/cache/redis-utils';
import RedisClient from '@/lib/cache/redis-client';
import { CommitInfo } from '@/types/git';

// Mock Redis 客户端
vi.mock('@/lib/cache/redis-client', () => ({
  default: {
    pipeline: vi.fn(),
    executeCommand: vi.fn(),
  },
}));
vi.mock('@/lib/cache/redis-utils', () => ({
  RedisUtils: {
    sortedSetCount: vi.fn(),
    sortedSetRangeByScore: vi.fn(),
    hashGetAll: vi.fn(),
    setMembers: vi.fn(),
    hashGet: vi.fn(),
    expireCache: vi.fn(),
  },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe('ReviewQueue', () => {
  let queue: ReviewQueue;
  let mockCommit: CommitInfo;

  beforeAll(() => {
    // 设置 Redis 工具函数的模拟
    const mockRedisUtils = vi.mocked(RedisUtils);
    const mockRedisClient = vi.mocked(RedisClient);
    
    mockRedisUtils.sortedSetCount.mockResolvedValue(0);
    mockRedisUtils.sortedSetRangeByScore.mockResolvedValue([]);
    mockRedisUtils.hashGetAll.mockResolvedValue({});
    mockRedisUtils.setMembers.mockResolvedValue([]);
    mockRedisUtils.hashGet.mockResolvedValue(null);
    
    mockRedisClient.pipeline.mockResolvedValue([1, 'OK', 1, 'OK']);
  });

  beforeEach(() => {
    queue = new ReviewQueue();
    mockCommit = {
      hash: 'abc123def456',
      branch: 'uat',
      repository: 'test-repo',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
      message: 'Fix critical security issue',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      url: 'https://github.com/test/repo/commit/abc123def456',
    };

    // 重置所有模拟
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('enqueue', () => {
    it('应该成功将任务加入队列', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      
      mockRedisUtils.sortedSetCount.mockResolvedValue(0);
      mockRedisClient.pipeline.mockResolvedValue([1, 'OK', 1, 'OK']);

      const taskId = await queue.enqueue(mockCommit);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      expect(RedisUtils.sortedSetCount).toHaveBeenCalledWith('review:queue:tasks');
      expect(RedisClient.pipeline).toHaveBeenCalled();
    });

    it('应该根据提交信息计算正确的优先级', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(0);
      mockRedisClient.pipeline.mockResolvedValue([1, 'OK', 1, 'OK']);

      const criticalCommit = { ...mockCommit, message: 'Critical security fix' };
      await queue.enqueue(criticalCommit);

      const pipelineCall = mockRedisClient.pipeline.mock.calls[0][0];
      const zaddCommand = pipelineCall.find(cmd => cmd[0] === 'zadd');
      expect(zaddCommand).toBeDefined();
      
      const score = zaddCommand![2] as number;
      expect(score).toBeGreaterThan(PRIORITY.CRITICAL);
    });

    it('应该拒绝队列已满的情况', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(1000);

      await expect(queue.enqueue(mockCommit)).rejects.toThrow('队列已满');
      expect(RedisClient.pipeline).not.toHaveBeenCalled();
    });

    it('应该跳过重复的提交', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(1);
      mockRedisUtils.sortedSetRangeByScore.mockResolvedValue(['existing-task-id']);
      mockRedisUtils.hashGet.mockResolvedValue('abc123def456');

      const taskId = await queue.enqueue(mockCommit);

      expect(taskId).toBe('existing-task-id');
      expect(RedisClient.pipeline).not.toHaveBeenCalled();
    });

    it('应该支持延迟执行', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(0);
      mockRedisClient.pipeline.mockResolvedValue([1, 'OK', 1, 'OK']);

      const delay = 300;
      await queue.enqueue(mockCommit, { delay });

      const pipelineCall = mockRedisClient.pipeline.mock.calls[0][0];
      const zaddCommand = pipelineCall.find(cmd => cmd[0] === 'zadd');
      const score = zaddCommand![2] as number;
      
      expect(score).toBeGreaterThan(PRIORITY.NORMAL);
    });
  });

  describe('dequeue', () => {
    it('应该返回 null 当队列为空时', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetRangeByScore.mockResolvedValue([]);

      const task = await queue.dequeue();

      expect(task).toBeNull();
      expect(RedisUtils.sortedSetRangeByScore).toHaveBeenCalledWith(
        'review:queue:tasks',
        '-inf',
        expect.any(Number),
        true
      );
    });

    it('应该成功出队并返回任务', async () => {
      const taskId = 'test-task-id';
      const mockTaskData = {
        id: taskId,
        commitHash: 'abc123def456',
        branch: 'uat',
        repository: 'test-repo',
        priority: '1000',
        retryCount: '0',
        maxRetries: '3',
        status: 'processing',
        createdAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:05:00.000Z',
      };

      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetRangeByScore.mockResolvedValue([taskId, '1000.123']);
      mockRedisClient.pipeline.mockResolvedValue([1, 1, 'OK', 'OK', -1, 1]);
      mockRedisUtils.hashGetAll.mockResolvedValue(mockTaskData);

      const task = await queue.dequeue();

      expect(task).toBeDefined();
      expect(task!.id).toBe(taskId);
      expect(task!.commitHash).toBe('abc123def456');
      expect(task!.status).toBe('processing');
      expect(task!.priority).toBe(1000);
      expect(task!.retryCount).toBe(0);

      expect(RedisClient.pipeline).toHaveBeenCalledWith([
        ['zrem', 'review:queue:tasks', taskId],
        ['sadd', 'review:processing', taskId],
        ['hset', `review:task:${taskId}`, 'status', 'processing'],
        ['hset', `review:task:${taskId}`, 'startedAt', expect.any(String)],
        ['hincrby', 'review:queue:stats', 'total', -1],
        ['hincrby', 'review:queue:stats', 'processing', 1],
      ]);
    });

    it('应该处理并发竞争情况', async () => {
      const taskId = 'test-task-id';
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.sortedSetRangeByScore
        .mockResolvedValueOnce([taskId, '1000.123'])
        .mockResolvedValueOnce([]);

      mockRedisClient.pipeline.mockResolvedValueOnce([0, 1, 'OK', 'OK', -1, 1]);

      const task = await queue.dequeue();

      expect(task).toBeNull();
      expect(RedisUtils.sortedSetRangeByScore).toHaveBeenCalledTimes(2);
    });
  });

  describe('length', () => {
    it('应该返回正确的队列长度', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(5);

      const length = await queue.length();

      expect(length).toBe(5);
      expect(RedisUtils.sortedSetCount).toHaveBeenCalledWith('review:queue:tasks');
    });

    it('应该处理 Redis 错误', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockRejectedValue(new Error('Redis error'));

      await expect(queue.length()).rejects.toThrow('Redis error');
    });
  });

  describe('complete', () => {
    it('应该成功标记任务完成', async () => {
      const taskId = 'test-task-id';
      const result = { reviewId: 'review-123', issuesFound: 5 };
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisClient.pipeline.mockResolvedValue([1, 1, 'OK', -1, 1, 'OK']);
      mockRedisUtils.expireCache.mockResolvedValue(true);

      await queue.complete(taskId, result);

      expect(RedisClient.pipeline).toHaveBeenCalledWith([
        ['srem', 'review:processing', taskId],
        ['sadd', 'review:completed', taskId],
        ['hmset', `review:task:${taskId}`,
          'status', 'completed',
          'completedAt', expect.any(String),
          'result', JSON.stringify(result)
        ],
        ['hincrby', 'review:queue:stats', 'processing', -1],
        ['hincrby', 'review:queue:stats', 'completed', 1],
        ['hset', 'review:queue:stats', 'lastCompleted', expect.any(String)],
      ]);

      expect(RedisUtils.expireCache).toHaveBeenCalledWith(
        `review:task:${taskId}`,
        7 * 24 * 3600
      );
    });

    it('应该处理没有结果的完成情况', async () => {
      const taskId = 'test-task-id';
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisClient.pipeline.mockResolvedValue([1, 1, 'OK', -1, 1, 'OK']);
      mockRedisUtils.expireCache.mockResolvedValue(true);

      await queue.complete(taskId);

      const pipelineCall = mockRedisClient.pipeline.mock.calls[0][0];
      const hmsetCommand = pipelineCall.find(cmd => cmd[0] === 'hmset');
      
      // hmset 使用扁平化参数：['hmset', key, field1, value1, field2, value2, ...]
      expect(hmsetCommand![2]).toBe('status');
      expect(hmsetCommand![3]).toBe('completed');
      expect(hmsetCommand![4]).toBe('completedAt');
      expect(hmsetCommand![5]).toBeDefined();
      expect(hmsetCommand![6]).toBe('result');
      expect(hmsetCommand![7]).toBe('');
    });
  });

  describe('fail', () => {
    it('应该重试失败的任务', async () => {
      const taskId = 'test-task-id';
      const error = new Error('Processing failed');
      const mockTaskData = {
        id: taskId,
        retryCount: '1',
        maxRetries: '3',
        priority: '500',
      };
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.hashGetAll.mockResolvedValue(mockTaskData);
      mockRedisClient.pipeline.mockResolvedValue([1, 1, 'OK', -1, 1]);

      await queue.fail(taskId, error);

      expect(RedisClient.pipeline).toHaveBeenCalledWith([
        ['srem', 'review:processing', taskId],
        ['zadd', 'review:queue:tasks', expect.any(Number), taskId],
        ['hmset', `review:task:${taskId}`,
          'status', 'queued',
          'retryCount', '2',
          'lastError', 'Processing failed',
          'lastFailedAt', expect.any(String),
          'executeAt', expect.any(String)
        ],
        ['hincrby', 'review:queue:stats', 'processing', -1],
        ['hincrby', 'review:queue:stats', 'total', 1],
      ]);
    });

    it('应该最终失败超过最大重试次数的任务', async () => {
      const taskId = 'test-task-id';
      const error = new Error('Processing failed');
      const mockTaskData = {
        id: taskId,
        retryCount: '3',
        maxRetries: '3',
        priority: '500',
      };
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.hashGetAll.mockResolvedValue(mockTaskData);
      mockRedisClient.pipeline.mockResolvedValue([1, 1, 'OK', -1, 1, 'OK']);
      mockRedisUtils.expireCache.mockResolvedValue(true);

      await queue.fail(taskId, error);

      expect(RedisClient.pipeline).toHaveBeenCalledWith([
        ['srem', 'review:processing', taskId],
        ['sadd', 'review:failed', taskId],
        ['hmset', `review:task:${taskId}`,
          'status', 'failed',
          'retryCount', '4',
          'finalError', 'Processing failed',
          'failedAt', expect.any(String)
        ],
        ['hincrby', 'review:queue:stats', 'processing', -1],
        ['hincrby', 'review:queue:stats', 'failed', 1],
        ['hset', 'review:queue:stats', 'lastFailed', expect.any(String)],
      ]);

      expect(RedisUtils.expireCache).toHaveBeenCalledWith(
        `review:task:${taskId}`,
        30 * 24 * 3600
      );
    });

    it('应该处理任务不存在的情况', async () => {
      const taskId = 'non-existent-task';
      const error = new Error('Processing failed');
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.hashGetAll.mockResolvedValue({});

      await expect(queue.fail(taskId, error)).rejects.toThrow('任务不存在');
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      const mockStats = {
        total: '10',
        processing: '2',
        completed: '100',
        failed: '5',
        lastCompleted: '1704110400000',
      };
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.hashGetAll.mockResolvedValue(mockStats);

      const stats = await queue.getStats();

      expect(stats).toEqual({
        total: 10,
        processing: 2,
        completed: 100,
        failed: 5,
        lastProcessed: new Date(1704110400000),
      });
    });

    it('应该处理空统计信息', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.hashGetAll.mockResolvedValue({});

      const stats = await queue.getStats();

      expect(stats).toEqual({
        total: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        lastProcessed: undefined,
      });
    });
  });

  describe('getTask', () => {
    it('应该返回任务详情', async () => {
      const taskId = 'test-task-id';
      const mockTaskData = {
        id: taskId,
        commitHash: 'abc123def456',
        branch: 'uat',
        repository: 'test-repo',
        priority: '1000',
        retryCount: '1',
        maxRetries: '3',
        status: 'processing',
        createdAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:05:00.000Z',
        lastError: 'Previous error',
      };
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);

      mockRedisUtils.hashGetAll.mockResolvedValue(mockTaskData);

      const task = await queue.getTask(taskId);

      expect(task).toBeDefined();
      expect(task!.id).toBe(taskId);
      expect(task!.commitHash).toBe('abc123def456');
      expect(task!.priority).toBe(1000);
      expect(task!.retryCount).toBe(1);
      expect(task!.errorMessage).toBe('Previous error');
    });

    it('应该返回 null 当任务不存在时', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.hashGetAll.mockResolvedValue({});

      const task = await queue.getTask('non-existent');

      expect(task).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('应该清理过期的已完成任务', async () => {
      const oldTaskId = 'old-completed-task';
      const recentTaskId = 'recent-completed-task';
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      
      // 模拟已完成任务列表
      mockRedisUtils.setMembers
        .mockResolvedValueOnce([oldTaskId, recentTaskId])
        .mockResolvedValueOnce([]); // 失败任务列表为空

      // 模拟任务时间戳：old task 是 24 小时前，recent task 是 1 小时前
      const now = Date.now();
      const oldTime = new Date(now - 25 * 3600 * 1000).toISOString(); // 25小时前
      const recentTime = new Date(now - 1 * 3600 * 1000).toISOString(); // 1小时前
      
      mockRedisUtils.hashGet
        .mockResolvedValueOnce(oldTime)
        .mockResolvedValueOnce(recentTime);

      mockRedisClient.pipeline.mockResolvedValue([1, 1]);

      const result = await queue.cleanup(24); // 清理24小时前的任务

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
      expect(RedisClient.pipeline).toHaveBeenCalledWith([
        ['srem', 'review:completed', oldTaskId],
        ['del', `review:task:${oldTaskId}`],
      ]);
    });

    it('应该处理清理过程中的错误', async () => {
      const taskId = 'error-task';
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      
      mockRedisUtils.setMembers
        .mockResolvedValueOnce([taskId])
        .mockResolvedValueOnce([]);

      mockRedisUtils.hashGet.mockRejectedValue(new Error('Redis error'));

      const result = await queue.cleanup(1);

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('优先级计算', () => {
    it('应该为关键词分配正确的优先级', async () => {
      const mockRedisUtils = vi.mocked(RedisUtils);
      const mockRedisClient = vi.mocked(RedisClient);
      mockRedisUtils.sortedSetCount.mockResolvedValue(0);
      mockRedisClient.pipeline.mockResolvedValue([1, 'OK', 1, 'OK']);

      const testCases = [
        { message: 'Critical security vulnerability', expectedPriority: PRIORITY.CRITICAL },
        { message: 'Urgent hotfix needed', expectedPriority: PRIORITY.CRITICAL },
        { message: 'Fix bug in authentication', expectedPriority: PRIORITY.HIGH },
        { message: 'Add new feature', expectedPriority: PRIORITY.NORMAL },
        { message: 'Refactor code structure', expectedPriority: PRIORITY.LOW },
      ];

      for (const testCase of testCases) {
        const commit = { ...mockCommit, message: testCase.message };
        await queue.enqueue(commit);

        const pipelineCall = mockRedisClient.pipeline.mock.calls.slice(-1)[0][0];
        const zaddCommand = pipelineCall.find(cmd => cmd[0] === 'zadd');
        const score = zaddCommand![2] as number;

        // 分数应该大于基础优先级
        expect(score).toBeGreaterThan(testCase.expectedPriority);
        
        // 验证分数在合理范围内（优先级 + 时间戳/1000000）
        const timePart = score - testCase.expectedPriority;
        expect(timePart).toBeGreaterThan(0);
        expect(timePart).toBeLessThan(2000000); // 时间戳/1000000 的合理范围
      }
    });
  });
});
