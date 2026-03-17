# AI 代码审查系统 - 项目结构

## 目录结构

```
ai-code-review-system/
├─ app/                          # Next.js App Router 核心
│  ├─ api/                       # API 路由
│  │  ├─ webhook/                # Webhook 接收端点
│  │  ├─ reviews/                # 审查记录查询
│  │  ├─ config/                 # 配置管理
│  │  └─ health/                 # 健康检查
│  ├─ dashboard/                 # 审查历史仪表板
│  │  ├─ page.tsx                # 仪表板主页
│  │  └─ [reviewId]/             # 审查详情页
│  ├─ config/                    # 配置管理页面
│  ├─ layout.tsx                 # 根布局
│  ├─ page.tsx                   # 首页
│  └─ globals.css                # 全局样式
│
├─ components/                   # React 组件
│  ├─ ui/                        # 基础 UI 组件
│  ├─ review/                    # 审查相关组件
│  │  ├─ ReviewCard.tsx          # 审查卡片
│  │  ├─ ReviewDetail.tsx        # 审查详情
│  │  └─ ReviewStats.tsx         # 审查统计
│  └─ config/                    # 配置相关组件
│
├─ lib/                          # 核心业务逻辑
│  ├─ services/                  # 服务层
│  │  ├─ webhook-listener.ts     # Webhook 监听器
│  │  ├─ polling-scanner.ts      # 轮询扫描器
│  │  ├─ code-analyzer.ts        # 代码分析器
│  │  ├─ ai-reviewer.ts          # AI 审查器
│  │  ├─ comment-publisher.ts    # 评论发布器
│  │  └─ notification.ts         # 通知服务
│  │
│  ├─ db/                        # 数据库
│  │  ├─ client.ts               # MySQL 客户端
│  │  ├─ schema.ts               # 数据库 schema
│  │  └─ repositories/           # 数据访问层
│  │     ├─ review.ts            # 审查记录仓储
│  │     ├─ commit-tracker.ts    # 提交追踪仓储
│  │     └─ config.ts            # 配置仓储
│  │
│  ├─ git/                       # Git 集成
│  │  ├─ client.ts               # Git API 客户端
│  │  └─ diff-parser.ts          # Diff 解析器
│  │
│  ├─ ai/                        # AI 模型集成
│  │  ├─ client.ts               # AI 模型客户端
│  │  └─ prompt-builder.ts       # 提示词构建器
│  │
│  ├─ queue/                     # 任务队列
│  │  ├─ review-queue.ts         # 审查任务队列
│  │  └─ worker.ts               # 队列处理器
│  │
│  ├─ cache/                     # Redis 缓存
│  │  ├─ redis-client.ts         # Redis 客户端
│  │  └─ redis-utils.ts          # 缓存工具函数
│  │
│  ├─ constants/                 # 常量定义
│  │  └─ api-codes.ts            # API 状态码
│  │
│  └─ utils/                     # 工具函数
│     ├─ crypto.ts               # 加密工具
│     ├─ logger.ts               # 日志工具
│     ├─ retry.ts                # 重试逻辑
│     └─ api-response.ts         # API 响应封装
│
├─ types/                        # TypeScript 类型定义
│  ├─ review.ts                  # 审查相关类型
│  ├─ git.ts                     # Git 相关类型
│  ├─ ai.ts                      # AI 相关类型
│  ├─ config.ts                  # 配置相关类型
│  └─ api.ts                     # API 相关类型
│
├─ hooks/                        # React Hooks
│  ├─ useReviews.ts              # 审查数据 Hook
│  └─ useConfig.ts               # 配置数据 Hook
│
├─ store/                        # 客户端状态管理
│  └─ ui-store.ts                # UI 状态（过滤器、分页等）
│
├─ config/                       # 应用配置
│  ├─ database.ts                # 数据库配置
│  ├─ redis.ts                   # Redis 配置
│  ├─ ai-model.ts                # AI 模型配置
│  ├─ git.ts                     # Git 配置
│  └─ logger.ts                  # 日志配置
│
├─ tests/                        # 测试
│  ├─ unit/                      # 单元测试
│  ├─ integration/               # 集成测试
│  └─ property/                  # 属性测试
│
├─ middleware.ts                 # Next.js 中间件
├─ .env.example                  # 环境变量模板
├─ .eslintrc.json                # ESLint 配置
├─ .prettierrc                   # Prettier 配置
├─ next.config.ts                # Next.js 配置
├─ package.json                  # 项目依赖
├─ tsconfig.json                 # TypeScript 配置
└─ README.md                     # 项目说明

```

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI**: React 19
- **语言**: TypeScript 5
- **样式**: Tailwind CSS
- **数据库**: MySQL
- **缓存**: Redis
- **包管理**: pnpm
- **代码规范**: ESLint + Prettier

## 核心模块说明

### 触发层
- **Webhook Listener**: 接收 Git 仓库的 push 事件
- **Polling Scanner**: 定期主动扫描 Git 仓库新提交

### 协调层
- **Review Queue**: 管理审查任务队列，处理并发控制
- **Commit Tracker**: 追踪已处理的提交，防止重复审查

### 处理层
- **Code Analyzer**: 提取和分析代码变更
- **AI Reviewer**: 调用 AI 模型进行审查
- **Comment Publisher**: 发布审查结果到 Git 仓库
- **Notification Service**: 发送通知给相关人员

### 存储层
- **MySQL**: 持久化存储审查记录、配置、提交追踪
- **Redis**: 缓存队列状态、临时数据

## 开发指南

### 环境配置

1. 复制环境变量模板：
   ```bash
   cp .env.example .env
   ```

2. 配置必要的环境变量：
   - 数据库连接信息
   - Redis 连接信息
   - Git 仓库访问令牌
   - AI 模型 API 密钥

### 启动开发服务器

```bash
pnpm install
pnpm dev
```

### 代码规范

- 使用 ESLint 进行代码检查：`pnpm lint`
- 使用 Prettier 格式化代码：`pnpm format`
- 类型检查：`pnpm type-check`

## 部署说明

详见 `docs/DEPLOYMENT.md`
