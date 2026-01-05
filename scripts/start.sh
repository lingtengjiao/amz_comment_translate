#!/bin/bash
# VOC-Master Quick Start Script
# 一键启动所有服务

set -e

echo "🚀 VOC-Master 启动脚本"
echo "========================"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 进入项目根目录
cd "$(dirname "$0")/.."

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，填入 QWEN_API_KEY"
    echo "   然后重新运行此脚本"
    exit 1
fi

# 检查 QWEN_API_KEY
if grep -q "your_qwen_api_key_here" .env; then
    echo "⚠️  请在 .env 文件中设置 QWEN_API_KEY"
    echo "   当前值为默认占位符"
    read -p "是否继续启动（翻译功能将不可用）? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🐳 启动 Docker 服务..."

# 使用 docker-compose 或 docker compose
if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build
else
    docker compose up -d --build
fi

echo ""
echo "⏳ 等待服务启动..."
sleep 5

echo ""
echo "✅ VOC-Master 已启动！"
echo ""
echo "📡 服务地址："
echo "   - 后端 API:     http://localhost:8000"
echo "   - API 文档:     http://localhost:8000/docs"
echo "   - 前端控制台:   http://localhost:3000"
echo ""
echo "📦 Chrome 插件安装："
echo "   1. 打开 chrome://extensions/"
echo "   2. 开启开发者模式"
echo "   3. 加载已解压的扩展程序 -> 选择 extension 目录"
echo ""
echo "🔍 查看日志: docker-compose logs -f"
echo "🛑 停止服务: docker-compose down"

