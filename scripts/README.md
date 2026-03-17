# AI 代码审查系统 - 后台服务启动脚本

本目录包含了 AI 代码审查系统后台服务的启动、管理和监控脚本，包括 Queue Worker 和 Polling Scanner。

## 文件说明

### Queue Worker 核心脚本

- **`worker.ts`** - Worker 进程主程序，负责处理审查任务
- **`start-worker.sh`** - Worker 管理脚本，支持启动、停止、重启等操作
- **`monitor-worker.sh`** - Worker 监控脚本，自动监控和重启异常进程
- **`health-check.js`** - Worker 健康检查脚本，用于容器和监控系统

### Polling Scanner 核心脚本

- **`polling-scanner.ts`** - Polling Scanner 进程主程序，负责定时扫描 Git 仓库
- **`start-polling-scanner.sh`** - Polling Scanner 管理脚本，支持启动、停止、重启等操作
- **`monitor-polling-scanner.sh`** - Polling Scanner 监控脚本，自动监控和重启异常进程
- **`polling-scanner-health-check.js`** - Polling Scanner 健康检查脚本

### 部署相关

- **`ai-code-review-worker.service`** - Worker systemd 服务配置文件
- **`ai-code-review-polling-scanner.service`** - Polling Scanner systemd 服务配置文件
- **`Dockerfile.worker`** - Worker 容器镜像构建文件
- **`Dockerfile.polling-scanner`** - Polling Scanner 容器镜像构建文件
- **`docker-compose.worker.yml`** - Worker Docker Compose 配置文件
- **`docker-compose.polling-scanner.yml`** - Polling Scanner Docker Compose 配置文件
- **`worker.env.example`** - Worker 环境变量配置示例
- **`polling-scanner.env.example`** - Polling Scanner 环境变量配置示例

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
pnpm install

# 复制环境变量配置
cp scripts/worker.env.example .env.worker

# 编辑配置文件
vim .env.worker
```

### 2. 本地开发

```bash
# 启动 Worker
./scripts/start-worker.sh start

# 查看状态
./scripts/start-worker.sh status

# 查看日志
./scripts/start-worker.sh logs

# 停止 Worker
./scripts/start-worker.sh stop
```

### 3. 生产部署

#### 方式一：直接部署

```bash
# 设置执行权限
chmod +x scripts/start-worker.sh
chmod +x scripts/monitor-worker.sh

# 启动 Worker
./scripts/start-worker.sh start

# 启动监控器
./scripts/monitor-worker.sh start
```

#### 方式二：systemd 服务

```bash
# 复制服务文件
sudo cp scripts/ai-code-review-worker.service /etc/systemd/system/

# 编辑服务文件中的路径
sudo vim /etc/systemd/system/ai-code-review-worker.service

# 重载 systemd 配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start ai-code-review-worker

# 设置开机自启
sudo systemctl enable ai-code-review-worker

# 查看状态
sudo systemctl status ai-code-review-worker
```

#### 方式三：Docker 容器

```bash
# 构建镜像
docker build -f scripts/Dockerfile.worker -t ai-code-review-worker .

# 使用 Docker Compose 启动
docker-compose -f scripts/docker-compose.worker.yml up -d

# 查看日志
docker-compose -f scripts/docker-compose.worker.yml logs -f ai-code-review-worker
```

## 配置说明

### 环境变量

主要配置项说明：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WORKER_MAX_CONCURRENCY` | 10 | 最大并发任务数 |
| `WORKER_POLL_INTERVAL` | 1000 | 轮询间隔（毫秒） |
| `WORKER_TASK_TIMEOUT` | 600000 | 任务超时时间（毫秒） |
| `DATABASE_URL` | - | MySQL 数据库连接字符串 |
| `REDIS_URL` | - | Redis 连接字符串 |
| `AI_API_KEY` | - | AI 服务 API 密钥 |
| `GIT_TOKEN` | - | Git 服务访问令牌 |

完整配置请参考 `worker.env.example` 文件。

### 日志配置

- **主日志**: `logs/worker.log` - Worker 运行日志
- **错误日志**: `logs/worker.error.log` - 错误和异常日志
- **监控日志**: `logs/monitor.log` - 监控器运行日志

## 管理命令

### Worker 管理

```bash
# 启动 Worker
./scripts/start-worker.sh start

# 停止 Worker
./scripts/start-worker.sh stop

# 重启 Worker
./scripts/start-worker.sh restart

# 查看状态
./scripts/start-worker.sh status

# 查看日志（默认 50 行）
./scripts/start-worker.sh logs

# 查看更多日志
./scripts/start-worker.sh logs 100

# 跟踪日志输出
./scripts/start-worker.sh follow

# 健康检查
./scripts/start-worker.sh health

# 清理日志（默认 7 天前）
./scripts/start-worker.sh cleanup

# 清理更多天数的日志
./scripts/start-worker.sh cleanup 3
```

### 监控管理

