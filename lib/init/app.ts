/**
 * 应用初始化模块
 * 
 * 在应用启动时执行必要的初始化操作：
 * - 数据库连接初始化
 * - 监控系统启动
 * - 指标收集器启动
 */

import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';
import { monitoring } from '@/lib/utils/monitoring';
import { metricsCollector } from '@/lib/services/metrics-collector';

let isInitialized = false;

/**
 * 初始化应用
 * @returns Promise<void>
 */
export async function initializeApp(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const initLogger = logger.child({ module: 'app-init' });
  
  try {
    initLogger.info('开始应用初始化...');

    // 初始化数据库连接
    initLogger.info('初始化数据库连接...');
    await db.initialize();
    
    // 启动指标收集器
    initLogger.info('启动指标收集器...');
    metricsCollector.start();
    
    // 记录初始化完成指标
    await Promise.all([
      monitoring.recordMetric('app_initialized', 1, 'counter'),
      monitoring.recordMetric('app_init_timestamp', Date.now(), 'gauge')
    ]);
    
    isInitialized = true;
    initLogger.info('应用初始化完成');
    
  } catch (error) {
    initLogger.error('应用初始化失败', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 检查应用是否已初始化
 * @returns boolean
 */
export function isAppInitialized(): boolean {
  return isInitialized;
}