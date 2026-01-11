#!/bin/bash
# =============================================================================
# 服务器 B (Worker 节点) 部署脚本
# =============================================================================
# 在服务器 B 上执行此脚本

set -e

echo "🚀 开始部署服务器 B (Worker 节点)..."

# 配置变量
PROJECT_DIR="/opt/voc-worker"
COMPOSE_FILE="docker-compose-worker.yml"

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用 root 用户运行此脚本"
    exit 1
fi

# Step 1: 安装 Docker
echo ""
echo "📦 Step 1: 检查/安装 Docker..."
if ! command -v docker &> /dev/null; then
    bash $PROJECT_DIR/deploy/install-docker.sh
fi

# Step 2: 创建项目目录
echo ""
echo "📂 Step 2: 进入项目目录..."
cd $PROJECT_DIR

# Step 3: 检查必要文件
echo ""
echo "📋 Step 3: 检查必要文件..."
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ 找不到 $COMPOSE_FILE"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "❌ 找不到 .env 文件，请先创建环境变量配置"
    exit 1
fi

# Step 4: 测试与主服务器的连接
echo ""
echo "🔗 Step 4: 测试与主服务器的连接..."
source .env

echo -n "测试 Redis 连接 ($MASTER_IP:6379): "
if timeout 5 bash -c "echo > /dev/tcp/$MASTER_IP/6379" 2>/dev/null; then
    echo "✅ 可连接"
else
    echo "❌ 无法连接，请检查：
    1. 服务器 A 的 Redis 是否启动
    2. 服务器 A 的防火墙是否开放 6379 端口
    3. MASTER_IP 是否正确: $MASTER_IP"
    exit 1
fi

echo -n "测试 PostgreSQL 连接 ($MASTER_IP:5432): "
if timeout 5 bash -c "echo > /dev/tcp/$MASTER_IP/5432" 2>/dev/null; then
    echo "✅ 可连接"
else
    echo "❌ 无法连接，请检查：
    1. 服务器 A 的 PostgreSQL 是否启动
    2. 服务器 A 的防火墙是否开放 5432 端口
    3. MASTER_IP 是否正确: $MASTER_IP"
    exit 1
fi

# Step 5: 停止旧容器（如果存在）
echo ""
echo "🛑 Step 5: 停止旧容器..."
docker compose -f $COMPOSE_FILE down 2>/dev/null || docker-compose -f $COMPOSE_FILE down 2>/dev/null || true

# Step 6: 构建并启动 Worker
echo ""
echo "🏗️ Step 6: 构建并启动 Worker..."
if docker compose version &> /dev/null; then
    docker compose -f $COMPOSE_FILE build --no-cache
    docker compose -f $COMPOSE_FILE up -d
else
    docker-compose -f $COMPOSE_FILE build --no-cache
    docker-compose -f $COMPOSE_FILE up -d
fi

# Step 7: 等待服务启动
echo ""
echo "⏳ Step 7: 等待 Worker 启动..."
sleep 20

# Step 8: 验证 Worker 状态
echo ""
echo "✅ Step 8: 验证 Worker 状态..."
if docker compose version &> /dev/null; then
    docker compose -f $COMPOSE_FILE ps
else
    docker-compose -f $COMPOSE_FILE ps
fi

# Step 9: 检查 Worker 健康状态
echo ""
echo "🏥 Step 9: 检查 Worker 健康状态..."

check_worker() {
    local name=$1
    echo -n "$name: "
    if docker ps --filter "name=$name" --filter "status=running" | grep -q $name; then
        echo "✅ 运行中"
    else
        echo "❌ 异常"
    fi
}

check_worker "voc-worker-insight"
check_worker "voc-worker-theme"
check_worker "voc-worker-trans-2"
check_worker "voc-worker-backup"

echo ""
echo "🎉 服务器 B 部署完成！"
echo ""
echo "📋 Worker 列表："
echo "   - worker-insight: 洞察提取 (PARALLEL_SIZE=40)"
echo "   - worker-theme: 主题提取 (PARALLEL_SIZE=50)"
echo "   - worker-trans-2: 翻译备份"
echo "   - worker-backup: 全能支援"
echo ""
echo "📋 验证 Worker 是否注册到 Flower："
echo "   访问: http://$MASTER_IP:5555"
