#!/bin/bash
# 监控翻译进度脚本

echo "📊 VOC-Master 翻译进度监控"
echo "================================"
echo ""

while true; do
    clear
    echo "📊 VOC-Master 翻译进度监控 - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================"
    echo ""
    
    # 产品统计
    echo "📦 产品统计："
    PRODUCTS=$(curl -s http://localhost:8000/api/v1/products | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total', 0))" 2>/dev/null)
    echo "   总产品数: $PRODUCTS"
    echo ""
    
    # Worker日志（最近5条）
    echo "🔄 Worker 最新日志："
    docker compose logs app-worker --tail 5 2>&1 | grep -E "(Starting translation|Found.*pending|Translated|completed|failed|ERROR)" | tail -5
    echo ""
    
    # 翻译任务状态
    echo "📋 最近任务："
    docker compose exec -T db-postgres psql -U vocmaster -d vocmaster -c "SELECT id, status, total_items, processed_items, ROUND(100.0 * processed_items / NULLIF(total_items, 0), 1) as progress FROM tasks ORDER BY created_at DESC LIMIT 3;" 2>/dev/null | tail -4
    echo ""
    
    # 评论统计
    echo "💬 评论统计："
    docker compose exec -T db-postgres psql -U vocmaster -d vocmaster -c "SELECT translation_status, COUNT(*) FROM reviews GROUP BY translation_status;" 2>/dev/null | tail -5
    echo ""
    
    echo "按 Ctrl+C 退出监控..."
    sleep 5
done

