# Services 服务层

本目录包含 AI 代码审查系统的核心业务服务。

## 服务列表

### 1. Webhook Listener (webhook-listener.ts)
接收 Git 仓库的 webhook 推送事件。

**功能:**
- 验证 webhook 签名
- 提取提交信息
- 将审查任务加入队列

**需求:** 1.1, 1.2, 1.3, 1.4, 1.5, 11.2

### 2. Polling Scanner (polling-scanner.ts)
定期主动扫描 Git 仓库的新提交。

**功能:**
- 定时扫描 UAT 分支
- 提交去重检查
- 触发审查流程

**需求:** 2.1-2.10

### 3. Code Analyzer (code-analyzer.ts)
分析代码变更并提取审查所需信息。

**功能:**
- 获取代码差异
- 过滤非代码文件
- 拆分大型差异

**需求:** 3.1-3.5

### 4. AI Reviewer (ai-reviewer.ts)
调用 AI 模型进行代码审查。

**功能:**
- 构建审查提示词
- 调用 AI 模型
- 解析审查结果

**需求:** 4.1-4.5, 5.1-5.5, 10.2

### 5. Comment Publisher (comment-publisher.ts)
将审查结果发布到 Git 仓库。

**功能:**
- 发布行内评论
- 发布摘要评论
- 邮件备用方案

**需求:** 6.1-6.5

### 6. Notification Service (notification.ts)
发送审查完成通知。

**功能:**
- 邮件通知
- 即时消息通知（Slack、钉钉等）
- Critical 级别特殊告警
- 通知偏好管理

**需求:** 13.1-13.5

## 使用示例

### Notification Service

```typescript
import { createNotificationService } from '@/lib/services/notification';
import type { NotificationConfig } from '@/lib/db/repositories/config';

// 创建通知服务
const config: NotificationConfig = {
  email: {
    enabled: true,
    recipients: ['dev@example.com'],
    criticalOnly: false, // 只通知严重问题
  },
  im: {
    enabled: true,
    webhook: 'https://hooks.slack.com/services/xxx',
    channels: ['#dev-notifications'],
  },
  gitComment: {
    enabled: true,
    summaryOnly: false,
  },
};

const notificationService = createNotificationService(config);

// 发送审查通知
const result = await notificationService.sendReviewNotification(
  reviewResult,
  commitInfo,
  config
);

console.log('通知发送结果:', result);
// {
//   success: true,
//   emailSent: true,
//   imSent: true,
//   errors: []
// }
```

### 环境变量配置

```bash
# SMTP 邮件配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@ai-review.com

# 即时消息配置
IM_TYPE=slack  # 可选: slack, dingtalk, feishu

# Critical 告警接收人
PROJECT_LEADER_EMAIL=leader@example.com
```

### 通知偏好说明

#### 1. criticalOnly 模式
当 `email.criticalOnly = true` 时，只有发现 critical 级别问题才会发送通知。

```typescript
const config = {
  email: {
    enabled: true,
    recipients: ['dev@example.com'],
    criticalOnly: true, // 只通知严重问题
  },
  // ...
};
```

#### 2. Critical 级别特殊处理
当发现 critical 级别问题时，系统会：
- 发送额外的告警邮件
- 通知项目负责人（通过 PROJECT_LEADER_EMAIL 环境变量配置）
- 在邮件主题中添加 🚨 标识

#### 3. 即时消息支持
支持多种即时消息平台：
- **Slack**: 使用 Incoming Webhooks
- **钉钉**: 使用自定义机器人 Webhook
- **飞书**: 使用自定义机器人 Webhook

配置示例：
```typescript
const config = {
  im: {
    enabled: true,
    webhook: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX',
    channels: ['#dev-notifications', '#code-review'],
  },
  // ...
};
```

## 错误处理

所有服务都实现了完整的错误处理和日志记录：

```typescript
try {
  const result = await notificationService.sendReviewNotification(
    review,
    commit,
    config
  );
  
  if (!result.success) {
    console.error('通知发送失败:', result.errors);
  }
} catch (error) {
  if (error instanceof NotificationError) {
    console.error('通知错误:', error.code, error.message);
    console.log('是否可重试:', error.retryable);
  }
}
```

## 健康检查

所有服务都提供健康检查方法：

```typescript
const isHealthy = await notificationService.healthCheck();
console.log('服务健康状态:', isHealthy);
```

## 测试

每个服务都有对应的单元测试：

```bash
# 运行所有服务测试
npm test -- tests/unit/

# 运行特定服务测试
npm test -- tests/unit/notification.test.ts
```

## 注意事项

1. **邮件发送**: 需要配置 SMTP 服务器信息
2. **即时消息**: 需要在对应平台创建 Webhook
3. **日志记录**: 所有服务操作都会记录详细日志
4. **错误恢复**: 服务支持自动重试和降级处理
5. **性能考虑**: 通知发送是异步的，不会阻塞主流程
