# Requirements Document

## Introduction

AI 代码审查系统是一个自动化代码质量保障工具，当开发人员提交代码到 UAT 分支时，系统自动触发 AI 大模型对代码变更进行审查，并生成具体的改进建议。该系统旨在提高代码质量、减少人工审查负担，并在代码进入测试环境前及早发现潜在问题。

## Glossary

- **Review_System**: AI 代码审查系统，负责协调整个审查流程
- **Webhook_Listener**: Webhook 监听器，接收 Git 仓库的推送事件
- **Code_Analyzer**: 代码分析器，提取和分析代码变更
- **AI_Reviewer**: AI 审查器，调用大模型进行代码审查
- **Comment_Publisher**: 评论发布器，将审查结果发布到代码仓库
- **UAT_Branch**: User Acceptance Testing 分支，用户验收测试分支
- **Commit**: 代码提交记录
- **Diff**: 代码差异，表示本次提交相对于上一次的变更
- **Review_Comment**: 审查评论，包含问题描述、严重程度和修改建议
- **AI_Model**: AI 大模型服务，提供代码审查能力
- **Polling_Scanner**: 轮询扫描器，定期主动检查 Git 仓库的新提交
- **Commit_Tracker**: 提交追踪器，记录已处理的提交以避免重复审查

## Requirements

### Requirement 1: 监听 UAT 分支提交事件

**User Story:** 作为系统管理员，我希望系统能够自动监听 UAT 分支的代码提交，以便及时触发审查流程。

#### Acceptance Criteria

1. THE Webhook_Listener SHALL 注册到 Git 仓库的 webhook 端点
2. WHEN 代码被推送到 UAT_Branch 时，THE Webhook_Listener SHALL 接收推送事件通知
3. WHEN 接收到推送事件时，THE Webhook_Listener SHALL 验证事件来源的合法性
4. WHEN 推送事件验证失败时，THE Webhook_Listener SHALL 拒绝该事件并记录安全日志
5. WHEN 推送事件验证成功时，THE Webhook_Listener SHALL 提取 Commit 信息并触发审查流程

### Requirement 2: 主动扫描 UAT 分支新提交

**User Story:** 作为系统管理员，我希望系统能够主动扫描 Git 仓库的新提交，以便在无法部署公网 webhook 的环境中也能自动触发审查。

#### Acceptance Criteria

1. WHERE 主动扫描模式被启用时，THE Polling_Scanner SHALL 定期检查 UAT_Branch 的新提交
2. THE Polling_Scanner SHALL 支持配置扫描间隔时间（最小 30 秒，最大 3600 秒）
3. WHEN 扫描周期到达时，THE Polling_Scanner SHALL 查询 Git 仓库获取 UAT_Branch 的最新 Commit 列表
4. THE Commit_Tracker SHALL 记录每个已处理 Commit 的哈希值和处理时间
5. WHEN 发现新 Commit 时，THE Polling_Scanner SHALL 检查 Commit_Tracker 确认该 Commit 未被处理
6. WHEN Commit 未被处理时，THE Polling_Scanner SHALL 触发审查流程
7. WHEN Commit 已被处理时，THE Polling_Scanner SHALL 跳过该 Commit
8. THE Review_System SHALL 支持同时启用 Webhook_Listener 和 Polling_Scanner
9. WHEN 同一 Commit 通过不同触发方式到达时，THE Commit_Tracker SHALL 防止重复审查
10. WHEN Git 仓库查询失败时，THE Polling_Scanner SHALL 记录错误并在下一个扫描周期重试

### Requirement 3: 提取代码变更

**User Story:** 作为开发人员，我希望系统只审查本次提交的变更内容，以便获得针对性的反馈。

#### Acceptance Criteria

1. WHEN 审查流程被触发时，THE Code_Analyzer SHALL 获取 Commit 的 Diff 信息
2. THE Code_Analyzer SHALL 识别变更文件的编程语言类型
3. THE Code_Analyzer SHALL 过滤掉非代码文件（如图片、二进制文件）
4. WHEN Diff 超过 10000 行时，THE Code_Analyzer SHALL 将变更拆分为多个审查批次
5. THE Code_Analyzer SHALL 提取每个变更文件的上下文代码（变更前后各 5 行）

### Requirement 4: 调用 AI 模型进行代码审查

**User Story:** 作为开发人员，我希望 AI 能够审查我的代码，以便发现潜在的问题和改进空间。

#### Acceptance Criteria

1. WHEN Code_Analyzer 完成代码提取时，THE AI_Reviewer SHALL 将代码变更发送给 AI_Model
2. THE AI_Reviewer SHALL 在请求中包含代码语言类型、变更内容和上下文信息
3. WHEN AI_Model 响应超时（超过 60 秒）时，THE AI_Reviewer SHALL 重试最多 3 次
4. WHEN 重试 3 次后仍失败时，THE AI_Reviewer SHALL 记录错误并通知系统管理员
5. WHEN AI_Model 返回审查结果时，THE AI_Reviewer SHALL 解析并结构化审查意见

### Requirement 5: 生成结构化审查建议

**User Story:** 作为开发人员，我希望收到清晰、可操作的审查建议，以便快速改进代码。

#### Acceptance Criteria

1. THE AI_Reviewer SHALL 为每个问题生成 Review_Comment，包含问题描述、代码位置、严重程度和修改建议
2. THE AI_Reviewer SHALL 将问题严重程度分类为：critical（严重）、major（重要）、minor（次要）、suggestion（建议）
3. THE AI_Reviewer SHALL 为每个 Review_Comment 关联具体的文件路径和行号
4. WHEN 代码变更没有发现问题时，THE AI_Reviewer SHALL 生成正面反馈评论
5. THE AI_Reviewer SHALL 生成审查摘要，包含问题总数和各严重程度的分布

