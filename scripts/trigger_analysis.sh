#!/bin/bash
# 手动触发 B01ISA8UWI 的洞察和主题提取任务

echo "=========================================="
echo "手动触发洞察和主题提取任务"
echo "=========================================="

PRODUCT_ID="6a4c1bc4-7769-482b-ab2a-782625fe291c"
ASIN="B01ISA8UWI"

echo ""
echo "=== 1. 检查数据状态 ==="
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
FROM review_theme_highlights WHERE review_id IN (SELECT id FROM reviews WHERE product_id = '$PRODUCT_ID');
EOF

echo ""
echo "=== 2. 清理旧任务记录 ==="
docker exec voc-postgres psql -U vocmaster -d vocmaster -c "
DELETE FROM tasks WHERE product_id = '$PRODUCT_ID' AND task_type IN ('insights', 'themes');
"

echo ""
echo "=== 3. 使用 Python 脚本触发任务 ==="
docker exec voc-backend python3 << 'PYEOF'
import sys
sys.path.insert(0, '/app')

from app.db.session import get_sync_db
from app.models.task import Task, TaskType, TaskStatus
from app.models.product import Product
from app.worker import task_extract_insights, task_extract_themes
from sqlalchemy import select
import uuid

product_id_str = '6a4c1bc4-7769-482b-ab2a-782625fe291c'
product_id = uuid.UUID(product_id_str)

# 创建任务记录
db = next(get_sync_db())

# 创建洞察任务记录
insight_task = Task(
    product_id=product_id,
    task_type=TaskType.INSIGHTS.value,
    status=TaskStatus.PENDING.value,
    total_items=210,
    processed_items=0
)
db.add(insight_task)

# 创建主题任务记录
theme_task = Task(
    product_id=product_id,
    task_type=TaskType.THEMES.value,
    status=TaskStatus.PENDING.value,
    total_items=210,
    processed_items=0
)
db.add(theme_task)

db.commit()

print(f'✅ 任务记录已创建')
print(f'   洞察任务: {insight_task.id}')
print(f'   主题任务: {theme_task.id}')

# 触发 Celery 任务
try:
    result1 = task_extract_insights.apply_async(
        args=[product_id_str],
        queue='insight_extraction'
    )
    print(f'✅ 洞察 Celery 任务: {result1.id}')
    
    # 更新任务记录
    insight_task.celery_task_id = result1.id
    db.commit()
except Exception as e:
    print(f'❌ 洞察任务触发失败: {e}')

try:
    result2 = task_extract_themes.apply_async(
        args=[product_id_str],
        queue='theme_extraction'
    )
    print(f'✅ 主题 Celery 任务: {result2.id}')
    
    # 更新任务记录
    theme_task.celery_task_id = result2.id
    db.commit()
except Exception as e:
    print(f'❌ 主题任务触发失败: {e}')

db.close()
PYEOF

echo ""
echo "=== 4. 等待5秒后检查队列 ==="
sleep 5
docker exec voc-redis redis-cli LLEN insight_extraction
docker exec voc-redis redis-cli LLEN theme_extraction

echo ""
echo "=== 5. 检查任务状态 ==="
docker exec voc-postgres psql -U vocmaster -d vocmaster -c "
SELECT task_type, status, total_items, processed_items, celery_task_id
FROM tasks
WHERE product_id = '$PRODUCT_ID'
ORDER BY created_at DESC;
"

echo ""
echo "=========================================="
echo "任务已触发，请查看 Worker 日志监控进度"
echo "=========================================="
