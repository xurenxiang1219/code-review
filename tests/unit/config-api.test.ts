import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiCode } from '@/lib/constants/api-codes';

// Mock 所有依赖
vi.mock('@/lib/db/repositories/config', () => ({
  configRepository: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    createDefaultConfig: vi.fn(),
    deleteConfig: vi.fn(),
    validateConfig: vi.fn(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
    setContext: vi.fn(),
    clearContext: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    performance: vi.fn(),
  },
}));

describe('Config API', () => {
  let GET: any, PUT: any, POST: any, DELETE: any;
  let mockConfigRepository: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // 动态导入模块
    const configModule = await import('@/app/api/config/route');
    const repoModule = await import('@/lib/db/repositories/config');
    
    GET = configModule.GET;
    PUT = configModule.PUT;
    POST = configModule.POST;
    DELETE = configModule.DELETE;
    mockConfigRepository = repoModule.configRepository;
  });

  describe('基本功能测试', () => {
    it('GET - 应该在缺少 repository 参数时返回错误', async () => {
      const request = new NextRequest('http://localhost:3000/api/config');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ApiCode.MISSING_REQUIRED_FIELD);
    });

    it('PUT - 应该在缺少 repository 参数时返回错误', async () => {
      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ApiCode.MISSING_REQUIRED_FIELD);
    });

    it('POST - 应该在缺少 repository 参数时返回错误', async () => {
      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ApiCode.MISSING_REQUIRED_FIELD);
    });

    it('DELETE - 应该在缺少 repository 参数时返回错误', async () => {
      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'DELETE',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ApiCode.MISSING_REQUIRED_FIELD);
    });

    it('PUT - 应该处理无效的 JSON 请求体', async () => {
      const request = new NextRequest('http://localhost:3000/api/config?repository=owner/repo', {
        method: 'PUT',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe(ApiCode.INVALID_PARAMETERS);
    });
  });

  describe('响应格式验证', () => {
    it('错误响应应该包含标准字段', async () => {
      const request = new NextRequest('http://localhost:3000/api/config');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('code');
      expect(data).toHaveProperty('msg');
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('requestId');
      expect(typeof data.timestamp).toBe('number');
      expect(typeof data.requestId).toBe('string');
    });
  });
});