### Requirement 6: 发布审查结果

**User Story:** 作为开发人员，我希望在代码仓库中直接看到审查结果，以便在熟悉的环境中处理反馈。

#### Acceptance Criteria

1. WHEN AI_Reviewer 完成审查时，THE Comment_Publisher SHALL 将 Review_Comment 发布到对应的 Commit
2. THE Comment_Publisher SHALL 将每条 Review_Comment 关联到具体的代码行
3. THE Comment_Publisher SHALL 在 Commit 评论区发布审查摘要
4. WHEN 发布评论失败时，THE Comment_Publisher SHALL 重试最多 2 次
5. WHEN 发布失败后，THE Comment_Publisher SHALL 将审查结果通过邮件发送给提交者

### Requirement 7: 处理并发审查请求

**User Story:** 作为系统管理员，我希望系统能够处理多个并发的审查请求，以便支持团队的高频提交。

#### Acceptance Criteria

1. THE Review_System SHALL 支持同时处理最多 10 个审查请求
2. WHEN 并发请求超过 10 个时，THE Review_System SHALL 将额外请求加入队列
3. WHILE 队列中有待处理请求时，THE Review_System SHALL 按照提交时间顺序处理
4. THE Review_System SHALL 为每个审查请求分配唯一的追踪 ID
5. THE Review_System SHALL 记录每个请求的处理时间和状态

### Requirement 8: 配置审查规则

**User Story:** 作为项目负责人，我希望能够自定义审查规则，以便适应不同项目的代码规范。

#### Acceptance Criteria

1. THE Review_System SHALL 支持通过配置文件定义审查关注点（如安全性、性能、可读性）
2. THE Review_System SHALL 支持配置需要审查的文件类型白名单
3. THE Review_System SHALL 支持配置需要忽略的文件路径模式
4. THE Review_System SHALL 支持配置 AI_Model 的提示词模板
5. WHEN 配置文件更新时，THE Review_System SHALL 在下次审查时应用新配置

### Requirement 9: 记录审查历史

**User Story:** 作为项目负责人，我希望查看历史审查记录，以便分析代码质量趋势。

#### Acceptance Criteria

1. THE Review_System SHALL 持久化存储每次审查的完整记录
2. THE Review_System SHALL 记录审查时间、提交者、变更文件数、问题数量和严重程度分布
3. THE Review_System SHALL 支持按时间范围、提交者、分支查询审查历史
4. THE Review_System SHALL 保留审查记录至少 90 天
5. THE Review_System SHALL 提供审查统计报告，包含平均问题数和常见问题类型

### Requirement 10: 处理异常情况

**User Story:** 作为系统管理员，我希望系统能够优雅地处理异常情况，以便保证服务稳定性。

#### Acceptance Criteria

1. WHEN Git 仓库不可访问时，THE Review_System SHALL 记录错误并在 5 分钟后重试
2. WHEN AI_Model 服务不可用时，THE Review_System SHALL 通知系统管理员并暂停新的审查请求
3. WHEN 单个 Commit 的 Diff 为空时，THE Review_System SHALL 跳过审查并记录日志
4. WHEN 解析 Diff 失败时，THE Code_Analyzer SHALL 记录详细错误信息并通知提交者
5. THE Review_System SHALL 为所有错误生成唯一错误码，便于问题追踪

### Requirement 11: 安全和权限控制

**User Story:** 作为安全管理员，我希望系统具备必要的安全措施，以便保护代码和审查数据。

#### Acceptance Criteria

1. THE Review_System SHALL 使用加密连接（HTTPS/TLS）与 Git 仓库和 AI_Model 通信
2. THE Review_System SHALL 验证 webhook 请求的签名，防止伪造请求
3. THE Review_System SHALL 使用具有最小权限的访问令牌访问 Git 仓库
4. THE Review_System SHALL 不在日志中记录敏感信息（如访问令牌、密钥）
5. THE Review_System SHALL 对存储的审查记录进行访问控制，仅授权用户可查看

### Requirement 12: 性能要求

**User Story:** 作为开发人员，我希望审查过程快速完成，以便不影响开发流程。

#### Acceptance Criteria

1. WHEN Diff 少于 500 行时，THE Review_System SHALL 在 2 分钟内完成审查并发布结果
2. WHEN Diff 在 500 到 2000 行之间时，THE Review_System SHALL 在 5 分钟内完成审查
3. THE Webhook_Listener SHALL 在 1 秒内响应 webhook 请求
4. THE Review_System SHALL 在处理请求时消耗不超过 2GB 内存
5. THE Review_System SHALL 支持水平扩展以提高并发处理能力

### Requirement 13: 通知机制

**User Story:** 作为开发人员，我希望在审查完成后收到通知，以便及时查看反馈。

#### Acceptance Criteria

1. WHEN 审查完成时，THE Review_System SHALL 向提交者发送通知
2. THE Review_System SHALL 支持多种通知渠道（邮件、即时消息、Git 仓库评论）
3. WHEN 发现 critical 级别问题时，THE Review_System SHALL 额外通知项目负责人
4. THE Review_System SHALL 在通知中包含审查摘要和查看详情的链接
5. THE Review_System SHALL 支持用户配置通知偏好（接收哪些级别的通知）

