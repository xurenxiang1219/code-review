# Config API

配置管理 API，用于管理 AI 代码审查系统的审查配置。

## 端点

### GET /api/config

查询指定仓库的审查配置。

**查询参数:**
- `repository` (必填): 仓库名称

**响应示例:**
```json
{
  "code": 0,
  "msg": "配置查询成功",
  "data": {
    "id": "config-uuid",
    "repository": "owner/repo",
    "reviewFocus": ["security", "performance", "readability"],
    "fileWhitelist": ["*.ts", "*.tsx", "*.js", "*.jsx"],
    "ignorePatterns": ["node_modules/**", "dist/**"],
    "aiModel": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.3,
      "maxTokens": 4000,
      "apiKey": "***已配置***"
    },
    "pollingEnabled": false,
    "pollingInterval": 300,
    "notificationConfig": {
      "email": {
        "enabled": false,
        "recipients": [],
        "criticalOnly": true
      },
      "im": {
        "enabled": false,
        "channels": []
      },
      "gitComment": {
        "enabled": true,
        "summaryOnly": false
      }
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1704067200000,
  "requestId": "req-uuid"
}
```

**错误响应:**
- `1008`: 缺少 repository 参数
- `3005`: 配置不存在

### PUT /api/config

更新指定仓库的审查配置。如果配置不存在，会自动创建默认配置后再更新。

**查询参数:**
- `repository` (必填): 仓库名称

**请求体:**
```json
{
  "reviewFocus": ["security", "performance"],
  "fileWhitelist": ["*.ts", "*.js"],
  "ignorePatterns": ["node_modules/**"],
  "aiModel": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.2,
    "maxTokens": 3000,
    "apiKey": "sk-xxx"
  },
  "pollingEnabled": true,
  "pollingInterval": 600,
  "notificationConfig": {
    "email": {
      "enabled": true,
      "recipients": ["dev@example.com"],
      "criticalOnly": false
    }
  }
}
```

**字段说明:**
- `reviewFocus`: 审查关注点数组，可选值包括 security、performance、readability、maintainability
- `fileWhitelist`: 需要审查的文件类型白名单，支持 glob 模式
- `ignorePatterns`: 需要忽略的文件路径模式，支持 glob 模式
- `aiModel`: AI 模型配置
  - `provider`: AI 提供商 (openai, claude, etc.)
  - `model`: 模型名称
  - `temperature`: 温度参数 (0-2)
  - `maxTokens`: 最大 token 数 (100-8000)
  - `apiKey`: API 密钥 (可选)
  - `baseUrl`: API 基础地址 (可选)
- `pollingEnabled`: 是否启用轮询扫描
- `pollingInterval`: 轮询间隔，单位秒 (30-3600)
- `notificationConfig`: 通知配置
  - `email`: 邮件通知配置
  - `im`: 即时消息通知配置
  - `gitComment`: Git 评论通知配置

**响应:** 返回更新后的完整配置，格式同 GET 请求。

**错误响应:**
- `1008`: 缺少 repository 参数
- `1005`: 数据验证失败
- `1007`: 请求体格式错误

### POST /api/config

为指定仓库创建默认配置。

**查询参数:**
- `repository` (必填): 仓库名称

**响应:** 返回创建的默认配置，格式同 GET 请求，HTTP 状态码 201。

**错误响应:**
- `1008`: 缺少 repository 参数
- `3002`: 配置已存在

### DELETE /api/config

删除指定仓库的配置。

**查询参数:**
- `repository` (必填): 仓库名称

**响应:**
```json
{
  "code": 0,
  "msg": "配置删除成功",
  "data": null,
  "timestamp": 1704067200000,
  "requestId": "req-uuid"
}
```

**错误响应:**
- `1008`: 缺少 repository 参数
- `3005`: 配置不存在

## 使用示例

### 查询配置
```bash
curl -X GET "http://localhost:3000/api/config?repository=owner/repo"
```

### 更新配置
```bash
curl -X PUT "http://localhost:3000/api/config?repository=owner/repo" \
  -H "Content-Type: application/json" \
  -d '{
    "reviewFocus": ["security", "performance"],
    "pollingEnabled": true,
    "pollingInterval": 300
  }'
```

### 创建默认配置
```bash
curl -X POST "http://localhost:3000/api/config?repository=owner/repo"
```

### 删除配置
```bash
curl -X DELETE "http://localhost:3000/api/config?repository=owner/repo"
```

## 配置验证规则

### AI 模型配置
- `provider`: 必填，非空字符串
- `model`: 必填，非空字符串
- `temperature`: 必须在 0-2 之间
- `maxTokens`: 必须在 100-8000 之间
- `baseUrl`: 可选，必须是有效的 URL

### 轮询配置
- `pollingInterval`: 必须在 30-3600 秒之间

### 通知配置
- `email.recipients`: 必须是有效的邮箱地址数组
- `im.webhook`: 可选，必须是有效的 URL

## 安全说明

- API 密钥等敏感信息在响应中会被脱敏处理，显示为 `***已配置***`
- 所有敏感字段在日志中会自动脱敏
- 建议在生产环境中启用 API 认证和访问控制

## 错误处理

所有 API 都遵循统一的错误响应格式：

```json
{
  "code": 1005,
  "msg": "数据验证失败",
  "data": {
    "errors": [
      {
        "field": "aiModel.temperature",
        "message": "AI 模型温度必须在 0-2 之间",
        "code": "too_big"
      }
    ]
  },
  "timestamp": 1704067200000,
  "requestId": "req-uuid"
}
```

详细的错误码说明请参考 `lib/constants/api-codes.ts`。