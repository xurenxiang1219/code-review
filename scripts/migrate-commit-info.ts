#!/usr/bin/env tsx

/**
 * 添加提交信息字段的数据库迁移脚本
 */

import 'dotenv/config';
import { db } from '@/lib/db/client';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  try {
    console.log('🔄 开始执行数据库迁移...');
    
    await db.initialize();
    console.log('✅ 数据库连接成功');

    // 读取迁移文件
    const migrationPath = join(process.cwd(), 'lib/db/migrations/010_add_commit_info.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    
    // 分割SQL语句并执行
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('SELECT'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('执行SQL:', statement.substring(0, 80) + '...');
        await db.execute(statement);
      }
    }

    console.log('✅ 数据库迁移完成');
    console.log('📋 已添加字段:');
    console.log('  - commit_message: 提交消息');
    console.log('  - commit_timestamp: 提交时间');
    console.log('  - commit_url: 提交链接');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// 检查是否直接运行此脚本
if (require.main === module) {
  runMigration().catch(console.error);
}

export { runMigration };