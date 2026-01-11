#!/bin/bash
# =============================================================================
# 一键全自动部署脚本（在本地 Mac 上执行）
# =============================================================================
# 
# 此脚本将：
# 1. 上传代码到服务器 A 和 B
# 2. 在服务器 A 上部署主服务
# 3. 在服务器 B 上部署 Worker
# 4. 验证部署结果
#
# 使用方法：
#   ./deploy/full-deploy.sh
#
# =============================================================================

set -e

# ============================================================================
# 配置区域（请根据实际情况修改）
# ============================================================================
MASTER_IP="115.191.30.209"      # 服务器 A IP
WORKER_IP="115.190.185.29"      # 服务器 B IP
SSH_USER="root"                  # SSH 用户名
SSH_PASSWORD="Suantian51"        # SSH 密码（建议使用 SSH 密钥）

# QWEN API 配置
QWEN_API_KEY="${QWEN_API_KEY:-}"  # 从环境变量读取，或在这里设置

# 数据库配置
POSTGRES_USER="vocmaster"
POSTGRES_PASSWORD="vocmaster123"
POSTGRES_DB="vocmaster"

# 项目目录
LOCAL_PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MASTER_PROJECT_DIR="/opt/voc"
WORKER_PROJECT_DIR="/opt/voc-worker"

# ============================================================================
# 辅助函数
# ============================================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# SSH 命令执行
ssh_exec() {
    local host=$1
    local cmd=$2
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$host" "$cmd"
}

# SCP 上传
scp_upload() {
    local src=$1
    local host=$2
    local dest=$3
    sshpass -p "$SSH_PASSWORD" scp -o StrictHostKeyChecking=no -r "$src" "$SSH_USER@$host:$dest"
}

# Rsync 上传（更快）
rsync_upload() {
    local src=$1
    local host=$2
    local dest=$3
    sshpass -p "$SSH_PASSWORD" rsync -avz --progress \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude '__pycache__' \
        --exclude '.env' \
        --exclude '*.pyc' \
        --exclude 'postgres_data' \
        --exclude 'redis_data' \
        -e "ssh -o StrictHostKeyChecking=no" \
        "$src" "$SSH_USER@$host:$dest"
}

# ============================================================================
# 检查前置条件
# ============================================================================

check_prerequisites() {
    log_info "检查前置条件..."
    
    # 检查 sshpass
    if ! command -v sshpass &> /dev/null; then
        log_warning "sshpass 未安装，正在安装..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install hudochenkov/sshpass/sshpass
        else
            apt-get install -y sshpass || yum install -y sshpass
        fi
    fi
    
    # 检查 rsync
    if ! command -v rsync &> /dev/null; then
        log_error "rsync 未安装，请先安装"
        exit 1
    fi
    
    # 检查 QWEN_API_KEY
    if [ -z "$QWEN_API_KEY" ]; then
        log_error "QWEN_API_KEY 未设置！"
        echo "请设置环境变量: export QWEN_API_KEY=your_api_key"
        exit 1
    fi
    
    log_success "前置条件检查通过"
}

# ============================================================================
# 创建环境变量文件
# ============================================================================

create_env_files() {
    log_info "创建环境变量文件..."
    
    # 服务器 A 的 .env
    cat > "$LOCAL_PROJECT_DIR/.env.master" << EOF
# 服务器 A (主服务器) 环境变量
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
QWEN_API_KEY=$QWEN_API_KEY
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
MAX_API_RPS=200
INSIGHT_PARALLEL_SIZE=40
THEME_PARALLEL_SIZE=50
EOF

    # 服务器 B 的 .env
    cat > "$LOCAL_PROJECT_DIR/.env.worker" << EOF
# 服务器 B (Worker 节点) 环境变量
MASTER_IP=$MASTER_IP
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
QWEN_API_KEY=$QWEN_API_KEY
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
MAX_API_RPS=200
INSIGHT_PARALLEL_SIZE=40
THEME_PARALLEL_SIZE=50
EOF

    log_success "环境变量文件创建完成"
}

# ============================================================================
# 部署服务器 A
# ============================================================================

deploy_master() {
    log_info "=========================================="
    log_info "开始部署服务器 A ($MASTER_IP)..."
    log_info "=========================================="
    
    # 1. 创建远程目录
    log_info "创建远程目录..."
    ssh_exec "$MASTER_IP" "mkdir -p $MASTER_PROJECT_DIR"
    
    # 2. 上传代码
    log_info "上传代码到服务器 A（可能需要几分钟）..."
    rsync_upload "$LOCAL_PROJECT_DIR/" "$MASTER_IP" "$MASTER_PROJECT_DIR"
    
    # 3. 上传 .env 文件
    log_info "上传环境变量文件..."
    scp_upload "$LOCAL_PROJECT_DIR/.env.master" "$MASTER_IP" "$MASTER_PROJECT_DIR/.env"
    
    # 4. 设置脚本执行权限
    log_info "设置脚本权限..."
    ssh_exec "$MASTER_IP" "chmod +x $MASTER_PROJECT_DIR/deploy/*.sh"
    
    # 5. 安装 Docker（如果需要）
    log_info "检查/安装 Docker..."
    ssh_exec "$MASTER_IP" "bash $MASTER_PROJECT_DIR/deploy/install-docker.sh"
    
    # 6. 运行部署脚本
    log_info "运行部署脚本..."
    ssh_exec "$MASTER_IP" "cd $MASTER_PROJECT_DIR && bash deploy/deploy-master.sh"
    
    log_success "服务器 A 部署完成！"
}

