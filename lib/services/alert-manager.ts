import { EventEmitter } from 'events';
import { logger } from '@/lib/utils/logger';
import { monitoring, AlertEvent } from '@/lib/utils/monitoring';
import RedisClient from '@/lib/cache/redis-client';
import { v4 as uuidv4 } from 'uuid';

/**
 * 告警通道类型
 */
export type AlertChannel = 'email' | 'sms' | 'webhook' | 'slack' | 'dingtalk' | 'feishu';

/**
 * 告警通道配置
 */
export interface AlertChannelConfig {
  /** 通道类型 */
  type: AlertChannel;
  /** 是否启用 */
  enabled: boolean;
  /** 接收人/目标 */
  targets: string[];
  /** 最小告警级别 */
  minSeverity: 'info' | 'warning' | 'error' | 'critical';
  /** 通道特定配置 */
  config?: Record<string, any>;
}

/**
 * 告警策略配置
 */
export interface AlertPolicyConfig {
  /** 策略名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 告警通道 */
  channels: AlertChannelConfig[];
  /** 静默期（毫秒） */
  silenceDuration: number;
  /** 重复告警间隔（毫秒） */
  repeatInterval: number;
  /** 最大重复次数 */
  maxRepeats: number;
}

/**
 * 告警历史记录
 */
export interface AlertHistory {
  /** 记录ID */
  id: string;
  /** 告警事件 */
  alert: AlertEvent;
  /** 发送的通道 */
  channels: AlertChannel[];
  /** 发送状态 */
  status: 'pending' | 'sent' | 'failed' | 'silenced';
  /** 发送时间 */
  sentAt?: Date;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retryCount: number;
}
/**
 * 告警管理器
 * 
 * 功能：
 * - 管理告警规则和策略
 * - 处理告警事件分发
 * - 支持多种通知通道
 * - 实现告警静默和重复控制
 * - 记录告警历史
 */
export class AlertManager extends EventEmitter {
  private alertPolicies = new Map<string, AlertPolicyConfig>();
  private alertHistory = new Map<string, AlertHistory>();
  private silencedAlerts = new Set<string>();
  private alertLogger = logger.child({ service: 'AlertManager' });
  
  // Redis键前缀
  private readonly redisPrefix = 'alert_manager:';
  
  constructor() {
    super();
    
    // 监听监控系统的告警事件
    monitoring.on('alertTriggered', this.handleAlertTriggered.bind(this));
    monitoring.on('alertResolved', this.handleAlertResolved.bind(this));
    
    // 初始化默认策略
    this.initializeDefaultPolicies();
    
    this.alertLogger.info('告警管理器已初始化');
  }

  /**
   * 初始化通知服务
   */
  async initialize(): Promise<void> {
    // 通知服务初始化逻辑待实现
    this.alertLogger.info('告警管理器初始化完成');
  }

  /**
   * 添加告警策略
   */
  addAlertPolicy(policy: AlertPolicyConfig): void {
    this.alertPolicies.set(policy.name, policy);
    
    this.alertLogger.info('告警策略已添加', {
      policyName: policy.name,
      channelsCount: policy.channels.length,
      enabled: policy.enabled,
    });
  }

  /**
   * 移除告警策略
   */
  removeAlertPolicy(policyName: string): void {
    this.alertPolicies.delete(policyName);
    this.alertLogger.info('告警策略已移除', { policyName });
  }

  /**
   * 获取告警策略
   */
  getAlertPolicy(policyName: string): AlertPolicyConfig | undefined {
    return this.alertPolicies.get(policyName);
  }

  /**
   * 获取所有告警策略
   */
  getAllAlertPolicies(): AlertPolicyConfig[] {
    return Array.from(this.alertPolicies.values());
  }

  /**
   * 静默告警
   */
  async silenceAlert(alertId: string, duration: number): Promise<void> {
    this.silencedAlerts.add(alertId);
    
    // 在Redis中设置静默标记
    const redis = await RedisClient.getInstance();
    await redis.setex(`${this.redisPrefix}silenced:${alertId}`, Math.floor(duration / 1000), '1');
    
    // 设置定时器自动解除静默
    setTimeout(() => {
      this.silencedAlerts.delete(alertId);
    }, duration);
    
    this.alertLogger.info('告警已静默', {
      alertId,
      duration: `${duration}ms`,
    });
  }

