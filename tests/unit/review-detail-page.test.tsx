import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import ReviewDetailPage from '@/app/dashboard/[reviewId]/page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock 环境变量
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3000';

// Mock 审查详情数据
const mockReviewData = {
  review: {
    id: 'review-1',
    commit_hash: 'abc123def456',
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
    status: 'completed' as const,
    started_at: new Date('2024-01-01T10:00:00Z'),
    completed_at: new Date('2024-01-01T10:05:00Z'),
    processing_time_ms: 300000,
    error_message: null,
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-01T10:05:00Z'),
  },
  comments: [
    {
      id: 'comment-1',
      reviewId: 'review-1',
      filePath: 'src/utils.ts',
      lineNumber: 42,
      severity: 'major' as const,
      category: 'security',
      message: '潜在的空指针异常',
      suggestion: '在访问属性前添加空值检查',
      codeSnippet: 'const value = obj.property;',
      published: true,
      publishedAt: new Date('2024-01-01T10:05:00Z'),
      createdAt: new Date('2024-01-01T10:05:00Z'),
    },
  ],
};

describe('ReviewDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('成功场景', () => {
    it('应该正确渲染审查详情页面', async () => {
      // 准备 mock 响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          msg: '操作成功',
          data: mockReviewData,
        }),
      });

      // 渲染组件
      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      // 验证页面标题
      expect(screen.getByText('审查详情')).toBeInTheDocument();
      expect(screen.getByText(/提交 abc123de 的详细审查结果/)).toBeInTheDocument();

      // 验证 fetch 调用
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/reviews/review-1',
        { cache: 'no-store' }
      );
    });

    it('应该生成正确的页面元数据', async () => {
      // 准备 mock 响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          msg: '操作成功',
          data: mockReviewData,
        }),
      });

      // 动态导入 generateMetadata 函数
      const { generateMetadata } = await import('@/app/dashboard/[reviewId]/page');
      const params = Promise.resolve({ reviewId: 'review-1' });
      const metadata = await generateMetadata({ params });

      // 验证元数据
      expect(metadata.title).toBe('审查详情 abc123de - CodeReview');
      expect(metadata.description).toContain('查看提交 abc123de 在 uat 分支的详细审查结果');
      expect(metadata.openGraph?.title).toBe('审查详情 abc123de');
    });
  });

  describe('错误场景', () => {
    it('应该在 reviewId 无效时调用 notFound', async () => {
      const params = Promise.resolve({ reviewId: '' });
      await ReviewDetailPage({ params });

      expect(notFound).toHaveBeenCalled();
    });

    it('应该在审查记录不存在时调用 notFound', async () => {
      // 准备 404 响应
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const params = Promise.resolve({ reviewId: 'non-existent' });
      await ReviewDetailPage({ params });

      expect(notFound).toHaveBeenCalled();
    });

    it('应该在 API 返回错误时渲染错误页面', async () => {
      // 准备错误响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 1000,
          msg: '服务器错误',
          data: null,
        }),
      });

      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      // 验证错误页面
      expect(screen.getByText('加载失败')).toBeInTheDocument();
      expect(screen.getByText('无法加载审查详情，请稍后重试')).toBeInTheDocument();
      expect(screen.getByText('返回仪表板')).toBeInTheDocument();
    });

    it('应该在网络错误时渲染错误页面', async () => {
      // 模拟网络错误
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      // 验证错误页面
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });

    it('应该在元数据生成失败时返回默认元数据', async () => {
      // 模拟 fetch 失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { generateMetadata } = await import('@/app/dashboard/[reviewId]/page');
      const params = Promise.resolve({ reviewId: 'review-1' });
      const metadata = await generateMetadata({ params });

      // 验证默认元数据
      expect(metadata.title).toBe('审查详情 - CodeReview');
      expect(metadata.description).toBe('查看代码审查的详细结果');
    });

    it('应该在审查记录不存在时返回相应的元数据', async () => {
      // 准备 404 响应
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { generateMetadata } = await import('@/app/dashboard/[reviewId]/page');
      const params = Promise.resolve({ reviewId: 'non-existent' });
      const metadata = await generateMetadata({ params });

      // 验证 404 元数据
      expect(metadata.title).toBe('审查记录不存在 - CodeReview');
      expect(metadata.description).toBe('请求的审查记录不存在或已被删除');
    });
  });

  describe('边界情况', () => {
    it('应该处理没有评论的审查记录', async () => {
      const reviewDataWithoutComments = {
        ...mockReviewData,
        comments: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          msg: '操作成功',
          data: reviewDataWithoutComments,
        }),
      });

      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      expect(screen.getByText('审查详情')).toBeInTheDocument();
    });

    it('应该处理处理中的审查记录', async () => {
      const processingReviewData = {
        ...mockReviewData,
        review: {
          ...mockReviewData.review,
          status: 'processing' as const,
          completed_at: null,
          processing_time_ms: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          msg: '操作成功',
          data: processingReviewData,
        }),
      });

      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      expect(screen.getByText('审查详情')).toBeInTheDocument();
    });

    it('应该处理有错误信息的审查记录', async () => {
      const failedReviewData = {
        ...mockReviewData,
        review: {
          ...mockReviewData.review,
          status: 'failed' as const,
          error_message: 'AI 服务不可用',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          msg: '操作成功',
          data: failedReviewData,
        }),
      });

      const params = Promise.resolve({ reviewId: 'review-1' });
      const component = await ReviewDetailPage({ params });
      render(component);

      expect(screen.getByText('审查详情')).toBeInTheDocument();
    });
  });
});