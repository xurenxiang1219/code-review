#!/usr/bin/env node

/**
 * AI 代码审查系统 - Worker 健康检查脚本
 * 用于 Docker 容器健康检查和监控系统
 */

const fs = require('fs');
const path = require('path');

/**
 * 健康检查配置
 */
const HEALTH_CHECK_CONFIG = {
  pidFile: path.join(__dirname, '..', 'logs', 'worker.pid'),
  logFile: path.join(__dirname, '..', 'logs', 'worker.log'),
  errorLogFile: path.join(__dirname, '..', 'logs', 'worker.error.log'),
  maxErrorLines: 10,
  maxMemoryUsageMB: 2048,
  maxLogAge: 5 * 60 * 1000, // 5分钟
};

/**
 * 检查进程是否运行
 */
function checkProcess() {
  try {
    if (!fs.existsSync(HEALTH_CHECK_CONFIG.pidFile)) {
      throw new Error('PID 文件不存在');
    }

    const pid = parseInt(fs.readFileSync(HEALTH_CHECK_CONFIG.pidFile, 'utf8').trim());
    
    if (isNaN(pid)) {
      throw new Error('无效的 PID');
    }

    // 检查进程是否存在
    process.kill(pid, 0);
    
    return { healthy: true, pid };
  } catch (error) {
    return { 
      healthy: false, 
      error: `进程检查失败: ${error.message}` 
    };
  }
}

/**
 * 检查日志文件
 */
function checkLogs() {
  try {
    // 检查主日志文件
    if (fs.existsSync(HEALTH_CHECK_CONFIG.logFile)) {
      const stats = fs.statSync(HEALTH_CHECK_CONFIG.logFile);
      const age = Date.now() - stats.mtime.getTime();
      
      if (age > HEALTH_CHECK_CONFIG.maxLogAge) {
        return {
          healthy: false,
          error: `日志文件过旧 (${Math.round(age / 1000)}秒前)`
        };
      }
    }

    // 检查错误日志
    if (fs.existsSync(HEALTH_CHECK_CONFIG.errorLogFile)) {
      const errorLog = fs.readFileSync(HEALTH_CHECK_CONFIG.errorLogFile, 'utf8');
      const errorLines = errorLog.trim().split('\n').filter(line => line.trim());
      
      if (errorLines.length > HEALTH_CHECK_CONFIG.maxErrorLines) {
        return {
          healthy: false,
          error: `错误日志过多 (${errorLines.length} 行)`
        };
      }
    }

    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      error: `日志检查失败: ${error.message}`
    };
  }
}

/**
 * 检查内存使用
 */
function checkMemory() {
  try {
    const memUsage = process.memoryUsage();
    const rssUsageMB = memUsage.rss / 1024 / 1024;
    
    if (rssUsageMB > HEALTH_CHECK_CONFIG.maxMemoryUsageMB) {
      return {
        healthy: false,
        error: `内存使用过高 (${Math.round(rssUsageMB)}MB > ${HEALTH_CHECK_CONFIG.maxMemoryUsageMB}MB)`
      };
    }

    return { 
      healthy: true, 
      memoryUsageMB: Math.round(rssUsageMB) 
    };
  } catch (error) {
    return {
      healthy: false,
      error: `内存检查失败: ${error.message}`
    };
  }
}

/**
 * 执行完整健康检查
 */
function performHealthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: {
      process: checkProcess(),
      logs: checkLogs(),
      memory: checkMemory(),
    },
    overall: { healthy: true, errors: [] }
  };

  // 汇总检查结果
  Object.values(results.checks).forEach(check => {
    if (!check.healthy) {
      results.overall.healthy = false;
      results.overall.errors.push(check.error);
    }
  });

  return results;
}

/**
 * 主函数
 */
function main() {
  const results = performHealthCheck();
  
  // 输出结果
  if (process.env.HEALTH_CHECK_VERBOSE === 'true') {
    console.log(JSON.stringify(results, null, 2));
  } else if (!results.overall.healthy) {
    console.error('健康检查失败:', results.overall.errors.join(', '));
  }

  // 退出码
  process.exit(results.overall.healthy ? 0 : 1);
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { performHealthCheck };