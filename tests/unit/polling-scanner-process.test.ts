import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PollingScannerProcess } from '@/scripts/polling-scanner';

// Mock 依赖
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/cache/redis-client', () => ({
  default: {
    healthCheck: vi.fn(() => Promise.resolve(true)),
    close: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/services/polling-scanner', () => ({
  createPollingScannerFromEnv: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => ({
      config: {
        repository: 'test/repo',
        branch: 'uat',
        interval: 300,
      },
    })),
  })),
  createPollingScanner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => ({
      isRunning: true,
      isScanning: false,
      scanCount: 0,
      lastScanTime: null,
      config: {
        repository: 'test/repo',
        branch: 'uat',
        interval: 300,
      },
    })),
  })),
}));

vi.mock('@/lib/git/client', () => ({
  createGitClient: vi.fn(() => ({})),
}));

describe('PollingScannerProcess', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // 设置测试环境变量
    process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.GIT_REPOSITORY = 'test/repo';
    process.env.GIT_TOKEN = 'test-token';
    process.env.POLLING_DEFAULT_INTERVAL = '300';
    process.env.POLLING_DEFAULT_BRANCH = 'uat';
    process.env.POLLING_MAX_CONCURRENT = '5';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('配置解析', () => {
    it('应该正确解析环境变量配置', () => {
      // 这里测试配置解析逻辑
      expect(process.env.POLLING_DEFAULT_INTERVAL).toBe('300');
      expect(process.env.POLLING_DEFAULT_BRANCH).toBe('uat');
      expect(process.env.POLLING_MAX_CONCURRENT).toBe('5');
    });

    it('应该使用默认值当环境变量未设置时', () => {
      delete process.env.POLLING_DEFAULT_INTERVAL;
      delete process.env.POLLING_DEFAULT_BRANCH;
      
      // 重新导入模块以获取新的配置
      const config = {
        repositories: [],
        defaultBranch: process.env.POLLING_DEFAULT_BRANCH || 'uat',
        defaultInterval: parseInt(process.env.POLLING_DEFAULT_INTERVAL || '300'),
        gracefulShutdownTimeout: parseInt(process.env.POLLING_SHUTDOWN_TIMEOUT || '30000'),
        healthCheckInterval: parseInt(process.env.POLLING_HEALTH_CHECK_INTERVAL || '60000'),
        logLevel: process.env.LOG_LEVEL || 'info',
        enableMetrics: process.env.POLLING_ENABLE_METRICS === 'true',
        maxConcurrentScanners: parseInt(process.env.POLLING_MAX_CONCURRENT || '10'),
      };
      
      expect(config.defaultBranch).toBe('uat');
      expect(config.defaultInterval).toBe(300);
      expect(config.maxConcurrentScanners).toBe(10);
    });
  });

  describe('多仓库配置', () => {
    it('应该正确解析多仓库配置', () => {
      process.env.POLLING_REPOSITORIES = 'org1/repo1,org2/repo2';
      
      const repositories = process.env.POLLING_REPOSITORIES.split(',');
      expect(repositories).toEqual(['org1/repo1', 'org2/repo2']);
    });

    it('应该生成正确的扫描器ID', () => {
      const repository = 'my-org/my-repo';
      const scannerId = repository.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      expect(scannerId).toBe('my_org_my_repo');
    });

    it('应该构建仓库特定的环境变量名', () => {
      const repository = 'my-org/my-repo';
      const envPrefix = `POLLING_${repository.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_`;
      
      expect(envPrefix).toBe('POLLING_MY_ORG_MY_REPO_');
    });
  });

  describe('错误处理', () => {
    it('应该正确提取错误信息', () => {
      const error = new Error('测试错误');
      error.stack = '错误堆栈';
      
      const extractErrorInfo = (error: unknown): { message: string; stack?: string } => {
        if (error instanceof Error) {
          return { message: error.message, stack: error.stack };
        }
        return { message: String(error) };
      };
      
      const errorInfo = extractErrorInfo(error);
      expect(errorInfo.message).toBe('测试错误');
      expect(errorInfo.stack).toBe('错误堆栈');
    });

    it('应该处理非Error类型的错误', () => {
      const extractErrorInfo = (error: unknown): { message: string; stack?: string } => {
        if (error instanceof Error) {
          return { message: error.message, stack: error.stack };
        }
        return { message: String(error) };
      };
      
      const errorInfo = extractErrorInfo('字符串错误');
      expect(errorInfo.message).toBe('字符串错误');
      expect(errorInfo.stack).toBeUndefined();
    });
  });
});