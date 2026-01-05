#!/bin/bash
# 完整测试脚本：验证翻译流程

echo "🧪 VOC-Master 完整测试脚本"
echo "================================"
echo ""

# 1. 检查服务状态
echo "1️⃣ 检查服务状态..."
docker compose ps | grep -E "(app-backend|app-worker|db-postgres|db-redis)" | grep -E "(Up|Running)"
if [ $? -eq 0 ]; then
    echo "✅ 所有服务运行正常"
else
    echo "❌ 部分服务未运行"
    exit 1
fi

echo ""

# 2. 检查API Key
echo "2️⃣ 检查 Qwen API Key..."
docker compose exec -T app-worker python3 -c "from app.core.config import settings; exit(0 if settings.QWEN_API_KEY and settings.QWEN_API_KEY.startswith('sk-') else 1)" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ API Key 已配置"
else
    echo "❌ API Key 未配置，请检查 .env 文件"
    exit 1
fi

echo ""

# 3. 检查数据库
echo "3️⃣ 检查数据库..."
PRODUCT_COUNT=$(docker compose exec -T db-postgres psql -U vocmaster -d vocmaster -t -c "SELECT COUNT(*) FROM products;" 2>/dev/null | tr -d ' ')
REVIEW_COUNT=$(docker compose exec -T db-postgres psql -U vocmaster -d vocmaster -t -c "SELECT COUNT(*) FROM reviews;" 2>/dev/null | tr -d ' ')
echo "   产品数: $PRODUCT_COUNT"
echo "   评论数: $REVIEW_COUNT"

echo ""

# 4. 等待用户采集
echo "4️⃣ 准备就绪！"
echo ""
echo "📋 下一步操作："
echo "   1. 打开 Chrome 浏览器"
echo "   2. 访问 Amazon 商品页面（例如：https://www.amazon.com/dp/B0D83SW6V1）"
echo "   3. 点击浏览器工具栏中的 VOC-Master 扩展图标"
echo "   4. 选择要采集的星级和页数"
echo "   5. 点击「开始采集」"
echo ""
echo "⏳ 采集完成后，系统会自动触发翻译任务..."
echo ""
echo "🔍 监控翻译进度："
echo "   docker compose logs app-worker --follow"
echo ""
echo "📊 查看产品列表："
echo "   http://localhost:3000"
echo ""

