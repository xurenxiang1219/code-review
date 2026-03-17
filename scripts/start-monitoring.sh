#!/bin/bash

# 监控服务启动脚本
# 
# 功能：
# - 启动监控系统
# - 启动指标收集器
# - 启动告警管理器
# - 健康检查

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查环境变量
check_env() {
    log_info "检查环境变量..."
    
    local required_vars=(
        "DATABASE_URL"
        "REDIS_URL"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "缺少必要的环境变量: ${missing_vars[*]}"
        log_error "请检查 .env 文件或环境配置"
        exit 1
    fi
    
    log_success "环境变量检查通过"
}

# 检查依赖服务
check_dependencies() {
    log_info "检查依赖服务..."
    
    # 检查 Redis
    if ! redis-cli ping > /dev/null 2>&1; then
        log_warning "Redis 服务未运行，尝试启动..."
        if command -v redis-server > /dev/null; then
            redis-server --daemonize yes
            sleep 2
            if redis-cli ping > /dev/null 2>&1; then
                log_success "Redis 服务已启动"
            else
                log_error "Redis 服务启动失败"
                exit 1
            fi
        else
            log_error "Redis 未安装或不在 PATH 中"
            exit 1
        fi
    else
        log_success "Redis 服务正常运行"
    fi
    
    # 检查数据库连接（简化检查）
    log_info "检查数据库连接..."
    if tsx scripts/health-check.js database > /dev/null 2>&1; then
        log_success "数据库连接正常"
    else
        log_error "数据库连接失败"
        exit 1
    fi
}

# 初始化监控系统
init_monitoring() {
    log_info "初始化监控系统..."
    
    if tsx scripts/init-monitoring.ts init; then
        log_success "监控系统初始化完成"
    else
        log_error "监控系统初始化失败"
        exit 1
    fi
}

# 启动监控服务
start_monitoring() {
    log_info "启动监控服务..."
    
    # 创建 PID 文件目录
    mkdir -p /tmp/ai-review-monitoring
    
    # 启动指标收集器
    log_info "启动指标收集器..."
    nohup tsx scripts/metrics-collector.ts > /tmp/ai-review-monitoring/metrics-collector.log 2>&1 &
    echo $! > /tmp/ai-review-monitoring/metrics-collector.pid
    log_success "指标收集器已启动 (PID: $!)"
    
    # 启动告警管理器
    log_info "启动告警管理器..."
    nohup tsx scripts/alert-manager.ts > /tmp/ai-review-monitoring/alert-manager.log 2>&1 &
    echo $! > /tmp/ai-review-monitoring/alert-manager.pid
    log_success "告警管理器已启动 (PID: $!)"
    
    # 等待服务启动
    sleep 3
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    local health_ok=true
    
    # 检查指标收集器
    if [[ -f /tmp/ai-review-monitoring/metrics-collector.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/metrics-collector.pid)
        if kill -0 "$pid" 2>/dev/null; then
            log_success "指标收集器运行正常 (PID: $pid)"
        else
            log_error "指标收集器未运行"
            health_ok=false
        fi
    else
        log_error "指标收集器 PID 文件不存在"
        health_ok=false
    fi
    
    # 检查告警管理器
    if [[ -f /tmp/ai-review-monitoring/alert-manager.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/alert-manager.pid)
        if kill -0 "$pid" 2>/dev/null; then
            log_success "告警管理器运行正常 (PID: $pid)"
        else
            log_error "告警管理器未运行"
            health_ok=false
        fi
    else
        log_error "告警管理器 PID 文件不存在"
        health_ok=false
    fi
    
    # 检查监控 API
    if curl -s http://localhost:3000/api/monitoring?type=health > /dev/null; then
        log_success "监控 API 响应正常"
    else
        log_warning "监控 API 无响应（可能 Next.js 服务未启动）"
    fi
    
    if [[ "$health_ok" == true ]]; then
        log_success "所有监控服务运行正常"
        return 0
    else
        log_error "部分监控服务异常"
        return 1
    fi
}

# 停止监控服务
stop_monitoring() {
    log_info "停止监控服务..."
    
    # 停止指标收集器
    if [[ -f /tmp/ai-review-monitoring/metrics-collector.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/metrics-collector.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            log_success "指标收集器已停止"
        fi
        rm -f /tmp/ai-review-monitoring/metrics-collector.pid
    fi
    
    # 停止告警管理器
    if [[ -f /tmp/ai-review-monitoring/alert-manager.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/alert-manager.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            log_success "告警管理器已停止"
        fi
        rm -f /tmp/ai-review-monitoring/alert-manager.pid
    fi
    
    # 清理监控系统
    tsx scripts/init-monitoring.ts cleanup
    
    log_success "监控服务已停止"
}

# 显示状态
show_status() {
    log_info "监控服务状态:"
    
    # 指标收集器状态
    if [[ -f /tmp/ai-review-monitoring/metrics-collector.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/metrics-collector.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "  指标收集器: 运行中 (PID: $pid)"
        else
            echo "  指标收集器: 已停止"
        fi
    else
        echo "  指标收集器: 未启动"
    fi
    
    # 告警管理器状态
    if [[ -f /tmp/ai-review-monitoring/alert-manager.pid ]]; then
        local pid=$(cat /tmp/ai-review-monitoring/alert-manager.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "  告警管理器: 运行中 (PID: $pid)"
        else
            echo "  告警管理器: 已停止"
        fi
    else
        echo "  告警管理器: 未启动"
    fi
    
    # 显示监控统计
    if tsx scripts/init-monitoring.ts status 2>/dev/null; then
        echo ""
    else
        log_warning "无法获取监控统计信息"
    fi
}

# 主函数
main() {
    local command="${1:-start}"
    
    case "$command" in
        start)
            log_info "启动 AI 代码审查系统监控服务..."
            check_env
            check_dependencies
            init_monitoring
            start_monitoring
            health_check
            log_success "监控服务启动完成！"
            ;;
        stop)
            stop_monitoring
            ;;
        restart)
            stop_monitoring
            sleep 2
            main start
            ;;
        status)
            show_status
            ;;
        health)
            health_check
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|health}"
            echo ""
            echo "命令说明:"
            echo "  start   - 启动监控服务"
            echo "  stop    - 停止监控服务"
            echo "  restart - 重启监控服务"
            echo "  status  - 显示服务状态"
            echo "  health  - 执行健康检查"
            exit 1
            ;;
    esac
}

# 信号处理
trap 'log_info "收到中断信号，正在停止监控服务..."; stop_monitoring; exit 0' INT TERM

# 运行主函数
main "$@"