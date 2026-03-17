import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker, createHealthChecker } from '@/lib/services/health-checker';
import { db } from '@/lib/db/client';
import RedisClient from '@/lib/cache/redis-client';
import { createDefaultAIClient } from '@/lib/ai/client';
import type { HealthCheckConfig } from '@/types/health';

// Mock 依赖
vi.mock('@/lib/db/client');
vi.mock('@/lib/cache/redis-client');
vi.mock('@/lib/ai/client');
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    setContext: vi.fn(),
    clearContext: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    performance: vi.fn(),
  },
}));

describe('HealthChecker', () => {
  const mockDb = vi.mocked(db);
  const mockRedisClient = vi.mocked(RedisClient);
  const mockCreateDefaultAIClient = vi.mocked(createDefaultAIClient);

  let healthChecker: HealthChecker;
  let defaultConfig: HealthCheckConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    healthChecker = createHealthChecker();
    defaultConfig = {
      timeout: 5000,
      checkDatabase: true,
      checkRedis: true,
      checkAI: true,
    };

    // 设置默认的成功响应（添加小延迟以模拟真实响应时间）
    mockDb.healthCheck.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(true), 1))
    );
    mockDb.getPoolStatus.mockReturnValue({
      totalConnections: 10,
      activeConnections: 2,
      idleConnections: 8,
      queuedRequests: 0,
    });

    mockRedisClient.healthCheck.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(true), 1))
    );
    mockRedisClient.getStatus.mockReturnValue({
      connected: true,
      status: 'ready',
      host: 'localhost',
      port: 6379,
      db: 0,
    });

    const mockAIClient = {
      healthCheck: vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 1))
      ),
      getConfig: vi.fn().mockReturnValue({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      }),
    };
    mockCreateDefaultAIClient.mockReturnValue(mockAIClient as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkSystemHealth', () => {
    it('应该返回健康状态 - 所有服务正常', async () => {
      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.status).toBe('healthy');
      expect(result.services).toHaveLength(3);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.system).toBeDefined();

      // 检查各服务状态
      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('healthy');
      expect(dbService?.responseTime).toBeGreaterThan(0);

      const redisService = result.services.find(s => s.name === 'redis');
      expect(redisService?.status).toBe('healthy');

      const aiService = result.services.find(s => s.name === 'ai');
      expect(aiService?.status).toBe('healthy');
    });

    it('应该返回不健康状态 - 数据库失败', async () => {
      mockDb.healthCheck.mockResolvedValue(false);

      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.status).toBe('unhealthy');
      
      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toBe('数据库连接检查失败');
    });

    it('应该返回不健康状态 - Redis 失败', async () => {
      mockRedisClient.healthCheck.mockResolvedValue(false);

      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.status).toBe('unhealthy');
      
      const redisService = result.services.find(s => s.name === 'redis');
      expect(redisService?.status).toBe('unhealthy');
      expect(redisService?.error).toBe('Redis 连接检查失败');
    });

    it('应该返回不健康状态 - AI 服务失败', async () => {
      const mockAIClient = {
        healthCheck: vi.fn().mockResolvedValue(false),
        getConfig: vi.fn().mockReturnValue({
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'test-key',
        }),
      };
      mockCreateDefaultAIClient.mockReturnValue(mockAIClient as any);

      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.status).toBe('unhealthy');
      
      const aiService = result.services.find(s => s.name === 'ai');
      expect(aiService?.status).toBe('unhealthy');
      expect(aiService?.error).toBe('AI 服务连接检查失败');
    });

    it('应该处理检查超时', async () => {
      // 模拟数据库检查超时
      mockDb.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 10000))
      );

      const config = { ...defaultConfig, timeout: 1000 };
      const result = await healthChecker.checkSystemHealth(config);

      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toContain('超时');
    });

    it('应该处理检查异常', async () => {
      mockDb.healthCheck.mockRejectedValue(new Error('连接失败'));

      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.status).toBe('unhealthy');
      
      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toBe('连接失败');
    });

    it('应该支持选择性服务检查', async () => {
      const config: HealthCheckConfig = {
        timeout: 5000,
        checkDatabase: true,
        checkRedis: false,
        checkAI: false,
      };

      const result = await healthChecker.checkSystemHealth(config);

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('database');
    });

    it('应该并行执行服务检查', async () => {
      const startTime = Date.now();
      
      // 每个服务检查耗时 100ms
      mockDb.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );
      mockRedisClient.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );
      const mockAIClient = {
        healthCheck: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve(true), 100))
        ),
        getConfig: vi.fn().mockReturnValue({
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'test-key',
        }),
      };
      mockCreateDefaultAIClient.mockReturnValue(mockAIClient as any);

      await healthChecker.checkSystemHealth(defaultConfig);
      
      const duration = Date.now() - startTime;
      
      // 并行执行应该在 200ms 内完成（而不是 300ms）
      expect(duration).toBeLessThan(200);
    });

    it('应该包含正确的系统信息', async () => {
      const result = await healthChecker.checkSystemHealth(defaultConfig);

      expect(result.system.nodeVersion).toBe(process.version);
      expect(result.system.memory.used).toBeGreaterThan(0);
      expect(result.system.memory.total).toBeGreaterThan(0);
      expect(result.system.memory.usage).toBeGreaterThanOrEqual(0);
      expect(result.system.memory.usage).toBeLessThanOrEqual(100);
      expect(result.system.cpu.usage).toBe(0); // 当前实现返回 0
    });

    it('应该包含服务详细信息', async () => {
      const result = await healthChecker.checkSystemHealth(defaultConfig);

      // 数据库服务详情
      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.details?.type).toBe('MySQL');
      expect(dbService?.details?.poolStatus).toBeDefined();

      // Redis 服务详情
      const redisService = result.services.find(s => s.name === 'redis');
      expect(redisService?.details?.connected).toBe(true);
      expect(redisService?.details?.host).toBe('localhost');
      expect(redisService?.details?.port).toBe(6379);

      // AI 服务详情
      const aiService = result.services.find(s => s.name === 'ai');
      expect(aiService?.details?.provider).toBe('openai');
      expect(aiService?.details?.model).toBe('gpt-4');
      expect(aiService?.details?.hasApiKey).toBe(true);
    });
  });

  describe('getDefaultConfig', () => {
    it('应该返回默认配置', () => {
      const config = HealthChecker.getDefaultConfig();

      expect(config.timeout).toBe(5000); // 默认值
      expect(config.checkDatabase).toBe(true);
      expect(config.checkRedis).toBe(true);
      expect(config.checkAI).toBe(true);
    });

    it('应该从环境变量读取配置', () => {
      // 设置环境变量
      process.env.HEALTH_CHECK_TIMEOUT = '10000';
      process.env.HEALTH_CHECK_DATABASE = 'false';
      process.env.HEALTH_CHECK_REDIS = 'false';
      process.env.HEALTH_CHECK_AI = 'false';

      const config = HealthChecker.getDefaultConfig();

      expect(config.timeout).toBe(10000);
      expect(config.checkDatabase).toBe(false);
      expect(config.checkRedis).toBe(false);
      expect(config.checkAI).toBe(false);

      // 清理环境变量
      delete process.env.HEALTH_CHECK_TIMEOUT;
      delete process.env.HEALTH_CHECK_DATABASE;
      delete process.env.HEALTH_CHECK_REDIS;
      delete process.env.HEALTH_CHECK_AI;
    });
  });

  describe('createHealthChecker', () => {
    it('应该创建健康检查器实例', () => {
      const checker = createHealthChecker();
      expect(checker).toBeInstanceOf(HealthChecker);
    });
  });

  describe('系统状态计算', () => {
    it('应该返回健康状态 - 无服务检查', async () => {
      const config: HealthCheckConfig = {
        timeout: 5000,
        checkDatabase: false,
        checkRedis: false,
        checkAI: false,
      };

      const result = await healthChecker.checkSystemHealth(config);
      expect(result.status).toBe('healthy');
      expect(result.services).toHaveLength(0);
    });

    it('应该返回不健康状态 - 部分服务失败', async () => {
      mockDb.healthCheck.mockResolvedValue(false);
      // Redis 和 AI 保持健康

      const result = await healthChecker.checkSystemHealth(defaultConfig);
      expect(result.status).toBe('unhealthy');
    });

    it('应该正确计算响应时间', async () => {
      // 模拟 100ms 的检查时间
      mockDb.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      const result = await healthChecker.checkSystemHealth(defaultConfig);
      
      const dbService = result.services.find(s => s.name === 'database');
      expect(dbService?.responseTime).toBeGreaterThanOrEqual(100);
      expect(dbService?.responseTime).toBeLessThan(200); // 允许一些误差
    });
  });
});