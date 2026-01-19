#!/bin/bash

# 将 board_config 拆分为 board_config 和 view_config 的迁移脚本

set -e

echo "开始迁移 board_config 字段..."

# 读取数据库连接信息
DB_HOST="${DB_HOST:-voc-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-voc}"
DB_USER="${DB_USER:-voc_user}"
DB_PASSWORD="${DB_PASSWORD:-voc_password}"

# 执行迁移 SQL
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f db/migrate_split_board_config.sql

echo "迁移完成！"
echo "board_config 现在只包含画板相关配置（boards, productBoards）"
echo "view_config 包含视图相关配置（colorRules, yearRanges, rankingRanges, rankingMetric, priceRanges, salesRanges, brandRanges）"
