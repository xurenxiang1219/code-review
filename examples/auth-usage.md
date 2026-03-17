# 认证中间件使用示例

## 1. 使用 API Key 访问 API

```bash
# 使用系统生成的 API Key
API_KEY="ak_1948735a17fb7c6e1b6f97e0a12c004432d4681b17d565c90384528bf4123808"

# 查看健康状态
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/health

# 查看审查记录
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/reviews

# 查看配置
curl -H "X-API-Key: $API_KEY" "http://localhost:3000/api/config?repository=test-repo"
```

## 2. 创建新的 API Key

```bash
# 使用管理员权限创建新的 API Key
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline Key",
    "permissions": ["review:read", "webhook:receive"],
    "expiresInDays": 90
  }'
```

## 3. 查看 API Key 列表

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/auth/api-keys
```

## 4. 查看审计日志（需要管理员权限）

```bash
curl -H "X-API-Key: $API_KEY" "http://localhost:3000/api/auth/audit-logs?page=1&pageSize=10"
```

## 5. 测试速率限制

```bash
# 快速发送多个请求测试速率限制
for i in {1..10}; do
  curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/health
  echo "Request $i completed"
done
```

## 6. 测试权限控制

```bash
# 创建一个只读权限的 API Key
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Read Only Key",
    "permissions": ["review:read", "health:check"],
    "expiresInDays": 30
  }'

# 使用只读 API Key 尝试修改配置（应该返回 403）
READONLY_KEY="新创建的只读API Key"
curl -X PUT http://localhost:3000/api/config \
  -H "X-API-Key: $READONLY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reviewFocus": ["security"]}'
```

## 7. 错误处理示例

```bash
# 使用无效的 API Key
curl -H "X-API-Key: invalid-key" http://localhost:3000/api/reviews

# 不提供认证信息
curl http://localhost:3000/api/reviews

# 访问不存在的资源
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/nonexistent
```