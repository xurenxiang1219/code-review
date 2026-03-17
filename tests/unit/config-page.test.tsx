import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfigPage from '@/app/config/page';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('ConfigPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('应该渲染页面标题和描述', () => {
    render(<ConfigPage />);
    
    expect(screen.getByText('配置管理')).toBeInTheDocument();
    expect(screen.getByText(/管理 CodeReview 的配置/)).toBeInTheDocument();
  });

  it('应该显示仓库选择表单', () => {
    render(<ConfigPage />);
    
    expect(screen.getByPlaceholderText(/请输入仓库名称/)).toBeInTheDocument();
    expect(screen.getByText('加载配置')).toBeInTheDocument();
  });

  it('应该在仓库名称为空时禁用加载按钮', () => {
    render(<ConfigPage />);
    
    const loadButton = screen.getByText('加载配置');
    expect(loadButton).toBeDisabled();
  });

  it('应该在输入仓库名称后启用加载按钮', () => {
    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const loadButton = screen.getByText('加载配置');
    
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    expect(loadButton).not.toBeDisabled();
  });

  it('应该在提交表单时加载配置', async () => {
    const mockConfig = {
      id: '1',
      repository: 'owner/repo',
      reviewFocus: ['security', 'performance'],
      fileWhitelist: ['*.ts', '*.tsx'],
      ignorePatterns: ['node_modules/**'],
      aiModel: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000,
      },
      pollingEnabled: false,
      pollingInterval: 300,
      notificationConfig: {
        email: { enabled: false, recipients: [], criticalOnly: true },
        im: { enabled: false, channels: [] },
        gitComment: { enabled: true, summaryOnly: false },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: mockConfig }),
    });

    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const form = input.closest('form');
    
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/config?repository=owner%2Frepo');
    });
  });

  it('应该在配置不存在时创建默认配置', async () => {
    const mockDefaultConfig = {
      id: '1',
      repository: 'owner/repo',
      reviewFocus: ['security', 'performance', 'readability', 'maintainability'],
      fileWhitelist: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      ignorePatterns: ['node_modules/**', 'dist/**'],
      aiModel: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000,
      },
      pollingEnabled: false,
      pollingInterval: 300,
      notificationConfig: {
        email: { enabled: false, recipients: [], criticalOnly: true },
        im: { enabled: false, channels: [] },
        gitComment: { enabled: true, summaryOnly: false },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 第一次请求返回配置不存在
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: 3005, msg: '配置不存在' }),
    });

    // 第二次请求创建默认配置
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: mockDefaultConfig }),
    });

    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const form = input.closest('form');
    
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/config?repository=owner%2Frepo');
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/config?repository=owner%2Frepo', {
        method: 'POST',
      });
    });
  });

  it('应该显示加载错误', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: 2000, msg: '服务器错误' }),
    });

    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const form = input.closest('form');
    
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('服务器错误')).toBeInTheDocument();
    });
  });

  it('应该在加载时显示加载状态', async () => {
    mockFetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const form = input.closest('form');
    
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    fireEvent.submit(form!);

    expect(screen.getByText('加载配置中...')).toBeInTheDocument();
  });

  it('应该在仓库名称为空时显示错误', async () => {
    render(<ConfigPage />);
    
    const input = screen.getByPlaceholderText(/请输入仓库名称/);
    const form = input.closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('请输入仓库名称')).toBeInTheDocument();
    });
  });
});