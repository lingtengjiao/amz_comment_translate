#!/bin/bash
# 本地开发环境快速启动脚本

set -e

cd "$(dirname "$0")"

echo "=============================================="
echo "🚀 VOC 本地开发环境启动"
echo "=============================================="
echo ""

# 1. 启动数据库服务
echo "1️⃣ 启动数据库和 Redis..."
docker compose up -d db-postgres db-redis

echo ""
echo "⏳ 等待数据库就绪..."
sleep 5

# 2. 检查数据库状态
echo ""
echo "2️⃣ 检查服务状态..."
docker compose ps db-postgres db-redis

echo ""
echo "=============================================="
echo "✅ 基础服务已启动！"
echo "=============================================="
echo ""
echo "📡 服务地址："
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis:      localhost:6379"
echo ""
echo "🔧 后续步骤："
echo ""
echo "【后端开发】在新终端执行："
echo "   cd backend"
echo "   pip install -r requirements.txt  # 首次运行"
echo "   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "【前端开发】在新终端执行："
echo "   cd frontend"
echo "   npm install  # 首次运行"
echo "   npm run dev"
echo ""
echo "【Celery Worker】在新终端执行（可选）："
echo "   cd backend"
echo "   celery -A app.worker worker --loglevel=info --pool=gevent --concurrency=10"
echo ""
echo "=============================================="
