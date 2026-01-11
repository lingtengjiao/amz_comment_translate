#!/bin/bash
# =============================================================================
# 服务器 A (主服务器) 部署脚本
# =============================================================================
# 在服务器 A 上执行此脚本

set -e

echo "🚀 开始部署服务器 A (主服务器)..."

# 配置变量
PROJECT_DIR="/opt/voc"
COMPOSE_FILE="docker-compose-master.yml"

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用 root 用户运行此脚本"
    exit 1
fi

# Step 1: 安装 Docker
echo ""
echo "📦 Step 1: 检查/安装 Docker..."
if ! command -v docker &> /dev/null; then
    bash /opt/voc/deploy/install-docker.sh
fi

# Step 2: 创建项目目录
echo ""
echo "📂 Step 2: 创建项目目录..."
mkdir -p $PROJECT_DIR
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

# Step 4: 配置防火墙
echo ""
echo "🔥 Step 4: 配置防火墙..."
if command -v firewall-cmd &> /dev/null; then
    # CentOS/RHEL
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=5432/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=5555/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=6379/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=8000/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo "✅ firewalld 配置完成"
elif command -v ufw &> /dev/null; then
    # Ubuntu/Debian
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 3000/tcp 2>/dev/null || true
    ufw allow 5432/tcp 2>/dev/null || true
    ufw allow 5555/tcp 2>/dev/null || true
    ufw allow 6379/tcp 2>/dev/null || true
    ufw allow 8000/tcp 2>/dev/null || true
    echo "✅ ufw 配置完成"
else
    echo "⚠️ 未检测到防火墙管理工具，请手动开放端口: 80, 3000, 5432, 5555, 6379, 8000"
fi

# Step 5: 停止旧容器（如果存在）
echo ""
echo "🛑 Step 5: 停止旧容器..."
docker compose -f $COMPOSE_FILE down 2>/dev/null || docker-compose -f $COMPOSE_FILE down 2>/dev/null || true

# Step 6: 构建并启动服务
echo ""
echo "🏗️ Step 6: 构建并启动服务..."
if docker compose version &> /dev/null; then
    docker compose -f $COMPOSE_FILE build --no-cache
    docker compose -f $COMPOSE_FILE up -d
else
    docker-compose -f $COMPOSE_FILE build --no-cache
    docker-compose -f $COMPOSE_FILE up -d
fi

# Step 7: 等待服务启动
echo ""
echo "⏳ Step 7: 等待服务启动..."
sleep 30

# Step 8: 验证服务状态
echo ""
echo "✅ Step 8: 验证服务状态..."
if docker compose version &> /dev/null; then
    docker compose -f $COMPOSE_FILE ps
else
    docker-compose -f $COMPOSE_FILE ps
fi

# Step 9: 检查健康状态
echo ""
echo "🏥 Step 9: 检查健康状态..."

# 检查 PostgreSQL
echo -n "PostgreSQL: "
if docker exec voc-postgres pg_isready -U vocmaster &> /dev/null; then
    echo "✅ 健康"
else
    echo "❌ 异常"
fi

# 检查 Redis
echo -n "Redis: "
if docker exec voc-redis redis-cli ping &> /dev/null; then
    echo "✅ 健康"
else
    echo "❌ 异常"
fi

# 检查 Backend
echo -n "Backend: "
if curl -s http://localhost:8000/health &> /dev/null; then
    echo "✅ 健康"
else
    echo "⏳ 启动中..."
fi

echo ""
echo "🎉 服务器 A 部署完成！"
echo ""
echo "📋 访问地址："
echo "   - 前端: http://$(hostname -I | awk '{print $1}'):3000"
echo "   - API: http://$(hostname -I | awk '{print $1}'):8000"
echo "   - Flower: http://$(hostname -I | awk '{print $1}'):5555"
echo ""
echo "📋 供服务器 B 连接的地址："
echo "   - PostgreSQL: $(hostname -I | awk '{print $1}'):5432"
echo "   - Redis: $(hostname -I | awk '{print $1}'):6379"
