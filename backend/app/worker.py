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
    task_time_limit=600,  # 10 minutes timeout per task
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
        
        # Get pending reviews
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "pending"
                )
            )
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
                time.sleep(0.5)
                
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
    2. Calls AI to extract insights
    3. Saves insights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.insight import ReviewInsight
    from app.services.translation import translation_service
    from sqlalchemy import delete
    
    logger.info(f"Starting insight extraction for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Get translated reviews (completed status)
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "completed",
                    Review.body_translated.isnot(None)
                )
            )
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        insights_extracted = 0
        
        logger.info(f"Found {total_reviews} translated reviews for insight extraction")
        
        for review in reviews:
            try:
                # Skip if review body is too short
                if not review.body_original or len(review.body_original.strip()) < 30:
                    processed += 1
                    continue
                
                # Extract insights
                insights = translation_service.extract_insights(
                    original_text=review.body_original,
                    translated_text=review.body_translated
                )
                
                if insights:
                    # Delete existing insights for this review
                    db.execute(
                        delete(ReviewInsight).where(ReviewInsight.review_id == review.id)
                    )
                    
                    # Insert new insights
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
                
                db.commit()
                processed += 1
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Failed to extract insights for review {review.id}: {e}")
                db.rollback()
                continue
        
        logger.info(f"Insight extraction completed: {processed}/{total_reviews} reviews processed, {insights_extracted} insights extracted")
        
        return {
            "product_id": product_id,
            "total_reviews": total_reviews,
            "processed": processed,
            "insights_extracted": insights_extracted
        }
        
    except Exception as e:
        logger.error(f"Insight extraction failed for product {product_id}: {e}")
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== 任务4: 主题高亮提取 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_extract_themes(self, product_id: str):
    """
    Extract theme keywords for already translated reviews.
    
    This task:
    1. Gets all translated reviews that don't have theme highlights yet
    2. Calls AI to extract 8 theme keywords
    3. Saves theme highlights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.services.translation import translation_service
    from sqlalchemy import delete, exists
    
    logger.info(f"Starting theme extraction for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Get translated reviews that don't have theme highlights yet
        # Use a subquery to check for existing theme highlights
        theme_exists_subquery = (
            select(ReviewThemeHighlight.id)
            .where(ReviewThemeHighlight.review_id == Review.id)
            .exists()
        )
        
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
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        themes_extracted = 0
        
        logger.info(f"Found {total_reviews} translated reviews for theme extraction")
        
        for review in reviews:
            try:
                # Skip if review body is too short
                if not review.body_translated or len(review.body_translated.strip()) < 10:
                    processed += 1
                    continue
                
                # Extract themes
                themes = translation_service.extract_themes(
                    original_text=review.body_original or "",
                    translated_text=review.body_translated
                )
                
                if themes:
                    # Insert theme highlights
                    for theme_type, items in themes.items():
                        if items and len(items) > 0:
                            theme_highlight = ReviewThemeHighlight(
                                review_id=review.id,
                                theme_type=theme_type,
                                items=items
                            )
                            db.add(theme_highlight)
                            themes_extracted += 1
                    
                    logger.debug(f"Extracted {len(themes)} themes for review {review.id}")
                
                db.commit()
                processed += 1
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Failed to extract themes for review {review.id}: {e}")
                db.rollback()
                continue
        
        logger.info(f"Theme extraction completed: {processed}/{total_reviews} reviews processed, {themes_extracted} theme entries created")
        
        return {
            "product_id": product_id,
            "total_reviews": total_reviews,
            "processed": processed,
            "themes_extracted": themes_extracted
        }
        
    except Exception as e:
        logger.error(f"Theme extraction failed for product {product_id}: {e}")
        raise self.retry(exc=e)
        
    finally:
        db.close()
