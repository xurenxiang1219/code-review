# 敏感信息加密功能

AI 代码审查系统提供了完整的敏感信息加密功能，确保系统中的敏感数据（如 API 密钥、数据库密码、访问令牌等）得到安全保护。

## 功能概述

### 核心特性

- **多层加密**: 支持配置、数据库、日志等不同层级的加密
- **自动脱敏**: 日志记录时自动识别和脱敏敏感信息
- **密钥管理**: 统一的密钥生成、存储和轮换机制
- **完整性验证**: 加密数据的完整性检查和验证
- **透明操作**: 对业务逻辑透明，自动处理加密解密

### 支持的敏感信息类型

- API 密钥 (apiKey, accessToken, refreshToken)
- 密码 (password, dbPassword, smtpPassword)
- 密钥和证书 (secret, privateKey, publicKey, certificate)
- Webhook 密钥 (webhookSecret, jwtSecret)
- 加密密钥 (encryptionKey, masterKey)

## 环境配置

### 必需的环境变量

```bash
# 主加密密钥（必需，至少32个字符）
ENCRYPTION_KEY=your_master_encryption_key_32_chars_min

# 可选：专用密钥（如果不设置，将从主密钥派生）
DB_ENCRYPTION_KEY=your_database_encryption_key_32_chars
CONFIG_ENCRYPTION_KEY=your_config_encryption_key_32_chars
LOG_ENCRYPTION_KEY=your_log_encryption_key_32_chars

# 密钥轮换配置
AUTO_KEY_ROTATION_ENABLED=false
KEY_ROTATION_CHECK_INTERVAL=3600000
KEY_ROTATION_NOTIFICATION_ENABLED=true
KEY_ROTATION_NOTIFICATION_RECIPIENTS=admin@example.com,security@example.com
```

### 密钥要求

- **长度**: 至少32个字符
- **复杂度**: 建议包含大小写字母、数字和特殊字符
- **唯一性**: 不同环境使用不同的密钥
- **安全存储**: 使用环境变量或密钥管理服务

## 使用方法

### 1. 配置加密

系统会自动加密配置中的敏感字段：

```typescript
import { configEncryptionService } from '@/lib/services/config-encryption';

// 加密配置
const config = {
  aiModel: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'sk-your-api-key', // 将被自动加密
  },
  git: {
    accessToken: 'github_token', // 将被自动加密
    webhookSecret: 'webhook_secret', // 将被自动加密
  },
};

const encryptedConfig = configEncryptionService.encryptConfig(config);
// encryptedConfig.aiModel.apiKey 现在是 "enc:base64_encrypted_data"

// 解密配置
const decryptedConfig = configEncryptionService.decryptConfig(encryptedConfig);
// decryptedConfig 与原始 config 相同
```

### 2. 数据库记录加密

数据库中的敏感字段会自动加密：

```typescript
import { databaseEncryptionService } from '@/lib/services/database-encryption';

// 加密数据库记录
const record = {
  id: '123',
  ai_model_config: JSON.stringify({
    apiKey: 'sk-your-api-key', // 将被加密
  }),
  notification_config: JSON.stringify({
    smtpPassword: 'smtp_password', // 将被加密
  }),
};

const encryptedRecord = databaseEncryptionService.encryptRecord('review_config', record);

// 解密数据库记录
const decryptedRecord = databaseEncryptionService.decryptRecord('review_config', encryptedRecord);
```

### 3. 日志脱敏

日志记录时会自动脱敏敏感信息：

```typescript
import { logger } from '@/lib/utils/logger';

const userData = {
  username: 'testuser',
  password: 'secret123',
  apiKey: 'very_long_api_key_for_testing',
};

// 使用安全日志记录
logger.secureLog('用户数据处理', userData);
// 日志中显示: { username: 'testuser', password: 'sec***23', apiKey: 'very***ting' }

// 或者手动脱敏
import { sensitiveDataManager } from '@/lib/utils/crypto';
const sanitized = sensitiveDataManager.sanitizeForLogging(userData);
logger.info('处理用户数据', sanitized);
```

### 4. 密钥管理

```typescript
import { keyManager } from '@/lib/utils/crypto';

// 获取不同类型的密钥
const masterKey = keyManager.getMasterKey();
const dbKey = keyManager.getDatabaseKey();
const configKey = keyManager.getConfigKey();

// 生成新密钥
const newKey = keyManager.generateKey();

// 验证密钥强度
const validation = keyManager.validateKeyStrength('your_key');
if (!validation.valid) {
  console.error('密钥强度不足:', validation.message);
}

// 检查是否需要轮换
const needsRotation = keyManager.shouldRotateKey(new Date('2024-01-01'));
```

## API 接口

### 获取加密状态

```http
GET /api/encryption
Authorization: Bearer your_api_key
```

