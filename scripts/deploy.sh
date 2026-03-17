#!/bin/bash

# AI 代码审查系统 - 部署脚本
# 用于快速部署和更新应用

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# 检查环境变量文件
check_env_file() {
    if [ ! -f .env ]; then
        log_error ".env 文件不存在"
        log_info "请复制 .env.example 并配置环境变量"
        exit 1
    fi
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    
    BACKUP_DIR="./backups"
    mkdir -p $BACKUP_DIR
    
    DATE=$(date +%Y%m%d_%H%M%S)
    
    if [ "$DEPLOY_MODE" = "docker" ]; then
        docker-compose exec -T mysql mysqldump -u root -p${DATABASE_PASSWORD} ${DATABASE_NAME} | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz
    else
        mysqldump -u ${DATABASE_USER} -p${DATABASE_PASSWORD} ${DATABASE_NAME} | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz
    fi
    
    log_info "数据库备份完成: $BACKUP_DIR/db_backup_$DATE.sql.gz"
}

# Docker 部署
deploy_docker() {
    log_info "使用 Docker 部署..."
    
    # 检查 Docker
    check_command docker
    check_command docker-compose
    
    # 拉取最新代码
    if [ "$SKIP_GIT_PULL" != "true" ]; then
        log_info "拉取最新代码..."
        git pull origin main
    fi
    
    # 备份数据库
    if [ "$SKIP_BACKUP" != "true" ]; then
        backup_database
    fi
    
    # 构建镜像
    log_info "构建 Docker 镜像..."
    docker-compose build
    
    # 停止旧容器
    log_info "停止旧容器..."
    docker-compose down
    
    # 启动新容器
    log_info "启动新容器..."
    if [ "$ENABLE_POLLING" = "true" ]; then
        docker-compose --profile polling up -d
    else
        docker-compose up -d
    fi
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 10
    
    # 运行数据库迁移
    log_info "运行数据库迁移..."
    docker-compose exec -T app pnpm db:migrate
    
    # 健康检查
    log_info "执行健康检查..."
    for i in {1..30}; do
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            log_info "应用启动成功！"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "应用启动失败，请检查日志"
            docker-compose logs app
            exit 1
        fi
        sleep 2
    done
    
    # 显示状态
    log_info "服务状态："
    docker-compose ps
}

# 手动部署
deploy_manual() {
    log_info "使用手动方式部署..."
    
    # 检查依赖
    check_command node
    check_command pnpm
    check_command pm2
    
    # 拉取最新代码
    if [ "$SKIP_GIT_PULL" != "true" ]; then
        log_info "拉取最新代码..."
        git pull origin main
    fi
    
    # 备份数据库
    if [ "$SKIP_BACKUP" != "true" ]; then
        backup_database
    fi
    
    # 安装依赖
    log_info "安装依赖..."
    pnpm install --frozen-lockfile
    
    # 运行数据库迁移
    log_info "运行数据库迁移..."
    pnpm db:migrate
    
    # 构建应用
    log_info "构建应用..."
    pnpm build
    
    # 重启 PM2 进程
    log_info "重启应用..."
    if pm2 list | grep -q "ai-review-app"; then
        pm2 reload ecosystem.config.js
    else
        pm2 start ecosystem.config.js
    fi
    
    # 保存 PM2 配置
    pm2 save
    
    # 健康检查
    log_info "执行健康检查..."
    for i in {1..30}; do
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            log_info "应用启动成功！"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "应用启动失败，请检查日志"
            pm2 logs ai-review-app --lines 50
            exit 1
        fi
        sleep 2
    done
    
    # 显示状态
    log_info "服务状态："
    pm2 list
}

# 回滚
rollback() {
    log_warn "执行回滚..."
    
    if [ -z "$1" ]; then
        log_error "请指定备份文件"
        log_info "用法: $0 rollback <backup_file>"
        exit 1
    fi
    
    BACKUP_FILE=$1
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "备份文件不存在: $BACKUP_FILE"
        exit 1
    fi
    
    log_info "从备份恢复数据库: $BACKUP_FILE"
    
    if [ "$DEPLOY_MODE" = "docker" ]; then
        gunzip < $BACKUP_FILE | docker-compose exec -T mysql mysql -u root -p${DATABASE_PASSWORD} ${DATABASE_NAME}
    else
        gunzip < $BACKUP_FILE | mysql -u ${DATABASE_USER} -p${DATABASE_PASSWORD} ${DATABASE_NAME}
    fi
    
    log_info "回滚完成"
}

# 显示帮助
show_help() {
    cat << EOF
AI 代码审查系统 - 部署脚本

用法:
    $0 [命令] [选项]

命令:
    deploy          部署应用（默认）
    rollback <file> 回滚到指定备份
    help            显示帮助信息

选项:
    --mode <mode>       部署模式: docker 或 manual（默认: docker）
    --skip-backup       跳过数据库备份
    --skip-git-pull     跳过 Git 拉取
    --enable-polling    启用轮询扫描器（仅 Docker 模式）

示例:
    # Docker 部署
    $0 deploy --mode docker

    # 手动部署
    $0 deploy --mode manual

    # 跳过备份的快速部署
    $0 deploy --skip-backup

    # 启用轮询扫描器
    $0 deploy --enable-polling

    # 回滚
    $0 rollback ./backups/db_backup_20240120_020000.sql.gz

EOF
}

# 主函数
main() {
    # 默认值
    COMMAND="deploy"
    DEPLOY_MODE="docker"
    SKIP_BACKUP="false"
    SKIP_GIT_PULL="false"
    ENABLE_POLLING="false"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            deploy)
                COMMAND="deploy"
                shift
                ;;
            rollback)
                COMMAND="rollback"
                ROLLBACK_FILE=$2
                shift 2
                ;;
            help)
                show_help
                exit 0
                ;;
            --mode)
                DEPLOY_MODE=$2
                shift 2
                ;;
            --skip-backup)
                SKIP_BACKUP="true"
                shift
                ;;
            --skip-git-pull)
                SKIP_GIT_PULL="true"
                shift
                ;;
            --enable-polling)
                ENABLE_POLLING="true"
                shift
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 检查环境变量文件
    check_env_file
    
    # 加载环境变量
    source .env
    
    # 执行命令
    case $COMMAND in
        deploy)
            log_info "开始部署 AI 代码审查系统..."
            log_info "部署模式: $DEPLOY_MODE"
            
            if [ "$DEPLOY_MODE" = "docker" ]; then
                deploy_docker
            elif [ "$DEPLOY_MODE" = "manual" ]; then
                deploy_manual
            else
                log_error "未知的部署模式: $DEPLOY_MODE"
                exit 1
            fi
            
            log_info "部署完成！"
            log_info "访问地址: http://localhost:3000"
            ;;
        rollback)
            rollback $ROLLBACK_FILE
            ;;
    esac
}

# 运行主函数
main "$@"
