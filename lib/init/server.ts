/**
 * 服务端初始化模块
 * 
 * 在服务端启动时自动执行初始化
 */

import { initializeApp } from './app';
import { logger } from '@/lib/utils/logger';

// 服务端启动时自动初始化
if (typeof window === 'undefined') {
  setImmediate(async () => {
    try {
      await initializeApp();
      logger.info('服务端应用初始化完成');
    } catch (error) {
      logger.error('服务端应用初始化失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export {};