#!/bin/bash

# 产品分类画板字段迁移脚本
# 添加 year 和 brand 字段到 collection_products 表

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 加载环境变量
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# 默认数据库连接参数
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-amz_comment}"
DB_USER="${DB_USER:-postgres}"

echo "================================"
echo "产品分类画板字段迁移"
echo "================================"
echo "数据库: $DB_NAME"
echo "主机: $DB_HOST:$DB_PORT"
echo ""

# 执行迁移
echo "执行迁移..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -f "$PROJECT_ROOT/db/migrate_product_board_fields.sql"

echo ""
echo "================================"
echo "迁移完成！"
echo "================================"
