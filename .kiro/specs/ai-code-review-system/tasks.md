# 实现计划：AI 代码审查系统

## 概述

基于 Next.js 16 App Router + MySQL + Redis 技术栈，实现一个自动化代码审查系统。系统通过 Webhook 和轮询两种模式监听 UAT 分支提交，调用 AI 大模型进行代码审查，并将结构化建议发布回代码仓库。

## 任务列表

- [x] 1. 项目初始化和基础配置
  - 创建 Next.js 16 项目，配置 TypeScript、pnpm
  - 配置 ESLint、Prettier
  - 创建目录结构（app/、lib/、components/、types/、config/）
  - 配置环境变量模板（.env.example）
  - _需求: 所有需求的基础_

- [x] 2. 数据库和缓存层设置
  - [x] 2.1 配置 MySQL 连接和客户端
    - 创建 lib/db/client.ts，实现 MySQL 连接池
    - 实现数据库健康检查功能
    - _需求: 9.1, 9.2_
  
  - [x] 2.2 创建数据库 Schema
    - 创建 reviews、review_comments、commit_tracker、review_config、review_queue、notification_log 表的 SQL 迁移文件
    - 实现数据库迁移脚本
    - _需求: 9.1, 9.2, 2.4_
  
  - [x] 2.3 配置 Redis 连接和客户端
    - 创建 lib/cache/redis-client.ts，实现 Redis 单例客户端
    - 创建 lib/cache/redis-utils.ts，实现缓存工具函数
    - 实现 Redis 健康检查
    - _需求: 7.2, 2.4_

- [x] 3. 核心类型定义
  - 创建 types/review.ts（ReviewComment、ReviewSummary、ReviewResult）
  - 创建 types/git.ts（CommitInfo、FileChange、DiffInfo）
  - 创建 types/ai.ts（AI 模型相关类型）
  - 创建 types/config.ts（ReviewConfig）
  - 创建 types/api.ts（ApiResponse、PaginatedResponse）
  - _需求: 所有需求的基础_

- [x] 4. 工具函数和常量
  - [x] 4.1 实现日志系统
    - 创建 lib/utils/logger.ts，基于 winston 实现结构化日志
    - 实现日志级别、脱敏、上下文追踪功能
    - _需求: 10.5, 11.4_
  
  - [x] 4.2 实现 API 响应封装
    - 创建 lib/constants/api-codes.ts，定义业务状态码
    - 创建 lib/utils/api-response.ts，实现统一响应格式
    - _需求: 所有 API 相关需求_
  
  - [x] 4.3 实现加密和重试工具
    - 创建 lib/utils/crypto.ts，实现签名验证
    - 创建 lib/utils/retry.ts，实现指数退避重试逻辑
    - _需求: 1.3, 1.4, 4.3, 11.2_

- [x] 5. 数据访问层（Repositories）
  - [x] 5.1 实现 Review Repository
    - 创建 lib/db/repositories/review.ts
    - 实现 createReview、getReviewById、getReviews、updateReviewStatus 方法
    - _需求: 9.1, 9.2, 9.3_
  
  - [x] 5.2 实现 Commit Tracker Repository
    - 创建 lib/db/repositories/commit-tracker.ts
    - 实现 track、isTracked、getLastProcessed 方法
    - _需求: 2.4, 2.5, 2.6, 2.7, 2.9_
  
  - [x] 5.3 实现 Config Repository
    - 创建 lib/db/repositories/config.ts
    - 实现 getConfig、updateConfig、createDefaultConfig 方法
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6. Git 集成层
  - [x] 6.1 实现 Git 客户端
    - 创建 lib/git/client.ts，封装 Git API 调用
    - 实现 getCommit、getDiff、getCommits、postComment 方法
    - 实现错误处理和重试机制
    - _需求: 3.1, 6.1, 6.2, 10.1_
  
  - [x] 6.2 实现 Diff 解析器
    - 创建 lib/git/diff-parser.ts
    - 实现解析 diff 格式、提取文件变更、识别编程语言功能
    - _需求: 3.1, 3.2, 3.5, 10.4_

- [x] 7. 任务队列系统
  - [x] 7.1 实现 Review Queue
    - 创建 lib/queue/review-queue.ts
    - 实现 enqueue、dequeue、length、complete、fail 方法
    - 使用 Redis 有序集合实现优先级队列
    - _需求: 7.1, 7.2, 7.3_
  
  - [x] 7.2 实现 Queue Worker
    - 创建 lib/queue/worker.ts
    - 实现并发控制（最多 10 个并发任务）
    - 实现任务处理循环和错误恢复
    - _需求: 7.1, 7.4, 7.5_

