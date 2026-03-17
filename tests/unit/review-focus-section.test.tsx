import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReviewFocusSection } from '@/components/config/sections/ReviewFocusSection';

describe('ReviewFocusSection', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('应该渲染所有可用的审查关注点', () => {
    render(<ReviewFocusSection value={[]} onChange={mockOnChange} />);
    
    expect(screen.getByLabelText('安全性')).toBeInTheDocument();
    expect(screen.getByLabelText('性能')).toBeInTheDocument();
    expect(screen.getByLabelText('可读性')).toBeInTheDocument();
    expect(screen.getByLabelText('可维护性')).toBeInTheDocument();
    expect(screen.getByLabelText('测试')).toBeInTheDocument();
    expect(screen.getByLabelText('文档')).toBeInTheDocument();
  });

  it('应该显示当前选中的关注点', () => {
    render(<ReviewFocusSection value={['security', 'performance']} onChange={mockOnChange} />);
    
    expect(screen.getByLabelText('安全性')).toBeChecked();
    expect(screen.getByLabelText('性能')).toBeChecked();
    expect(screen.getByLabelText('可读性')).not.toBeChecked();
  });

  it('应该在点击时切换关注点状态', () => {
    render(<ReviewFocusSection value={['security']} onChange={mockOnChange} />);
    
    const performanceCheckbox = screen.getByLabelText('性能');
    fireEvent.click(performanceCheckbox);
    
    expect(mockOnChange).toHaveBeenCalledWith(['security', 'performance']);
  });

  it('应该在取消选中时移除关注点', () => {
    render(<ReviewFocusSection value={['security', 'performance']} onChange={mockOnChange} />);
    
    const securityCheckbox = screen.getByLabelText('安全性');
    fireEvent.click(securityCheckbox);
    
    expect(mockOnChange).toHaveBeenCalledWith(['performance']);
  });

  it('应该显示错误信息', () => {
    render(<ReviewFocusSection value={[]} onChange={mockOnChange} error="请至少选择一个关注点" />);
    
    expect(screen.getByText('请至少选择一个关注点')).toBeInTheDocument();
  });

  it('应该显示每个关注点的描述', () => {
    render(<ReviewFocusSection value={[]} onChange={mockOnChange} />);
    
    expect(screen.getByText('检查安全漏洞和风险')).toBeInTheDocument();
    expect(screen.getByText('检查性能问题和优化建议')).toBeInTheDocument();
    expect(screen.getByText('检查代码可读性和风格')).toBeInTheDocument();
  });
});