import { v4 as uuidv4 } from 'uuid';
import type { ApiKeyInfo, AuthUser, AuthResult, Permission } from '@/types/auth';
import { ApiKeyUtils, PermissionUtils } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';

/**
 * API Key 管理服务类
 */
export class ApiKeyManagerService {
  /**
   * 创建 API Key
   * @param params - 创建参数
   * @returns API Key 信息
   */
  async createApiKey(params: {
    name: string;
    userId: string;
    permissions: Permission[];
    expiresAt?: Date;
  }): Promise<{ apiKey: string; info: ApiKeyInfo }> {
    try {
      const apiKey = ApiKeyUtils.generateApiKey();
      const hashedKey = ApiKeyUtils.hashApiKey(apiKey);

      const info: ApiKeyInfo = {
        id: uuidv4(),
        name: params.name,
        userId: params.userId,
        permissions: params.permissions,
        enabled: true,
        expiresAt: params.expiresAt,
        createdAt: new Date(),
      };

      // 保存到数据库
      await this.saveApiKey(info, hashedKey);

      logger.info('API Key 创建成功', {
        keyId: info.id,
        name: info.name,
        userId: info.userId,
        permissions: info.permissions,
      });

      return { apiKey, info };
    } catch (error) {
      logger.error('创建 API Key 失败', { error, params });
      throw error;
    }
  }

  /**
   * 验证 API Key
   * @param apiKey - API Key
   * @returns 验证结果
   */
  async verifyApiKey(apiKey: string): Promise<AuthResult> {
    try {
      const hashedKey = ApiKeyUtils.hashApiKey(apiKey);
      const keyInfo = await this.getApiKeyByHash(hashedKey);

      if (!keyInfo) {
        return {
          success: false,
          error: 'API Key 不存在',
          errorCode: 'INVALID_API_KEY',
        };
      }

      if (!keyInfo.enabled) {
        return {
          success: false,
          error: 'API Key 已禁用',
          errorCode: 'API_KEY_DISABLED',
        };
      }

      if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
        return {
          success: false,
          error: 'API Key 已过期',
          errorCode: 'API_KEY_EXPIRED',
        };
      }

      // 更新最后使用时间
      await this.updateLastUsed(keyInfo.id);

      const user: AuthUser = {
        id: keyInfo.userId,
        email: '', // API Key 认证时邮箱为空
        role: this.inferRoleFromPermissions(keyInfo.permissions),
        permissions: keyInfo.permissions,
        authMethod: 'apikey',
        apiKey: {
          id: keyInfo.id,
          name: keyInfo.name,
        },
      };

      return { success: true, user };
    } catch (error) {
      logger.error('验证 API Key 失败', { error });
      return {
        success: false,
        error: '验证失败',
        errorCode: 'API_KEY_VERIFICATION_FAILED',
      };
    }
  }
  /**
   * 获取用户的 API Key 列表
   * @param userId - 用户 ID
   * @returns API Key 列表
   */
  async getUserApiKeys(userId: string): Promise<ApiKeyInfo[]> {
    const query = `
      SELECT id, name, user_id, permissions, enabled, expires_at, last_used_at, created_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;

    const rows = await db.query<any>(query, [userId]);

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      userId: row.user_id,
      permissions: JSON.parse(row.permissions),
      enabled: row.enabled,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * 禁用 API Key
   * @param keyId - API Key ID
   * @param userId - 用户 ID（用于权限检查）
   */
  async disableApiKey(keyId: string, userId: string): Promise<void> {
    const query = `
      UPDATE api_keys 
      SET enabled = false, updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `;

    await db.execute(query, [keyId, userId]);

    logger.info('API Key 已禁用', { keyId, userId });
  }

  /**
   * 删除 API Key
   * @param keyId - API Key ID
   * @param userId - 用户 ID（用于权限检查）
   */
  async deleteApiKey(keyId: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM api_keys
      WHERE id = ? AND user_id = ?
    `;

    await db.execute(query, [keyId, userId]);

    logger.info('API Key 已删除', { keyId, userId });
  }

  /**
   * 保存 API Key 到数据库
   * @param info - API Key 信息
   * @param hashedKey - 哈希后的 API Key
   */
  private async saveApiKey(info: ApiKeyInfo, hashedKey: string): Promise<void> {
    const query = `
      INSERT INTO api_keys (
        id, name, user_id, hashed_key, permissions, enabled,
        expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      info.id,
      info.name,
      info.userId,
      hashedKey,
      JSON.stringify(info.permissions),
      info.enabled,
      info.expiresAt || null,
      info.createdAt,
      info.createdAt,
    ];

    await db.execute(query, values);
  }

  /**
   * 根据哈希值获取 API Key 信息
   * @param hashedKey - 哈希后的 API Key
   * @returns API Key 信息
   */
  private async getApiKeyByHash(hashedKey: string): Promise<ApiKeyInfo | null> {
    const query = `
      SELECT id, name, user_id, permissions, enabled, expires_at, last_used_at, created_at
      FROM api_keys
      WHERE hashed_key = ?
    `;

    const rows = await db.query<any>(query, [hashedKey]);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      userId: row.user_id,
      permissions: JSON.parse(row.permissions),
      enabled: row.enabled,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * 更新最后使用时间
   * @param keyId - API Key ID
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const query = `
      UPDATE api_keys 
      SET last_used_at = NOW()
      WHERE id = ?
    `;

    await db.execute(query, [keyId]);
  }

  /**
   * 根据权限推断角色
   * @param permissions - 权限列表
   * @returns 用户角色
   */
  private inferRoleFromPermissions(permissions: Permission[]): any {
    // 简单的角色推断逻辑
    if (permissions.includes('system:admin' as Permission)) {
      return 'admin';
    }
    if (permissions.includes('webhook:receive' as Permission)) {
      return 'system';
    }
    if (permissions.includes('config:write' as Permission)) {
      return 'developer';
    }
    return 'viewer';
  }
}

/**
 * API Key 管理服务实例
 */
export const apiKeyManager = new ApiKeyManagerService();