  /**
   * 解除告警静默
   */
  async unsilenceAlert(alertId: string): Promise<void> {
    this.silencedAlerts.delete(alertId);
    
    // 从Redis中移除静默标记
    const redis = await RedisClient.getInstance();
    await redis.del(`${this.redisPrefix}silenced:${alertId}`);
    
    this.alertLogger.info('告警静默已解除', { alertId });
  }

  /**
   * 检查告警是否被静默
   */
  async isAlertSilenced(alertId: string): Promise<boolean> {
    if (this.silencedAlerts.has(alertId)) {
      return true;
    }
    
    // 检查Redis中的静默状态
    const redis = await RedisClient.getInstance();
    const silenced = await redis.exists(`${this.redisPrefix}silenced:${alertId}`);
    
    if (silenced) {
      this.silencedAlerts.add(alertId);
      return true;
    }
    
    return false;
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit = 100): AlertHistory[] {
    return Array.from(this.alertHistory.values())
      .sort((a, b) => (b.alert.triggeredAt.getTime() - a.alert.triggeredAt.getTime()))
      .slice(0, limit);
  }

  /**
   * 获取活跃告警统计
   */
  getAlertStats(): {
    total: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
    silencedCount: number;
  } {
    const activeAlerts = monitoring.getActiveAlerts();
    
    const stats = {
      total: activeAlerts.length,
      bySeverity: {} as Record<string, number>,
      byRule: {} as Record<string, number>,
      silencedCount: this.silencedAlerts.size,
    };
    
    activeAlerts.forEach(alert => {
      // 按严重程度统计
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      
      // 按规则统计
      stats.byRule[alert.ruleName] = (stats.byRule[alert.ruleName] || 0) + 1;
    });
    
    return stats;
  }

  /**
   * 处理告警触发事件
   */
  private async handleAlertTriggered(alert: AlertEvent): Promise<void> {
    this.alertLogger.info('处理告警触发事件', {
      alertId: alert.id,
      ruleName: alert.ruleName,
      severity: alert.severity,
      currentValue: alert.currentValue,
    });

    // 检查是否被静默
    if (await this.isAlertSilenced(alert.id)) {
      this.alertLogger.debug('告警已被静默，跳过发送', { alertId: alert.id });
      return;
    }

    // 创建告警历史记录
    const history: AlertHistory = {
      id: uuidv4(),
      alert,
      channels: [],
      status: 'pending',
      retryCount: 0,
    };

    this.alertHistory.set(history.id, history);

    // 发送告警通知
    await this.sendAlertNotifications(alert, history);
  }

  /**
   * 处理告警解决事件
   */
  private async handleAlertResolved(alert: AlertEvent): Promise<void> {
    this.alertLogger.info('处理告警解决事件', {
      alertId: alert.id,
      ruleName: alert.ruleName,
    });

    // 发送解决通知（如果配置了的话）
    await this.sendResolutionNotifications(alert);
    
    // 自动解除静默
    await this.unsilenceAlert(alert.id);
  }
  /**
   * 发送告警通知
   */
  private async sendAlertNotifications(alert: AlertEvent, history: AlertHistory): Promise<void> {
    const applicablePolicies = this.getApplicablePolicies(alert);
    
    if (applicablePolicies.length === 0) {
      this.alertLogger.warn('没有找到适用的告警策略', {
        alertId: alert.id,
        ruleName: alert.ruleName,
      });
      return;
    }

    for (const policy of applicablePolicies) {
      if (!policy.enabled) {
        continue;
      }

      for (const channelConfig of policy.channels) {
        if (!channelConfig.enabled) {
          continue;
        }

        // 检查告警级别是否满足通道要求
        if (!this.shouldSendToChannel(alert.severity, channelConfig.minSeverity)) {
          continue;
        }

        try {
          await this.sendToChannel(alert, channelConfig);
          history.channels.push(channelConfig.type);
          
          this.alertLogger.info('告警通知已发送', {
            alertId: alert.id,
            channel: channelConfig.type,
            targets: channelConfig.targets.length,
          });
          
        } catch (error) {
          this.alertLogger.error('发送告警通知失败', {
            alertId: alert.id,
            channel: channelConfig.type,
            error: error instanceof Error ? error.message : String(error),
          });
          
          history.error = error instanceof Error ? error.message : String(error);
        }
      }
    }

    // 更新历史记录状态
    history.status = history.channels.length > 0 ? 'sent' : 'failed';
    history.sentAt = new Date();
  }

