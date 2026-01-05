#!/bin/bash
# VOC-Master Stop Script
# 停止所有服务

set -e

echo "🛑 停止 VOC-Master 服务..."

cd "$(dirname "$0")/.."

if command -v docker-compose &> /dev/null; then
    docker-compose down
else
    docker compose down
fi

echo "✅ 所有服务已停止"

