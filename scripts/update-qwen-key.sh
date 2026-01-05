#!/bin/bash
# 快速更新 Qwen API Key 并重启服务

echo "📝 请编辑 .env 文件，将 QWEN_API_KEY 替换为你的真实 API Key"
echo ""
echo "获取 API Key: https://dashscope.console.aliyun.com/"
echo ""
read -p "按 Enter 键继续，或 Ctrl+C 取消..."

# 重启服务以加载新配置
echo "🔄 重启服务以加载新配置..."
docker compose restart app-backend app-worker

echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 验证配置
echo "✅ 验证 API Key 配置..."
docker compose exec app-worker python3 -c "from app.core.config import settings; print('API Key:', '✅ 已配置' if settings.QWEN_API_KEY and settings.QWEN_API_KEY != 'your_qwen_api_key_here' else '❌ 未配置')"

echo ""
echo "🎉 配置完成！现在可以触发翻译任务了。"