- [x] 8. 核心服务层 - 触发层
  - [x] 8.1 实现 Webhook Listener
    - 创建 lib/services/webhook-listener.ts
    - 实现 handleWebhook、verifySignature、extractCommits 方法
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 11.2_
  
  - [x] 8.2 实现 Polling Scanner
    - 创建 lib/services/polling-scanner.ts
    - 实现 start、stop、scan、isProcessed 方法
    - 实现定时扫描和去重逻辑
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 9. 核心服务层 - 处理层
  - [x] 9.1 实现 Code Analyzer
    - 创建 lib/services/code-analyzer.ts
    - 实现 analyze、getDiff、filterCodeFiles、splitDiff 方法
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 9.2 实现 AI Reviewer
    - 创建 lib/ai/client.ts，封装 AI 模型 API 调用
    - 创建 lib/ai/prompt-builder.ts，实现提示词构建
    - 创建 lib/services/ai-reviewer.ts，实现 review、buildPrompt、parseResponse 方法
    - 实现超时、重试和错误处理
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 10.2_
  
  - [x] 9.3 实现 Comment Publisher
    - 创建 lib/services/comment-publisher.ts
    - 实现 publish、publishLineComment、publishSummary 方法
    - 实现发布失败后的邮件备用方案
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 9.4 实现 Notification Service
    - 创建 lib/services/notification.ts
    - 实现邮件、即时消息通知功能
    - 实现通知偏好和 critical 级别特殊通知
    - _需求: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 10. API 路由实现
  - [x] 10.1 实现 Webhook API
    - 创建 app/api/webhook/route.ts
    - 处理 POST 请求，验证签名，提取提交，加入队列
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 10.2 实现 Reviews API
    - 创建 app/api/reviews/route.ts（GET - 查询列表）
    - 创建 app/api/reviews/[reviewId]/route.ts（GET - 查询详情）
    - 实现分页、过滤功能
    - _需求: 9.3_
  
  - [x] 10.3 实现 Config API
    - 创建 app/api/config/route.ts（GET、PUT）
    - 实现配置查询和更新功能
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 10.4 实现健康检查 API
    - 创建 app/api/health/route.ts
    - 检查数据库、Redis、AI 服务连接状态
    - _需求: 10.1, 10.2_

- [x] 11. 前端页面实现
  - [x] 11.1 实现审查历史仪表板
    - 创建 app/dashboard/page.tsx
    - 创建 components/review/ReviewCard.tsx
    - 创建 components/review/ReviewStats.tsx
    - 实现列表展示、过滤、分页功能
    - _需求: 9.3, 9.5_
  
  - [x] 11.2 实现审查详情页
    - 创建 app/dashboard/[reviewId]/page.tsx
    - 创建 components/review/ReviewDetail.tsx
    - 展示审查评论、代码位置、严重程度
    - _需求: 9.3_
  
  - [x] 11.3 实现配置管理页面
    - 创建 app/config/page.tsx
    - 创建 components/config/ConfigForm.tsx
    - 实现配置编辑和保存功能
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 11.4 实现首页和布局
    - 创建 app/page.tsx（系统概览）
    - 创建 app/layout.tsx（根布局、导航）
    - 创建基础 UI 组件（components/ui/）
    - _需求: 通用_

- [x] 12. 后台任务和定时任务
  - [x] 12.1 实现 Queue Worker 启动脚本
    - 创建独立的 worker 进程启动脚本
    - 实现优雅关闭和错误恢复
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 12.2 实现 Polling Scanner 启动脚本
    - 创建定时扫描任务启动脚本
    - 实现配置化的扫描间隔
    - _需求: 2.1, 2.2, 2.3, 2.10_

- [x] 13. 安全和权限控制
  - [x] 13.1 实现 API 认证中间件
    - 创建 middleware.ts，实现 API 访问控制
    - 实现 token 验证和权限检查
    - _需求: 11.1, 11.3, 11.5_
  
  - [x] 13.2 实现敏感信息加密
    - 实现配置中敏感字段的加密存储
    - 实现日志脱敏功能
    - _需求: 11.1, 11.4_

- [x] 14. 性能优化
  - [x] 14.1 实现并发控制和速率限制
    - 实现 AI API 调用速率限制
    - 实现 Webhook 请求速率限制
    - _需求: 7.1, 12.3_
  
  - [x] 14.2 实现缓存策略
    - 实现审查配置缓存
    - 实现 Git API 响应缓存
    - _需求: 12.1, 12.2_

- [x] 15. 错误处理和监控
  - [x] 15.1 实现全局错误处理
    - 实现 API 错误边界
    - 实现统一错误响应格式
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 15.2 实现监控和告警
    - 实现关键指标记录（处理时间、成功率）
    - 实现异常情况告警通知
    - _需求: 10.2, 10.5_

- [ ]* 16. 测试
  - [ ]* 16.1 编写单元测试
    - 测试 Webhook 签名验证
    - 测试 Diff 解析器
    - 测试 AI 响应解析
    - 测试队列操作
    - _需求: 1.3, 3.1, 4.5, 7.1_
  
  - [ ]* 16.2 编写集成测试
    - 测试完整审查流程（Webhook -> 队列 -> 审查 -> 发布）
    - 测试轮询扫描流程
    - 测试并发处理
    - _需求: 1.5, 2.6, 7.1_
  
  - [ ]* 16.3 编写属性测试
    - **属性 1: 提交去重一致性**
    - **验证: 需求 2.9**
    - 测试同一提交通过不同触发方式到达时，系统保证只处理一次
    
    - **属性 2: 队列 FIFO 顺序性**
    - **验证: 需求 7.3**
    - 测试队列按提交时间顺序处理任务
    
    - **属性 3: 重试幂等性**
    - **验证: 需求 4.3, 6.4**
    - 测试失败重试不会产生重复的审查结果

- [x] 17. 文档和部署
  - 编写 README.md（项目介绍、安装、配置）
  - 编写 API 文档
  - 创建 Docker 配置文件
  - 创建部署脚本和环境配置说明
  - _需求: 通用_

- [x] 18. 最终检查点
  - 确保所有测试通过
  - 验证所有需求已实现
  - 检查代码质量和安全性
  - 询问用户是否有其他问题或调整需求

## 注意事项

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求编号，确保可追溯性
- 建议按顺序执行任务，后续任务依赖前面的基础设施
- 在检查点任务处暂停，确保当前阶段功能正常后再继续
