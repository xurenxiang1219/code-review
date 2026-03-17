import { sensitiveDataManager } from '@/lib/utils/crypto';
import { logger } from '@/lib/utils/logger';

/**
 * 数据库字段加密配置
 */
interface DatabaseFieldConfig {
  /** 表名 */
  tableName: string;
  /** 敏感字段列表 */
  sensitiveFields: string[];
}

/**
 * 数据库加密服务
 * 负责数据库记录的敏感字段加密和解密
 */
export class DatabaseEncryptionService {
  private readonly tableConfigs: Map<string, string[]> = new Map([
    // 审查配置表
    ['review_config', [
      'ai_model_config', // JSON 字段中可能包含 API 密钥
      'notification_config', // JSON 字段中可能包含 SMTP 密码等
    ]],
    
    // 通知日志表
    ['notification_log', [
      'recipient_email', // 邮箱地址可能需要加密
    ]],
    
    // 用户认证表（如果存在）
    ['users', [
      'email',
      'password_hash',
      'api_key',
      'refresh_token',
    ]],
    
    // API 密钥表（如果存在）
    ['api_keys', [
      'key_hash',
      'secret',
    ]],
  ]);

  /**
   * 加密数据库记录
   * @param tableName - 表名
   * @param record - 数据库记录
   * @returns 加密后的记录
   */
  encryptRecord<T extends Record<string, any>>(tableName: string, record: T): T {
    const sensitiveFields = this.tableConfigs.get(tableName);
    
    if (!sensitiveFields || sensitiveFields.length === 0) {
      return record;
    }

    try {
      logger.debug('开始加密数据库记录', {
        tableName,
        recordId: record.id || 'unknown',
        sensitiveFieldsCount: sensitiveFields.length,
      });

      const encryptedRecord = sensitiveDataManager.encryptDatabaseRecord(record, sensitiveFields);

      logger.debug('数据库记录加密完成', {
        tableName,
        recordId: record.id || 'unknown',
      });

      return encryptedRecord;
    } catch (error) {
      logger.error('数据库记录加密失败', {
        tableName,
        recordId: record.id || 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`数据库记录加密失败: ${tableName}`);
    }
  }

  /**
   * 解密数据库记录
   * @param tableName - 表名
   * @param record - 加密的数据库记录
   * @returns 解密后的记录
   */
  decryptRecord<T extends Record<string, any>>(tableName: string, record: T): T {
    const sensitiveFields = this.tableConfigs.get(tableName);
    
    if (!sensitiveFields || sensitiveFields.length === 0) {
      return record;
    }

    try {
      logger.debug('开始解密数据库记录', {
        tableName,
        recordId: record.id || 'unknown',
      });

      const decryptedRecord = sensitiveDataManager.decryptDatabaseRecord(record, sensitiveFields);

      logger.debug('数据库记录解密完成', {
        tableName,
        recordId: record.id || 'unknown',
      });

      return decryptedRecord;
    } catch (error) {
      logger.error('数据库记录解密失败', {
        tableName,
        recordId: record.id || 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
      
      // 解密失败时返回原记录，避免系统崩溃
      logger.warn('解密失败，返回原记录', { tableName, recordId: record.id || 'unknown' });
      return record;
    }
  }

  /**
   * 批量加密数据库记录
   * @param tableName - 表名
   * @param records - 数据库记录数组
   * @returns 加密后的记录数组
   */
  encryptRecords<T extends Record<string, any>>(tableName: string, records: T[]): T[] {
    return records.map(record => this.encryptRecord(tableName, record));
  }

  /**
   * 批量解密数据库记录
   * @param tableName - 表名
   * @param records - 加密的数据库记录数组
   * @returns 解密后的记录数组
   */
  decryptRecords<T extends Record<string, any>>(tableName: string, records: T[]): T[] {
    return records.map(record => this.decryptRecord(tableName, record));
  }

  /**
   * 处理 JSON 字段的加密
   * @param jsonData - JSON 数据
   * @param sensitiveFields - JSON 中的敏感字段
   * @returns 加密后的 JSON 数据
   */
  encryptJsonField(jsonData: any, sensitiveFields: string[]): any {
    if (!jsonData || typeof jsonData !== 'object') {
      return jsonData;
    }

    try {
      const encrypted = sensitiveDataManager.encryptDatabaseRecord(jsonData, sensitiveFields);
      return encrypted;
    } catch (error) {
      logger.error('JSON 字段加密失败', {
        error: error instanceof Error ? error.message : String(error),
        sensitiveFields,
      });
      return jsonData;
    }
  }

  /**
   * 处理 JSON 字段的解密
   * @param jsonData - 加密的 JSON 数据
   * @param sensitiveFields - JSON 中的敏感字段
   * @returns 解密后的 JSON 数据
   */
  decryptJsonField(jsonData: any, sensitiveFields: string[]): any {
    if (!jsonData || typeof jsonData !== 'object') {
      return jsonData;
    }

    try {
      const decrypted = sensitiveDataManager.decryptDatabaseRecord(jsonData, sensitiveFields);
      return decrypted;
    } catch (error) {
      logger.error('JSON 字段解密失败', {
        error: error instanceof Error ? error.message : String(error),
        sensitiveFields,
      });
      return jsonData;
    }
  }

  /**
   * 添加表的敏感字段配置
   * @param tableName - 表名
   * @param sensitiveFields - 敏感字段列表
   */
  addTableConfig(tableName: string, sensitiveFields: string[]): void {
    this.tableConfigs.set(tableName, sensitiveFields);
    logger.info('添加表加密配置', { tableName, sensitiveFieldsCount: sensitiveFields.length });
  }

  /**
   * 移除表的敏感字段配置
   * @param tableName - 表名
   */
  removeTableConfig(tableName: string): void {
    this.tableConfigs.delete(tableName);
    logger.info('移除表加密配置', { tableName });
  }

  /**
   * 获取表的敏感字段配置
   * @param tableName - 表名
   * @returns 敏感字段列表
   */
  getTableConfig(tableName: string): string[] {
    return this.tableConfigs.get(tableName) || [];
  }

  /**
   * 获取所有表的配置
   * @returns 表配置映射
   */
  getAllTableConfigs(): DatabaseFieldConfig[] {
    return Array.from(this.tableConfigs.entries()).map(([tableName, sensitiveFields]) => ({
      tableName,
      sensitiveFields,
    }));
  }

  /**
   * 验证记录的加密完整性
   * @param tableName - 表名
   * @param record - 记录
   * @returns 验证结果
   */
  validateRecordIntegrity(tableName: string, record: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const sensitiveFields = this.tableConfigs.get(tableName);

    if (!sensitiveFields) {
      return { valid: true, errors: [] };
    }

    try {
      // 尝试解密记录
      this.decryptRecord(tableName, record);
    } catch (error) {
      errors.push(`记录解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取记录的安全摘要（用于日志记录）
   * @param tableName - 表名
   * @param record - 记录
   * @returns 安全摘要
   */
  getRecordSummary(tableName: string, record: Record<string, any>): Record<string, any> {
    const sensitiveFields = this.tableConfigs.get(tableName) || [];
    return sensitiveDataManager.sanitizeForLogging(record, sensitiveFields);
  }

  /**
   * 轮换表中记录的加密密钥
   * @param tableName - 表名
   * @param records - 记录数组
   * @returns 使用新密钥加密的记录数组
   */
  rotateRecordKeys<T extends Record<string, any>>(tableName: string, records: T[]): T[] {
    const sensitiveFields = this.tableConfigs.get(tableName);
    
    if (!sensitiveFields || sensitiveFields.length === 0) {
      return records;
    }

    try {
      logger.info('开始轮换数据库记录加密密钥', {
        tableName,
        recordsCount: records.length,
      });

      const rotatedRecords = records.map(record => {
        // 先解密记录
        const decrypted = this.decryptRecord(tableName, record);
        // 使用新密钥重新加密
        return this.encryptRecord(tableName, decrypted);
      });

      logger.info('数据库记录密钥轮换完成', {
        tableName,
        recordsCount: rotatedRecords.length,
      });

      return rotatedRecords;
    } catch (error) {
      logger.error('数据库记录密钥轮换失败', {
        tableName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`数据库记录密钥轮换失败: ${tableName}`);
    }
  }
}

// 导出单例实例
export const databaseEncryptionService = new DatabaseEncryptionService();