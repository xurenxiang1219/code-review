import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from './client';
import { logger } from '@/lib/utils/logger';

/**
 * 迁移记录接口
 */
interface MigrationRecord {
  id: number;
  filename: string;
  executed_at: Date;
}

/**
 * 迁移文件接口
 */
interface MigrationFile {
  filename: string;
  path: string;
  version: number;
}

/**
 * 数据库迁移管理器
 */
class DatabaseMigrator {
  private migrationsDir: string;

  constructor() {
    this.migrationsDir = join(process.cwd(), 'lib/db/migrations');
  }

  /**
   * 初始化迁移表
   */
  private async initMigrationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS \`migrations\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`filename\` VARCHAR(255) NOT NULL UNIQUE,
        \`executed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_filename\` (\`filename\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移记录表';
    `;

    await db.execute(sql);
    logger.info('迁移表初始化完成');
  }

  /**
   * 获取已执行的迁移记录
   */
  private async getExecutedMigrations(): Promise<string[]> {
    try {
      const migrations = await db.query<MigrationRecord>(
        'SELECT filename FROM migrations ORDER BY id ASC'
      );
      return migrations?.map(m => m.filename) ?? [];
    } catch (error) {
      // 迁移表不存在时返回空数组
      if (error instanceof Error && error.message.includes("doesn't exist")) {
        return [];
      }
      throw error;
    }
  }

  /**
   * 获取待执行的迁移文件
   */
  private async getPendingMigrations(): Promise<MigrationFile[]> {
    const fs = await import('fs/promises');
    
    try {
      const files = await fs.readdir(this.migrationsDir);
      const sqlFiles = (files ?? [])
        .filter(file => file?.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.getExecutedMigrations();
      const pendingFiles = sqlFiles.filter(file => !executedMigrations.includes(file));
      
      return pendingFiles.map(filename => ({
        filename,
        path: join(this.migrationsDir, filename),
        version: this.extractVersionFromFilename(filename),
      }));
    } catch (error) {
      logger.error('读取迁移文件失败', { error, migrationsDir: this.migrationsDir });
      throw error;
    }
  }

  /**
   * 从文件名提取版本号
   */
  private extractVersionFromFilename(filename: string): number {
    const match = filename.match(/^(\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 分割 SQL 语句，过滤空语句和注释
   */
  private splitSqlStatements(sqlContent: string): string[] {
    // 移除注释行并重新组合
    const cleanContent = sqlContent
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      })
      .join('\n');

    // 按分号分割并过滤无效语句
    return cleanContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => {
        if (!stmt) return false;
        const lower = stmt.toLowerCase();
        return !(lower.startsWith('/*') && lower.endsWith('*/'));
      });
  }

  /**
   * 执行单个迁移文件
   */
  private async executeMigration(migration: MigrationFile): Promise<void> {
    logger.info('开始执行迁移', { filename: migration.filename });

    try {
      const sqlContent = await readFile(migration.path, 'utf-8');
      const statements = this.splitSqlStatements(sqlContent);

      const connection = await db.beginTransaction();

      try {
        for (const statement of statements) {
          if (statement.trim()) {
            await connection.execute(statement);
          }
        }

        await connection.execute(
          'INSERT INTO migrations (filename) VALUES (?)',
          [migration.filename]
        );

        await db.commitTransaction(connection);
        
        logger.info('迁移执行成功', { 
          filename: migration.filename,
          statements: statements.length 
        });
      } catch (error) {
        await db.rollbackTransaction(connection);
        throw error;
      }
    } catch (error) {
      logger.error('迁移执行失败', { 
        filename: migration.filename,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 执行所有待执行的迁移
   */
  async migrate(): Promise<void> {
    try {
      logger.info('开始数据库迁移');

      await db.initialize();
      await this.initMigrationTable();

      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        logger.info('没有待执行的迁移');
        return;
      }

      logger.info('发现待执行的迁移', { 
        count: pendingMigrations.length,
        files: pendingMigrations.map(m => m?.filename).filter(Boolean)
      });

      pendingMigrations.sort((a, b) => a.version - b.version);

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      logger.info('数据库迁移完成', { 
        executedCount: pendingMigrations.length 
      });
    } catch (error) {
      logger.error('数据库迁移失败', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 回滚最后一次迁移（简单实现）
   */
  async rollback(): Promise<void> {
    try {
      logger.info('开始回滚最后一次迁移');

      await db.initialize();

      const lastMigration = await db.queryOne<MigrationRecord>(
        'SELECT * FROM migrations ORDER BY id DESC LIMIT 1'
      );

      if (!lastMigration) {
        logger.info('没有可回滚的迁移');
        return;
      }

      await db.execute('DELETE FROM migrations WHERE id = ?', [lastMigration.id]);

      logger.warn('迁移记录已删除，请手动处理数据库结构变更', {
        filename: lastMigration.filename,
        executedAt: lastMigration.executed_at
      });
    } catch (error) {
      logger.error('迁移回滚失败', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取迁移状态
   */
  async getStatus(): Promise<{
    executed: MigrationRecord[];
    pending: MigrationFile[];
  }> {
    await db.initialize();
    await this.initMigrationTable();

    const executed = await db.query<MigrationRecord>(
      'SELECT * FROM migrations ORDER BY id ASC'
    );
    const pending = await this.getPendingMigrations();

    return { executed, pending };
  }

  /**
   * 重置数据库（危险操作，仅用于开发环境）
   */
  async reset(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境禁止重置数据库');
    }

    logger.warn('开始重置数据库（删除所有表）');

    await db.initialize();

    const tables = await db.query<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_TYPE = 'BASE TABLE'`
    );

    if (tables.length === 0) {
      logger.info('数据库中没有表需要删除');
      return;
    }

    await db.execute('SET FOREIGN_KEY_CHECKS = 0');

    try {
      for (const table of tables) {
        await db.execute(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
        logger.info('表已删除', { tableName: table.TABLE_NAME });
      }
    } finally {
      await db.execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    logger.warn('数据库重置完成');
  }
}

// 导出单例实例
export const migrator = new DatabaseMigrator();

// 导出类型
export type { MigrationRecord, MigrationFile };
export { DatabaseMigrator };