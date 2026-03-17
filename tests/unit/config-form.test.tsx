import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigForm } from '@/components/config/ConfigForm';
import { FullReviewConfig } from '@/lib/db/repositories/config';

const mockConfig: FullReviewConfig = {
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

describe('ConfigForm', () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
  });

  it('应该渲染配置表单', () => {
    render(<ConfigForm config={mockConfig} onSave={mockOnSave} repository="owner/repo" />);
    
    expect(screen.getByText('配置设置 - owner/repo')).toBeInTheDocument();
    expect(screen.getByText('保存配置')).toBeInTheDocument();
  });

  it('应该显示审查关注点', () => {
    render(<ConfigForm config={mockConfig} onSave={mockOnSave} repository="owner/repo" />);
    
    // 检查审查关注点
    expect(screen.getByLabelText('安全性')).toBeChecked();
    expect(screen.getByLabelText('性能')).toBeChecked();
    expect(screen.getByLabelText('可读性')).not.toBeChecked();
  });

  it('应该允许修改审查关注点', () => {
    render(<ConfigForm config={mockConfig} onSave={mockOnSave} repository="owner/repo" />);
    
    const readabilityCheckbox = screen.getByLabelText('可读性');
    fireEvent.click(readabilityCheckbox);
    
    expect(readabilityCheckbox).toBeChecked();
  });

  it('应该在表单验证通过时调用 onSave', async () => {
    render(<ConfigForm config={mockConfig} onSave={mockOnSave} repository="owner/repo" />);
    
    const saveButton = screen.getByText('保存配置');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        reviewFocus: expect.any(Array),
        aiModel: expect.any(Object),
      }));
    });
  });

  it('应该在保存时显示加载状态', async () => {
    mockOnSave.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<ConfigForm config={mockConfig} onSave={mockOnSave} repository="owner/repo" />);
    
    const saveButton = screen.getByText('保存配置');
    fireEvent.click(saveButton);
    
    expect(screen.getByText('保存中...')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });
});