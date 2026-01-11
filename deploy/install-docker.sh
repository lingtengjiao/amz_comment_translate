#!/bin/bash
# =============================================================================
# Docker 和 Docker Compose 安装脚本（适用于 CentOS/RHEL/Ubuntu/Debian）
# =============================================================================

set -e

echo "🚀 开始安装 Docker..."

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ 无法检测操作系统"
    exit 1
fi

echo "📦 检测到操作系统: $OS"

# 安装 Docker
install_docker() {
    if command -v docker &> /dev/null; then
        echo "✅ Docker 已安装: $(docker --version)"
        return 0
    fi
    
    case $OS in
        ubuntu|debian)
            echo "📦 使用 apt 安装 Docker..."
            apt-get update
            apt-get install -y ca-certificates curl gnupg
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel|fedora|almalinux|rocky)
            echo "📦 使用 yum 安装 Docker..."
            yum install -y yum-utils
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        *)
            echo "❌ 不支持的操作系统: $OS"
            echo "请手动安装 Docker: https://docs.docker.com/engine/install/"
            exit 1
            ;;
    esac
    
    # 启动 Docker
    systemctl start docker
    systemctl enable docker
    
    echo "✅ Docker 安装完成: $(docker --version)"
}

# 安装 Docker Compose（如果不是插件形式）
install_docker_compose() {
    if docker compose version &> /dev/null; then
        echo "✅ Docker Compose 已安装: $(docker compose version)"
        return 0
    fi
    
    if command -v docker-compose &> /dev/null; then
        echo "✅ Docker Compose 已安装: $(docker-compose --version)"
        return 0
    fi
    
    echo "📦 安装 Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    echo "✅ Docker Compose 安装完成: $(docker-compose --version)"
}

# 执行安装
install_docker
install_docker_compose

# 验证安装
echo ""
echo "🎉 安装完成！"
echo "Docker 版本: $(docker --version)"
if docker compose version &> /dev/null; then
    echo "Docker Compose 版本: $(docker compose version)"
else
    echo "Docker Compose 版本: $(docker-compose --version)"
fi
