"""
Celery Worker Configuration and Tasks

This module handles asynchronous processing of reviews:
1. Translation via Qwen API
2. Sentiment analysis
3. Database updates
"""
import logging
import time
from typing import Optional

from celery import Celery
from sqlalchemy import create_engine, select, update, and_, func
from sqlalchemy.orm import sessionmaker
import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis 客户端（用于分布式锁）
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# Create Celery application
celery_app = Celery(
    "voc_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes timeout per task (increased from 600s to handle large batches)
    task_soft_time_limit=1500,  # 25 minutes soft limit (warning before hard kill)
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_routes={
        # 翻译相关任务（高频、轻量）
        "app.worker.task_translate_bullet_points": {"queue": "translation"},
        "app.worker.task_process_reviews": {"queue": "translation"},
        "app.worker.task_ingest_translation_only": {"queue": "translation"},  # 流式轻量翻译
        
        # 分析相关任务（低频、重量级）
        "app.worker.task_extract_insights": {"queue": "analysis"},  # 洞察提取
        "app.worker.task_extract_themes": {"queue": "analysis"},  # 主题提取
        "app.worker.task_scientific_learning_and_analysis": {"queue": "analysis"},  # 科学学习+回填
        "app.worker.task_full_auto_analysis": {"queue": "analysis"},  # 🔥 全自动分析（独立队列）
    },
)

# Synchronous database connection for Celery worker
# (Celery doesn't support async well, so we use sync SQLAlchemy)
SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")
sync_engine = create_engine(SYNC_DATABASE_URL, echo=settings.DEBUG)
SyncSession = sessionmaker(bind=sync_engine)


def get_sync_db():
    """Get synchronous database session for worker."""
    return SyncSession()


# ============== Worker 启动时清理卡住的任务 ==============

def cleanup_stuck_reviews():
    """
    清理卡在 'processing' 状态的评论。
    当 Worker 重启时，之前正在处理的评论可能会卡在 processing 状态。
    这个函数将它们重置为 pending，让它们可以被重新处理。
    """
    from app.models.review import Review
    
    db = get_sync_db()
    try:
        result = db.execute(
            update(Review)
            .where(Review.translation_status == "processing")
            .values(translation_status="pending")
        )
        db.commit()
        
        if result.rowcount > 0:
            logger.warning(f"[启动清理] 已将 {result.rowcount} 条卡住的评论重置为 pending 状态")
        else:
            logger.info("[启动清理] 没有发现卡住的评论")
    except Exception as e:
        logger.error(f"[启动清理] 清理卡住评论失败: {e}")
        db.rollback()
    finally:
        db.close()


def cleanup_stuck_tasks():
    """
    清理卡住的任务（心跳超时）。
    将 PROCESSING 状态但心跳超时的任务标记为 TIMEOUT。
    """
    from app.models.task import Task, TaskStatus
    from datetime import datetime, timezone, timedelta
    
    db = get_sync_db()
    try:
        # 查找所有 processing 状态的任务
        result = db.execute(
            select(Task).where(Task.status == TaskStatus.PROCESSING.value)
        )
        tasks = result.scalars().all()
        
        timeout_count = 0
        for task in tasks:
            if task.is_heartbeat_timeout:
                task.status = TaskStatus.TIMEOUT.value
                task.error_message = f"心跳超时：最后心跳时间 {task.last_heartbeat}"
                timeout_count += 1
                logger.warning(f"[启动清理] 任务 {task.id} ({task.task_type}) 心跳超时，标记为 TIMEOUT")
        
        if timeout_count > 0:
            db.commit()
            logger.warning(f"[启动清理] 已将 {timeout_count} 个超时任务标记为 TIMEOUT")
        else:
            logger.info("[启动清理] 没有发现心跳超时的任务")
            
    except Exception as e:
        logger.error(f"[启动清理] 清理超时任务失败: {e}")
        db.rollback()
    finally:
        db.close()


# ============== 心跳更新辅助函数 ==============

def update_task_heartbeat(db, task_id: str, processed_items: int = None):
    """
    更新任务心跳时间。
    
    Args:
        db: 数据库会话
        task_id: 任务 ID
        processed_items: 可选，同时更新已处理数量
    """
    from app.models.task import Task
    from datetime import datetime, timezone
    
    try:
        values = {"last_heartbeat": datetime.now(timezone.utc)}
        if processed_items is not None:
            values["processed_items"] = processed_items
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(**values)
        )
        db.commit()
    except Exception as e:
        logger.error(f"更新任务心跳失败: {e}")
        db.rollback()


def get_or_create_task(db, product_id: str, task_type: str, total_items: int = 0, celery_task_id: str = None):
    """
    获取或创建任务记录。
    
    Args:
        db: 数据库会话
        product_id: 产品 ID
        task_type: 任务类型
        total_items: 总项目数
        celery_task_id: Celery 任务 ID
        
    Returns:
        Task: 任务对象
    """
    from app.models.task import Task, TaskStatus
    from datetime import datetime, timezone
    
    # 查找现有任务
    result = db.execute(
        select(Task).where(
            and_(
                Task.product_id == product_id,
                Task.task_type == task_type
            )
        )
    )
    task = result.scalar_one_or_none()
    
    now = datetime.now(timezone.utc)
    
    if task:
        # 更新现有任务
        task.status = TaskStatus.PROCESSING.value
        task.total_items = total_items
        task.processed_items = 0
        task.last_heartbeat = now
        task.celery_task_id = celery_task_id
        task.error_message = None
    else:
        # 创建新任务
        task = Task(
            product_id=product_id,
            task_type=task_type,
            status=TaskStatus.PROCESSING.value,
            total_items=total_items,
            processed_items=0,
            last_heartbeat=now,
            celery_task_id=celery_task_id
        )
        db.add(task)
    
    db.commit()
    db.refresh(task)
    return task


def complete_task(db, task_id: str, success: bool = True, error_message: str = None):
    """
    完成任务。
    
    Args:
        db: 数据库会话
        task_id: 任务 ID
        success: 是否成功
        error_message: 错误信息（失败时）
    """
    from app.models.task import Task, TaskStatus
    
    try:
        status = TaskStatus.COMPLETED.value if success else TaskStatus.FAILED.value
        values = {
            "status": status,
            "last_heartbeat": None  # 清除心跳，表示任务已结束
        }
        if error_message:
            values["error_message"] = error_message
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(**values)
        )
        db.commit()
    except Exception as e:
        logger.error(f"完成任务失败: {e}")
        db.rollback()


