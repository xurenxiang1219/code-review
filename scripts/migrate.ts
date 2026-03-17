#!/usr/bin/env tsx

/**
 * 数据库迁移命令行工具
 * 
 * 使用方法:
 * pnpm tsx scripts/migrate.ts migrate    # 执行迁移
 * pnpm tsx scripts/migrate.ts status     # 查看迁移状态
 * pnpm tsx scripts/migrate.ts rollback   # 回滚最后一次迁移
 * pnpm tsx scripts/migrate.ts reset      # 重置数据库（仅开发环境）
 */

import 'dotenv/config';
import { migrator } from '../lib/db/migrate';
import { db } from '../lib/db/client';
import { logger } from '../lib/utils/logger';

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
数据库迁移工具

使用方法:
  pnpm tsx scripts/migrate.ts <command>

命令:
  migrate   执行所有待执行的迁移
  status    查看迁移状态
  rollback  回滚最后一次迁移
  reset     重置数据库（仅开发环境）
  help      显示帮助信息

示例:
  pnpm tsx scripts/migrate.ts migrate
  pnpm tsx scripts/migrate.ts status
`);
}

/**
 * 执行迁移命令
 */
async function executeMigrate(): Promise<void> {
  try {
    await migrator.migrate();
    console.log('✅ 数据库迁移完成');
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    process.exit(1);
  }
}

/**
 * 查看迁移状态
 */
async function executeStatus(): Promise<void> {
  try {
    const status = await migrator.getStatus();
    
    console.log('\n📊 数据库迁移状态:');
    console.log(`已执行迁移: ${status.executed.length} 个`);
    console.log(`待执行迁移: ${status.pending.length} 个`);
    
    if (status.executed.length > 0) {
      console.log('\n✅ 已执行的迁移:');
      status.executed.forEach(migration => {
        console.log(`  - ${migration.filename} (${migration.executed_at})`);
      });
    }
    
    if (status.pending.length > 0) {
      console.log('\n⏳ 待执行的迁移:');
      status.pending.forEach(migration => {
        console.log(`  - ${migration.filename}`);
      });
    }
    
    if (status.executed.length === 0 && status.pending.length === 0) {
      console.log('\n📝 没有发现迁移文件');
    }
  } catch (error) {
    console.error('❌ 获取迁移状态失败:', error);
    process.exit(1);
  }
}

/**
 * 执行回滚命令
 */
async function executeRollback(): Promise<void> {
  try {
    await migrator.rollback();
    console.log('✅ 迁移回滚完成');
  } catch (error) {
    console.error('❌ 迁移回滚失败:', error);
    process.exit(1);
  }
}

/**
 * 执行重置命令
 */
async function executeReset(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 生产环境禁止重置数据库');
    process.exit(1);
  }

  // 确认操作
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('⚠️  确定要重置数据库吗？这将删除所有表和数据！(yes/no): ', resolve);
  });

  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ 操作已取消');
    return;
  }

  try {
    await migrator.reset();
    console.log('✅ 数据库重置完成');
  } catch (error) {
    console.error('❌ 数据库重置失败:', error);
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === 'help') {
    showHelp();
    return;
  }

  if (!process.env.NODE_ENV) {
    (process.env as any).NODE_ENV = 'development';
  }

  console.log(`🚀 执行命令: ${command}`);
  console.log(`📍 环境: ${process.env.NODE_ENV}`);

  try {
    switch (command) {
      case 'migrate':
        await executeMigrate();
        break;
      case 'status':
        await executeStatus();
        break;
      case 'rollback':
        await executeRollback();
        break;
      case 'reset':
        await executeReset();
        break;
      default:
        console.error(`❌ 未知命令: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    logger.error('迁移命令执行失败', { command, error });
    console.error('❌ 命令执行失败:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 执行主函数
main().catch((error) => {
  console.error('主函数执行失败:', error);
  process.exit(1);
});