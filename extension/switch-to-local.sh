#!/bin/bash
# 将插件切换回本地开发环境
# 本地环境地址: http://localhost

set -e

LOCAL_FRONTEND="http://localhost:3000"
LOCAL_BACKEND="http://localhost:8000/api/v1"

echo "=========================================="
echo "🏠 切换插件到本地开发环境"
echo "=========================================="
echo "前端地址: $LOCAL_FRONTEND"
echo "后端地址: $LOCAL_BACKEND"
echo ""

# 1. 修改 manifest.json
echo "📝 [1/4] 修改 manifest.json..."
sed -i '' \
  -e 's/"name": "VOC-Master: Amazon Review Collector"/"name": "VOC-Master: Amazon Review Collector (Local Dev)"/' \
  -e 's/"version": "1.0.5"/"version": "1.0.6"/' \
  -e 's|"http://115.191.30.209/\*"|"http://localhost:*/*",\n    "http://127.0.0.1:*/*"|g' \
  manifest.json

# 修复 externally_connectable
sed -i '' \
  -e 's|"http://115.191.30.209/\*"|"http://localhost:*/*",\n      "http://127.0.0.1:*/*"|g' \
  manifest.json

echo "   ✅ manifest.json 已更新"

# 2. 修改 service-worker.js
echo "📝 [2/4] 修改 service-worker.js..."
sed -i '' \
  -e "s|const API_BASE_URL = 'http://115.191.30.209/api/v1';|const API_BASE_URL = '$LOCAL_BACKEND';|" \
  src/background/service-worker.js

echo "   ✅ service-worker.js 已更新"

# 3. 修改 content.js
echo "📝 [3/4] 修改 content.js..."
sed -i '' \
  -e "s|API_BASE_URL: 'http://115.191.30.209/api/v1'|API_BASE_URL: '$LOCAL_BACKEND'|" \
  -e "s|DASHBOARD_URL: 'http://115.191.30.209'|DASHBOARD_URL: '$LOCAL_FRONTEND'|" \
  src/content/content.js

echo "   ✅ content.js 已更新"

# 4. 修改 popup.html
echo "📝 [4/4] 修改 popup.html..."
sed -i '' \
  -e "s|http://115.191.30.209/api/docs|http://localhost:8000/docs|g" \
  -e "s|http://115.191.30.209|$LOCAL_FRONTEND|g" \
  popup/popup.html

echo "   ✅ popup.html 已更新"

echo ""
echo "=========================================="
echo "✅ 切换完成！"
echo "=========================================="
echo ""
echo "📦 下一步: 在 Chrome 中刷新插件"
echo "   1. 访问 chrome://extensions/"
echo "   2. 找到 VOC-Master 插件"
echo "   3. 点击刷新按钮 🔄"
echo ""
echo "🔍 验证清单:"
echo "   1. manifest.json - 版本号 1.0.6"
echo "   2. manifest.json - 名称包含 'Local Dev'"
echo "   3. service-worker.js - API_BASE_URL = $LOCAL_BACKEND"
echo "   4. content.js - DASHBOARD_URL = $LOCAL_FRONTEND"
echo "   5. popup.html - 链接指向本地环境"
echo ""
