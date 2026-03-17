# AI 代码审查系统

一个基于 Next.js 16 的自动化代码审查系统，通过 Webhook 和轮询两种模式监听 UAT 分支提交，调用 AI 大模型进行代码审查，并将结构化建议发布回代码仓库。

## ✨ 功能特性

- 🔄 **双触发模式**：支持 Webhook 实时触发和定时轮询扫描
- 🤖 **AI 驱动审查**：集成主流 AI 大模型，提供智能代码审查建议
- 📊 **结构化反馈**：按严重程度分类问题（Critical、Major、Minor、Suggestion）
- 🔐 **安全可靠**：Webhook 签名验证、敏感数据加密、API 认证授权
- 📈 **监控告警**：实时监控系统健康状态，异常自动告警
- 🚀 **高性能**：Redis 队列、并发控制、速率限制
- 📝 **审查历史**：完整的审查记录和统计分析

## 🛠️ 技术栈

- **前端框架**：Next.js 16 (App Router) + React 19
- **语言**：TypeScript
- **数据库**：MySQL 8.0+
- **缓存**：Redis 7.0+
- **包管理器**：pnpm
- **样式**：Tailwind CSS
- **日志**：Winston
- **测试**：Vitest + Testing Library

## 📋 系统要求

- Node.js 18.17 或更高版本
- MySQL 8.0 或更高版本
- Redis 7.0 或更高版本
- pnpm 8.0 或更高版本

## 🚀 快速开始

> 💡 **新手推荐**：查看 [快速启动指南](docs/QUICK_START.md) 在 5 分钟内启动系统！

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-code-review-system
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

复制环境变量模板并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键参数：

```env
# 数据库配置
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=your_password
DATABASE_NAME=ai_code_review

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AI 模型配置
AI_PROVIDER=openai
AI_API_KEY=your_api_key
AI_MODEL=gpt-4
AI_BASE_URL=https://api.openai.com/v1

# Git 仓库配置
GIT_PROVIDER=github
GIT_TOKEN=your_git_token
GIT_WEBHOOK_SECRET=your_webhook_secret

# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret
API_KEY_SECRET=your_api_key_secret

# 日志配置
LOG_LEVEL=info
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs
```

### 4. 初始化数据库

运行数据库迁移脚本：

```bash
pnpm db:migrate
```

初始化认证系统：

```bash
pnpm tsx scripts/init-auth.ts
```

初始化监控系统：

```bash
pnpm tsx scripts/init-monitoring.ts
```

### 5. 启动服务

#### 开发模式

```bash
# 启动 Next.js 开发服务器
pnpm dev

# 启动 Worker 进程（处理审查任务）
pnpm worker:dev

# 启动轮询扫描器（可选）
pnpm tsx scripts/start-polling-scanner.sh
```

#### 生产模式

```bash
# 构建应用
pnpm build

# 启动应用服务器
pnpm start

# 启动 Worker 进程
pnpm worker:start

# 启动轮询扫描器（可选）
./scripts/start-polling-scanner.sh
```

### 6. 访问应用

- **Web 界面**：http://localhost:3000
- **API 端点**：http://localhost:3000/api
- **健康检查**：http://localhost:3000/api/health

## 📖 使用指南

### 配置 Webhook

#### GitHub

1. 进入仓库设置 → Webhooks → Add webhook
2. 配置 Payload URL：`https://your-domain.com/api/webhook`
3. Content type：`application/json`
4. Secret：填入 `.env` 中的 `GIT_WEBHOOK_SECRET`
5. 选择触发事件：`Push events`
6. 保存配置

#### GitLab

1. 进入项目设置 → Webhooks
2. URL：`https://your-domain.com/api/webhook`
3. Secret Token：填入 `.env` 中的 `GIT_WEBHOOK_SECRET`
4. 触发器：勾选 `Push events`
5. 添加 webhook

### 配置轮询模式

如果无法使用 Webhook（如内网环境），可以启用轮询模式：

1. 编辑 `scripts/polling-scanner.env.example`，配置扫描参数
2. 复制为 `scripts/polling-scanner.env`
3. 启动轮询扫描器：`./scripts/start-polling-scanner.sh`

详细配置请参考 [scripts/POLLING_SCANNER_GUIDE.md](scripts/POLLING_SCANNER_GUIDE.md)

### 配置审查规则

访问 Web 界面的配置页面（http://localhost:3000/config），可以自定义：

- **审查关注点**：安全性、性能、可读性等
- **文件过滤**：白名单和忽略模式
- **AI 模型参数**：模型选择、温度、最大 Token 数
- **通知设置**：邮件、即时消息通知配置

### 查看审查结果

1. **仪表板**：http://localhost:3000/dashboard - 查看所有审查记录
2. **审查详情**：点击具体记录查看详细的审查评论
3. **Git 仓库**：审查结果会自动发布到对应的 Commit 评论区

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        触发层                                │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │ Webhook Listener │         │ Polling Scanner  │         │
│  └────────┬─────────┘         └────────┬─────────┘         │
└───────────┼──────────────────────────┼──────────────────────┘
            │                          │
            └──────────┬───────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                        协调层                                │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Review Queue    │         │ Commit Tracker   │         │
