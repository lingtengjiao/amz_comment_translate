#!/bin/bash

# 🚀 一键诊断并修复全自动分析卡住问题
# 用于产品: B0C5CM3FS6

ASIN="B0C5CM3FS6"
API_BASE="http://localhost:8000/api/v1"

echo "╔════════════════════════════════════════╗"
echo "║  🔧 全自动分析问题诊断与修复工具      ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 1. 检查后端是否运行
echo "📡 [1/6] 检查后端 API..."
if curl -s --max-time 3 "$API_BASE/products" > /dev/null 2>&1; then
    echo "✅ 后端 API 正常运行"
else
    echo "❌ 后端 API 无法访问"
    echo "   请在另一个终端运行: cd backend && uvicorn app.main:app --reload"
    exit 1
fi

# 2. 检查 Redis
echo ""
echo "🔍 [2/6] 检查 Redis..."
cd "$(dirname "$0")/backend"
if python3 -c "import redis; r = redis.Redis(host='localhost', port=6379); r.ping()" 2>/dev/null; then
    echo "✅ Redis 连接正常"
else
    echo "❌ Redis 未运行"
    echo "   启动 Redis: brew services start redis"
    echo "   或使用 Docker: docker run -d -p 6379:6379 redis"
    exit 1
fi

# 3. 检查产品状态
echo ""
echo "🔍 [3/6] 检查产品 $ASIN 状态..."
STATUS=$(curl -s "$API_BASE/products/$ASIN/auto-analysis-status")
TASK_STATUS=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'unknown'))")
TASK_ID=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('task_id', ''))")

echo "   任务状态: $TASK_STATUS"
echo "   任务 ID: $TASK_ID"

if [ "$TASK_STATUS" = "completed" ]; then
    echo "✅ 分析已完成！"
    REPORT_ID=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('report_id', ''))")
    if [ ! -z "$REPORT_ID" ]; then
        echo "   报告链接: http://localhost:3000/report/$ASIN/$REPORT_ID"
    fi
    exit 0
fi

# 4. 检查 Celery 依赖
echo ""
echo "📦 [4/6] 检查 Celery 依赖..."
if ! python3 -c "import celery" 2>/dev/null; then
    echo "⚠️  Celery 未安装，正在安装..."
    python3 -m pip install -q celery[redis] redis
    if [ $? -eq 0 ]; then
        echo "✅ Celery 安装成功"
    else
        echo "❌ 安装失败，请手动运行: pip3 install celery[redis] redis"
        exit 1
    fi
else
    echo "✅ Celery 已安装"
fi

# 5. 检查 Celery Worker
echo ""
echo "🔍 [5/6] 检查 Celery Worker 状态..."
ACTIVE_WORKERS=$(python3 -m celery -A app.worker inspect active 2>&1)

if echo "$ACTIVE_WORKERS" | grep -q "celery@"; then
    echo "✅ Celery Worker 正在运行"
    echo ""
    echo "📊 当前活跃任务:"
    echo "$ACTIVE_WORKERS" | grep -A 5 "celery@" | head -10
else
    echo "⚠️  Celery Worker 未运行"
    echo ""
    echo "🚀 [6/6] 正在后台启动 Celery Worker..."
    
    # 在后台启动 Celery Worker
    nohup python3 -m celery -A app.worker worker \
        --loglevel=info \
        --queue=translation \
        --concurrency=2 \
        > ../celery_worker.log 2>&1 &
    
    WORKER_PID=$!
    echo "✅ Celery Worker 已启动 (PID: $WORKER_PID)"
    echo "   日志文件: celery_worker.log"
    
    # 等待 Worker 启动
    echo "   等待 Worker 初始化..."
    sleep 3
fi

# 6. 触发任务执行（如果任务卡在 pending）
if [ "$TASK_STATUS" = "pending" ]; then
    echo ""
    echo "🔄 检测到任务卡在 pending 状态，尝试重新触发..."
    
    # 删除旧任务并重新创建
    TRIGGER_RESULT=$(curl -s -X POST "$API_BASE/products/$ASIN/collection-complete")
    NEW_STATUS=$(echo "$TRIGGER_RESULT" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'unknown'))")
    
    if [ "$NEW_STATUS" = "started" ] || [ "$NEW_STATUS" = "already_running" ]; then
        echo "✅ 任务已触发，开始执行"
    else
        echo "⚠️  触发结果: $NEW_STATUS"
    fi
fi

# 7. 实时监控进度
echo ""
echo "╔════════════════════════════════════════╗"
echo "║  📊 开始实时监控分析进度 (Ctrl+C 退出) ║"
echo "╚════════════════════════════════════════╝"
echo ""

LAST_STEP=""
while true; do
    STATUS=$(curl -s "$API_BASE/products/$ASIN/auto-analysis-status")
    CURRENT_STATUS=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'unknown'))")
    CURRENT_STEP=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('current_step', ''))")
    PROGRESS=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('progress', 0))")
    
    # 只在状态变化时打印
    if [ "$CURRENT_STEP" != "$LAST_STEP" ]; then
        TIMESTAMP=$(date +"%H:%M:%S")
        echo "[$TIMESTAMP] 状态: $CURRENT_STATUS | 步骤: $CURRENT_STEP | 进度: $PROGRESS%"
        LAST_STEP="$CURRENT_STEP"
    fi
    
    # 检查是否完成
    if [ "$CURRENT_STATUS" = "completed" ]; then
        echo ""
        echo "╔════════════════════════════════════════╗"
        echo "║  🎉 分析完成！                        ║"
        echo "╚════════════════════════════════════════╝"
        REPORT_ID=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('report_id', ''))")
        if [ ! -z "$REPORT_ID" ]; then
            echo ""
            echo "📄 报告地址:"
            echo "   http://localhost:3000/report/$ASIN/$REPORT_ID"
        fi
        break
    fi
    
    # 检查是否失败
    if [ "$CURRENT_STATUS" = "failed" ]; then
        echo ""
        echo "❌ 分析失败"
        ERROR_MSG=$(echo "$STATUS" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('error_message', ''))")
        echo "   错误信息: $ERROR_MSG"
        break
    fi
    
    sleep 5
done

echo ""
echo "✅ 监控结束"
