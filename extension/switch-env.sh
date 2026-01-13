#!/bin/bash

# VOC-Master 插件环境配置管理脚本
# 用于快速切换本地开发环境和生产环境

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== VOC-Master 插件环境配置 ===${NC}"
echo ""

# 显示菜单
echo "请选择环境:"
echo "  1) 本地开发环境 (localhost)"
echo "  2) 生产环境 (线上服务器)"
echo "  3) 查看当前配置"
echo "  4) 退出"
echo ""
read -p "请输入选项 (1-4): " choice

case $choice in
  1)
    echo -e "${YELLOW}正在切换到本地开发环境...${NC}"
    
    # 修改 service-worker.js
    sed -i.bak "s|const API_BASE_URL = '.*';|const API_BASE_URL = 'http://localhost:8000/api/v1';|g" \
      "$EXTENSION_DIR/src/background/service-worker.js"
    
    # 修改 content.js
    sed -i.bak "s|API_BASE_URL: '.*',|API_BASE_URL: 'http://localhost:8000/api/v1',|g" \
      "$EXTENSION_DIR/src/content/content.js"
    sed -i.bak "s|DASHBOARD_URL: '.*',|DASHBOARD_URL: 'http://localhost:3000',|g" \
      "$EXTENSION_DIR/src/content/content.js"
    
    # 修改 popup.html
    sed -i.bak 's|href="http://[^"]*" target="_blank" class="link-btn">|href="http://localhost:3000" target="_blank" class="link-btn">|1' \
      "$EXTENSION_DIR/popup/popup.html"
    sed -i.bak 's|href="http://[^"]*" target="_blank" class="link-btn">|href="http://localhost:8000/docs" target="_blank" class="link-btn">|2' \
      "$EXTENSION_DIR/popup/popup.html"
    
    echo -e "${GREEN}✓ 已切换到本地开发环境${NC}"
    echo "  - API: http://localhost:8000/api/v1"
    echo "  - Dashboard: http://localhost:3000"
    echo "  - API Docs: http://localhost:8000/docs"
    echo ""
    echo -e "${YELLOW}请在 chrome://extensions/ 刷新插件以生效${NC}"
    ;;
    
  2)
    echo -e "${YELLOW}正在切换到生产环境...${NC}"
    
    read -p "请输入生产环境 API 地址 (例如: http://115.191.30.209:8000/api/v1): " prod_api
    read -p "请输入生产环境 Dashboard 地址 (例如: http://115.191.30.209): " prod_dashboard
    
    # 修改 service-worker.js
    sed -i.bak "s|const API_BASE_URL = '.*';|const API_BASE_URL = '$prod_api';|g" \
      "$EXTENSION_DIR/src/background/service-worker.js"
    
    # 修改 content.js
    sed -i.bak "s|API_BASE_URL: '.*',|API_BASE_URL: '$prod_api',|g" \
      "$EXTENSION_DIR/src/content/content.js"
    sed -i.bak "s|DASHBOARD_URL: '.*',|DASHBOARD_URL: '$prod_dashboard',|g" \
      "$EXTENSION_DIR/src/content/content.js"
    
    # 修改 popup.html
    sed -i.bak "s|href=\"http://[^\"]*\" target=\"_blank\" class=\"link-btn\">|href=\"$prod_dashboard\" target=\"_blank\" class=\"link-btn\">|1" \
      "$EXTENSION_DIR/popup/popup.html"
    sed -i.bak "s|href=\"http://[^\"]*\" target=\"_blank\" class=\"link-btn\">|href=\"$prod_api\" target=\"_blank\" class=\"link-btn\">|2" \
      "$EXTENSION_DIR/popup/popup.html"
    
    echo -e "${GREEN}✓ 已切换到生产环境${NC}"
    echo "  - API: $prod_api"
    echo "  - Dashboard: $prod_dashboard"
    echo ""
    echo -e "${YELLOW}请在 chrome://extensions/ 刷新插件以生效${NC}"
    ;;
    
  3)
    echo -e "${YELLOW}当前配置:${NC}"
    echo ""
    echo "service-worker.js:"
    grep "const API_BASE_URL" "$EXTENSION_DIR/src/background/service-worker.js"
    echo ""
    echo "content.js:"
    grep "API_BASE_URL:" "$EXTENSION_DIR/src/content/content.js" | head -1
    grep "DASHBOARD_URL:" "$EXTENSION_DIR/src/content/content.js" | head -1
    echo ""
    echo "popup.html:"
    grep -A1 "打开控制台" "$EXTENSION_DIR/popup/popup.html" | grep href | head -1
    grep -A1 "API 文档" "$EXTENSION_DIR/popup/popup.html" | grep href | head -1
    ;;
    
  4)
    echo "退出"
    exit 0
    ;;
    
  *)
    echo -e "${RED}无效选项${NC}"
    exit 1
    ;;
esac

# 清理备份文件
rm -f "$EXTENSION_DIR/src/background/service-worker.js.bak"
rm -f "$EXTENSION_DIR/src/content/content.js.bak"

echo ""
echo -e "${GREEN}完成！${NC}"
