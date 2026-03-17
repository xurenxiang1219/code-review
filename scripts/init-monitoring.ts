#!/usr/bin/env tsx

/**
 * 监控系统初始化脚本
 * 
 * 功能：
 * - 初始化监控系统
 * - 启动指标收集器
 * - 配置告警管理器
 * - 设置默认告警规则
 */

import { logger } from '@/lib/utils/logger';
import { monitoring } from '@/lib/utils/monitoring';
import { alertManager } from '@/lib/services/alert-manager';
import { metricsCollector } from '@/lib/services/metrics-collector';
import type { AlertRule } from '@/lib/utils/monitoring';
import type { AlertPolicyConfig } from '@/lib/services/alert-manager';

/**
 * 默认告警规则配置
 */
const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    name: 'high_error_rate',
    metricName: 'review_error_rate',
    condition: 'gt',
    threshold: 5, // 5%
    duration: 300000, // 5分钟
    severity: 'warning',
    message: '审查错误率过高: {value}% (阈值: {threshold}%)',
    enabled: true,
  },
  {
    name: 'critical_error_rate',
    metricName: 'review_error_rate',
    condition: 'gt',
    threshold: 15, // 15%
    duration: 180000, // 3分钟
    severity: 'critical',
    message: '审查错误率严重过高: {value}% (阈值: {threshold}%)',
    enabled: true,
  },
  {
    name: 'long_processing_time',
    metricName: 'avg_processing_time',
    condition: 'gt',
    threshold: 300000, // 5分钟
    duration: 600000, // 10分钟
    severity: 'warning',
    message: '平均处理时间过长: {value}ms (阈值: {threshold}ms)',
    enabled: true,
  },
  {
    name: 'queue_backlog',
    metricName: 'review_queue_length',
    condition: 'gt',
    threshold: 20,
    duration: 300000, // 5分钟
    severity: 'warning',
    message: '审查队列积压: {value} 个任务 (阈值: {threshold})',
    enabled: true,
  },
  {
    name: 'high_memory_usage',
    metricName: 'process_memory_heap_used',
    condition: 'gt',
    threshold: 1024 * 1024 * 1024, // 1GB
    duration: 600000, // 10分钟
    severity: 'warning',
    message: '内存使用过高: {value} bytes (阈值: {threshold} bytes)',
    enabled: true,
  },
  {
    name: 'redis_connection_failure',
    metricName: 'redis_healthy',
    condition: 'eq',
    threshold: 0,
    duration: 60000, // 1分钟
    severity: 'critical',
    message: 'Redis连接失败',
    enabled: true,
  },
  {
    name: 'ai_api_failure_rate',
    metricName: 'ai_api_failure_rate',
    condition: 'gt',
    threshold: 10, // 10%
    duration: 300000, // 5分钟
    severity: 'error',
    message: 'AI API调用失败率过高: {value}% (阈值: {threshold}%)',
    enabled: true,
  },
];

/**
 * 默认告警策略配置
 */
const DEFAULT_ALERT_POLICIES: AlertPolicyConfig[] = [
  {
    name: 'production',
    enabled: true,
    channels: [
      {
        type: 'email',
        enabled: true,
        targets: [
          process.env.ADMIN_EMAIL || 'admin@example.com',
          process.env.DEV_TEAM_EMAIL || 'dev-team@example.com',
        ],
        minSeverity: 'warning',
      },
      {
        type: 'slack',
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        targets: ['#alerts'],
        minSeverity: 'error',
        config: {
          webhook: process.env.SLACK_WEBHOOK_URL,
        },
      },
      {
        type: 'webhook',
        enabled: !!process.env.ALERT_WEBHOOK_URL,
        targets: [],
        minSeverity: 'critical',
        config: {
          url: process.env.ALERT_WEBHOOK_URL,
        },
      },
    ],
    silenceDuration: 300000, // 5分钟
    repeatInterval: 1800000, // 30分钟
    maxRepeats: 3,
  },
  {
    name: 'development',
    enabled: process.env.NODE_ENV === 'development',
    channels: [
      {
        type: 'email',
        enabled: true,
        targets: [process.env.DEV_EMAIL || 'dev@example.com'],
        minSeverity: 'error',
      },
    ],
    silenceDuration: 600000, // 10分钟
    repeatInterval: 3600000, // 1小时
    maxRepeats: 1,
  },
];

