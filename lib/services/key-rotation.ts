import { keyManager, sensitiveDataManager } from '@/lib/utils/crypto';
import { configEncryptionService } from './config-encryption';
import { databaseEncryptionService } from './database-encryption';
import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';

/**
 * 密钥轮换状态
 */
export enum KeyRotationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 密钥轮换记录
 */
export interface KeyRotationRecord {
  id: string;
  keyType: 'config' | 'database' | 'log' | 'master';
  status: KeyRotationStatus;
  startedAt: Date;
  completedAt?: Date;
  affectedRecords: number;
  errorMessage?: string;
}

/**
 * 密钥轮换服务
 * 负责系统中所有加密密钥的安全轮换
 */
export class KeyRotationService {
  private readonly rotationInProgress = new Set<string>();

  /**
   * 轮换配置加密密钥
   * @returns 轮换结果
   */
  async rotateConfigKeys(): Promise<KeyRotationRecord> {
    const rotationId = this.generateRotationId('config');
    
    if (this.rotationInProgress.has('config')) {
      throw new Error('配置密钥轮换已在进行中');
    }

    this.rotationInProgress.add('config');
    
    const record: KeyRotationRecord = {
      id: rotationId,
      keyType: 'config',
      status: KeyRotationStatus.IN_PROGRESS,
      startedAt: new Date(),
      affectedRecords: 0,
    };

    try {
      logger.encryption('开始轮换配置加密密钥', 'config', { rotationId });

      // 获取所有配置记录
      await db.initialize();
      const configs = await db.execute('SELECT * FROM review_config');

      let affectedCount = 0;

      for (const config of configs.rows) {
        try {
          // 解析配置数据
          const configData = {
            ...config,
            ai_model_config: config.ai_model_config ? JSON.parse(config.ai_model_config as string) : {},
            notification_config: config.notification_config ? JSON.parse(config.notification_config as string) : {},
          };

          // 轮换密钥
          const rotatedConfig = configEncryptionService.rotateConfigKeys(configData);

          // 更新数据库
          await db.execute(
            `UPDATE review_config 
             SET ai_model_config = ?, notification_config = ?, updated_at = NOW() 
             WHERE id = ?`,
            [
              JSON.stringify(rotatedConfig.ai_model_config),
              JSON.stringify(rotatedConfig.notification_config),
              config.id,
            ]
          );

          affectedCount++;
        } catch (error) {
          logger.error('配置记录密钥轮换失败', {
            configId: config.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      record.status = KeyRotationStatus.COMPLETED;
      record.completedAt = new Date();
      record.affectedRecords = affectedCount;

      logger.encryption('配置密钥轮换完成', 'config', {
        rotationId,
        affectedRecords: affectedCount,
        duration: record.completedAt.getTime() - record.startedAt.getTime(),
      });

      return record;
    } catch (error) {
      record.status = KeyRotationStatus.FAILED;
      record.errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('配置密钥轮换失败', {
        rotationId,
        error: record.errorMessage,
      });

      throw error;
    } finally {
      this.rotationInProgress.delete('config');
    }
  }

  /**
   * 轮换数据库加密密钥
   * @returns 轮换结果
   */
  async rotateDatabaseKeys(): Promise<KeyRotationRecord> {
    const rotationId = this.generateRotationId('database');
    
    if (this.rotationInProgress.has('database')) {
      throw new Error('数据库密钥轮换已在进行中');
    }

    this.rotationInProgress.add('database');
    
    const record: KeyRotationRecord = {
      id: rotationId,
      keyType: 'database',
      status: KeyRotationStatus.IN_PROGRESS,
      startedAt: new Date(),
      affectedRecords: 0,
    };

    try {
      logger.encryption('开始轮换数据库加密密钥', 'database', { rotationId });

      await db.initialize();
      let totalAffected = 0;

      // 轮换各个表的加密字段
      const tableConfigs = databaseEncryptionService.getAllTableConfigs();

      for (const { tableName, sensitiveFields } of tableConfigs) {
        if (sensitiveFields.length === 0) continue;

        try {
          // 获取表中的所有记录
          const records = await db.execute(`SELECT * FROM ${tableName}`);
          
          for (const record of records.rows) {
            try {
              // 轮换记录的加密密钥
              const rotatedRecord = databaseEncryptionService.rotateRecordKeys(
                tableName, 
                [record as Record<string, any>]
              )[0];

              // 构建更新语句
              const updateFields = sensitiveFields
                .filter(field => field in rotatedRecord)
                .map(field => `${field} = ?`)
                .join(', ');

              if (updateFields) {
                const updateValues = sensitiveFields
                  .filter(field => field in rotatedRecord)
                  .map(field => rotatedRecord[field]);

                await db.execute(
                  `UPDATE ${tableName} SET ${updateFields}, updated_at = NOW() WHERE id = ?`,
                  [...updateValues, record.id]
                );

                totalAffected++;
              }
            } catch (error) {
              logger.error('数据库记录密钥轮换失败', {
                tableName,
                recordId: record.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } catch (error) {
          logger.error('表密钥轮换失败', {
            tableName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      record.status = KeyRotationStatus.COMPLETED;
      record.completedAt = new Date();
      record.affectedRecords = totalAffected;

      logger.encryption('数据库密钥轮换完成', 'database', {
        rotationId,
        affectedRecords: totalAffected,
        duration: record.completedAt.getTime() - record.startedAt.getTime(),
      });

      return record;
    } catch (error) {
      record.status = KeyRotationStatus.FAILED;
      record.errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('数据库密钥轮换失败', {
        rotationId,
        error: record.errorMessage,
      });

      throw error;
    } finally {
      this.rotationInProgress.delete('database');
    }
  }

  /**
   * 检查密钥是否需要轮换
   * @param keyType - 密钥类型
   * @returns 是否需要轮换
   */
  async shouldRotateKey(keyType: 'config' | 'database' | 'log'): Promise<boolean> {
    try {
      // 从数据库获取上次轮换时间
      await db.initialize();
      const result = await db.execute(
        'SELECT completed_at FROM key_rotation_log WHERE key_type = ? AND status = ? ORDER BY completed_at DESC LIMIT 1',
        [keyType, KeyRotationStatus.COMPLETED]
      );

      if (result.rows.length === 0) {
        // 如果没有轮换记录，建议立即轮换
        return true;
      }

      const lastRotation = new Date(result.rows[0].completed_at as string);
      return keyManager.shouldRotateKey(lastRotation);
    } catch (error) {
      logger.error('检查密钥轮换状态失败', {
        keyType,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 获取密钥轮换历史
   * @param keyType - 密钥类型（可选）
   * @param limit - 返回记录数限制
   * @returns 轮换历史记录
   */
  async getRotationHistory(keyType?: string, limit: number = 50): Promise<KeyRotationRecord[]> {
    try {
      await db.initialize();
      
      let query = 'SELECT * FROM key_rotation_log';
      const params: any[] = [];

      if (keyType) {
        query += ' WHERE key_type = ?';
        params.push(keyType);
      }

      query += ' ORDER BY started_at DESC LIMIT ?';
      params.push(limit);

      const result = await db.execute(query, params);
      
      return result.rows.map(row => ({
        id: row.id as string,
        keyType: row.key_type as any,
        status: row.status as KeyRotationStatus,
        startedAt: new Date(row.started_at as string),
        completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
        affectedRecords: row.affected_records as number,
        errorMessage: row.error_message as string || undefined,
      }));
    } catch (error) {
      logger.error('获取密钥轮换历史失败', {
        keyType,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 记录密钥轮换日志
   * @param record - 轮换记录
   */
  private async logRotation(record: KeyRotationRecord): Promise<void> {
    try {
      await db.initialize();
      await db.execute(
        `INSERT INTO key_rotation_log 
         (id, key_type, status, started_at, completed_at, affected_records, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.keyType,
          record.status,
          record.startedAt,
          record.completedAt || null,
          record.affectedRecords,
          record.errorMessage || null,
        ]
      );
    } catch (error) {
      logger.error('记录密钥轮换日志失败', {
        rotationId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 生成轮换ID
   * @param keyType - 密钥类型
   * @returns 轮换ID
   */
  private generateRotationId(keyType: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `rotation-${keyType}-${timestamp}`;
  }

  /**
   * 验证所有加密数据的完整性
   * @returns 验证结果
   */
  async validateAllEncryptedData(): Promise<{
    valid: boolean;
    errors: Array<{ type: string; id: string; error: string }>;
  }> {
    const errors: Array<{ type: string; id: string; error: string }> = [];

    try {
      logger.info('开始验证所有加密数据完整性');

      // 验证配置数据
      await db.initialize();
      const configs = await db.execute('SELECT * FROM review_config');

      for (const config of configs.rows) {
        const validation = configEncryptionService.validateConfigIntegrity(config as Record<string, any>);
        if (!validation.valid) {
          errors.push({
            type: 'config',
            id: config.id as string,
            error: validation.errors.join('; '),
          });
        }
      }

      // 验证数据库记录
      const tableConfigs = databaseEncryptionService.getAllTableConfigs();
      for (const { tableName } of tableConfigs) {
        try {
          const records = await db.execute(`SELECT * FROM ${tableName} LIMIT 100`);
          
          for (const record of records.rows) {
            const validation = databaseEncryptionService.validateRecordIntegrity(
              tableName, 
              record as Record<string, any>
            );
            
            if (!validation.valid) {
              errors.push({
                type: `database.${tableName}`,
                id: record.id as string,
                error: validation.errors.join('; '),
              });
            }
          }
        } catch (error) {
          errors.push({
            type: `database.${tableName}`,
            id: 'table',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('加密数据完整性验证完成', {
        totalErrors: errors.length,
        configErrors: errors.filter(e => e.type === 'config').length,
        databaseErrors: errors.filter(e => e.type.startsWith('database')).length,
      });

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error('加密数据完整性验证失败', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        errors: [{
          type: 'system',
          id: 'validation',
          error: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }
}

// 导出单例实例
export const keyRotationService = new KeyRotationService();