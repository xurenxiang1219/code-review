import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

/**
 * 轮询日志接口
 */
export interface PollingLog {
  id: string;
  repository: string;
  branch: string;
  scanType: 'scheduled' | 'manual' | 'startup';
  status: 'running' | 'success' | 'error';
  message: string;
  errorDetails?: string;
  durationMs?: number;
  commitsFound: number;
  commitsProcessed: number;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

/**
 * 轮询统计接口
 */
export interface PollingStats {
  id: string;
  repository: string;
  branch: string;
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  lastScanAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  avgDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 轮询日志数据库实体
 */
interface PollingLogEntity {
  id: string;
  repository: string;
  branch: string;
  scan_type: string;
  status: string;
  message: string;
  error_details?: string;
  duration_ms?: number;
  commits_found: number;
  commits_processed: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
}

/**
 * 轮询统计数据库实体
 */
interface PollingStatsEntity {
  id: string;
  repository: string;
  branch: string;
  total_scans: number;
  successful_scans: number;
  failed_scans: number;
  last_scan_at?: string;
  last_success_at?: string;
  last_error_at?: string;
  last_error_message?: string;
  avg_duration_ms: number;
  created_at: string;
  updated_at: string;
}

/**
 * 轮询日志仓库类
 */
class PollingLogsRepository {
  /**
   * 创建轮询日志记录
   * @param logData 日志数据
   * @returns 创建的日志记录
   */
  async createLog(logData: {
    repository: string;
    branch: string;
    scanType: 'scheduled' | 'manual' | 'startup';
    status: 'running' | 'success' | 'error';
    message: string;
    errorDetails?: string;
    durationMs?: number;
    commitsFound?: number;
    commitsProcessed?: number;
    startedAt: Date;
    completedAt?: Date;
  }): Promise<PollingLog> {
    try {
      await db.initialize();
      
      const id = uuidv4();
      const now = new Date();
      
      await db.execute(
        `INSERT INTO polling_logs (
          id, repository, branch, scan_type, status, message, 
          error_details, duration_ms, commits_found, commits_processed,
          started_at, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          logData.repository,
          logData.branch,
          logData.scanType,
          logData.status,
          logData.message,
          logData.errorDetails ?? null,
          logData.durationMs ?? null,
          logData.commitsFound ?? 0,
          logData.commitsProcessed ?? 0,
          logData.startedAt ? this.formatDateForMySQL(logData.startedAt) : null,
          logData.completedAt ? this.formatDateForMySQL(logData.completedAt) : null,
          this.formatDateForMySQL(now),
        ]
      );

      // 不在创建日志时更新统计信息，避免重复计算
      // 统计信息将在 updateLog 时更新

      return this.entityToLog({
        id,
        repository: logData.repository,
        branch: logData.branch,
        scan_type: logData.scanType,
        status: logData.status,
        message: logData.message,
        error_details: logData.errorDetails,
        duration_ms: logData.durationMs,
        commits_found: logData.commitsFound ?? 0,
        commits_processed: logData.commitsProcessed ?? 0,
        started_at: logData.startedAt ? this.formatDateForMySQL(logData.startedAt) : '',
        completed_at: logData.completedAt ? this.formatDateForMySQL(logData.completedAt) : undefined,
        created_at: this.formatDateForMySQL(now),
      });
    } catch (error) {
      logger.error('Failed to create polling log', {
        error: error instanceof Error ? error.message : String(error),
        logData,
      });
      throw error;
    }
  }

  /**
   * 更新轮询日志记录
   * @param id 日志记录ID
   * @param updateData 更新数据
   * @returns 更新后的日志记录
   */
  async updateLog(id: string, updateData: {
    status?: 'running' | 'success' | 'error';
    message?: string;
    errorDetails?: string;
    durationMs?: number;
    commitsFound?: number;
    commitsProcessed?: number;
    completedAt?: Date;
  }): Promise<PollingLog | null> {
    try {
      await db.initialize();
      
      const setParts: string[] = [];
      const params: any[] = [];
      
      const fieldMappings = [
        { key: 'status', field: 'status' },
        { key: 'message', field: 'message' },
        { key: 'errorDetails', field: 'error_details' },
        { key: 'durationMs', field: 'duration_ms' },
        { key: 'commitsFound', field: 'commits_found' },
        { key: 'commitsProcessed', field: 'commits_processed' },
      ];
      
      fieldMappings.forEach(({ key, field }) => {
        if (updateData[key as keyof typeof updateData] !== undefined) {
          setParts.push(`${field} = ?`);
          params.push(updateData[key as keyof typeof updateData]);
        }
      });
      
      if (updateData.completedAt !== undefined) {
        setParts.push('completed_at = ?');
        params.push(this.formatDateForMySQL(updateData.completedAt));
      }
      
      if (setParts.length === 0) {
        return null;
      }
      
      params.push(id);
      
      const result = await db.execute(
        `UPDATE polling_logs SET ${setParts.join(', ')} WHERE id = ?`,
        params
      );
      
      if (result.affectedRows === 0) {
        return null;
      }
      
      // 获取更新后的记录
      const updatedEntity = await db.queryOne<PollingLogEntity>(
        'SELECT * FROM polling_logs WHERE id = ?',
        [id]
      );
      
      if (!updatedEntity) {
        return null;
      }
      
      // 更新统计信息（只在非运行状态时更新）
      if (updateData.status && updateData.status !== 'running') {
        const logEntity = await db.queryOne<PollingLogEntity>(
          'SELECT repository, branch FROM polling_logs WHERE id = ?',
          [id]
        );
        
        if (logEntity) {
          await this.updateStats(
            logEntity.repository,
            logEntity.branch,
            updateData.status,
            updateData.durationMs
          );
        }
      }
      
      return this.entityToLog(updatedEntity);
    } catch (error) {
      logger.error('Failed to update polling log', {
        error: error instanceof Error ? error.message : String(error),
        id,
        updateData,
      });
      throw error;
    }
  }
  async getLogs(options: {
    repository?: string;
    branch?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PollingLog[]> {
    try {
      await db.initialize();
      
      let sql = 'SELECT * FROM polling_logs WHERE 1=1';
      const params: any[] = [];
      
      if (options.repository) {
        sql += ' AND repository = ?';
        params.push(options.repository);
      }
      
      if (options.branch) {
        sql += ' AND branch = ?';
        params.push(options.branch);
      }
      
      if (options.status) {
        sql += ' AND status = ?';
        params.push(options.status);
      }
      
      sql += ' ORDER BY created_at DESC';
      
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }
      
      const entities = await db.query<PollingLogEntity>(sql, params);
      return (entities ?? []).map(entity => this.entityToLog(entity));
    } catch (error) {
      logger.error('Failed to get polling logs', {
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      throw error;
    }
  }

  /**
   * 获取指定仓库和分支的最后一次成功扫描记录
   * @param repository 仓库名称
   * @param branch 分支名称
   * @returns 最后一次成功扫描记录，如果没有找到则返回 null
   */
  async getLastSuccessfulScan(repository: string, branch: string): Promise<PollingLog | null> {
    try {
      await db.initialize();
      
      const entity = await db.queryOne<PollingLogEntity>(
        `SELECT * FROM polling_logs 
         WHERE repository = ? AND branch = ? AND status = 'success' 
         ORDER BY completed_at DESC 
         LIMIT 1`,
        [repository, branch]
      );
      
      return entity ? this.entityToLog(entity) : null;
    } catch (error) {
      logger.error('Failed to get last successful scan', {
        error: error instanceof Error ? error.message : String(error),
        repository,
        branch,
      });
      return null;
    }
  }

  /**
   * 获取轮询统计信息
   * @param repository 仓库地址
   * @param branch 分支名称
   * @returns 统计信息
   */
  async getStats(repository?: string, branch?: string): Promise<PollingStats[]> {
    try {
      await db.initialize();
      
      let sql = 'SELECT * FROM polling_stats WHERE 1=1';
      const params: any[] = [];
      
      if (repository) {
        sql += ' AND repository = ?';
        params.push(repository);
      }
      
      if (branch) {
        sql += ' AND branch = ?';
        params.push(branch);
      }
      
      sql += ' ORDER BY updated_at DESC';
      
      const entities = await db.query<PollingStatsEntity>(sql, params);
      return (entities ?? []).map(entity => this.entityToStats(entity));
    } catch (error) {
      logger.error('Failed to get polling stats', {
        error: error instanceof Error ? error.message : String(error),
        repository,
        branch,
      });
      throw error;
    }
  }

  /**
   * 更新统计信息
   * @param repository 仓库地址
   * @param branch 分支名称
   * @param status 扫描状态
   * @param durationMs 扫描耗时
   */
  /**
   * 更新轮询统计数据
   * @param repository 仓库名称
   * @param branch 分支名称
   * @param status 扫描状态
   * @param durationMs 扫描耗时（毫秒）
   */
  private async updateStats(
    repository: string,
    branch: string,
    status: 'running' | 'success' | 'error',
    durationMs?: number
  ): Promise<void> {
    // 只在扫描完成时更新统计，running 状态跳过
    if (status === 'running') {
      return;
    }

    try {
      const now = new Date();
      const nowFormatted = this.formatDateForMySQL(now);
      const duration = durationMs ?? 0;
      const isSuccess = status === 'success';
      const isError = status === 'error';
      
      // 构建 SQL 参数数组，避免重复计算
      const insertParams = [
        uuidv4(),
        repository,
        branch,
        isSuccess ? 1 : 0,
        isError ? 1 : 0,
        nowFormatted,
        isSuccess ? nowFormatted : null,
        isError ? nowFormatted : null,
        duration,
        nowFormatted,
        nowFormatted,
      ];

      const updateParams = [
        isSuccess ? 1 : 0,
        isError ? 1 : 0,
        nowFormatted,
        status,
        nowFormatted,
        status,
        nowFormatted,
        duration,
        duration,
        nowFormatted,
      ];
      
      await db.execute(
        `INSERT INTO polling_stats (
          id, repository, branch, total_scans, successful_scans, failed_scans,
          last_scan_at, last_success_at, last_error_at, avg_duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_scans = total_scans + 1,
          successful_scans = successful_scans + ?,
          failed_scans = failed_scans + ?,
          last_scan_at = ?,
          last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
          last_error_at = CASE WHEN ? = 'error' THEN ? ELSE last_error_at END,
          avg_duration_ms = CASE WHEN ? > 0 THEN 
            (avg_duration_ms * (total_scans - 1) + ?) / total_scans 
            ELSE avg_duration_ms END,
          updated_at = ?`,
        [...insertParams, ...updateParams]
      );
    } catch (error) {
      logger.error('Failed to update polling stats', {
        error: error instanceof Error ? error.message : String(error),
        repository,
        branch,
        status,
        durationMs,
      });
    }
  }

  /**
   * 将 Date 对象转换为 MySQL TIMESTAMP 格式
   * @param date Date 对象
   * @returns MySQL TIMESTAMP 格式字符串
   */
  private formatDateForMySQL(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  private entityToLog(entity: PollingLogEntity): PollingLog {
    return {
      id: entity.id,
      repository: entity.repository,
      branch: entity.branch,
      scanType: entity.scan_type as 'scheduled' | 'manual' | 'startup',
      status: entity.status as 'running' | 'success' | 'error',
      message: entity.message,
      errorDetails: entity.error_details,
      durationMs: entity.duration_ms,
      commitsFound: entity.commits_found,
      commitsProcessed: entity.commits_processed,
      startedAt: entity.started_at,
      completedAt: entity.completed_at,
      createdAt: entity.created_at,
    };
  }

  /**
   * 转换数据库实体为统计对象
   * @param entity 数据库实体
   * @returns 统计对象
   */
  private entityToStats(entity: PollingStatsEntity): PollingStats {
    return {
      id: entity.id,
      repository: entity.repository,
      branch: entity.branch,
      totalScans: entity.total_scans,
      successfulScans: entity.successful_scans,
      failedScans: entity.failed_scans,
      lastScanAt: entity.last_scan_at,
      lastSuccessAt: entity.last_success_at,
      lastErrorAt: entity.last_error_at,
      lastErrorMessage: entity.last_error_message,
      avgDurationMs: entity.avg_duration_ms,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    };
  }
}

// 导出单例实例
export const pollingLogsRepository = new PollingLogsRepository();