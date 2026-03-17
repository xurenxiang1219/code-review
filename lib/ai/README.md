# AI 模块

AI 模块提供了与 AI 大模型交互的核心功能，用于代码审查系统。

## 模块结构

```
lib/ai/
├── client.ts          # AI 客户端，封装 API 调用
├── prompt-builder.ts  # 提示词构建器
└── README.md         # 本文档
```

## 核心组件

### 1. AIClient (client.ts)

AI 客户端负责与 AI 模型 API 进行通信。

#### 特性

- 支持多种 AI 提供商（OpenAI、Claude、Gemini）
- 自动重试机制（指数退避）
- 超时控制
- 错误分类和处理
- 健康检查

#### 使用示例

```typescript
import { AIClient, createDefaultAIClient } from '@/lib/ai/client';

// 使用默认配置（从环境变量读取）
const client = createDefaultAIClient();

// 或者使用自定义配置
const customClient = new AIClient({
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.3,
  maxTokens: 4000,
  timeout: 60000,
  apiKey: 'your-api-key',
});

// 调用 AI 模型
const response = await client.complete({
  prompt: '请审查这段代码',
  context: '你是一个专业的代码审查助手',
  codeLanguage: 'typescript',
});

console.log(response.content);
console.log(response.usage); // token 使用统计
```

#### 错误处理

```typescript
import { AIClientError } from '@/lib/ai/client';

try {
  const response = await client.complete(request);
} catch (error) {
  if (error instanceof AIClientError) {
    console.log('错误代码:', error.code);
    console.log('是否可重试:', error.retryable);
    console.log('错误详情:', error.details);
  }
}
```

#### 支持的错误代码

- `MISSING_API_KEY`: API 密钥缺失
- `BAD_REQUEST`: 请求参数错误
- `INVALID_API_KEY`: API 密钥无效
- `RATE_LIMIT`: 速率限制
- `TIMEOUT`: 请求超时
- `NETWORK_ERROR`: 网络错误
- `SERVICE_ERROR`: 服务端错误

### 2. PromptBuilder (prompt-builder.ts)

提示词构建器负责生成结构化的审查提示词。

#### 特性

- 模板化提示词生成
- 代码变更格式化
- 自动语言检测
- 提示词长度验证和截断
- 支持批量审查

#### 使用示例

```typescript
import { PromptBuilder, createPromptBuilder } from '@/lib/ai/prompt-builder';

const builder = createPromptBuilder();

// 构建完整审查提示词
const prompt = builder.buildReviewPrompt(analysisResult, reviewConfig);

console.log(prompt.system); // 系统提示词
console.log(prompt.user);   // 用户提示词

// 验证提示词长度
const isValid = builder.validatePromptLength(prompt.user, 4000);

// 如果太长，进行截断
if (!isValid) {
  const truncated = builder.truncatePrompt(prompt.user, 4000);
}
```

#### 提示词结构

生成的提示词包含以下部分：

1. **系统提示词**
   - 角色定义
   - 审查关注点
   - 输出格式要求

2. **用户提示词**
   - 提交信息（哈希、消息、作者等）
   - 代码变更（格式化的 diff）
   - 审查要求

#### 自定义提示词模板

```typescript
const config: ReviewConfig = {
  // ... 其他配置
  promptTemplate: `你是一个专业的代码审查助手。
请特别关注以下方面：
- 安全漏洞
- 性能问题
- 代码规范

请以 JSON 格式返回审查结果。`,
};

const prompt = builder.buildReviewPrompt(analysis, config);
```

## 环境变量配置

在 `.env` 文件中配置以下变量：

```bash
# AI 提供商（openai、claude、gemini）
AI_PROVIDER=openai

# AI 模型名称
AI_MODEL=gpt-4

# API 密钥
AI_API_KEY=your_api_key_here

# API 基础 URL（可选）
AI_API_BASE_URL=https://api.openai.com/v1

# 温度参数（0.0-1.0）
AI_TEMPERATURE=0.3

# 最大 token 数
AI_MAX_TOKENS=4000

# 超时时间（毫秒）
AI_TIMEOUT=60000
```

## 集成到审查流程

```typescript
import { createAIReviewer } from '@/lib/services/ai-reviewer';

const aiReviewer = createAIReviewer();

// 执行代码审查
const reviewResult = await aiReviewer.review(analysisResult, reviewConfig);

console.log('审查结果:', reviewResult);
console.log('发现问题数:', reviewResult.summary.total);
console.log('严重问题:', reviewResult.summary.critical);
console.log('处理时间:', reviewResult.processingTimeMs, 'ms');
```

## 最佳实践

### 1. 错误处理

始终捕获和处理 AI 客户端错误：

```typescript
try {
  const result = await aiReviewer.review(analysis, config);
} catch (error) {
  if (error instanceof AIReviewerError) {
    if (error.retryable) {
      // 可以重试
      logger.warn('AI 审查失败，将重试', { error: error.message });
    } else {
      // 不可重试的错误
      logger.error('AI 审查失败', { error: error.message });
    }
  }
}
```

### 2. 提示词优化

- 保持提示词简洁明确
- 使用具体的审查关注点
- 定期验证 AI 响应质量
- 根据反馈调整提示词模板

### 3. 性能优化

- 对大型差异使用批量审查
- 设置合理的超时时间
- 监控 token 使用量
- 使用缓存减少重复调用

### 4. 成本控制

- 选择合适的模型（GPT-3.5 vs GPT-4）
- 控制 maxTokens 参数
- 过滤非代码文件
- 实施速率限制

## 故障排查

### 问题：API 调用超时

**解决方案**：
1. 增加 `AI_TIMEOUT` 环境变量
2. 检查网络连接
3. 考虑使用批量审查

### 问题：响应解析失败

**解决方案**：
1. 检查提示词模板是否明确要求 JSON 格式
2. 查看日志中的原始响应
3. 调整温度参数（降低随机性）

### 问题：速率限制

**解决方案**：
1. 实施请求队列
2. 增加重试延迟
3. 升级 API 套餐

## 扩展支持

### 添加新的 AI 提供商

1. 在 `client.ts` 中创建新的客户端类：

```typescript
class NewProviderClient implements IAIClient {
  async complete(request: AIRequest): Promise<AIResponse> {
    // 实现 API 调用逻辑
  }

  async healthCheck(): Promise<boolean> {
    // 实现健康检查
  }
}
```

2. 在 `AIClientFactory.create()` 中添加新的 case：

```typescript
case 'new-provider':
  return new NewProviderClient(config);
```

3. 更新类型定义：

```typescript
// types/ai.ts
export type AIProvider = 'openai' | 'claude' | 'gemini' | 'new-provider';
```

## 相关文档

- [AI Reviewer 服务](../services/ai-reviewer.ts)
- [类型定义](../../types/ai.ts)
- [设计文档](../../.kiro/specs/ai-code-review-system/design.md)