/**
 * 初始化监控系统
 */
async function initializeMonitoring(): Promise<void> {
  const initLogger = logger.child({ script: 'init-monitoring' });
  
  try {
    initLogger.info('开始初始化监控系统...');

    // 1. 初始化告警管理器
    initLogger.info('初始化告警管理器...');
    await alertManager.initialize();

    // 2. 添加默认告警规则
    initLogger.info('添加默认告警规则...');
    for (const rule of DEFAULT_ALERT_RULES) {
      monitoring.addAlertRule(rule);
      initLogger.debug('告警规则已添加', { ruleName: rule.name });
    }

    // 3. 添加默认告警策略
    initLogger.info('添加默认告警策略...');
    for (const policy of DEFAULT_ALERT_POLICIES) {
      if (policy.enabled) {
        alertManager.addAlertPolicy(policy);
        initLogger.debug('告警策略已添加', { policyName: policy.name });
      }
    }

    // 4. 启动指标收集器
    initLogger.info('启动指标收集器...');
    metricsCollector.start();

    // 5. 执行健康检查
    initLogger.info('执行健康检查...');
    const healthChecks = await Promise.all([
      monitoring.getStats(),
      alertManager.healthCheck(),
      metricsCollector.healthCheck(),
    ]);

    const [monitoringStats, alertManagerHealthy, metricsCollectorHealthy] = healthChecks;

    initLogger.info('监控系统初始化完成', {
      monitoringStats,
      alertManagerHealthy,
      metricsCollectorHealthy,
      alertRulesCount: DEFAULT_ALERT_RULES.length,
      alertPoliciesCount: DEFAULT_ALERT_POLICIES.filter(p => p.enabled).length,
    });

    // 6. 记录初始化成功指标
    await monitoring.recordMetric('monitoring_system_initialized', 1, 'counter');
    await monitoring.recordMetric('monitoring_init_timestamp', Date.now(), 'gauge');

  } catch (error) {
    initLogger.error('监控系统初始化失败', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // 记录初始化失败指标
    await monitoring.recordMetric('monitoring_system_init_failures', 1, 'counter');
    
    throw error;
  }
}

/**
 * 清理监控系统
 */
async function cleanupMonitoring(): Promise<void> {
  const cleanupLogger = logger.child({ script: 'init-monitoring' });
  
  try {
    cleanupLogger.info('开始清理监控系统...');

    // 停止指标收集器
    metricsCollector.stop();
    
    // 停止监控系统
    monitoring.stop();
    
    // 停止告警管理器
    alertManager.stop();

    cleanupLogger.info('监控系统清理完成');
    
  } catch (error) {
    cleanupLogger.error('监控系统清理失败', { error });
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';

  switch (command) {
    case 'init':
      await initializeMonitoring();
      break;
      
    case 'cleanup':
      await cleanupMonitoring();
      break;
      
    case 'status':
      const stats = await monitoring.getStats();
      const alertStats = alertManager.getAlertStats();
      
      console.log('监控系统状态:');
      console.log('- 监控统计:', JSON.stringify(stats, null, 2));
      console.log('- 告警统计:', JSON.stringify(alertStats, null, 2));
      break;
      
    default:
      console.log('用法: tsx scripts/init-monitoring.ts [init|cleanup|status]');
      process.exit(1);
  }
}

// 处理进程信号
process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，正在清理监控系统...');
  await cleanupMonitoring();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，正在清理监控系统...');
  await cleanupMonitoring();
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', async (error) => {
  logger.error('未捕获的异常', { error });
  await cleanupMonitoring();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error('未处理的Promise拒绝', { reason });
  await cleanupMonitoring();
  process.exit(1);
});

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}