# ============================================================================
# 部署服务器 B
# ============================================================================

deploy_worker() {
    log_info "=========================================="
    log_info "开始部署服务器 B ($WORKER_IP)..."
    log_info "=========================================="
    
    # 1. 创建远程目录
    log_info "创建远程目录..."
    ssh_exec "$WORKER_IP" "mkdir -p $WORKER_PROJECT_DIR"
    
    # 2. 上传 backend 代码（Worker 只需要 backend）
    log_info "上传代码到服务器 B..."
    rsync_upload "$LOCAL_PROJECT_DIR/backend/" "$WORKER_IP" "$WORKER_PROJECT_DIR/backend"
    rsync_upload "$LOCAL_PROJECT_DIR/deploy/" "$WORKER_IP" "$WORKER_PROJECT_DIR/deploy"
    scp_upload "$LOCAL_PROJECT_DIR/docker-compose-worker.yml" "$WORKER_IP" "$WORKER_PROJECT_DIR/"
    
    # 3. 上传 .env 文件
    log_info "上传环境变量文件..."
    scp_upload "$LOCAL_PROJECT_DIR/.env.worker" "$WORKER_IP" "$WORKER_PROJECT_DIR/.env"
    
    # 4. 设置脚本执行权限
    log_info "设置脚本权限..."
    ssh_exec "$WORKER_IP" "chmod +x $WORKER_PROJECT_DIR/deploy/*.sh"
    
    # 5. 安装 Docker（如果需要）
    log_info "检查/安装 Docker..."
    ssh_exec "$WORKER_IP" "bash $WORKER_PROJECT_DIR/deploy/install-docker.sh"
    
    # 6. 运行部署脚本
    log_info "运行部署脚本..."
    ssh_exec "$WORKER_IP" "cd $WORKER_PROJECT_DIR && bash deploy/deploy-worker.sh"
    
    log_success "服务器 B 部署完成！"
}

# ============================================================================
# 验证部署
# ============================================================================

verify_deployment() {
    log_info "=========================================="
    log_info "验证部署结果..."
    log_info "=========================================="
    
    echo ""
    
    # 检查服务器 A 的服务
    log_info "检查服务器 A 服务状态..."
    
    echo -n "  Backend API: "
    if curl -s --max-time 5 "http://$MASTER_IP:8000/health" &> /dev/null; then
        echo -e "${GREEN}✅ 正常${NC}"
    else
        echo -e "${RED}❌ 异常${NC}"
    fi
    
    echo -n "  前端页面: "
    if curl -s --max-time 5 "http://$MASTER_IP:3000" &> /dev/null; then
        echo -e "${GREEN}✅ 正常${NC}"
    else
        echo -e "${YELLOW}⏳ 启动中...${NC}"
    fi
    
    echo -n "  Flower 监控: "
    if curl -s --max-time 5 "http://$MASTER_IP:5555" &> /dev/null; then
        echo -e "${GREEN}✅ 正常${NC}"
    else
        echo -e "${YELLOW}⏳ 启动中...${NC}"
    fi
    
    # 检查 Worker 数量
    echo ""
    log_info "检查 Flower 中的 Worker 数量..."
    WORKERS=$(curl -s "http://$MASTER_IP:5555/api/workers" 2>/dev/null | grep -o '"[^"]*@[^"]*"' | wc -l || echo "0")
    echo "  已注册 Worker 数量: $WORKERS"
    
    if [ "$WORKERS" -ge 7 ]; then
        echo -e "  ${GREEN}✅ 所有 7 个 Worker 已注册${NC}"
    else
        echo -e "  ${YELLOW}⚠️ 部分 Worker 可能还在启动中，请稍后在 Flower 中确认${NC}"
    fi
    
    echo ""
    log_success "=========================================="
    log_success "部署验证完成！"
    log_success "=========================================="
    echo ""
    echo "📋 访问地址："
    echo "   🌐 前端: http://$MASTER_IP:3000"
    echo "   🔌 API: http://$MASTER_IP:8000"
    echo "   🌸 Flower: http://$MASTER_IP:5555"
    echo ""
}

# ============================================================================
# 主流程
# ============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "🚀 VOC 双服务器自动化部署"
    echo "=============================================="
    echo ""
    echo "服务器 A (主服务器): $MASTER_IP"
    echo "服务器 B (Worker):   $WORKER_IP"
    echo ""
    
    # 确认部署
    read -p "确认开始部署？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "部署已取消"
        exit 0
    fi
    
    # 执行部署流程
    check_prerequisites
    create_env_files
    deploy_master
    
    # 等待服务器 A 的服务完全启动
    log_info "等待服务器 A 服务完全启动 (60秒)..."
    sleep 60
    
    deploy_worker
    
    # 等待 Worker 注册
    log_info "等待 Worker 注册到 Flower (30秒)..."
    sleep 30
    
    verify_deployment
}

# 执行主流程
main "$@"
