import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Home from '@/app/page';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock SystemStatus component
vi.mock('@/components/ui/SystemStatus', () => ({
  SystemStatus: () => <div data-testid="system-status">系统状态组件</div>,
}));

// Mock fetch for stats
global.fetch = vi.fn();

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染首页标题和描述', () => {
    render(<Home />);
    
    expect(screen.getByText('CodeReview')).toBeInTheDocument();
    expect(screen.getByText(/自动化代码质量保障工具/)).toBeInTheDocument();
  });

  it('应该渲染主要操作按钮', () => {
    render(<Home />);
    
    const dashboardLink = screen.getByText('查看审查历史').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    
    // 使用更具体的选择器来避免重复文本问题
    const configButtons = screen.getAllByText('系统配置');
    const configLink = configButtons.find(button => 
      button.closest('a')?.getAttribute('href') === '/config'
    );
    expect(configLink?.closest('a')).toHaveAttribute('href', '/config');
  });

  it('应该显示系统状态组件', () => {
    render(<Home />);
    
    expect(screen.getByTestId('system-status')).toBeInTheDocument();
  });

  it('应该显示统计数据加载状态', async () => {
    render(<Home />);
    
    expect(screen.getByText('加载统计数据中...')).toBeInTheDocument();
    
    // 等待加载完成
    await waitFor(() => {
      expect(screen.getByText('1,247')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('应该显示功能特性', () => {
    render(<Home />);
    
    expect(screen.getByText('自动触发')).toBeInTheDocument();
    expect(screen.getByText('AI 智能审查')).toBeInTheDocument();
    expect(screen.getByText('自动发布')).toBeInTheDocument();
    expect(screen.getByText('历史记录')).toBeInTheDocument();
  });

  it('应该显示快速操作区域', () => {
    render(<Home />);
    
    // 检查快速操作链接
    const quickActions = screen.getAllByText('审查历史');
    expect(quickActions.length).toBeGreaterThan(0);
    
    expect(screen.getAllByText('系统配置').length).toBeGreaterThan(0);
    expect(screen.getAllByText('健康检查').length).toBeGreaterThan(0);
  });

  it('应该正确设置健康检查链接属性', () => {
    render(<Home />);
    
    const healthLinks = screen.getAllByText('健康检查');
    const healthLink = healthLinks.find(link => 
      link.closest('a')?.getAttribute('href') === '/api/health'
    );
    
    expect(healthLink).toBeDefined();
    const linkElement = healthLink?.closest('a');
    expect(linkElement).toHaveAttribute('target', '_blank');
    expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');
  });
});