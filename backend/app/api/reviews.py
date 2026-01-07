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
    DimensionResponse,
    DimensionListResponse,
    DimensionCreateRequest,
    DimensionUpdateRequest,
    DimensionGenerateResponse,
    # 5W Context Labels
    ContextLabelResponse,
    ContextLabelListResponse,
    ContextLabelCreateRequest,
    ContextLabelUpdateRequest,
    ContextLabelGenerateResponse,
    # Report Generation
    ReportGenerateResponse,
    ReportPreviewResponse,
    ProductReportResponse,
    ProductReportListResponse,
    ProductReportCreateResponse,
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
    page_size: int = Query(20, ge=1, le=1000),  # ✅ 将单页最大限制从 100 提升到 1000，支持大批量展示
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
    db: AsyncSession = Depends(get_db)
):
    """
    Export all reviews for a product as Excel (XLSX).
    Includes insights and theme highlights data.
    """
    service = ReviewService(db)
    
    # Get all reviews (no pagination) with insights and theme highlights
    reviews, total = await service.get_product_reviews(
        asin=asin,
        page=1,
        page_size=10000  # Max export limit
    )
    
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found")
    
    # Convert to DataFrame with insights and theme highlights
    data = []
    for r in reviews:
        # Format insights
        insights_text = ""
        if r.insights and len(r.insights) > 0:
            insight_parts = []
            for insight in r.insights:
                insight_str = f"[{insight.insight_type}] {insight.quote}"
                if insight.quote_translated:
                    insight_str += f" | 翻译: {insight.quote_translated}"
                if insight.analysis:
                    insight_str += f" | 分析: {insight.analysis}"
                if insight.dimension:
                    insight_str += f" | 维度: {insight.dimension}"
                insight_parts.append(insight_str)
            insights_text = " | ".join(insight_parts)
        
        # Format theme highlights
        theme_parts = []
        if r.theme_highlights and len(r.theme_highlights) > 0:
            for theme in r.theme_highlights:
                theme_label_map = {
                    "who": "Who（使用者）",
                    "where": "Where（使用场景）",
                    "when": "When（使用时机）",
                    "unmet_needs": "未被满足的需求",
                    "pain_points": "Pain Points（痛点）",
                    "benefits": "Benefits（收益/好处）",
                    "features": "Features（功能特性）",
                    "comparison": "Comparison（对比）"
                }
                theme_label = theme_label_map.get(theme.theme_type, theme.theme_type)
                
                # Format items
                if theme.items and len(theme.items) > 0:
                    item_texts = []
                    for item in theme.items:
                        item_str = item.get("content", "")
                        if item.get("content_original"):
                            item_str += f" ({item['content_original']})"
                        if item.get("explanation"):
                            item_str += f" - {item['explanation']}"
                        item_texts.append(item_str)
                    theme_str = f"{theme_label}: {', '.join(item_texts)}"
                    theme_parts.append(theme_str)
        
        themes_text = " | ".join(theme_parts) if theme_parts else ""
        
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
            "有用票数 (Helpful)": r.helpful_votes,
            "提取洞察 (Insights)": insights_text,
            "提取主题 (Theme Highlights)": themes_text
        })
    
    df = pd.DataFrame(data)
    
    # Generate Excel file
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Reviews')
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=reviews_{asin}.xlsx"}
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
    
    **[NEW] Auto-initializes 5W label learning on first visit:**
    - If product has translated reviews (>=10) but no context labels, 
      automatically triggers label learning in background (non-blocking).
    - This ensures labels are ready when user triggers theme extraction.
    """
    from sqlalchemy import select, func, and_
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.models.product_context_label import ProductContextLabel
    from app.services.context_service import ContextService
    
    service = ReviewService(db)
    stats = await service.get_product_stats(asin)
    
    if not stats:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # [NEW] Auto-initialize 5W label learning on first visit (non-blocking)
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if product:
        # Check if context labels exist
        label_count_result = await db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product.id)
        )
        label_count = label_count_result.scalar() or 0
        
        # Check if there are enough translated reviews
        translated_count_result = await db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.body_translated.isnot(None),
                    Review.is_deleted == False
                )
            )
        )
        translated_count = translated_count_result.scalar() or 0
        
        # Auto-trigger label learning if needed (non-blocking, runs in background)
        # Only trigger if: no labels exist AND has enough translated reviews
        # Note: This will trigger theme extraction which auto-generates labels on first run
        if label_count == 0 and translated_count >= 30:
            logger.info(f"产品 {asin} 首次访问，检测到 {translated_count} 条已翻译评论，将在主题提取时自动生成 5W 标签库")
            # Note: Labels will be auto-generated when user triggers theme extraction
            # We don't trigger it here to avoid unnecessary processing
            # The worker.task_extract_themes will handle label generation automatically
    
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


@products_router.get("/{asin}/tasks/health")
async def check_product_tasks_health(
    asin: str,
    auto_recover: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """
    检查产品的所有后台任务健康状态。
    
    功能：
    1. 返回所有任务的状态和心跳信息
    2. 检测心跳超时的任务
    3. 自动触发超时任务的恢复（可选）
    
    Args:
        asin: 产品 ASIN
        auto_recover: 是否自动恢复超时任务（默认 True）
    
    Returns:
        {
            "tasks": [...],           # 所有任务状态
            "has_timeout": bool,      # 是否有超时任务
            "recovered_tasks": [...]  # 已触发恢复的任务
        }
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.models.task import Task, TaskStatus, TaskType
    from app.worker import task_extract_themes, task_extract_insights
    import logging
    
    logger = logging.getLogger(__name__)
    
    # 获取产品
    result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # 获取所有任务
    tasks_result = await db.execute(
        select(Task).where(Task.product_id == product.id)
    )
    tasks = tasks_result.scalars().all()
    
    task_list = []
    timeout_tasks = []
    recovered_tasks = []
    
    for task in tasks:
        is_timeout = task.is_heartbeat_timeout
        
        task_info = {
            "id": str(task.id),
            "task_type": task.task_type,
            "status": task.status,
            "total_items": task.total_items,
            "processed_items": task.processed_items,
            "progress_percentage": task.progress_percentage,
            "last_heartbeat": task.last_heartbeat.isoformat() if task.last_heartbeat else None,
            "heartbeat_timeout_seconds": task.heartbeat_timeout_seconds,
            "is_timeout": is_timeout,
            "error_message": task.error_message,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }
        task_list.append(task_info)
        
        if is_timeout:
            timeout_tasks.append(task)
            
            # 自动恢复
            if auto_recover:
                try:
                    # 标记任务为超时
                    task.status = TaskStatus.TIMEOUT.value
                    task.error_message = f"心跳超时，自动触发恢复"
                    await db.commit()
                    
                    # 根据任务类型触发恢复
                    if task.task_type == TaskType.THEMES.value:
                        task_extract_themes.delay(str(product.id))
                        recovered_tasks.append({
                            "task_type": task.task_type,
                            "action": "triggered_retry"
                        })
                        logger.info(f"自动恢复主题提取任务: {task.id}")
                        
                    elif task.task_type == TaskType.INSIGHTS.value:
                        task_extract_insights.delay(str(product.id))
                        recovered_tasks.append({
                            "task_type": task.task_type,
                            "action": "triggered_retry"
                        })
                        logger.info(f"自动恢复洞察提取任务: {task.id}")
                        
                except Exception as e:
                    logger.error(f"自动恢复任务失败: {e}")
                    recovered_tasks.append({
                        "task_type": task.task_type,
                        "action": "failed",
                        "error": str(e)
                    })
    
    return {
        "product_id": str(product.id),
        "asin": asin,
        "tasks": task_list,
        "has_timeout": len(timeout_tasks) > 0,
        "timeout_count": len(timeout_tasks),
        "recovered_tasks": recovered_tasks
    }


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
    
    # Count pending reviews (including processing and failed - to retry stuck/failed translations)
    pending_count_result = await db.execute(
        select(func.count(Review.id)).where(
            and_(
                Review.product_id == product.id,
                Review.translation_status.in_([
                    TranslationStatus.PENDING.value,
                    TranslationStatus.PROCESSING.value,
                    TranslationStatus.FAILED.value
                ])
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


# ============== Dimension API ==============

@products_router.post("/{asin}/dimensions/generate", response_model=DimensionGenerateResponse)
async def generate_dimensions(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    触发 AI 学习并生成产品评价维度。
    
    这个接口会：
    1. 从该产品的评论中采样（最多50条）
    2. 调用 AI 分析评论，提炼出5-8个核心评价维度
    3. 将维度存入 product_dimensions 表
    4. 返回生成的维度列表
    
    后续在分析评论洞察时，AI 会使用这些维度进行归类。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.dimension_service import DimensionService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    dimension_service = DimensionService(db)
    
    try:
        # 自动生成维度
        generated_dims = await dimension_service.auto_generate_dimensions(product.id)
        
        # 获取完整的维度列表（包含 ID 等信息）
        dimensions = await dimension_service.get_dimensions(product.id)
        
        logger.info(f"为产品 {asin} 成功生成 {len(dimensions)} 个维度")
        
        return DimensionGenerateResponse(
            success=True,
            message=f"成功生成 {len(dimensions)} 个产品维度",
            product_id=product.id,
            dimensions=[DimensionResponse.model_validate(d) for d in dimensions]
        )
        
    except ValueError as e:
        logger.warning(f"维度生成失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"维度生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"维度生成发生未知错误: {e}")
        raise HTTPException(status_code=500, detail=f"维度生成失败: {str(e)}")


@products_router.get("/{asin}/dimensions", response_model=DimensionListResponse)
async def get_dimensions(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品的所有评价维度。
    
    返回该产品已定义的维度列表，包括 AI 生成的和用户手动添加的。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.dimension_service import DimensionService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    dimension_service = DimensionService(db)
    dimensions = await dimension_service.get_dimensions(product.id)
    
    return DimensionListResponse(
        total=len(dimensions),
        dimensions=[DimensionResponse.model_validate(d) for d in dimensions]
    )


@products_router.post("/{asin}/dimensions", response_model=DimensionResponse)
async def add_dimension(
    asin: str,
    request: DimensionCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    手动添加一个产品维度。
    
    允许用户手动添加自定义维度来补充或微调 AI 生成的维度。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.dimension_service import DimensionService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    dimension_service = DimensionService(db)
    dimension = await dimension_service.add_dimension(
        product_id=product.id,
        name=request.name,
        description=request.description
    )
    
    logger.info(f"为产品 {asin} 添加维度: {request.name}")
    
    return DimensionResponse.model_validate(dimension)


@products_router.put("/dimensions/{dimension_id}", response_model=DimensionResponse)
async def update_dimension(
    dimension_id: str,
    request: DimensionUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    更新维度信息。
    """
    from app.services.dimension_service import DimensionService
    
    try:
        dim_uuid = uuid.UUID(dimension_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的维度 ID 格式")
    
    dimension_service = DimensionService(db)
    dimension = await dimension_service.update_dimension(
        dimension_id=dim_uuid,
        name=request.name,
        description=request.description
    )
    
    if not dimension:
        raise HTTPException(status_code=404, detail="维度不存在")
    
    return DimensionResponse.model_validate(dimension)


@products_router.delete("/dimensions/{dimension_id}")
async def delete_dimension(
    dimension_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    删除维度。
    """
    from app.services.dimension_service import DimensionService
    
    try:
        dim_uuid = uuid.UUID(dimension_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的维度 ID 格式")
    
    dimension_service = DimensionService(db)
    success = await dimension_service.delete_dimension(dim_uuid)
    
    if not success:
        raise HTTPException(status_code=404, detail="维度不存在")
    
    return {
        "code": 200,
        "message": "维度删除成功",
        "data": {
            "dimension_id": dimension_id,
            "deleted": True
        }
    }


# ============== 5W Context Label API ==============

@products_router.post("/{asin}/context-labels/generate", response_model=ContextLabelGenerateResponse)
async def generate_context_labels(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    触发 AI 学习并生成 5W 标准标签库（Definition 阶段）。
    
    这是 AI-Native 架构的核心："先学习标准，后强制归类"。
    
    流程：
    1. 从该产品的已翻译评论中采样（最多50条）
    2. 调用 AI 分析评论，为每个 5W 类型生成标准标签
    3. 将标签存入 product_context_labels 表
    4. 返回生成的标签库
    
    后续在提取 5W 主题时，AI 会强制将内容归类到这些标签中，避免数据发散。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.context_service import ContextService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    context_service = ContextService(db)
    
    try:
        # 自动生成 5W 标签
        generated_labels = await context_service.auto_generate_context_labels(product.id)
        
        # 获取标签统计
        summary = await context_service.get_labels_summary(product.id)
        
        total_count = sum(len(v) for v in generated_labels.values())
        logger.info(f"为产品 {asin} 成功生成 {total_count} 个 5W 标签")
        
        return ContextLabelGenerateResponse(
            success=True,
            message=f"成功生成 {total_count} 个 5W 标签",
            product_id=product.id,
            labels=generated_labels,
            summary=summary
        )
        
    except ValueError as e:
        logger.warning(f"5W 标签生成失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"5W 标签生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"5W 标签生成发生未知错误: {e}")
        raise HTTPException(status_code=500, detail=f"5W 标签生成失败: {str(e)}")


@products_router.get("/{asin}/context-labels", response_model=ContextLabelListResponse)
async def get_context_labels(
    asin: str,
    context_type: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品的 5W 标准标签库。
    
    返回该产品已定义的标签列表，包括 AI 生成的和用户手动添加的。
    可以通过 context_type 参数筛选特定类型的标签。
    
    Query Parameters:
        context_type: 可选，筛选特定类型 (who/where/when/why/what)
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.context_service import ContextService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # Validate context_type if provided
    valid_types = {"who", "where", "when", "why", "what"}
    if context_type and context_type not in valid_types:
        raise HTTPException(
            status_code=400, 
            detail=f"无效的标签类型: {context_type}，必须是 {valid_types}"
        )
    
    context_service = ContextService(db)
    labels = await context_service.get_context_labels(product.id, context_type)
    summary = await context_service.get_labels_summary(product.id)
    
    return ContextLabelListResponse(
        total=len(labels),
        labels=[ContextLabelResponse.model_validate(l) for l in labels],
        summary=summary
    )


@products_router.get("/{asin}/context-labels/schema")
async def get_context_schema(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取用于强制归类的 5W Schema。
    
    返回格式化的标签库，供 AI 提取主题时使用。
    这是内部 API，主要用于调试和查看当前的标签库配置。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.context_service import ContextService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    context_service = ContextService(db)
    schema = await context_service.get_context_schema(product.id)
    has_labels = await context_service.has_context_labels(product.id)
    
    return {
        "success": True,
        "product_id": str(product.id),
        "asin": asin,
        "has_labels": has_labels,
        "schema": schema
    }


@products_router.post("/{asin}/context-labels", response_model=ContextLabelResponse)
async def add_context_label(
    asin: str,
    request: ContextLabelCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    手动添加一个 5W 标签。
    
    允许用户手动添加自定义标签来补充或微调 AI 生成的标签库。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.context_service import ContextService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    context_service = ContextService(db)
    
    try:
        label = await context_service.add_label(
            product_id=product.id,
            context_type=request.type.value,
            name=request.name,
            description=request.description
        )
        
        logger.info(f"为产品 {asin} 添加标签: [{request.type.value}] {request.name}")
        
        return ContextLabelResponse.model_validate(label)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@products_router.put("/context-labels/{label_id}", response_model=ContextLabelResponse)
async def update_context_label(
    label_id: str,
    request: ContextLabelUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    更新标签信息。
    """
    from app.services.context_service import ContextService
    
    try:
        label_uuid = uuid.UUID(label_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的标签 ID 格式")
    
    context_service = ContextService(db)
    label = await context_service.update_label(
        label_id=label_uuid,
        name=request.name,
        description=request.description
    )
    
    if not label:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    return ContextLabelResponse.model_validate(label)


@products_router.delete("/context-labels/{label_id}")
async def delete_context_label(
    label_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    删除标签。
    """
    from app.services.context_service import ContextService
    
    try:
        label_uuid = uuid.UUID(label_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的标签 ID 格式")
    
    context_service = ContextService(db)
    success = await context_service.delete_label(label_uuid)
    
    if not success:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    return {
        "code": 200,
        "message": "标签删除成功",
        "data": {
            "label_id": label_id,
            "deleted": True
        }
    }


# ============== Report Generation API ==============

@products_router.post("/{asin}/report/generate", response_model=ProductReportCreateResponse)
async def generate_product_report(
    asin: str,
    report_type: str = Query(
        default="comprehensive",
        description="报告类型: comprehensive(综合版), operations(运营版), product(产品版), supply_chain(供应链版)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    生成指定类型的产品分析报告并持久化存储（Report Generation）。
    
    这是智能报告生成模块的核心接口，它会：
    1. **数据聚合**: 从数据库中聚合 5W (Who/Where/When/Why/What) 和维度洞察数据
    2. **统计画像**: 计算 Top N 人群、场景、动机、痛点、爽点等
    3. **AI 撰写**: 根据报告类型使用不同的角色化 Prompt，生成 JSON 格式的结构化报告
    4. **持久化存储**: 报告自动存入数据库，支持历史回溯
    
    **支持四种报告类型（四位一体决策中台）：**
    - `comprehensive`: CEO/综合战略版 - 全局战略视角，SWOT分析，各部门指令
    - `operations`: CMO/运营市场版 - 卖点挖掘，广告定位，差评话术
    - `product`: CPO/产品研发版 - 质量评分，缺陷分析，迭代建议
    - `supply_chain`: 供应链/质检版 - 材质问题，包装优化，QC清单
    
    **输出格式：**
    - `content`: JSON 格式的 AI 结构化分析结果（用于渲染卡片、列表等）
    - `analysis_data`: 原始统计数据（用于 ECharts/Recharts 图表）
    
    **前置条件：**
    - 产品需要有至少 10 条已翻译的评论
    - 建议先运行主题提取 (extract-themes) 和洞察提取 (extract-insights)
    
    **注意：** 报告生成需要 30-60 秒，因为需要调用 AI 进行深度分析。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    from app.models.report import ReportType
    
    # 验证报告类型
    valid_types = [ReportType.COMPREHENSIVE.value, ReportType.OPERATIONS.value, 
                   ReportType.PRODUCT.value, ReportType.SUPPLY_CHAIN.value]
    if report_type not in valid_types:
        raise HTTPException(
            status_code=400, 
            detail=f"无效的报告类型。支持的类型: {', '.join(valid_types)}"
        )
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        result = await summary_service.generate_report(
            product.id, 
            report_type=report_type,
            save_to_db=True
        )
        
        if result["success"]:
            logger.info(f"成功为产品 {asin} 生成分析报告并存入数据库")
        else:
            logger.warning(f"产品 {asin} 报告生成失败: {result.get('error')}")
        
        # 构建响应
        report_data = result.get("report")
        report_response = None
        if report_data and isinstance(report_data, dict):
            report_response = ProductReportResponse(
                id=report_data.get("id", ""),
                product_id=report_data.get("product_id", ""),
                title=report_data.get("title"),
                content=report_data.get("content", ""),
                analysis_data=report_data.get("analysis_data"),
                report_type=report_data.get("report_type", "comprehensive"),
                status=report_data.get("status", "completed"),
                error_message=report_data.get("error_message"),
                created_at=report_data.get("created_at"),
                updated_at=report_data.get("updated_at")
            )
        
        return ProductReportCreateResponse(
            success=result["success"],
            report=report_response,
            stats=result.get("stats"),
            error=result.get("error")
        )
        
    except Exception as e:
        logger.error(f"报告生成发生异常: {e}")
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@products_router.get("/{asin}/report/preview", response_model=ReportPreviewResponse)
async def get_report_preview(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取报告预览数据（不调用 AI，仅返回统计数据）。
    
    用途：
    1. 前端展示"正在分析..."时的进度提示
    2. 调试和查看原始聚合数据
    3. 在生成报告前预览数据是否充足
    4. 检查是否存在历史报告（has_existing_report）
    
    返回：
    - 产品基本信息
    - 5W 统计数据（Who/Where/When/Why/What）
    - 维度洞察统计（痛点/爽点）
    - 历史报告信息（如果有）
    
    此接口响应速度很快（<1s），可用于实时显示分析进度。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        result = await summary_service.get_report_preview(product.id)
        
        return ReportPreviewResponse(
            success=result["success"],
            product=result.get("product"),
            stats=result.get("stats"),
            has_existing_report=result.get("has_existing_report", False),
            latest_report_id=result.get("latest_report_id"),
            latest_report_date=result.get("latest_report_date"),
            latest_report_type=result.get("latest_report_type"),
            report_counts=result.get("report_counts"),
            error=result.get("error")
        )
        
    except Exception as e:
        logger.error(f"获取报告预览失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取预览失败: {str(e)}")


@products_router.get("/{asin}/reports", response_model=ProductReportListResponse)
async def get_product_reports(
    asin: str,
    limit: int = 10,
    report_type: Optional[str] = Query(
        default=None,
        description="按类型筛选: comprehensive, operations, product, supply_chain"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品的历史报告列表（支持按类型筛选）。
    
    返回该产品所有生成过的报告，按创建时间倒序排列。
    
    **筛选参数：**
    - `report_type`: 可选，按报告类型筛选 (comprehensive/operations/product/supply_chain)
    
    可用于：
    1. 对比不同时期的报告，看痛点是否解决
    2. 查看特定类型的历史报告
    3. 快速打开之前的报告（秒开）
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        reports = await summary_service.get_report_history(
            product.id, 
            limit=limit,
            report_type=report_type
        )
        
        report_responses = [
            ProductReportResponse(
                id=str(r.id),
                product_id=str(r.product_id),
                title=r.title,
                content=r.content,
                analysis_data=r.analysis_data,
                report_type=r.report_type,
                status=r.status,
                error_message=r.error_message,
                created_at=r.created_at.isoformat() if r.created_at else None,
                updated_at=r.updated_at.isoformat() if r.updated_at else None
            )
            for r in reports
        ]
        
        return ProductReportListResponse(
            success=True,
            reports=report_responses,
            total=len(report_responses)
        )
        
    except Exception as e:
        logger.error(f"获取报告列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取报告列表失败: {str(e)}")


@products_router.get("/{asin}/reports/latest", response_model=ProductReportResponse)
async def get_latest_report(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品最新的报告（秒开，不用重新生成）。
    
    如果存在历史报告，直接返回最新的一份。
    如果没有历史报告，返回 404。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        report = await summary_service.get_latest_report(product.id)
        
        if not report:
            raise HTTPException(status_code=404, detail="暂无报告，请先点击生成")
        
        return ProductReportResponse(
            id=str(report.id),
            product_id=str(report.product_id),
            title=report.title,
            content=report.content,
            analysis_data=report.analysis_data,
            report_type=report.report_type,
            status=report.status,
            error_message=report.error_message,
            created_at=report.created_at.isoformat() if report.created_at else None,
            updated_at=report.updated_at.isoformat() if report.updated_at else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取最新报告失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取报告失败: {str(e)}")


@products_router.get("/{asin}/reports/{report_id}", response_model=ProductReportResponse)
async def get_report_by_id(
    asin: str,
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    根据报告 ID 获取特定报告。
    """
    from sqlalchemy import select
    from uuid import UUID as PyUUID
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        report = await summary_service.get_report_by_id(PyUUID(report_id))
        
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")
        
        # 验证报告属于该产品
        if report.product_id != product.id:
            raise HTTPException(status_code=404, detail="报告不属于该产品")
        
        return ProductReportResponse(
            id=str(report.id),
            product_id=str(report.product_id),
            title=report.title,
            content=report.content,
            analysis_data=report.analysis_data,
            report_type=report.report_type,
            status=report.status,
            error_message=report.error_message,
            created_at=report.created_at.isoformat() if report.created_at else None,
            updated_at=report.updated_at.isoformat() if report.updated_at else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取报告失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取报告失败: {str(e)}")


@products_router.delete("/{asin}/reports/{report_id}")
async def delete_report(
    asin: str,
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    删除指定报告。
    """
    from sqlalchemy import select
    from uuid import UUID as PyUUID
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    summary_service = SummaryService(db)
    
    try:
        # 先检查报告是否存在并属于该产品
        report = await summary_service.get_report_by_id(PyUUID(report_id))
        
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")
        
        if report.product_id != product.id:
            raise HTTPException(status_code=404, detail="报告不属于该产品")
        
        success = await summary_service.delete_report(PyUUID(report_id))
        
        if success:
            return {"success": True, "message": "报告已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除失败")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除报告失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除报告失败: {str(e)}")


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

