import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReviews } from '@/app/api/reviews/route';
import { GET as getReviewDetail } from '@/app/api/reviews/[reviewId]/route';
import { reviewRepository } from '@/lib/db/repositories/review';
import { db } from '@/lib/db/client';
import type { ReviewEntity } from '@/lib/db/repositories/review';

// Mock 依赖
vi.mock('@/lib/db/repositories/review', () => ({
  reviewRepository: {
    getReviews: vi.fn(),
    getReviewById: vi.fn(),
  },
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    initialize: vi.fn(),
    query: vi.fn(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    setContext: vi.fn(),
    clearContext: vi.fn(),
    debug: vi.fn(),
    performance: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Reviews API - GET /api/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 测试基本的列表查询功能
   */
  it('应该返回审查记录列表', async () => {
    // 准备测试数据
    const mockReviews: ReviewEntity[] = [
      {
        id: 'review-1',
        commit_hash: 'abc123',
        branch: 'uat',
        repository: 'test-repo',
        author_name: 'John Doe',
        author_email: 'john@example.com',
        files_changed: 5,
        lines_added: 100,
        lines_deleted: 50,
        total_issues: 10,
        critical_count: 2,
        major_count: 3,
        minor_count: 3,
        suggestion_count: 2,
        status: 'completed',
        started_at: new Date('2024-01-01T00:00:00Z'),
        completed_at: new Date('2024-01-01T00:05:00Z'),
        processing_time_ms: 300000,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:05:00Z'),
      },
    ];

    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: mockReviews,
      total: 1,
    });

    // 创建请求
    const request = new NextRequest('http://localhost:3000/api/reviews?page=1&pageSize=20');

    // 执行请求
    const response = await getReviews(request);
    const data = await response.json();

    // 验证响应
    expect(response.status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0].id).toBe('review-1');
    expect(data.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    // 验证调用参数
    expect(reviewRepository.getReviews).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  /**
   * 测试分支过滤功能
   */
  it('应该支持按分支过滤', async () => {
    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: [],
      total: 0,
    });

    const request = new NextRequest('http://localhost:3000/api/reviews?branch=uat');
    await getReviews(request);

    expect(reviewRepository.getReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'uat',
      })
    );
  });

  /**
   * 测试状态过滤功能
   */
  it('应该支持按状态过滤', async () => {
    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: [],
      total: 0,
    });

    const request = new NextRequest('http://localhost:3000/api/reviews?status=completed');
    await getReviews(request);

    expect(reviewRepository.getReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
      })
    );
  });

  /**
   * 测试无效状态参数
   */
  it('应该拒绝无效的状态参数', async () => {
    const request = new NextRequest('http://localhost:3000/api/reviews?status=invalid');
    const response = await getReviews(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe(1000); // BAD_REQUEST
    expect(data.msg).toContain('无效的状态值');
  });

  /**
   * 测试时间范围过滤
   */
  it('应该支持时间范围过滤', async () => {
    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: [],
      total: 0,
    });

    const from = '2024-01-01T00:00:00Z';
    const to = '2024-01-31T23:59:59Z';
    const request = new NextRequest(`http://localhost:3000/api/reviews?from=${from}&to=${to}`);
    await getReviews(request);

    expect(reviewRepository.getReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date(from),
        to: new Date(to),
      })
    );
  });

  /**
   * 测试无效的时间格式
   */
  it('应该拒绝无效的时间格式', async () => {
    const request = new NextRequest('http://localhost:3000/api/reviews?from=invalid-date');
    const response = await getReviews(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe(1000); // BAD_REQUEST
    expect(data.msg).toContain('无效的开始时间格式');
  });

  /**
   * 测试分页参数边界值
   */
  it('应该限制分页参数的范围', async () => {
    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: [],
      total: 0,
    });

    // 测试超大的 pageSize
    const request = new NextRequest('http://localhost:3000/api/reviews?page=1&pageSize=200');
    await getReviews(request);

    // pageSize 应该被限制为 100
    expect(reviewRepository.getReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 100,
      })
    );
  });

  /**
   * 测试多个过滤条件组合
   */
  it('应该支持多个过滤条件组合', async () => {
    vi.mocked(reviewRepository.getReviews).mockResolvedValue({
      items: [],
      total: 0,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reviews?branch=uat&status=completed&author=john@example.com'
    );
    await getReviews(request);

    expect(reviewRepository.getReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'uat',
        status: 'completed',
        author: 'john@example.com',
      })
    );
  });
});

