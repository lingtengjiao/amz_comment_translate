#!/bin/bash
# 将插件切换到生产环境
# 生产环境地址: http://115.191.30.209

set -e

PROD_FRONTEND="http://115.191.30.209"
PROD_BACKEND="http://115.191.30.209/api/v1"

echo "=========================================="
echo "🚀 切换插件到生产环境"
echo "=========================================="
echo "前端地址: $PROD_FRONTEND"
echo "后端地址: $PROD_BACKEND"
echo ""

# 1. 修改 manifest.json
echo "📝 [1/4] 修改 manifest.json..."
sed -i '' \
  -e 's/"name": "VOC-Master: Amazon Review Collector (Local Dev)"/"name": "VOC-Master: Amazon Review Collector"/' \
  -e 's/"version": "1.0.3"/"version": "1.0.4"/' \
  -e 's|http://localhost:\*\/\*|http://115.191.30.209/*|g' \
  -e 's|http://127.0.0.1:\*\/\*||g' \
  manifest.json

# 移除 127.0.0.1 相关的逗号和空行
sed -i '' '/127.0.0.1/d' manifest.json

echo "   ✅ manifest.json 已更新"

# 2. 修改 service-worker.js
echo "📝 [2/4] 修改 service-worker.js..."
sed -i '' \
  -e "s|const API_BASE_URL = 'http://localhost:8000/api/v1';|const API_BASE_URL = '$PROD_BACKEND';|" \
  src/background/service-worker.js

echo "   ✅ service-worker.js 已更新"

# 3. 修改 content.js
echo "📝 [3/4] 修改 content.js..."
sed -i '' \
  -e "s|API_BASE_URL: 'http://localhost:8000/api/v1'|API_BASE_URL: '$PROD_BACKEND'|" \
  -e "s|DASHBOARD_URL: 'http://localhost:3000'|DASHBOARD_URL: '$PROD_FRONTEND'|" \
  src/content/content.js

echo "   ✅ content.js 已更新"

# 4. 修改 popup.html
echo "📝 [4/4] 修改 popup.html..."
sed -i '' \
  -e "s|http://localhost:3000|$PROD_FRONTEND|g" \
  -e "s|http://localhost:8000/docs|$PROD_FRONTEND/api/docs|g" \
  popup/popup.html

echo "   ✅ popup.html 已更新"

echo ""
echo "=========================================="
echo "✅ 切换完成！"
echo "=========================================="
echo ""
echo "📦 下一步: 打包插件"
echo "   在 Chrome 中访问 chrome://extensions/"
echo "   点击「加载已解压的扩展程序」"
echo "   选择 extension 文件夹"
echo ""
echo "🔍 验证清单:"
echo "   1. manifest.json - 版本号 1.0.4"
echo "   2. manifest.json - 名称不含 'Local Dev'"
echo "   3. service-worker.js - API_BASE_URL = $PROD_BACKEND"
echo "   4. content.js - DASHBOARD_URL = $PROD_FRONTEND"
echo "   5. popup.html - 链接指向生产环境"
echo ""