# 使用 Celery 信号在 Worker 启动时执行清理
from celery.signals import worker_ready

@worker_ready.connect
def on_worker_ready(**kwargs):
    """Worker 启动完成后执行清理"""
    logger.info("Worker 已就绪，开始检查卡住的任务...")
    cleanup_stuck_reviews()
    cleanup_stuck_tasks()  # [NEW] 清理心跳超时的任务


# ============== 任务1: 五点翻译 ==============

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def task_translate_bullet_points(self, product_id: str):
    """
    Translate product bullet points and title.
    This task should run FIRST, before review translation.
    
    Args:
        product_id: UUID of the product
    """
    from app.models.product import Product
    from app.services.translation import translation_service
    import json
    
    logger.info(f"Starting bullet points translation for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Get product
        result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            logger.error(f"Product {product_id} not found")
            return {"success": False, "error": "Product not found"}
        
        translated_title = None
        translated_bullets = None
        
        # 1. Translate product title if not already translated
        if product.title and not product.title_translated:
            try:
                translated_title = translation_service.translate_product_title(product.title)
                product.title_translated = translated_title
                logger.info(f"Translated product title: {translated_title[:50]}...")
            except Exception as e:
                logger.error(f"Failed to translate product title: {e}")
        
        # 2. Translate bullet points if not already translated
        if product.bullet_points and not product.bullet_points_translated:
            try:
                # Parse bullet points from JSON
                bullet_points = json.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
                
                if bullet_points and len(bullet_points) > 0:
                    translated_bullets = translation_service.translate_bullet_points(bullet_points)
                    product.bullet_points_translated = json.dumps(translated_bullets, ensure_ascii=False)
                    logger.info(f"Translated {len(translated_bullets)} bullet points")
            except Exception as e:
                logger.error(f"Failed to translate bullet points: {e}")
        
        db.commit()
        
        return {
            "success": True,
            "product_id": product_id,
            "title_translated": translated_title is not None,
            "bullet_points_translated": translated_bullets is not None
        }
        
    except Exception as e:
        logger.error(f"Bullet points translation failed for product {product_id}: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== 任务2: 评论翻译 ==============

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def task_process_reviews(self, product_id: str, task_id: str):
    """
    Async task to process and translate reviews.
    
    Workflow:
    1. Get pending reviews from database
    2. For each review:
       a. Call Qwen API for translation
       b. Analyze sentiment
       c. Extract insights (深度解读)
       d. Update database
       e. Update task progress
    3. Mark task as completed
    
    Args:
        product_id: UUID of the product
        task_id: UUID of the task to track progress
    """
    from app.models.review import Review
    from app.models.task import Task
    from app.models.insight import ReviewInsight
    from app.services.translation import translation_service
    
    logger.info(f"Starting translation task {task_id} for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Update task status to processing
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(status="processing")
        )
        db.commit()
        
        # Get pending reviews (including processing and failed - to retry stuck/failed translations)
        # ordered by review_date descending (newest first, matching frontend display)
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status.in_(["pending", "processing", "failed"])
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        failed = 0
        
        logger.info(f"Found {total_reviews} pending reviews to translate")
        
        for review in reviews:
            try:
                # Mark as processing
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(translation_status="processing")
                )
                db.commit()
                
                # Validate body_original exists
                if not review.body_original or not review.body_original.strip():
                    logger.warning(f"Review {review.id} has empty body, skipping translation")
                    db.execute(
                        update(Review)
                        .where(Review.id == review.id)
                        .values(translation_status="failed")
                    )
                    db.commit()
                    failed += 1
                    continue
                
                # 只做翻译，不提取洞察（洞察需要用户手动触发）
                title_translated, body_translated, sentiment, _ = translation_service.translate_review(
                    title=review.title_original,
                    body=review.body_original,
                    extract_insights=False  # 关闭自动洞察提取
                )
                
                # Validate translation results
                if not body_translated or not body_translated.strip():
                    logger.error(f"Translation returned empty for review {review.id}, body: {review.body_original[:100]}")
                    raise ValueError("Translation returned empty result")
                
                # Update review with translation only
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(
                        title_translated=title_translated if title_translated and title_translated.strip() else None,
                        body_translated=body_translated,
                        sentiment=sentiment.value,
                        translation_status="completed"
                    )
                )
                
                processed += 1
                
                # Update task progress
                db.execute(
                    update(Task)
                    .where(Task.id == task_id)
                    .values(processed_items=processed)
                )
                db.commit()
                
                logger.debug(f"Translated review {review.id}: {review.rating} stars")
                
                # Rate limiting: wait between API calls
                time.sleep(0.2)
                
            except Exception as e:
                logger.error(f"Failed to translate review {review.id}: {e}", exc_info=True)
                failed += 1
                
                # Mark review as failed (don't save empty translations)
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(
                        translation_status="failed",
                        title_translated=None,
                        body_translated=None
                    )
                )
                db.commit()
                
                # Continue with next review
                continue
        
        # Check if there are still pending reviews
        from app.models.review import TranslationStatus
        pending_count_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.PENDING.value
                )
            )
        )
        pending_count = pending_count_result.scalar() or 0
        
        # Update task status - only mark as completed if no pending reviews
        if pending_count == 0:
            final_status = "completed" if failed == 0 else "completed"
        else:
            # Still have pending reviews, keep as processing
            final_status = "processing"
        
        error_msg = f"{failed} reviews failed" if failed > 0 else None
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                status=final_status,
                processed_items=processed,
                error_message=error_msg
            )
        )
        db.commit()
        
        logger.info(f"Task {task_id} completed: {processed} translated, {failed} failed")
        
        return {
            "task_id": task_id,
            "product_id": product_id,
            "total": total_reviews,
            "processed": processed,
            "failed": failed
        }
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}")
        
        # Mark task as failed
        try:
            db.execute(
                update(Task)
                .where(Task.id == task_id)
                .values(
                    status="failed",
                    error_message=str(e)
                )
            )
            db.commit()
        except:
            pass
        
        # Retry the task
        raise self.retry(exc=e)
        
    finally:
        db.close()


@celery_app.task
def task_health_check():
    """Simple task to verify worker is running."""
    return {"status": "healthy", "worker": "voc_worker"}


