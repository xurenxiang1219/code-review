# 监控和告警系统

AI 代码审查系统的监控和告警功能提供了全面的系统健康监控、性能指标收集和智能告警通知。

## 功能概述

### 核心功能

- **实时监控**: 收集系统关键指标，包括处理时间、成功率、错误率等
- **智能告警**: 基于规则的告警系统，支持多种通知渠道
- **可视化仪表板**: 直观展示系统状态和性能趋势
- **历史数据**: 保存监控数据用于趋势分析和问题排查

### 监控指标

#### 系统指标
- 内存使用情况
- CPU 使用率
- 进程运行时间
- 事件循环延迟

#### 业务指标
- 审查总数和成功率
- 平均处理时间
- 问题分布统计
- 队列长度和并发数

#### 性能指标
- AI API 调用统计
- 数据库查询性能
- Redis 连接状态
- 网络请求延迟

## 快速开始

### 1. 启动监控服务

```bash
# 启动完整监控服务
./scripts/start-monitoring.sh start

# 检查服务状态
./scripts/start-monitoring.sh status

# 执行健康检查
./scripts/start-monitoring.sh health
```

### 2. 访问监控界面

- 监控仪表板: http://localhost:3000/monitoring
- 告警管理: http://localhost:3000/monitoring/alerts

### 3. API 接口

```bash
# 获取仪表板数据
curl http://localhost:3000/api/monitoring?type=dashboard

# 获取系统健康状态
curl http://localhost:3000/api/monitoring?type=health

# 获取时间序列数据
curl "http://localhost:3000/api/monitoring?type=metrics&metricName=review_processing_time&timeRange=3600000"

# 获取活跃告警
curl http://localhost:3000/api/monitoring/alerts?type=active
```

## 配置说明

### 环境变量

```bash
# 监控配置
METRICS_COLLECT_INTERVAL=30000          # 指标收集间隔（毫秒）
METRICS_RETENTION_HOURS=24              # 指标保留时间（小时）
ALERT_CHECK_INTERVAL=30000              # 告警检查间隔（毫秒）
MAX_METRICS_PER_NAME=1000               # 每个指标的最大数据点数

# 告警通知配置
ADMIN_EMAIL=admin@example.com           # 管理员邮箱
SLACK_WEBHOOK_URL=https://hooks.slack.com/...  # Slack Webhook
ALERT_WEBHOOK_URL=https://your-webhook.com     # 自定义 Webhook

# 系统监控开关
ENABLE_SYSTEM_METRICS=true              # 启用系统指标收集
ENABLE_BUSINESS_METRICS=true            # 启用业务指标收集
ENABLE_PERFORMANCE_METRICS=true         # 启用性能指标收集
```

### 告警规则配置

系统预置了以下默认告警规则：

```typescript
// 高错误率告警
{
  name: 'high_error_rate',
  metricName: 'review_error_rate',
  condition: 'gt',
  threshold: 5, // 5%
  duration: 300000, // 5分钟
  severity: 'warning',
  message: '审查错误率过高: {value}% (阈值: {threshold}%)',
}

// 处理时间过长告警
{
  name: 'long_processing_time',
  metricName: 'avg_processing_time',
  condition: 'gt',
  threshold: 300000, // 5分钟
  duration: 600000, // 10分钟
  severity: 'warning',
  message: '平均处理时间过长: {value}ms (阈值: {threshold}ms)',
}

// 队列积压告警
{
  name: 'queue_backlog',
  metricName: 'review_queue_length',
  condition: 'gt',
  threshold: 20,
  duration: 300000, // 5分钟
  severity: 'warning',
  message: '审查队列积压: {value} 个任务 (阈值: {threshold})',
}
```

## 使用指南

### 监控仪表板

仪表板提供以下信息：

1. **系统健康状态**: 整体状态、运行时间、版本信息
2. **系统概览**: 总请求数、成功率、处理时间、并发数、队列长度
3. **性能指标**: AI API、数据库、Redis 的详细统计
4. **业务指标**: 审查统计和问题分布
5. **告警状态**: 活跃告警数量和严重程度分布

### 告警管理

告警管理界面包含三个标签页：

#### 活跃告警
- 显示当前触发的所有告警
- 支持静默操作（5分钟或1小时）
- 显示告警详细信息和触发条件

#### 告警历史
- 查看历史告警记录
- 显示通知发送状态
- 包含错误信息和重试次数

#### 统计信息
- 按严重程度统计告警数量
- 按规则统计告警频率
- 总体告警统计

### 自定义指标

可以通过 API 记录自定义指标：