```bash
# 启动监控器
./scripts/monitor-worker.sh start

# 停止监控器
./scripts/monitor-worker.sh stop

# 查看监控状态
./scripts/monitor-worker.sh status

# 查看监控日志
./scripts/monitor-worker.sh logs
```

### Docker 管理

```bash
# 启动所有服务
docker-compose -f scripts/docker-compose.worker.yml up -d

# 查看服务状态
docker-compose -f scripts/docker-compose.worker.yml ps

# 查看 Worker 日志
docker-compose -f scripts/docker-compose.worker.yml logs -f ai-code-review-worker

# 重启 Worker
docker-compose -f scripts/docker-compose.worker.yml restart ai-code-review-worker

# 停止所有服务
docker-compose -f scripts/docker-compose.worker.yml down

# 启动监控服务（可选）
docker-compose -f scripts/docker-compose.worker.yml --profile monitoring up -d
```

## 监控和告警

### 健康检查

Worker 提供多层健康检查：

1. **进程检查** - 检查 Worker 进程是否运行
2. **日志检查** - 检查日志更新时间和错误数量
3. **资源检查** - 检查内存和 CPU 使用情况
4. **依赖检查** - 检查数据库和 Redis 连接

### 自动重启

监控器会在以下情况自动重启 Worker：

- 进程异常退出
- 连续健康检查失败
- 资源使用超过阈值
- 错误日志过多

### 告警通知

支持多种告警方式：

- **邮件告警** - 通过 SMTP 发送邮件
- **Webhook 告警** - 发送到 Slack、钉钉等
- **日志告警** - 记录到监控日志

配置告警：

```bash
# 设置告警邮箱
export ALERT_EMAIL="admin@example.com"

# 设置 Webhook URL
export ALERT_WEBHOOK="https://hooks.slack.com/services/..."
```

## 故障排查

### 常见问题

1. **Worker 启动失败**
   ```bash
   # 检查依赖服务
   ./scripts/start-worker.sh health
   
   # 查看错误日志
   tail -f logs/worker.error.log
   ```

2. **任务处理失败**
   ```bash
   # 查看详细日志
   ./scripts/start-worker.sh logs 200
   
   # 检查 AI 服务连接
   curl -H "Authorization: Bearer $AI_API_KEY" $AI_BASE_URL/models
   ```

3. **内存使用过高**
   ```bash
   # 查看进程资源使用
   ./scripts/start-worker.sh status
   
   # 重启 Worker
   ./scripts/start-worker.sh restart
   ```

4. **队列积压**
   ```bash
   # 检查 Redis 队列状态
   redis-cli -u $REDIS_URL
   > ZCARD review:queue:tasks
   
   # 增加并发数
   export WORKER_MAX_CONCURRENCY=20
   ./scripts/start-worker.sh restart
   ```

### 日志分析

```bash
# 查看错误统计
grep "ERROR" logs/worker.log | wc -l

# 查看最近的错误
grep "ERROR" logs/worker.log | tail -10

# 查看任务处理统计
grep "任务处理完成" logs/worker.log | wc -l

# 查看平均处理时间
grep "processingTime" logs/worker.log | tail -20
```

## 性能优化

### 并发调优

根据服务器资源调整并发数：

```bash
# CPU 密集型任务：并发数 = CPU 核数
export WORKER_MAX_CONCURRENCY=8

# I/O 密集型任务：并发数 = CPU 核数 * 2
export WORKER_MAX_CONCURRENCY=16
```

### 内存优化

```bash
# 设置 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=2048"

# 启用垃圾回收优化
export NODE_OPTIONS="--optimize-for-size"
```

### 网络优化

```bash
# 调整超时时间
export WORKER_TASK_TIMEOUT=300000  # 5分钟
export AI_API_TIMEOUT=30000        # 30秒
export GIT_API_TIMEOUT=15000       # 15秒
```

## 安全注意事项

1. **环境变量安全**
   - 不要在代码中硬编码敏感信息
   - 使用 `.env` 文件管理配置
   - 设置适当的文件权限：`chmod 600 .env.worker`

2. **网络安全**
   - 使用 HTTPS 连接外部服务
   - 验证 Webhook 签名
   - 限制网络访问权限

3. **日志安全**
   - 避免在日志中记录敏感信息
   - 定期清理日志文件
   - 设置日志文件权限

## 更新和维护

### 更新 Worker

```bash
# 拉取最新代码
git pull origin main

# 安装依赖
pnpm install

# 重启 Worker
./scripts/start-worker.sh restart
```

### 数据库迁移

```bash
# 执行数据库迁移
pnpm run db:migrate

# 检查迁移状态
pnpm run db:status
```

### 定期维护

建议设置定期维护任务：

```bash
# 添加到 crontab
crontab -e

# 每天凌晨 2 点清理日志
0 2 * * * /path/to/scripts/start-worker.sh cleanup

# 每周重启 Worker（可选）
0 3 * * 0 /path/to/scripts/start-worker.sh restart
```

## 支持和反馈

如有问题或建议，请：

1. 查看日志文件获取详细错误信息
2. 检查配置是否正确
3. 参考故障排查章节
4. 提交 Issue 或联系技术支持