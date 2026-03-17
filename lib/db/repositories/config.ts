import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import { logger } from '@/lib/utils/logger';
import { configEncryptionService } from '@/lib/services/config-encryption';
import { databaseEncryptionService } from '@/lib/services/database-encryption';

/**
 * Git 仓库配置
 */
export interface GitConfig {
  /** Git API 基础URL */
  baseUrl?: string;
  /** 访问令牌 */
  accessToken?: string;
  /** 默认分支 */
  defaultBranch: string;
  /** 监控的分支列表 */
  watchedBranches: string[];
  /** Webhook 密钥 */
  webhookSecret?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 审查配置基础接口
 */
export interface ReviewConfig {
  reviewFocus: string[];
  fileWhitelist: string[];
  ignorePatterns: string[];
  aiModel: AIModelConfig;
  promptTemplate?: string;
  git?: GitConfig;
}

/**
 * 审查配置数据库实体
 */
export interface ReviewConfigEntity {
  id: string;
  repository: string;
  review_focus: string[] | string; // MySQL JSON字段，可能返回对象或字符串
  file_whitelist: string[] | string; // MySQL JSON字段，可能返回对象或字符串
  ignore_patterns: string[] | string; // MySQL JSON字段，可能返回对象或字符串
  ai_model_config: AIModelConfig | string; // MySQL JSON字段，可能返回对象或字符串
  polling_enabled: boolean;
  polling_interval: number;
  notification_config: NotificationConfig | string; // MySQL JSON字段，可能返回对象或字符串
  git_config?: GitConfig | string; // MySQL JSON字段，可能返回对象或字符串
  created_at: Date;
  updated_at: Date;
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  email: {
    enabled: boolean;
    recipients: string[];
    criticalOnly: boolean;
  };
  im: {
    enabled: boolean;
    webhook?: string;
    channels: string[];
  };
  gitComment: {
    enabled: boolean;
    summaryOnly: boolean;
  };
}

/**
 * AI 模型配置
 */
export interface AIModelConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * 完整的审查配置
 */
export interface FullReviewConfig extends ReviewConfig {
  id: string;
  repository: string;
  pollingEnabled: boolean;
  pollingInterval: number;
  notificationConfig: NotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 配置更新参数
 */
export interface UpdateConfigParams {
  reviewFocus?: string[];
  fileWhitelist?: string[];
  ignorePatterns?: string[];
  aiModel?: AIModelConfig;
  promptTemplate?: string;
  git?: GitConfig;
  pollingEnabled?: boolean;
  pollingInterval?: number;
  notificationConfig?: NotificationConfig;
}

/**
 * Config Repository - 审查配置数据访问层
 */
export class ConfigRepository {
  /**
   * 获取仓库的审查配置
   * @param repository - 仓库名
   * @returns 审查配置或 null
   */
  async getConfig(repository: string): Promise<FullReviewConfig | null> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<ReviewConfigEntity>(
        'SELECT * FROM review_config WHERE repository = ?',
        [repository]
      );

      if (!result) {
        logger.debug('配置不存在', { repository });
        return null;
      }

      // 解密敏感字段
      const decryptedEntity = databaseEncryptionService.decryptRecord('review_config', result);
      const config = this.entityToConfig(decryptedEntity);
      
