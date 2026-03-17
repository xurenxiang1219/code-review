-- 添加 Git 配置字段到审查配置表
-- 创建时间: 2026-03-17
-- 版本: 1.8.0

-- 设置字符集和排序规则
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 添加 git_config 字段到 review_config 表
ALTER TABLE `review_config` 
ADD COLUMN `git_config` JSON NULL COMMENT 'Git仓库配置' AFTER `notification_config`;

-- 为现有记录设置默认的 Git 配置
UPDATE `review_config` 
SET `git_config` = JSON_OBJECT(
  'defaultBranch', 'main',
  'watchedBranches', JSON_ARRAY('main', 'develop'),
  'baseUrl', 'https://api.github.com',
  'timeout', 30000
) 
WHERE `git_config` IS NULL;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 创建完成提示
SELECT 'Git 配置字段添加完成' AS message;