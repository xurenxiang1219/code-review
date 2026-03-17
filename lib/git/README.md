# Git 集成层

## 概述

Git 集成层负责与 Git 仓库进行交互，包括获取提交信息、解析代码差异、发布审查评论等功能。

## 组件

### Git 客户端 (client.ts)
- 封装 Git API 调用
- 支持 GitHub、GitLab 等平台
- 提供提交信息获取、差异获取、评论发布等功能

### Diff 解析器 (diff-parser.ts)
- 解析 Git diff 格式
- 提取文件变更信息
- 识别编程语言类型
- 过滤代码文件
- 拆分大型差异为批次
- 提取代码上下文

## 主要功能

1. **Diff 解析**: 解析标准 Git diff 格式，提取文件变更信息
2. **语言识别**: 根据文件扩展名自动识别编程语言
3. **文件过滤**: 过滤掉二进制文件和非代码文件
4. **批次拆分**: 将大型差异拆分为多个批次，便于 AI 审查
5. **上下文提取**: 提取指定行周围的代码上下文

## 使用示例

```typescript
import { DiffParser } from './diff-parser';

const parser = new DiffParser();

// 解析 diff 文本
const diffInfo = parser.parseDiff(diffText, commitHash);

// 过滤代码文件
const codeFiles = parser.filterCodeFiles(diffInfo.files);

// 拆分大型差异
const batches = parser.splitDiff(diffInfo, 5000);

// 提取代码上下文
const context = parser.extractContext(patch, lineNumber, 5);
```