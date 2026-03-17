# 健康检查 API

健康检查 API 用于监控 AI 代码审查系统各个组件的运行状态，包括数据库、Redis 缓存和 AI 服务的连接状态。

## API 端点

### GET /api/health

获取系统详细健康状态信息。

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| services | string | 否 | 全部 | 要检查的服务列表，用逗号分隔。可选值：`database`, `redis`, `ai` |
| timeout | number | 否 | 5000 | 健康检查超时时间（毫秒），范围：1000-30000 |

#### 请求示例

```bash
# 检查所有服务
curl http://localhost:3000/api/health

# 只检查数据库和 Redis
curl "http://localhost:3000/api/health?services=database,redis"

# 设置 10 秒超时
curl "http://localhost:3000/api/health?timeout=10000"
```

#### 响应格式

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "status": "healthy",
    "timestamp": 1703123456789,
    "uptime": 3600000,
    "services": [
      {
        "name": "database",
        "status": "healthy",
        "responseTime": 15,
        "details": {
          "type": "MySQL",
          "poolStatus": {
            "totalConnections": 10,
            "activeConnections": 2,
            "idleConnections": 8,
            "queuedRequests": 0
          }
        },
        "timestamp": 1703123456789
      },
      {
        "name": "redis",
        "status": "healthy",
        "responseTime": 8,
        "details": {
          "connected": true,
          "status": "ready",
          "host": "localhost",
          "port": 6379,
          "db": 0
        },
        "timestamp": 1703123456789
      },
      {
        "name": "ai",
        "status": "healthy",
        "responseTime": 120,
        "details": {
          "provider": "openai",
          "model": "gpt-4",
          "hasApiKey": true
        },
        "timestamp": 1703123456789
      }
    ],
    "system": {
      "nodeVersion": "v20.10.0",
      "memory": {
        "used": 128,
        "total": 512,
        "usage": 25
      },
      "cpu": {
        "usage": 0
      }
    }
  },
  "timestamp": 1703123456789,
  "requestId": "uuid-string"
}
```

#### 状态说明

**系统状态 (status)**
- `healthy`: 所有检查的服务都正常
- `degraded`: 部分服务降级但仍可用
- `unhealthy`: 有服务不可用

**服务状态 (services[].status)**
- `healthy`: 服务正常运行
- `degraded`: 服务运行但性能降级
- `unhealthy`: 服务不可用

#### HTTP 状态码

- `200`: 请求成功（不论系统是否健康）
- `400`: 请求参数错误
- `500`: 服务器内部错误

### HEAD /api/health

简化的健康检查，仅返回 HTTP 状态码，不返回响应体。适用于负载均衡器等工具的健康检查。

#### 请求示例

```bash
curl -I http://localhost:3000/api/health
```

#### 响应

**健康状态**
```
HTTP/1.1 200 OK
Cache-Control: no-cache, no-store, must-revalidate
X-Health-Status: healthy
```

**不健康状态**
```
HTTP/1.1 503 Service Unavailable
Cache-Control: no-cache, no-store, must-revalidate
X-Health-Status: unhealthy
```

#### 响应头说明

| 响应头 | 说明 |
|--------|------|
| X-Health-Status | 系统健康状态：`healthy`, `degraded`, `unhealthy` |
| Cache-Control | 禁用缓存，确保获取最新状态 |

## 使用场景

### 1. 监控系统集成

```bash
# Prometheus 健康检查
curl -f http://localhost:3000/api/health || exit 1

# Kubernetes 就绪探针
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### 2. 负载均衡器健康检查

```nginx
# Nginx upstream 健康检查
upstream ai_review_backend {
    server 127.0.0.1:3000;
    
    # 使用 HEAD 方法进行健康检查
    health_check uri=/api/health;
}
```

### 3. 运维脚本

```bash
#!/bin/bash
# 检查系统健康状态

HEALTH_URL="http://localhost:3000/api/health"
RESPONSE=$(curl -s "$HEALTH_URL")
STATUS=$(echo "$RESPONSE" | jq -r '.data.status')

if [ "$STATUS" = "healthy" ]; then
    echo "✅ 系统运行正常"
    exit 0
elif [ "$STATUS" = "degraded" ]; then
    echo "⚠️  系统运行但有服务降级"
    exit 1
else
    echo "❌ 系统不健康"
    exit 2
fi
```

### 4. 应用启动检查

```javascript
// 等待服务就绪
async function waitForHealthy(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (data.data.status === 'healthy') {
        console.log('✅ 服务已就绪');
        return true;
      }
      
      console.log(`⏳ 等待服务就绪... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log(`❌ 健康检查失败: ${error.message}`);
    }
  }
  
  throw new Error('服务启动超时');
}
```

## 环境变量配置

可以通过环境变量配置健康检查行为：

```bash
# 健康检查超时时间（毫秒）
HEALTH_CHECK_TIMEOUT=5000

# 是否检查数据库（默认：true）
HEALTH_CHECK_DATABASE=true

# 是否检查 Redis（默认：true）
HEALTH_CHECK_REDIS=true

# 是否检查 AI 服务（默认：true）
HEALTH_CHECK_AI=true
```

## 故障排查

### 常见问题

1. **数据库连接失败**
   - 检查数据库服务是否运行
   - 验证连接配置（主机、端口、用户名、密码）
   - 检查网络连接

2. **Redis 连接失败**
   - 检查 Redis 服务是否运行
   - 验证 Redis 配置
   - 检查防火墙设置

3. **AI 服务不可用**
   - 检查 API 密钥是否正确
   - 验证网络连接
   - 检查 API 配额是否用完

### 日志查看

健康检查相关日志会记录在系统日志中：

```bash
# 查看健康检查日志
grep "HealthChecker" logs/combined.log

# 查看 API 请求日志
grep "/api/health" logs/combined.log
```

## 性能考虑

- HEAD 请求使用 3 秒超时，适合频繁检查
- GET 请求默认 5 秒超时，可获取详细信息
- 建议监控系统使用 HEAD 请求以减少资源消耗
- 避免过于频繁的健康检查（建议间隔 ≥ 10 秒）