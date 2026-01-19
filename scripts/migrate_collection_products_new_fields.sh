#!/bin/bash

# 产品库产品表：新增排名和分类字段迁移脚本

set -e

echo "开始执行数据库迁移：collection_products 表新增字段..."

# 获取数据库连接信息
DB_HOST="${DB_HOST:-voc-postgres}"
DB_NAME="${DB_NAME:-vocmaster}"
DB_USER="${DB_USER:-vocmaster}"
DB_PASSWORD="${DB_PASSWORD:-vocmaster}"

# 执行迁移
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f db/migrate_collection_products_new_fields.sql

echo "迁移完成！"