│  │    (Redis)       │         │    (MySQL)       │         │
│  └────────┬─────────┘         └──────────────────┘         │
└───────────┼──────────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────┐
│                        处理层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Code Analyzer │→ │ AI Reviewer  │→ │Comment Pub.  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      外部服务                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Git Repository│  │  AI Model    │  │ Notification │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

- **Webhook Listener**：接收 Git 仓库的 push 事件
- **Polling Scanner**：定期主动扫描 Git 仓库新提交
- **Review Queue**：管理审查任务队列，处理并发控制
- **Commit Tracker**：追踪已处理的提交，防止重复审查
- **Code Analyzer**：提取和分析代码变更
- **AI Reviewer**：调用 AI 模型进行审查
- **Comment Publisher**：发布审查结果到 Git 仓库
- **Notification Service**：发送通知给相关人员

## 📚 文档

- [API 文档](docs/API.md) - 详细的 API 接口说明
- [认证中间件](docs/AUTH_MIDDLEWARE.md) - API 认证和授权
- [数据加密](docs/ENCRYPTION.md) - 敏感数据加密方案
- [监控告警](docs/MONITORING.md) - 系统监控和告警配置
- [轮询扫描器指南](scripts/POLLING_SCANNER_GUIDE.md) - 轮询模式配置
- [Worker 进程说明](scripts/README.md) - Worker 进程部署和管理

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 单独部署组件

```bash
# 构建应用镜像
docker build -t ai-code-review-app .

# 构建 Worker 镜像
docker build -f scripts/Dockerfile.worker -t ai-code-review-worker .

# 构建轮询扫描器镜像
docker build -f scripts/Dockerfile.polling-scanner -t ai-code-review-scanner .

# 运行容器
docker run -d --name app -p 3000:3000 --env-file .env ai-code-review-app
docker run -d --name worker --env-file .env ai-code-review-worker
docker run -d --name scanner --env-file scripts/polling-scanner.env ai-code-review-scanner
```

详细部署说明请参考 [部署指南](docs/DEPLOYMENT.md)

## 🧪 测试

```bash
# 运行所有测试
pnpm test:run

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 运行测试 UI
pnpm test:ui

# 运行特定测试文件
pnpm test tests/unit/webhook-api.test.ts
```

## 🔧 开发

### 项目结构

```
ai-code-review-system/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   ├── dashboard/         # 审查历史仪表板
│   ├── config/            # 配置管理页面
│   └── monitoring/        # 监控页面
├── components/            # React 组件
│   ├── ui/               # 基础 UI 组件
│   ├── review/           # 审查相关组件
│   ├── config/           # 配置相关组件
│   └── monitoring/       # 监控相关组件
├── lib/                   # 核心业务逻辑
│   ├── services/         # 服务层
│   ├── db/               # 数据库
│   ├── cache/            # Redis 缓存
│   ├── git/              # Git 集成
│   ├── ai/               # AI 模型集成
│   ├── queue/            # 任务队列
│   └── utils/            # 工具函数
├── types/                 # TypeScript 类型定义
├── config/                # 应用配置
├── scripts/               # 脚本和工具
├── tests/                 # 测试文件
│   ├── unit/             # 单元测试
│   ├── integration/      # 集成测试
│   └── property/         # 属性测试
└── docs/                  # 文档
```

### 代码规范

```bash
# 格式化代码
pnpm format

# 检查代码格式
pnpm format:check

# 类型检查
pnpm type-check

# Lint 检查
pnpm lint
```

### 数据库管理

```bash
# 运行迁移
pnpm db:migrate

# 查看迁移状态
pnpm db:status

# 回滚迁移
pnpm db:rollback

# 重置数据库
pnpm db:reset
```

## 🔐 安全

- **Webhook 签名验证**：防止伪造的 webhook 请求
- **API 认证**：基于 JWT 和 API Key 的双重认证
- **数据加密**：敏感配置字段加密存储
- **密钥轮换**：支持定期轮换加密密钥
- **审计日志**：记录所有 API 访问和敏感操作
- **速率限制**：防止 API 滥用和 DDoS 攻击

详细安全配置请参考 [认证中间件文档](docs/AUTH_MIDDLEWARE.md) 和 [数据加密文档](docs/ENCRYPTION.md)

## 📊 监控

系统提供完整的监控和告警功能：

- **健康检查**：数据库、Redis、AI 服务连接状态
- **性能指标**：审查处理时间、队列长度、成功率
- **错误追踪**：异常日志记录和告警
- **资源监控**：CPU、内存、磁盘使用情况

访问监控仪表板：http://localhost:3000/monitoring

详细配置请参考 [监控文档](docs/MONITORING.md)

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [Next.js](https://nextjs.org/) - React 框架
- [OpenAI](https://openai.com/) - AI 模型服务
- [MySQL](https://www.mysql.com/) - 数据库
- [Redis](https://redis.io/) - 缓存和队列
- [Winston](https://github.com/winstonjs/winston) - 日志系统

## 📞 支持

如有问题或需要帮助，请：

- 查看 [文档](docs/)
- 提交 [Issue](https://github.com/your-repo/issues)
- 发送邮件至：support@example.com

---

**注意**：本系统仍在积极开发中，部分功能可能尚未完全稳定。生产环境使用前请充分测试。
