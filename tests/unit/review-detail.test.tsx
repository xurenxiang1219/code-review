import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewDetail } from '@/components/review/ReviewDetail';
import type { ReviewEntity } from '@/lib/db/repositories/review';
import type { ReviewCommentRecord } from '@/types/review';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock 审查记录数据
const mockReview: ReviewEntity = {
  id: 'review-1',
  commit_hash: 'abc123def456789',
  branch: 'uat',
  repository: 'test-repo',
  author_name: 'John Doe',
  author_email: 'john@example.com',
  files_changed: 3,
  lines_added: 50,
  lines_deleted: 20,
  total_issues: 5,
  critical_count: 1,
  major_count: 2,
  minor_count: 1,
  suggestion_count: 1,
  status: 'completed',
  started_at: new Date('2024-01-01T10:00:00Z'),
  completed_at: new Date('2024-01-01T10:05:00Z'),
  processing_time_ms: 300000,
  error_message: null,
  created_at: new Date('2024-01-01T10:00:00Z'),
  updated_at: new Date('2024-01-01T10:05:00Z'),
};

// Mock 评论数据
const mockComments: ReviewCommentRecord[] = [
  {
    id: 'comment-1',
    reviewId: 'review-1',
    filePath: 'src/utils.ts',
    lineNumber: 42,
    severity: 'critical',
    category: 'security',
    message: '潜在的 SQL 注入漏洞',
    suggestion: '使用参数化查询',
    codeSnippet: 'const query = `SELECT * FROM users WHERE id = ${userId}`;',
    published: true,
    publishedAt: new Date('2024-01-01T10:05:00Z'),
    createdAt: new Date('2024-01-01T10:05:00Z'),
  },
  {
    id: 'comment-2',
    reviewId: 'review-1',
    filePath: 'src/utils.ts',
    lineNumber: 58,
    severity: 'major',
    category: 'performance',
    message: '循环中的重复计算',
    suggestion: '将计算移到循环外部',
    codeSnippet: 'for (let i = 0; i < items.length; i++) {\n  const result = expensiveCalculation();\n}',
    published: true,
    publishedAt: new Date('2024-01-01T10:05:00Z'),
    createdAt: new Date('2024-01-01T10:05:00Z'),
  },
  {
    id: 'comment-3',
    reviewId: 'review-1',
    filePath: 'src/components/Button.tsx',
    lineNumber: 15,
    severity: 'minor',
    category: 'style',
    message: '缺少 TypeScript 类型注解',
    suggestion: '为函数参数添加类型注解',
    codeSnippet: 'function handleClick(event) {',
    published: false,
    publishedAt: null,
    createdAt: new Date('2024-01-01T10:05:00Z'),
  },
  {
    id: 'comment-4',
    reviewId: 'review-1',
    filePath: 'src/components/Button.tsx',
    lineNumber: 25,
    severity: 'suggestion',
    category: 'readability',
    message: '可以使用更简洁的写法',
    suggestion: '使用解构赋值',
    codeSnippet: 'const title = props.title;\nconst onClick = props.onClick;',
    published: true,
    publishedAt: new Date('2024-01-01T10:05:00Z'),
    createdAt: new Date('2024-01-01T10:05:00Z'),
  },
];

