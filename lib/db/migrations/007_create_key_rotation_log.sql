-- 创建密钥轮换日志表
-- 用于记录系统中所有密钥轮换操作的历史记录

CREATE TABLE key_rotation_log (
  id VARCHAR(36) PRIMARY KEY,
  key_type ENUM('config', 'database', 'log', 'master') NOT NULL COMMENT '密钥类型',
  status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL COMMENT '轮换状态',
  started_at TIMESTAMP NOT NULL COMMENT '开始时间',
  completed_at TIMESTAMP NULL COMMENT '完成时间',
  affected_records INT NOT NULL DEFAULT 0 COMMENT '影响的记录数',
  error_message TEXT NULL COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_key_type (key_type),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  INDEX idx_completed_at (completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='密钥轮换日志表';

-- 创建加密配置表（如果不存在）
-- 用于存储系统级别的加密配置信息
CREATE TABLE IF NOT EXISTS encryption_config (
  id VARCHAR(36) PRIMARY KEY,
  config_key VARCHAR(255) NOT NULL UNIQUE COMMENT '配置键名',
  config_value TEXT NOT NULL COMMENT '配置值（加密存储）',
  description TEXT NULL COMMENT '配置描述',
  is_encrypted BOOLEAN DEFAULT TRUE COMMENT '是否加密存储',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_config_key (config_key),
  INDEX idx_is_encrypted (is_encrypted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='加密配置表';

-- 插入默认的加密配置
INSERT INTO encryption_config (id, config_key, config_value, description, is_encrypted) VALUES
(UUID(), 'encryption.algorithm', 'aes-256-gcm', '默认加密算法', FALSE),
(UUID(), 'encryption.key_derivation.iterations', '100000', '密钥派生迭代次数', FALSE),
(UUID(), 'encryption.key_rotation.interval_hours', '24', '密钥轮换间隔（小时）', FALSE),
(UUID(), 'encryption.auto_rotation.enabled', 'false', '是否启用自动密钥轮换', FALSE);

-- 为现有表添加加密相关字段（如果需要）
-- 这些字段用于标记哪些数据已经加密

-- 为 review_config 表添加加密标记字段
ALTER TABLE review_config 
ADD COLUMN ai_model_config_encrypted BOOLEAN DEFAULT FALSE COMMENT 'AI模型配置是否加密',
ADD COLUMN notification_config_encrypted BOOLEAN DEFAULT FALSE COMMENT '通知配置是否加密';

-- 为 notification_log 表添加加密标记字段
ALTER TABLE notification_log 
ADD COLUMN recipient_email_encrypted BOOLEAN DEFAULT FALSE COMMENT '收件人邮箱是否加密';

-- 创建加密字段映射表
-- 用于记录哪些表的哪些字段需要加密
CREATE TABLE encryption_field_mapping (
  id VARCHAR(36) PRIMARY KEY,
  table_name VARCHAR(255) NOT NULL COMMENT '表名',
  field_name VARCHAR(255) NOT NULL COMMENT '字段名',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用加密',
  encryption_algorithm VARCHAR(50) DEFAULT 'aes-256-gcm' COMMENT '加密算法',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_table_field (table_name, field_name),
  INDEX idx_table_name (table_name),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='加密字段映射表';

-- 插入默认的加密字段映射
INSERT INTO encryption_field_mapping (id, table_name, field_name, is_active) VALUES
(UUID(), 'review_config', 'ai_model_config', TRUE),
(UUID(), 'review_config', 'notification_config', TRUE),
(UUID(), 'notification_log', 'recipient_email', TRUE);