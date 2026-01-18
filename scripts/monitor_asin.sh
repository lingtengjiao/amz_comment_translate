#!/bin/bash
# 实时监控 ASIN 分析流程日志
# Usage: ./scripts/monitor_asin.sh B0FFTN3SQS

ASIN="${1:-B0FFTN3SQS}"
PRODUCT_ID="65da33b0-4bef-49dc-9006-0386e7a05f69"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 监控 ASIN: $ASIN${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}停止监控...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 监控后端日志
(
    docker logs -f --tail=0 voc-backend 2>&1 | grep --line-buffered -iE "B0FFTN3SQS|collection-complete|task_full_auto|65da33b0" | while read -r line; do
        echo -e "${BLUE}[BACKEND]${NC} $line"
    done
) &

# 监控 VIP Worker (学习任务)
(
    docker logs -f --tail=0 voc-worker-vip 2>&1 | grep --line-buffered -iE "B0FFTN3SQS|learning|dimension|context|65da33b0" | while read -r line; do
        echo -e "${GREEN}[VIP-WORKER]${NC} $line"
    done
) &

# 监控 Insight Worker
(
    docker logs -f --tail=0 voc-worker-insight 2>&1 | grep --line-buffered -iE "B0FFTN3SQS|insight|extract_insights|65da33b0" | while read -r line; do
        echo -e "${YELLOW}[INSIGHT]${NC} $line"
    done
) &

# 监控 Theme Worker
(
    docker logs -f --tail=0 voc-worker-theme 2>&1 | grep --line-buffered -iE "B0FFTN3SQS|theme|extract_themes|65da33b0" | while read -r line; do
        echo -e "${MAGENTA}[THEME]${NC} $line"
    done
) &

# 监控 Translation Worker
(
    docker logs -f --tail=0 voc-worker-trans 2>&1 | grep --line-buffered -iE "B0FFTN3SQS|translation|translate|65da33b0" | while read -r line; do
        echo -e "${CYAN}[TRANSLATION]${NC} $line"
    done
) &

# 定期显示进度
(
    while true; do
        sleep 15
        echo ""
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}📊 进度检查 ($(date +%H:%M:%S))${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
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
    '高置信度洞察', COUNT(*)::text
FROM review_insights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID') AND confidence = 'high'
UNION ALL
SELECT 
    '高置信度主题', COUNT(*)::text
FROM review_theme_highlights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID') AND confidence = 'high';
EOF
        
        echo ""
        echo -e "${YELLOW}任务状态:${NC}"
        docker exec voc-postgres psql -U vocmaster -d vocmaster -c "SELECT task_type, status, processed_items || '/' || total_items as progress, created_at FROM tasks WHERE product_id = '$PRODUCT_ID' ORDER BY created_at DESC LIMIT 5;"
        echo ""
    done
) &

echo -e "${GREEN}✅ 监控已启动，按 Ctrl+C 停止${NC}"
echo ""

# 等待所有后台进程
wait
