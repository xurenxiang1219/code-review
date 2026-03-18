-- 添加提交信息字段
-- 创建时间: 2024-01-01
-- 版本: 1.0.10

-- 为 reviews 表添加提交消息和提交时间字段
ALTER TABLE `reviews` 
ADD COLUMN `commit_message` TEXT NULL COMMENT '提交消息' AFTER `author_email`,
ADD COLUMN `commit_timestamp` TIMESTAMP NULL COMMENT '提交时间' AFTER `commit_message`,
ADD COLUMN `commit_url` VARCHAR(1000) NULL COMMENT '提交链接' AFTER `commit_timestamp`;

-- 添加索引
ALTER TABLE `reviews` 
ADD INDEX `idx_commit_timestamp` (`commit_timestamp`);

-- 更新现有记录的提交消息（如果需要的话，可以通过Git API获取）
-- 这里暂时设置为空，后续可以通过脚本批量更新

SELECT 'reviews 表提交信息字段添加完成' AS message;