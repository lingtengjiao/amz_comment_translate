#!/bin/bash
# 完整测试 ASIN 并监控流程
# Usage: ./scripts/test_asin_monitor.sh B0FFTN3SQS

ASIN="${1:-B0FFTN3SQS}"

echo "=========================================="
echo "🚀 ASIN 完整测试监控: $ASIN"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 检查产品状态
echo -e "${BLUE}=== 1. 检查产品状态 ===${NC}"
PRODUCT_INFO=$(docker exec voc-postgres psql -U vocmaster -d vocmaster -t -A -F"," << EOF
SELECT 
    p.id::text,
    p.asin,
    p.title,
    COUNT(DISTINCT r.id) as review_count,
    COUNT(DISTINCT CASE WHEN r.translation_status = 'completed' THEN r.id END) as translated_count,
    COUNT(DISTINCT ri.id) as insight_count,
    COUNT(DISTINCT rth.id) as theme_count
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id
LEFT JOIN review_insights ri ON ri.review_id = r.id
LEFT JOIN review_theme_highlights rth ON rth.review_id = r.id
WHERE p.asin = '$ASIN'
GROUP BY p.id, p.asin, p.title;
EOF
)

if [ -z "$PRODUCT_INFO" ]; then
    echo -e "${RED}❌ 产品 $ASIN 不存在${NC}"
    exit 1
fi

IFS=',' read -r PRODUCT_ID PRODUCT_ASIN PRODUCT_TITLE REVIEW_COUNT TRANSLATED_COUNT INSIGHT_COUNT THEME_COUNT <<< "$PRODUCT_INFO"

echo "产品ID: $PRODUCT_ID"
echo "ASIN: $PRODUCT_ASIN"
echo "标题: $PRODUCT_TITLE"
echo "评论总数: $REVIEW_COUNT"
echo "已翻译: $TRANSLATED_COUNT"
echo "已有洞察: $INSIGHT_COUNT"
echo "已有主题: $THEME_COUNT"
echo ""

# 2. 检查是否有评论
if [ "$REVIEW_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ 该产品没有评论，请先采集评论${NC}"
    exit 1
fi

# 3. 触发分析流程
echo -e "${BLUE}=== 2. 触发分析流程 ===${NC}"
echo "调用 collection-complete 接口..."

RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/products/$ASIN/collection-complete?workflow_mode=one_step_insight" \
  -H "Content-Type: application/json")

echo "响应: $RESPONSE"
echo ""

# 4. 开始监控日志
echo -e "${BLUE}=== 3. 开始监控日志（按 Ctrl+C 停止）===${NC}"
echo ""

# 监控函数
monitor_logs() {
    local container=$1
    local filter=$2
    local color=$3
    
    docker logs -f --tail=0 "$container" 2>&1 | grep --line-buffered -i "$filter" | while read -r line; do
        echo -e "${color}[$container]${NC} $line"
    done &
}

# 启动多个监控进程
monitor_logs "voc-backend" "B0FFTN3SQS\|collection-complete\|task_full_auto" "$BLUE"
monitor_logs "voc-worker-vip" "B0FFTN3SQS\|learning\|dimension\|context" "$GREEN"
monitor_logs "voc-worker-insight" "B0FFTN3SQS\|insight\|extract_insights" "$YELLOW"
monitor_logs "voc-worker-theme" "B0FFTN3SQS\|theme\|extract_themes" "$YELLOW"
monitor_logs "voc-worker-trans" "B0FFTN3SQS\|translation" "$GREEN"

# 定期检查进度
(
    while true; do
        sleep 10
        echo ""
        echo -e "${BLUE}=== 进度检查 ===${NC}"
        docker exec voc-postgres psql -U vocmaster -d vocmaster << EOF
SELECT 
    '评论总数' as item, COUNT(*)::text as value
FROM reviews WHERE product_id = '$PRODUCT_ID'
UNION ALL
SELECT 
    '已翻译', COUNT(*)::text
FROM reviews WHERE product_id = '$PRODUCT_ID' AND translation_status = 'completed'
UNION ALL
SELECT 
    '有洞察', COUNT(*)::text
FROM review_insights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID')
UNION ALL
SELECT 
    '有主题', COUNT(*)::text
FROM review_theme_highlights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID')
UNION ALL
SELECT 
    '任务状态', STRING_AGG(task_type || ':' || status, ', ')
FROM tasks WHERE product_id = '$PRODUCT_ID' AND created_at > NOW() - INTERVAL '1 hour';
EOF
        echo ""
    done
) &

# 等待所有后台进程
wait
