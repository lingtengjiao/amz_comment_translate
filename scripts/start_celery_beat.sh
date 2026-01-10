#!/bin/bash
# =============================================================================
# Celery Beat 启动脚本
#
# Celery Beat 是定时任务调度器，负责：
# - 每 5 秒触发一次 task_process_ingestion_queue（队列消费入库）
#
# 使用方式：
#   ./scripts/start_celery_beat.sh
#
# 或者在 Docker 中：
#   docker exec -it voc-worker celery -A app.worker beat --loglevel=info
# =============================================================================

set -e

echo "🕐 启动 Celery Beat 定时调度器..."

# 进入 backend 目录
cd "$(dirname "$0")/../backend"

# 检查是否在虚拟环境中
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  建议在虚拟环境中运行"
fi

# 启动 Celery Beat
celery -A app.worker beat \
    --loglevel=info \
    --pidfile=/tmp/celery-beat.pid \
    --schedule=/tmp/celery-beat-schedule

echo "✅ Celery Beat 已启动"