@celery_app.task
def task_retry_failed_reviews(product_id: str):
    """
    Retry translation for failed reviews.
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    
    db = get_sync_db()
    
    try:
        # Reset failed reviews to pending
        result = db.execute(
            update(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "failed"
                )
            )
            .values(translation_status="pending")
        )
        db.commit()
        
        logger.info(f"Reset {result.rowcount} failed reviews to pending")
        
        # Trigger processing
        task_process_reviews.delay(product_id, None)
        
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_extract_insights(self, product_id: str):
    """
    Extract insights for already translated reviews (without re-translating).
    
    This task:
    1. Gets all translated reviews that don't have insights yet
    2. **[NEW] Loads product-specific dimensions if available**
    3. Calls AI to extract insights (using dimensions for categorization)
    4. Saves insights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.insight import ReviewInsight
    from app.models.product_dimension import ProductDimension
    from app.models.task import Task, TaskType, TaskStatus
    from app.services.translation import translation_service
    from sqlalchemy import delete, exists
    
    logger.info(f"Starting insight extraction for product {product_id}")
    
    db = get_sync_db()
    task_record = None
    
    try:
        # [NEW] 获取产品的维度 Schema（如果有的话）
        dimension_result = db.execute(
            select(ProductDimension)
            .where(ProductDimension.product_id == product_id)
            .order_by(ProductDimension.created_at)
        )
        dimensions = dimension_result.scalars().all()
        
        # 转换为 schema 格式
        dimension_schema = None
        if dimensions and len(dimensions) > 0:
            dimension_schema = [
                {"name": dim.name, "description": dim.description or ""}
                for dim in dimensions
            ]
            logger.info(f"使用 {len(dimension_schema)} 个产品维度进行洞察提取")
        else:
            logger.info(f"产品暂无定义维度，使用通用洞察提取逻辑")
        
        # [FIX] 先获取总评论数（已翻译的评论）
        total_translated_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "completed",
                    Review.body_translated.isnot(None),
                    Review.is_deleted == False
                )
            )
        )
        total_translated = total_translated_result.scalar() or 0
        
        # [FIX] 获取已有洞察的评论数（processed_items）
        already_processed_result = db.execute(
            select(func.count(func.distinct(ReviewInsight.review_id)))
            .join(Review, Review.id == ReviewInsight.review_id)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.is_deleted == False
                )
            )
        )
        already_processed = already_processed_result.scalar() or 0
        
        # [NEW] 创建/更新 Task 记录（total_items = 总评论数，processed_items = 已处理数）
        task_record = get_or_create_task(
            db=db,
            product_id=product_id,
            task_type=TaskType.INSIGHTS.value,
            total_items=total_translated,  # 总评论数（固定值）
            celery_task_id=self.request.id
        )
        # 设置已处理数为当前已有洞察的评论数
        task_record.processed_items = already_processed
        db.commit()
        logger.info(f"Task record: total_items={total_translated}, processed_items={already_processed}, remaining={total_translated - already_processed}")
        
        # [FIX] 使用 NOT EXISTS 子查询排除已有洞察的评论，避免重复处理
        insight_exists_subquery = (
            select(ReviewInsight.id)
            .where(ReviewInsight.review_id == Review.id)
            .exists()
        )
        
        # Get translated reviews that DON'T have insights yet - ordered by review_date to match page display order
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "completed",
                    Review.body_translated.isnot(None),
                    Review.is_deleted == False,
                    ~insight_exists_subquery  # [FIX] Only process reviews without insights
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        reviews_to_process = len(reviews)
        processed = 0
        insights_extracted = 0
        
        logger.info(f"Found {reviews_to_process} reviews remaining for insight extraction (total={total_translated}, already_done={already_processed})")
        
        for review in reviews:
            try:
                # 对每条评论都执行洞察提取（即使内容很短，结果可能为空）
                # [UPDATED] 传入维度 schema，让 AI 按定义的维度分类
                insights = translation_service.extract_insights(
                    original_text=review.body_original or "",
                    translated_text=review.body_translated or "",
                    dimension_schema=dimension_schema  # [NEW] 注入维度
                )
                
                # [FIX] 由于现在只处理没有洞察的评论，不需要删除旧数据
                # Insert new insights (if any)
                if insights:
                    for insight_data in insights:
                        insight = ReviewInsight(
                            review_id=review.id,
                            insight_type=insight_data.get('type', 'emotion'),
                            quote=insight_data.get('quote', ''),
                            quote_translated=insight_data.get('quote_translated'),
                            analysis=insight_data.get('analysis', ''),
                            dimension=insight_data.get('dimension')
                        )
                        db.add(insight)
                    
                    insights_extracted += len(insights)
                    logger.debug(f"Extracted {len(insights)} insights for review {review.id}")
                else:
                    # 即使没有洞察，也插入一个标记记录，表示已处理
                    # 这样统计会显示 100%，且下次不会重复处理
                    empty_marker = ReviewInsight(
                        review_id=review.id,
                        insight_type="_empty",  # 特殊标记，表示内容太短无洞察
                        quote="",
                        analysis=""
                    )
                    db.add(empty_marker)
                    logger.debug(f"No insights found for review {review.id} (content too short), marked as processed")
                
                db.commit()
                processed += 1
                
                # [FIX] 定期更新 Task 进度（每10条更新一次）
                # processed_items = already_processed + 新处理的数量
                if task_record and processed % 10 == 0:
                    task_record.processed_items = already_processed + processed
                    db.commit()
                
                # Rate limiting
                time.sleep(0.2)
                
            except Exception as e:
                logger.error(f"Failed to extract insights for review {review.id}: {e}")
                db.rollback()
                continue
        
        logger.info(f"Insight extraction completed: processed {processed} new reviews (total={total_translated}, now_done={already_processed + processed}), {insights_extracted} insights extracted")
        
        # [FIX] 更新 Task 状态为完成
        if task_record:
            task_record.status = TaskStatus.COMPLETED.value
            task_record.processed_items = already_processed + processed  # 最终处理数
            db.commit()
        
        return {
            "product_id": product_id,
            "total_reviews": total_translated,  # 修复：使用正确的变量名
            "processed": processed,
            "insights_extracted": insights_extracted
        }
        
    except Exception as e:
        logger.error(f"Insight extraction failed for product {product_id}: {e}")
        # [NEW] 更新 Task 状态为失败
        if task_record:
            task_record.status = TaskStatus.FAILED.value
            task_record.error_message = str(e)
            db.commit()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== 任务4: 主题高亮提取 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30, time_limit=1800, soft_time_limit=1700)
