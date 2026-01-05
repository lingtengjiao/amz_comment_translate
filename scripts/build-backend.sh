#!/bin/bash
# 快速构建后端服务（测试 pip 安装速度）

set -e

echo "🚀 构建 VOC-Master 后端服务（使用清华 PyPI 源）"
echo "================================================"

cd "$(dirname "$0")/.."

echo ""
echo "📦 开始构建 backend 服务..."
echo "   使用清华 PyPI 源，预计速度提升 10 倍以上"
echo ""

# 使用 docker-compose 或 docker compose
if command -v docker-compose &> /dev/null; then
    docker-compose build app-backend
else
    docker compose build app-backend
fi

echo ""
echo "✅ 构建完成！"
echo ""
echo "💡 提示：如果 requirements.txt 没有变化，下次构建将直接使用缓存（0 秒）"
echo "💡 开发时修改代码无需重建，直接重启服务即可："
echo "   docker-compose restart app-backend"

