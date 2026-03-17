#!/bin/bash

# AI 代码审查系统 - Worker 进程监控脚本
# 监控 Worker 进程状态，在异常时自动重启

set -euo pipefail

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WORKER_SCRIPT="$SCRIPT_DIR/start-worker.sh"
MONITOR_LOG="$PROJECT_ROOT/logs/monitor.log"
MONITOR_PID_FILE="$PROJECT_ROOT/logs/monitor.pid"

# 监控配置
CHECK_INTERVAL="${MONITOR_CHECK_INTERVAL:-30}"  # 检查间隔（秒）
MAX_RESTART_ATTEMPTS="${MONITOR_MAX_RESTART_ATTEMPTS:-5}"  # 最大重启尝试次数
RESTART_WINDOW="${MONITOR_RESTART_WINDOW:-300}"  # 重启窗口期（秒）
MEMORY_THRESHOLD="${MONITOR_MEMORY_THRESHOLD:-80}"  # 内存使用阈值（百分比）
CPU_THRESHOLD="${MONITOR_CPU_THRESHOLD:-90}"  # CPU 使用阈值（百分比）
ERROR_LOG_THRESHOLD="${MONITOR_ERROR_LOG_THRESHOLD:-50}"  # 错误日志行数阈值

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 全局变量
RESTART_ATTEMPTS=0
RESTART_WINDOW_START=0
MONITOR_RUNNING=true

# 日志函数
log_monitor() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""
    
    case "$level" in
        INFO) color="$GREEN" ;;
        WARN) color="$YELLOW" ;;
        ERROR) color="$RED" ;;
        DEBUG) color="$BLUE" ;;
    esac
    
    echo -e "${color}[$level]${NC} $timestamp $message" | tee -a "$MONITOR_LOG"
}

# 创建必要目录
create_directories() {
    mkdir -p "$(dirname "$MONITOR_LOG")"
    mkdir -p "$(dirname "$MONITOR_PID_FILE")"
}

