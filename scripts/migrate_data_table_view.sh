#!/bin/bash
# 执行数据表格视图迁移脚本

set -e

echo "=========================================="
echo "执行数据表格视图迁移"
echo "=========================================="

# 检查环境变量
if [ -z "$DATABASE_URL" ]; then
    echo "错误: DATABASE_URL 环境变量未设置"
    echo "请设置 DATABASE_URL 或手动执行 SQL 文件"
    exit 1
fi

# 执行迁移
echo "正在执行迁移..."
psql "$DATABASE_URL" -f db/migrate_data_table_view.sql

echo ""
echo "=========================================="
echo "迁移完成！"
echo "=========================================="
echo ""
echo "新增字段："
echo "  collection_products 表:"
echo "    - monthly_sales: 月度销量数据（JSONB）"
echo "    - custom_tags: 自定义标签数据（JSONB）"
echo "  keyword_collections 表:"
echo "    - custom_fields: 自定义字段定义（JSONB）"
echo ""
