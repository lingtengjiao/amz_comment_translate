#!/bin/bash
# 快速监控 ASIN 分析进度
# Usage: ./scripts/quick_monitor.sh B0FFTN3SQS

ASIN="${1:-B0FFTN3SQS}"
PRODUCT_ID="65da33b0-4bef-49dc-9006-0386e7a05f69"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

while true; do
    clear
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}📊 ASIN: $ASIN 实时监控${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 数据统计
    echo -e "${GREEN}=== 数据统计 ===${NC}"
    docker exec voc-postgres psql -U vocmaster -d vocmaster -t << EOF
SELECT 
    '评论总数: ' || COUNT(*)::text
FROM reviews WHERE product_id = '$PRODUCT_ID'
UNION ALL
SELECT 
    '已翻译: ' || COUNT(*)::text
FROM reviews WHERE product_id = '$PRODUCT_ID' AND translation_status = 'completed'
UNION ALL
SELECT 
    '有洞察: ' || COUNT(*)::text
FROM review_insights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID')
UNION ALL
SELECT 
    '有主题: ' || COUNT(*)::text
FROM review_theme_highlights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID')
UNION ALL
SELECT 
    '高置信度洞察: ' || COUNT(*)::text
FROM review_insights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID') AND confidence = 'high'
UNION ALL
SELECT 
    '高置信度主题: ' || COUNT(*)::text
FROM review_theme_highlights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID') AND confidence = 'high';
EOF
    
    echo ""
    echo -e "${YELLOW}=== 任务状态 ===${NC}"
    docker exec voc-postgres psql -U vocmaster -d vocmaster -c "SELECT task_type, status, processed_items || '/' || total_items as progress, TO_CHAR(created_at, 'HH24:MI:SS') as time FROM tasks WHERE product_id = '$PRODUCT_ID' ORDER BY created_at DESC LIMIT 5;"
    
    echo ""
    echo -e "${BLUE}=== 最近日志 (最后5条) ===${NC}"
    echo -e "${YELLOW}[INSIGHT]${NC}"
    docker logs --tail=100 voc-worker-insight 2>&1 | grep -iE "B0FFTN3SQS|65da33b0|completed|extracted|processing" | tail -3
    echo ""
    echo -e "${YELLOW}[THEME]${NC}"
    docker logs --tail=100 voc-worker-theme 2>&1 | grep -iE "B0FFTN3SQS|65da33b0|completed|extracted|processing" | tail -3
    echo ""
    echo -e "${YELLOW}[VIP-LEARNING]${NC}"
    docker logs --tail=100 voc-worker-vip 2>&1 | grep -iE "B0FFTN3SQS|65da33b0|learning|dimension|context" | tail -3
    
    echo ""
    echo -e "${BLUE}按 Ctrl+C 停止监控${NC}"
    sleep 5
done
