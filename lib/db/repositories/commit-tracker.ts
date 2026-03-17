import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import { logger } from '@/lib/utils/logger';
import type { CommitInfo } from '@/types/git';

/**
 * 提交追踪记录数据库实体
 */
export interface CommitTrackerEntity {
  id: string;
  commit_hash: string;
  branch: string;
  repository: string;
  trigger_source: 'webhook' | 'polling';
  processed_at: Date;
  review_id?: string;
  created_at: Date;
}

/**
 * 提交元数据
 */
export interface CommitMetadata {
  triggerSource: 'webhook' | 'polling';
  reviewId?: string;
  author?: {
    name: string;
    email: string;
  };
  message?: string;
}

/**
 * 查询参数
 */
export interface CommitTrackerQueryParams {
  branch?: string;
  repository?: string;
  triggerSource?: 'webhook' | 'polling';
  from?: Date;
  to?: Date;
  limit?: number;
}

/**
 * Commit Tracker Repository - 提交追踪数据访问层
 */
export class CommitTrackerRepository {
  /**
   * 记录已处理的提交
   * @param commitHash 提交哈希
   * @param metadata 元数据
   */
  async track(commitHash: string, metadata: CommitMetadata): Promise<void> {
    // 使用 trackCommit 方法的简化版本，需要构造 CommitInfo
    const commit: CommitInfo = {
      hash: commitHash,
      branch: 'uat', // 默认分支，实际应用中应从配置获取
      repository: 'default-repo', // 默认仓库，实际应用中应从配置获取
      author: metadata.author || { name: 'Unknown', email: 'unknown@example.com' },
      message: metadata.message || '',
      timestamp: new Date(),
      url: ''
    };

    await this.trackCommit(commit, metadata);
  }

