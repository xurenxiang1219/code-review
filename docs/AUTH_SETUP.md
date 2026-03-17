# 认证系统设置指南

## 概述

AI代码审查系统现在包含完整的用户认证和权限管理功能。本文档将指导您完成认证系统的设置和使用。

## 功能特性

### 🔐 认证方式
- **简化登录**: 基于邮箱的无密码登录
- **JWT Token**: 安全的会话管理
- **API Key**: 用于服务间调用和自动化工具

### 👥 用户管理
- **自动用户创建**: 首次登录时自动创建用户账户
- **角色权限**: 支持管理员、开发者、查看者等角色
- **权限控制**: 细粒度的API访问控制

### 🛡️ 安全特性
- **审计日志**: 记录所有用户操作
- **速率限制**: 防止API滥用
- **安全事件监控**: 检测可疑活动

## 快速开始

### 1. 环境配置

确保 `.env` 文件包含以下配置：

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

### 2. 数据库迁移

运行认证系统数据库迁移：

```bash
# 执行认证表迁移
npm run tsx scripts/migrate-auth.ts

# 或者使用通用迁移命令
npm run db:migrate
```

### 3. 测试认证系统

验证认证系统是否正常工作：

```bash
npm run tsx scripts/test-auth.ts
```

### 4. 启动应用

```bash
npm run dev
```

## 使用指南

### 用户登录

1. 访问 `http://localhost:3000`
2. 点击"登录系统"按钮
3. 输入您的邮箱地址
4. 系统将自动创建用户账户（如果不存在）
5. 登录成功后跳转到配置页面

### 配置管理

登录后，您可以：

1. **访问配置页面**: 配置代码审查规则和AI模型参数
2. **查看审查记录**: 浏览历史审查结果
3. **管理系统设置**: 调整通知和轮询配置

### API访问

#### 使用JWT Token

```javascript
// 获取存储的token
const token = localStorage.getItem('auth_token');

// 发送认证请求
const response = await fetch('/api/config?repository=owner/repo', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

#### 使用API Key

```javascript
// 使用API Key访问
const response = await fetch('/api/config?repository=owner/repo', {
  headers: {
    'X-API-Key': 'ak_your_api_key_here',
    'Content-Type': 'application/json'
  }
});
```

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

## API端点

### 认证相关

- `POST /api/auth/login` - 用户登录
- `GET /api/auth/api-keys` - 获取API Key列表
- `POST /api/auth/api-keys` - 创建API Key
- `DELETE /api/auth/api-keys/{keyId}` - 删除API Key

### 受保护的端点

所有以下端点现在都需要认证：

- `GET /api/config` - 查询配置（需要 `config:read`）
- `PUT /api/config` - 更新配置（需要 `config:write`）
- `POST /api/config` - 创建配置（需要 `config:write`）
- `GET /api/reviews` - 查询审查记录（需要 `review:read`）

### 公开端点

以下端点无需认证：

- `GET /api/health` - 健康检查
- `GET /api/stats` - 系统统计
- `POST /api/webhook` - Webhook接收

## 故障排除

### 常见问题

#### 1. JWT Token验证失败

**症状**: 登录后立即跳转回登录页面

**解决方案**:
- 检查 `JWT_SECRET` 环境变量是否设置
- 确保JWT_SECRET长度至少32个字符
- 清除浏览器localStorage中的过期token

#### 2. 数据库连接错误

**症状**: 登录时显示"登录失败"

**解决方案**:
- 检查数据库连接配置
- 运行数据库迁移: `npm run tsx scripts/migrate-auth.ts`
- 验证用户表是否存在

#### 3. 权限不足错误

**症状**: API调用返回403错误

**解决方案**:
- 检查用户角色和权限配置
- 确认API端点所需的权限
- 重新登录获取最新权限

### 调试技巧

#### 启用详细日志

```bash
export LOG_LEVEL=debug
npm run dev
```

#### 检查JWT Token内容

```javascript
// 在浏览器控制台中执行
const token = localStorage.getItem('auth_token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log(payload);
```

#### 验证数据库表

```sql
-- 检查用户表
SELECT * FROM users LIMIT 5;

-- 检查API Key表
SELECT id, name, user_id, enabled, created_at FROM api_keys LIMIT 5;

-- 检查审计日志
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

## 安全最佳实践

### 1. JWT Secret管理

- 使用强随机字符串作为JWT_SECRET
- 定期轮换JWT密钥
- 在生产环境中使用环境变量

### 2. API Key管理

- 为不同用途创建不同的API Key
- 设置合理的过期时间
- 定期审查和清理未使用的API Key

### 3. 权限控制

- 遵循最小权限原则
- 定期审查用户权限
- 监控权限变更

### 4. 审计和监控

- 定期检查审计日志
- 设置安全事件告警
- 监控异常的API调用模式

## 开发指南

### 添加新的受保护端点

```typescript
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

export async function GET(request: NextRequest) {
  // 添加认证中间件
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.REVIEW_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth; // 认证失败
  }
  
  // 认证成功，继续处理
  const { user, requestId } = auth;
  // ...
}
```

### 创建API Key

```typescript
import { apiKeyManager } from '@/lib/services/api-key-manager';
import { Permission } from '@/types/auth';

const apiKeyInfo = await apiKeyManager.createApiKey({
  name: 'CI/CD Pipeline Key',
  userId: user.id,
  permissions: [Permission.REVIEW_READ, Permission.WEBHOOK_RECEIVE],
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90天
});

console.log('API Key:', apiKeyInfo.apiKey);
```

## 更新日志

### v1.0.0 - 初始版本

- ✅ 基于邮箱的简化登录
- ✅ JWT Token认证
- ✅ API Key管理
- ✅ 角色权限系统
- ✅ 审计日志
- ✅ 速率限制
- ✅ 安全事件监控

## 支持

如果您遇到问题或需要帮助，请：

1. 查看本文档的故障排除部分
2. 检查应用日志文件
3. 运行测试脚本验证系统状态
4. 提交Issue并包含详细的错误信息

---

**注意**: 这是一个基础的认证系统实现。在生产环境中，建议根据具体的安全要求进行进一步的定制和加强。