响应：
```json
{
  "code": 0,
  "msg": "操作成功",
  "data": {
    "keyRotation": {
      "config": {
        "needed": false,
        "lastRotation": "2024-01-15T10:30:00Z"
      },
      "database": {
        "needed": true,
        "lastRotation": null
      }
    },
    "encryptedTables": [
      {
        "tableName": "review_config",
        "sensitiveFieldsCount": 2,
        "sensitiveFields": ["ai_model_config", "notification_config"]
      }
    ]
  }
}
```

### 执行密钥轮换

```http
POST /api/encryption/rotate
Authorization: Bearer your_api_key
Content-Type: application/json

{
  "keyType": "config",
  "force": false
}
```

### 验证数据完整性

```http
PUT /api/encryption/validate
Authorization: Bearer your_api_key
```

## 密钥轮换

### 自动轮换

系统支持自动密钥轮换，通过定时任务定期检查和轮换密钥：

```bash
# 启动密钥轮换调度器
tsx scripts/key-rotation-scheduler.ts

# 或者添加到 crontab
0 2 * * * /usr/bin/tsx /path/to/scripts/key-rotation-scheduler.ts
```

### 手动轮换

```bash
# 通过 API 手动轮换
curl -X POST http://localhost:3000/api/encryption/rotate \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"keyType": "config", "force": true}'
```

### 轮换流程

1. **检查需求**: 系统检查密钥是否需要轮换（默认24小时）
2. **备份数据**: 轮换前备份相关数据
3. **生成新密钥**: 生成符合安全要求的新密钥
4. **重新加密**: 使用新密钥重新加密所有相关数据
5. **验证完整性**: 验证重新加密后的数据完整性
6. **更新记录**: 更新密钥轮换日志
7. **发送通知**: 向管理员发送轮换结果通知

## 安全最佳实践

### 密钥管理

1. **使用强密钥**: 至少32个字符，包含大小写字母、数字和特殊字符
2. **定期轮换**: 建议每月轮换一次密钥
3. **分离存储**: 不同环境使用不同的密钥
4. **访问控制**: 限制密钥的访问权限
5. **审计日志**: 记录所有密钥操作的审计日志

### 环境配置

1. **环境变量**: 使用环境变量存储密钥，不要硬编码
2. **密钥管理服务**: 生产环境建议使用专业的密钥管理服务
3. **网络安全**: 确保密钥传输过程的安全性
4. **备份策略**: 制定密钥备份和恢复策略

### 监控和告警

1. **加密状态监控**: 定期检查加密数据的完整性
2. **轮换提醒**: 设置密钥轮换提醒和告警
3. **异常检测**: 监控异常的加密解密操作
4. **访问日志**: 记录所有敏感数据的访问日志

## 故障排除

### 常见问题

#### 1. 密钥未配置错误

```
错误: 主加密密钥未配置，请设置 ENCRYPTION_KEY 环境变量
```

**解决方案**: 设置 `ENCRYPTION_KEY` 环境变量，确保长度至少32个字符。

#### 2. 密钥长度不足错误

```
错误: 主加密密钥长度必须至少为32个字符
```

**解决方案**: 使用更长的密钥，建议64个字符以上。

#### 3. 解密失败错误

```
错误: 数据解密失败
```

**可能原因**:
- 密钥已更改但数据未重新加密
- 数据损坏或格式错误
- 使用了错误的密钥

**解决方案**:
1. 检查密钥配置是否正确
2. 验证数据完整性
3. 如果密钥已更改，执行密钥轮换

#### 4. 数据完整性验证失败

```
错误: 加密数据完整性验证失败
```

**解决方案**:
1. 运行完整性验证 API
2. 检查错误详情
3. 重新加密受影响的数据

### 调试模式

启用调试日志来排查问题：

```bash
export LOG_LEVEL=debug
export NODE_ENV=development
```

### 数据恢复

如果加密数据损坏，可以尝试以下恢复步骤：

1. **检查备份**: 从最近的备份恢复数据
2. **重新配置**: 重新设置受影响的配置项
3. **重新加密**: 使用正确的密钥重新加密数据
4. **验证完整性**: 确保恢复后的数据完整性

## 性能考虑

### 加密性能

- **批量操作**: 使用批量加密/解密接口提高性能
- **缓存策略**: 合理使用缓存减少重复加密操作
- **异步处理**: 大量数据的加密操作使用异步处理

### 存储开销

- **数据膨胀**: 加密后的数据大小约为原数据的1.3-1.5倍
- **索引影响**: 加密字段无法建立有效索引
- **查询限制**: 加密字段无法进行模糊查询

## 合规性

本加密功能设计符合以下安全标准：

- **AES-256-GCM**: 使用业界标准的加密算法
- **PBKDF2**: 使用安全的密钥派生函数
- **时间常数比较**: 防止时序攻击
- **完整性保护**: 提供数据完整性验证
- **审计日志**: 完整的操作审计记录

## 更新日志

### v1.0.0 (2024-01-15)
- 初始版本发布
- 支持配置和数据库字段加密
- 实现日志脱敏功能
- 提供密钥管理和轮换机制
- 添加完整性验证功能