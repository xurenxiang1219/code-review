# Polling Scanner 使用指南

## 快速开始

### 1. 环境准备

```bash
# 复制环境变量配置
cp scripts/polling-scanner.env.example .env.polling-scanner

# 编辑配置文件
vim .env.polling-scanner
```

### 2. 基本配置

最少需要配置以下环境变量：

```bash
# 数据库和缓存
DATABASE_URL=mysql://user:pass@localhost:3306/ai_code_review
REDIS_URL=redis://localhost:6379

# Git 配置
GIT_TOKEN=your_git_token_here
POLLING_REPOSITORIES=owner/repo1,owner/repo2

# 或者单个仓库
GIT_REPOSITORY=owner/repo
```

### 3. 启动服务

```bash
# 启动 Polling Scanner
./scripts/start-polling-scanner.sh start

# 查看状态
./scripts/start-polling-scanner.sh status

# 查看日志
./scripts/start-polling-scanner.sh logs
```

## 主要功能

### 定时扫描
- 自动扫描指定仓库的新提交
- 支持多仓库并发扫描
- 可配置扫描间隔（30-3600秒）

### 智能去重
- 自动跟踪已处理的提交
- 避免重复审查同一提交
- 支持与 Webhook 模式并存

### 错误恢复
- 自动重试失败的操作
- 优雅处理网络异常
- 进程异常自动重启

### 监控告警
- 实时健康检查
- 资源使用监控
- 多种告警方式

## 配置说明

### 全局配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `POLLING_DEFAULT_INTERVAL` | 300 | 默认扫描间隔（秒） |
| `POLLING_DEFAULT_BRANCH` | uat | 默认目标分支 |
| `POLLING_MAX_CONCURRENT` | 10 | 最大并发扫描器数 |

### 仓库特定配置

为不同仓库设置不同参数：

```bash
# myorg/repo1 每3分钟扫描一次
POLLING_MYORG_REPO1_INTERVAL=180

# myorg/repo2 扫描 main 分支
POLLING_MYORG_REPO2_BRANCH=main

# myorg/repo3 禁用扫描
POLLING_MYORG_REPO3_ENABLED=false
```

## 部署方式

### 方式一：直接部署

```bash
# 启动服务
./scripts/start-polling-scanner.sh start

# 启动监控（可选）
./scripts/monitor-polling-scanner.sh start
```

### 方式二：Docker 部署

```bash
# 使用 Docker Compose
docker-compose -f scripts/docker-compose.polling-scanner.yml up -d

# 查看日志
docker-compose -f scripts/docker-compose.polling-scanner.yml logs -f
```

### 方式三：systemd 服务

```bash
# 安装服务
sudo cp scripts/ai-code-review-polling-scanner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ai-code-review-polling-scanner
sudo systemctl start ai-code-review-polling-scanner
```

## 常用命令

```bash
# 服务管理
./scripts/start-polling-scanner.sh start|stop|restart|status

# 日志查看
./scripts/start-polling-scanner.sh logs 100    # 查看最近100行
./scripts/start-polling-scanner.sh follow      # 实时跟踪

# 健康检查
./scripts/start-polling-scanner.sh health

# 配置查看
./scripts/start-polling-scanner.sh config

# 日志清理
./scripts/start-polling-scanner.sh cleanup 7   # 清理7天前的日志
```

## 故障排查

### 常见问题

1. **启动失败**
   ```bash
   # 检查配置
   ./scripts/start-polling-scanner.sh config
   
   # 查看错误日志
   tail -f logs/polling-scanner.error.log
   ```

2. **扫描不工作**
   ```bash
   # 检查仓库配置
   echo $POLLING_REPOSITORIES
   
   # 检查 Git Token 权限
   curl -H "Authorization: token $GIT_TOKEN" https://api.github.com/user
   ```

3. **内存使用过高**
   ```bash
   # 查看进程状态
   ./scripts/start-polling-scanner.sh status
   
   # 重启服务
   ./scripts/start-polling-scanner.sh restart
   ```

### 日志分析

```bash
# 查看扫描统计
grep "扫描完成" logs/polling-scanner.log | tail -10

# 查看错误统计
grep "ERROR" logs/polling-scanner.log | wc -l

# 查看最近的错误
grep "ERROR" logs/polling-scanner.error.log | tail -5
```

## 性能调优

### 扫描间隔优化

```bash
# 高频仓库：较短间隔
POLLING_MYORG_ACTIVE_REPO_INTERVAL=120

# 低频仓库：较长间隔
POLLING_MYORG_ARCHIVE_REPO_INTERVAL=1800
```

### 并发数调整

```bash
# 根据服务器性能调整
POLLING_MAX_CONCURRENT=20
```

### 内存限制

```bash
# 设置 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=1024"
```

## 监控配置

### 启用监控

```bash
# 启动监控器
./scripts/monitor-polling-scanner.sh start

# 查看监控状态
./scripts/monitor-polling-scanner.sh status
```

### 告警配置

```bash
# 邮件告警
export ALERT_EMAIL="admin@example.com"

# Webhook 告警
export ALERT_WEBHOOK="https://hooks.slack.com/services/..."
```

## 最佳实践

1. **合理设置扫描间隔**
   - 活跃仓库：2-5分钟
   - 普通仓库：5-10分钟
   - 归档仓库：30分钟以上

2. **监控资源使用**
   - 定期检查内存和CPU使用
   - 设置合理的告警阈值

3. **日志管理**
   - 定期清理旧日志
   - 监控错误日志数量

4. **安全考虑**
   - 使用最小权限的 Git Token
   - 定期轮换访问密钥
   - 保护环境变量文件