      logger.debug('配置获取成功', { repository, configId: config.id });
      return config;
    } catch (error) {
      logger.error('获取配置失败', {
        repository,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  /**
   * 获取配置（不进行解密，用于调试）
   * @param repository - 仓库名称
   * @returns 配置对象或null
   */
  async getConfigWithoutDecryption(repository: string): Promise<FullReviewConfig | null> {
    try {
      await db.initialize();

      const result = await db.queryOne<ReviewConfigEntity>(
        'SELECT * FROM review_config WHERE repository = ?',
        [repository]
      );

      if (!result) {
        logger.debug('No config found for repository', { repository });
        return null;
      }

      const config = this.entityToConfig(result);

      logger.debug('Config retrieved without decryption', { repository, configId: config.id });
      return config;
    } catch (error) {
      logger.error('Failed to get config without decryption', {
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  /**
   * 创建默认配置（不进行加密，用于调试）
   * @param repository - 仓库名称
   * @returns 创建的配置对象
   */
  async createDefaultConfigWithoutEncryption(repository: string): Promise<FullReviewConfig> {
    try {
      await db.initialize();

      const configId = crypto.randomUUID();
      const now = new Date();

      // 默认Git配置
      const defaultGitConfig = {
        defaultBranch: 'main',
        watchedBranches: ['main', 'develop'],
        baseUrl: 'https://api.github.com',
        timeout: 30000
      };

      // 构建默认配置实体
      const entity: ReviewConfigEntity = {
        id: configId,
        repository,
        review_focus: this.safeJsonStringify(['security', 'performance', 'readability', 'maintainability']),
        file_whitelist: this.safeJsonStringify(['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java', '*.go', '*.rs', '*.cpp', '*.c']),
        ignore_patterns: this.safeJsonStringify(['node_modules/**', 'dist/**', 'build/**', '*.min.js', '*.bundle.js', 'coverage/**']),
        ai_model_config: this.safeJsonStringify({
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.3,
          maxTokens: 4000,
          timeout: 60000
        }),
        git_config: this.safeJsonStringify(defaultGitConfig),
        polling_enabled: false,
        polling_interval: 300,
        notification_config: this.safeJsonStringify({
          email: { enabled: true, criticalOnly: false },
          im: { enabled: false, webhook: '' },
          gitComment: { enabled: true, summaryOnly: false }
        }),
        created_at: now,
        updated_at: now
      };

      // 插入数据库
      await db.execute(
        `INSERT INTO review_config (
          id, repository, review_focus, file_whitelist, ignore_patterns,
          ai_model_config, git_config, polling_enabled, polling_interval, 
          notification_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.id,
          entity.repository,
          entity.review_focus,
          entity.file_whitelist,
          entity.ignore_patterns,
          entity.ai_model_config,
          entity.git_config,
          entity.polling_enabled,
          entity.polling_interval,
          entity.notification_config,
          entity.created_at,
          entity.updated_at
        ]
      );

      const config = this.entityToConfig(entity);

      logger.info('Default config created without encryption', { repository, configId });
      return config;
    } catch (error) {
      logger.error('Failed to create default config without encryption', {
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 更新仓库的审查配置
   * @param repository 仓库名
   * @param params 更新参数
   * @returns 更新后的配置
   */
  async updateConfig(repository: string, params: UpdateConfigParams): Promise<FullReviewConfig> {
    try {
      await db.initialize();
      const now = new Date();

      // 获取现有配置
      const existingConfig = await this.getConfig(repository);
      
      if (!existingConfig) {
        // 如果配置不存在，先创建默认配置，然后更新
        await this.createDefaultConfig(repository);
        return this.updateConfig(repository, params);
      }

      // 合并配置
      const updatedConfig = this.mergeConfig(existingConfig, params);

      // 准备要存储的配置数据
      const configToStore = {
        review_focus: updatedConfig.reviewFocus,
        file_whitelist: updatedConfig.fileWhitelist,
        ignore_patterns: updatedConfig.ignorePatterns,
        ai_model_config: updatedConfig.aiModel,
        git_config: updatedConfig.git,
        notification_config: updatedConfig.notificationConfig,
        polling_enabled: updatedConfig.pollingEnabled,
        polling_interval: updatedConfig.pollingInterval,
        updated_at: now,
      };

      // 加密敏感字段（加密服务会自动处理对象序列化）
      const encryptedConfig = databaseEncryptionService.encryptRecord('review_config', configToStore);

      // 更新数据库
      await db.execute(
        `UPDATE review_config SET 
          review_focus = ?,
          file_whitelist = ?,
          ignore_patterns = ?,
          ai_model_config = ?,
          git_config = ?,
          polling_enabled = ?,
          polling_interval = ?,
          notification_config = ?,
          updated_at = ?
        WHERE repository = ?`,
        [
          this.safeJsonStringify(encryptedConfig.review_focus),
          this.safeJsonStringify(encryptedConfig.file_whitelist),
          this.safeJsonStringify(encryptedConfig.ignore_patterns),
          this.safeJsonStringify(encryptedConfig.ai_model_config),
          this.safeJsonStringify(encryptedConfig.git_config),
          encryptedConfig.polling_enabled,
          encryptedConfig.polling_interval,
          this.safeJsonStringify(encryptedConfig.notification_config),
          encryptedConfig.updated_at,
          repository
        ]
      );

      logger.encryption('Config updated and encrypted', 'config', { 
        repository, 
        hasApiKey: !!updatedConfig.aiModel?.apiKey 
      });

      // 返回更新后的配置
      const result = await this.getConfig(repository);
      if (!result) {
        throw new Error('Failed to retrieve updated config');
      }

      return result;
    } catch (error) {
      logger.error('Failed to update config', {
        repository,
        params: configEncryptionService.getConfigSummary(params),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 为仓库创建默认配置
   * @param repository 仓库名
   * @returns 默认配置
   */
  async createDefaultConfig(repository: string): Promise<FullReviewConfig> {
    const configId = uuidv4();
    const now = new Date();

    // 默认配置值
    const reviewFocus = ['security', 'performance', 'readability', 'maintainability'];
    const fileWhitelist = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java', '*.go', '*.rs'];
    const ignorePatterns = [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.min.js',
      '*.bundle.js',
      'coverage/**',
      '.git/**'
    ];
    const aiModel = {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000
    };
    const pollingEnabled = false;
    const pollingInterval = 300; // 5 分钟
    const notificationConfig = {
      email: {
        enabled: false,
        recipients: [],
        criticalOnly: true
      },
      im: {
        enabled: false,
        channels: []
      },
      gitComment: {
        enabled: true,
        summaryOnly: false
      }
    };

    try {
      await db.initialize();
      
      // 加密敏感配置数据
      const configToEncrypt = {
        id: configId,
        repository,
        review_focus: this.safeJsonStringify(reviewFocus),
        file_whitelist: this.safeJsonStringify(fileWhitelist),
        ignore_patterns: this.safeJsonStringify(ignorePatterns),
        ai_model_config: this.safeJsonStringify(aiModel),
        polling_enabled: pollingEnabled,
        polling_interval: pollingInterval,
        notification_config: this.safeJsonStringify(notificationConfig),
        created_at: now,
        updated_at: now,
      };

      const encryptedConfig = databaseEncryptionService.encryptRecord('review_config', configToEncrypt);
      
      await db.execute(
        `INSERT INTO review_config (
          id, repository, review_focus, file_whitelist, ignore_patterns,
          ai_model_config, polling_enabled, polling_interval,
          notification_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          encryptedConfig.id,
          encryptedConfig.repository,
          encryptedConfig.review_focus,
          encryptedConfig.file_whitelist,
          encryptedConfig.ignore_patterns,
          encryptedConfig.ai_model_config,
          encryptedConfig.polling_enabled,
          encryptedConfig.polling_interval,
          encryptedConfig.notification_config,
          encryptedConfig.created_at,
          encryptedConfig.updated_at
        ]
      );

      logger.encryption('Default config created and encrypted', 'config', { repository, configId });

      const result = await this.getConfig(repository);
      if (!result) {
        throw new Error('Failed to retrieve created default config');
      }

      return result;
    } catch (error) {
      logger.error('Failed to create default config', {
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 删除仓库配置
   * @param repository 仓库名
   * @returns 是否删除成功
   */
  async deleteConfig(repository: string): Promise<boolean> {
    try {
      await db.initialize();
      
      const result = await db.execute(
        'DELETE FROM review_config WHERE repository = ?',
        [repository]
      );

      if (result.affectedRows === 0) {
        logger.warn('No config found to delete', { repository });
        return false;
      }

      logger.info('Config deleted', { repository });
      return true;
    } catch (error) {
      logger.error('Failed to delete config', {
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取所有仓库的配置列表
   * @returns 配置列表
   */
  async getAllConfigs(): Promise<FullReviewConfig[]> {
    try {
      await db.initialize();
      
      const entities = await db.query<ReviewConfigEntity>(
        'SELECT * FROM review_config ORDER BY repository ASC'
      );

      // 批量解密配置数据
      const decryptedEntities = databaseEncryptionService.decryptRecords('review_config', entities);
      const configs = decryptedEntities.map(entity => this.entityToConfig(entity));

      logger.debug('All configs retrieved and decrypted', { count: configs.length });
      return configs;
    } catch (error) {
      logger.error('Failed to get all configs', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 检查仓库是否有配置
   * @param repository 仓库名
   * @returns 是否存在配置
   */
  async hasConfig(repository: string): Promise<boolean> {
    try {
      await db.initialize();
      
      const result = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM review_config WHERE repository = ?',
        [repository]
      );

      return (result?.count || 0) > 0;
    } catch (error) {
      logger.error('Failed to check config existence', {
        repository,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取启用轮询的仓库列表
   * @returns 启用轮询的仓库配置列表
   */
  async getPollingEnabledConfigs(): Promise<FullReviewConfig[]> {
    try {
      await db.initialize();
      
      const entities = await db.query<ReviewConfigEntity>(
        'SELECT * FROM review_config WHERE polling_enabled = true ORDER BY repository ASC'
      );

      // 批量解密配置数据
      const decryptedEntities = databaseEncryptionService.decryptRecords('review_config', entities);
      const configs = decryptedEntities.map(entity => this.entityToConfig(entity));

      logger.debug('Polling enabled configs retrieved and decrypted', { count: configs.length });
      return configs;
    } catch (error) {
      logger.error('Failed to get polling enabled configs', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 安全解析JSON字段
   * @param data - JSON字符串或已解析的对象
   * @param fallback - 解析失败时的默认值
   * @param fieldName - 字段名称，用于调试日志
   * @returns 解析后的对象或默认值
   */
  /**
   * 安全的 JSON 序列化，避免 undefined 值导致数据库错误
   * @param value - 要序列化的值
   * @returns JSON 字符串
   */
  private safeJsonStringify(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return JSON.stringify(value);
  }

  /**
   * 深度合并通知配置
   * @param existing - 现有配置
   * @param updates - 更新配置
   * @returns 合并后的配置
   */
  private mergeNotificationConfig(existing: NotificationConfig, updates: NotificationConfig): NotificationConfig {
    return {
      email: updates.email ? { ...existing.email, ...updates.email } : existing.email,
      im: updates.im ? { ...existing.im, ...updates.im } : existing.im,
      gitComment: updates.gitComment ? { ...existing.gitComment, ...updates.gitComment } : existing.gitComment,
    };
  }

  /**
   * 安全解析JSON字段，支持对象和字符串类型
   * @param data - 待解析的数据
   * @param fallback - 解析失败时的默认值
   * @param fieldName - 字段名称，用于日志记录
   * @returns 解析后的对象或默认值
   */
  private safeJsonParse<T>(data: any, fallback: T, fieldName?: string): T {
    // 对象类型直接返回
    if (typeof data === 'object' && data !== null) {
      return data as T;
    }

    // 字符串类型进行JSON解析
    if (typeof data === 'string') {
      if (!data.trim()) {
        return fallback;
      }

      try {
        return JSON.parse(data);
      } catch (error) {
        logger.warn('JSON解析失败，使用默认值', { 
          fieldName,
          dataPreview: data.substring(0, 50),
          dataLength: data.length,
          error: error instanceof Error ? error.message : String(error)
        });
        return fallback;
      }
    }

    // 其他类型使用默认值
    logger.debug('不支持的数据类型，使用默认值', { 
      fieldName, 
      actualType: typeof data
    });
    return fallback;
  }

  /**
   * 将数据库实体转换为配置对象
   * @param entity - 数据库实体
   * @returns 配置对象
   */
  private entityToConfig(entity: ReviewConfigEntity): FullReviewConfig {
    const defaultGitConfig: GitConfig = {
      defaultBranch: 'main',
      watchedBranches: ['main', 'develop'],
      baseUrl: 'https://api.github.com',
      timeout: 30000
    };

    return {
      id: entity.id,
      repository: entity.repository,
      reviewFocus: this.safeJsonParse(entity.review_focus, ['security', 'performance', 'readability'], 'review_focus'),
      fileWhitelist: this.safeJsonParse(entity.file_whitelist, ['*.ts', '*.tsx', '*.js', '*.jsx'], 'file_whitelist'),
      ignorePatterns: this.safeJsonParse(entity.ignore_patterns, ['node_modules/**', 'dist/**'], 'ignore_patterns'),
      aiModel: this.safeJsonParse(entity.ai_model_config, {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000
      }, 'ai_model_config'),
      git: entity.git_config ? this.safeJsonParse(entity.git_config, defaultGitConfig, 'git_config') : defaultGitConfig,
      pollingEnabled: entity.polling_enabled,
      pollingInterval: entity.polling_interval,
      notificationConfig: this.safeJsonParse(entity.notification_config, {
        email: { enabled: false, recipients: [], criticalOnly: true },
        im: { enabled: false, channels: [] },
        gitComment: { enabled: true, summaryOnly: false }
      }, 'notification_config'),
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  /**
   * 合并配置更新
   * @param existingConfig 现有配置
   * @param updates 更新参数
   * @returns 合并后的配置
   */
  private mergeConfig(existingConfig: FullReviewConfig, updates: UpdateConfigParams): FullReviewConfig {
    return {
      ...existingConfig,
      reviewFocus: updates.reviewFocus ?? existingConfig.reviewFocus,
      fileWhitelist: updates.fileWhitelist ?? existingConfig.fileWhitelist,
      ignorePatterns: updates.ignorePatterns ?? existingConfig.ignorePatterns,
      aiModel: updates.aiModel ? { ...existingConfig.aiModel, ...updates.aiModel } : existingConfig.aiModel,
      promptTemplate: updates.promptTemplate ?? existingConfig.promptTemplate,
      git: updates.git ? { ...existingConfig.git, ...updates.git } : existingConfig.git,
      pollingEnabled: updates.pollingEnabled ?? existingConfig.pollingEnabled,
      pollingInterval: updates.pollingInterval ?? existingConfig.pollingInterval,
      notificationConfig: updates.notificationConfig ? 
        this.mergeNotificationConfig(existingConfig.notificationConfig, updates.notificationConfig) : 
        existingConfig.notificationConfig,
      updatedAt: new Date()
    };
  }

  /**
   * 验证配置参数
   * @param params 配置参数
   * @returns 验证结果
   */
  validateConfig(params: UpdateConfigParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证轮询间隔
    if (params.pollingInterval !== undefined) {
      if (params.pollingInterval < 30 || params.pollingInterval > 3600) {
        errors.push('轮询间隔必须在 30-3600 秒之间');
      }
    }

    // 验证 AI 模型配置
    if (params.aiModel) {
      if (!params.aiModel.provider) {
        errors.push('AI 模型提供商不能为空');
      }
      if (!params.aiModel.model) {
        errors.push('AI 模型名称不能为空');
      }
      if (params.aiModel.temperature !== undefined) {
        if (params.aiModel.temperature < 0 || params.aiModel.temperature > 2) {
          errors.push('AI 模型温度必须在 0-2 之间');
        }
      }
      if (params.aiModel.maxTokens !== undefined) {
        if (params.aiModel.maxTokens < 100 || params.aiModel.maxTokens > 8000) {
          errors.push('AI 模型最大 token 数必须在 100-8000 之间');
        }
      }
    }

    // 验证文件白名单
    if (params.fileWhitelist) {
      if (params.fileWhitelist.length === 0) {
        errors.push('文件白名单不能为空');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 导出单例实例
export const configRepository = new ConfigRepository();