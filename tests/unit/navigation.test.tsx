import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock Next.js hooks and components
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Import after mocking
const { Navigation } = await import('@/components/layout/Navigation');

describe('Navigation', () => {
  it('应该渲染导航栏', () => {
    render(<Navigation />);
    
    // 检查品牌标识
    expect(screen.getByText('CodeReview')).toBeInTheDocument();
    
    // 检查导航链接
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('审查历史')).toBeInTheDocument();
    expect(screen.getByText('系统配置')).toBeInTheDocument();
    expect(screen.getByText('健康检查')).toBeInTheDocument();
  });

  it('应该支持移动端菜单切换', () => {
    render(<Navigation />);
    
    // 查找移动端菜单按钮
    const menuButton = screen.getByLabelText('切换导航菜单');
    expect(menuButton).toBeInTheDocument();
    
    // 点击菜单按钮
    fireEvent.click(menuButton);
    
    // 检查移动端菜单是否显示
    const mobileMenu = screen.getByText('系统概览和状态');
    expect(mobileMenu).toBeInTheDocument();
  });

  it('应该正确处理链接点击', () => {
    render(<Navigation />);
    
    const homeLink = screen.getByText('首页');
    expect(homeLink.closest('a')).toHaveAttribute('href', '/');
    
    const dashboardLink = screen.getByText('审查历史');
    expect(dashboardLink.closest('a')).toHaveAttribute('href', '/dashboard');
    
    const configLink = screen.getByText('系统配置');
    expect(configLink.closest('a')).toHaveAttribute('href', '/config');
  });

  it('应该正确设置健康检查链接', () => {
    render(<Navigation />);
    
    const healthLink = screen.getByText('健康检查');
    const linkElement = healthLink.closest('a');
    
    expect(linkElement).toHaveAttribute('href', '/api/health');
    expect(linkElement).toHaveAttribute('target', '_blank');
    expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');
  });
});