describe('ReviewDetail', () => {
  describe('基本渲染', () => {
    it('应该正确渲染审查基本信息', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证提交哈希
      expect(screen.getByText('abc123de')).toBeInTheDocument();
      expect(screen.getByText('abc123def456789')).toBeInTheDocument();

      // 验证状态
      expect(screen.getByText('已完成')).toBeInTheDocument();

      // 验证仓库信息
      expect(screen.getByText('test-repo')).toBeInTheDocument();
      expect(screen.getByText('分支: uat')).toBeInTheDocument();

      // 验证作者信息
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();

      // 验证代码变更统计
      expect(screen.getByText('3 个文件')).toBeInTheDocument();
      expect(screen.getByText('+50')).toBeInTheDocument();
      expect(screen.getByText('-20')).toBeInTheDocument();

      // 验证处理时间
      expect(screen.getByText('5.0min')).toBeInTheDocument();
    });

    it('应该正确渲染问题统计', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证问题统计标题
      expect(screen.getByText('问题统计')).toBeInTheDocument();

      // 验证总问题数
      expect(screen.getByText('总问题数')).toBeInTheDocument();

      // 验证各严重程度标签存在（不限制数量，因为会在多个地方出现）
      expect(screen.getAllByText('严重').length).toBeGreaterThan(0);
      expect(screen.getAllByText('重要').length).toBeGreaterThan(0);
      expect(screen.getAllByText('次要').length).toBeGreaterThan(0);
      expect(screen.getAllByText('建议').length).toBeGreaterThan(0);
    });

    it('应该正确渲染返回按钮', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      const backLink = screen.getByText('返回仪表板').closest('a');
      expect(backLink).toHaveAttribute('href', '/dashboard');
    });
  });

  describe('评论列表', () => {
    it('应该正确渲染所有评论', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证评论总数
      expect(screen.getByText('审查评论 (4)')).toBeInTheDocument();

      // 验证文件分组 - 使用 getAllByText 因为有多个文件图标
      expect(screen.getAllByText('📄')).toHaveLength(2);
      
      // 验证文件名存在（会在过滤器和内容中出现）
      expect(screen.getAllByText('src/utils.ts').length).toBeGreaterThan(0);
      expect(screen.getAllByText('src/components/Button.tsx').length).toBeGreaterThan(0);

      // 验证评论内容
      expect(screen.getByText('潜在的 SQL 注入漏洞')).toBeInTheDocument();
      expect(screen.getByText('循环中的重复计算')).toBeInTheDocument();
      expect(screen.getByText('缺少 TypeScript 类型注解')).toBeInTheDocument();
      expect(screen.getByText('可以使用更简洁的写法')).toBeInTheDocument();
    });

    it('应该正确显示评论的严重程度', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证严重程度标签存在（会在统计区域、过滤器和评论中出现）
      expect(screen.getAllByText('严重').length).toBeGreaterThan(0);
      expect(screen.getAllByText('重要').length).toBeGreaterThan(0);
      expect(screen.getAllByText('次要').length).toBeGreaterThan(0);
      expect(screen.getAllByText('建议').length).toBeGreaterThan(0);
    });

    it('应该正确显示代码片段', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证代码片段
      expect(screen.getByText(/SELECT \* FROM users WHERE id/)).toBeInTheDocument();
      expect(screen.getByText(/expensiveCalculation/)).toBeInTheDocument();
    });

    it('应该正确显示修改建议', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证修改建议
      expect(screen.getByText('使用参数化查询')).toBeInTheDocument();
      expect(screen.getByText('将计算移到循环外部')).toBeInTheDocument();
      expect(screen.getByText('为函数参数添加类型注解')).toBeInTheDocument();
      expect(screen.getByText('使用解构赋值')).toBeInTheDocument();
    });

    it('应该正确显示发布状态', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证已发布状态
      const publishedElements = screen.getAllByText(/已发布/);
      expect(publishedElements).toHaveLength(3);

      // 验证待发布状态
      expect(screen.getByText('⏳ 待发布')).toBeInTheDocument();
    });
  });

  describe('过滤功能', () => {
    it('应该支持按严重程度过滤', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 选择严重程度过滤器
      const severitySelect = screen.getByDisplayValue('全部');
      fireEvent.change(severitySelect, { target: { value: 'critical' } });

      // 验证只显示严重问题
      expect(screen.getByText('审查评论 (1)')).toBeInTheDocument();
      expect(screen.getByText('潜在的 SQL 注入漏洞')).toBeInTheDocument();
      expect(screen.queryByText('循环中的重复计算')).not.toBeInTheDocument();
    });

    it('应该支持按文件过滤', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 选择文件过滤器
      const fileSelect = screen.getByDisplayValue('全部文件');
      fireEvent.change(fileSelect, { target: { value: 'src/utils.ts' } });

      // 验证只显示该文件的评论
      expect(screen.getByText('审查评论 (2)')).toBeInTheDocument();
      expect(screen.getByText('潜在的 SQL 注入漏洞')).toBeInTheDocument();
      expect(screen.getByText('循环中的重复计算')).toBeInTheDocument();
      expect(screen.queryByText('缺少 TypeScript 类型注解')).not.toBeInTheDocument();
    });

    it('应该支持组合过滤', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 同时设置严重程度和文件过滤
      const severitySelect = screen.getByDisplayValue('全部');
      const fileSelect = screen.getByDisplayValue('全部文件');

      fireEvent.change(severitySelect, { target: { value: 'major' } });
      fireEvent.change(fileSelect, { target: { value: 'src/utils.ts' } });

      // 验证过滤结果
      expect(screen.getByText('审查评论 (1)')).toBeInTheDocument();
      expect(screen.getByText('循环中的重复计算')).toBeInTheDocument();
      expect(screen.queryByText('潜在的 SQL 注入漏洞')).not.toBeInTheDocument();
    });

    it('应该在没有匹配评论时显示空状态', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 选择一个不存在的严重程度
      const severitySelect = screen.getByDisplayValue('全部');
      fireEvent.change(severitySelect, { target: { value: 'critical' } });

      const fileSelect = screen.getByDisplayValue('全部文件');
      fireEvent.change(fileSelect, { target: { value: 'src/components/Button.tsx' } });

      // 验证空状态
      expect(screen.getByText('审查评论 (0)')).toBeInTheDocument();
      expect(screen.getByText('没有找到匹配的评论')).toBeInTheDocument();
    });
  });

  describe('特殊状态处理', () => {
    it('应该正确处理处理中的审查', () => {
      const processingReview = {
        ...mockReview,
        status: 'processing' as const,
        completed_at: null,
        processing_time_ms: null,
      };

      render(<ReviewDetail review={processingReview} comments={[]} />);

      expect(screen.getByText('处理中')).toBeInTheDocument();
      expect(screen.getByText('进行中')).toBeInTheDocument();
    });

    it('应该正确处理失败的审查', () => {
      const failedReview = {
        ...mockReview,
        status: 'failed' as const,
        error_message: 'AI 服务不可用',
      };

      render(<ReviewDetail review={failedReview} comments={[]} />);

      expect(screen.getByText('失败')).toBeInTheDocument();
      expect(screen.getByText('错误信息')).toBeInTheDocument();
      expect(screen.getByText('AI 服务不可用')).toBeInTheDocument();
    });

    it('应该正确处理没有评论的审查', () => {
      render(<ReviewDetail review={mockReview} comments={[]} />);

      expect(screen.getByText('审查评论 (0)')).toBeInTheDocument();
      expect(screen.getByText('没有找到匹配的评论')).toBeInTheDocument();
    });

    it('应该正确处理没有代码片段的评论', () => {
      const commentsWithoutSnippet = [
        {
          ...mockComments[0],
          codeSnippet: null,
        },
      ];

      render(<ReviewDetail review={mockReview} comments={commentsWithoutSnippet} />);

      expect(screen.getByText('潜在的 SQL 注入漏洞')).toBeInTheDocument();
      expect(screen.queryByText('相关代码:')).not.toBeInTheDocument();
    });

    it('应该正确处理没有修改建议的评论', () => {
      const commentsWithoutSuggestion = [
        {
          ...mockComments[0],
          suggestion: null,
        },
      ];

      render(<ReviewDetail review={mockReview} comments={commentsWithoutSuggestion} />);

      expect(screen.getByText('潜在的 SQL 注入漏洞')).toBeInTheDocument();
      expect(screen.queryByText('💡 修改建议:')).not.toBeInTheDocument();
    });
  });

  describe('时间格式化', () => {
    it('应该正确格式化时间显示', () => {
      render(<ReviewDetail review={mockReview} comments={mockComments} />);

      // 验证时间格式（中文格式）- 使用更具体的查询
      expect(screen.getByText('开始时间:')).toBeInTheDocument();
      expect(screen.getByText('完成时间:')).toBeInTheDocument();
      
      // 验证时间内容存在
      const timeElements = screen.getAllByText(/2024\/01\/01 18:/);
      expect(timeElements.length).toBeGreaterThan(0);
    });

    it('应该正确格式化处理时间', () => {
      const reviewWithDifferentTimes = [
        { ...mockReview, processing_time_ms: 500 },
        { ...mockReview, processing_time_ms: 5000 },
        { ...mockReview, processing_time_ms: 300000 },
        { ...mockReview, processing_time_ms: null },
      ];

      reviewWithDifferentTimes.forEach((review, index) => {
        const { unmount } = render(<ReviewDetail review={review} comments={[]} />);
        
        if (index === 0) {
          expect(screen.getByText('500ms')).toBeInTheDocument();
        } else if (index === 1) {
          expect(screen.getByText('5.0s')).toBeInTheDocument();
        } else if (index === 2) {
          expect(screen.getByText('5.0min')).toBeInTheDocument();
        } else if (index === 3) {
          expect(screen.getByText('-')).toBeInTheDocument();
        }
        
        unmount(); // 清理组件
      });
    });
  });
});