```typescript
// 记录计数器
await monitoring.incrementCounter('custom_counter', 1, { 
  service: 'my-service' 
});

// 记录仪表盘值
await monitoring.setGauge('custom_gauge', 42, { 
  component: 'my-component' 
});

// 记录直方图
await monitoring.recordHistogram('custom_histogram', 123);

// 使用计时器
const timer = monitoring.timer('operation_duration');
// ... 执行操作
await timer.end();
```

### 自定义告警规则

通过 API 添加自定义告警规则：

```bash
curl -X POST http://localhost:3000/api/monitoring/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom_rule",
    "metricName": "custom_metric",
    "condition": "gt",
    "threshold": 100,
    "duration": 300000,
    "severity": "warning",
    "message": "自定义指标异常: {value} > {threshold}",
    "enabled": true
  }'
```

## 故障排查

### 常见问题

#### 1. 监控服务无法启动

**症状**: 执行启动脚本时报错

**解决方案**:
```bash
# 检查环境变量
cat .env

# 检查 Redis 服务
redis-cli ping

# 检查数据库连接
tsx scripts/health-check.js database

# 查看详细日志
tail -f /tmp/ai-review-monitoring/*.log
```

#### 2. 指标数据缺失

**症状**: 仪表板显示数据为空或过时

**解决方案**:
```bash
# 检查指标收集器状态
./scripts/start-monitoring.sh status

# 手动触发指标收集
tsx scripts/init-monitoring.ts

# 检查 Redis 连接
redis-cli ping
```

#### 3. 告警未触发

**症状**: 满足条件但未收到告警通知

**解决方案**:
```bash
# 检查告警规则配置
curl http://localhost:3000/api/monitoring/rules

# 检查告警管理器状态
curl http://localhost:3000/api/monitoring/alerts?type=stats

# 验证通知配置
echo $ADMIN_EMAIL
echo $SLACK_WEBHOOK_URL
```

#### 4. 性能问题

**症状**: 监控系统占用过多资源

**解决方案**:
```bash
# 调整收集间隔
export METRICS_COLLECT_INTERVAL=60000  # 增加到1分钟

# 减少指标保留时间
export METRICS_RETENTION_HOURS=12     # 减少到12小时

# 限制指标数量
export MAX_METRICS_PER_NAME=500       # 减少到500个数据点
```

### 日志文件位置

- 指标收集器: `/tmp/ai-review-monitoring/metrics-collector.log`
- 告警管理器: `/tmp/ai-review-monitoring/alert-manager.log`
- 应用日志: `logs/combined.log`

### 监控数据存储

- **内存**: 最近的指标数据缓存在内存中
- **Redis**: 持久化存储指标数据和告警状态
- **MySQL**: 存储审查统计和历史数据

## 最佳实践

### 1. 告警规则设计

- **避免告警风暴**: 设置合理的持续时间和静默期
- **分级告警**: 根据严重程度设置不同的通知渠道
- **业务相关**: 告警规则应与业务目标对齐

### 2. 指标收集

- **适度收集**: 避免收集过多无用指标
- **标签使用**: 合理使用标签进行指标分类
- **性能考虑**: 监控系统本身不应影响主业务性能

### 3. 数据保留

- **分层存储**: 短期数据高精度，长期数据低精度
- **定期清理**: 及时清理过期数据释放存储空间
- **备份策略**: 重要监控数据应有备份机制

### 4. 告警处理

- **及时响应**: 建立告警响应流程和责任人
- **根因分析**: 记录告警处理过程和解决方案
- **持续优化**: 根据告警历史优化规则和阈值

## 扩展开发

### 添加新指标

1. 在业务代码中记录指标：
```typescript
import { monitoring } from '@/lib/utils/monitoring';

// 在关键业务逻辑中记录指标
await monitoring.recordMetric('new_business_metric', value, 'gauge');
```

2. 在指标收集器中添加自动收集：
```typescript
// 在 MetricsCollector 中添加新的收集逻辑
private async collectNewMetrics(): Promise<void> {
  const newMetricValue = await getNewMetricValue();
  await monitoring.setGauge('new_metric', newMetricValue);
}
```

### 添加新告警通道

1. 扩展 AlertChannelConfig 类型
2. 在 AlertManager 中实现新的发送方法
3. 更新告警策略配置

### 自定义仪表板

1. 创建新的 React 组件
2. 调用监控 API 获取数据
3. 添加到路由配置中

## 参考资料

- [监控系统架构设计](./ARCHITECTURE.md)
- [API 接口文档](./API.md)
- [部署指南](./DEPLOYMENT.md)