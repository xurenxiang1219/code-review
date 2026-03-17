import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import { logger } from '@/lib/utils/logger';
import type { ReviewResult } from '@/types/review';
import type { CommitInfo } from '@/types/git';

/**
 * 审查记录数据库实体
 */
export interface ReviewEntity {
  id: string;
  commit_hash: string;
  branch: string;
  repository: string;
  author_name: string;
  author_email: string;
  files_changed: number;
  lines_added: number;
  lines_deleted: number;
  total_issues: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  suggestion_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  started_at: Date;
  completed_at?: Date;
  processing_time_ms?: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * 审查查询参数
 */
export interface ReviewQueryParams {
  branch?: string;
  repository?: string;
  author?: string;
  status?: ReviewEntity['status'];
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * 分页查询结果
 */
export interface PaginatedReviews {
  items: ReviewEntity[];
  total: number;
}

/**
 * 创建审查记录参数
 */
export interface CreateReviewParams {
  commit: CommitInfo;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
}

/**
 * 审查统计数据
 */
export interface ReviewStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  avgProcessingTime: number;
  issues: {
    total: number;
    critical: number;
    major: number;
    minor: number;
    suggestions: number;
  };
  successRate: number;
}

/**
 * 时间范围统计参数
 */
export interface StatsTimeRange {
  from?: Date;
  to?: Date;
  repository?: string;
  branch?: string;
}

/**
 * Review Repository - 审查记录数据访问层
 */
export class ReviewRepository {
  /**
   * 创建新的审查记录
   * @param params 创建参数
   * @returns 审查记录 ID
   */
  async createReview(params: CreateReviewParams): Promise<string> {
    const { commit, filesChanged, linesAdded, linesDeleted } = params;
    const reviewId = uuidv4();
    const now = new Date();

    try {
      await db.initialize();
      
      await db.execute(
        `INSERT INTO reviews (
          id, commit_hash, branch, repository, author_name, author_email,
          files_changed, lines_added, lines_deleted, total_issues,
          critical_count, major_count, minor_count, suggestion_count,
          status, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewId,
          commit.hash,
          commit.branch,
          commit.repository,
          commit.author.name,
          commit.author.email,
          filesChanged,
          linesAdded,
          linesDeleted,
          0, // 初始问题数为 0
          0, // 初始严重问题数为 0
          0, // 初始重要问题数为 0
          0, // 初始次要问题数为 0
          0, // 初始建议数为 0
          'pending',
          now,
          now,
          now
        ]
      );

      logger.info('Review record created', {
        reviewId,
        commitHash: commit.hash,
        branch: commit.branch,
        repository: commit.repository
      });

      return reviewId;
    } catch (error) {
      logger.error('Failed to create review record', {
        commitHash: commit.hash,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 根据 ID 获取审查记录
   * @param reviewId 审查记录 ID
   * @returns 审查记录或 null
   */
  async getReviewById(reviewId: string): Promise<ReviewEntity | null> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<ReviewEntity>(
        'SELECT * FROM reviews WHERE id = ?',
        [reviewId]
      );

      return result;
    } catch (error) {
      logger.error('Failed to get review by ID', {
        reviewId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 构建查询条件
   * @param params 查询参数
   * @returns 查询条件和参数
   */
  private buildWhereClause(params: ReviewQueryParams): { whereClause: string; values: any[] } {
    const { branch, repository, author, status, from, to } = params;
    const conditions: string[] = [];
    const values: any[] = [];

    if (branch) {
      conditions.push('branch = ?');
      values.push(branch);
    }

    if (repository) {
      conditions.push('repository = ?');
      values.push(repository);
    }

    if (author) {
      conditions.push('author_email = ?');
      values.push(author);
    }

    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }

    if (from) {
      conditions.push('created_at >= ?');
      values.push(from);
    }

    if (to) {
      conditions.push('created_at <= ?');
      values.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
  }

  /**
   * 查询审查记录列表
   * @param params 查询参数
   * @returns 分页查询结果
   */
  async getReviews(params: ReviewQueryParams = {}): Promise<PaginatedReviews> {
    const { page = 1, pageSize = 20 } = params;

    try {
      await db.initialize();
      
      const { whereClause, values } = this.buildWhereClause(params);

      // 查询总数
      const totalResult = await db.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM reviews ${whereClause}`,
        values
      );
      const total = totalResult?.total || 0;

      // 查询数据
      const offset = (page - 1) * pageSize;
      const items = await db.query<ReviewEntity>(
        `SELECT * FROM reviews ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [...values, pageSize, offset]
      );

      logger.debug('Reviews queried', {
        params,
        total,
        itemCount: items.length
      });

      return { items, total };
    } catch (error) {
      logger.error('Failed to query reviews', {
        params,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 更新审查状态
   * @param reviewId 审查记录 ID
   * @param status 新状态
   * @param errorMessage 错误消息（可选）
   * @returns 是否更新成功
   */
  async updateReviewStatus(
    reviewId: string,
    status: ReviewEntity['status'],
    errorMessage?: string
  ): Promise<boolean> {
    try {
      await db.initialize();
      const now = new Date();

      let query = 'UPDATE reviews SET status = ?, updated_at = ?';
      const values: any[] = [status, now];

      if (status === 'completed') {
        query += ', completed_at = ?';
        values.push(now);
      }

      if (errorMessage) {
        query += ', error_message = ?';
        values.push(errorMessage);
      }

      query += ' WHERE id = ?';
      values.push(reviewId);

      const result = await db.execute(query, values);

      if (result.affectedRows === 0) {
        logger.warn('Review not found for status update', { reviewId });
        return false;
      }

      logger.info('Review status updated', {
        reviewId,
        status,
        errorMessage
      });

      return true;
    } catch (error) {
      logger.error('Failed to update review status', {
        reviewId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 更新审查结果
   * @param reviewId 审查记录 ID
   * @param result 审查结果
   * @returns 是否更新成功
   */
  async updateReviewResult(reviewId: string, result: ReviewResult): Promise<boolean> {
    try {
      await db.initialize();
      const now = new Date();
      const { summary, processingTimeMs } = result;

      await db.execute(
        `UPDATE reviews SET 
          total_issues = ?,
          critical_count = ?,
          major_count = ?,
          minor_count = ?,
          suggestion_count = ?,
          processing_time_ms = ?,
          status = 'completed',
          completed_at = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          summary.total,
          summary.critical,
          summary.major,
          summary.minor,
          summary.suggestion,
          processingTimeMs,
          now,
          now,
          reviewId
        ]
      );

      logger.info('Review result updated', {
        reviewId,
        summary,
        processingTimeMs
      });

      return true;
    } catch (error) {
      logger.error('Failed to update review result', {
        reviewId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 根据提交哈希获取审查记录
   * @param commitHash 提交哈希
   * @returns 审查记录或 null
   */
  async getReviewByCommitHash(commitHash: string): Promise<ReviewEntity | null> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<ReviewEntity>(
        'SELECT * FROM reviews WHERE commit_hash = ? ORDER BY created_at DESC LIMIT 1',
        [commitHash]
      );

      return result;
    } catch (error) {
      logger.error('Failed to get review by commit hash', {
        commitHash,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 删除审查记录
   * @param reviewId 审查记录 ID
   * @returns 是否删除成功
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    try {
      await db.initialize();
      
      // 先删除相关的评论记录
      await db.execute('DELETE FROM review_comments WHERE review_id = ?', [reviewId]);
      
      // 删除审查记录
      const result = await db.execute('DELETE FROM reviews WHERE id = ?', [reviewId]);

      if (result.affectedRows === 0) {
        logger.warn('Review not found for deletion', { reviewId });
        return false;
      }

      logger.info('Review deleted', { reviewId });
      return true;
    } catch (error) {
      logger.error('Failed to delete review', {
        reviewId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取审查统计数据
   * @param timeRange 时间范围参数
   * @returns 统计数据
   */
  async getReviewStats(timeRange: StatsTimeRange = {}): Promise<ReviewStats> {
    try {
      await db.initialize();
      
      const { whereClause, values } = this.buildStatsWhereClause(timeRange);

    // 获取基础统计
    const basicStats = await db.queryOne<{
      total: number;
      completed: number;
      failed: number;
      pending: number;
      processing: number;
      avg_processing_time: number;
    }>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        AVG(CASE WHEN processing_time_ms IS NOT NULL THEN processing_time_ms ELSE NULL END) as avg_processing_time
      FROM reviews ${whereClause}
    `, values);

    // 获取问题统计 - 仅统计已完成的审查
    const issueStatsWhereClause = whereClause 
      ? `${whereClause} AND status = 'completed'`
      : 'WHERE status = \'completed\'';
      
    const issueStats = await db.queryOne<{
      total_issues: number;
      critical_issues: number;
      major_issues: number;
      minor_issues: number;
      suggestions: number;
    }>(`
      SELECT 
        SUM(total_issues) as total_issues,
        SUM(critical_count) as critical_issues,
        SUM(major_count) as major_issues,
        SUM(minor_count) as minor_issues,
        SUM(suggestion_count) as suggestions
      FROM reviews 
      ${issueStatsWhereClause}
    `, values);

    const total = basicStats?.total || 0;
    const completed = basicStats?.completed || 0;
    const failed = basicStats?.failed || 0;
    const pending = basicStats?.pending || 0;
    const processing = basicStats?.processing || 0;
    const avgProcessingTime = basicStats?.avg_processing_time || 0;

    const successRate = total > 0 ? (completed / total) * 100 : 100;

    const stats: ReviewStats = {
      total,
      completed,
      failed,
      pending,
      processing,
      avgProcessingTime,
      issues: {
        total: issueStats?.total_issues || 0,
        critical: issueStats?.critical_issues || 0,
        major: issueStats?.major_issues || 0,
        minor: issueStats?.minor_issues || 0,
        suggestions: issueStats?.suggestions || 0,
      },
      successRate,
    };

    logger.debug('Review stats calculated', {
      timeRange,
      stats,
    });

    return stats;
  } catch (error) {
    logger.error('Failed to get review stats', {
      timeRange,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 获取每日统计数据
 * @param days 天数
 * @param repository 仓库名（可选）
 * @returns 每日统计数据
 */
async getDailyStats(days = 30, repository?: string): Promise<Array<{
  date: string;
  total: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  totalIssues: number;
}>> {
  try {
    await db.initialize();
    
    const conditions = ['created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'];
    const values = [days];
    
    if (repository) {
      conditions.push('repository = ?');
      values.push(repository);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const dailyStats = await db.query<{
      date: string;
      total: number;
      completed: number;
      failed: number;
      avg_processing_time: number;
      total_issues: number;
    }>(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN processing_time_ms IS NOT NULL THEN processing_time_ms ELSE NULL END) as avg_processing_time,
        SUM(total_issues) as total_issues
      FROM reviews 
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, values);

    return dailyStats.map(stat => ({
      date: stat.date,
      total: stat.total,
      completed: stat.completed,
      failed: stat.failed,
      avgProcessingTime: stat.avg_processing_time || 0,
      totalIssues: stat.total_issues,
    }));
  } catch (error) {
    logger.error('Failed to get daily stats', {
      days,
      repository,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 获取热门问题类型统计
 * @param timeRange 时间范围
 * @returns 问题类型统计
 */
async getTopIssueCategories(timeRange: StatsTimeRange = {}): Promise<Array<{
  category: string;
  count: number;
  percentage: number;
}>> {
  try {
    await db.initialize();
    
    const { whereClause, values } = this.buildStatsWhereClause(timeRange);

    const categoryStats = await db.query<{
      category: string;
      count: number;
    }>(`
      SELECT 
        category,
        COUNT(*) as count
      FROM review_comments rc
      JOIN reviews r ON rc.review_id = r.id
      ${whereClause}
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `, values);

    const totalCount = categoryStats.reduce((sum, stat) => sum + stat.count, 0);

    return categoryStats.map(stat => ({
      category: stat.category,
      count: stat.count,
      percentage: totalCount > 0 ? (stat.count / totalCount) * 100 : 0,
    }));
  } catch (error) {
    logger.error('Failed to get top issue categories', {
      timeRange,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 构建统计查询的WHERE子句
 * @param timeRange 时间范围参数
 * @returns WHERE子句和参数
 */
  /**
   * 构建统计查询的WHERE子句
   * @param timeRange - 时间范围和过滤条件
   * @returns WHERE子句和对应的参数值
   */
  private buildStatsWhereClause(timeRange: StatsTimeRange): { whereClause: string; values: any[] } {
  const { from, to, repository, branch } = timeRange;
  const conditions: string[] = [];
  const values: any[] = [];

  if (from) {
    conditions.push('created_at >= ?');
    values.push(from);
  }

  if (to) {
    conditions.push('created_at <= ?');
    values.push(to);
  }

  if (repository) {
    conditions.push('repository = ?');
    values.push(repository);
  }

  if (branch) {
    conditions.push('branch = ?');
    values.push(branch);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
  }
}

// 导出单例实例
export const reviewRepository = new ReviewRepository();

// 导出便捷函数
export async function getReviewStats(timeRange?: StatsTimeRange): Promise<ReviewStats> {
  return reviewRepository.getReviewStats(timeRange);
}

export async function getDailyStats(days?: number, repository?: string) {
  return reviewRepository.getDailyStats(days, repository);
}

export async function getTopIssueCategories(timeRange?: StatsTimeRange) {
  return reviewRepository.getTopIssueCategories(timeRange);
}