# 检查监控器是否已运行
is_monitor_running() {
    if [[ -f "$MONITOR_PID_FILE" ]]; then
        local pid=$(cat "$MONITOR_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            rm -f "$MONITOR_PID_FILE"
        fi
    fi
    return 1
}

# 检查 Worker 是否健康
check_worker_health() {
    local health_status="healthy"
    local issues=()
    
    # 检查进程是否运行
    if ! "$WORKER_SCRIPT" status >/dev/null 2>&1; then
        health_status="unhealthy"
        issues+=("进程未运行")
        return 1
    fi
    
    # 获取 Worker PID
    local worker_pid_file="$PROJECT_ROOT/logs/worker.pid"
    if [[ ! -f "$worker_pid_file" ]]; then
        health_status="unhealthy"
        issues+=("PID文件不存在")
        return 1
    fi
    
    local worker_pid=$(cat "$worker_pid_file")
    
    # 检查内存使用
    if command -v ps >/dev/null 2>&1; then
        local mem_usage=$(ps -p "$worker_pid" -o pmem --no-headers 2>/dev/null | tr -d ' ' || echo "0")
        if (( $(echo "$mem_usage > $MEMORY_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
            health_status="warning"
            issues+=("内存使用过高: ${mem_usage}%")
        fi
        
        # 检查 CPU 使用
        local cpu_usage=$(ps -p "$worker_pid" -o pcpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")
        if (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
            health_status="warning"
            issues+=("CPU使用过高: ${cpu_usage}%")
        fi
    fi
    
    # 检查错误日志
    local error_log_file="$PROJECT_ROOT/logs/worker.error.log"
    if [[ -f "$error_log_file" ]]; then
        local error_count=$(wc -l < "$error_log_file" 2>/dev/null || echo 0)
        if [[ $error_count -gt $ERROR_LOG_THRESHOLD ]]; then
            health_status="warning"
            issues+=("错误日志过多: $error_count 行")
        fi
    fi
    
    # 检查日志更新时间
    local log_file="$PROJECT_ROOT/logs/worker.log"
    if [[ -f "$log_file" ]]; then
        local log_age=$(($(date +%s) - $(stat -c %Y "$log_file" 2>/dev/null || echo 0)))
        if [[ $log_age -gt 300 ]]; then  # 5分钟无日志更新
            health_status="warning"
            issues+=("日志长时间未更新: ${log_age}秒")
        fi
    fi
    
    # 输出健康状态
    if [[ "$health_status" == "healthy" ]]; then
        log_monitor "DEBUG" "Worker 健康检查通过"
        return 0
    elif [[ "$health_status" == "warning" ]]; then
        log_monitor "WARN" "Worker 健康检查警告: ${issues[*]}"
        return 0
    else
        log_monitor "ERROR" "Worker 健康检查失败: ${issues[*]}"
        return 1
    fi
}

# 重启 Worker
restart_worker() {
    local current_time=$(date +%s)
    
    # 检查重启窗口期
    if [[ $RESTART_WINDOW_START -eq 0 ]]; then
        RESTART_WINDOW_START=$current_time
        RESTART_ATTEMPTS=0
    elif [[ $((current_time - RESTART_WINDOW_START)) -gt $RESTART_WINDOW ]]; then
        # 重置重启计数器
        RESTART_WINDOW_START=$current_time
        RESTART_ATTEMPTS=0
    fi
    
    # 检查重启次数限制
    if [[ $RESTART_ATTEMPTS -ge $MAX_RESTART_ATTEMPTS ]]; then
        log_monitor "ERROR" "重启次数超过限制 ($MAX_RESTART_ATTEMPTS 次)，停止监控"
        return 1
    fi
    
    RESTART_ATTEMPTS=$((RESTART_ATTEMPTS + 1))
    
    log_monitor "INFO" "尝试重启 Worker (第 $RESTART_ATTEMPTS 次)"
    
    if "$WORKER_SCRIPT" restart; then
        log_monitor "INFO" "Worker 重启成功"
        
        # 等待 Worker 启动
        sleep 10
        
        if check_worker_health; then
            log_monitor "INFO" "Worker 重启后健康检查通过"
            return 0
        else
            log_monitor "ERROR" "Worker 重启后健康检查失败"
            return 1
        fi
    else
        log_monitor "ERROR" "Worker 重启失败"
        return 1
    fi
}

# 清理旧日志
cleanup_logs() {
    local days="${1:-7}"
    
    # 清理监控日志
    if [[ -f "$MONITOR_LOG" ]]; then
        local temp_file=$(mktemp)
        tail -n 1000 "$MONITOR_LOG" > "$temp_file" && mv "$temp_file" "$MONITOR_LOG"
    fi
    
    # 清理 Worker 日志
    "$WORKER_SCRIPT" cleanup "$days" >/dev/null 2>&1 || true
}

# 发送告警通知
send_alert() {
    local level="$1"
    local message="$2"
    
    # 这里可以集成各种告警通道
    # 例如：邮件、Slack、钉钉、企业微信等
    
    log_monitor "$level" "告警: $message"
    
    # 示例：发送邮件告警（需要配置 sendmail 或其他邮件服务）
    if command -v mail >/dev/null 2>&1 && [[ -n "${ALERT_EMAIL:-}" ]]; then
        echo "AI 代码审查系统 Worker 告警: $message" | \
            mail -s "[$level] Worker 监控告警" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # 示例：发送到 Webhook（如 Slack）
    if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
        curl -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"[$level] AI 代码审查系统 Worker: $message\"}" \
            >/dev/null 2>&1 || true
    fi
}

# 监控循环
monitor_loop() {
    log_monitor "INFO" "开始监控 Worker 进程 (PID: $$, 检查间隔: ${CHECK_INTERVAL}秒)"
    
    local consecutive_failures=0
    local last_cleanup=$(date +%s)
    
    while $MONITOR_RUNNING; do
        # 执行健康检查
        if check_worker_health; then
            consecutive_failures=0
        else
            consecutive_failures=$((consecutive_failures + 1))
            
            log_monitor "WARN" "Worker 健康检查失败 (连续 $consecutive_failures 次)"
            
            # 连续失败 2 次后尝试重启
            if [[ $consecutive_failures -ge 2 ]]; then
                send_alert "ERROR" "Worker 连续健康检查失败，尝试重启"
                
                if restart_worker; then
                    consecutive_failures=0
                    send_alert "INFO" "Worker 重启成功"
                else
                    send_alert "CRITICAL" "Worker 重启失败，需要人工干预"
                    
                    # 重启失败后等待更长时间
                    sleep $((CHECK_INTERVAL * 3))
                    continue
                fi
            fi
        fi
        
        # 定期清理日志（每天一次）
        local current_time=$(date +%s)
        if [[ $((current_time - last_cleanup)) -gt 86400 ]]; then
            log_monitor "INFO" "执行日志清理"
            cleanup_logs 7
            last_cleanup=$current_time
        fi
        
        # 等待下次检查
        sleep "$CHECK_INTERVAL"
    done
    
    log_monitor "INFO" "监控循环结束"
}

# 停止监控
stop_monitor() {
    log_monitor "INFO" "收到停止信号，正在关闭监控器"
    MONITOR_RUNNING=false
    
    if [[ -f "$MONITOR_PID_FILE" ]]; then
        rm -f "$MONITOR_PID_FILE"
    fi
}

# 信号处理
setup_signal_handlers() {
    trap 'stop_monitor' SIGTERM SIGINT
    trap 'log_monitor "WARN" "收到 HUP 信号，重新加载配置"' SIGHUP
}

# 启动监控器
start_monitor() {
    if is_monitor_running; then
        echo "监控器已在运行"
        exit 1
    fi
    
    create_directories
    
    # 保存 PID
    echo $$ > "$MONITOR_PID_FILE"
    
    # 设置信号处理
    setup_signal_handlers
    
    # 开始监控
    monitor_loop
}

# 显示帮助
show_help() {
    cat << EOF
AI 代码审查系统 - Worker 监控脚本

用法: $0 <命令>

命令:
    start       启动监控器
    stop        停止监控器
    status      查看监控器状态
    logs        查看监控日志
    help        显示帮助信息

环境变量:
    MONITOR_CHECK_INTERVAL          检查间隔秒数 (默认: 30)
    MONITOR_MAX_RESTART_ATTEMPTS    最大重启次数 (默认: 5)
    MONITOR_RESTART_WINDOW          重启窗口期秒数 (默认: 300)
    MONITOR_MEMORY_THRESHOLD        内存使用阈值百分比 (默认: 80)
    MONITOR_CPU_THRESHOLD           CPU使用阈值百分比 (默认: 90)
    MONITOR_ERROR_LOG_THRESHOLD     错误日志行数阈值 (默认: 50)
    ALERT_EMAIL                     告警邮箱地址
    ALERT_WEBHOOK                   告警 Webhook URL

文件位置:
    监控日志: $MONITOR_LOG
    PID 文件: $MONITOR_PID_FILE

EOF
}

# 主函数
main() {
    local command="${1:-help}"
    
    case "$command" in
        start)
            start_monitor
            ;;
        stop)
            if is_monitor_running; then
                local pid=$(cat "$MONITOR_PID_FILE")
                kill -TERM "$pid"
                echo "监控器停止信号已发送 (PID: $pid)"
            else
                echo "监控器未运行"
            fi
            ;;
        status)
            if is_monitor_running; then
                local pid=$(cat "$MONITOR_PID_FILE")
                echo "监控器正在运行 (PID: $pid)"
                
                if [[ -f "$MONITOR_LOG" ]]; then
                    echo ""
                    echo "最近的监控日志:"
                    tail -n 5 "$MONITOR_LOG"
                fi
            else
                echo "监控器未运行"
                exit 1
            fi
            ;;
        logs)
            if [[ -f "$MONITOR_LOG" ]]; then
                tail -f "$MONITOR_LOG"
            else
                echo "监控日志文件不存在"
                exit 1
            fi
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"