# Webhook API 端点

## 概述

Webhook API 端点用于接收来自 Git 仓库（GitHub、GitLab 等）的推送事件，验证签名后将提交加入审查队列进行自动化代码审查。

## 端点

### POST /api/webhook

接收并处理 webhook 推送事件。

#### 支持的 Git 平台

- **GitHub**: 使用 `X-Hub-Signature-256` 或 `X-Hub-Signature` 头进行签名验证
- **GitLab**: 使用 `X-Gitlab-Token` 头进行令牌验证
- **通用**: 使用 `X-Webhook-Signature` 或 `X-Signature` 头进行签名验证

#### 请求示例

```bash
# GitHub Webhook
curl -X POST https://your-domain.com/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{
    "ref": "refs/heads/uat",
    "repository": {
      "name": "my-repo",
      "url": "https://github.com/org/repo"
    },
    "commits": [
      {
        "id": "abc123",
        "message": "Fix bug",
        "author": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "timestamp": "2024-01-01T00:00:00Z",
        "url": "https://github.com/org/repo/commit/abc123"
      }
    ]
  }'
```

#### 响应示例

**成功响应 (202 Accepted)**

```json
{
  "code": 0,
  "msg": "成功处理 1 个提交，1 个已加入队列，0 个已跳过",
  "data": {
    "taskIds": ["task-uuid-1"],
    "totalCommits": 1,
    "enqueuedCommits": 1,
    "skippedCommits": 0
  },
  "timestamp": 1234567890,
  "requestId": "request-uuid"
}
```

**错误响应 (401 Unauthorized)**

```json
{
  "code": 3003,
  "msg": "Webhook 签名验证失败",
  "data": null,
  "timestamp": 1234567890,
  "requestId": "request-uuid"
}
```

### GET /api/webhook

查询 webhook 配置信息（用于调试和验证）。

#### 请求示例

```bash
curl https://your-domain.com/api/webhook
```

#### 响应示例

```json
{
  "code": 0,
  "msg": "Webhook 配置信息",
  "data": {
    "provider": "github",
    "targetBranch": "uat",
    "autoEnqueue": true,
    "endpoint": "https://your-domain.com/api/webhook",
    "supportedProviders": ["github", "gitlab", "generic"],
    "requiredHeaders": {
      "github": "X-Hub-Signature-256 或 X-Hub-Signature",
      "gitlab": "X-Gitlab-Token",
      "generic": "X-Webhook-Signature 或 X-Signature"
    }
  },
  "timestamp": 1234567890,
  "requestId": "request-uuid"
}
```

## 环境变量配置

在 `.env` 文件中配置以下环境变量：

```bash
# Git 平台类型 (github/gitlab/generic)
GIT_PROVIDER=github

# Webhook 密钥（必填）
GIT_WEBHOOK_SECRET=your-webhook-secret

# 目标分支（默认: uat）
GIT_TARGET_BRANCH=uat

# 是否自动加入队列（默认: true）
WEBHOOK_AUTO_ENQUEUE=true
```

## Git 平台配置

### GitHub

1. 进入仓库设置 → Webhooks → Add webhook
2. Payload URL: `https://your-domain.com/api/webhook`
3. Content type: `application/json`
4. Secret: 填入与 `GIT_WEBHOOK_SECRET` 相同的值
5. 选择触发事件: `Just the push event`
6. 确保 Active 已勾选

### GitLab

1. 进入项目设置 → Webhooks
2. URL: `https://your-domain.com/api/webhook`
3. Secret token: 填入与 `GIT_WEBHOOK_SECRET` 相同的值
4. 触发器: 勾选 `Push events`
5. 分支过滤: 填入目标分支（如 `uat`）
6. 点击 Add webhook

## 错误代码

| 错误代码 | HTTP 状态码 | 说明 |
|---------|-----------|------|
| 0 | 202 | 成功接受请求 |
| 1000 | 400 | 请求参数错误（空 payload 或无效 JSON） |
| 3003 | 401 | Webhook 签名验证失败 |
| 2000 | 500 | 服务器内部错误 |

## 安全性

- 所有 webhook 请求必须包含有效的签名或令牌
- 签名验证失败的请求会被拒绝并记录安全日志
- 敏感信息（如密钥、令牌）不会出现在日志或响应中

## 监控和日志

系统会记录以下信息：

- 所有 webhook 请求的接收和处理状态
- 签名验证结果
- 提交信息和队列状态
- 处理时间和性能指标
- 错误和异常信息

日志可在 `logs/` 目录中查看。

## 测试

运行单元测试：

```bash
pnpm test tests/unit/webhook-api.test.ts
```

## 故障排查

### Webhook 请求被拒绝

1. 检查 `GIT_WEBHOOK_SECRET` 是否与 Git 平台配置一致
2. 确认请求头中包含正确的签名字段
3. 查看日志文件中的详细错误信息

### 提交未被处理

1. 确认推送的分支是否为目标分支（默认 `uat`）
2. 检查 `WEBHOOK_AUTO_ENQUEUE` 是否为 `true`
3. 查看队列状态确认任务是否已加入

### 性能问题

1. 检查 Redis 连接状态
2. 查看队列长度是否超过限制
3. 监控并发处理任务数量
