import { sensitiveDataManager } from '@/lib/utils/crypto';
import { logger } from '@/lib/utils/logger';
import type { ReviewConfig } from '@/types/config';

/**
 * 配置加密服务
 * 负责配置数据的加密存储和解密读取
 */
export class ConfigEncryptionService {
  private readonly sensitiveFields = [
    'aiModel.apiKey',
    'git.accessToken',
    'git.webhookSecret',
    'notification.smtpPassword',
    'notification.apiKey',
    'database.password',
    'redis.password',
    'jwtSecret',
    'encryptionKey',
  ];

  /**
   * 加密配置对象
   * @param config - 原始配置对象
   * @returns 加密后的配置对象
   */
  encryptConfig<T extends Record<string, any>>(config: T): T {
    try {
      logger.debug('开始加密配置', {
        fieldsCount: Object.keys(config).length,
        sensitiveFieldsCount: this.sensitiveFields.length,
      });

      const encryptedConfig = this.encryptNestedFields(config, this.sensitiveFields);

      logger.info('配置加密完成', {
        encryptedFields: this.getEncryptedFieldsCount(encryptedConfig),
      });

      return encryptedConfig;
    } catch (error) {
      logger.error('配置加密失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('配置加密失败');
    }
  }

  /**
   * 解密配置对象
   * @param encryptedConfig - 加密的配置对象
   * @returns 解密后的配置对象
   */
  decryptConfig<T extends Record<string, any>>(encryptedConfig: T): T {
    try {
      logger.debug('开始解密配置', {
        fieldsCount: Object.keys(encryptedConfig).length,
      });

      const decryptedConfig = this.decryptNestedFields(encryptedConfig, this.sensitiveFields);

      logger.info('配置解密完成');

      return decryptedConfig;
    } catch (error) {
      logger.error('配置解密失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('配置解密失败');
    }
  }

  /**
   * 加密嵌套字段
   * @param obj - 要加密的对象
   * @param fieldPaths - 字段路径数组（支持嵌套，如 'aiModel.apiKey'）
   * @returns 加密后的对象
   */
  private encryptNestedFields<T extends Record<string, any>>(
    obj: T,
    fieldPaths: string[]
  ): T {
    const result = { ...obj };

    for (const fieldPath of fieldPaths) {
      const pathParts = fieldPath.split('.');
      this.encryptFieldByPath(result, pathParts);
    }

    return result;
  }

  /**
   * 解密嵌套字段
   * @param obj - 要解密的对象
   * @param fieldPaths - 字段路径数组
   * @returns 解密后的对象
   */
  private decryptNestedFields<T extends Record<string, any>>(
    obj: T,
    fieldPaths: string[]
  ): T {
    const result = { ...obj };

    for (const fieldPath of fieldPaths) {
      const pathParts = fieldPath.split('.');
      this.decryptFieldByPath(result, pathParts);
    }

    return result;
  }

  /**
   * 根据路径加密字段
   * @param obj - 对象
   * @param pathParts - 路径部分数组
   */
  private encryptFieldByPath(obj: any, pathParts: string[]): void {
    if (pathParts.length === 1) {
      const field = pathParts[0];
      if (field in obj && obj[field] != null && typeof obj[field] === 'string') {
        const value = obj[field];
        if (!sensitiveDataManager.encryption.isEncrypted(value)) {
          obj[field] = sensitiveDataManager.encryptConfig({ [field]: value })[field];
        }
      }
      return;
    }

    const currentField = pathParts[0];
    const remainingPath = pathParts.slice(1);

    if (currentField in obj && obj[currentField] && typeof obj[currentField] === 'object') {
      this.encryptFieldByPath(obj[currentField], remainingPath);
    }
  }

  /**
   * 根据路径解密字段
   * @param obj - 对象
   * @param pathParts - 路径部分数组
   */
  private decryptFieldByPath(obj: any, pathParts: string[]): void {
    if (pathParts.length === 1) {
      const field = pathParts[0];
      if (field in obj && obj[field] != null && typeof obj[field] === 'string') {
        const value = obj[field];
        if (sensitiveDataManager.encryption.isEncrypted(value)) {
          obj[field] = sensitiveDataManager.decryptConfig({ [field]: value })[field];
        }
      }
      return;
    }

    const currentField = pathParts[0];
    const remainingPath = pathParts.slice(1);

    if (currentField in obj && obj[currentField] && typeof obj[currentField] === 'object') {
      this.decryptFieldByPath(obj[currentField], remainingPath);
    }
  }

  /**
   * 统计加密字段数量
   * @param obj - 对象
   * @returns 加密字段数量
   */
  private getEncryptedFieldsCount(obj: any): number {
    let count = 0;

    const countEncrypted = (current: any): void => {
      if (typeof current === 'string' && sensitiveDataManager.encryption.isEncrypted(current)) {
        count++;
      } else if (current && typeof current === 'object') {
        for (const value of Object.values(current)) {
          countEncrypted(value);
        }
      }
    };

    countEncrypted(obj);
    return count;
  }

  /**
   * 验证配置完整性
   * @param config - 配置对象
   * @returns 验证结果
   */
  validateConfigIntegrity(config: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      // 尝试解密所有加密字段
      this.decryptConfig(config);
    } catch (error) {
      errors.push(`配置解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取配置的安全摘要（用于日志记录）
   * @param config - 配置对象
   * @returns 安全摘要
   */
  getConfigSummary(config: Record<string, any>): Record<string, any> {
    return sensitiveDataManager.sanitizeForLogging(config, this.getNestedSensitiveFields());
  }

  /**
   * 获取嵌套敏感字段列表（用于脱敏）
   * @returns 敏感字段数组
   */
  private getNestedSensitiveFields(): string[] {
    return [
      'apiKey',
      'accessToken', 
      'webhookSecret',
      'smtpPassword',
      'password',
      'token',
      'secret',
      'key',
    ];
  }

  /**
   * 轮换配置中的加密密钥
   * @param config - 配置对象
   * @returns 使用新密钥加密的配置
   */
  rotateConfigKeys(config: Record<string, any>): Record<string, any> {
    try {
      logger.info('开始轮换配置加密密钥');

      // 先解密配置
      const decryptedConfig = this.decryptConfig(config);
      
      // 使用新密钥重新加密
      const reencryptedConfig = this.encryptConfig(decryptedConfig);

      logger.info('配置密钥轮换完成');
      return reencryptedConfig;
    } catch (error) {
      logger.error('配置密钥轮换失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('配置密钥轮换失败');
    }
  }
}

// 导出单例实例
export const configEncryptionService = new ConfigEncryptionService();