  /**
   * 记录提交信息（完整版本）
   * @param commit 提交信息
   * @param metadata 元数据
   */
  async trackCommit(commit: CommitInfo, metadata: CommitMetadata): Promise<void> {
    const { triggerSource, reviewId } = metadata;
    const trackerId = uuidv4();
    const now = new Date();

    try {
      await db.initialize();

      await db.execute(
        `INSERT INTO commit_tracker (
          id, commit_hash, branch, repository, trigger_source,
          processed_at, review_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          trigger_source = VALUES(trigger_source),
          processed_at = VALUES(processed_at),
          review_id = VALUES(review_id)`,
        [
          trackerId,
          commit.hash,
          commit.branch,
          commit.repository,
          triggerSource,
          now,
          reviewId || null,
          now
        ]
      );

      logger.info('Commit tracked with full info', {
        commitHash: commit.hash,
        branch: commit.branch,
        repository: commit.repository,
        triggerSource,
        reviewId,
        trackerId
      });
    } catch (error) {
      logger.error('Failed to track commit with full info', {
        commitHash: commit.hash,
        triggerSource,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 检查提交是否已被追踪
   * @param commitHash 提交哈希
   * @returns 是否已被追踪
   */
  async isTracked(commitHash: string): Promise<boolean> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM commit_tracker WHERE commit_hash = ?',
        [commitHash]
      );

      const isTracked = (result?.count || 0) > 0;

      logger.debug('Commit tracking check', {
        commitHash,
        isTracked
      });

      return isTracked;
    } catch (error) {
      logger.error('Failed to check if commit is tracked', {
        commitHash,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取指定分支的最后处理提交
   * @param branch 分支名
   * @param repository 仓库名（可选）
   * @returns 最后处理的提交哈希或 null
   */
  async getLastProcessed(branch: string, repository?: string): Promise<string | null> {
    try {
      await db.initialize();
      
      let query = 'SELECT commit_hash FROM commit_tracker WHERE branch = ?';
      const values: any[] = [branch];

      if (repository) {
        query += ' AND repository = ?';
        values.push(repository);
      }

      query += ' ORDER BY processed_at DESC LIMIT 1';

      const result = await db.queryOne<{ commit_hash: string }>(query, values);

      if (!result) {
        logger.debug('No processed commits found', { branch, repository });
        return null;
      }

      const lastCommitHash = result.commit_hash;
      
      logger.debug('Last processed commit retrieved', {
        branch,
        repository,
        lastCommitHash
      });

      return lastCommitHash;
    } catch (error) {
      logger.error('Failed to get last processed commit', {
        branch,
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取追踪记录详情
   * @param commitHash 提交哈希
   * @returns 追踪记录或 null
   */
  async getTrackingInfo(commitHash: string): Promise<CommitTrackerEntity | null> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<CommitTrackerEntity>(
        'SELECT * FROM commit_tracker WHERE commit_hash = ? ORDER BY processed_at DESC LIMIT 1',
        [commitHash]
      );

      return result;
    } catch (error) {
      logger.error('Failed to get tracking info', {
        commitHash,
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
  private buildTrackingWhereClause(params: CommitTrackerQueryParams): { whereClause: string; values: any[] } {
    const { branch, repository, triggerSource, from, to } = params;
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

    if (triggerSource) {
      conditions.push('trigger_source = ?');
      values.push(triggerSource);
    }

    if (from) {
      conditions.push('processed_at >= ?');
      values.push(from);
    }

    if (to) {
      conditions.push('processed_at <= ?');
      values.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
  }

  /**
   * 查询追踪记录列表
   * @param params 查询参数
   * @returns 追踪记录列表
   */
  async getTrackingRecords(params: CommitTrackerQueryParams = {}): Promise<CommitTrackerEntity[]> {
    const { limit = 100 } = params;

    try {
      await db.initialize();
      
      const { whereClause, values } = this.buildTrackingWhereClause(params);

      const records = await db.query<CommitTrackerEntity>(
        `SELECT * FROM commit_tracker ${whereClause} 
         ORDER BY processed_at DESC 
         LIMIT ?`,
        [...values, limit]
      );

      logger.debug('Tracking records queried', {
        params,
        recordCount: records.length
      });

      return records;
    } catch (error) {
      logger.error('Failed to query tracking records', {
        params,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 更新追踪记录的审查 ID
   * @param commitHash 提交哈希
   * @param reviewId 审查 ID
   * @returns 是否更新成功
   */
  async updateReviewId(commitHash: string, reviewId: string): Promise<boolean> {
    try {
      await db.initialize();
      
      const result = await db.execute(
        'UPDATE commit_tracker SET review_id = ? WHERE commit_hash = ?',
        [reviewId, commitHash]
      );

      if (result.affectedRows === 0) {
        logger.warn('No tracking record found to update review ID', {
          commitHash,
          reviewId
        });
        return false;
      }

      logger.info('Tracking record review ID updated', {
        commitHash,
        reviewId
      });

      return true;
    } catch (error) {
      logger.error('Failed to update tracking record review ID', {
        commitHash,
        reviewId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 删除过期的追踪记录
   * @param daysToKeep 保留天数
   * @returns 删除的记录数
   */
  async cleanupOldRecords(daysToKeep: number = 90): Promise<number> {
    try {
      await db.initialize();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await db.execute(
        'DELETE FROM commit_tracker WHERE created_at < ?',
        [cutoffDate]
      );

      const deletedCount = result.affectedRows;

      logger.info('Old tracking records cleaned up', {
        daysToKeep,
        cutoffDate,
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old tracking records', {
        daysToKeep,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取分支的处理统计信息
   * @param branch 分支名
   * @param repository 仓库名（可选）
   * @returns 统计信息
   */
  async getBranchStats(branch: string, repository?: string): Promise<{
    totalProcessed: number;
    webhookCount: number;
    pollingCount: number;
    lastProcessedAt?: Date;
  }> {
    try {
      await db.initialize();
      
      let whereClause = 'WHERE branch = ?';
      const values: any[] = [branch];

      if (repository) {
        whereClause += ' AND repository = ?';
        values.push(repository);
      }

      const result = await db.queryOne<{
        total_processed: number;
        webhook_count: number;
        polling_count: number;
        last_processed_at: Date;
      }>(
        `SELECT 
          COUNT(*) as total_processed,
          SUM(CASE WHEN trigger_source = 'webhook' THEN 1 ELSE 0 END) as webhook_count,
          SUM(CASE WHEN trigger_source = 'polling' THEN 1 ELSE 0 END) as polling_count,
          MAX(processed_at) as last_processed_at
        FROM commit_tracker ${whereClause}`,
        values
      );

      return {
        totalProcessed: result?.total_processed || 0,
        webhookCount: result?.webhook_count || 0,
        pollingCount: result?.polling_count || 0,
        lastProcessedAt: result?.last_processed_at || undefined
      };
    } catch (error) {
      logger.error('Failed to get branch stats', {
        branch,
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// 导出单例实例
export const commitTrackerRepository = new CommitTrackerRepository();