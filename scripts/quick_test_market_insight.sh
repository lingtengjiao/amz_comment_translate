#!/bin/bash

# 快速测试市场洞察功能脚本

echo "=========================================="
echo "市场洞察功能快速测试"
echo "=========================================="
echo ""

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 python3"
    exit 1
fi

# 检查是否在项目根目录
if [ ! -f "backend/app/main.py" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "1. 运行后端API测试..."
echo "----------------------------------------"
python3 scripts/test_market_insight_api.py

TEST_RESULT=$?

echo ""
echo "=========================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ 后端测试通过！"
    echo ""
    echo "下一步："
    echo "1. 启动后端服务: cd backend && uvicorn app.main:app --reload"
    echo "2. 启动前端服务: cd frontend && npm run dev"
    echo "3. 打开浏览器测试前端功能"
    echo ""
    echo "详细测试指南请查看: docs/市场洞察功能测试指南.md"
else
    echo "❌ 后端测试失败，请检查错误信息"
    echo ""
    echo "常见问题："
    echo "1. 数据库连接失败 - 检查 .env 文件中的 DATABASE_URL"
    echo "2. 产品数据不足 - 确保数据库中有至少2个产品"
    echo "3. 依赖未安装 - 运行: pip install -r backend/requirements.txt"
fi
echo "=========================================="

exit $TEST_RESULT
