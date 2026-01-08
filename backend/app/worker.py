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

from app.core.config import settings

logger = logging.getLogger(__name__)

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
        # 四个独立的 AI 服务任务
        "app.worker.task_translate_bullet_points": {"queue": "translation"},  # 五点翻译
        "app.worker.task_process_reviews": {"queue": "translation"},           # 评论翻译
        "app.worker.task_extract_insights": {"queue": "translation"},          # 洞察提取
        "app.worker.task_extract_themes": {"queue": "translation"},            # 主题提取
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
