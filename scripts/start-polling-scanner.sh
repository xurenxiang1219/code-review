#!/bin/bash

# AI 代码审查系统 - Polling Scanner 启动脚本
# 支持优雅关闭、错误恢复和进程监控

set -euo pipefail

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SCANNER_SCRIPT="$SCRIPT_DIR/polling-scanner.ts"
PID_FILE="$PROJECT_ROOT/logs/polling-scanner.pid"
LOG_FILE="$PROJECT_ROOT/logs/polling-scanner.log"
ERROR_LOG_FILE="$PROJECT_ROOT/logs/polling-scanner.error.log"

# 环境变量默认值
export NODE_ENV="${NODE_ENV:-production}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export POLLING_DEFAULT_INTERVAL="${POLLING_DEFAULT_INTERVAL:-300}"
export POLLING_DEFAULT_BRANCH="${POLLING_DEFAULT_BRANCH:-uat}"
export POLLING_SHUTDOWN_TIMEOUT="${POLLING_SHUTDOWN_TIMEOUT:-30000}"
export POLLING_HEALTH_CHECK_INTERVAL="${POLLING_HEALTH_CHECK_INTERVAL:-60000}"
export POLLING_ENABLE_METRICS="${POLLING_ENABLE_METRICS:-true}"
export POLLING_MAX_CONCURRENT="${POLLING_MAX_CONCURRENT:-10}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_debug() {
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
    fi
}
# 创建必要的目录
create_directories() {
    log_debug "创建必要的目录"
    mkdir -p "$(dirname "$PID_FILE")"
    mkdir -p "$(dirname "$LOG_FILE")"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    # 检查 tsx
    if ! command -v tsx &> /dev/null; then
        log_error "tsx 未安装，请运行: npm install -g tsx"
        exit 1
    fi
    
    # 检查 Scanner 脚本
    if [[ ! -f "$SCANNER_SCRIPT" ]]; then
        log_error "Scanner 脚本不存在: $SCANNER_SCRIPT"
        exit 1
    fi
    
    # 检查环境变量
    local required_vars=("DATABASE_URL" "REDIS_URL")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "必需的环境变量未设置: $var"
            exit 1
        fi
    done
    
    # 检查轮询配置
    if [[ -z "${POLLING_REPOSITORIES:-}" && -z "${GIT_REPOSITORY:-}" ]]; then
        log_error "必须设置 POLLING_REPOSITORIES 或 GIT_REPOSITORY 环境变量"
        exit 1
    fi
    
    log_info "依赖检查通过"
}

# 检查 Scanner 是否正在运行
is_scanner_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            log_warn "PID 文件存在但进程不存在，清理 PID 文件"
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# 获取 Scanner PID
get_scanner_pid() {
    if [[ -f "$PID_FILE" ]]; then
        cat "$PID_FILE"
    else
        echo ""
    fi
}

# 启动 Scanner
start_scanner() {
    log_info "启动 Polling Scanner..."
    
    if is_scanner_running; then
        local pid=$(get_scanner_pid)
        log_warn "Scanner 已在运行 (PID: $pid)"
        return 0
    fi
    
    # 切换到项目根目录
    cd "$PROJECT_ROOT"
    
    # 启动 Scanner 进程
    log_debug "执行命令: tsx $SCANNER_SCRIPT"
    nohup tsx "$SCANNER_SCRIPT" >> "$LOG_FILE" 2>> "$ERROR_LOG_FILE" &
    local pid=$!
    
    # 保存 PID
    echo "$pid" > "$PID_FILE"
    
    # 等待进程启动
    sleep 3
    
    if kill -0 "$pid" 2>/dev/null; then
        log_info "Scanner 启动成功 (PID: $pid)"
        log_info "日志文件: $LOG_FILE"
        log_info "错误日志: $ERROR_LOG_FILE"
        return 0
    else
        log_error "Scanner 启动失败"
        rm -f "$PID_FILE"
        return 1
    fi
}
# 停止 Scanner
stop_scanner() {
    log_info "停止 Polling Scanner..."
    
    if ! is_scanner_running; then
        log_warn "Scanner 未运行"
        return 0
    fi
    
    local pid=$(get_scanner_pid)
    log_info "发送 SIGTERM 信号到进程 $pid"
    
    # 发送 SIGTERM 信号进行优雅关闭
    if kill -TERM "$pid" 2>/dev/null; then
        log_info "等待进程优雅关闭..."
        
        # 等待最多 35 秒（比 Scanner 的优雅关闭超时时间多 5 秒）
        local timeout=35
        local count=0
        
        while kill -0 "$pid" 2>/dev/null && [[ $count -lt $timeout ]]; do
            sleep 1
            ((count++))
            if [[ $((count % 5)) -eq 0 ]]; then
                log_debug "等待进程关闭... ($count/$timeout 秒)"
            fi
        done
        
        if kill -0 "$pid" 2>/dev/null; then
            log_warn "优雅关闭超时，强制终止进程"
            kill -KILL "$pid" 2>/dev/null || true
            sleep 1
        fi
        
        if ! kill -0 "$pid" 2>/dev/null; then
            log_info "Scanner 已停止"
            rm -f "$PID_FILE"
            return 0
        else
            log_error "无法停止 Scanner 进程"
            return 1
        fi
    else
        log_error "无法发送信号到进程 $pid"
        return 1
    fi
}

