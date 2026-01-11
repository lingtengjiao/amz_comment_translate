#!/bin/bash
# =============================================================================
# 🔑 GitHub Actions SSH 密钥配置脚本
# =============================================================================
# 
# 此脚本将：
# 1. 生成新的 SSH 密钥对（用于 GitHub Actions）
# 2. 将公钥添加到两台服务器的 authorized_keys
# 3. 输出私钥内容，供您添加到 GitHub Secrets
#
# 使用方法：
#   ./deploy/setup-github-ssh.sh
#
# =============================================================================

set -e

# ============================================================================
# 配置区域
# ============================================================================
MASTER_IP="115.191.30.209"
WORKER_IP="115.190.185.29"
SSH_USER="root"
SSH_PASSWORD="Suantian51"

# SSH 密钥路径
KEY_NAME="github_actions_deploy"
KEY_PATH="$HOME/.ssh/${KEY_NAME}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================================
# 检查 sshpass
# ============================================================================
check_sshpass() {
    if ! command -v sshpass &> /dev/null; then
        log_warning "sshpass 未安装，正在安装..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install hudochenkov/sshpass/sshpass
        else
            sudo apt-get install -y sshpass || sudo yum install -y sshpass
        fi
    fi
}

# ============================================================================
# 生成 SSH 密钥对
# ============================================================================
generate_ssh_key() {
    log_info "检查 SSH 密钥..."
    
    if [ -f "$KEY_PATH" ]; then
        log_warning "密钥已存在: $KEY_PATH"
        read -p "是否重新生成？这将覆盖现有密钥 (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "使用现有密钥"
            return
        fi
    fi
    
    log_info "生成新的 SSH 密钥对..."
    ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "github-actions-deploy"
    
    log_success "密钥生成完成!"
    echo "  私钥: $KEY_PATH"
    echo "  公钥: ${KEY_PATH}.pub"
}

# ============================================================================
# 添加公钥到服务器
# ============================================================================
add_key_to_server() {
    local server_ip=$1
    local server_name=$2
    
    log_info "添加公钥到 $server_name ($server_ip)..."
    
    # 读取公钥
    local pubkey=$(cat "${KEY_PATH}.pub")
    
    # 添加到服务器
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$server_ip" << EOF
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 检查公钥是否已存在
if ! grep -q "github-actions-deploy" ~/.ssh/authorized_keys; then
    echo "$pubkey" >> ~/.ssh/authorized_keys
    echo "公钥已添加"
else
    echo "公钥已存在，跳过"
fi
EOF
    
    log_success "$server_name 公钥配置完成"
}

# ============================================================================
# 验证 SSH 连接
# ============================================================================
verify_ssh() {
    local server_ip=$1
    local server_name=$2
    
    log_info "验证 SSH 连接到 $server_name..."
    
    if ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no -o BatchMode=yes "$SSH_USER@$server_ip" "echo 'SSH OK'" 2>/dev/null; then
        log_success "$server_name SSH 连接成功 ✅"
        return 0
    else
        log_error "$server_name SSH 连接失败 ❌"
        return 1
    fi
}

# ============================================================================
# 输出 GitHub Secrets 配置信息
# ============================================================================
output_github_secrets() {
    echo ""
    echo -e "${CYAN}=============================================="
    echo "📋 GitHub Secrets 配置信息"
    echo "==============================================${NC}"
    echo ""
    echo -e "${YELLOW}请在 GitHub 仓库设置中添加以下 Secrets:${NC}"
    echo ""
    echo "Settings → Secrets and variables → Actions → New repository secret"
    echo ""
    echo "┌─────────────────────────────────────────────────────────────────┐"
    echo "│ Secret Name          │ Value                                   │"
    echo "├─────────────────────────────────────────────────────────────────┤"
    echo "│ SSH_PRIVATE_KEY      │ (见下方私钥内容)                          │"
    echo "│ SERVER_A_IP          │ 115.191.30.209                          │"
    echo "│ SERVER_B_IP          │ 115.190.185.29                          │"
    echo "│ SERVER_USER          │ root                                    │"
    echo "│ QWEN_API_KEY         │ sk-bb9ae189dc3b4b85a9d5bd156254de76     │"
    echo "└─────────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${CYAN}=============================================="
    echo "🔑 SSH_PRIVATE_KEY 的值 (复制以下全部内容):"
    echo "==============================================${NC}"
    echo ""
    cat "$KEY_PATH"
    echo ""
    echo -e "${CYAN}==============================================${NC}"
    echo ""
    echo -e "${GREEN}✅ 配置完成后，每次 push 到 main 分支将自动部署！${NC}"
    echo ""
    echo -e "${YELLOW}GitHub Actions 页面: https://github.com/lingtengjiao/amz_comment_translate/actions${NC}"
    echo ""
}

# ============================================================================
# 主流程
# ============================================================================
main() {
    echo ""
    echo -e "${CYAN}=============================================="
    echo "🔑 GitHub Actions SSH 密钥配置"
    echo "==============================================${NC}"
    echo ""
    echo "服务器 A: $MASTER_IP"
    echo "服务器 B: $WORKER_IP"
    echo ""
    
    check_sshpass
    generate_ssh_key
    
    echo ""
    add_key_to_server "$MASTER_IP" "服务器 A (Master)"
    add_key_to_server "$WORKER_IP" "服务器 B (Worker)"
    
    echo ""
    log_info "验证 SSH 连接..."
    verify_ssh "$MASTER_IP" "服务器 A"
    verify_ssh "$WORKER_IP" "服务器 B"
    
    output_github_secrets
}

main "$@"
