#!/usr/bin/env tsx

console.log('详细测试脚本开始执行...');

/**
 * 模块导入配置
 */
interface ImportConfig {
  name: string;
  path: string;
}

/**
 * 测试所有模块导入
 * @returns 是否所有模块都导入成功
 */
async function testImports(): Promise<boolean> {
  const imports: ImportConfig[] = [
    { name: 'QueueWorker', path: '@/lib/queue/worker' },
    { name: 'CodeAnalyzer', path: '@/lib/services/code-analyzer' },
    { name: 'AIReviewer', path: '@/lib/services/ai-reviewer' },
    { name: 'CommentPublisher', path: '@/lib/services/comment-publisher' },
    { name: 'GitClient', path: '@/lib/git/client' },
    { name: 'DiffParser', path: '@/lib/git/diff-parser' },
    { name: 'Logger', path: '@/lib/utils/logger' },
    { name: 'ReviewTask', path: '@/types/review' },
    { name: 'CommitInfo', path: '@/types/git' },
    { name: 'RedisClient', path: '@/lib/cache/redis-client' },
    { name: 'ReviewRepository', path: '@/lib/db/repositories/review' },
    { name: 'ConfigRepository', path: '@/lib/db/repositories/config' },
  ];

  for (const { name, path } of imports) {
    try {
      console.log(`尝试导入 ${name} from ${path}...`);
      await import(path);
      console.log(`✓ ${name} 导入成功`);
    } catch (error) {
      console.error(`✗ ${name} 导入失败:`, error);
      return false;
    }
  }
  
  console.log('所有模块导入测试完成');
  return true;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    const success = await testImports();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('测试执行失败:', error);
    process.exit(1);
  }
}

main();