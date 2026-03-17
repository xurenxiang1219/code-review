# 部署指南

本文档详细说明 AI 代码审查系统的部署方法和最佳实践。

## 目录

- [部署架构](#部署架构)
- [环境准备](#环境准备)
- [Docker 部署（推荐）](#docker-部署推荐)
- [手动部署](#手动部署)
- [生产环境配置](#生产环境配置)
- [监控和日志](#监控和日志)
- [备份和恢复](#备份和恢复)
- [故障排查](#故障排查)

## 部署架构

### 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                    负载均衡器 (Nginx)                    │
│                   HTTPS 终止 / 反向代理                  │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──────┐ ┌──▼──────────┐ ┌▼──────────────┐
│  App Server  │ │ App Server  │ │  App Server   │
│  (Next.js)   │ │  (Next.js)  │ │   (Next.js)   │
└───────┬──────┘ └──┬──────────┘ └┬──────────────┘
        │           │              │
        └───────────┼──────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼──────┐ ┌─▼─────────┐ ┌▼──────────┐
│   Worker 1   │ │  Worker 2 │ │  Scanner  │
└───────┬──────┘ └─┬─────────┘ └┬──────────┘
        │          │             │
        └──────────┼─────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
┌───────▼──────┐ ┌▼─────────┐
│    MySQL     │ │  Redis   │
│  (主从复制)   │ │ (哨兵)   │
└──────────────┘ └──────────┘
```

### 最小部署

对于小型团队或测试环境：

```
┌─────────────────────────────────┐
│       单服务器部署               │
│  ┌──────────────────────────┐  │
│  │  App + Worker + Scanner  │  │
│  └──────────────────────────┘  │
│  ┌──────────┐  ┌────────────┐  │
│  │  MySQL   │  │   Redis    │  │
│  └──────────┘  └────────────┘  │
└─────────────────────────────────┘
```

## 环境准备

### 系统要求

- **操作系统**：Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **CPU**：最低 2 核，推荐 4 核以上
- **内存**：最低 4GB，推荐 8GB 以上
- **磁盘**：最低 20GB，推荐 50GB 以上（SSD）
- **网络**：稳定的互联网连接

### 软件依赖

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18.17+ (手动部署)
- MySQL 8.0+ (手动部署)
- Redis 7.0+ (手动部署)
- pnpm 8.0+ (手动部署)

### 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

## Docker 部署（推荐）

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-code-review-system
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# 数据库配置
DATABASE_USER=ai_review
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=ai_code_review

# Redis 配置
REDIS_PASSWORD=your_redis_password

# AI 模型配置
AI_PROVIDER=openai
AI_API_KEY=your_api_key
AI_MODEL=gpt-4

# Git 配置
GIT_PROVIDER=github
GIT_TOKEN=your_git_token
GIT_WEBHOOK_SECRET=your_webhook_secret

# 应用配置
NEXT_PUBLIC_APP_URL=https://your-domain.com
JWT_SECRET=your_jwt_secret
API_KEY_SECRET=your_api_key_secret
```

### 3. 启动服务

```bash
# 启动所有服务（不包括轮询扫描器）
docker-compose up -d

# 启动所有服务（包括轮询扫描器）
docker-compose --profile polling up -d

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f app
docker-compose logs -f worker
```

### 4. 初始化数据库

```bash
# 进入应用容器
docker-compose exec app sh

# 运行数据库迁移
pnpm db:migrate

# 初始化认证系统
pnpm tsx scripts/init-auth.ts

# 初始化监控系统
pnpm tsx scripts/init-monitoring.ts

# 退出容器
exit
```

### 5. 验证部署

```bash
# 检查服务状态
docker-compose ps

# 健康检查
curl http://localhost:3000/api/health

# 访问 Web 界面
open http://localhost:3000
```

## 手动部署

### 1. 安装依赖

```bash
# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm@10.25.0

# 验证安装
node --version
pnpm --version
```

### 2. 安装 MySQL

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y mysql-server

# 启动 MySQL
sudo systemctl start mysql
sudo systemctl enable mysql

# 安全配置
sudo mysql_secure_installation

# 创建数据库和用户
sudo mysql -u root -p
```

```sql
CREATE DATABASE ai_code_review CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ai_review'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ai_code_review.* TO 'ai_review'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. 安装 Redis

```bash
# Ubuntu/Debian
sudo apt-get install -y redis-server

# 配置 Redis 密码
sudo nano /etc/redis/redis.conf
# 取消注释并设置: requirepass your_redis_password

# 重启 Redis
sudo systemctl restart redis
sudo systemctl enable redis

# 验证
redis-cli
AUTH your_redis_password
PING
```

### 4. 部署应用

```bash
# 克隆项目
git clone <repository-url>
cd ai-code-review-system

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
nano .env

# 运行数据库迁移
pnpm db:migrate

# 初始化系统
pnpm tsx scripts/init-auth.ts
pnpm tsx scripts/init-monitoring.ts

# 构建应用
pnpm build

# 启动应用
pnpm start
```

### 5. 配置进程管理器（PM2）

```bash
# 安装 PM2
npm install -g pm2

# 创建 PM2 配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'ai-review-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'ai-review-worker',
      script: 'scripts/worker.ts',
      interpreter: 'node',
      interpreter_args: '--loader tsx',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'ai-review-scanner',
      script: 'scripts/polling-scanner.ts',
      interpreter: 'node',
      interpreter_args: '--loader tsx',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
EOF

# 启动应用
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

### 6. 配置 Nginx 反向代理

```bash
# 安装 Nginx
sudo apt-get install -y nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/ai-review
```

```nginx
upstream ai_review_app {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 日志
    access_log /var/log/nginx/ai-review-access.log;
    error_log /var/log/nginx/ai-review-error.log;

    # 客户端最大请求体大小
    client_max_body_size 10M;

    # 代理配置
    location / {
        proxy_pass http://ai_review_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Webhook 端点特殊配置
    location /api/webhook {
        proxy_pass http://ai_review_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/ai-review /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 7. 配置 SSL 证书（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 生产环境配置

### 环境变量最佳实践

```env
# 使用强密码
DATABASE_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
API_KEY_SECRET=$(openssl rand -base64 64)

# 启用生产模式
NODE_ENV=production

# 配置日志
LOG_LEVEL=info
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/var/log/ai-review

# 性能优化
WORKER_CONCURRENCY=10
WORKER_POLL_INTERVAL=1000

# 安全配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### 数据库优化

```sql
-- MySQL 配置优化 (/etc/mysql/mysql.conf.d/mysqld.cnf)
[mysqld]
# 连接配置
max_connections = 200
max_connect_errors = 100

# 缓冲池配置
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M

# 查询缓存
query_cache_type = 1
query_cache_size = 128M

# 慢查询日志
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow-query.log
long_query_time = 2

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

### Redis 优化

```conf
# Redis 配置优化 (/etc/redis/redis.conf)

# 内存配置
maxmemory 1gb
maxmemory-policy allkeys-lru

# 持久化
save 900 1
save 300 10
save 60 10000

# AOF
appendonly yes
appendfsync everysec

# 性能
tcp-backlog 511
timeout 300
tcp-keepalive 300
```

### 系统资源限制

```bash
# 编辑 /etc/security/limits.conf
sudo nano /etc/security/limits.conf
```

```conf
# 增加文件描述符限制
* soft nofile 65536
* hard nofile 65536

# 增加进程数限制
* soft nproc 32768
* hard nproc 32768
```

## 监控和日志

### 日志管理

```bash
# 配置日志轮转
sudo nano /etc/logrotate.d/ai-review
```

```conf
/var/log/ai-review/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 监控配置

```bash
# 安装监控工具
npm install -g pm2-logrotate

# 配置 PM2 监控
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30

# 查看监控
pm2 monit
pm2 logs
```

## 备份和恢复

### 数据库备份

```bash
# 创建备份脚本
cat > /usr/local/bin/backup-ai-review.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/var/backups/ai-review"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="ai_code_review"
DB_USER="ai_review"
DB_PASSWORD="your_password"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# 备份 Redis
redis-cli --rdb $BACKUP_DIR/redis_backup_$DATE.rdb

# 删除 30 天前的备份
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

# 设置执行权限
chmod +x /usr/local/bin/backup-ai-review.sh

# 配置定时任务
crontab -e
```

```cron
# 每天凌晨 2 点执行备份
0 2 * * * /usr/local/bin/backup-ai-review.sh >> /var/log/ai-review-backup.log 2>&1
```

### 数据恢复

```bash
# 恢复数据库
gunzip < /var/backups/ai-review/db_backup_20240120_020000.sql.gz | mysql -u ai_review -p ai_code_review

# 恢复 Redis
redis-cli --rdb /var/backups/ai-review/redis_backup_20240120_020000.rdb
redis-cli SHUTDOWN NOSAVE
sudo systemctl start redis
```

### 应用备份

```bash
# 备份应用配置和日志
tar -czf /var/backups/ai-review/app_backup_$(date +%Y%m%d).tar.gz \
  /path/to/ai-code-review-system/.env \
  /path/to/ai-code-review-system/logs \
  /path/to/ai-code-review-system/config
```

## 故障排查

### 常见问题

#### 1. 应用无法启动

```bash
# 检查日志
docker-compose logs app
# 或
pm2 logs ai-review-app

# 检查端口占用
sudo netstat -tlnp | grep 3000

# 检查环境变量
docker-compose exec app env | grep DATABASE
```

#### 2. 数据库连接失败

```bash
# 检查 MySQL 状态
sudo systemctl status mysql
docker-compose ps mysql

# 测试连接
mysql -h localhost -u ai_review -p

# 检查防火墙
sudo ufw status
sudo ufw allow 3306/tcp
```

#### 3. Redis 连接失败

```bash
# 检查 Redis 状态
sudo systemctl status redis
docker-compose ps redis

# 测试连接
redis-cli -h localhost -p 6379 -a your_password
PING

# 检查配置
redis-cli CONFIG GET requirepass
```

#### 4. Worker 不处理任务

```bash
# 检查 Worker 日志
docker-compose logs worker
pm2 logs ai-review-worker

# 检查队列状态
redis-cli -a your_password
ZCARD review:queue

# 重启 Worker
docker-compose restart worker
pm2 restart ai-review-worker
```

#### 5. Webhook 接收失败

```bash
# 检查 Nginx 日志
sudo tail -f /var/log/nginx/ai-review-error.log

# 测试 Webhook 端点
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 检查签名验证
# 查看应用日志中的签名验证错误
```

#### 6. AI 服务调用失败

```bash
# 检查 AI API 配置
echo $AI_API_KEY
echo $AI_BASE_URL

# 测试 AI API 连接
curl -H "Authorization: Bearer $AI_API_KEY" \
  https://api.openai.com/v1/models

# 查看错误日志
grep "AI service error" logs/error.log
```

### 性能问题排查

```bash
# 检查系统资源
top
htop
free -h
df -h

# 检查数据库性能
mysql -u root -p -e "SHOW PROCESSLIST;"
mysql -u root -p -e "SHOW ENGINE INNODB STATUS\G"

# 检查 Redis 性能
redis-cli INFO stats
redis-cli SLOWLOG GET 10

# 检查应用性能
pm2 monit
docker stats
```

### 日志分析

```bash
# 查看错误日志
tail -f logs/error.log

# 统计错误类型
grep "ERROR" logs/combined.log | awk '{print $5}' | sort | uniq -c | sort -rn

# 查看慢查询
grep "slow query" logs/combined.log

# 分析请求响应时间
grep "duration" logs/combined.log | awk '{print $NF}' | sort -n | tail -20
```

## 安全加固

### 防火墙配置

```bash
# 启用 UFW
sudo ufw enable

# 允许必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# 限制数据库访问（仅本地）
sudo ufw deny 3306/tcp
sudo ufw deny 6379/tcp

# 查看规则
sudo ufw status verbose
```

### 定期更新

```bash
# 更新系统包
sudo apt-get update
sudo apt-get upgrade -y

# 更新 Docker 镜像
docker-compose pull
docker-compose up -d

# 更新应用依赖
pnpm update
```

### 安全审计

```bash
# 检查开放端口
sudo netstat -tlnp

# 检查运行进程
ps aux | grep node

# 检查文件权限
ls -la /path/to/ai-code-review-system

# 审计日志
sudo ausearch -m avc -ts recent
```

## 扩展和优化

### 水平扩展

```bash
# 增加 Worker 实例
docker-compose up -d --scale worker=3

# 使用 PM2 集群模式
pm2 start ecosystem.config.js --instances 4
```

### 数据库主从复制

参考 MySQL 官方文档配置主从复制：
https://dev.mysql.com/doc/refman/8.0/en/replication.html

### Redis 哨兵模式

参考 Redis 官方文档配置哨兵：
https://redis.io/docs/management/sentinel/

### CDN 配置

将静态资源部署到 CDN：

```bash
# 构建时配置 CDN
NEXT_PUBLIC_CDN_URL=https://cdn.example.com pnpm build
```

## 维护计划

### 日常维护

- 每天检查系统健康状态
- 每天检查错误日志
- 每周检查磁盘空间
- 每周检查备份完整性

### 定期维护

- 每月更新系统和依赖
- 每月优化数据库
- 每季度审查安全配置
- 每季度进行灾难恢复演练

### 监控指标

关键指标：
- 应用响应时间
- 队列长度
- 审查成功率
- 数据库连接数
- Redis 内存使用
- 磁盘空间使用
- CPU 和内存使用率

## 联系支持

如遇到部署问题，请：

1. 查看本文档的故障排查部分
2. 查看应用日志和错误信息
3. 提交 Issue 并附上详细信息
4. 联系技术支持：support@example.com

---

**注意**：生产环境部署前请充分测试，确保所有配置正确且安全。
