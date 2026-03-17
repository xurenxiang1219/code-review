#!/usr/bin/env tsx

/**
 * 认证系统初始化脚本
 * 
 * 功能：
 * 1. 验证认证配置
 * 2. 创建默认用户和 API Key
 * 3. 初始化认证相关数据
 * 
 * 使用方式：
 * pnpm tsx scripts/init-auth.ts
 */

import 'dotenv/config';
import { db } from '@/lib/db/client';
import { apiKeyManager } from '@/lib/services/api-key-manager';
import { initializeAuth, ApiKeyUtils } from '@/lib/utils/auth';
import { validateAuthConfig } from '@/config/auth';
import { Permission, UserRole } from '@/types/auth';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🔐 开始初始化认证系统...\n');

    // 1. 验证配置
    console.log('1. 验证认证配置...');
    validateAuthConfig();
    initializeAuth();
    console.log('✅ 认证配置验证通过\n');

    // 2. 检查数据库连接
    console.log('2. 检查数据库连接...');
    await db.initialize();
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('数据库连接失败');
    }
    console.log('✅ 数据库连接正常\n');

    // 3. 创建默认用户（如果不存在）
    console.log('3. 创建默认用户...');
    await createDefaultUsers();
    console.log('✅ 默认用户创建完成\n');

    // 4. 创建系统 API Key
    console.log('4. 创建系统 API Key...');
    await createSystemApiKey();
    console.log('✅ 系统 API Key 创建完成\n');

    // 5. 显示初始化信息
    console.log('🎉 认证系统初始化完成！\n');
    console.log('📋 初始化信息：');
    console.log('- 系统用户已创建');
    console.log('- 管理员用户已创建');
    console.log('- 系统 API Key 已创建');
    console.log('\n💡 提示：');
    console.log('- 请妥善保管生成的 API Key');
    console.log('- 建议在生产环境中更改默认密钥');
    console.log('- 可通过 API 端点管理用户和 API Key');

  } catch (error) {
    console.error('❌ 认证系统初始化失败:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

/**
 * 创建默认用户
 */
async function createDefaultUsers() {
  const users = [
    {
      id: 'system-user-001',
      email: 'system@ai-code-review.local',
      name: 'System User',
      role: UserRole.SYSTEM,
    },
    {
      id: 'admin-user-001',
      email: 'admin@ai-code-review.local',
      name: 'Admin User',
      role: UserRole.ADMIN,
    },
  ];

  for (const user of users) {
    try {
      // 检查用户是否已存在
      const existing = await db.query<{ id: string }>(
        'SELECT id FROM users WHERE id = ?',
        [user.id]
      );

      if (existing.length > 0) {
        console.log(`  - 用户 ${user.email} 已存在，跳过创建`);
        continue;
      }

      // 创建用户
      await db.execute(
        `INSERT INTO users (id, email, name, role, enabled, created_at, updated_at) 
         VALUES (?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [user.id, user.email, user.name, user.role]
      );

      console.log(`  - 创建用户: ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`  - 创建用户 ${user.email} 失败:`, error);
    }
  }
}

/**
 * 创建系统 API Key
 */
async function createSystemApiKey() {
  const systemUserId = 'system-user-001';
  const keyName = 'System Internal API Key';

  try {
    // 检查是否已存在系统 API Key
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM api_keys WHERE user_id = ? AND name = ?',
      [systemUserId, keyName]
    );

    if (existing.length > 0) {
      console.log('  - 系统 API Key 已存在，跳过创建');
      return;
    }

    // 创建系统 API Key
    const systemPermissions = [
      Permission.WEBHOOK_RECEIVE,
      Permission.REVIEW_WRITE,
      Permission.HEALTH_CHECK,
    ];

    const result = await apiKeyManager.createApiKey({
      name: keyName,
      userId: systemUserId,
      permissions: systemPermissions,
      // 系统 API Key 不设置过期时间
    });

    console.log('  - 系统 API Key 创建成功');
    console.log(`  - API Key: ${result.apiKey}`);
    console.log(`  - 权限: ${systemPermissions.join(', ')}`);
    
    // 保存到环境变量文件（仅用于开发环境）
    if (process.env.NODE_ENV === 'development') {
      const fs = await import('fs');
      const envContent = `\n# 系统 API Key (自动生成)\nSYSTEM_API_KEY=${result.apiKey}\n`;
      fs.appendFileSync('.env.local', envContent);
      console.log('  - API Key 已保存到 .env.local 文件');
    }

  } catch (error) {
    console.error('  - 创建系统 API Key 失败:', error);
  }
}

/**
 * 生成示例 API Key（用于测试）
 */
async function generateExampleApiKey() {
  const adminUserId = 'admin-user-001';
  
  try {
    const result = await apiKeyManager.createApiKey({
      name: 'Example Admin API Key',
      userId: adminUserId,
      permissions: [
        Permission.REVIEW_READ,
        Permission.REVIEW_WRITE,
        Permission.CONFIG_READ,
        Permission.CONFIG_WRITE,
        Permission.HEALTH_CHECK,
      ],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 年后过期
    });

    console.log('\n📝 示例管理员 API Key:');
    console.log(`API Key: ${result.apiKey}`);
    console.log('权限: 审查读写、配置读写、健康检查');
    console.log('过期时间: 1 年后');
    
  } catch (error) {
    console.error('生成示例 API Key 失败:', error);
  }
}

// 检查是否直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

export { main as initAuth };