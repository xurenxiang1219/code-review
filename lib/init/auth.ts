import { initializeAuth } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

/**
 * 认证系统初始化
 * 在应用启动时调用，初始化JWT配置和认证相关服务
 */
let isInitialized = false;

/**
 * 初始化认证系统
 */
export function initAuthSystem(): void {
  if (isInitialized) {
    return;
  }

  try {
    initializeAuth();
    isInitialized = true;
    logger.info('认证系统初始化完成');
  } catch (error) {
    logger.error('认证系统初始化失败', { error });
    throw error;
  }
}

// 自动初始化（仅在服务端）
if (typeof window === 'undefined') {
  initAuthSystem();
}