#!/bin/bash

# VOC-Master 插件本地环境诊断脚本

echo "🔍 VOC-Master 本地环境诊断"
echo "================================"
echo ""

# 1. 检查后端是否运行
echo "1️⃣ 检查后端服务..."
if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
  echo "   ✅ 后端运行正常 (localhost:8000)"
else
  echo "   ❌ 后端未运行！请启动后端服务："
  echo "      cd backend && python -m uvicorn app.main:app --reload --port 8000"
  exit 1
fi

# 2. 检查前端是否运行
echo ""
echo "2️⃣ 检查前端服务..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "   ✅ 前端运行正常 (localhost:3000)"
else
  echo "   ⚠️  前端未运行（可选）。如需使用控制台，请启动："
  echo "      cd frontend && npm run dev"
fi

# 3. 检查插件配置
echo ""
echo "3️⃣ 检查插件配置..."
EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查 service-worker.js
API_URL=$(grep "const API_BASE_URL" "$EXTENSION_DIR/src/background/service-worker.js" | grep -o "http://[^']*")
if [[ "$API_URL" == "http://localhost:8000/api/v1" ]]; then
  echo "   ✅ service-worker.js 配置正确"
else
  echo "   ❌ service-worker.js 配置错误: $API_URL"
fi

# 检查 content.js
CONTENT_API=$(grep "API_BASE_URL:" "$EXTENSION_DIR/src/content/content.js" | head -1 | grep -o "http://[^']*")
if [[ "$CONTENT_API" == "http://localhost:8000/api/v1" ]]; then
  echo "   ✅ content.js 配置正确"
else
  echo "   ❌ content.js 配置错误: $CONTENT_API"
fi

# 检查 popup.html
POPUP_URL=$(grep -A1 "打开控制台" "$EXTENSION_DIR/popup/popup.html" | grep href | grep -o "http://[^\"]*")
if [[ "$POPUP_URL" == "http://localhost:3000" ]]; then
  echo "   ✅ popup.html 配置正确"
else
  echo "   ❌ popup.html 配置错误: $POPUP_URL"
fi

# 4. 测试关键接口
echo ""
echo "4️⃣ 测试关键 API 接口..."

# 测试健康检查
if curl -s http://localhost:8000/api/v1/health > /dev/null 2>&1; then
  echo "   ✅ Health 接口正常"
else
  echo "   ❌ Health 接口失败"
fi

# 测试认证接口
if curl -s http://localhost:8000/api/v1/auth/verify > /dev/null 2>&1; then
  echo "   ✅ Auth 接口正常"
else
  echo "   ⚠️  Auth 接口异常（可能需要登录）"
fi

echo ""
echo "================================"
echo "✅ 诊断完成！"
echo ""
echo "📝 下一步操作："
echo "   1. 在 chrome://extensions/ 刷新插件"
echo "   2. 关闭并重新打开 Amazon 页面"
echo "   3. 按 F12 查看 Console 日志"
echo "   4. 测试采集功能"
echo ""
