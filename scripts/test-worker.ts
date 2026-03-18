#!/usr/bin/env tsx

console.log('测试脚本开始执行...');

try {
  console.log('尝试导入 logger...');
  const { logger } = require('@/lib/utils/logger');
  console.log('logger 导入成功');
  
  console.log('尝试导入 RedisClient...');
  const RedisClient = require('@/lib/cache/redis-client').default;
  console.log('RedisClient 导入成功');
  
  console.log('尝试导入 QueueWorker...');
  const { QueueWorker, createWorker } = require('@/lib/queue/worker');
  console.log('QueueWorker 导入成功');
  
  console.log('所有导入测试完成');
} catch (error) {
  console.error('导入失败:', error);
  process.exit(1);
}