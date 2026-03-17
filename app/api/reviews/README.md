# Reviews API 文档

## 概述

Reviews API 提供审查记录的查询功能，支持列表查询和详情查询。

## 端点

### 1. 查询审查列表

**端点**: `GET /api/reviews`

**功能**: 查询审查记录列表，支持分页、过滤和排序

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| branch | string | 否 | 分支名称 | `uat` |
| repository | string | 否 | 仓库名称 | `my-repo` |
| author | string | 否 | 作者邮箱 | `john@example.com` |
| status | string | 否 | 审查状态 | `completed` |
| from | string | 否 | 开始时间 (ISO 8601) | `2024-01-01T00:00:00Z` |
| to | string | 否 | 结束时间 (ISO 8601) | `2024-01-31T23:59:59Z` |
| page | number | 否 | 页码 (默认: 1) | `1` |
| pageSize | number | 否 | 每页大小 (默认: 20, 最大: 100) | `20` |

**状态值**:
- `pending`: 待处理
- `processing`: 处理中
- `completed`: 已完成
- `failed`: 失败

**请求示例**:

```bash
# 查询所有审查记录
GET /api/reviews

# 按分支过滤
GET /api/reviews?branch=uat

# 按状态过滤
GET /api/reviews?status=completed

# 组合过滤
GET /api/reviews?branch=uat&status=completed&page=1&pageSize=20

# 时间范围查询
GET /api/reviews?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z
```

**响应示例**:

```json
{
  "code": 0,
  "msg": "查询成功",
  "data": {
    "items": [
      {
        "id": "review-uuid",
        "commit_hash": "abc123",
        "branch": "uat",
        "repository": "my-repo",
        "author_name": "John Doe",
        "author_email": "john@example.com",
        "files_changed": 5,
        "lines_added": 100,
        "lines_deleted": 50,
        "total_issues": 10,
        "critical_count": 2,
        "major_count": 3,
        "minor_count": 3,
        "suggestion_count": 2,
        "status": "completed",
        "started_at": "2024-01-01T00:00:00Z",
        "completed_at": "2024-01-01T00:05:00Z",
        "processing_time_ms": 300000,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:05:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  },
  "timestamp": 1234567890,
  "requestId": "uuid"
}
```