  /**
   * 发送解决通知
   */
  private async sendResolutionNotifications(alert: AlertEvent): Promise<void> {
    // 查找原始告警的历史记录
    const originalHistory = Array.from(this.alertHistory.values())
      .find(h => h.alert.id === alert.id && h.status === 'sent');

    if (!originalHistory) {
      return;
    }

    // 只向原来发送过告警的通道发送解决通知
    for (const channelType of originalHistory.channels) {
      const policy = this.alertPolicies.get('default');
      if (!policy) continue;

      const channelConfig = policy.channels.find(c => c.type === channelType);
      if (!channelConfig?.enabled) continue;

      try {
        await this.sendResolutionToChannel(alert, channelConfig);
        
        this.alertLogger.info('告警解决通知已发送', {
          alertId: alert.id,
          channel: channelType,
        });
        
      } catch (error) {
        this.alertLogger.error('发送告警解决通知失败', {
          alertId: alert.id,
          channel: channelType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 获取适用的告警策略
   */
  private getApplicablePolicies(alert: AlertEvent): AlertPolicyConfig[] {
    // 简单实现：返回所有启用的策略
    // 实际应用中可以根据告警规则、标签等进行更精确的匹配
    return Array.from(this.alertPolicies.values()).filter(policy => policy.enabled);
  }

  /**
   * 检查是否应该发送到指定通道
   */
  private shouldSendToChannel(alertSeverity: string, minSeverity: string): boolean {
    const severityLevels = {
      'info': 0,
      'warning': 1,
      'error': 2,
      'critical': 3,
    };

    const alertLevel = severityLevels[alertSeverity as keyof typeof severityLevels] ?? 0;
    const minLevel = severityLevels[minSeverity as keyof typeof severityLevels] ?? 0;

    return alertLevel >= minLevel;
  }

  /**
   * 发送到指定通道
   */
  private async sendToChannel(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    switch (channelConfig.type) {
      case 'email':
        await this.sendEmailAlert(alert, channelConfig);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alert, channelConfig);
        break;
      case 'slack':
      case 'dingtalk':
      case 'feishu':
        await this.sendIMAlert(alert, channelConfig);
        break;
      case 'sms':
        await this.sendSMSAlert(alert, channelConfig);
        break;
      default:
        throw new Error(`不支持的告警通道类型: ${channelConfig.type}`);
    }
  }

  /**
   * 发送解决通知到指定通道
   */
  private async sendResolutionToChannel(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    switch (channelConfig.type) {
      case 'email':
        await this.sendEmailResolution(alert, channelConfig);
        break;
      case 'webhook':
        await this.sendWebhookResolution(alert, channelConfig);
        break;
      case 'slack':
      case 'dingtalk':
      case 'feishu':
        await this.sendIMResolution(alert, channelConfig);
        break;
      case 'sms':
        // SMS通常不发送解决通知
        break;
    }
  }

  /**
   * 发送邮件告警
   */
  private async sendEmailAlert(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const subject = `🚨 [${alert.severity.toUpperCase()}] ${alert.message}`;
    
    this.alertLogger.debug('发送邮件告警', {
      recipients: channelConfig.targets,
      subject,
    });
    
    // 邮件发送逻辑待实现
    this.alertLogger.info('邮件告警已记录（待实现实际发送）', {
      alertId: alert.id,
      targets: channelConfig.targets,
    });
  }

  /**
   * 发送Webhook告警
   */
  private async sendWebhookAlert(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const webhookUrl = channelConfig.config?.url;
    if (!webhookUrl) {
      throw new Error('Webhook URL未配置');
    }

    const payload = {
      type: 'alert',
      alert: {
        id: alert.id,
        ruleName: alert.ruleName,
        metricName: alert.metricName,
        severity: alert.severity,
        message: alert.message,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
        triggeredAt: alert.triggeredAt.toISOString(),
        labels: alert.labels,
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Code-Review-Alert-Manager/1.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook请求失败: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 发送即时消息告警
   */
  private async sendIMAlert(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const webhookUrl = channelConfig.config?.webhook;
    if (!webhookUrl) {
      throw new Error('IM Webhook URL未配置');
    }

    const message = this.buildIMAlertMessage(alert);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`IM Webhook请求失败: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 发送短信告警
   */
  private async sendSMSAlert(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    // SMS实现需要集成短信服务商API
    // 这里提供接口，具体实现可以根据使用的短信服务进行
    this.alertLogger.info('SMS告警发送（模拟）', {
      alertId: alert.id,
      phones: channelConfig.targets,
      message: alert.message,
    });
  }
  /**
   * 发送邮件解决通知
   */
  private async sendEmailResolution(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const subject = `✅ [已解决] ${alert.message}`;
    
    this.alertLogger.debug('发送邮件解决通知', {
      recipients: channelConfig.targets,
      subject,
    });
    
    // 邮件发送逻辑待实现
    this.alertLogger.info('邮件解决通知已记录（待实现实际发送）', {
      alertId: alert.id,
      targets: channelConfig.targets,
    });
  }

  /**
   * 发送Webhook解决通知
   */
  private async sendWebhookResolution(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const webhookUrl = channelConfig.config?.url;
    if (!webhookUrl) return;

    const payload = {
      type: 'resolution',
      alert: {
        id: alert.id,
        ruleName: alert.ruleName,
        message: alert.message,
        resolvedAt: new Date().toISOString(),
      },
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 发送即时消息解决通知
   */
  private async sendIMResolution(alert: AlertEvent, channelConfig: AlertChannelConfig): Promise<void> {
    const webhookUrl = channelConfig.config?.webhook;
    if (!webhookUrl) return;

    const message = this.buildIMResolutionMessage(alert);
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  }

  /**
   * 构建邮件告警内容
   */
  private buildEmailAlertContent(alert: AlertEvent): string {
    return `# 🚨 系统告警

## 告警信息

- **规则名称:** ${alert.ruleName}
- **指标名称:** ${alert.metricName}
- **严重程度:** ${alert.severity.toUpperCase()}
- **当前值:** ${alert.currentValue}
- **阈值:** ${alert.threshold}
- **触发时间:** ${alert.triggeredAt.toISOString()}

## 告警描述

${alert.message}

---

*此告警由 CodeReview 监控模块自动发送*`;
  }

  /**
   * 构建邮件解决通知内容
   */
  private buildEmailResolutionContent(alert: AlertEvent): string {
    return `# ✅ 告警已解决

## 告警信息

- **规则名称:** ${alert.ruleName}
- **指标名称:** ${alert.metricName}
- **解决时间:** ${new Date().toISOString()}

告警 "${alert.message}" 已自动解决。

---

*此通知由 CodeReview 监控模块自动发送*`;
  }

  /**
   * 构建即时消息告警内容
   */
  private buildIMAlertMessage(alert: AlertEvent): any {
    const emoji = this.getSeverityEmoji(alert.severity);
    
    return {
      msgtype: 'markdown',
      markdown: {
        title: `${emoji} 系统告警`,
        text: `## ${emoji} 系统告警

**规则:** ${alert.ruleName}  
**指标:** ${alert.metricName}  
**严重程度:** ${alert.severity.toUpperCase()}  
**当前值:** ${alert.currentValue}  
**阈值:** ${alert.threshold}  

**描述:** ${alert.message}

**时间:** ${alert.triggeredAt.toLocaleString('zh-CN')}`,
      },
    };
  }

  /**
   * 构建即时消息解决通知内容
   */
  private buildIMResolutionMessage(alert: AlertEvent): any {
    return {
      msgtype: 'markdown',
      markdown: {
        title: '✅ 告警已解决',
        text: `## ✅ 告警已解决

**规则:** ${alert.ruleName}  
**指标:** ${alert.metricName}  

告警 "${alert.message}" 已自动解决。

**解决时间:** ${new Date().toLocaleString('zh-CN')}`,
      },
    };
  }

  /**
   * 获取严重程度对应的表情符号
   */
  private getSeverityEmoji(severity: string): string {
    const emojiMap: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };
    return emojiMap[severity] || '⚠️';
  }

  /**
   * 初始化默认策略
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicy: AlertPolicyConfig = {
      name: 'default',
      enabled: true,
      channels: [
        {
          type: 'email',
          enabled: true,
          targets: [process.env.ADMIN_EMAIL || 'admin@example.com'],
          minSeverity: 'warning',
        },
        {
          type: 'webhook',
          enabled: false,
          targets: [],
          minSeverity: 'error',
          config: {
            url: process.env.ALERT_WEBHOOK_URL,
          },
        },
      ],
      silenceDuration: 300000, // 5分钟
      repeatInterval: 1800000, // 30分钟
      maxRepeats: 3,
    };

    this.addAlertPolicy(defaultPolicy);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const redis = await RedisClient.getInstance();
      await redis.ping();
      
      return true;
    } catch (error) {
      this.alertLogger.error('告警管理器健康检查失败', { error });
      return false;
    }
  }

  /**
   * 停止告警管理器
   */
  stop(): void {
    this.removeAllListeners();
    this.alertLogger.info('告警管理器已停止');
  }
}

// 导出单例实例
export const alertManager = new AlertManager();