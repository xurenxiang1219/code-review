-- AI 代码审查系统数据库表结构
-- 创建时间: 2024-01-01
-- 版本: 1.0.0

-- 设置字符集和排序规则
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 审查记录表
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '审查记录唯一标识',
  `commit_hash` VARCHAR(40) NOT NULL COMMENT '提交哈希值',
  `branch` VARCHAR(255) NOT NULL COMMENT '分支名称',
  `repository` VARCHAR(500) NOT NULL COMMENT '仓库地址',
  `author_name` VARCHAR(255) NOT NULL COMMENT '提交者姓名',
  `author_email` VARCHAR(255) NOT NULL COMMENT '提交者邮箱',
  `files_changed` INT NOT NULL DEFAULT 0 COMMENT '变更文件数量',
  `lines_added` INT NOT NULL DEFAULT 0 COMMENT '新增代码行数',
  `lines_deleted` INT NOT NULL DEFAULT 0 COMMENT '删除代码行数',
  `total_issues` INT NOT NULL DEFAULT 0 COMMENT '问题总数',
  `critical_count` INT NOT NULL DEFAULT 0 COMMENT '严重问题数量',
  `major_count` INT NOT NULL DEFAULT 0 COMMENT '重要问题数量',
  `minor_count` INT NOT NULL DEFAULT 0 COMMENT '次要问题数量',
  `suggestion_count` INT NOT NULL DEFAULT 0 COMMENT '建议数量',
  `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending' COMMENT '审查状态',
  `started_at` TIMESTAMP NOT NULL COMMENT '开始时间',
  `completed_at` TIMESTAMP NULL COMMENT '完成时间',
  `processing_time_ms` INT NULL COMMENT '处理耗时(毫秒)',
  `error_message` TEXT NULL COMMENT '错误信息',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  INDEX `idx_commit_hash` (`commit_hash`),
  INDEX `idx_branch` (`branch`),
  INDEX `idx_author_email` (`author_email`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_status` (`status`),
  INDEX `idx_repository` (`repository`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审查记录表';

-- 2. 审查评论表
CREATE TABLE IF NOT EXISTS `review_comments` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '评论唯一标识',
  `review_id` VARCHAR(36) NOT NULL COMMENT '关联的审查记录ID',
  `file_path` VARCHAR(1000) NOT NULL COMMENT '文件路径',
  `line_number` INT NOT NULL COMMENT '代码行号',
  `severity` ENUM('critical', 'major', 'minor', 'suggestion') NOT NULL COMMENT '严重程度',
  `category` VARCHAR(100) NOT NULL COMMENT '问题分类',
  `message` TEXT NOT NULL COMMENT '问题描述',
  `suggestion` TEXT NULL COMMENT '修改建议',
  `code_snippet` TEXT NULL COMMENT '相关代码片段',
  `published` BOOLEAN DEFAULT FALSE COMMENT '是否已发布到Git',
  `published_at` TIMESTAMP NULL COMMENT '发布时间',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  INDEX `idx_review_id` (`review_id`),
  INDEX `idx_severity` (`severity`),
  INDEX `idx_published` (`published`),
  INDEX `idx_file_path` (`file_path`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审查评论表';

-- 3. 提交追踪表
CREATE TABLE IF NOT EXISTS `commit_tracker` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '追踪记录唯一标识',
  `commit_hash` VARCHAR(40) NOT NULL UNIQUE COMMENT '提交哈希值',
  `branch` VARCHAR(255) NOT NULL COMMENT '分支名称',
  `repository` VARCHAR(500) NOT NULL COMMENT '仓库地址',
  `trigger_source` ENUM('webhook', 'polling') NOT NULL COMMENT '触发来源',
  `processed_at` TIMESTAMP NOT NULL COMMENT '处理时间',
  `review_id` VARCHAR(36) NULL COMMENT '关联的审查记录ID',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE SET NULL,
  INDEX `idx_commit_hash` (`commit_hash`),
  INDEX `idx_branch_repo` (`branch`, `repository`(255)),
  INDEX `idx_processed_at` (`processed_at`),
  INDEX `idx_trigger_source` (`trigger_source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提交追踪表';

-- 4. 审查配置表
CREATE TABLE IF NOT EXISTS `review_config` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '配置唯一标识',
  `repository` VARCHAR(500) NOT NULL UNIQUE COMMENT '仓库地址',
  `review_focus` JSON NOT NULL COMMENT '审查关注点配置',
  `file_whitelist` JSON NOT NULL COMMENT '文件类型白名单',
  `ignore_patterns` JSON NOT NULL COMMENT '忽略文件模式',
  `ai_model_config` JSON NOT NULL COMMENT 'AI模型配置',
  `polling_enabled` BOOLEAN DEFAULT FALSE COMMENT '是否启用轮询模式',
  `polling_interval` INT DEFAULT 300 COMMENT '轮询间隔(秒)',
  `notification_config` JSON NOT NULL COMMENT '通知配置',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  INDEX `idx_repository` (`repository`(255)),
  INDEX `idx_polling_enabled` (`polling_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审查配置表';

-- 5. 审查队列表 (备用，主要使用Redis)
CREATE TABLE IF NOT EXISTS `review_queue` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '队列任务唯一标识',
  `commit_hash` VARCHAR(40) NOT NULL COMMENT '提交哈希值',
  `branch` VARCHAR(255) NOT NULL COMMENT '分支名称',
  `repository` VARCHAR(500) NOT NULL COMMENT '仓库地址',
  `priority` INT DEFAULT 0 COMMENT '优先级(数值越大优先级越高)',
  `status` ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued' COMMENT '任务状态',
  `retry_count` INT DEFAULT 0 COMMENT '重试次数',
  `max_retries` INT DEFAULT 3 COMMENT '最大重试次数',
  `error_message` TEXT NULL COMMENT '错误信息',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `started_at` TIMESTAMP NULL COMMENT '开始处理时间',
  `completed_at` TIMESTAMP NULL COMMENT '完成时间',
  
  INDEX `idx_status_priority` (`status`, `priority` DESC),
  INDEX `idx_commit_hash` (`commit_hash`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_repository` (`repository`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审查队列表';

-- 6. 通知日志表
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '通知记录唯一标识',
  `review_id` VARCHAR(36) NOT NULL COMMENT '关联的审查记录ID',
  `recipient_email` VARCHAR(255) NOT NULL COMMENT '接收者邮箱',
  `notification_type` ENUM('email', 'im', 'git_comment') NOT NULL COMMENT '通知类型',
  `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' COMMENT '发送状态',
  `error_message` TEXT NULL COMMENT '错误信息',
  `sent_at` TIMESTAMP NULL COMMENT '发送时间',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  INDEX `idx_review_id` (`review_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_recipient_email` (`recipient_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知日志表';

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 插入默认配置数据
INSERT IGNORE INTO `review_config` (
  `id`,
  `repository`,
  `review_focus`,
  `file_whitelist`,
  `ignore_patterns`,
  `ai_model_config`,
  `polling_enabled`,
  `polling_interval`,
  `notification_config`
) VALUES (
  'default-config-001',
  'default',
  JSON_ARRAY('security', 'performance', 'readability', 'maintainability'),
  JSON_ARRAY('*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java', '*.go', '*.rs', '*.cpp', '*.c'),
  JSON_ARRAY('node_modules/**', 'dist/**', 'build/**', '*.min.js', '*.bundle.js', 'coverage/**'),
  JSON_OBJECT(
    'provider', 'openai',
    'model', 'gpt-4',
    'temperature', 0.3,
    'maxTokens', 4000,
    'timeout', 60000
  ),
  false,
  300,
  JSON_OBJECT(
    'email', JSON_OBJECT('enabled', true, 'criticalOnly', false),
    'im', JSON_OBJECT('enabled', false, 'webhook', ''),
    'gitComment', JSON_OBJECT('enabled', true, 'summaryOnly', false)
  )
);

-- 创建完成提示
SELECT 'AI 代码审查系统数据库表创建完成' AS message;