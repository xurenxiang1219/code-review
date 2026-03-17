# API 认证中间件文档

## 概述

AI 代码审查系统的认证中间件提供了完整的 API 访问控制、权限管理和安全防护功能。支持 JWT Token 和 API Key 两种认证方式，具备速率限制、审计日志、安全事件监控等功能。

## 功能特性

### 🔐 认证方式
- **JWT Token 认证**: 适用于用户会话管理
- **API Key 认证**: 适用于服务间调用和自动化工具

### 🛡️ 安全防护
- **速率限制**: 防止 API 滥用和 DDoS 攻击
- **权限控制**: 基于角色和权限的细粒度访问控制
- **审计日志**: 记录所有 API 访问和操作
- **安全事件监控**: 检测和记录可疑活动

### 🚀 性能优化
- **Redis 缓存**: 高性能的速率限制和会话管理
- **异步处理**: 非阻塞的日志记录和事件处理
- **连接池**: 优化的数据库连接管理

## 认证方式

### JWT Token 认证

#### 请求头格式
```http
Authorization: Bearer <jwt_token>
```

#### Token 结构
```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "role": "developer",
  "permissions": ["review:read", "config:write"],
  "iat": 1640995200,
  "exp": 1641081600,
  "iss": "ai-code-review-system",
  "aud": "ai-code-review-api"
}
```

### API Key 认证

#### 请求头格式
```http
X-API-Key: ak_1234567890abcdef...
```

#### API Key 格式
- 前缀: `ak_` (可配置)
- 长度: 67 个字符 (前缀 + 64 位十六进制)
- 示例: `ak_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`

## 用户角色和权限

### 角色定义

| 角色 | 描述 | 默认权限 |
|------|------|----------|
| `admin` | 管理员 | 所有权限 |
| `developer` | 开发者 | 审查读写、配置管理 |
| `viewer` | 查看者 | 只读权限 |
| `system` | 系统服务 | Webhook、内部调用 |

### 权限列表

| 权限 | 描述 |
|------|------|
| `review:read` | 查看审查记录 |
| `review:write` | 创建/更新审查记录 |
| `review:delete` | 删除审查记录 |
| `config:read` | 查看配置 |
| `config:write` | 修改配置 |
| `webhook:receive` | 接收 Webhook |
| `system:admin` | 系统管理 |
| `health:check` | 健康检查 |

## API 端点

### 认证管理

#### 获取 API Key 列表
```http
GET /api/auth/api-keys
Authorization: Bearer <jwt_token>
```

#### 创建 API Key
```http
POST /api/auth/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My API Key",
  "permissions": ["review:read", "config:read"],
  "expiresInDays": 365
}
```

#### 删除 API Key
```http
DELETE /api/auth/api-keys/{keyId}
Authorization: Bearer <jwt_token>
```

#### 禁用/启用 API Key
```http
PUT /api/auth/api-keys/{keyId}
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "enabled": false
}
```

### 审计日志

#### 查询审计日志
```http
GET /api/auth/audit-logs?page=1&pageSize=20&startTime=2024-01-01T00:00:00Z
Authorization: Bearer <jwt_token>
```

## 速率限制

### 限制策略

| 认证方式 | 限制 | 时间窗口 |
|----------|------|----------|
| 默认 | 100 请求/分钟 | 1 分钟 |
| API Key | 1000 请求/分钟 | 1 分钟 |
| Webhook | 50 请求/分钟 | 1 分钟 |

### 响应头

当请求被速率限制时，响应会包含以下头部：

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995260
```

## 安全配置

### 环境变量

```bash
# JWT 配置
JWT_SECRET=your_jwt_secret_at_least_32_characters_long
JWT_ISSUER=ai-code-review-system
JWT_AUDIENCE=ai-code-review-api

# 速率限制
API_RATE_LIMIT=100
API_KEY_RATE_LIMIT=1000
WEBHOOK_RATE_LIMIT=50

# CORS 配置
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

### 安全响应头

中间件会自动添加以下安全响应头：

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## 使用示例