describe('Reviews API - GET /api/reviews/[reviewId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 测试查询审查详情
   */
  it('应该返回审查详情和评论', async () => {
    // 准备测试数据
    const mockReview: ReviewEntity = {
      id: 'review-1',
      commit_hash: 'abc123',
      branch: 'uat',
      repository: 'test-repo',
      author_name: 'John Doe',
      author_email: 'john@example.com',
      files_changed: 5,
      lines_added: 100,
      lines_deleted: 50,
      total_issues: 10,
      critical_count: 2,
      major_count: 3,
      minor_count: 3,
      suggestion_count: 2,
      status: 'completed',
      started_at: new Date('2024-01-01T00:00:00Z'),
      completed_at: new Date('2024-01-01T00:05:00Z'),
      processing_time_ms: 300000,
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:05:00Z'),
    };

    const mockComments = [
      {
        id: 'comment-1',
        review_id: 'review-1',
        file_path: 'src/utils.ts',
        line_number: 42,
        severity: 'major',
        category: 'security',
        message: '潜在的空指针异常',
        suggestion: '在访问属性前添加空值检查',
        code_snippet: 'const value = obj.property;',
        published: true,
        published_at: new Date('2024-01-01T00:05:00Z'),
        created_at: new Date('2024-01-01T00:05:00Z'),
      },
    ];

    vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview);
    vi.mocked(db.initialize).mockResolvedValue(undefined);
    vi.mocked(db.query).mockResolvedValue(mockComments);

    // 创建请求
    const request = new NextRequest('http://localhost:3000/api/reviews/review-1');

    // 执行请求
    const response = await getReviewDetail(request, {
      params: { reviewId: 'review-1' },
    });
    const data = await response.json();

    // 验证响应
    expect(response.status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data.review.id).toBe('review-1');
    expect(data.data.comments).toHaveLength(1);
    expect(data.data.comments[0].id).toBe('comment-1');

    // 验证调用
    expect(reviewRepository.getReviewById).toHaveBeenCalledWith('review-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM review_comments'),
      ['review-1']
    );
  });

  /**
   * 测试审查记录不存在
   */
  it('应该在审查记录不存在时返回 404', async () => {
    vi.mocked(reviewRepository.getReviewById).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/reviews/non-existent');
    const response = await getReviewDetail(request, {
      params: { reviewId: 'non-existent' },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe(1004); // NOT_FOUND
    expect(data.msg).toContain('审查记录不存在');
  });

  /**
   * 测试没有评论的审查记录
   */
  it('应该处理没有评论的审查记录', async () => {
    const mockReview: ReviewEntity = {
      id: 'review-1',
      commit_hash: 'abc123',
      branch: 'uat',
      repository: 'test-repo',
      author_name: 'John Doe',
      author_email: 'john@example.com',
      files_changed: 5,
      lines_added: 100,
      lines_deleted: 50,
      total_issues: 0,
      critical_count: 0,
      major_count: 0,
      minor_count: 0,
      suggestion_count: 0,
      status: 'completed',
      started_at: new Date('2024-01-01T00:00:00Z'),
      completed_at: new Date('2024-01-01T00:05:00Z'),
      processing_time_ms: 300000,
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:05:00Z'),
    };

    vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview);
    vi.mocked(db.initialize).mockResolvedValue(undefined);
    vi.mocked(db.query).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/reviews/review-1');
    const response = await getReviewDetail(request, {
      params: { reviewId: 'review-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.review.total_issues).toBe(0);
    expect(data.data.comments).toHaveLength(0);
  });
});