def task_extract_themes(self, product_id: str):
    """
    Extract 5W theme keywords for already translated reviews.
    
    This task:
    1. **[NEW] Auto-generates 5W context labels if not exists (Definition phase)**
    2. Gets all translated reviews that don't have theme highlights yet
    3. **[NEW] Uses context labels for forced categorization (Execution phase)**
    4. Calls AI to extract 5W themes with evidence and explanation
    5. Saves theme highlights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.product_context_label import ProductContextLabel
    from app.models.task import Task, TaskType, TaskStatus
    from app.services.translation import translation_service
    from sqlalchemy import delete, exists, func
    
    logger.info(f"Starting theme extraction for product {product_id}")
    
    db = get_sync_db()
    task_record = None
    
    try:
        # [NEW] Step 1: 检查是否有 5W 标签库，如果没有则自动生成
        label_count_result = db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product_id)
        )
        label_count = label_count_result.scalar() or 0
        
        context_schema = None
        labels_generated = False
        
        if label_count == 0:
            logger.info(f"产品 {product_id} 暂无 5W 标签库，开始自动学习...")
            
            # [NEW] 先获取产品信息（标题和五点）
            from app.models.product import Product
            import json as json_lib
            
            product_result = db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = product_result.scalar_one_or_none()
            
            product_title = ""
            bullet_points = []
            
            if product:
                product_title = product.title or ""
                # 解析五点（存储为 JSON 字符串）
                if product.bullet_points:
                    try:
                        bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
                    except:
                        bullet_points = []
                logger.info(f"📦 产品信息：{product.asin}，标题长度={len(product_title)}，五点={len(bullet_points)}条")
            
            # 获取已翻译的评论样本（至少10条）
            sample_result = db.execute(
                select(Review.body_original, Review.body_translated)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == "completed",
                        Review.body_translated.isnot(None),
                        Review.is_deleted == False
                    )
                )
                .order_by(Review.created_at.desc())
                .limit(50)
            )
            sample_reviews = sample_result.all()
            
            if len(sample_reviews) >= 30:
                # 准备样本文本
                sample_texts = []
                for row in sample_reviews:
                    text = row.body_translated or row.body_original
                    if text and text.strip():
                        sample_texts.append(text.strip())
                
                if len(sample_texts) >= 30:
                    # [UPDATED] 调用 AI 学习标签库（传入产品信息）
                    learned_labels = translation_service.learn_context_labels(
                        reviews_text=sample_texts,
                        product_title=product_title,      # [NEW] 产品标题
                        bullet_points=bullet_points       # [NEW] 五点卖点
                    )
                    
                    if learned_labels:
                        # 存入数据库
                        for context_type in ["who", "where", "when", "why", "what"]:
                            labels = learned_labels.get(context_type, [])
                            for item in labels:
                                if isinstance(item, dict) and item.get("name"):
                                    label = ProductContextLabel(
                                        product_id=product_id,
                                        type=context_type,
                                        name=item["name"].strip(),
                                        description=item.get("description", "").strip() or None,
                                        count=0,
                                        is_ai_generated=True
                                    )
                                    db.add(label)
                        
                        db.commit()
                        labels_generated = True
                        total_labels = sum(len(v) for v in learned_labels.values())
                        logger.info(f"✅ 自动生成 5W 标签库成功，共 {total_labels} 个标签")
                    else:
                        logger.warning(f"⚠️ AI 学习标签库失败，将使用开放提取模式")
                else:
                    logger.warning(f"⚠️ 有效样本不足（需要至少30条），将使用开放提取模式")
            else:
                logger.warning(f"⚠️ 已翻译评论不足（需要至少30条），将使用开放提取模式")
        
        # Step 2: 获取标签库 Schema（如果存在或刚生成）
        if label_count > 0 or labels_generated:
            label_result = db.execute(
                select(ProductContextLabel)
                .where(ProductContextLabel.product_id == product_id)
                .order_by(ProductContextLabel.type, ProductContextLabel.created_at)
            )
            labels = label_result.scalars().all()
            
            if labels:
                context_schema = {}
                for label in labels:
                    if label.type not in context_schema:
                        context_schema[label.type] = []
                    context_schema[label.type].append({
                        "name": label.name,
                        "description": label.description or ""
                    })
                logger.info(f"✅ 使用 5W 标签库进行强制归类，共 {len(labels)} 个标签")
        else:
            logger.info(f"ℹ️ 未使用标签库，将使用开放提取模式")
        
        # Get translated reviews that don't have theme highlights yet
        # Use a subquery to check for existing theme highlights
        theme_exists_subquery = (
            select(ReviewThemeHighlight.id)
            .where(ReviewThemeHighlight.review_id == Review.id)
            .exists()
        )
        
        # Ordered by review_date to match page display order
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "completed",
                    Review.body_translated.isnot(None),
                    Review.is_deleted == False,
                    ~theme_exists_subquery  # Reviews without theme highlights
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        themes_extracted = 0
        
        logger.info(f"Found {total_reviews} translated reviews for theme extraction")
        
        # [NEW] 创建/更新任务记录，启用心跳
        if total_reviews > 0:
            task_record = get_or_create_task(
                db=db,
                product_id=product_id,
                task_type=TaskType.THEMES.value,
                total_items=total_reviews,
                celery_task_id=self.request.id
            )
            logger.info(f"任务记录已创建: {task_record.id}")
        
        # [NEW] 构建标签名到标签ID的映射表（用于关联 context_label_id）
        label_id_map = {}  # key: (theme_type, label_name), value: context_label_id
        if context_schema:
            for label in labels:
                key = (label.type, label.name)
                label_id_map[key] = label.id
            logger.debug(f"构建标签映射表，共 {len(label_id_map)} 个标签")
        
        for review in reviews:
            try:
                # 对每条评论都执行主题提取（即使内容很短，结果可能为空）
                # 先删除旧的主题数据
                db.execute(
                    delete(ReviewThemeHighlight).where(ReviewThemeHighlight.review_id == review.id)
                )
                
                # [UPDATED] Extract themes with context schema (forced categorization)
                themes = translation_service.extract_themes(
                    original_text=review.body_original or "",
                    translated_text=review.body_translated or "",
                    context_schema=context_schema  # [NEW] 使用标签库进行强制归类
                )
                
                # [UPDATED] Insert theme highlights - 一条记录 = 一个标签
                if themes:
                    for theme_type, items in themes.items():
                        if not items or len(items) == 0:
                            continue
                        
                        for item in items:
                            # 获取标签信息（兼容两种格式：tag/quote 或 content/content_original）
                            label_name = item.get("content", "").strip()
                            # 原文证据（兼容 quote 和 content_original）
                            quote = item.get("quote") or item.get("content_original") or None
                            # 中文翻译证据（兼容 quote_translated 和 content_translated）
                            quote_translated = item.get("quote_translated") or item.get("content_translated") or None
                            explanation = item.get("explanation") or None
                            
                            if not label_name:
                                continue
                            
                            # [NEW] 查找对应的 context_label_id
                            context_label_id = label_id_map.get((theme_type, label_name))
                            
                            # 创建一条记录对应一个标签
                            theme_highlight = ReviewThemeHighlight(
                                review_id=review.id,
                                theme_type=theme_type,
                                label_name=label_name,               # 标签名称
                                quote=quote,                         # 原文证据
                                quote_translated=quote_translated,   # [NEW] 中文翻译证据
                                explanation=explanation,             # 归类理由
                                context_label_id=context_label_id,   # 关联标签库ID
                                items=[item]                         # 保留 items 用于向后兼容
                            )
                            db.add(theme_highlight)
                            themes_extracted += 1
                    
                    logger.debug(f"Extracted {themes_extracted} theme labels for review {review.id}")
                else:
                    # 即使没有主题，也插入一个标记记录，表示已处理
                    empty_marker = ReviewThemeHighlight(
                        review_id=review.id,
                        theme_type="_empty",
                        label_name=None,
                        items=None
                    )
                    db.add(empty_marker)
                    logger.debug(f"No themes found for review {review.id}, marked as processed")
                
                db.commit()
                processed += 1
                
                # [NEW] 更新心跳（每处理一条评论）
                if task_record:
                    update_task_heartbeat(db, str(task_record.id), processed_items=processed)
                
                # Rate limiting
                time.sleep(0.2)
                
            except Exception as e:
                logger.error(f"Failed to extract themes for review {review.id}: {e}")
                db.rollback()
                continue
        
        logger.info(f"Theme extraction completed: {processed}/{total_reviews} reviews processed, {themes_extracted} theme entries created")
        
        # [NEW] 更新 Task 状态为完成
        if task_record:
            task_record.status = TaskStatus.COMPLETED.value
            task_record.total_items = total_reviews
            task_record.processed_items = processed
            db.commit()
        
        return {
            "product_id": product_id,
            "total_reviews": total_reviews,
            "processed": processed,
            "themes_extracted": themes_extracted
        }
        
    except Exception as e:
        logger.error(f"Theme extraction failed for product {product_id}: {e}")
        # [NEW] 更新 Task 状态为失败
        if task_record:
            task_record.status = TaskStatus.FAILED.value
            task_record.error_message = str(e)
            db.commit()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 任务5: 流式轻量翻译 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_ingest_translation_only(self, product_id: str):
    """
    流式轻量翻译任务 (Stream Translation Only)
    
    数据入库后立即运行，只负责：
    1. Title/BulletPoints 翻译
    2. Review Text 翻译
    
    不负责：
    - 维度提取
    - 洞察分析
    - 主题提取
    
    设计理念：让用户在前台"边采边看"翻译结果
    
    🔒 并发策略：使用 PostgreSQL 行级锁（SELECT FOR UPDATE SKIP LOCKED）
       - 多个任务可以并发处理同一产品的不同评论
       - 自动避免重复处理同一条评论
       - 无需手动管理分布式锁
    
    Args:
        product_id: 产品 UUID
    """
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.services.translation import translation_service
    import json
    
    logger.info(f"[流式翻译] 开始处理产品 {product_id}")
    
    db = get_sync_db()
    
    try:
        # 1. 获取产品信息
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[流式翻译] 产品 {product_id} 不存在")
            return {"success": False, "error": "Product not found"}
        
        # 2. 翻译产品标题（如果未翻译）
        if product.title and not product.title_translated:
            try:
                product.title_translated = translation_service.translate_product_title(product.title)
                logger.info(f"[流式翻译] 标题翻译完成: {product.title_translated[:30]}...")
            except Exception as e:
                logger.warning(f"[流式翻译] 标题翻译失败: {e}")
        
        # 3. 翻译五点描述（如果未翻译）
        if product.bullet_points and not product.bullet_points_translated:
            try:
                bullet_points = json.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
                if bullet_points and len(bullet_points) > 0:
                    translated_bullets = translation_service.translate_bullet_points(bullet_points)
                    product.bullet_points_translated = json.dumps(translated_bullets, ensure_ascii=False)
                    logger.info(f"[流式翻译] 五点翻译完成: {len(translated_bullets)} 条")
            except Exception as e:
                logger.warning(f"[流式翻译] 五点翻译失败: {e}")
        
        db.commit()
        
        # 4. 🔄 循环翻译所有待处理的评论（只翻译，不提取洞察）
        # 使用循环处理所有待翻译评论，而不是只处理 100 条
        translated_count = 0
        failed_count = 0
        batch_size = 20  # 🔥 每批处理 20 条（匹配流式插入的频率）
        
        while True:
            # 🔒 使用 PostgreSQL 行级锁避免重复处理
            # FOR UPDATE SKIP LOCKED: 跳过已被其他任务锁定的行
            # 这样多个任务可以并发处理不同的评论
            pending_result = db.execute(
                select(Review)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status.in_([
                            TranslationStatus.PENDING.value,
                            TranslationStatus.FAILED.value
                        ]),
                        Review.is_deleted == False
                    )
                )
                .order_by(Review.created_at.desc())
                .limit(batch_size)
                .with_for_update(skip_locked=True)  # 🔥 关键：跳过已锁定的行
            )
            pending_reviews = pending_result.scalars().all()
            
            if not pending_reviews:
                logger.info(f"[流式翻译] 没有更多待翻译的评论")
                break
            
            logger.info(f"[流式翻译] 处理批次: {len(pending_reviews)} 条评论")
            
            for review in pending_reviews:
                try:
                    # 标记为处理中
                    review.translation_status = TranslationStatus.PROCESSING.value
                    db.commit()
                    
                    # 只做翻译，不提取洞察
                    title_translated, body_translated, sentiment, _ = translation_service.translate_review(
                        title=review.title_original,
                        body=review.body_original,
                        extract_insights=False  # 关闭洞察提取
                    )
                    
                    if body_translated and body_translated.strip():
                        review.title_translated = title_translated
                        review.body_translated = body_translated
                        review.sentiment = sentiment.value
                        review.translation_status = TranslationStatus.COMPLETED.value
                        translated_count += 1
                    else:
                        review.translation_status = TranslationStatus.FAILED.value
                        failed_count += 1
                    
                    db.commit()
                    
                    # 控制速率
                    time.sleep(0.1)
                    
                except Exception as e:
                    logger.warning(f"[流式翻译] 评论 {review.id} 翻译失败: {e}")
                    review.translation_status = TranslationStatus.FAILED.value
                    db.commit()
                    failed_count += 1
            
            # 如果这批处理的数量小于 batch_size，说明没有更多了
            if len(pending_reviews) < batch_size:
                break
        
        logger.info(f"[流式翻译] 完成: 翻译 {translated_count} 条, 失败 {failed_count} 条")
        
        return {
            "success": True,
            "product_id": product_id,
            "translated_count": translated_count,
            "failed_count": failed_count
        }
        
    except Exception as e:
        logger.error(f"[流式翻译] 产品 {product_id} 处理失败: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()
        # 🔒 PostgreSQL 行级锁会在事务结束时自动释放


# ============== [NEW] 任务6: 科学学习与全量回填 ==============

@celery_app.task(bind=True, max_retries=1, default_retry_delay=60)
def task_scientific_learning_and_analysis(self, product_id: str):
    """
    科学学习与全量回填任务 (Scientific Learning & Backfill)
    
    用户点击"开始分析"或采集完成后触发。
    利用英文原文进行 Schema 学习，然后回填所有数据。
    
    流程：
    1. 科学采样（基于英文原文，不等待翻译）
    2. 跨语言零样本学习（维度 + 5W标签）
    3. 全量洞察回填（对已翻译的评论提取洞察）
    4. 全量主题回填（对已翻译的评论提取5W主题）
    
    Args:
        product_id: 产品 UUID
    """
    from app.models.product import Product
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel
    from app.services.translation import translation_service
    import json as json_lib
    import asyncio
    
    logger.info(f"[科学学习] 开始处理产品 {product_id}")
    
    db = get_sync_db()
    
    try:
        # === Step 0: 获取产品信息 ===
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[科学学习] 产品 {product_id} 不存在")
            return {"success": False, "error": "Product not found"}
        
        # 解析产品信息
        product_title = product.title or ""
        bullet_points = []
        if product.bullet_points:
            try:
                bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
            except:
                bullet_points = []
        
        # === Step 1: 科学采样（基于英文原文）===
        logger.info(f"[科学学习] Step 1: 科学采样中...")
        
        # 需要同步方式执行异步方法
        from app.services.review_service import ReviewService
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from app.core.config import settings
        from app.models.review import Review
        
        # 使用同步查询获取科学采样
        sample_stmt = (
            select(Review.body_original)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.body_original != "",
                    Review.is_deleted == False
                )
            )
            .order_by(Review.helpful_votes.desc(), func.length(Review.body_original).desc())
            .limit(50)
        )
        sample_result = db.execute(sample_stmt)
        raw_samples = [r[0] for r in sample_result.all() if r[0] and r[0].strip()]
        
        if len(raw_samples) < 10:
            logger.warning(f"[科学学习] 样本不足（{len(raw_samples)} 条），需要至少 10 条英文评论")
            return {"success": False, "error": f"样本不足: {len(raw_samples)} 条，需要至少 10 条"}
        
        logger.info(f"[科学学习] 采样完成: {len(raw_samples)} 条高质量英文评论")
        
        # === Step 2: 跨语言零样本学习 ===
        logger.info(f"[科学学习] Step 2: 跨语言零样本学习中...")
        
        # 2.1 学习维度（如果不存在）
        dim_count_result = db.execute(
            select(func.count(ProductDimension.id))
            .where(ProductDimension.product_id == product_id)
        )
        dim_count = dim_count_result.scalar() or 0
        
        dimensions_learned = 0
        if dim_count == 0:
            logger.info(f"[科学学习] 学习产品维度中...")
            dims = translation_service.learn_dimensions_from_raw(
                raw_reviews=raw_samples,
                product_title=product_title,
                bullet_points="\n".join(bullet_points) if bullet_points else ""
            )
            
            if dims:
                for dim in dims:
                    dimension = ProductDimension(
                        product_id=product_id,
                        name=dim["name"],
                        description=dim.get("description", ""),
                        is_ai_generated=True
                    )
                    db.add(dimension)
                db.commit()
                dimensions_learned = len(dims)
                logger.info(f"[科学学习] 维度学习完成: {dimensions_learned} 个")
        else:
            logger.info(f"[科学学习] 产品已有 {dim_count} 个维度，跳过学习")
        
        # 2.2 学习5W标签（如果不存在）
        label_count_result = db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product_id)
        )
        label_count = label_count_result.scalar() or 0
        
        labels_learned = 0
        if label_count == 0:
            logger.info(f"[科学学习] 学习5W标签库中...")
            labels = translation_service.learn_context_labels_from_raw(
                raw_reviews=raw_samples,
                product_title=product_title,
                bullet_points=bullet_points
            )
            
            if labels:
                for context_type in ["who", "where", "when", "why", "what"]:
                    type_labels = labels.get(context_type, [])
                    for item in type_labels:
                        if isinstance(item, dict) and item.get("name"):
                            label = ProductContextLabel(
                                product_id=product_id,
                                type=context_type,
                                name=item["name"].strip(),
                                description=item.get("description", "").strip() or None,
                                count=0,
                                is_ai_generated=True
                            )
                            db.add(label)
                            labels_learned += 1
                db.commit()
                logger.info(f"[科学学习] 5W标签学习完成: {labels_learned} 个")
        else:
            logger.info(f"[科学学习] 产品已有 {label_count} 个5W标签，跳过学习")
        
        # === Step 3: 触发全量洞察回填 ===
        logger.info(f"[科学学习] Step 3: 触发全量洞察回填...")
        task_extract_insights.delay(product_id)
        
        # === Step 4: 触发全量主题回填 ===
        logger.info(f"[科学学习] Step 4: 触发全量主题回填...")
        task_extract_themes.delay(product_id)
        
        logger.info(f"[科学学习] 完成: 维度 +{dimensions_learned}, 标签 +{labels_learned}")
        
        return {
            "success": True,
            "product_id": product_id,
            "samples_used": len(raw_samples),
            "dimensions_learned": dimensions_learned,
            "labels_learned": labels_learned,
            "backfill_triggered": True
        }
        
    except Exception as e:
        logger.error(f"[科学学习] 产品 {product_id} 处理失败: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 任务7: 全自动分析（采集完成后触发）==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=120)
def task_full_auto_analysis(self, product_id: str, task_id: str):
    """
    🚀 全自动分析任务 (Full Auto Analysis Pipeline) - 流式并行优化版
    
    采集完成后自动触发，执行完整的分析流水线。
    
    ⭐ 核心优化：翻译在 ingest 时就已开始（流式上传边存边译）
    
    流式并行流程：
    
    [数据采集阶段 - 在此任务触发之前]
    ─────────────────────────────────────────────────────────────
    插入数据 → 立即触发翻译（task_ingest_translation_only）
    插入数据 → 立即触发翻译
    ...（持续进行中）
    
    [采集完成后触发此任务]
    ─────────────────────────────────────────────────────────────
    Step 1: 学习维度+5W标签（基于英文原文，不等翻译）
                              ↓
    Step 2: 触发洞察+主题提取（翻译此时已在进行中！）
                              ↓
    Step 3: 等待三任务并行完成
            ├─ 翻译（已在进行，会先完成）
            ├─ 洞察提取（边翻译边提取）
            └─ 主题提取（边翻译边提取）
                              ↓
    Step 4: 生成综合战略版报告
    
    时间优化：
    - 翻译在采集时就开始 → 不等待
    - 学习基于英文原文 → 不依赖翻译
    - 三任务并行执行 → 大幅减少等待时间
    - 预计节省 50%+ 的总时间
    
    Args:
        product_id: 产品 UUID
        task_id: AUTO_ANALYSIS 任务 UUID（用于更新进度）
    """
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.models.task import Task, TaskStatus, TaskType
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.report import ProductReport, ReportType, ReportStatus
    from app.services.translation import translation_service
    from datetime import datetime, timezone
    import json as json_lib
    
    logger.info(f"[全自动分析] 🚀 开始处理产品 {product_id}，任务 {task_id}")
    
    db = get_sync_db()
    
    def update_task_progress(step: int, status: str = TaskStatus.PROCESSING.value, error: str = None):
        """更新任务进度"""
        try:
            task_update = {
                "processed_items": step,
                "status": status,
                "last_heartbeat": datetime.now(timezone.utc)
            }
            if error:
                task_update["error_message"] = error
            db.execute(
                update(Task)
                .where(Task.id == task_id)
                .values(**task_update)
            )
            db.commit()
        except Exception as e:
            logger.error(f"[全自动分析] 更新任务进度失败: {e}")
    
    try:
        # 获取产品信息
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[全自动分析] 产品 {product_id} 不存在")
            update_task_progress(0, TaskStatus.FAILED.value, "产品不存在")
            return {"success": False, "error": "Product not found"}
        
        # ==========================================
        # Step 1: 科学学习（基于英文原文，不依赖翻译！）
        # ==========================================
        update_task_progress(1, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 1/3: 科学学习（基于英文原文）...")
        
        # 直接调用科学学习任务的逻辑（同步执行）
        from app.models.product_dimension import ProductDimension
        from app.models.product_context_label import ProductContextLabel
        
        # 解析产品信息
        product_title = product.title or ""
        bullet_points = []
        if product.bullet_points:
            try:
                bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
            except:
                bullet_points = []
        
        # 科学采样（基于英文原文）
        sample_stmt = (
            select(Review.body_original)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.body_original != "",
                    Review.is_deleted == False
                )
            )
            .order_by(Review.helpful_votes.desc(), func.length(Review.body_original).desc())
            .limit(50)
        )
        sample_result = db.execute(sample_stmt)
        raw_samples = [r[0] for r in sample_result.all() if r[0] and r[0].strip()]
        
        if len(raw_samples) >= 10:
            # 学习维度
            dim_count_result = db.execute(
                select(func.count(ProductDimension.id))
                .where(ProductDimension.product_id == product_id)
            )
            dim_count = dim_count_result.scalar() or 0
            
            if dim_count == 0:
                logger.info(f"[全自动分析] 学习产品维度中...")
                try:
                    dims = translation_service.learn_dimensions_from_raw(
                        raw_reviews=raw_samples,
                        product_title=product_title,
                        bullet_points="\n".join(bullet_points) if bullet_points else ""
                    )
                    if dims:
                        for dim in dims:
                            dimension = ProductDimension(
                                product_id=product_id,
                                name=dim["name"],
                                description=dim.get("description", ""),
                                is_ai_generated=True
                            )
                            db.add(dimension)
                        db.commit()
                        logger.info(f"[全自动分析] 维度学习完成: {len(dims)} 个")
                except Exception as e:
                    logger.error(f"[全自动分析] 维度学习失败: {e}")
            
            # 学习5W标签
            label_count_result = db.execute(
                select(func.count(ProductContextLabel.id))
                .where(ProductContextLabel.product_id == product_id)
            )
            label_count = label_count_result.scalar() or 0
            
            if label_count == 0:
                logger.info(f"[全自动分析] 学习5W标签库中...")
                try:
                    labels = translation_service.learn_context_labels_from_raw(
                        raw_reviews=raw_samples,
                        product_title=product_title,
                        bullet_points=bullet_points
                    )
                    if labels:
                        labels_saved = 0
                        for context_type in ["who", "where", "when", "why", "what"]:
                            type_labels = labels.get(context_type, [])
                            for item in type_labels:
                                if isinstance(item, dict) and item.get("name"):
                                    label = ProductContextLabel(
                                        product_id=product_id,
                                        type=context_type,
                                        name=item["name"].strip(),
                                        description=item.get("description", "").strip() or None,
                                        count=0,
                                        is_ai_generated=True
                                    )
                                    db.add(label)
                                    labels_saved += 1
                        db.commit()
                        logger.info(f"[全自动分析] 5W标签学习完成: {labels_saved} 个")
                except Exception as e:
                    logger.error(f"[全自动分析] 5W标签学习失败: {e}")
        else:
            logger.warning(f"[全自动分析] 样本不足（{len(raw_samples)} 条），跳过学习")
        
        # ==========================================
        # Step 2: 触发洞察+主题提取
        # 注意：翻译任务在 ingest 时就已经启动了！不需要在这里触发
        # ==========================================
        update_task_progress(2, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 2/4: 触发洞察+主题提取...")
        
        # 检查当前翻译进度（翻译在 ingest 时就已经开始了）
        pending_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status.in_([
                        TranslationStatus.PENDING.value,
                        TranslationStatus.PROCESSING.value
                    ]),
                    Review.is_deleted == False
                )
            )
        )
        pending_translation = pending_result.scalar() or 0
        
        translated_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        translated_count = translated_result.scalar() or 0
        
        logger.info(f"[全自动分析] 📊 当前翻译状态: 已翻译 {translated_count} 条, 待翻译 {pending_translation} 条")
        logger.info(f"[全自动分析] 💡 翻译任务在 ingest 时就已启动，现在触发洞察+主题提取")
        
        # 触发洞察和主题提取（它们会处理已翻译的评论，边翻译边提取）
        task_extract_insights.delay(product_id)
        task_extract_themes.delay(product_id)
        
        # ==========================================
        # Step 3: 等待三任务并行完成（翻译 + 洞察 + 主题）
        # ==========================================
        update_task_progress(3, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 3/4: 等待三任务并行完成（翻译+洞察+主题）...")
        
        # 并行等待所有任务完成（最多等 15 分钟）
        max_wait_seconds = 900
        wait_interval = 15
        waited = 0
        last_log_time = 0
        
        while waited < max_wait_seconds:
            time.sleep(wait_interval)
            waited += wait_interval
            
            # 检查翻译进度
            pending_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status.in_([
                            TranslationStatus.PENDING.value,
                            TranslationStatus.PROCESSING.value
                        ]),
                        Review.is_deleted == False
                    )
                )
            )
            pending_translation = pending_result.scalar() or 0
            
            # 检查已翻译的评论数
            translated_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False
                    )
                )
            )
            translated_count = translated_result.scalar() or 0
            
            # 检查洞察提取进度（已翻译但未提取洞察的评论）
            no_insight_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewInsight.review_id).where(ReviewInsight.review_id == Review.id)
                        )
                    )
                )
            )
            pending_insights = no_insight_result.scalar() or 0
            
            # 检查主题提取进度（已翻译但未提取主题的评论）
            no_theme_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewThemeHighlight.review_id).where(ReviewThemeHighlight.review_id == Review.id)
                        )
                    )
                )
            )
            pending_themes = no_theme_result.scalar() or 0
            
            # 每30秒打印一次进度
            if waited - last_log_time >= 30:
                logger.info(f"[全自动分析] 📊 并行进度 - 待翻译:{pending_translation} | 待洞察:{pending_insights} | 待主题:{pending_themes}")
                last_log_time = waited
            
            # 检查是否全部完成
            if pending_translation == 0 and pending_insights == 0 and pending_themes == 0:
                logger.info(f"[全自动分析] ✅ 并行处理全部完成！已翻译:{translated_count}条")
                break
            
            # 如果洞察或主题提取任务可能已结束但还有待处理的，重新触发
            if pending_translation == 0 and waited % 60 == 0:
                if pending_insights > 0:
                    logger.info(f"[全自动分析] 重新触发洞察提取（还有{pending_insights}条待处理）")
                    task_extract_insights.delay(product_id)
                if pending_themes > 0:
                    logger.info(f"[全自动分析] 重新触发主题提取（还有{pending_themes}条待处理）")
                    task_extract_themes.delay(product_id)
            
            # 更新心跳
            update_task_progress(3, TaskStatus.PROCESSING.value)
        
        if waited >= max_wait_seconds:
            logger.warning(f"[全自动分析] 并行处理等待超时，继续生成报告")
        
        # ==========================================
        # Step 4: 生成综合战略版报告
        # ==========================================
        update_task_progress(4, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 4/4: 生成综合报告...")
        
        try:
            # 使用同步方式调用报告生成
            # 由于 SummaryService 是异步的，需要使用 asyncio
            import asyncio
            from app.services.summary_service import SummaryService
            
            async def generate_report_async():
                # 使用正确的导入：engine 和 async_session_maker
                from app.db.session import async_session_maker
                
                async with async_session_maker() as async_db:
                    summary_service = SummaryService(async_db)
                    result = await summary_service.generate_report(
                        product_id=product_id,
                        report_type="comprehensive",  # 综合战略版
                        min_reviews=10,
                        save_to_db=True
                    )
                    await async_db.commit()  # 确保提交
                    return result
            
            # 运行异步函数
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                report_result = loop.run_until_complete(generate_report_async())
            finally:
                loop.close()
            
            if report_result.get("success"):
                report_id = report_result.get("report_id")
                logger.info(f"[全自动分析] 综合报告生成成功，报告ID: {report_id}")
                
                # 更新任务记录，保存报告 ID
                try:
                    db.execute(
                        update(Task)
                        .where(Task.id == task_id)
                        .values(error_message=f"report_id:{report_id}")  # 临时存储报告ID
                    )
                    db.commit()
                except Exception as save_err:
                    logger.warning(f"[全自动分析] 保存报告ID失败: {save_err}")
            else:
                logger.warning(f"[全自动分析] 综合报告生成失败: {report_result.get('error')}")
                
        except Exception as e:
            logger.error(f"[全自动分析] 报告生成失败: {e}")
            # 不因报告生成失败而中断整个任务
        
        # ==========================================
        # 完成
        # ==========================================
        update_task_progress(4, TaskStatus.COMPLETED.value)
        logger.info(f"[全自动分析] ✅ 产品 {product_id} 全自动分析完成！（流式并行优化版）")
        
        return {
            "success": True,
            "product_id": product_id,
            "task_id": task_id,
            "message": "全自动分析完成（并行优化）"
        }
        
    except Exception as e:
        logger.error(f"[全自动分析] 产品 {product_id} 处理失败: {e}")
        update_task_progress(0, TaskStatus.FAILED.value, str(e))
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()