### 1. 使用 JWT Token 访问 API

```javascript
const response = await fetch('/api/reviews', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  }
});
```

### 2. 使用 API Key 访问 API

```javascript
const response = await fetch('/api/config', {
  headers: {
    'X-API-Key': 'ak_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'Content-Type': 'application/json'
  }
});
```

### 3. 创建 API Key

```javascript
const response = await fetch('/api/auth/api-keys', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <jwt_token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'CI/CD Pipeline Key',
    permissions: ['review:read', 'webhook:receive'],
    expiresInDays: 90
  })
});

const { data } = await response.json();
console.log('API Key:', data.apiKey);
```

## 错误处理

### 常见错误码

| HTTP 状态码 | 业务错误码 | 描述 |
|-------------|------------|------|
| 401 | `INVALID_TOKEN` | Token 无效 |
| 401 | `TOKEN_EXPIRED` | Token 已过期 |
| 401 | `INVALID_API_KEY` | API Key 无效 |
| 403 | `INSUFFICIENT_PERMISSIONS` | 权限不足 |
| 429 | `RATE_LIMIT_EXCEEDED` | 速率限制超出 |

### 错误响应格式

```json
{
  "code": 1001,
  "msg": "Token 已过期",
  "data": null,
  "timestamp": 1640995200000,
  "requestId": "req-123456"
}
```

## 部署和初始化

### 1. 数据库迁移

```bash
# 运行认证相关的数据库迁移
pnpm db:migrate
```

### 2. 初始化认证系统

```bash
# 创建默认用户和系统 API Key
pnpm tsx scripts/init-auth.ts
```

### 3. 验证配置

```bash
# 检查认证配置是否正确
pnpm tsx -e "
import { validateAuthConfig } from './config/auth';
validateAuthConfig();
console.log('认证配置验证通过');
"
```

## 监控和维护

### 审计日志查询

```sql
-- 查看最近的认证失败
SELECT * FROM security_events 
WHERE type IN ('invalid_token', 'expired_token') 
ORDER BY created_at DESC 
LIMIT 10;

-- 查看 API 使用统计
SELECT 
  user_email,
  COUNT(*) as request_count,
  AVG(duration) as avg_duration
FROM audit_logs 
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY user_email
ORDER BY request_count DESC;
```

### 性能监控

```bash
# 查看 Redis 连接状态
redis-cli ping

# 查看速率限制键
redis-cli keys "rate_limit:*"

# 清理过期的速率限制数据
redis-cli eval "return redis.call('del', unpack(redis.call('keys', 'rate_limit:*')))" 0
```

## 最佳实践

### 1. API Key 管理
- 定期轮换 API Key
- 为不同用途创建不同的 API Key
- 设置合理的过期时间
- 监控 API Key 使用情况

### 2. 权限控制
- 遵循最小权限原则
- 定期审查用户权限
- 使用角色而非直接分配权限
- 记录权限变更

### 3. 安全监控
- 监控异常的 API 调用模式
- 设置安全事件告警
- 定期检查审计日志
- 及时响应安全事件

### 4. 性能优化
- 合理设置速率限制
- 监控 Redis 性能
- 优化数据库查询
- 使用连接池

## 故障排除

### 常见问题

1. **JWT Token 验证失败**
   - 检查 JWT_SECRET 配置
   - 确认 Token 格式正确
   - 验证签发者和受众

2. **API Key 认证失败**
   - 检查 API Key 格式
   - 确认 API Key 未过期
   - 验证权限配置

3. **速率限制问题**
   - 检查 Redis 连接
   - 确认限制配置合理
   - 监控请求频率

4. **权限不足错误**
   - 检查用户角色
   - 验证权限配置
   - 确认 API 端点权限要求

### 调试技巧

```bash
# 启用详细日志
export LOG_LEVEL=debug

# 检查中间件执行
curl -v -H "Authorization: Bearer <token>" http://localhost:3000/api/reviews

# 查看审计日志
tail -f logs/combined.log | grep "audit"
```