import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConcurrencyController } from '@/lib/utils/concurrency-control';
import { EnhancedRateLimiter } from '@/lib/utils/rate-limit-enhanced';
import { BackpressureController } from '@/lib/utils/backpressure';
import RedisClient from '@/lib/cache/redis-client';

// Mock Redis客户端
vi.mock('@/lib/cache/redis-client', () => ({
  default: {
    getInstance: vi.fn(() => ({
      scard: vi.fn(() => 0),
      sadd: vi.fn(() => 1),
      srem: vi.fn(() => 1),
      sismember: vi.fn(() => 0),
      hmset: vi.fn(() => 'OK'),
      hmget: vi.fn(() => []),
      del: vi.fn(() => 1),
      expire: vi.fn(() => 1),
      pipeline: vi.fn(() => ({
        exec: vi.fn(() => [[null, 1], [null, 'OK']]),
        sadd: vi.fn(),
        hmset: vi.fn(),
        hincrby: vi.fn(),
        hset: vi.fn(),
        srem: vi.fn(),
        zadd: vi.fn(),
        zrem: vi.fn(),
        zrange: vi.fn(() => []),
        zcard: vi.fn(() => 0),
        zrank: vi.fn(() => 0),
        incr: vi.fn(),
        setex: vi.fn(),
        get: vi.fn(() => null),
        keys: vi.fn(() => []),
      })),
    })),
  },
}));

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('并发控制测试', () => {
  let concurrencyController: ConcurrencyController;

  beforeEach(() => {
    vi.clearAllMocks();
    concurrencyController = new ConcurrencyController('test', {
      maxConcurrency: 3,
      acquireTimeout: 5000,
      lockExpiration: 10000,
      maxQueueSize: 10,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该能够获取执行权限', async () => {
    const result = await concurrencyController.acquire('task-1');
    
    expect(result.acquired).toBe(true);
    expect(result.currentConcurrency).toBe(1);
  });

  it('应该能够释放执行权限', async () => {
    await concurrencyController.acquire('task-1');
    await concurrencyController.release('task-1');
    
    // 验证Redis操作被调用
    const redisInstance = await RedisClient.getInstance();
    expect(redisInstance.srem).toHaveBeenCalled();
  });

  it('应该在超过最大并发数时加入队列', async () => {
    // Mock Redis返回当前并发数已达上限
    const redisInstance = await RedisClient.getInstance();
    vi.mocked(redisInstance.scard).mockResolvedValue(3);
    
    const result = await concurrencyController.acquire('task-4');
    
    expect(result.acquired).toBe(false);
    expect(result.queueLength).toBeGreaterThan(0);
  });

  it('应该能够获取并发控制状态', async () => {
    const status = await concurrencyController.getStatus();
    
    expect(status).toHaveProperty('activeTasks');
    expect(status).toHaveProperty('queueLength');
    expect(status).toHaveProperty('maxConcurrency');
  });
});

describe('速率限制测试', () => {
  let rateLimiter: EnhancedRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter = new EnhancedRateLimiter('test', {
      windowMs: 60000,
      maxRequests: 10,
      keyGenerator: (id: string) => `test:${id}`,
    });
  });

  it('应该允许在限制范围内的请求', async () => {
    const result = await rateLimiter.checkLimit('user-1');
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(10);
  });

  it('应该拒绝超过限制的请求', async () => {
    // Mock Redis返回已达到限制
    const redisInstance = await RedisClient.getInstance();
    vi.mocked(redisInstance.get).mockResolvedValue('10');
    
    const result = await rateLimiter.checkLimit('user-1');
    
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('应该能够重置限制', async () => {
    await rateLimiter.reset('user-1');
    
    const redisInstance = await RedisClient.getInstance();
    expect(redisInstance.keys).toHaveBeenCalled();
  });

  it('应该能够获取限制状态', async () => {
    const status = await rateLimiter.getStatus('user-1');
    
    expect(status).toHaveProperty('current');
    expect(status).toHaveProperty('limit');
    expect(status).toHaveProperty('remaining');
    expect(status).toHaveProperty('resetTime');
  });
});

describe('背压控制测试', () => {
  let backpressureController: BackpressureController<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    backpressureController = new BackpressureController('test', {
      highWaterMark: 5,
      lowWaterMark: 2,
      maxQueueSize: 10,
      checkInterval: 1000,
      recoveryDelay: 2000,
      dropStrategy: 'oldest',
    });
  });

  afterEach(() => {
    backpressureController.stop();
  });

  it('应该能够添加项目到队列', async () => {
    const result = await backpressureController.enqueue('test-item');
    
    expect(result).toBe(true);
    expect(backpressureController.getQueueLength()).toBe(1);
  });

  it('应该能够从队列中获取项目', async () => {
    await backpressureController.enqueue('test-item');
    const item = await backpressureController.dequeue();
    
    expect(item).toBe('test-item');
    expect(backpressureController.getQueueLength()).toBe(0);
  });

  it('应该在队列满时拒绝新项目', async () => {
    // 填满队列
    for (let i = 0; i < 10; i++) {
      await backpressureController.enqueue(`item-${i}`);
    }
    
    // 尝试添加第11个项目
    const result = await backpressureController.enqueue('overflow-item');
    
    expect(result).toBe(false);
  });

  it('应该能够获取背压统计信息', () => {
    const stats = backpressureController.getStats();
    
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('queueLength');
    expect(stats).toHaveProperty('processingRate');
    expect(stats).toHaveProperty('droppedItems');
  });

  it('应该能够清空队列', () => {
    backpressureController.enqueue('item-1');
    backpressureController.enqueue('item-2');
    
    backpressureController.clear();
    
    expect(backpressureController.getQueueLength()).toBe(0);
  });
});

describe('集成测试', () => {
  it('应该能够协同工作', async () => {
    const concurrency = new ConcurrencyController('integration', {
      maxConcurrency: 2,
      acquireTimeout: 1000,
      lockExpiration: 5000,
      maxQueueSize: 5,
    });

    const rateLimit = new EnhancedRateLimiter('integration', {
      windowMs: 10000,
      maxRequests: 5,
      keyGenerator: (id: string) => `integration:${id}`,
    });

    // 测试正常流程
    const rateLimitResult = await rateLimit.checkLimit('user-1');
    expect(rateLimitResult.allowed).toBe(true);

    const concurrencyResult = await concurrency.acquire('task-1');
    expect(concurrencyResult.acquired).toBe(true);

    await concurrency.release('task-1');
  });
});