#!/bin/bash

# Celery Worker 启动脚本
# 用于执行全自动分析任务

echo "🚀 启动 Celery Worker..."
echo "================================"

# 进入后端目录
cd "$(dirname "$0")/backend"

# 检查 Python 环境
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 找不到 Python"
    exit 1
fi

echo "✅ 使用 Python: $(which $PYTHON_CMD)"
echo "✅ Python 版本: $($PYTHON_CMD --version)"

# 检查依赖是否安装
echo ""
echo "📦 检查依赖..."
if ! $PYTHON_CMD -c "import celery" 2>/dev/null; then
    echo "⚠️  Celery 未安装，正在安装依赖..."
    $PYTHON_CMD -m pip install -q -r requirements.txt
    if [ $? -eq 0 ]; then
        echo "✅ 依赖安装成功"
    else
        echo "❌ 依赖安装失败，请手动运行: pip3 install -r requirements.txt"
        exit 1
    fi
else
    echo "✅ Celery 已安装"
fi

# 检查 Redis
echo ""
echo "🔍 检查 Redis 连接..."
if $PYTHON_CMD -c "import redis; r = redis.Redis(host='localhost', port=6379, decode_responses=True); r.ping()" 2>/dev/null; then
    echo "✅ Redis 连接正常"
else
    echo "⚠️  Redis 连接失败"
    echo "请确保 Redis 已启动: brew services start redis"
    echo "或使用 Docker: docker run -d -p 6379:6379 redis"
fi

# 启动 Celery Worker
echo ""
echo "🎯 启动 Celery Worker (监听 translation 和 analysis 队列)..."
echo "================================"
echo ""

# 使用 exec 替换当前进程，这样 Ctrl+C 可以正常工作
exec $PYTHON_CMD -m celery -A app.worker worker \
    --loglevel=info \
    --queues=translation,analysis \
    --concurrency=8 \
    --max-tasks-per-child=50 \
    --task-events
