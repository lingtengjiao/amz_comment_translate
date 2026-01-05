"""
Reviews API Router - Endpoints for review ingestion and retrieval
"""
import logging
import uuid
from typing import Optional
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd

from app.db.session import get_db
from app.api.schemas import (
    ReviewIngestRequest,
    IngestResponse,
    ReviewListResponse,
    ReviewResponse,
    ProductListResponse,
    ProductResponse,
    ProductStatsResponse,
    TaskResponse,
    TranslationStatus,
    PinReviewRequest,
    ToggleVisibilityRequest,
    UpdateReviewRequest,
)
from app.services.review_service import ReviewService
from app.models.task import TaskType
from app.worker import task_process_reviews

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.post("/ingest", response_model=IngestResponse)
async def ingest_reviews(
    request: ReviewIngestRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Ingest reviews from Chrome extension.
    
    This endpoint:
    1. Creates or updates the product record
    2. Bulk inserts new reviews (skipping duplicates)
    3. Creates an async translation task
    4. Returns immediately with task ID
    
    The actual translation happens asynchronously via Celery worker.
    """
    # 检查评论列表是否为空
    if not request.reviews or len(request.reviews) == 0:
        # 区分两种情况：没登录 vs 产品本身没有评论
        if not request.title:
            # 产品信息也没有，很可能是没登录
            raise HTTPException(
                status_code=400,
                detail="采集失败：未获取到评论数据。请确保已登录亚马逊账号后重试。"
            )
        else:
            # 有产品信息但没有评论，可能是所选星级无评论
            raise HTTPException(
                status_code=400,
                detail="采集失败：所选星级暂无评论数据。请尝试选择其他星级或选择「全部星级」进行采集。"
            )
    
    service = ReviewService(db)
    
    try:
        # Process bullet_points - convert list to JSON string
        bullet_points_json = None
        if request.bullet_points and len(request.bullet_points) > 0:
            import json
            bullet_points_json = json.dumps(request.bullet_points)
        
        # Create or get product
        product = await service.get_or_create_product(
            asin=request.asin,
            title=request.title,
            image_url=request.image_url,
            marketplace=request.marketplace,
            average_rating=request.average_rating,
            price=request.price,
            bullet_points=bullet_points_json
        )
        
        # Bulk insert reviews
        reviews_data = [r.model_dump() for r in request.reviews]
        inserted, skipped = await service.bulk_insert_reviews(
            product_id=product.id,
            reviews_data=reviews_data
        )
        
        # Don't auto-create translation task - user will trigger manually
        # Just return success with product info
        
        await db.commit()
        
        return IngestResponse(
            success=True,
            message=f"Received {len(request.reviews)} reviews, {inserted} new, {skipped} duplicates skipped",
            product_id=product.id,
            task_id=None,  # No task created - user will trigger translation manually
            reviews_received=inserted,
            dashboard_url=f"http://localhost:3000/products/{request.asin}"
        )
        
    except Exception as e:
        logger.error(f"Failed to ingest reviews: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{asin}", response_model=ReviewListResponse)
async def get_reviews(
    asin: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    rating: Optional[int] = Query(None, ge=1, le=5),
    sentiment: Optional[str] = Query(None, pattern="^(positive|neutral|negative)$"),
    status: Optional[str] = Query(None, pattern="^(pending|processing|completed|failed)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get paginated reviews for a product with optional filters.
    
    Query parameters:
    - page: Page number (default 1)
    - page_size: Items per page (default 20, max 100)
    - rating: Filter by star rating (1-5)
    - sentiment: Filter by sentiment (positive/neutral/negative)
    - status: Filter by translation status
    """
    service = ReviewService(db)
    
    reviews, total = await service.get_product_reviews(
        asin=asin,
        page=page,
        page_size=page_size,
        rating_filter=rating,
        sentiment_filter=sentiment,
        status_filter=status
    )
    
    return ReviewListResponse(
        total=total,
        page=page,
        page_size=page_size,
        reviews=[ReviewResponse.model_validate(r) for r in reviews]
    )


@router.get("/{asin}/export")
async def export_reviews(
    asin: str,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export all reviews for a product as Excel or CSV.
    
    Query parameters:
    - format: Export format (xlsx or csv)
    """
    service = ReviewService(db)
    
    # Get all reviews (no pagination)
    reviews, total = await service.get_product_reviews(
        asin=asin,
        page=1,
        page_size=10000  # Max export limit
    )
    
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found")
    
    # Convert to DataFrame
    data = []
    for r in reviews:
        data.append({
            "评分 (Rating)": r.rating,
            "评论标题 (Title)": r.title_original,
            "标题翻译 (Title CN)": r.title_translated,
            "评论内容 (Body)": r.body_original,
            "内容翻译 (Body CN)": r.body_translated,
            "情感 (Sentiment)": r.sentiment,
            "作者 (Author)": r.author,
            "日期 (Date)": r.review_date,
            "认证购买 (Verified)": "是" if r.verified_purchase else "否",
            "有用票数 (Helpful)": r.helpful_votes
        })
    
    df = pd.DataFrame(data)
    
    # Generate file
    output = BytesIO()
    
    if format == "xlsx":
        df.to_excel(output, index=False, engine='openpyxl')
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"reviews_{asin}.xlsx"
    else:
        df.to_csv(output, index=False, encoding='utf-8-sig')
        media_type = "text/csv"
        filename = f"reviews_{asin}.csv"
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# Products endpoints
products_router = APIRouter(prefix="/products", tags=["Products"])


@products_router.get("", response_model=ProductListResponse)
async def get_products(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all products with their review statistics.
    """
    service = ReviewService(db)
    products = await service.get_all_products()
    
    return ProductListResponse(
        total=len(products),
        products=[ProductResponse(**p) for p in products]
    )


@products_router.get("/{asin}/stats", response_model=ProductStatsResponse)
async def get_product_stats(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed statistics for a product.
    """
    service = ReviewService(db)
    stats = await service.get_product_stats(asin)
    
    if not stats:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return stats


# Tasks endpoints  
tasks_router = APIRouter(prefix="/tasks", tags=["Tasks"])


@tasks_router.get("/{task_id}", response_model=TaskResponse)
async def get_task_status(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the status of an async task.
    """
    from sqlalchemy import select
    from app.models.task import Task
    from uuid import UUID
    
    try:
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    
    result = await db.execute(
        select(Task).where(Task.id == task_uuid)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse(
        id=task.id,
        product_id=task.product_id,
        task_type=task.task_type,
        status=task.status,
        total_items=task.total_items,
        processed_items=task.processed_items,
        progress_percentage=task.progress_percentage,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at
    )


@products_router.post("/{asin}/translate", response_model=IngestResponse)
async def trigger_translation(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger translation for a product.
    
    This endpoint triggers TWO tasks in sequence:
    1. First: Translate product bullet points and title (五点翻译)
    2. Then: Translate pending reviews (评论翻译)
    """
    from sqlalchemy import select, func, and_
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.worker import task_translate_bullet_points
    
    service = ReviewService(db)
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Count pending reviews
    pending_count_result = await db.execute(
        select(func.count(Review.id)).where(
            and_(
                Review.product_id == product.id,
                Review.translation_status == TranslationStatus.PENDING.value
            )
        )
    )
    pending_count = pending_count_result.scalar() or 0
    
    # 检查是否需要翻译五点
    needs_bullet_translation = (
        product.bullet_points and 
        not product.bullet_points_translated
    ) or (
        product.title and 
        not product.title_translated
    )
    
    # 如果既没有待翻译评论，也不需要翻译五点，则报错
    if pending_count == 0 and not needs_bullet_translation:
        raise HTTPException(
            status_code=400, 
            detail="All translations completed. No pending work."
        )
    
    # 根据不同情况处理
    task_id = None
    message_parts = []
    
    # 情况1: 只有五点需要翻译（评论已全部翻译）
    if pending_count == 0 and needs_bullet_translation:
        task_translate_bullet_points.delay(str(product.id))
        message_parts.append("bullet points")
        logger.info(f"Triggered bullet points translation only for product {asin}")
        
        return IngestResponse(
            success=True,
            message=f"Translation started for: {', '.join(message_parts)}",
            product_id=product.id,
            task_id=None,
            reviews_received=0,
            dashboard_url=f"http://localhost:3000/products/{asin}"
        )
    
    # 情况2和3: 有评论需要翻译
    from app.models.task import TaskStatus
    task = await service.get_or_create_task(
        product_id=product.id,
        task_type=TaskType.TRANSLATION,
        total_items=pending_count
    )
    
    # Reset task status if it was completed/failed and there are pending reviews
    if task.status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value]:
        task.status = TaskStatus.PENDING.value
        task.processed_items = 0
        task.error_message = None
        task.total_items = pending_count
        await db.flush()
    
    await db.commit()
    
    if needs_bullet_translation:
        # 情况3: 两者都需要翻译 - 链式触发：先五点，后评论
        task_translate_bullet_points.apply_async(
            args=[str(product.id)],
            link=task_process_reviews.si(str(product.id), str(task.id))
        )
        message_parts.append("bullet points")
        message_parts.append(f"{pending_count} reviews")
        logger.info(f"Triggered chained tasks: bullet points -> reviews for product {asin}")
    else:
        # 情况2: 只有评论需要翻译
        task_process_reviews.delay(str(product.id), str(task.id))
        message_parts.append(f"{pending_count} reviews")
        logger.info(f"Triggered review translation task {task.id} for {pending_count} reviews")
    
    return IngestResponse(
        success=True,
        message=f"Translation started for: {', '.join(message_parts)}",
        product_id=product.id,
        task_id=task.id,
        reviews_received=pending_count,
        dashboard_url=f"http://localhost:3000/products/{asin}"
    )


@products_router.post("/{asin}/translate-bullet-points")
async def trigger_bullet_points_translation(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger bullet points and product title translation only.
    This is independent of review translation.
    
    Use this to translate product info before or without review translation.
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.worker import task_translate_bullet_points
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check if translation is needed
    needs_title = product.title and not product.title_translated
    needs_bullets = product.bullet_points and not product.bullet_points_translated
    
    if not needs_title and not needs_bullets:
        return {
            "success": True,
            "message": "Product info already translated",
            "product_id": str(product.id),
            "asin": asin,
            "already_translated": True
        }
    
    # Dispatch bullet points translation task
    task_translate_bullet_points.delay(str(product.id))
    
    items_to_translate = []
    if needs_title:
        items_to_translate.append("title")
    if needs_bullets:
        items_to_translate.append("bullet points")
    
    logger.info(f"Triggered bullet points translation for product {asin}")
    
    return {
        "success": True,
        "message": f"Translation started for: {', '.join(items_to_translate)}",
        "product_id": str(product.id),
        "asin": asin,
        "items_to_translate": items_to_translate
    }


@products_router.post("/{asin}/extract-insights")
async def trigger_insight_extraction(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger insight extraction for all translated reviews of a product.
    
    This endpoint:
    1. Finds the product by ASIN
    2. Counts translated reviews
    3. Dispatches insight extraction task to Celery worker
    
    Note: This does NOT re-translate reviews, only extracts insights from existing translations.
    """
    from sqlalchemy import select, func, and_
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.worker import task_extract_insights
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Count translated reviews
    translated_count_result = await db.execute(
        select(func.count(Review.id)).where(
            and_(
                Review.product_id == product.id,
                Review.translation_status == TranslationStatus.COMPLETED.value,
                Review.body_translated.isnot(None)
            )
        )
    )
    translated_count = translated_count_result.scalar() or 0
    
    if translated_count == 0:
        raise HTTPException(
            status_code=400, 
            detail="No translated reviews available for insight extraction"
        )
    
    # Dispatch async task to Celery
    task_extract_insights.delay(str(product.id))
    logger.info(f"Triggered insight extraction for {translated_count} translated reviews of {asin}")
    
    return {
        "success": True,
        "message": f"Insight extraction started for {translated_count} translated reviews",
        "product_id": str(product.id),
        "asin": asin,
        "reviews_to_process": translated_count
    }


@products_router.post("/{asin}/extract-themes")
async def trigger_theme_extraction(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger theme keyword extraction for all translated reviews of a product.
    
    This endpoint:
    1. Finds the product by ASIN
    2. Counts translated reviews without theme highlights
    3. Dispatches theme extraction task to Celery worker
    
    The 8 themes are:
    - who: 使用者
    - where: 使用场景
    - when: 使用时机
    - unmet_needs: 未被满足的需求
    - pain_points: 痛点
    - benefits: 收益/好处
    - features: 功能特性
    - comparison: 对比
    """
    from sqlalchemy import select, func, and_, exists
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.worker import task_extract_themes
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Count translated reviews without theme highlights
    reviews_without_themes_result = await db.execute(
        select(func.count(Review.id))
        .where(
            and_(
                Review.product_id == product.id,
                Review.translation_status == TranslationStatus.COMPLETED.value,
                Review.body_translated.isnot(None),
                Review.is_deleted == False,
                ~exists(
                    select(1).where(ReviewThemeHighlight.review_id == Review.id)
                )
            )
        )
    )
    reviews_to_process = reviews_without_themes_result.scalar() or 0
    
    if reviews_to_process == 0:
        # Check if all reviews already have themes
        total_translated_result = await db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.body_translated.isnot(None),
                    Review.is_deleted == False
                )
            )
        )
        total_translated = total_translated_result.scalar() or 0
        
        if total_translated == 0:
            raise HTTPException(
                status_code=400, 
                detail="主题提取失败：该产品暂无已翻译的评论数据。请先进行评论翻译。"
            )
        else:
            raise HTTPException(
                status_code=400, 
                detail="主题提取失败：所有已翻译评论均已提取过主题关键词。"
            )
    
    # Dispatch async task to Celery
    task_extract_themes.delay(str(product.id))
    logger.info(f"Triggered theme extraction for {reviews_to_process} translated reviews of {asin}")
    
    return {
        "success": True,
        "message": f"主题提取已启动，正在处理 {reviews_to_process} 条评论",
        "product_id": str(product.id),
        "asin": asin,
        "reviews_to_process": reviews_to_process
    }


# ============== Review Actions API ==============

@router.put("/{review_id}/pin")
async def pin_review(
    review_id: str,
    request_body: PinReviewRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Pin or unpin a review.
    """
    from sqlalchemy import select, update
    from app.models.review import Review
    
    try:
        review_uuid = uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid review ID format")
    
    result = await db.execute(
        select(Review).where(Review.id == review_uuid)
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    await db.execute(
        update(Review)
        .where(Review.id == review_uuid)
        .values(is_pinned=request_body.isPinned)
    )
    await db.commit()
    
    logger.info(f"Review {review_id} {'pinned' if request_body.isPinned else 'unpinned'}")
    
    return {
        "code": 200,
        "message": "Success",
        "data": {
            "reviewId": review_id,
            "isPinned": request_body.isPinned
        }
    }


@router.put("/{review_id}/visibility")
async def toggle_review_visibility(
    review_id: str,
    request_body: ToggleVisibilityRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Hide or show a review.
    """
    from sqlalchemy import select, update
    from app.models.review import Review
    
    try:
        review_uuid = uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid review ID format")
    
    result = await db.execute(
        select(Review).where(Review.id == review_uuid)
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    await db.execute(
        update(Review)
        .where(Review.id == review_uuid)
        .values(is_hidden=request_body.isHidden)
    )
    await db.commit()
    
    logger.info(f"Review {review_id} {'hidden' if request_body.isHidden else 'shown'}")
    
    return {
        "code": 200,
        "message": "Success",
        "data": {
            "reviewId": review_id,
            "isHidden": request_body.isHidden
        }
    }


@router.put("/{review_id}")
async def update_review(
    review_id: str,
    updates: UpdateReviewRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update review content (title, body, sentiment).
    """
    from sqlalchemy import select, update
    from app.models.review import Review
    from sqlalchemy.orm import selectinload
    
    try:
        review_uuid = uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid review ID format")
    
    result = await db.execute(
        select(Review)
        .options(selectinload(Review.insights))
        .where(Review.id == review_uuid)
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    # Build update dict from Pydantic model
    update_values = {}
    if updates.originalTitle is not None:
        update_values["title_original"] = updates.originalTitle
    if updates.translatedTitle is not None:
        update_values["title_translated"] = updates.translatedTitle
    if updates.originalText is not None:
        update_values["body_original"] = updates.originalText
    if updates.translatedText is not None:
        update_values["body_translated"] = updates.translatedText
    if updates.sentiment is not None:
        update_values["sentiment"] = updates.sentiment.value
    
    if not update_values:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    await db.execute(
        update(Review)
        .where(Review.id == review_uuid)
        .values(**update_values)
    )
    await db.commit()
    
    # Refresh review to get updated data
    await db.refresh(review)
    
    # Convert to response format
    review_response = ReviewResponse.model_validate(review)
    
    logger.info(f"Review {review_id} updated")
    
    return {
        "code": 200,
        "message": "Success",
        "data": review_response.model_dump()
    }


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a review (logical delete - soft delete).
    """
    from sqlalchemy import select, update
    from app.models.review import Review
    
    try:
        review_uuid = uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid review ID format")
    
    result = await db.execute(
        select(Review).where(Review.id == review_uuid)
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if review.is_deleted:
        raise HTTPException(status_code=400, detail="Review already deleted")
    
    # Logical delete - set is_deleted to True
    await db.execute(
        update(Review)
        .where(Review.id == review_uuid)
        .values(is_deleted=True)
    )
    await db.commit()
    
    logger.info(f"Review {review_id} logically deleted")
    
    return {
        "code": 200,
        "message": "Success",
        "data": {
            "reviewId": review_id,
            "deleted": True
        }
    }

