#!/usr/bin/env tsx

/**
 * 认证系统数据库迁移脚本
 * 
 * 创建认证相关的数据库表：
 * - users 用户表
 * - api_keys API密钥表  
 * - audit_logs 审计日志表
 * - security_events 安全事件表
 */

// 加载环境变量
import dotenv from 'dotenv';
import path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { db } from '../lib/db/client';
import fs from 'fs';
import path from 'path';

/**
 * 输出结果
 * @param success - 是否成功
 * @param message - 消息
 */
function logResult(success: boolean, message: string): void {
  console.log(success ? `✓ ${message}` : `✗ ${message}`);
}

/**
 * 执行SQL文件
 * @param filePath - SQL文件路径
 */
async function executeSqlFile(filePath: string): Promise<void> {
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  
  // 移除注释行并重新组合
  const cleanLines = sqlContent
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('--');
    });
  
  const statements = cleanLines
    .join('\n')
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);
  
  console.log(`执行 ${filePath}，包含 ${statements.length} 个SQL语句`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement) {
      console.log(`执行语句 ${i + 1}: ${statement.substring(0, 80)}...`);
      await db.execute(statement);
      console.log(`✓ 语句 ${i + 1} 执行成功`);
    }
  }
  
  logResult(true, `${filePath} 执行成功`);
}

/**
 * 检查表是否存在
 * @param tableName - 表名
 * @returns 是否存在
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.queryOne(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ?
    `, [tableName]);
    
    return result?.count > 0;
  } catch (error) {
    console.error(`检查表 ${tableName} 是否存在时出错:`, error);
    return false;
  }
}

/**
 * 创建认证相关表
 */
async function createAuthTables(): Promise<void> {
  console.log('\n=== 创建认证相关表 ===');
  
  const tables = ['users', 'api_keys', 'audit_logs', 'security_events'];
  
  for (const table of tables) {
    const exists = await tableExists(table);
    logResult(exists, exists ? `表 ${table} 已存在` : `表 ${table} 不存在`);
  }
  
  // 执行认证表迁移
  const migrationFile = path.join(__dirname, '../lib/db/migrations/006_create_auth_tables.sql');
  
  if (!fs.existsSync(migrationFile)) {
    throw new Error(`迁移文件不存在: ${migrationFile}`);
  }
  
  await executeSqlFile(migrationFile);
}

/**
 * 验证表结构
 */
async function validateTables(): Promise<void> {
  console.log('\n=== 验证表结构 ===');
  
  const tableConfigs = [
    { name: 'users', requiredColumns: ['id', 'email', 'name', 'role', 'enabled'] },
    { name: 'api_keys', requiredColumns: ['id', 'name', 'user_id', 'hashed_key', 'permissions'] },
    { name: 'audit_logs', requiredColumns: ['id', 'user_id', 'action', 'resource', 'success'] },
    { name: 'security_events', requiredColumns: ['id', 'type', 'severity', 'ip'] },
  ];
  
  for (const config of tableConfigs) {
    try {
      const columns = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      `, [config.name]);
      
      const columnNames = columns.map((col: any) => col.COLUMN_NAME.toLowerCase());
      const missingColumns = config.requiredColumns.filter(
        col => !columnNames.includes(col.toLowerCase())
      );
      
      logResult(
        missingColumns.length === 0, 
        missingColumns.length === 0 
          ? `表 ${config.name} 结构正确`
          : `表 ${config.name} 缺少列: ${missingColumns.join(', ')}`
      );
    } catch (error) {
      console.error(`验证表 ${config.name} 结构时出错:`, error);
    }
  }
}

/**
 * 检查默认数据
 */
async function checkDefaultData(): Promise<void> {
  console.log('\n=== 检查默认数据 ===');
  
  const userChecks = [
    { email: 'system@ai-code-review.local', name: '系统用户' },
    { email: 'admin@ai-code-review.local', name: '管理员用户' },
  ];
  
  for (const check of userChecks) {
    try {
      const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [check.email]);
      logResult(!!user, user ? `${check.name}已存在` : `${check.name}不存在`);
    } catch (error) {
      console.error(`检查${check.name}时出错:`, error);
    }
  }
  
  // 检查系统API Key
  try {
    const systemApiKey = await db.queryOne(
      'SELECT * FROM api_keys WHERE user_id = ?',
      ['system-user-001']
    );
    logResult(!!systemApiKey, systemApiKey ? '系统API Key已存在' : '系统API Key不存在');
  } catch (error) {
    console.error('检查系统API Key时出错:', error);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('开始认证系统数据库迁移...\n');
  
  // 显示数据库配置信息
  console.log('数据库配置:');
  console.log(`- 主机: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`- 端口: ${process.env.DB_PORT || '3306'}`);
  console.log(`- 数据库: ${process.env.DB_NAME || 'ai_code_review'}`);
  console.log(`- 用户: ${process.env.DB_USER || 'root'}`);
  console.log('');
  
  try {
    await db.initialize();
    logResult(true, '数据库连接成功');
    
    await createAuthTables();
    await validateTables();
    await checkDefaultData();
    
    console.log('\n认证系统数据库迁移完成！');
    
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// 运行迁移
if (require.main === module) {
  main().catch((error) => {
    console.error('迁移执行失败:', error);
    process.exit(1);
  });
}