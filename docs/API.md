# API 文档

本文档详细说明 AI 代码审查系统的所有 API 接口。

## 目录

- [认证](#认证)
- [Webhook API](#webhook-api)
- [Reviews API](#reviews-api)
- [Config API](#config-api)
- [Health Check API](#health-check-api)
- [Monitoring API](#monitoring-api)
- [Auth API](#auth-api)
- [响应格式](#响应格式)
- [错误码](#错误码)

## 认证

大部分 API 端点需要认证。系统支持两种认证方式：

### 1. JWT Token 认证

用于 Web 界面访问：

```http
Authorization: Bearer <jwt_token>
```

### 2. API Key 认证

用于程序化访问：

```http
X-API-Key: <api_key>
```

## Webhook API

### 接收 Webhook 事件

接收来自 Git 仓库的 push 事件通知。

**端点**：`POST /api/webhook`

**认证**：Webhook 签名验证

**请求头**：

```http
Content-Type: application/json
X-Hub-Signature-256: sha256=<signature>  # GitHub
X-Gitlab-Token: <token>                  # GitLab
```

**请求体**（GitHub 格式）：

```json
{
  "ref": "refs/heads/uat",
  "repository": {
    "name": "my-project",
    "full_name": "org/my-project",
    "url": "https://github.com/org/my-project"
  },
  "commits": [
    {
      "id": "abc123def456",
      "message": "Fix bug in authentication",
      "author": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "timestamp": "2024-01-01T12:00:00Z",
      "url": "https://github.com/org/my-project/commit/abc123"
    }
  ]
}
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Review task queued",
    "commitsProcessed": 1
  },
  "timestamp": 1704110400000,
  "requestId": "req-123"
}
```

**状态码**：
- `202 Accepted` - Webhook 已接收并加入队列
- `400 Bad Request` - 请求格式错误
- `401 Unauthorized` - 签名验证失败
- `500 Internal Server Error` - 服务器错误

## Reviews API

### 查询审查记录列表

获取审查记录列表，支持分页和过滤。

**端点**：`GET /api/reviews`

**认证**：需要

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20，最大 100 |
| branch | string | 否 | 分支名过滤 |
| author | string | 否 | 作者邮箱过滤 |
| status | string | 否 | 状态过滤：pending, processing, completed, failed |
| from | string | 否 | 开始日期（ISO 8601 格式） |
| to | string | 否 | 结束日期（ISO 8601 格式） |
| severity | string | 否 | 最低严重程度：critical, major, minor, suggestion |

**请求示例**：

```http
GET /api/reviews?branch=uat&page=1&pageSize=20&from=2024-01-01&to=2024-01-31
Authorization: Bearer <token>
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "items": [
      {
        "id": "review-uuid-1",
        "commitHash": "abc123def456",
        "branch": "uat",
        "repository": "org/my-project",
        "author": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "filesChanged": 5,
        "linesAdded": 120,
        "linesDeleted": 45,
        "summary": {
          "total": 8,
          "critical": 1,
          "major": 3,
          "minor": 2,
          "suggestion": 2
        },
        "status": "completed",
        "startedAt": "2024-01-01T12:00:00Z",
        "completedAt": "2024-01-01T12:02:30Z",
        "processingTimeMs": 150000,
        "createdAt": "2024-01-01T12:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8
    }
  },
  "timestamp": 1704110400000,
  "requestId": "req-456"
}
```

### 查询审查详情

获取单个审查记录的详细信息，包括所有审查评论。

**端点**：`GET /api/reviews/:reviewId`

**认证**：需要

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| reviewId | string | 审查记录 ID |

**请求示例**：

```http
GET /api/reviews/review-uuid-1
Authorization: Bearer <token>
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "id": "review-uuid-1",
    "commitHash": "abc123def456",
    "branch": "uat",
    "repository": "org/my-project",
    "author": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "filesChanged": 5,
    "linesAdded": 120,
    "linesDeleted": 45,
    "comments": [
      {
        "id": "comment-uuid-1",
        "filePath": "src/auth/login.ts",
        "lineNumber": 42,
        "severity": "critical",
        "category": "security",
        "message": "潜在的 SQL 注入漏洞",
        "suggestion": "使用参数化查询或 ORM 来防止 SQL 注入",
        "codeSnippet": "const query = `SELECT * FROM users WHERE email = '${email}'`;",
        "published": true,
        "publishedAt": "2024-01-01T12:02:00Z"
      },
      {
        "id": "comment-uuid-2",
        "filePath": "src/utils/helpers.ts",
        "lineNumber": 15,
        "severity": "major",
        "category": "performance",
        "message": "循环中存在不必要的数组复制",
        "suggestion": "将数组复制移到循环外部以提高性能",
        "codeSnippet": "for (let i = 0; i < items.length; i++) {\n  const copy = [...items];\n}",
        "published": true,
        "publishedAt": "2024-01-01T12:02:00Z"
      }
    ],
    "summary": {
      "total": 8,
      "critical": 1,
      "major": 3,
      "minor": 2,
      "suggestion": 2
    },
    "status": "completed",
    "startedAt": "2024-01-01T12:00:00Z",
    "completedAt": "2024-01-01T12:02:30Z",
    "processingTimeMs": 150000,
    "createdAt": "2024-01-01T12:00:00Z"
  },
  "timestamp": 1704110400000,
  "requestId": "req-789"
}
```

**状态码**：
- `200 OK` - 成功
- `404 Not Found` - 审查记录不存在
- `401 Unauthorized` - 未授权
- `500 Internal Server Error` - 服务器错误

## Config API

### 获取审查配置

获取当前的审查配置。

**端点**：`GET /api/config`

**认证**：需要

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repository | string | 否 | 仓库名称，不提供则返回默认配置 |

**请求示例**：

```http
GET /api/config?repository=org/my-project
Authorization: Bearer <token>
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "id": "config-uuid-1",
    "repository": "org/my-project",
    "reviewFocus": ["security", "performance", "readability"],
    "fileWhitelist": ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py"],
    "ignorePatterns": [
      "node_modules/**",
      "dist/**",
      "build/**",
      "*.test.ts",
      "*.spec.ts"
    ],
    "aiModelConfig": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.3,
      "maxTokens": 4000
    },
    "pollingEnabled": true,
    "pollingInterval": 300,
    "notificationConfig": {
      "email": {
        "enabled": true,
        "recipients": ["team@example.com"]
      },
      "webhook": {
        "enabled": false,
        "url": ""
      }
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": 1704110400000,
  "requestId": "req-abc"
}
```

### 更新审查配置

更新审查配置。

**端点**：`PUT /api/config`

**认证**：需要（需要管理员权限）

**请求体**：

```json
{
  "repository": "org/my-project",
  "reviewFocus": ["security", "performance"],
  "fileWhitelist": ["*.ts", "*.tsx"],
  "ignorePatterns": ["node_modules/**", "dist/**"],
  "aiModelConfig": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "temperature": 0.2,
    "maxTokens": 8000
  },
  "pollingEnabled": true,
  "pollingInterval": 600,
  "notificationConfig": {
    "email": {
      "enabled": true,
      "recipients": ["team@example.com", "lead@example.com"]
    }
  }
}
```

**响应**：

```json
{
  "code": 0,
  "msg": "配置更新成功",
  "data": {
    "id": "config-uuid-1",
    "repository": "org/my-project",
    "reviewFocus": ["security", "performance"],
    "updatedAt": "2024-01-20T15:45:00Z"
  },
  "timestamp": 1704110400000,
  "requestId": "req-def"
}
```

**状态码**：
- `200 OK` - 更新成功
- `400 Bad Request` - 请求参数错误
- `401 Unauthorized` - 未授权
- `403 Forbidden` - 权限不足
- `500 Internal Server Error` - 服务器错误

## Health Check API

### 系统健康检查

检查系统各组件的健康状态。

**端点**：`GET /api/health`

**认证**：不需要

**请求示例**：

```http
GET /api/health
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-20T16:00:00Z",
    "uptime": 86400,
    "version": "0.1.0",
    "components": {
      "database": {
        "status": "healthy",
        "responseTime": 5,
        "details": {
          "host": "localhost",
          "port": 3306,
          "connected": true
        }
      },
      "redis": {
        "status": "healthy",
        "responseTime": 2,
        "details": {
          "host": "localhost",
          "port": 6379,
          "connected": true
        }
      },
      "aiService": {
        "status": "healthy",
        "responseTime": 150,
        "details": {
          "provider": "openai",
          "model": "gpt-4",
          "available": true
        }
      },
      "gitService": {
        "status": "healthy",
        "responseTime": 80,
        "details": {
          "provider": "github",
          "authenticated": true
        }
      }
    },
    "metrics": {
      "queueLength": 3,
      "activeWorkers": 2,
      "totalReviews": 1250,
      "successRate": 98.5
    }
  },
  "timestamp": 1704110400000,
  "requestId": "req-health"
}
```

**状态码**：
- `200 OK` - 系统健康
- `503 Service Unavailable` - 系统不健康（某些组件故障）

## Monitoring API

### 获取监控指标

获取系统监控指标。

**端点**：`GET /api/monitoring`

**认证**：需要

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from | string | 否 | 开始时间（ISO 8601 格式） |
| to | string | 否 | 结束时间（ISO 8601 格式） |
| interval | string | 否 | 时间间隔：1m, 5m, 15m, 1h, 1d，默认 5m |

**请求示例**：

```http
GET /api/monitoring?from=2024-01-20T00:00:00Z&to=2024-01-20T23:59:59Z&interval=1h
Authorization: Bearer <token>
```

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "metrics": [
      {
        "timestamp": "2024-01-20T00:00:00Z",
        "reviewsCompleted": 45,
        "reviewsFailed": 2,
        "averageProcessingTime": 125000,
        "queueLength": 5,
        "activeWorkers": 3,
        "cpuUsage": 45.2,
        "memoryUsage": 62.8
      },
      {
        "timestamp": "2024-01-20T01:00:00Z",
        "reviewsCompleted": 38,
        "reviewsFailed": 1,
        "averageProcessingTime": 118000,
        "queueLength": 3,
        "activeWorkers": 3,
        "cpuUsage": 42.1,
        "memoryUsage": 61.5
      }
    ],
    "summary": {
      "totalReviews": 1250,
      "successRate": 98.5,
      "averageProcessingTime": 122000,
      "peakQueueLength": 15
    }
  },
  "timestamp": 1704110400000,
  "requestId": "req-monitor"
}
```

### 获取告警规则

获取配置的告警规则。

**端点**：`GET /api/monitoring/rules`

**认证**：需要

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "rules": [
      {
        "id": "rule-1",
        "name": "队列长度告警",
        "metric": "queueLength",
        "condition": "greater_than",
        "threshold": 50,
        "duration": 300,
        "severity": "warning",
        "enabled": true
      },
      {
        "id": "rule-2",
        "name": "失败率告警",
        "metric": "failureRate",
        "condition": "greater_than",
        "threshold": 5,
        "duration": 600,
        "severity": "critical",
        "enabled": true
      }
    ]
  },
  "timestamp": 1704110400000,
  "requestId": "req-rules"
}
```

### 获取告警历史

获取触发的告警历史。

**端点**：`GET /api/monitoring/alerts`

**认证**：需要

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |
| severity | string | 否 | 严重程度过滤：critical, warning, info |
| status | string | 否 | 状态过滤：active, resolved |

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "items": [
      {
        "id": "alert-1",
        "ruleId": "rule-1",
        "ruleName": "队列长度告警",
        "severity": "warning",
        "message": "队列长度超过阈值：当前 65，阈值 50",
        "status": "resolved",
        "triggeredAt": "2024-01-20T10:30:00Z",
        "resolvedAt": "2024-01-20T10:45:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 45,
      "totalPages": 3
    }
  },
  "timestamp": 1704110400000,
  "requestId": "req-alerts"
}
```

## Auth API

### 创建 API Key

创建新的 API Key。

**端点**：`POST /api/auth/api-keys`

**认证**：需要（需要管理员权限）

**请求体**：

```json
{
  "name": "CI/CD Pipeline",
  "description": "用于 CI/CD 流程的 API Key",
  "permissions": ["reviews:read", "config:read"],
  "expiresAt": "2025-01-20T00:00:00Z"
}
```

**响应**：

```json
{
  "code": 0,
  "msg": "API Key 创建成功",
  "data": {
    "id": "key-uuid-1",
    "name": "CI/CD Pipeline",
    "key": "ak_1234567890abcdef",
    "permissions": ["reviews:read", "config:read"],
    "createdAt": "2024-01-20T16:00:00Z",
    "expiresAt": "2025-01-20T00:00:00Z"
  },
  "timestamp": 1704110400000,
  "requestId": "req-key"
}
```

**注意**：API Key 只在创建时返回一次，请妥善保管。

### 列出 API Keys

列出所有 API Keys。

**端点**：`GET /api/auth/api-keys`

**认证**：需要

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "items": [
      {
        "id": "key-uuid-1",
        "name": "CI/CD Pipeline",
        "permissions": ["reviews:read", "config:read"],
        "lastUsedAt": "2024-01-20T15:30:00Z",
        "createdAt": "2024-01-20T16:00:00Z",
        "expiresAt": "2025-01-20T00:00:00Z",
        "status": "active"
      }
    ]
  },
  "timestamp": 1704110400000
}
```

### 撤销 API Key

撤销指定的 API Key。

**端点**：`DELETE /api/auth/api-keys/:keyId`

**认证**：需要（需要管理员权限）

**响应**：

```json
{
  "code": 0,
  "msg": "API Key 已撤销",
  "data": null,
  "timestamp": 1704110400000
}
```

### 查询审计日志

查询 API 访问审计日志。

**端点**：`GET /api/auth/audit-logs`

**认证**：需要（需要管理员权限）

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| action | string | 否 | 操作类型过滤 |
| userId | string | 否 | 用户 ID 过滤 |
| from | string | 否 | 开始时间 |
| to | string | 否 | 结束时间 |

**响应**：

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "items": [
      {
        "id": "log-uuid-1",
        "userId": "user-uuid-1",
        "action": "config:update",
        "resource": "config-uuid-1",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0...",
        "timestamp": "2024-01-20T16:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 500,
      "totalPages": 25
    }
  },
  "timestamp": 1704110400000
}
```

## 响应格式

所有 API 响应遵循统一的格式：

```typescript
interface ApiResponse<T> {
  code: number;        // 业务状态码
  msg: string;         // 响应消息
  data: T | null;      // 响应数据
  timestamp: number;   // 时间戳（毫秒）
  requestId?: string;  // 请求追踪 ID
}
```

### 分页响应

分页数据使用以下格式：

```typescript
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

## 错误码

### 业务状态码

| 状态码 | 说明 |
|--------|------|
| 0 | 操作成功 |
| 1000 | 请求参数错误 |
| 1001 | 未授权访问 |
| 1003 | 禁止访问 |
| 1004 | 资源不存在 |
| 1005 | 数据验证失败 |
| 1006 | 请求频率超限 |
| 2000 | 服务器内部错误 |
| 2001 | 数据库错误 |
| 2002 | Redis 错误 |
| 2003 | AI 服务错误 |
| 2004 | Git 服务错误 |
| 2005 | 队列服务错误 |
| 3001 | 审查记录不存在 |
| 3002 | 提交已被处理 |
| 3003 | Webhook 签名无效 |
| 3004 | 审查正在进行中 |
| 3005 | 配置不存在 |

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 资源创建成功 |
| 202 | 请求已接受（异步处理） |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

### 错误响应示例

```json
{
  "code": 1005,
  "msg": "数据验证失败",
  "data": {
    "errors": [
      {
        "field": "email",
        "message": "邮箱格式不正确"
      },
      {
        "field": "pollingInterval",
        "message": "轮询间隔必须在 30-3600 秒之间"
      }
    ]
  },
  "timestamp": 1704110400000,
  "requestId": "req-error"
}
```

## 速率限制

API 实施速率限制以防止滥用：

- **认证端点**：10 次/分钟
- **Webhook 端点**：100 次/分钟
- **查询端点**：60 次/分钟
- **配置更新**：10 次/分钟

超过限制时返回 `429 Too Many Requests`：

```json
{
  "code": 1006,
  "msg": "请求频率超限",
  "data": {
    "limit": 60,
    "remaining": 0,
    "resetAt": "2024-01-20T16:01:00Z"
  },
  "timestamp": 1704110400000
}
```

响应头包含速率限制信息：

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704110460
```

## 最佳实践

1. **使用 HTTPS**：生产环境必须使用 HTTPS
2. **妥善保管凭证**：不要在代码中硬编码 API Key 或 Token
3. **处理错误**：始终检查响应的 `code` 字段
4. **实现重试**：对于 5xx 错误，使用指数退避重试
5. **遵守速率限制**：实现客户端速率限制
6. **使用 requestId**：在报告问题时提供 `requestId`
7. **验证 Webhook**：始终验证 Webhook 签名

## 示例代码

### JavaScript/TypeScript

```typescript
// 使用 API Key 认证
const response = await fetch('https://api.example.com/api/reviews', {
  headers: {
    'X-API-Key': process.env.API_KEY,
    'Content-Type': 'application/json',
  },
});

const result = await response.json();

if (result.code === 0) {
  console.log('成功:', result.data);
} else {
  console.error('错误:', result.msg);
}
```

### Python

```python
import requests

headers = {
    'X-API-Key': os.environ['API_KEY'],
    'Content-Type': 'application/json',
}

response = requests.get(
    'https://api.example.com/api/reviews',
    headers=headers
)

result = response.json()

if result['code'] == 0:
    print('成功:', result['data'])
else:
    print('错误:', result['msg'])
```

### cURL

```bash
curl -X GET 'https://api.example.com/api/reviews?page=1&pageSize=20' \
  -H 'X-API-Key: your_api_key' \
  -H 'Content-Type: application/json'
```

## 更新日志

### v0.1.0 (2024-01-20)

- 初始 API 版本
- 支持 Webhook、Reviews、Config、Health、Monitoring、Auth 端点
- 实现 JWT 和 API Key 双重认证
- 添加速率限制和审计日志

---

如有问题或建议，请联系技术支持或提交 Issue。
