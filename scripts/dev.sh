#!/bin/bash
# VOC-Master Development Script
# 启动开发环境（仅数据库和 Redis）

set -e

echo "🔧 VOC-Master 开发模式"
echo "======================"

cd "$(dirname "$0")/.."

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
fi

echo "🐳 启动数据库服务..."

if command -v docker-compose &> /dev/null; then
    docker-compose up -d db-postgres db-redis
else
    docker compose up -d db-postgres db-redis
fi

echo ""
echo "⏳ 等待数据库启动..."
sleep 5

echo ""
echo "✅ 开发环境已就绪！"
echo ""
echo "📡 服务地址："
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis:      localhost:6379"
echo ""
echo "🔧 启动后端开发服务器："
echo "   cd backend"
echo "   pip install -r requirements.txt"
echo "   uvicorn app.main:app --reload"
echo ""
echo "🔧 启动前端开发服务器："
echo "   cd frontend"
echo "   npm install"
echo "   npm run dev"
echo ""
echo "🔧 启动 Celery Worker："
echo "   cd backend"
echo "   celery -A app.worker worker --loglevel=info"

