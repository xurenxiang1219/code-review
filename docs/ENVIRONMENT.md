# 环境配置说明

本文档详细说明 AI 代码审查系统的所有环境变量配置。

## 目录

- [必需配置](#必需配置)
- [数据库配置](#数据库配置)
- [Redis 配置](#redis-配置)
- [AI 模型配置](#ai-模型配置)
- [Git 仓库配置](#git-仓库配置)
- [应用配置](#应用配置)
- [认证配置](#认证配置)
- [日志配置](#日志配置)
- [性能配置](#性能配置)
- [通知配置](#通知配置)
- [监控配置](#监控配置)
- [配置示例](#配置示例)

## 必需配置

以下环境变量是系统运行的必需配置，缺少任何一项都会导致系统无法正常工作。

### 核心配置

```env
# 运行环境
NODE_ENV=production                    # 运行环境：development, production

# 应用 URL
NEXT_PUBLIC_APP_URL=https://your-domain.com  # 应用访问地址
```

## 数据库配置

### MySQL 配置

```env
# 数据库主机
DATABASE_HOST=localhost                # 数据库主机地址
DATABASE_PORT=3306                     # 数据库端口

# 数据库凭证
DATABASE_USER=ai_review                # 数据库用户名
DATABASE_PASSWORD=your_secure_password # 数据库密码（必须使用强密码）
DATABASE_NAME=ai_code_review           # 数据库名称

# 连接池配置（可选）
DATABASE_CONNECTION_LIMIT=10           # 最大连接数，默认 10
DATABASE_QUEUE_LIMIT=0                 # 队列限制，0 表示无限制
```

**安全建议**：
- 使用强密码（至少 16 位，包含大小写字母、数字和特殊字符）
- 生产环境不要使用 root 用户
- 定期更换数据库密码

**生成强密码**：
```bash
openssl rand -base64 32
```

## Redis 配置

### Redis 连接

```env
# Redis 主机
REDIS_HOST=localhost                   # Redis 主机地址
REDIS_PORT=6379                        # Redis 端口

# Redis 凭证
REDIS_PASSWORD=your_redis_password     # Redis 密码（强烈推荐设置）

# Redis 数据库
REDIS_DB=0                             # Redis 数据库编号，默认 0

# 连接配置（可选）
REDIS_CONNECT_TIMEOUT=10000            # 连接超时（毫秒），默认 10000
REDIS_MAX_RETRIES=3                    # 最大重试次数，默认 3
```

**性能建议**：
- 生产环境必须设置密码
- 使用专用的 Redis 实例
- 配置持久化策略（RDB + AOF）

## AI 模型配置

### OpenAI 配置

```env
# AI 提供商
AI_PROVIDER=openai                     # AI 提供商：openai, anthropic, azure

# OpenAI 配置
AI_API_KEY=sk-...                      # OpenAI API Key
AI_MODEL=gpt-4                         # 模型名称：gpt-4, gpt-4-turbo, gpt-3.5-turbo
AI_BASE_URL=https://api.openai.com/v1 # API 基础 URL（可选，用于代理）

# 模型参数（可选）
AI_TEMPERATURE=0.3                     # 温度参数，0-2，默认 0.3
AI_MAX_TOKENS=4000                     # 最大 Token 数，默认 4000
AI_TIMEOUT=60000                       # 请求超时（毫秒），默认 60000
```

### Anthropic (Claude) 配置

```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-3-opus-20240229
AI_BASE_URL=https://api.anthropic.com
```

### Azure OpenAI 配置

```env
AI_PROVIDER=azure
AI_API_KEY=your_azure_key
AI_MODEL=gpt-4
AI_BASE_URL=https://your-resource.openai.azure.com
AI_AZURE_DEPLOYMENT=your-deployment-name
```

**成本优化**：
- 开发环境可使用 gpt-3.5-turbo
- 生产环境推荐 gpt-4 或 gpt-4-turbo
- 设置合理的 MAX_TOKENS 限制

## Git 仓库配置

### GitHub 配置

```env
# Git 提供商
GIT_PROVIDER=github                    # Git 提供商：github, gitlab, gitea

# GitHub 配置
GIT_TOKEN=ghp_...                      # GitHub Personal Access Token
GIT_WEBHOOK_SECRET=your_webhook_secret # Webhook 密钥（用于签名验证）

# 仓库配置（可选）
GIT_API_URL=https://api.github.com     # GitHub API URL
GIT_TIMEOUT=30000                      # API 请求超时（毫秒）
```

**Token 权限要求**（GitHub）：
- `repo` - 完整的仓库访问权限
- `write:discussion` - 发布评论权限

### GitLab 配置

```env
GIT_PROVIDER=gitlab
GIT_TOKEN=glpat-...                    # GitLab Personal Access Token
GIT_WEBHOOK_SECRET=your_webhook_secret
GIT_API_URL=https://gitlab.com/api/v4  # GitLab API URL
```

**Token 权限要求**（GitLab）：
- `api` - 完整的 API 访问权限
- `write_repository` - 写入仓库权限

### Gitea 配置

```env
GIT_PROVIDER=gitea
GIT_TOKEN=your_gitea_token
GIT_WEBHOOK_SECRET=your_webhook_secret
GIT_API_URL=https://gitea.example.com/api/v1
```

**安全建议**：
- 使用最小权限原则
- 定期轮换 Token
- 使用强随机字符串作为 Webhook 密钥

**生成 Webhook 密钥**：
```bash
openssl rand -hex 32
```

## 应用配置

### 基础配置

```env
# 应用端口
PORT=3000                              # 应用监听端口，默认 3000

# 应用 URL
NEXT_PUBLIC_APP_URL=https://your-domain.com  # 公开访问地址

# Next.js 配置
NEXT_TELEMETRY_DISABLED=1              # 禁用遥测，默认 1
```

### 轮询配置

```env
# 轮询扫描器
POLLING_ENABLED=true                   # 是否启用轮询，默认 false
POLLING_INTERVAL=300                   # 轮询间隔（秒），30-3600，默认 300
GIT_REPOSITORY=org/repo                # 要扫描的仓库
GIT_BRANCH=uat                         # 要扫描的分支，默认 uat
```

## 认证配置

### JWT 配置

```env
# JWT 密钥
JWT_SECRET=your_jwt_secret             # JWT 签名密钥（必须使用强密钥）
JWT_EXPIRES_IN=7d                      # Token 过期时间，默认 7d

# JWT 配置（可选）
JWT_ALGORITHM=HS256                    # 签名算法，默认 HS256
JWT_ISSUER=ai-code-review              # 签发者，默认 ai-code-review
```

### API Key 配置

```env
# API Key 密钥
API_KEY_SECRET=your_api_key_secret     # API Key 加密密钥（必须使用强密钥）

# API Key 配置（可选）
API_KEY_PREFIX=ak_                     # API Key 前缀，默认 ak_
API_KEY_LENGTH=32                      # API Key 长度，默认 32
```

**生成密钥**：
```bash
# JWT Secret（64 字节）
openssl rand -base64 64

# API Key Secret（64 字节）
openssl rand -base64 64
```

### 加密配置

```env
# 数据加密
ENCRYPTION_KEY=your_encryption_key     # 数据加密密钥（32 字节）
ENCRYPTION_ALGORITHM=aes-256-gcm       # 加密算法，默认 aes-256-gcm

# 密钥轮换
KEY_ROTATION_ENABLED=true              # 是否启用密钥轮换，默认 false
KEY_ROTATION_INTERVAL=90               # 轮换间隔（天），默认 90
```

**生成加密密钥**：
```bash
openssl rand -base64 32
```

## 日志配置

### 日志级别

```env
# 日志级别
LOG_LEVEL=info                         # 日志级别：debug, info, warn, error

# 日志文件
LOG_FILE_ENABLED=true                  # 是否启用文件日志，默认 false
LOG_FILE_PATH=./logs                   # 日志文件路径，默认 ./logs

# 日志格式
LOG_FORMAT=json                        # 日志格式：json, pretty，默认 json
```

**日志级别说明**：
- `debug` - 详细调试信息（开发环境）
- `info` - 一般信息（生产环境推荐）
- `warn` - 警告信息
- `error` - 错误信息

## 性能配置

### Worker 配置

```env
# Worker 并发
WORKER_CONCURRENCY=10                  # 最大并发审查数，默认 10
WORKER_POLL_INTERVAL=1000              # 轮询间隔（毫秒），默认 1000

# Worker 重试
WORKER_MAX_RETRIES=3                   # 最大重试次数，默认 3
WORKER_RETRY_DELAY=5000                # 重试延迟（毫秒），默认 5000
```

### 速率限制

```env
# 速率限制
RATE_LIMIT_ENABLED=true                # 是否启用速率限制，默认 true
RATE_LIMIT_MAX_REQUESTS=100            # 最大请求数，默认 100
RATE_LIMIT_WINDOW_MS=60000             # 时间窗口（毫秒），默认 60000

# AI API 速率限制
AI_RATE_LIMIT_MAX_REQUESTS=50          # AI API 最大请求数，默认 50
AI_RATE_LIMIT_WINDOW_MS=60000          # 时间窗口（毫秒），默认 60000
```

### 缓存配置

```env
# 缓存 TTL
CACHE_CONFIG_TTL=3600                  # 配置缓存时间（秒），默认 3600
CACHE_GIT_TTL=300                      # Git 数据缓存时间（秒），默认 300
```

## 通知配置

### 邮件通知

```env
# SMTP 配置
SMTP_HOST=smtp.gmail.com               # SMTP 主机
SMTP_PORT=587                          # SMTP 端口
SMTP_SECURE=false                      # 是否使用 SSL，默认 false
SMTP_USER=your-email@gmail.com         # SMTP 用户名
SMTP_PASSWORD=your-app-password        # SMTP 密码

# 邮件配置
EMAIL_FROM=noreply@example.com         # 发件人地址
EMAIL_FROM_NAME=AI Code Review         # 发件人名称
```

### Webhook 通知

```env
# Webhook 通知
NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/...  # Webhook URL
NOTIFICATION_WEBHOOK_ENABLED=true      # 是否启用，默认 false
```

## 监控配置

### 监控设置

```env
# 监控
MONITORING_ENABLED=true                # 是否启用监控，默认 true
MONITORING_INTERVAL=60000              # 监控间隔（毫秒），默认 60000

# 告警
ALERT_ENABLED=true                     # 是否启用告警，默认 true
ALERT_EMAIL=admin@example.com          # 告警邮件地址
```

## 配置示例

### 开发环境配置

```env
# 开发环境 .env.development

# 运行环境
NODE_ENV=development

# 数据库
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=root
DATABASE_NAME=ai_code_review_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AI 模型（使用较便宜的模型）
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-3.5-turbo
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2000

# Git
GIT_PROVIDER=github
GIT_TOKEN=ghp_...
GIT_WEBHOOK_SECRET=dev_webhook_secret

# 应用
NEXT_PUBLIC_APP_URL=http://localhost:3000
PORT=3000

# 认证
JWT_SECRET=dev_jwt_secret_not_for_production
API_KEY_SECRET=dev_api_key_secret_not_for_production

# 日志
LOG_LEVEL=debug
LOG_FILE_ENABLED=false
LOG_FORMAT=pretty

# 性能
WORKER_CONCURRENCY=3
RATE_LIMIT_ENABLED=false

# 轮询
POLLING_ENABLED=false
```

### 生产环境配置

```env
# 生产环境 .env.production

# 运行环境
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# 数据库
DATABASE_HOST=mysql.example.com
DATABASE_PORT=3306
DATABASE_USER=ai_review
DATABASE_PASSWORD=<strong-password-here>
DATABASE_NAME=ai_code_review
DATABASE_CONNECTION_LIMIT=20

# Redis
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=<strong-redis-password>
REDIS_DB=0

# AI 模型
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4-turbo
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=4000
AI_TIMEOUT=60000

# Git
GIT_PROVIDER=github
GIT_TOKEN=ghp_...
GIT_WEBHOOK_SECRET=<strong-webhook-secret>
GIT_TIMEOUT=30000

# 应用
NEXT_PUBLIC_APP_URL=https://code-review.example.com
PORT=3000

# 认证
JWT_SECRET=<strong-jwt-secret-64-bytes>
JWT_EXPIRES_IN=7d
API_KEY_SECRET=<strong-api-key-secret-64-bytes>

# 加密
ENCRYPTION_KEY=<strong-encryption-key-32-bytes>
KEY_ROTATION_ENABLED=true
KEY_ROTATION_INTERVAL=90

# 日志
LOG_LEVEL=info
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/var/log/ai-review
LOG_FORMAT=json

# 性能
WORKER_CONCURRENCY=10
WORKER_POLL_INTERVAL=1000
WORKER_MAX_RETRIES=3

# 速率限制
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
AI_RATE_LIMIT_MAX_REQUESTS=50

# 缓存
CACHE_CONFIG_TTL=3600
CACHE_GIT_TTL=300

# 轮询
POLLING_ENABLED=true
POLLING_INTERVAL=300
GIT_REPOSITORY=org/my-project
GIT_BRANCH=uat

# 通知
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@example.com
SMTP_PASSWORD=<app-password>
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME=AI Code Review

# 监控
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000
ALERT_ENABLED=true
ALERT_EMAIL=admin@example.com
```

### Docker Compose 环境配置

```env
# Docker Compose .env

# 应用配置
APP_PORT=3000
NODE_ENV=production

# 数据库配置
DATABASE_USER=ai_review
DATABASE_PASSWORD=<generate-strong-password>
DATABASE_NAME=ai_code_review
DATABASE_PORT=3306

# Redis 配置
REDIS_PASSWORD=<generate-strong-password>
REDIS_PORT=6379

# AI 配置
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4
AI_BASE_URL=https://api.openai.com/v1

# Git 配置
GIT_PROVIDER=github
GIT_TOKEN=ghp_...
GIT_WEBHOOK_SECRET=<generate-webhook-secret>

# 应用 URL
NEXT_PUBLIC_APP_URL=https://your-domain.com

# 认证
JWT_SECRET=<generate-jwt-secret>
API_KEY_SECRET=<generate-api-key-secret>

# 日志
LOG_LEVEL=info

# Worker 配置
WORKER_CONCURRENCY=10
WORKER_POLL_INTERVAL=1000

# 轮询配置（可选）
GIT_REPOSITORY=org/my-project
GIT_BRANCH=uat
POLLING_INTERVAL=300
```

## 配置验证

### 验证脚本

创建一个脚本来验证环境变量配置：

```bash
#!/bin/bash
# scripts/validate-env.sh

echo "验证环境变量配置..."

# 必需变量
REQUIRED_VARS=(
    "DATABASE_HOST"
    "DATABASE_USER"
    "DATABASE_PASSWORD"
    "DATABASE_NAME"
    "REDIS_HOST"
    "AI_PROVIDER"
    "AI_API_KEY"
    "GIT_PROVIDER"
    "GIT_TOKEN"
    "JWT_SECRET"
    "API_KEY_SECRET"
)

# 检查必需变量
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "错误: 缺少必需的环境变量 $var"
        exit 1
    fi
done

# 验证密码强度
if [ ${#DATABASE_PASSWORD} -lt 16 ]; then
    echo "警告: DATABASE_PASSWORD 长度应至少 16 位"
fi

if [ ${#JWT_SECRET} -lt 32 ]; then
    echo "警告: JWT_SECRET 长度应至少 32 位"
fi

# 验证 URL 格式
if [[ ! $NEXT_PUBLIC_APP_URL =~ ^https?:// ]]; then
    echo "错误: NEXT_PUBLIC_APP_URL 格式不正确"
    exit 1
fi

echo "环境变量验证通过！"
```

### 使用验证脚本

```bash
# 加载环境变量
source .env

# 运行验证
bash scripts/validate-env.sh
```

## 安全最佳实践

### 1. 密钥管理

- **不要**将 `.env` 文件提交到 Git
- **使用**密钥管理服务（如 AWS Secrets Manager、HashiCorp Vault）
- **定期**轮换密钥和密码
- **使用**强随机密钥生成器

### 2. 权限控制

```bash
# 设置 .env 文件权限
chmod 600 .env

# 确保只有应用用户可以读取
chown app-user:app-group .env
```

### 3. 环境隔离

- 开发、测试、生产环境使用不同的配置
- 不要在开发环境使用生产凭证
- 使用环境特定的配置文件

### 4. 审计和监控

- 记录配置变更
- 监控敏感配置的访问
- 定期审查权限设置

## 故障排查

### 常见配置问题

#### 1. 数据库连接失败

```bash
# 检查数据库配置
echo $DATABASE_HOST
echo $DATABASE_PORT
echo $DATABASE_USER

# 测试连接
mysql -h $DATABASE_HOST -P $DATABASE_PORT -u $DATABASE_USER -p
```

#### 2. Redis 连接失败

```bash
# 检查 Redis 配置
echo $REDIS_HOST
echo $REDIS_PORT

# 测试连接
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
```

#### 3. AI API 调用失败

```bash
# 检查 AI 配置
echo $AI_PROVIDER
echo $AI_MODEL

# 测试 API Key
curl -H "Authorization: Bearer $AI_API_KEY" \
  https://api.openai.com/v1/models
```

#### 4. Git API 调用失败

```bash
# 检查 Git 配置
echo $GIT_PROVIDER
echo $GIT_TOKEN

# 测试 Token（GitHub）
curl -H "Authorization: token $GIT_TOKEN" \
  https://api.github.com/user
```

## 配置更新

### 更新配置

```bash
# 1. 备份当前配置
cp .env .env.backup

# 2. 编辑配置
nano .env

# 3. 验证配置
bash scripts/validate-env.sh

# 4. 重启应用
# Docker
docker-compose restart

# PM2
pm2 reload ecosystem.config.js
```

### 配置热更新

某些配置支持热更新（无需重启）：

- 审查配置（通过 API 更新）
- 日志级别（通过 API 更新）
- 监控规则（通过 API 更新）

其他配置需要重启应用才能生效。

## 参考资源

- [Next.js 环境变量文档](https://nextjs.org/docs/basic-features/environment-variables)
- [MySQL 配置参考](https://dev.mysql.com/doc/refman/8.0/en/server-configuration.html)
- [Redis 配置参考](https://redis.io/docs/management/config/)
- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [GitHub API 文档](https://docs.github.com/en/rest)

---

如有配置问题，请参考故障排查部分或联系技术支持。
