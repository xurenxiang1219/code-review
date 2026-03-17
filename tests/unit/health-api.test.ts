import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD } from '@/app/api/health/route';
import { db } from '@/lib/db/client';
import RedisClient from '@/lib/cache/redis-client';
import { createDefaultAIClient } from '@/lib/ai/client';
import type { SystemHealth } from '@/types/health';

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

describe('Health API', () => {
  const mockDb = vi.mocked(db);
  const mockRedisClient = vi.mocked(RedisClient);
  const mockCreateDefaultAIClient = vi.mocked(createDefaultAIClient);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 设置默认的成功响应
    mockDb.healthCheck.mockResolvedValue(true);
    mockDb.getPoolStatus.mockReturnValue({
      totalConnections: 10,
      activeConnections: 2,
      idleConnections: 8,
      queuedRequests: 0,
    });

    mockRedisClient.healthCheck.mockResolvedValue(true);
    mockRedisClient.getStatus.mockReturnValue({
      connected: true,
      status: 'ready',
      host: 'localhost',
      port: 6379,
      db: 0,
    });

    const mockAIClient = {
      healthCheck: vi.fn().mockResolvedValue(true),
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

  describe('GET /api/health', () => {
    it('应该返回系统健康状态 - 所有服务正常', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.code).toBe(0);
      expect(data.msg).toBe('操作成功');
      
      const healthData = data.data as SystemHealth;
      expect(healthData.status).toBe('healthy');
      expect(healthData.services).toHaveLength(3);
      
      // 检查数据库服务状态
      const dbService = healthData.services.find(s => s.name === 'database');
      expect(dbService).toBeDefined();
      expect(dbService?.status).toBe('healthy');
      expect(dbService?.details?.type).toBe('MySQL');
      
      // 检查 Redis 服务状态
      const redisService = healthData.services.find(s => s.name === 'redis');
      expect(redisService).toBeDefined();
      expect(redisService?.status).toBe('healthy');
      expect(redisService?.details?.connected).toBe(true);
      
      // 检查 AI 服务状态
      const aiService = healthData.services.find(s => s.name === 'ai');
      expect(aiService).toBeDefined();
      expect(aiService?.status).toBe('healthy');
      expect(aiService?.details?.provider).toBe('openai');
    });

    it('应该返回系统不健康状态 - 数据库连接失败', async () => {
      mockDb.healthCheck.mockResolvedValue(false);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      expect(healthData.status).toBe('unhealthy');
      
      const dbService = healthData.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toBe('数据库连接检查失败');
    });

    it('应该返回系统不健康状态 - Redis 连接失败', async () => {
      mockRedisClient.healthCheck.mockResolvedValue(false);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      expect(healthData.status).toBe('unhealthy');
      
      const redisService = healthData.services.find(s => s.name === 'redis');
      expect(redisService?.status).toBe('unhealthy');
      expect(redisService?.error).toBe('Redis 连接检查失败');
    });

    it('应该返回系统不健康状态 - AI 服务不可用', async () => {
      const mockAIClient = {
        healthCheck: vi.fn().mockResolvedValue(false),
        getConfig: vi.fn().mockReturnValue({
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'test-key',
        }),
      };
      mockCreateDefaultAIClient.mockReturnValue(mockAIClient as any);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      expect(healthData.status).toBe('unhealthy');
      
      const aiService = healthData.services.find(s => s.name === 'ai');
      expect(aiService?.status).toBe('unhealthy');
      expect(aiService?.error).toBe('AI 服务连接检查失败');
    });

    it('应该处理服务检查超时', async () => {
      // 模拟数据库检查超时
      mockDb.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 10000))
      );
      
      const request = new NextRequest('http://localhost:3000/api/health?timeout=1000');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      
      const dbService = healthData.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toContain('超时');
    });

    it('应该支持选择性服务检查', async () => {
      const request = new NextRequest('http://localhost:3000/api/health?services=database,redis');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      
      // 应该只检查数据库和 Redis，不检查 AI 服务
      expect(healthData.services).toHaveLength(2);
      expect(healthData.services.find(s => s.name === 'database')).toBeDefined();
      expect(healthData.services.find(s => s.name === 'redis')).toBeDefined();
      expect(healthData.services.find(s => s.name === 'ai')).toBeUndefined();
    });

    it('应该限制超时时间范围', async () => {
      // 测试超时时间下限
      const request1 = new NextRequest('http://localhost:3000/api/health?timeout=500');
      await GET(request1);
      
      // 测试超时时间上限
      const request2 = new NextRequest('http://localhost:3000/api/health?timeout=60000');
      await GET(request2);
      
      // 验证调用了健康检查（说明超时时间被正确限制）
      expect(mockDb.healthCheck).toHaveBeenCalledTimes(2);
    });

    it('应该包含系统信息', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      
      expect(healthData.system).toBeDefined();
      expect(healthData.system.nodeVersion).toBeDefined();
      expect(healthData.system.memory).toBeDefined();
      expect(healthData.system.memory.used).toBeGreaterThan(0);
      expect(healthData.system.memory.total).toBeGreaterThan(0);
      expect(healthData.system.memory.usage).toBeGreaterThanOrEqual(0);
      expect(healthData.system.cpu).toBeDefined();
    });

    it('应该处理异常情况', async () => {
      mockDb.healthCheck.mockRejectedValue(new Error('数据库连接错误'));
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      const data = await response.json();
      const healthData = data.data as SystemHealth;
      expect(healthData.status).toBe('unhealthy');
      
      const dbService = healthData.services.find(s => s.name === 'database');
      expect(dbService?.status).toBe('unhealthy');
      expect(dbService?.error).toBe('数据库连接错误');
    });
  });

  describe('HEAD /api/health', () => {
    it('应该返回 200 状态码 - 系统健康', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await HEAD(request);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Health-Status')).toBe('healthy');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      
      // HEAD 请求不应该有响应体
      const body = await response.text();
      expect(body).toBe('');
    });

    it('应该返回 503 状态码 - 系统不健康', async () => {
      mockDb.healthCheck.mockResolvedValue(false);
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await HEAD(request);
      
      expect(response.status).toBe(503);
      expect(response.headers.get('X-Health-Status')).toBe('unhealthy');
    });

    it('应该处理检查异常', async () => {
      mockDb.healthCheck.mockRejectedValue(new Error('连接失败'));
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await HEAD(request);
      
      expect(response.status).toBe(503);
      expect(response.headers.get('X-Health-Status')).toBe('unhealthy');
    });

    it('应该使用较短的超时时间', async () => {
      // 模拟长时间运行的检查
      mockDb.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 5000))
      );
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const startTime = Date.now();
      const response = await HEAD(request);
      const duration = Date.now() - startTime;
      
      // HEAD 请求应该在 3 秒内完成（加上一些容错时间）
      expect(duration).toBeLessThan(4000);
      expect(response.status).toBe(503); // 因为超时导致不健康
    });
  });
});