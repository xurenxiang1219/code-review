#!/usr/bin/env tsx

import { db } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

/**
 * 手动创建轮询日志表
 */
async function createPollingTables() {
  try {
    logger.info('开始创建轮询日志表');
    
    await db.initialize();
    
    // 创建轮询日志表
    const pollingLogsSQL = `
      CREATE TABLE IF NOT EXISTS \`polling_logs\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '日志记录唯一标识',
        \`repository\` VARCHAR(500) NOT NULL COMMENT '仓库地址',
        \`branch\` VARCHAR(255) NOT NULL COMMENT '分支名称',
        \`scan_type\` ENUM('scheduled', 'manual', 'startup') NOT NULL DEFAULT 'scheduled' COMMENT '扫描类型',
        \`status\` ENUM('running', 'success', 'error') NOT NULL COMMENT '扫描状态',
        \`message\` TEXT NOT NULL COMMENT '日志消息',
        \`error_details\` TEXT NULL COMMENT '错误详情',
        \`duration_ms\` INT NULL COMMENT '扫描耗时(毫秒)',
        \`commits_found\` INT DEFAULT 0 COMMENT '发现的提交数量',
        \`commits_processed\` INT DEFAULT 0 COMMENT '已处理的提交数量',
        \`started_at\` TIMESTAMP NOT NULL COMMENT '开始时间',
        \`completed_at\` TIMESTAMP NULL COMMENT '完成时间',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        
        INDEX \`idx_repository\` (\`repository\`(255)),
        INDEX \`idx_branch\` (\`branch\`),
        INDEX \`idx_status\` (\`status\`),
        INDEX \`idx_started_at\` (\`started_at\`),
        INDEX \`idx_created_at\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='轮询扫描日志表'
    `;
    
    await db.execute(pollingLogsSQL);
    logger.info('轮询日志表创建成功');
    
    // 创建轮询统计表
    const pollingStatsSQL = `
      CREATE TABLE IF NOT EXISTS \`polling_stats\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '统计记录唯一标识',
        \`repository\` VARCHAR(500) NOT NULL COMMENT '仓库地址',
        \`branch\` VARCHAR(255) NOT NULL COMMENT '分支名称',
        \`total_scans\` INT DEFAULT 0 COMMENT '总扫描次数',
        \`successful_scans\` INT DEFAULT 0 COMMENT '成功扫描次数',
        \`failed_scans\` INT DEFAULT 0 COMMENT '失败扫描次数',
        \`last_scan_at\` TIMESTAMP NULL COMMENT '最后扫描时间',
        \`last_success_at\` TIMESTAMP NULL COMMENT '最后成功时间',
        \`last_error_at\` TIMESTAMP NULL COMMENT '最后错误时间',
        \`last_error_message\` TEXT NULL COMMENT '最后错误消息',
        \`avg_duration_ms\` INT DEFAULT 0 COMMENT '平均扫描耗时(毫秒)',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        
        UNIQUE KEY \`uk_repository_branch\` (\`repository\`(255), \`branch\`),
        INDEX \`idx_last_scan_at\` (\`last_scan_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='轮询统计表'
    `;
    
    await db.execute(pollingStatsSQL);
    logger.info('轮询统计表创建成功');
    
    // 更新迁移记录
    await db.execute(
      'INSERT IGNORE INTO migrations (filename) VALUES (?)',
      ['009_create_polling_logs.sql']
    );
    
    logger.info('轮询日志表创建完成');
    
  } catch (error) {
    logger.error('创建轮询日志表失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await db.close();
  }
}

// 执行创建
createPollingTables().catch(console.error);