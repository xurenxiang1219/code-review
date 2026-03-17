-- 创建认证相关表

-- API Keys 表
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL COMMENT 'API Key 名称',
  user_id VARCHAR(36) NOT NULL COMMENT '关联用户 ID',
  hashed_key VARCHAR(64) NOT NULL UNIQUE COMMENT '哈希后的 API Key',
  permissions JSON NOT NULL COMMENT '权限列表',
  enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  expires_at TIMESTAMP NULL COMMENT '过期时间',
  last_used_at TIMESTAMP NULL COMMENT '最后使用时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_user_id (user_id),
  INDEX idx_hashed_key (hashed_key),
  INDEX idx_enabled (enabled),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API Keys 表';

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL COMMENT '用户 ID',
  user_email VARCHAR(255) NOT NULL COMMENT '用户邮箱',
  action VARCHAR(100) NOT NULL COMMENT '操作类型',
  resource VARCHAR(100) NOT NULL COMMENT '资源类型',
  resource_id VARCHAR(36) NULL COMMENT '资源 ID',
  method VARCHAR(10) NOT NULL COMMENT '请求方法',
  path VARCHAR(500) NOT NULL COMMENT '请求路径',
  ip VARCHAR(45) NOT NULL COMMENT '请求 IP',
  user_agent TEXT NULL COMMENT '用户代理',
  request_id VARCHAR(36) NOT NULL COMMENT '请求 ID',
  success BOOLEAN NOT NULL COMMENT '操作结果',
  error TEXT NULL COMMENT '错误信息',
  status_code INT NOT NULL COMMENT '响应状态码',
  duration INT NOT NULL COMMENT '处理时间（毫秒）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_resource (resource),
  INDEX idx_success (success),
  INDEX idx_created_at (created_at),
  INDEX idx_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志表';

-- 安全事件表
CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(50) NOT NULL COMMENT '事件类型',
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL COMMENT '严重程度',
  description TEXT NOT NULL COMMENT '事件描述',
  ip VARCHAR(45) NOT NULL COMMENT '请求 IP',
  user_agent TEXT NULL COMMENT '用户代理',
  path VARCHAR(500) NOT NULL COMMENT '请求路径',
  user_id VARCHAR(36) NULL COMMENT '用户 ID（如果已认证）',
  metadata JSON NULL COMMENT '附加数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_type (type),
  INDEX idx_severity (severity),
  INDEX idx_ip (ip),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安全事件表';

-- 用户表（简化版，主要用于 API Key 关联）
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE COMMENT '用户邮箱',
  name VARCHAR(255) NOT NULL COMMENT '用户姓名',
  role ENUM('admin', 'developer', 'viewer', 'system') NOT NULL DEFAULT 'viewer' COMMENT '用户角色',
  enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 插入默认系统用户
INSERT IGNORE INTO users (id, email, name, role, enabled) VALUES 
('system-user-001', 'system@ai-code-review.local', 'System User', 'system', TRUE),
('admin-user-001', 'admin@ai-code-review.local', 'Admin User', 'admin', TRUE);

-- 为系统用户创建默认 API Key（用于内部服务调用）
-- 注意：这里使用的是示例哈希值，实际部署时应该生成真实的 API Key
INSERT IGNORE INTO api_keys (
  id, 
  name, 
  user_id, 
  hashed_key, 
  permissions, 
  enabled
) VALUES (
  'system-api-key-001',
  'System Internal API Key',
  'system-user-001',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- 示例哈希值
  '["webhook:receive", "review:write", "health:check"]',
  TRUE
);