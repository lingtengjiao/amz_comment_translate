"""
Reviews API Router - Endpoints for review ingestion and retrieval
"""
import logging
import uuid
from typing import Optional
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
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
    ProductBriefInfo,
    # Report Types
    ReportTypeInfo,
    ReportTypeListResponse,
)
from app.services.review_service import ReviewService
from app.models.task import TaskType
from app.models.user import User
from app.services.auth_service import get_current_user
from app.worker import task_process_reviews, task_ingest_translation_only, task_scientific_learning_and_analysis, task_full_auto_analysis

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
        
        await db.commit()
        
        # [NEW] 🔥 流式翻译触发：数据入库后立即触发轻量翻译任务
        # 只有当有新数据插入时才触发
        stream_flag = "流式" if request.is_stream else "批量"
        print(f"[{stream_flag}上传] 产品 {request.asin}: 收到 {len(request.reviews)} 条, 新增 {inserted} 条, 跳过 {skipped} 条")
        
        if inserted > 0:
            # 触发流式轻量翻译（只做文本翻译，不做洞察分析）
            celery_result = task_ingest_translation_only.delay(str(product.id))
            print(f"[{stream_flag}上传] ✅ 产品 {request.asin} 已触发翻译任务: {celery_result.id}")
            logger.info(f"[{stream_flag}上传] 产品 {request.asin} 入库 {inserted} 条, 翻译任务ID: {celery_result.id}")
        else:
            print(f"[{stream_flag}上传] ⚠️ 产品 {request.asin} 无新数据，跳过翻译触发")
        
        return IngestResponse(
            success=True,
            message=f"Received {len(request.reviews)} reviews, {inserted} new, {skipped} duplicates skipped",
            product_id=product.id,
            task_id=None,  # 流式翻译不返回 task_id，它是自动触发的
            reviews_received=inserted,
            dashboard_url=f"http://localhost:3000/products/{request.asin}"
        )
        
    except Exception as e:
        logger.error(f"Failed to ingest reviews: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# [NEW] 高并发入库接口 - 写入 Redis 队列
# ==========================================

@router.post("/ingest/queue")
async def ingest_reviews_queue(
    request: ReviewIngestRequest,
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    🚀 高并发入库接口 (Queue-based Ingestion)
    
    与 /ingest 的区别：
    - /ingest: 同步写入数据库，适合少量数据
    - /ingest/queue: 异步写入 Redis 队列，适合高并发场景
    
    工作流程：
    1. 快速校验数据
    2. 生成 batch_id
    3. 推入 Redis 队列（极快，<50ms）
    4. 立即返回 batch_id
    5. 后台 Worker 批量消费并入库
    6. [NEW] 如果用户已登录，自动创建 user_project 关联
    
    前端可通过 /ingest/status/{batch_id} 查询处理状态。
    
    Returns:
        batch_id: 批次 ID，用于查询处理状态
        queued: True 表示已进入队列
    """
    import json as json_lib
    
    # 快速校验
    if not request.reviews or len(request.reviews) == 0:
        if not request.title:
            raise HTTPException(
                status_code=400,
                detail="采集失败：未获取到评论数据。请确保已登录亚马逊账号后重试。"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="采集失败：所选星级暂无评论数据。"
            )
    
    # 生成批次 ID
    batch_id = str(uuid.uuid4())
    
    # [DEBUG] 打印收到的 categories
    logger.info(f"[入队调试] ASIN={request.asin}, categories={request.categories}, bullet_points={request.bullet_points}")
    
    # 构建队列数据
    payload = {
        "batch_id": batch_id,
        "asin": request.asin,
        "title": request.title,
        "image_url": request.image_url,
        "marketplace": request.marketplace or "US",
        "average_rating": request.average_rating,
        "price": request.price,
        "bullet_points": request.bullet_points,
        "categories": request.categories,  # [NEW] 产品类目面包屑
        "reviews": [r.model_dump() for r in request.reviews],
        "is_stream": request.is_stream,
        "user_id": str(current_user.id) if current_user else None  # [NEW] 传递用户 ID
    }
    
    try:
        from app.core.redis import get_async_redis, ReviewIngestionQueue, BatchStatusTracker
        
        logger.info(f"[入队] 开始处理 ASIN={request.asin}, reviews={len(request.reviews)}, batch_id={batch_id}")
        
        redis_client = await get_async_redis()
        logger.info(f"[入队] Redis 客户端已获取: {redis_client is not None}")
        
        queue = ReviewIngestionQueue(redis_client)
        tracker = BatchStatusTracker(redis_client)
        
        # 创建批次状态
        logger.info(f"[入队] 创建批次状态: batch_id={batch_id}, count={len(request.reviews)}")
        await tracker.create(batch_id, len(request.reviews))
        logger.info(f"[入队] 批次状态已创建")
        
        # 推入队列
        logger.info(f"[入队] 准备推入队列，队列名称: {queue.queue_name}, payload大小: {len(str(payload))} bytes")
        success = await queue.push(payload)
        logger.info(f"[入队] 推入队列结果: success={success}")
        
        # 验证队列长度（如果方法存在）
        try:
            if hasattr(queue, 'length'):
                queue_length = await queue.length()
                logger.info(f"[入队] 当前队列长度: {queue_length}")
            else:
                # 直接查询 Redis
                queue_length = await redis_client.llen(queue.queue_name)
                logger.info(f"[入队] 当前队列长度（直接查询）: {queue_length}")
        except Exception as e:
            logger.warning(f"[入队] 无法获取队列长度: {e}")
        
        if not success:
            logger.error(f"[入队] ❌ 推入队列失败: batch_id={batch_id}")
            raise HTTPException(status_code=500, detail="推入队列失败")
        
        stream_flag = "流式" if request.is_stream else "批量"
        logger.info(f"[{stream_flag}入队] ✅ 产品 {request.asin}: {len(request.reviews)} 条评论已入队，batch_id={batch_id}, 队列长度={queue_length}")
        
        return {
            "success": True,
            "queued": True,
            "batch_id": batch_id,
            "asin": request.asin,
            "reviews_queued": len(request.reviews),
            "message": f"已入队 {len(request.reviews)} 条评论，后台处理中",
            "status_url": f"/reviews/ingest/status/{batch_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to queue reviews: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ingest/status/{batch_id}")
async def get_ingest_status(batch_id: str):
    """
    查询入库批次的处理状态
    
    前端轮询此接口获取处理进度。
    
    Returns:
        status: queued/processing/completed/failed
        total: 总评论数
        inserted: 已入库数
        skipped: 跳过的重复数
    """
    try:
        from app.core.redis import get_async_redis, BatchStatusTracker
        
        redis_client = await get_async_redis()
        tracker = BatchStatusTracker(redis_client)
        
        result = await tracker.get(batch_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="批次不存在或已过期")
        
        return {
            "success": True,
            "batch_id": batch_id,
            "status": result["status"],
            "total": result["total"],
            "inserted": result["inserted"],
            "skipped": result["skipped"],
            "message": _get_status_message(result)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get batch status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _get_status_message(result: dict) -> str:
    """生成状态消息"""
    status = result["status"]
    if status == "queued":
        return "排队中，等待处理..."
    elif status == "processing":
        return "处理中..."
    elif status == "completed":
        inserted = result["inserted"]
        skipped = result["skipped"]
        return f"✅ 处理完成！新增 {inserted} 条，跳过 {skipped} 条重复"
    elif status == "failed":
        return "❌ 处理失败"
    else:
        return "未知状态"


@router.get("/ingest/queue/length")
async def get_queue_length():
    """
    获取入库队列长度（调试用）
    """
    try:
        from app.core.redis import get_async_redis, ReviewIngestionQueue
        
        redis_client = await get_async_redis()
        queue = ReviewIngestionQueue(redis_client)
        length = await queue.length()
        
        return {
            "success": True,
            "queue_length": length,
            "message": f"当前队列中有 {length} 条待处理数据"
        }
        
    except Exception as e:
        logger.error(f"Failed to get queue length: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{asin}", response_model=ReviewListResponse)
async def get_reviews(
    asin: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),  # ✅ 将单页最大限制从 100 提升到 1000，支持大批量展示
    rating: Optional[int] = Query(None, ge=1, le=5),
    sentiment: Optional[str] = Query(None, pattern="^(positive|neutral|negative)$"),
    status: Optional[str] = Query(None, pattern="^(pending|processing|completed|failed)$"),
    no_cache: bool = Query(False, description="跳过缓存，强制从数据库获取"),
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
    - no_cache: Skip cache and fetch from database
    
    🚀 Performance: Results are cached in Redis for 5 minutes.
    """
    from app.core.cache import get_cache_service
    
    cache = await get_cache_service()
    
    # 尝试从缓存获取（除非指定 no_cache）
    if not no_cache:
        cached = await cache.get_reviews(asin, page, page_size, rating, sentiment)
        if cached:
            logger.debug(f"[Cache HIT] Reviews for {asin} page={page}")
            return ReviewListResponse(**cached)
    
    # 缓存未命中，从数据库获取
    service = ReviewService(db)
    
    reviews, total = await service.get_product_reviews(
        asin=asin,
        page=page,
        page_size=page_size,
        rating_filter=rating,
        sentiment_filter=sentiment,
        status_filter=status
    )
    
    response_data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "reviews": [ReviewResponse.model_validate(r).model_dump() for r in reviews]
    }
    
    # 写入缓存
    await cache.set_reviews(asin, response_data, page, page_size, rating, sentiment)
    logger.debug(f"[Cache SET] Reviews for {asin} page={page}")
    
    return ReviewListResponse(**response_data)


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


# ==========================================
# System Health Check endpoints
# ==========================================
system_router = APIRouter(prefix="/system", tags=["System"])


@system_router.get("/worker-health")
async def check_worker_health():
    """
    检查 Celery Worker 健康状态
    
    Returns:
        - is_healthy: Worker 是否健康
        - registered_tasks: 已注册的任务列表
        - missing_tasks: 缺少的必需任务
        - message: 状态说明
    """
    from celery import current_app
    
    # 必须注册的任务
    required_tasks = [
        'app.worker.task_full_auto_analysis',
        'app.worker.task_ingest_translation_only',
        'app.worker.task_extract_insights',
        'app.worker.task_extract_themes',
    ]
    
    try:
        # 获取已注册的任务
        inspect = current_app.control.inspect()
        registered = inspect.registered() or {}
        
        if not registered:
            return {
                "is_healthy": False,
                "active_workers": 0,
                "registered_tasks": [],
                "missing_tasks": required_tasks,
                "message": "⚠️ 没有活跃的 Worker，请运行: docker restart voc-worker"
            }
        
        # 获取所有 worker 注册的任务
        all_tasks = set()
        for worker_tasks in registered.values():
            all_tasks.update(worker_tasks)
        
        # 检查缺少的任务
        missing = [t for t in required_tasks if t not in all_tasks]
        
        is_healthy = len(missing) == 0
        
        return {
            "is_healthy": is_healthy,
            "active_workers": len(registered),
            "registered_tasks": list(all_tasks),
            "missing_tasks": missing,
            "message": "✅ Worker 正常" if is_healthy else f"⚠️ Worker 缺少任务: {missing}，请运行: docker restart voc-worker"
        }
        
    except Exception as e:
        logger.error(f"Worker health check failed: {e}")
        return {
            "is_healthy": False,
            "active_workers": 0,
            "registered_tasks": [],
            "missing_tasks": required_tasks,
            "message": f"❌ 无法连接 Worker: {str(e)}"
        }


# Products endpoints
products_router = APIRouter(prefix="/products", tags=["Products"])


@products_router.get("", response_model=ProductListResponse)
async def get_products(
    my_only: bool = Query(False, description="只显示我的项目"),
    admin_only: bool = Query(False, description="只显示管理员关注的产品（用于洞察广场）"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Get all products with their review statistics.
    
    - 如果 my_only=True 且用户已登录，只返回用户关联的产品
    - 如果 admin_only=True，只返回管理员用户关注的产品（用于洞察广场）
    - 返回数据中包含 is_my_project 字段标记用户是否已关联
    """
    from app.models.user_project import UserProject
    
    service = ReviewService(db)
    
    # 获取用户关联的产品 ID 集合
    my_product_ids = set()
    if current_user:
        result = await db.execute(
            select(UserProject.product_id).where(UserProject.user_id == current_user.id)
        )
        my_product_ids = {row[0] for row in result.all()}
    
    if admin_only:
        # 只获取管理员关注的产品（用于洞察广场）
        admin_result = await db.execute(
            select(UserProject.product_id)
            .join(User, UserProject.user_id == User.id)
            .where(User.is_admin == True)
            .where(UserProject.is_deleted == False)
        )
        admin_product_ids = {row[0] for row in admin_result.all()}
        
        if not admin_product_ids:
            return ProductListResponse(total=0, products=[])
        
        products = await service.get_products_by_ids(list(admin_product_ids))
    elif my_only and current_user:
        # 只获取用户关联的产品
        if not my_product_ids:
            return ProductListResponse(total=0, products=[])
        
        products = await service.get_products_by_ids(list(my_product_ids))
    else:
        # 获取所有产品
        products = await service.get_all_products()
    
    # 添加 is_my_project 字段
    product_responses = []
    for p in products:
        resp = ProductResponse(**p)
        # 动态添加 is_my_project 字段（通过 dict 方式）
        product_responses.append(resp)
    
    return ProductListResponse(
        total=len(product_responses),
        products=product_responses
    )


@products_router.get("/{asin}/stats", response_model=ProductStatsResponse)
async def get_product_stats(
    asin: str,
    no_cache: bool = Query(False, description="跳过缓存"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed statistics for a product.
    
    🚀 Performance: Results are cached in Redis for 5 minutes.
    
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
    from app.core.cache import get_cache_service
    
    # 🚀 尝试从缓存获取
    cache = await get_cache_service()
    if not no_cache:
        cached = await cache.get(f"cache:stats:{asin}:overview")
        if cached:
            logger.debug(f"[Cache HIT] Stats for {asin}")
            return cached
    
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
    
    # [NEW] 直接用产品统计数据计算任务进度（更简单可靠）
    from app.api.schemas import ActiveTasksResponse, ActiveTaskStatus
    
    active_tasks = ActiveTasksResponse()
    
    # stats 是字典，使用字典访问方式
    product_data = stats.get("product", {})
    total = product_data.get("total_reviews", 0)
    
    if total > 0:
        # [FIXED] 翻译进度：已翻译 + 已跳过 = 已处理（避免 skipped 评论导致无限循环）
        translated = product_data.get("translated_reviews", 0)
        
        # 查询 skipped 和 failed 评论数量（都算作已处理，避免前端无限轮询）
        skipped_result = await db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.SKIPPED.value,
                    Review.is_deleted == False
                )
            )
        )
        skipped_count = skipped_result.scalar() or 0
        
        # 查询 failed 评论数量
        failed_result = await db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.FAILED.value,
                    Review.is_deleted == False
                )
            )
        )
        failed_count = failed_result.scalar() or 0
        
        # 已处理 = 已翻译 + 已跳过 + 已失败（避免 failed 评论导致前端无限轮询）
        processed = translated + skipped_count + failed_count
        trans_progress = int((processed / total) * 100)
        active_tasks.translation_progress = min(100, trans_progress)
        active_tasks.translation = ActiveTaskStatus.COMPLETED if trans_progress >= 100 else (
            ActiveTaskStatus.PROCESSING if trans_progress > 0 else ActiveTaskStatus.IDLE
        )
        
        # 洞察进度
        insights_progress = int((product_data.get("reviews_with_insights", 0) / total) * 100)
        active_tasks.insights_progress = min(100, insights_progress)
        active_tasks.insights = ActiveTaskStatus.COMPLETED if insights_progress >= 100 else (
            ActiveTaskStatus.PROCESSING if insights_progress > 0 else ActiveTaskStatus.IDLE
        )
        
        # 主题进度
        themes_progress = int((product_data.get("reviews_with_themes", 0) / total) * 100)
        active_tasks.themes_progress = min(100, themes_progress)
        active_tasks.themes = ActiveTaskStatus.COMPLETED if themes_progress >= 100 else (
            ActiveTaskStatus.PROCESSING if themes_progress > 0 else ActiveTaskStatus.IDLE
        )
    
    # 将 active_tasks 添加到返回结果
    stats_dict = stats.model_dump() if hasattr(stats, 'model_dump') else dict(stats)
    # 确保 active_tasks 可以被 JSON 序列化
    stats_dict['active_tasks'] = active_tasks.model_dump() if hasattr(active_tasks, 'model_dump') else {
        "translation": active_tasks.translation.value if hasattr(active_tasks.translation, 'value') else active_tasks.translation,
        "insights": active_tasks.insights.value if hasattr(active_tasks.insights, 'value') else active_tasks.insights,
        "themes": active_tasks.themes.value if hasattr(active_tasks.themes, 'value') else active_tasks.themes,
        "translation_progress": active_tasks.translation_progress,
        "insights_progress": active_tasks.insights_progress,
        "themes_progress": active_tasks.themes_progress
    }
    
    # 🚀 写入缓存（智能 TTL：任务完成缓存久，进行中缓存短）
    all_completed = (
        active_tasks.translation == ActiveTaskStatus.COMPLETED and 
        active_tasks.insights == ActiveTaskStatus.COMPLETED and 
        active_tasks.themes == ActiveTaskStatus.COMPLETED
    )
    # 任务全完成: 缓存 5 分钟，否则缓存 2 秒（与前端轮询频率匹配，确保实时进度更新）
    cache_ttl = 300 if all_completed else 2
    await cache.set(f"cache:stats:{asin}:overview", stats_dict, ttl=cache_ttl)
    logger.debug(f"[Cache SET] Stats for {asin} (ttl={cache_ttl}s)")
    
    return stats_dict


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


@products_router.post("/{asin}/start-analysis")
async def start_deep_analysis(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    🚀 一键深度分析接口 (模式B：只翻译 → 后洞察)
    
    当用户选择"只翻译"模式完成采集后，点击此接口启动完整的AI分析流水线。
    这是一键操作，包含与"一步到位"模式相同的全部分析步骤。
    
    流程：
    1. 科学采样（基于英文原文，不等待翻译完成）
    2. 跨语言零样本学习（维度 + 5W标签）
    3. 全量洞察回填
    4. 全量主题回填
    5. 自动生成综合战略报告
    
    注意：这是一个重量级任务，执行时间可能较长（1-5分钟）
    
    Returns:
        - task_id: 分析任务 ID（用于追踪进度）
        - status: "started" / "already_running"
        - message: 进度信息
    """
    from sqlalchemy import select, func, and_, delete
    from app.models.product import Product
    from app.models.review import Review
    from app.models.task import Task, TaskType, TaskStatus
    
    # 获取产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # 检查是否有足够的数据
    review_count_result = await db.execute(
        select(func.count(Review.id))
        .where(
            and_(
                Review.product_id == product.id,
                Review.is_deleted == False
            )
        )
    )
    review_count = review_count_result.scalar() or 0
    
    # [UPDATED 2026-01-19] 移除评论数量限制，只要有评论就可以进行分析
    if review_count < 1:
        raise HTTPException(
            status_code=400, 
            detail=f"没有可分析的评论，请先采集评论数据"
        )
    
    # ==========================================
    # 检查是否已有 AUTO_ANALYSIS 任务在运行
    # ==========================================
    existing_task_result = await db.execute(
        select(Task).where(
            and_(
                Task.product_id == product.id,
                Task.task_type == TaskType.AUTO_ANALYSIS.value,
                Task.status.in_([TaskStatus.PENDING.value, TaskStatus.PROCESSING.value])
            )
        )
    )
    existing_task = existing_task_result.scalar_one_or_none()
    
    if existing_task:
        logger.info(f"[模式B-一键分析] 产品 {asin} 已有运行中的任务: {existing_task.id}")
        return {
            "success": True,
            "status": "already_running",
            "message": f"分析任务已在运行中，进度: {existing_task.processed_items}/{existing_task.total_items}",
            "task_id": str(existing_task.id),
            "product_id": str(product.id),
            "asin": asin,
            "review_count": review_count
        }
    
    # ==========================================
    # 删除旧的 AUTO_ANALYSIS 任务（如果存在）
    # ==========================================
    await db.execute(
        delete(Task).where(
            and_(
                Task.product_id == product.id,
                Task.task_type == TaskType.AUTO_ANALYSIS.value
            )
        )
    )
    
    # ==========================================
    # 创建新的全自动分析任务
    # ==========================================
    new_task = Task(
        product_id=product.id,
        task_type=TaskType.AUTO_ANALYSIS.value,
        status=TaskStatus.PENDING.value,
        total_items=4,  # 4 个步骤：学习 → 触发提取 → 等待三任务并行 → 报告
        processed_items=0
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    # ==========================================
    # 触发 Celery 任务 - 使用 task_full_auto_analysis
    # ==========================================
    celery_task = task_full_auto_analysis.delay(str(product.id), str(new_task.id))
    
    # 更新 Celery 任务 ID
    new_task.celery_task_id = celery_task.id
    await db.commit()
    
    logger.info(f"[模式B-一键分析] 产品 {asin} 全自动分析启动成功，任务 ID: {new_task.id}")
    
    return {
        "success": True,
        "status": "started",
        "message": f"全自动分析已启动（含报告生成），共 {review_count} 条评论待处理...",
        "task_id": str(new_task.id),
        "product_id": str(product.id),
        "asin": asin,
        "review_count": review_count
    }


# ==========================================
# [NEW] 清空AI数据并重新分析
# ==========================================

@products_router.post("/{asin}/clear-and-reanalyze")
async def clear_and_reanalyze(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    🧹 清空产品的 AI 分析数据（保留翻译），然后重新触发完整分析流程
    
    清空内容：
    - 产品维度 (product_dimensions)
    - 5W 标签 (product_context_labels)
    - 评论洞察 (review_insights)
    - 评论主题 (review_theme_highlights)
    - 产品报告 (product_reports)
    - 维度总结 (product_dimension_summaries)
    - 相关任务 (tasks)
    
    保留内容：
    - 翻译结果 (title_translated, body_translated)
    - 评论原始数据
    
    触发流程：
    1. 科学学习（维度 + 5W标签）
    2. 洞察提取
    3. 主题提取
    4. 生成报告
    """
    from sqlalchemy import select, delete, and_, func
    from app.models.product import Product
    from app.models.review import Review
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.report import ProductReport
    from app.models.product_dimension_summary import ProductDimensionSummary
    from app.models.task import Task, TaskType, TaskStatus
    
    # 获取产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    product_id = product.id
    
    # 获取所有评论 ID
    reviews_result = await db.execute(
        select(Review.id).where(
            and_(
                Review.product_id == product_id,
                Review.is_deleted == False
            )
        )
    )
    review_ids = [r[0] for r in reviews_result.all()]
    
    logger.info(f"[清空重分析] 产品 {asin}，共 {len(review_ids)} 条评论")
    
    # ==================== 清空数据 ====================
    cleared = {}
    
    # 1. 删除维度
    dim_result = await db.execute(
        delete(ProductDimension).where(ProductDimension.product_id == product_id)
    )
    cleared["dimensions"] = dim_result.rowcount
    
    # 2. 删除 5W 标签
    label_result = await db.execute(
        delete(ProductContextLabel).where(ProductContextLabel.product_id == product_id)
    )
    cleared["context_labels"] = label_result.rowcount
    
    # 3. 删除洞察
    if review_ids:
        insight_result = await db.execute(
            delete(ReviewInsight).where(ReviewInsight.review_id.in_(review_ids))
        )
        cleared["insights"] = insight_result.rowcount
    else:
        cleared["insights"] = 0
    
    # 4. 删除主题
    if review_ids:
        theme_result = await db.execute(
            delete(ReviewThemeHighlight).where(ReviewThemeHighlight.review_id.in_(review_ids))
        )
        cleared["themes"] = theme_result.rowcount
    else:
        cleared["themes"] = 0
    
    # 5. 删除报告
    report_result = await db.execute(
        delete(ProductReport).where(ProductReport.product_id == product_id)
    )
    cleared["reports"] = report_result.rowcount
    
    # 6. 删除维度总结
    summary_result = await db.execute(
        delete(ProductDimensionSummary).where(ProductDimensionSummary.product_id == product_id)
    )
    cleared["summaries"] = summary_result.rowcount
    
    # 7. 删除旧任务
    task_result = await db.execute(
        delete(Task).where(Task.product_id == product_id)
    )
    cleared["tasks"] = task_result.rowcount
    
    await db.commit()
    
    logger.info(f"[清空重分析] 清空完成: {cleared}")
    
    # ==================== 创建新任务并触发分析 ====================
    new_task = Task(
        product_id=product_id,
        task_type=TaskType.AUTO_ANALYSIS.value,
        status=TaskStatus.PENDING.value,
        total_items=4,
        processed_items=0
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    # 触发全自动分析
    celery_task = task_full_auto_analysis.delay(str(product_id), str(new_task.id))
    new_task.celery_task_id = celery_task.id
    await db.commit()
    
    logger.info(f"[清空重分析] 分析任务已触发: {new_task.id}")
    
    return {
        "success": True,
        "message": "AI 数据已清空，分析任务已启动",
        "asin": asin,
        "product_id": str(product_id),
        "task_id": str(new_task.id),
        "review_count": len(review_ids),
        "cleared": cleared
    }


# ==========================================
# [NEW] 批量清空并重新分析（按日期筛选）
# ==========================================

@products_router.post("/batch-clear-and-reanalyze")
async def batch_clear_and_reanalyze(
    before_date: str = Query(..., description="清空此日期之前的产品，格式: YYYY-MM-DD，如 2026-01-17"),
    dry_run: bool = Query(True, description="试运行模式，只返回将处理的产品列表，不实际执行"),
    limit: int = Query(100, description="最多处理多少个产品"),
    db: AsyncSession = Depends(get_db)
):
    """
    🧹 批量清空指定日期之前的产品 AI 分析数据，并重新触发分析
    
    用法示例：
    - 试运行: POST /products/batch-clear-and-reanalyze?before_date=2026-01-17&dry_run=true
    - 实际执行: POST /products/batch-clear-and-reanalyze?before_date=2026-01-17&dry_run=false
    
    清空内容（每个产品）：
    - 产品维度、5W标签、评论洞察、评论主题、产品报告、维度总结、任务
    
    保留内容：
    - 翻译结果、评论原始数据
    """
    from datetime import datetime
    from sqlalchemy import select, delete, and_, func
    from app.models.product import Product
    from app.models.review import Review
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.report import ProductReport
    from app.models.product_dimension_summary import ProductDimensionSummary
    from app.models.task import Task, TaskType, TaskStatus
    
    # 解析日期
    try:
        cutoff_date = datetime.strptime(before_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，请使用 YYYY-MM-DD 格式")
    
    # 查询符合条件的产品（有报告且报告创建日期在指定日期之前）
    products_result = await db.execute(
        select(Product.id, Product.asin, Product.title, func.count(Review.id).label('review_count'))
        .join(Review, Review.product_id == Product.id, isouter=True)
        .where(
            and_(
                Product.created_at < cutoff_date,
                Review.is_deleted == False
            )
        )
        .group_by(Product.id)
        .having(func.count(Review.id) > 0)
        .order_by(Product.created_at.asc())
        .limit(limit)
    )
    products = products_result.all()
    
    if not products:
        return {
            "success": True,
            "message": f"没有找到 {before_date} 之前且有评论的产品",
            "products_found": 0,
            "dry_run": dry_run
        }
    
    product_list = [
        {"asin": p.asin, "title": (p.title or "")[:50], "review_count": p.review_count}
        for p in products
    ]
    
    if dry_run:
        return {
            "success": True,
            "message": f"试运行模式：找到 {len(products)} 个产品待处理",
            "dry_run": True,
            "before_date": before_date,
            "products_found": len(products),
            "products": product_list
        }
    
    # 实际执行清空和重新分析
    results = []
    success_count = 0
    fail_count = 0
    
    for product in products:
        product_id = product.id
        asin = product.asin
        
        try:
            # 获取评论 IDs
            reviews_result = await db.execute(
                select(Review.id).where(
                    and_(
                        Review.product_id == product_id,
                        Review.is_deleted == False
                    )
                )
            )
            review_ids = [r[0] for r in reviews_result.all()]
            
            # 清空数据
            await db.execute(delete(ProductDimension).where(ProductDimension.product_id == product_id))
            await db.execute(delete(ProductContextLabel).where(ProductContextLabel.product_id == product_id))
            if review_ids:
                await db.execute(delete(ReviewInsight).where(ReviewInsight.review_id.in_(review_ids)))
                await db.execute(delete(ReviewThemeHighlight).where(ReviewThemeHighlight.review_id.in_(review_ids)))
            await db.execute(delete(ProductReport).where(ProductReport.product_id == product_id))
            await db.execute(delete(ProductDimensionSummary).where(ProductDimensionSummary.product_id == product_id))
            await db.execute(delete(Task).where(Task.product_id == product_id))
            
            await db.commit()
            
            # 创建新任务
            new_task = Task(
                product_id=product_id,
                task_type=TaskType.AUTO_ANALYSIS.value,
                status=TaskStatus.PENDING.value,
                total_items=4,
                processed_items=0
            )
            db.add(new_task)
            await db.commit()
            await db.refresh(new_task)
            
            # 触发分析（延迟执行，避免瞬间压力太大）
            import random
            countdown = random.randint(5, 60)  # 随机延迟 5-60 秒
            task_full_auto_analysis.apply_async(
                args=[str(product_id), str(new_task.id)],
                countdown=countdown
            )
            
            results.append({
                "asin": asin,
                "status": "success",
                "task_id": str(new_task.id),
                "countdown": countdown
            })
            success_count += 1
            logger.info(f"[批量重分析] {asin} 成功，任务ID: {new_task.id}，延迟 {countdown}s")
            
        except Exception as e:
            results.append({
                "asin": asin,
                "status": "failed",
                "error": str(e)
            })
            fail_count += 1
            logger.error(f"[批量重分析] {asin} 失败: {e}")
            await db.rollback()
    
    return {
        "success": True,
        "message": f"批量处理完成：成功 {success_count} 个，失败 {fail_count} 个",
        "dry_run": False,
        "before_date": before_date,
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results
    }


# ==========================================
# [NEW] 采集完成触发接口 - 全自动分析
# ==========================================

@products_router.post("/{asin}/collection-complete")
async def collection_complete(
    asin: str,
    workflow_mode: str = Query(
        default="one_step_insight",
        description="工作流模式: one_step_insight(一步到位) / translate_only(只翻译)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    🚀 采集完成触发接口 (Collection Complete Trigger)
    
    当 Chrome 插件采集完成后，调用此接口触发后续流程。
    
    **两种工作流模式：**
    
    1. **one_step_insight** (一步到位，默认)：
       - 流程：翻译 → 科学学习 → 洞察提取 → 主题提取 → 生成报告
       - 全自动，无需用户二次点击
       - 适合：快速获取分析结果
    
    2. **translate_only** (只翻译)：
       - 流程：仅完成翻译，状态变为"待分析"
       - 用户稍后可手动点击"开始分析"按钮
       - 适合：需要先查看翻译结果，或自定义维度后再分析
    
    Returns:
        - task_id: 任务 ID（仅 one_step_insight 模式）
        - status: "started" / "ready_for_analysis"
        - workflow_mode: 当前使用的模式
    """
    from sqlalchemy import select, func, and_
    from celery import current_app
    from app.models.product import Product
    from app.models.review import Review
    from app.models.task import Task, TaskType, TaskStatus
    from app.worker import task_full_auto_analysis
    
    # ==========================================
    # [预检查] Worker 健康状态检查
    # ==========================================
    try:
        inspect = current_app.control.inspect()
        registered = inspect.registered() or {}
        
        if not registered:
            raise HTTPException(
                status_code=503, 
                detail="⚠️ Celery Worker 未运行，请先执行: docker restart voc-worker"
            )
        
        # 检查必需任务是否已注册
        all_tasks = set()
        for worker_tasks in registered.values():
            all_tasks.update(worker_tasks)
        
        if 'app.worker.task_full_auto_analysis' not in all_tasks:
            raise HTTPException(
                status_code=503, 
                detail="⚠️ Worker 缺少 task_full_auto_analysis 任务，请执行: docker restart voc-worker 加载最新代码"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Worker health check failed: {e}")
        # 不阻断流程，继续执行（可能是 inspect 超时）
    
    # 获取产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # 检查评论数量
    review_count_result = await db.execute(
        select(func.count(Review.id))
        .where(
            and_(
                Review.product_id == product.id,
                Review.is_deleted == False
            )
        )
    )
    review_count = review_count_result.scalar() or 0
    
    # ==========================================
    # [NEW] 根据 workflow_mode 决定后续流程
    # ==========================================
    from app.api.schemas import WorkflowMode
    
    # 验证 workflow_mode
    valid_modes = [m.value for m in WorkflowMode]
    if workflow_mode not in valid_modes:
        workflow_mode = WorkflowMode.ONE_STEP_INSIGHT.value
    
    logger.info(f"[采集完成] 产品 {asin}，模式: {workflow_mode}，评论数: {review_count}")
    
    # ==========================================
    # 模式 B: TRANSLATE_ONLY - 只翻译，等待用户手动分析
    # ==========================================
    if workflow_mode == WorkflowMode.TRANSLATE_ONLY.value:
        logger.info(f"[TRANSLATE_ONLY] 产品 {asin} 采集完成，仅翻译模式，跳过自动分析")
        
        return {
            "success": True,
            "status": "ready_for_analysis",
            "workflow_mode": workflow_mode,
            "message": f"采集完成！共 {review_count} 条评论，翻译进行中。稍后可手动启动深度分析。",
            "product_id": str(product.id),
            "asin": asin,
            "review_count": review_count,
            "next_action": "点击「开始分析」按钮进行深度洞察"
        }
    
    # ==========================================
    # 模式 A: ONE_STEP_INSIGHT - 一步到位，全自动分析
    # ==========================================
    
    # [UPDATED 2026-01-19] 移除评论数量限制，只要有评论就可以进行分析
    if review_count < 1:
        raise HTTPException(
            status_code=400, 
            detail=f"没有可分析的评论，请先采集评论数据"
        )
    
    # 检查是否已有 AUTO_ANALYSIS 任务在运行
    existing_task_result = await db.execute(
        select(Task).where(
            and_(
                Task.product_id == product.id,
                Task.task_type == TaskType.AUTO_ANALYSIS.value,
                Task.status.in_([TaskStatus.PENDING.value, TaskStatus.PROCESSING.value])
            )
        )
    )
    existing_task = existing_task_result.scalar_one_or_none()
    
    if existing_task:
        logger.info(f"[ONE_STEP_INSIGHT] 产品 {asin} 已有运行中的任务: {existing_task.id}")
        return {
            "success": True,
            "status": "already_running",
            "workflow_mode": workflow_mode,
            "message": f"分析任务已在运行中，进度: {existing_task.processed_items}/{existing_task.total_items}",
            "task_id": str(existing_task.id),
            "product_id": str(product.id),
            "asin": asin,
            "review_count": review_count
        }
    
    # 删除旧的 AUTO_ANALYSIS 任务（如果存在）
    from sqlalchemy import delete
    await db.execute(
        delete(Task).where(
            and_(
                Task.product_id == product.id,
                Task.task_type == TaskType.AUTO_ANALYSIS.value
            )
        )
    )
    
    # 创建新的全自动分析任务
    new_task = Task(
        product_id=product.id,
        task_type=TaskType.AUTO_ANALYSIS.value,
        status=TaskStatus.PENDING.value,
        total_items=4,  # 4 个步骤：学习 → 触发提取 → 等待三任务并行 → 报告
        processed_items=0
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    # 触发 Celery 任务
    celery_task = task_full_auto_analysis.delay(str(product.id), str(new_task.id))
    
    # 更新 Celery 任务 ID
    new_task.celery_task_id = celery_task.id
    await db.commit()
    
    logger.info(f"[ONE_STEP_INSIGHT] 产品 {asin} 全自动分析启动成功，任务 ID: {new_task.id}")
    
    return {
        "success": True,
        "status": "started",
        "workflow_mode": workflow_mode,
        "message": f"全自动分析已启动，共 {review_count} 条评论待处理...",
        "task_id": str(new_task.id),
        "product_id": str(product.id),
        "asin": asin,
        "review_count": review_count
    }


@products_router.get("/{asin}/auto-analysis-status")
async def get_auto_analysis_status(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    🔍 获取全自动分析状态 (Get Auto Analysis Status)
    
    前端轮询此接口获取分析进度，判断何时可以跳转到详情页。
    
    Returns:
        - status: pending/processing/completed/failed
        - current_step: 当前步骤名称
        - progress: 进度百分比
        - report_id: 生成的报告 ID（如果已完成）
    """
    from sqlalchemy import select, and_, desc
    from app.models.product import Product
    from app.models.task import Task, TaskType, TaskStatus
    from app.models.report import ProductReport
    
    # 获取产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # 获取最新的 AUTO_ANALYSIS 任务
    task_result = await db.execute(
        select(Task)
        .where(
            and_(
                Task.product_id == product.id,
                Task.task_type == TaskType.AUTO_ANALYSIS.value
            )
        )
        .order_by(desc(Task.created_at))
        .limit(1)
    )
    task = task_result.scalar_one_or_none()
    
    if not task:
        return {
            "success": True,
            "status": "not_started",
            "message": "尚未启动全自动分析",
            "product_id": str(product.id),
            "asin": asin
        }
    
    # 步骤名称映射（流式并行优化的4步流程）
    # 翻译在 ingest 时就已经开始了！
    step_names = {
        0: "准备中",
        1: "学习维度和标签（基于英文原文）",
        2: "触发洞察+主题提取",
        3: "翻译+洞察+主题（三任务并行中）",
        4: "生成报告"
    }
    
    current_step = step_names.get(task.processed_items, "处理中")
    progress = (task.processed_items / task.total_items * 100) if task.total_items > 0 else 0
    
    response = {
        "success": True,
        "status": task.status,
        "current_step": current_step,
        "progress": round(progress, 1),
        "processed_items": task.processed_items,
        "total_items": task.total_items,
        "task_id": str(task.id),
        "product_id": str(product.id),
        "asin": asin,
        "error_message": task.error_message
    }
    
    # 如果已完成，获取报告 ID
    if task.status == TaskStatus.COMPLETED.value:
        report_result = await db.execute(
            select(ProductReport)
            .where(ProductReport.product_id == product.id)
            .order_by(desc(ProductReport.created_at))
            .limit(1)
        )
        report = report_result.scalar_one_or_none()
        if report:
            response["report_id"] = str(report.id)
            response["message"] = "分析完成！可以查看报告了"
        else:
            response["message"] = "分析完成"
    elif task.status == TaskStatus.FAILED.value:
        response["message"] = f"分析失败: {task.error_message or '未知错误'}"
    else:
        response["message"] = f"正在{current_step}..."
    
    return response


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
    2. Counts translated reviews and already processed reviews
    3. Dispatches insight extraction task to Celery worker
    
    Note: This does NOT re-translate reviews, only extracts insights from existing translations.
    """
    from sqlalchemy import select, func, and_
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.models.insight import ReviewInsight
    from app.worker import task_extract_insights
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # [UPDATED] 跨语言模式：统计有原文的评论数（不再依赖翻译）
    review_count_result = await db.execute(
        select(func.count(Review.id)).where(
            and_(
                Review.product_id == product.id,
                Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可
                Review.is_deleted == False
            )
        )
    )
    total_reviews = review_count_result.scalar() or 0
    
    # Count reviews that already have insights (processed)
    already_processed_result = await db.execute(
        select(func.count(func.distinct(ReviewInsight.review_id)))
        .join(Review, Review.id == ReviewInsight.review_id)
        .where(
            and_(
                Review.product_id == product.id,
                Review.is_deleted == False
            )
        )
    )
    already_processed = already_processed_result.scalar() or 0
    
    # Calculate remaining to process
    remaining_to_process = total_reviews - already_processed
    
    if total_reviews == 0:
        raise HTTPException(
            status_code=400, 
            detail="该产品暂无评论数据，无法进行洞察提取"  # [UPDATED] 更新错误信息
        )
    
    if remaining_to_process <= 0:
        return {
            "success": True,
            "message": "All reviews already have insights extracted",
            "product_id": str(product.id),
            "asin": asin,
            "reviews_to_process": 0,
            "total_reviews": total_reviews,
            "already_processed": already_processed
        }
    
    # Dispatch async task to Celery
    task_extract_insights.delay(str(product.id))
    logger.info(f"[跨语言洞察] Triggered insight extraction: {remaining_to_process} remaining (total={total_reviews}, done={already_processed}) for {asin}")
    
    return {
        "success": True,
        "message": f"Insight extraction started for {remaining_to_process} reviews",
        "product_id": str(product.id),
        "asin": asin,
        "reviews_to_process": remaining_to_process,  # 待处理数
        "total_reviews": total_reviews,              # [UPDATED] 总数（不再是已翻译数）
        "already_processed": already_processed       # 已处理数
    }


@products_router.post("/{asin}/stop-analysis")
async def stop_analysis_tasks(
    asin: str,
    db: AsyncSession = Depends(get_db)
):
    """
    停止产品的所有分析任务（翻译、洞察、主题提取）
    
    1. 使用 Celery revoke 终止正在运行的任务
    2. 更新 Task 表状态为 stopped
    """
    from sqlalchemy import select, update
    from app.models.product import Product
    from app.models.task import Task, TaskStatus as ModelTaskStatus
    from app.worker import celery_app
    
    # Get product
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # 1. 获取 Celery 的活跃任务并终止
    inspect = celery_app.control.inspect()
    active_tasks = inspect.active()
    
    revoked_count = 0
    
    if active_tasks:
        product_id_str = str(product.id)
        for worker, tasks in active_tasks.items():
            for task in tasks:
                # 检查任务参数中是否包含此产品ID
                task_args = task.get('args', [])
                if task_args and len(task_args) > 0 and task_args[0] == product_id_str:
                    # 终止任务
                    celery_app.control.revoke(task['id'], terminate=True, signal='SIGKILL')
                    revoked_count += 1
                    logger.info(f"Revoked task {task['id']} for product {asin}")
    
    # 2. 更新 Task 表中所有 processing 状态的任务为 stopped
    await db.execute(
        update(Task)
        .where(
            Task.product_id == product.id,
            Task.status == ModelTaskStatus.PROCESSING.value
        )
        .values(status=ModelTaskStatus.STOPPED.value)
    )
    await db.commit()
    
    logger.info(f"Stopped all tasks for product {asin}, revoked {revoked_count} Celery tasks")
    
    return {
        "success": True,
        "message": f"已终止 {revoked_count} 个任务",
        "product_id": str(product.id),
        "asin": asin,
        "revoked_count": revoked_count
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
    
    # [UPDATED] 跨语言模式：统计有原文但无主题的评论数（不再依赖翻译）
    reviews_without_themes_result = await db.execute(
        select(func.count(Review.id))
        .where(
            and_(
                Review.product_id == product.id,
                Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可
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
        total_reviews_result = await db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可
                    Review.is_deleted == False
                )
            )
        )
        total_reviews = total_reviews_result.scalar() or 0
        
        if total_reviews == 0:
            raise HTTPException(
                status_code=400, 
                detail="主题提取失败：该产品暂无评论数据。"  # [UPDATED] 更新错误信息
            )
        else:
            raise HTTPException(
                status_code=400, 
                detail="主题提取失败：所有评论均已提取过主题关键词。"  # [UPDATED] 更新错误信息
            )
    
    # Dispatch async task to Celery
    task_extract_themes.delay(str(product.id))
    logger.info(f"[跨语言5W] Triggered theme extraction for {reviews_to_process} reviews of {asin}")
    
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


# ============== Report Types API ==============

@products_router.get("/report-types", response_model=ReportTypeListResponse)
async def get_report_types():
    """
    获取所有可用的报告类型配置。
    
    前端可通过此接口获取：
    - 所有可用的报告类型及其元数据
    - 用于生成报告的类型选择下拉框
    - 展示不同报告类型的图标、颜色、描述等
    
    返回按 sort_order 排序的类型列表，只包含已启用 (is_active=True) 的类型。
    """
    from app.services.summary_service import get_available_report_types
    
    configs = get_available_report_types()
    
    return ReportTypeListResponse(
        success=True,
        types=[ReportTypeInfo(**c.to_dict()) for c in configs],
        total=len(configs)
    )


@products_router.get("/reports/stats/weekly")
async def get_weekly_report_count(
    db: AsyncSession = Depends(get_db)
):
    """
    获取本周生成的报告数量统计
    
    返回本周（从周一开始）生成的报告总数
    """
    from sqlalchemy import select, func
    from app.models.report import ProductReport
    from datetime import datetime, timedelta
    
    try:
        # 计算本周的开始时间（周一 00:00:00 UTC）
        from datetime import timezone
        today = datetime.now(timezone.utc)
        # 获取本周一（weekday() 返回 0-6，0 是周一）
        days_since_monday = today.weekday()
        week_start = (today - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # 查询本周生成的报告数量（状态为 completed）
        result = await db.execute(
            select(func.count(ProductReport.id))
            .where(
                ProductReport.created_at >= week_start,
                ProductReport.status == "completed"
            )
        )
        count = result.scalar() or 0
        
        return {
            "success": True,
            "count": count,
            "week_start": week_start.isoformat()
        }
    except Exception as e:
        logger.error(f"获取本周报告统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


@products_router.get("/reports/all", response_model=ProductReportListResponse)
async def get_all_reports(
    limit: int = Query(default=100, description="返回的最大报告数量"),
    report_type: Optional[str] = Query(
        default=None,
        description="按类型筛选: comprehensive, operations, product, supply_chain"
    ),
    my_only: bool = Query(default=False, description="只返回当前用户关注的产品的报告"),
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有产品的报告列表（用于报告库页面）。
    
    返回所有产品生成过的报告，按创建时间倒序排列。
    
    **筛选参数：**
    - `report_type`: 可选，按报告类型筛选
    - `my_only`: 可选，只返回当前用户关注的产品的报告
    - `limit`: 最大返回数量，默认100
    """
    from sqlalchemy import select, desc
    from app.models.product import Product
    from app.models.report import ProductReport
    from app.models.user_project import UserProject
    
    try:
        # 如果 my_only=True 但用户未登录，返回空列表
        if my_only and not current_user:
            return ProductReportListResponse(
                success=True,
                reports=[],
                total=0
            )
        
        # 构建查询
        query = select(ProductReport).join(Product)
        
        # 用户关注过滤：只返回用户关注的产品的报告
        if my_only and current_user:
            query = query.join(
                UserProject,
                UserProject.product_id == Product.id
            ).where(
                UserProject.user_id == current_user.id,
                UserProject.is_deleted == False
            )
        
        # 类型筛选
        if report_type:
            query = query.where(ProductReport.report_type == report_type)
        
        # 按创建时间倒序
        query = query.order_by(desc(ProductReport.created_at)).limit(limit)
        
        result = await db.execute(query)
        reports = result.scalars().all()
        
        # 如果没有报告，直接返回空列表
        if not reports:
            return ProductReportListResponse(
                success=True,
                reports=[],
                total=0
            )
        
        # 获取关联的产品信息
        product_ids = [r.product_id for r in reports]
        products_result = await db.execute(
            select(Product).where(Product.id.in_(product_ids))
        )
        products = {p.id: p for p in products_result.scalars().all()}
        
        # 构建响应
        report_responses = [
            ProductReportResponse(
                id=str(r.id),
                product_id=str(r.product_id),
                report_type=r.report_type,
                title=r.title,
                content=r.content,
                status=r.status,
                created_at=r.created_at.isoformat() if r.created_at else None,
                updated_at=r.updated_at.isoformat() if r.updated_at else None,
                product=ProductBriefInfo(
                    asin=products[r.product_id].asin,
                    title=products[r.product_id].title,
                    image_url=products[r.product_id].image_url,
                    price=products[r.product_id].price,
                    average_rating=products[r.product_id].average_rating
                ) if r.product_id in products else None
            )
            for r in reports
        ]
        
        return ProductReportListResponse(
            success=True,
            reports=report_responses,
            total=len(report_responses)
        )
    except Exception as e:
        import logging
        logging.error(f"Error fetching all reports: {e}")
        raise HTTPException(status_code=500, detail="获取报告列表失败")


# ============== Report Generation API ==============

@products_router.post("/{asin}/report/generate-async")
async def generate_product_report_async(
    asin: str,
    report_type: str = Query(
        default="comprehensive",
        description="报告类型: comprehensive(综合版), operations(运营版), product(产品版), supply_chain(供应链版)"
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    🚀 异步生成报告（推荐使用）
    
    触发后台 Celery 任务生成报告，立即返回任务 ID。
    用户可以离开页面，报告会在后台继续生成。
    
    使用流程：
    1. 调用此 API 触发报告生成，获取 task_id
    2. 轮询 GET /products/{asin}/report/task/{task_id} 获取状态
    3. 状态为 completed 时，从响应中获取 report_id
    4. 使用 report_id 查看报告
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import validate_report_type, get_report_type_config, REPORT_TYPE_CONFIGS
    from app.worker import task_generate_report
    
    # 验证报告类型
    if not validate_report_type(report_type):
        available_types = ", ".join(REPORT_TYPE_CONFIGS.keys())
        raise HTTPException(
            status_code=400, 
            detail=f"无效的报告类型: '{report_type}'。可用类型: {available_types}"
        )
    
    # 获取产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # 触发异步任务
    task = task_generate_report.delay(str(product.id), report_type)
    
    type_config = get_report_type_config(report_type)
    
    logger.info(f"[异步报告] 已触发任务 {task.id} 为产品 {asin} 生成 {report_type} 报告")
    
    # ReportTypeConfig 是 dataclass，使用属性访问
    config_dict = {}
    if type_config:
        config_dict = {
            "label": type_config.short_name,
            "description": type_config.description,
            "icon": type_config.icon
        }
    
    return {
        "success": True,
        "status": "started",
        "message": f"报告生成任务已启动，请等待完成",
        "task_id": task.id,
        "product_id": str(product.id),
        "asin": asin,
        "report_type": report_type,
        "report_type_config": config_dict
    }


@products_router.get("/{asin}/report/task/{task_id}")
async def get_report_task_status(
    asin: str,
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    查询异步报告生成任务的状态。
    
    状态说明：
    - pending: 任务等待中
    - started: 任务已开始
    - processing: 正在生成
    - completed: 生成完成（包含 report_id）
    - failed: 生成失败（包含 error）
    """
    from celery.result import AsyncResult
    from app.worker import celery_app
    
    result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "asin": asin,
        "status": result.status.lower() if result.status else "unknown",
        "progress": 0,
        "current_step": "准备中..."
    }
    
    if result.ready():
        if result.successful():
            task_result = result.result
            # 检查任务是否真正成功
            if task_result and task_result.get("success", False):
                response["status"] = "completed"
                response["report_id"] = task_result.get("report_id")
                response["success"] = True
                response["progress"] = 100
                response["current_step"] = "报告生成完成"
            else:
                # 任务执行完成但失败（如报告生成失败）
                response["status"] = "failed"
                response["error"] = task_result.get("error") if task_result else "报告生成失败"
                response["progress"] = 0
                response["current_step"] = "生成失败"
        else:
            response["status"] = "failed"
            response["error"] = str(result.result) if result.result else "未知错误"
            response["progress"] = 0
            response["current_step"] = "生成失败"
    elif result.status == "PROGRESS":
        # 读取进度信息
        response["status"] = "processing"
        if result.info:
            response["progress"] = result.info.get("progress", 50)
            response["current_step"] = result.info.get("current_step", "正在生成...")
    elif result.status == "STARTED":
        response["status"] = "processing"
        response["progress"] = 10
        response["current_step"] = "任务已启动..."
    elif result.status == "PENDING":
        response["status"] = "pending"
        response["progress"] = 0
        response["current_step"] = "等待中..."
    
    return response


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
    
    **报告类型说明：**
    使用 GET /products/report-types 接口可获取所有可用类型的详细信息。
    
    **常用类型：**
    - `comprehensive`: CEO/综合战略版 - 全局战略视角，SWOT分析，各部门指令
    - `operations`: CMO/运营市场版 - 卖点挖掘，广告定位，差评话术
    - `product`: CPO/产品研发版 - 质量评分，缺陷分析，迭代建议
    - `supply_chain`: 供应链/质检版 - 材质问题，包装优化，QC清单
    
    **输出格式：**
    - `content`: JSON 格式的 AI 结构化分析结果（用于渲染卡片、列表等）
    - `analysis_data`: 原始统计数据（用于 ECharts/Recharts 图表）
    - `report_type_config`: 报告类型的详细配置信息
    
    **前置条件：**
    - 产品需要有至少 10 条已翻译的评论
    - 建议先运行主题提取 (extract-themes) 和洞察提取 (extract-insights)
    
    **注意：** 报告生成需要 30-60 秒，因为需要调用 AI 进行深度分析。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService, validate_report_type, get_report_type_config
    
    # [UPDATED] 使用新的验证函数
    if not validate_report_type(report_type):
        type_config = get_report_type_config(report_type)
        from app.services.summary_service import REPORT_TYPE_CONFIGS
        available_types = ", ".join(REPORT_TYPE_CONFIGS.keys())
        raise HTTPException(
            status_code=400, 
            detail=f"无效的报告类型: '{report_type}'。可用类型: {available_types}"
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
    no_cache: bool = Query(False, description="跳过缓存"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品最新的报告（秒开，不用重新生成）。
    
    🚀 Performance: Results are cached in Redis for 10 minutes.
    
    如果存在历史报告，直接返回最新的一份。
    如果没有历史报告，返回 404。
    """
    from sqlalchemy import select
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    from app.core.cache import get_cache_service
    
    # 🚀 尝试从缓存获取
    cache = await get_cache_service()
    if not no_cache:
        cached = await cache.get_product_stats(asin, "latest_report")
        if cached:
            logger.debug(f"[Cache HIT] Latest report for {asin}")
            return ProductReportResponse(**cached)
    
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
        
        response_data = {
            "id": str(report.id),
            "product_id": str(report.product_id),
            "title": report.title,
            "content": report.content,
            "analysis_data": report.analysis_data,
            "report_type": report.report_type,
            "status": report.status,
            "error_message": report.error_message,
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None
        }
        
        # 🚀 写入缓存
        await cache.set_product_stats(asin, response_data, "latest_report")
        logger.debug(f"[Cache SET] Latest report for {asin}")
        
        return ProductReportResponse(**response_data)
        
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


@products_router.get("/{asin}/reports/{report_id}/pdf")
async def export_report_pdf(
    asin: str,
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    导出报告为 PDF 文件。
    
    使用 Playwright 将报告页面渲染为高质量 PDF，包含：
    - 网站 Logo 和名称
    - 产品信息
    - 完整报告内容
    - 页眉页脚（含页码）
    
    返回：PDF 文件流（application/pdf）
    """
    from fastapi.responses import Response
    from sqlalchemy import select
    from uuid import UUID as PyUUID
    from app.models.product import Product
    from app.services.summary_service import SummaryService
    from app.services.pdf_service import generate_report_pdf_with_retry
    
    # 验证产品存在
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    # 验证报告存在
    summary_service = SummaryService(db)
    report = await summary_service.get_report_by_id(PyUUID(report_id))
    
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")
    
    if report.product_id != product.id:
        raise HTTPException(status_code=404, detail="报告不属于该产品")
    
    try:
        # 生成 PDF
        pdf_bytes = await generate_report_pdf_with_retry(asin, report_id)
        
        # 生成文件名
        from datetime import datetime
        filename = f"产品分析报告_{asin}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes))
            }
        )
        
    except Exception as e:
        logger.error(f"PDF 导出失败: {e}")
        raise HTTPException(status_code=500, detail=f"PDF 导出失败: {str(e)}")


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