# 重启 Scanner
restart_scanner() {
    log_info "重启 Polling Scanner..."
    stop_scanner
    sleep 2
    start_scanner
}

# 查看 Scanner 状态
status_scanner() {
    if is_scanner_running; then
        local pid=$(get_scanner_pid)
        log_info "Scanner 正在运行 (PID: $pid)"
        
        # 显示进程信息
        if command -v ps &> /dev/null; then
            echo ""
            echo "进程信息:"
            ps -p "$pid" -o pid,ppid,cmd,etime,pcpu,pmem 2>/dev/null || true
        fi
        
        # 显示最近的日志
        if [[ -f "$LOG_FILE" ]]; then
            echo ""
            echo "最近的日志 (最后 10 行):"
            tail -n 10 "$LOG_FILE" 2>/dev/null || true
        fi
        
        return 0
    else
        log_warn "Scanner 未运行"
        return 1
    fi
}

# 查看日志
logs_scanner() {
    local lines="${1:-50}"
    
    if [[ -f "$LOG_FILE" ]]; then
        log_info "显示最近 $lines 行日志:"
        tail -n "$lines" "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# 跟踪日志
follow_logs() {
    if [[ -f "$LOG_FILE" ]]; then
        log_info "跟踪日志 (Ctrl+C 退出):"
        tail -f "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
        return 1
    fi
}
# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    if ! is_scanner_running; then
        log_error "Scanner 未运行"
        return 1
    fi
    
    local pid=$(get_scanner_pid)
    log_info "Scanner 进程运行中 (PID: $pid)"
    
    # 检查进程资源使用
    if command -v ps &> /dev/null; then
        local mem_usage=$(ps -p "$pid" -o pmem --no-headers 2>/dev/null | tr -d ' ' || echo "0")
        local cpu_usage=$(ps -p "$pid" -o pcpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")
        
        log_info "内存使用: ${mem_usage}%"
        log_info "CPU 使用: ${cpu_usage}%"
        
        # 内存使用警告
        if (( $(echo "$mem_usage > 70" | bc -l 2>/dev/null || echo 0) )); then
            log_warn "内存使用过高: ${mem_usage}%"
        fi
    fi
    
    # 检查日志中的错误
    if [[ -f "$ERROR_LOG_FILE" ]]; then
        local error_count=$(wc -l < "$ERROR_LOG_FILE" 2>/dev/null || echo 0)
        if [[ $error_count -gt 0 ]]; then
            log_warn "发现 $error_count 行错误日志"
            echo "最近的错误:"
            tail -n 5 "$ERROR_LOG_FILE" 2>/dev/null || true
        fi
    fi
    
    # 检查扫描器是否正常工作（检查日志更新时间）
    if [[ -f "$LOG_FILE" ]]; then
        local log_age=$(($(date +%s) - $(stat -c %Y "$LOG_FILE" 2>/dev/null || echo 0)))
        if [[ $log_age -gt 600 ]]; then  # 10分钟无日志更新
            log_warn "日志长时间未更新: ${log_age}秒"
        fi
    fi
    
    log_info "健康检查完成"
    return 0
}

# 清理日志
cleanup_logs() {
    local days="${1:-7}"
    log_info "清理 $days 天前的日志..."
    
    # 清理旧的日志文件
    find "$(dirname "$LOG_FILE")" -name "*polling-scanner*.log*" -type f -mtime +$days -delete 2>/dev/null || true
    
    # 截断当前日志文件（保留最后 10000 行）
    if [[ -f "$LOG_FILE" ]]; then
        local temp_file=$(mktemp)
        tail -n 10000 "$LOG_FILE" > "$temp_file" && mv "$temp_file" "$LOG_FILE"
    fi
    
    if [[ -f "$ERROR_LOG_FILE" ]]; then
        local temp_file=$(mktemp)
        tail -n 1000 "$ERROR_LOG_FILE" > "$temp_file" && mv "$temp_file" "$ERROR_LOG_FILE"
    fi
    
    log_info "日志清理完成"
}

# 显示配置信息
show_config() {
    cat << EOF
当前配置:
    仓库列表: ${POLLING_REPOSITORIES:-${GIT_REPOSITORY:-"未设置"}}
    默认分支: $POLLING_DEFAULT_BRANCH
    默认扫描间隔: $POLLING_DEFAULT_INTERVAL 秒
    最大并发扫描器: $POLLING_MAX_CONCURRENT
    启用指标记录: $POLLING_ENABLE_METRICS
    日志级别: $LOG_LEVEL
    
文件位置:
    PID 文件: $PID_FILE
    日志文件: $LOG_FILE
    错误日志: $ERROR_LOG_FILE
EOF
}
# 显示帮助信息
show_help() {
    cat << EOF
AI 代码审查系统 - Polling Scanner 管理脚本

用法: $0 <命令> [选项]

命令:
    start           启动 Scanner
    stop            停止 Scanner
    restart         重启 Scanner
    status          查看 Scanner 状态
    logs [行数]     查看日志 (默认 50 行)
    follow          跟踪日志输出
    health          执行健康检查
    cleanup [天数]  清理日志 (默认 7 天)
    config          显示当前配置
    help            显示此帮助信息

环境变量:
    POLLING_REPOSITORIES            仓库列表，逗号分隔 (如: owner1/repo1,owner2/repo2)
    GIT_REPOSITORY                  单个仓库 (当 POLLING_REPOSITORIES 未设置时使用)
    POLLING_DEFAULT_BRANCH          默认分支 (默认: uat)
    POLLING_DEFAULT_INTERVAL        默认扫描间隔秒数 (默认: 300)
    POLLING_SHUTDOWN_TIMEOUT        关闭超时毫秒 (默认: 30000)
    POLLING_HEALTH_CHECK_INTERVAL   健康检查间隔毫秒 (默认: 60000)
    POLLING_ENABLE_METRICS          启用指标记录 (默认: true)
    POLLING_MAX_CONCURRENT          最大并发扫描器数 (默认: 10)

仓库特定配置 (以 owner_repo 格式):
    POLLING_OWNER_REPO_BRANCH       特定仓库的分支
    POLLING_OWNER_REPO_INTERVAL     特定仓库的扫描间隔
    POLLING_OWNER_REPO_ENABLED      是否启用特定仓库扫描
    POLLING_OWNER_REPO_AUTO_ENQUEUE 是否自动加入队列
    POLLING_OWNER_REPO_MAX_COMMITS  每次扫描最大提交数

示例:
    $0 start                        # 启动 Scanner
    $0 logs 100                     # 查看最近 100 行日志
    $0 cleanup 3                    # 清理 3 天前的日志
    $0 config                       # 显示当前配置

    # 多仓库配置示例:
    export POLLING_REPOSITORIES="myorg/repo1,myorg/repo2"
    export POLLING_MYORG_REPO1_INTERVAL=180
    export POLLING_MYORG_REPO2_BRANCH=main
    $0 start

EOF
}

# 主函数
main() {
    local command="${1:-help}"
    
    case "$command" in
        start)
            create_directories
            check_dependencies
            start_scanner
            ;;
        stop)
            stop_scanner
            ;;
        restart)
            create_directories
            check_dependencies
            restart_scanner
            ;;
        status)
            status_scanner
            ;;
        logs)
            logs_scanner "${2:-50}"
            ;;
        follow)
            follow_logs
            ;;
        health)
            health_check
            ;;
        cleanup)
            cleanup_logs "${2:-7}"
            ;;
        config)
            show_config
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"