import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
  LoadingSpinner,
  Alert,
} from '@/components/ui';

describe('UI Components', () => {
  describe('Button', () => {
    it('应该渲染基本按钮', () => {
      render(<Button>点击我</Button>);
      expect(screen.getByRole('button', { name: '点击我' })).toBeInTheDocument();
    });

    it('应该处理点击事件', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>点击我</Button>);
      
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('应该显示加载状态', () => {
      render(<Button loading>加载中</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('应该支持不同变体', () => {
      const { rerender } = render(<Button variant="primary">主要按钮</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-blue-600');

      rerender(<Button variant="danger">危险按钮</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-red-600');
    });
  });

  describe('Card', () => {
    it('应该渲染卡片组件', () => {
      render(
        <Card>
          <CardHeader title="测试标题" />
          <CardContent>测试内容</CardContent>
          <CardFooter>测试底部</CardFooter>
        </Card>
      );

      expect(screen.getByText('测试标题')).toBeInTheDocument();
      expect(screen.getByText('测试内容')).toBeInTheDocument();
      expect(screen.getByText('测试底部')).toBeInTheDocument();
    });

    it('应该支持自定义样式', () => {
      render(<Card className="custom-class">内容</Card>);
      const cardElement = screen.getByText('内容').closest('.bg-white');
      expect(cardElement).toHaveClass('custom-class');
    });
  });

  describe('Badge', () => {
    it('应该渲染徽章', () => {
      render(<Badge>测试徽章</Badge>);
      expect(screen.getByText('测试徽章')).toBeInTheDocument();
    });

    it('应该支持不同变体', () => {
      const { rerender } = render(<Badge variant="success">成功</Badge>);
      expect(screen.getByText('成功')).toHaveClass('bg-green-100');

      rerender(<Badge variant="danger">错误</Badge>);
      expect(screen.getByText('错误')).toHaveClass('bg-red-100');
    });

    it('应该支持显示圆点', () => {
      render(<Badge dot>带圆点</Badge>);
      const badge = screen.getByText('带圆点');
      expect(badge.querySelector('.w-1\\.5')).toBeInTheDocument();
    });
  });

  describe('LoadingSpinner', () => {
    it('应该渲染加载动画', () => {
      render(<LoadingSpinner />);
      expect(screen.getByRole('presentation', { hidden: true })).toBeInTheDocument();
    });

    it('应该支持显示文本', () => {
      render(<LoadingSpinner text="加载中..." />);
      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('应该支持不同尺寸', () => {
      const { rerender } = render(<LoadingSpinner size="sm" />);
      expect(screen.getByRole('presentation', { hidden: true })).toHaveClass('w-4');

      rerender(<LoadingSpinner size="lg" />);
      expect(screen.getByRole('presentation', { hidden: true })).toHaveClass('w-8');
    });
  });

  describe('Alert', () => {
    it('应该渲染警告框', () => {
      render(<Alert>测试警告</Alert>);
      expect(screen.getByText('测试警告')).toBeInTheDocument();
    });

    it('应该支持不同类型', () => {
      const { rerender } = render(<Alert type="success">成功消息</Alert>);
      const successAlert = screen.getByText('成功消息').closest('.rounded-md');
      expect(successAlert).toHaveClass('bg-green-50');

      rerender(<Alert type="error">错误消息</Alert>);
      const errorAlert = screen.getByText('错误消息').closest('.rounded-md');
      expect(errorAlert).toHaveClass('bg-red-50');
    });

    it('应该支持关闭功能', () => {
      const handleClose = vi.fn();
      render(
        <Alert closable onClose={handleClose}>
          可关闭的警告
        </Alert>
      );

      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('应该显示标题', () => {
      render(<Alert title="警告标题">警告内容</Alert>);
      expect(screen.getByText('警告标题')).toBeInTheDocument();
      expect(screen.getByText('警告内容')).toBeInTheDocument();
    });
  });
});