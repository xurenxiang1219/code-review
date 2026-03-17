#!/usr/bin/env tsx

/**
 * 认证系统测试脚本
 * 
 * 验证认证系统的基本功能：
 * - JWT token 生成和验证
 * - 用户创建和查询
 * - API Key 管理
 * - 数据库连接
 */

// 加载环境变量
import dotenv from 'dotenv';
import path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { JWTUtils, PermissionUtils } from '../lib/utils/auth';
import { apiKeyManager } from '../lib/services/api-key-manager';
import { db } from '../lib/db/client';
import { UserRole, Permission } from '../types/auth';

/**
 * 输出测试结果
 * @param success - 是否成功
 * @param message - 消息
 */
function logResult(success: boolean, message: string): void {
  console.log(success ? `✓ ${message}` : `✗ ${message}`);
}

/**
 * 测试JWT功能
 */
async function testJWT(): Promise<void> {
  console.log('\n=== 测试 JWT 功能 ===');
  
  try {
    // 初始化JWT工具
    const jwtSecret = process.env.JWT_SECRET || 'test-secret-key-32-characters-long';
    const jwtIssuer = process.env.JWT_ISSUER || 'ai-code-review-system';
    const jwtAudience = process.env.JWT_AUDIENCE || 'ai-code-review-api';
    
    JWTUtils.init(jwtSecret, jwtIssuer, jwtAudience);
    
    // 生成测试token
    const testPayload = {
      sub: 'test-user-123',
      email: 'test@example.com',
      role: UserRole.DEVELOPER,
      permissions: [Permission.REVIEW_READ, Permission.CONFIG_READ],
    };
    
    const token = JWTUtils.generateToken(testPayload, '1h');
    logResult(true, 'JWT Token 生成成功');
    console.log(`Token: ${token.substring(0, 50)}...`);
    
    // 验证token
    const verifyResult = JWTUtils.verifyToken(token);
    if (verifyResult.success && verifyResult.user) {
      logResult(true, 'JWT Token 验证成功');
      console.log(`用户ID: ${verifyResult.user.id}`);
      console.log(`邮箱: ${verifyResult.user.email}`);
      console.log(`角色: ${verifyResult.user.role}`);
    } else {
      logResult(false, `JWT Token 验证失败: ${verifyResult.error}`);
    }
    
  } catch (error) {
    logResult(false, `JWT 测试失败: ${error}`);
  }
}

/**
 * 测试数据库连接
 */
async function testDatabase(): Promise<void> {
  console.log('\n=== 测试数据库连接 ===');
  
  try {
    await db.initialize();
    logResult(true, '数据库连接成功');
    
    // 测试查询
    const result = await db.queryOne('SELECT 1 as test');
    logResult(result?.test === 1, '数据库查询测试');
    
    // 检查用户表是否存在
    const tableCheck = await db.queryOne(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'users'
    `);
    
    if (tableCheck?.count > 0) {
      logResult(true, '用户表存在');
      
      const userCount = await db.queryOne('SELECT COUNT(*) as count FROM users');
      console.log(`用户数量: ${userCount?.count || 0}`);
    } else {
      console.log('⚠ 用户表不存在，需要运行数据库迁移');
    }
    
  } catch (error) {
    logResult(false, `数据库测试失败: ${error}`);
  }
}

/**
 * 测试API Key管理
 */
async function testApiKeyManager(): Promise<void> {
  console.log('\n=== 测试 API Key 管理 ===');
  
  try {
    const testUserId = 'test-user-123';
    const apiKeyInfo = await apiKeyManager.createApiKey({
      name: 'Test API Key',
      userId: testUserId,
      permissions: [Permission.REVIEW_READ, Permission.CONFIG_READ],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    
    logResult(true, 'API Key 创建成功');
    console.log(`API Key ID: ${apiKeyInfo.info.id}`);
    console.log(`API Key: ${apiKeyInfo.apiKey.substring(0, 20)}...`);
    
    // 验证API Key
    const verifyResult = await apiKeyManager.verifyApiKey(apiKeyInfo.apiKey);
    if (verifyResult.success && verifyResult.user) {
      logResult(true, 'API Key 验证成功');
      console.log(`用户ID: ${verifyResult.user.id}`);
      console.log(`权限: ${verifyResult.user.permissions.join(', ')}`);
    } else {
      logResult(false, `API Key 验证失败: ${verifyResult.error}`);
    }
    
    // 清理测试数据
    await apiKeyManager.deleteApiKey(apiKeyInfo.info.id, testUserId);
    logResult(true, '测试 API Key 已清理');
    
  } catch (error) {
    logResult(false, `API Key 管理测试失败: ${error}`);
  }
}

/**
 * 测试权限系统
 */
async function testPermissions(): Promise<void> {
  console.log('\n=== 测试权限系统 ===');
  
  try {
    const testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      role: UserRole.DEVELOPER,
      permissions: [Permission.REVIEW_READ, Permission.CONFIG_READ],
      authMethod: 'jwt' as const,
    };
    
    // 测试权限检查
    const hasReviewRead = PermissionUtils.hasPermission(testUser, Permission.REVIEW_READ);
    const hasReviewWrite = PermissionUtils.hasPermission(testUser, Permission.REVIEW_WRITE);
    const hasSystemAdmin = PermissionUtils.hasPermission(testUser, Permission.SYSTEM_ADMIN);
    
    console.log(`✓ 权限检查 - REVIEW_READ: ${hasReviewRead}`);
    console.log(`✓ 权限检查 - REVIEW_WRITE: ${hasReviewWrite}`);
    console.log(`✓ 权限检查 - SYSTEM_ADMIN: ${hasSystemAdmin}`);
    
    // 测试默认权限获取
    const defaultPermissions = PermissionUtils.getDefaultPermissions(UserRole.DEVELOPER);
    console.log(`✓ 开发者默认权限: ${defaultPermissions.join(', ')}`);
    
  } catch (error) {
    logResult(false, `权限系统测试失败: ${error}`);
  }
}

/**
 * 主测试函数
 */
async function main(): Promise<void> {
  console.log('开始认证系统测试...\n');
  
  await testJWT();
  await testDatabase();
  await testApiKeyManager();
  await testPermissions();
  
  console.log('\n认证系统测试完成！');
  process.exit(0);
}

// 运行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}