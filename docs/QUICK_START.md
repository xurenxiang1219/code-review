# 快速启动指南

本指南帮助你在 5 分钟内快速启动 AI 代码审查系统。

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- Git

## 快速启动步骤

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-code-review-system
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env
```

**最小配置**（必须修改）：

```env
# AI 模型配置
AI_API_KEY=your_openai_api_key_here

# Git 配置
GIT_TOKEN=your_github_token_here
GIT_WEBHOOK_SECRET=your_random_secret_here

# 安全密钥
JWT_SECRET=your_jwt_secret_here
API_KEY_SECRET=your_api_key_secret_here
```

**生成密钥**：

```bash
# 生成 Webhook 密钥
openssl rand -hex 32

# 生成 JWT 密钥
openssl rand -base64 64

# 生成 API Key 密钥
openssl rand -base64 64
```

### 3. 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看启动日志
docker-compose logs -f
```

等待所有服务启动（约 30 秒）。

### 4. 初始化系统

```bash
# 进入应用容器
docker-compose exec app sh

# 运行数据库迁移
pnpm db:migrate

# 初始化认证系统
pnpm tsx scripts/init-auth.ts

# 退出容器
exit
```

### 5. 验证部署

```bash
# 检查服务状态
docker-compose ps

# 健康检查
curl http://localhost:3000/api/health

# 应该返回类似：
# {"code":0,"msg":"操作成功","data":{"status":"healthy",...}}
```

### 6. 访问应用

打开浏览器访问：http://localhost:3000

## 配置 Webhook

### GitHub

1. 进入仓库设置 → Webhooks → Add webhook
2. Payload URL: `http://your-server:3000/api/webhook`
3. Content type: `application/json`
4. Secret: 填入 `.env` 中的 `GIT_WEBHOOK_SECRET`
5. 选择 `Push events`
6. 保存

### 测试 Webhook

```bash
# 发送测试 Webhook
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{
    "ref": "refs/heads/uat",
    "repository": {"name": "test-repo"},
    "commits": [{
      "id": "abc123",
      "message": "Test commit",
      "author": {"name": "Test", "email": "test@example.com"}
    }]
  }'
```

## 常用命令

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f app
docker-compose logs -f worker
docker-compose logs -f mysql
docker-compose logs -f redis
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart app
docker-compose restart worker
```

### 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

### 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

## 启用轮询模式

如果无法使用 Webhook（如内网环境），可以启用轮询模式：

```bash
# 编辑 .env 文件
nano .env
```

添加轮询配置：

```env
GIT_REPOSITORY=org/your-repo
GIT_BRANCH=uat
POLLING_INTERVAL=300
```

启动轮询扫描器：

```bash
docker-compose --profile polling up -d
```

## 故障排查

### 应用无法启动

```bash
# 查看错误日志
docker-compose logs app

# 检查环境变量
docker-compose exec app env | grep DATABASE
```

### 数据库连接失败

```bash
# 检查 MySQL 状态
docker-compose ps mysql

# 查看 MySQL 日志
docker-compose logs mysql

# 测试连接
docker-compose exec mysql mysql -u root -p
```

### Redis 连接失败

```bash
# 检查 Redis 状态
docker-compose ps redis

# 测试连接
docker-compose exec redis redis-cli ping
```

### Worker 不处理任务

```bash
# 查看 Worker 日志
docker-compose logs worker

# 检查队列
docker-compose exec redis redis-cli
> ZCARD review:queue
```

## 下一步

- 📖 阅读 [完整文档](../README.md)
- 🔧 查看 [环境配置说明](ENVIRONMENT.md)
- 🚀 查看 [部署指南](DEPLOYMENT.md)
- 📡 查看 [API 文档](API.md)
- 🔐 配置 [认证和授权](AUTH_MIDDLEWARE.md)
- 📊 配置 [监控告警](MONITORING.md)

## 获取帮助

- 查看 [故障排查](DEPLOYMENT.md#故障排查)
- 提交 [Issue](https://github.com/your-repo/issues)
- 联系技术支持：support@example.com

---

祝你使用愉快！🎉
