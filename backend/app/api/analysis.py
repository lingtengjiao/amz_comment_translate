"""
Analysis API Router - 对比分析模块 API

提供以下功能：
1. 创建对比分析项目
2. 获取项目列表
3. 获取项目详情（含分析结果）
4. 触发分析任务
5. 删除项目
6. 获取对比预览数据
7. [NEW] SSE 流式进度推送
"""
import logging
import json
import asyncio
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_db, async_session_maker
from app.services.analysis_service import AnalysisService
from app.models.analysis import AnalysisStatus
from app.models.user import User
from app.services.auth_service import get_current_user
from app.core.redis import get_async_redis, AnalysisProgressTracker
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["Analysis"])


# ==========================================
# Pydantic Schemas
# ==========================================

class ProductItemInput(BaseModel):
    """产品输入项"""
    product_id: UUID = Field(..., description="产品 UUID")
    role_label: Optional[str] = Field(None, description="角色标签: target/competitor/gen1/gen2")


class CreateComparisonRequest(BaseModel):
    """创建分析请求（支持对比分析和市场洞察）"""
    title: str = Field(..., min_length=1, max_length=255, description="项目标题")
    description: Optional[str] = Field(None, description="项目描述")
    products: List[ProductItemInput] = Field(..., min_length=2, max_length=10, description="产品列表（2-10个）")
    analysis_type: Optional[str] = Field("comparison", description="分析类型: comparison(对比分析) 或 market_insight(市场洞察)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "2024新款 vs 竞品X 对比分析",
                "description": "对比分析我们的新款产品与主要竞品的用户口碑差异",
                "products": [
                    {"product_id": "550e8400-e29b-41d4-a716-446655440000", "role_label": "target"},
                    {"product_id": "550e8400-e29b-41d4-a716-446655440001", "role_label": "competitor"}
                ],
                "analysis_type": "comparison"
            }
        }


class ComparisonPreviewRequest(BaseModel):
    """对比预览请求"""
    product_ids: List[UUID] = Field(..., min_length=2, max_length=5, description="产品 UUID 列表")


class AnalysisProjectItemResponse(BaseModel):
    """分析项目产品项响应"""
    id: str
    product_id: str
    role_label: Optional[str]
    display_order: int
    product: Optional[dict] = None  # 产品详情


class AnalysisProjectResponse(BaseModel):
    """分析项目响应"""
    id: str
    title: str
    description: Optional[str]
    analysis_type: str
    user_id: Optional[str] = None
    status: str
    result_content: Optional[dict] = None
    raw_data_snapshot: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: Optional[str]
    updated_at: Optional[str]
    items: List[AnalysisProjectItemResponse] = []


class AnalysisProjectListResponse(BaseModel):
    """项目列表响应"""
    success: bool
    total: int
    projects: List[AnalysisProjectResponse]


class CreateAnalysisResponse(BaseModel):
    """创建分析响应"""
    success: bool
    message: str
    project: Optional[AnalysisProjectResponse] = None
    error: Optional[str] = None


class RunAnalysisResponse(BaseModel):
    """触发分析响应"""
    success: bool
    message: str
    project_id: str
    status: str


class ComparisonPreviewResponse(BaseModel):
    """对比预览响应"""
    success: bool
    products: dict
    can_compare: bool
    error: Optional[str] = None


# [NEW] 产品分析状态检查相关 Schema
class ProductAnalysisStatusRequest(BaseModel):
    """产品分析状态检查请求"""
    product_ids: List[UUID] = Field(..., min_length=1, max_length=10, description="产品 UUID 列表")


class ProductAnalysisStatusItem(BaseModel):
    """单个产品的分析状态"""
    product_id: str
    asin: str
    title: str
    has_dimensions: bool
    has_labels: bool
    is_ready: bool  # has_dimensions AND has_labels


class ProductAnalysisStatusResponse(BaseModel):
    """产品分析状态检查响应"""
    success: bool
    all_ready: bool  # 是否所有产品都已完成分析
    products: List[ProductAnalysisStatusItem]
    incomplete_count: int
    message: Optional[str] = None


# ==========================================
# API Endpoints
# ==========================================

@router.post("/projects", response_model=CreateAnalysisResponse, status_code=201)
async def create_analysis_project(
    request: CreateComparisonRequest,
    background_tasks: BackgroundTasks,
    auto_run: bool = Query(True, description="是否自动触发分析"),
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    创建分析项目（支持对比分析和市场洞察）
    
    - 对比分析: 至少需要 2 个产品，最多支持 5 个
    - 市场洞察: 至少需要 2 个产品，最多支持 10 个
    - 默认会自动触发分析任务（后台执行）
    - 可通过 auto_run=false 仅创建项目不触发分析
    - 如果用户已登录，会记录创建者 user_id
    """
    service = AnalysisService(db)
    user_id = current_user.id if current_user else None
    
    try:
        # 提取产品 ID 和角色标签
        product_ids = [p.product_id for p in request.products]
        role_labels = [p.role_label for p in request.products]
        
        # 根据分析类型创建项目
        analysis_type = request.analysis_type or "comparison"
        
        # 根据分析类型验证产品数量
        if analysis_type == "market_insight":
            if len(product_ids) > 10:
                raise ValueError("市场洞察最多支持 10 个产品")
            
            # [NEW] 前置检查：市场洞察需要所有产品都已完成单产品分析
            from app.services.project_learning_service import ProjectLearningService
            learning_service = ProjectLearningService(db)
            incomplete_products = await learning_service.get_incomplete_products(product_ids)
            
            if incomplete_products:
                # 构建错误信息
                incomplete_asins = [p.get("asin", "Unknown") for p in incomplete_products[:5]]
                if len(incomplete_products) > 5:
                    incomplete_asins.append(f"等共 {len(incomplete_products)} 个")
                raise ValueError(
                    f"以下产品尚未完成分析：{', '.join(incomplete_asins)}。"
                    f"市场洞察需要所有产品都已完成单产品分析（有维度和标签），请等待分析完成后重试。"
                )
            
            project = await service.create_market_insight_project(
                title=request.title,
                product_ids=product_ids,
                description=request.description,
                role_labels=role_labels,
                user_id=user_id
            )
        else:
            # 对比分析最多支持 5 个产品
            if len(product_ids) > 5:
                raise ValueError("对比分析最多支持 5 个产品")
            project = await service.create_comparison_project(
                title=request.title,
                product_ids=product_ids,
                description=request.description,
                role_labels=role_labels,
                user_id=user_id
            )
        
        # 如果需要自动触发分析
        if auto_run:
            # 使用后台任务异步执行（不阻塞 API 响应）
            # 注意：不能直接传递 db session，需要在后台任务中重新创建
            background_tasks.add_task(_run_analysis_background, project.id)
            type_name = "市场洞察" if analysis_type == "market_insight" else "对比分析"
            message = f"{type_name}项目已创建，分析任务已在后台启动"
        else:
            message = "项目已创建，请手动触发分析"
        
        # 重新加载以获取完整的关联数据
        project = await service.get_project(project.id)
        
        return CreateAnalysisResponse(
            success=True,
            message=message,
            project=AnalysisProjectResponse(
                id=str(project.id),
                title=project.title,
                description=project.description,
                analysis_type=project.analysis_type,
                status=project.status,
                result_content=project.result_content,
                raw_data_snapshot=project.raw_data_snapshot,
                error_message=project.error_message,
                created_at=project.created_at.isoformat() if project.created_at else None,
                updated_at=project.updated_at.isoformat() if project.updated_at else None,
                items=[
                    AnalysisProjectItemResponse(
                        id=str(item.id),
                        product_id=str(item.product_id),
                        role_label=item.role_label,
                        display_order=item.display_order,
                        product=item.to_dict().get("product")
                    ) for item in project.items
                ]
            )
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"创建分析项目失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


async def _run_analysis_background(project_id: UUID):
    """后台执行分析任务（带进度追踪）"""
    from app.core.redis import get_async_redis, AnalysisProgressTracker
    
    # 初始化进度追踪器
    redis = await get_async_redis()
    tracker = AnalysisProgressTracker(redis)
    await tracker.init_progress(str(project_id), total_steps=5)
    
    # 定义进度回调函数
    async def progress_callback(step: int, step_name: str, percent: int, message: str = ""):
        await tracker.update_progress(str(project_id), step, step_name, percent, message)
    
    # 在后台任务中重新创建数据库会话
    async with async_session_maker() as db:
        try:
            service = AnalysisService(db)
            await service.run_analysis(project_id, progress_callback=progress_callback)
            await db.commit()
            await tracker.complete(str(project_id), success=True)
            logger.info(f"后台分析任务完成: {project_id}")
        except Exception as e:
            await db.rollback()
            await tracker.complete(str(project_id), success=False, error_message=str(e))
            logger.error(f"后台分析任务失败: {project_id}, error: {e}", exc_info=True)
            # 更新项目状态为失败
            try:
                from app.models.analysis import AnalysisProject
                project = await db.get(AnalysisProject, project_id)
                if project:
                    project.status = AnalysisStatus.FAILED.value
                    project.error_message = str(e)
                    await db.commit()
            except Exception as update_error:
                logger.error(f"更新项目状态失败: {update_error}")


@router.get("/projects", response_model=AnalysisProjectListResponse)
async def list_projects(
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
    status: Optional[str] = Query(None, description="按状态筛选: pending/processing/completed/failed"),
    admin_only: bool = Query(False, description="只显示包含管理员关注产品的项目（用于市场洞察广场）"),
    my_only: bool = Query(False, description="只显示当前用户创建的项目"),
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取分析项目列表
    
    - 按创建时间倒序排列
    - 支持分页和状态筛选
    - admin_only=true 时只返回包含管理员关注产品的项目（用于市场洞察广场）
    - my_only=true 时只返回当前用户创建的项目
    """
    service = AnalysisService(db)
    
    try:
        # 获取当前用户ID
        user_id = current_user.id if current_user and my_only else None
        
        projects = await service.list_projects(
            limit=limit, 
            offset=offset, 
            status=status,
            admin_only=admin_only,
            user_id=user_id
        )
        
        return AnalysisProjectListResponse(
            success=True,
            total=len(projects),
            projects=[
                AnalysisProjectResponse(
                    id=str(p.id),
                    title=p.title,
                    description=p.description,
                    analysis_type=p.analysis_type,
                    user_id=str(p.user_id) if p.user_id else None,
                    status=p.status,
                    result_content=p.result_content,
                    raw_data_snapshot=p.raw_data_snapshot,
                    error_message=p.error_message,
                    created_at=p.created_at.isoformat() if p.created_at else None,
                    updated_at=p.updated_at.isoformat() if p.updated_at else None,
                    items=[
                        AnalysisProjectItemResponse(
                            id=str(item.id),
                            product_id=str(item.product_id),
                            role_label=item.role_label,
                            display_order=item.display_order,
                            product=item.to_dict().get("product")
                        ) for item in p.items
                    ]
                ) for p in projects
            ]
        )
        
    except Exception as e:
        logger.error(f"获取项目列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}", response_model=AnalysisProjectResponse)
async def get_project_detail(
    project_id: UUID,
    no_cache: bool = Query(False, description="跳过缓存"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取项目详情
    
    🚀 Performance: Completed projects are cached in Redis for 10 minutes.
    
    - 包含完整的分析结果（result_content）
    - 包含原始数据快照（raw_data_snapshot）
    - 包含关联的产品信息
    """
    from app.core.cache import get_cache_service
    
    cache = await get_cache_service()
    cache_key = f"cache:analysis_project:{project_id}"
    
    # 🚀 尝试从缓存获取
    if not no_cache:
        cached = await cache.get(cache_key)
        if cached:
            logger.debug(f"[Cache HIT] Analysis project {project_id}")
            return AnalysisProjectResponse(**cached)
    
    service = AnalysisService(db)
    
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    response_data = {
        "id": str(project.id),
        "title": project.title,
        "description": project.description,
        "analysis_type": project.analysis_type,
        "user_id": str(project.user_id) if project.user_id else None,
        "status": project.status,
        "result_content": project.result_content,
        "raw_data_snapshot": project.raw_data_snapshot,
        "error_message": project.error_message,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "items": [
            {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "role_label": item.role_label,
                "display_order": item.display_order,
                "product": item.to_dict().get("product")
            } for item in project.items
        ]
    }
    
    # 🚀 只缓存已完成的项目
    if project.status == AnalysisStatus.COMPLETED.value:
        await cache.set(cache_key, response_data, ttl=600)  # 10分钟
        logger.debug(f"[Cache SET] Analysis project {project_id}")
    
    return AnalysisProjectResponse(**response_data)


@router.post("/projects/{project_id}/run", response_model=RunAnalysisResponse)
async def trigger_analysis(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    手动触发分析任务
    
    - 如果项目状态为 pending 或 failed，可以重新触发
    - 分析在后台异步执行
    """
    service = AnalysisService(db)
    
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 检查状态
    if project.status == AnalysisStatus.PROCESSING.value:
        raise HTTPException(status_code=400, detail="分析任务正在执行中，请稍后查询结果")
    
    # 重置状态
    project.status = AnalysisStatus.PENDING.value
    project.error_message = None
    await db.commit()
    
    # 后台执行（不能传递 db session）
    background_tasks.add_task(_run_analysis_background, project_id)
    
    return RunAnalysisResponse(
        success=True,
        message="分析任务已启动",
        project_id=str(project_id),
        status="pending"
    )


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    删除分析项目
    
    - 同时删除关联的项目明细
    - 不可恢复
    """
    service = AnalysisService(db)
    
    success = await service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    return {"success": True, "message": "项目已删除"}


# ==========================================
# [NEW] SSE 流式进度推送
# ==========================================

@router.get("/projects/{project_id}/progress/stream")
async def stream_analysis_progress(project_id: UUID):
    """
    SSE 流式推送分析进度
    
    前端使用 EventSource 连接此端点，实时获取分析进度。
    
    事件格式：
    data: {"status": "processing", "step": 2, "step_name": "产品分析", "percent": 45, "message": "分析中..."}
    
    状态说明：
    - started: 任务已启动
    - processing: 正在处理
    - completed: 处理完成
    - failed: 处理失败
    """
    async def event_generator():
        redis = await get_async_redis()
        tracker = AnalysisProgressTracker(redis)
        
        # 最长等待 5 分钟（300秒）
        max_wait = 300
        elapsed = 0
        last_progress = None
        
        while elapsed < max_wait:
            progress = await tracker.get_progress(str(project_id))
            
            if progress:
                # 只有进度变化时才发送
                if progress != last_progress:
                    yield f"data: {json.dumps(progress, ensure_ascii=False)}\n\n"
                    last_progress = progress
                
                # 如果任务已完成或失败，发送最终事件并关闭
                if progress.get("status") in ["completed", "failed"]:
                    yield f"event: close\ndata: {json.dumps({'reason': progress.get('status')})}\n\n"
                    break
            else:
                # 没有进度数据，可能任务还没启动
                yield f"data: {json.dumps({'status': 'waiting', 'message': '等待任务启动...'})}\n\n"
            
            await asyncio.sleep(1)  # 每秒检查一次
            elapsed += 1
        
        if elapsed >= max_wait:
            yield f"event: timeout\ndata: {json.dumps({'message': '进度超时'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用 Nginx 缓冲
        }
    )


@router.get("/projects/{project_id}/progress")
async def get_analysis_progress(project_id: UUID):
    """
    获取当前分析进度（轮询备用接口）
    
    如果 SSE 不可用，前端可以用此接口轮询
    """
    redis = await get_async_redis()
    tracker = AnalysisProgressTracker(redis)
    
    progress = await tracker.get_progress(str(project_id))
    if not progress:
        return {"status": "unknown", "message": "无进度数据"}
    
    return progress


# [NEW] 产品分析状态检查接口
@router.post("/products/analysis-status", response_model=ProductAnalysisStatusResponse)
async def check_products_analysis_status(
    request: ProductAnalysisStatusRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    检查多个产品的分析完成状态
    
    用于市场洞察功能：
    - 市场洞察需要所有选中产品都已完成单产品分析（有维度和标签）
    - 返回每个产品的状态，前端可据此显示提示
    """
    from app.services.project_learning_service import ProjectLearningService
    
    try:
        learning_service = ProjectLearningService(db)
        status = await learning_service.check_products_analysis_status(request.product_ids)
        
        # 转换为响应格式
        products = []
        incomplete_count = 0
        
        for product_id, info in status.items():
            is_ready = info.get("is_ready", False)
            if not is_ready:
                incomplete_count += 1
            
            products.append(ProductAnalysisStatusItem(
                product_id=product_id,
                asin=info.get("asin", "Unknown"),
                title=info.get("title", "Unknown")[:50],  # 截断标题
                has_dimensions=info.get("has_dimensions", False),
                has_labels=info.get("has_labels", False),
                is_ready=is_ready
            ))
        
        all_ready = incomplete_count == 0
        
        message = None
        if not all_ready:
            message = f"有 {incomplete_count} 个产品尚未完成分析，请等待分析完成后再创建市场洞察"
        
        return ProductAnalysisStatusResponse(
            success=True,
            all_ready=all_ready,
            products=products,
            incomplete_count=incomplete_count,
            message=message
        )
        
    except Exception as e:
        logger.error(f"检查产品分析状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview", response_model=ComparisonPreviewResponse)
async def get_comparison_preview(
    request: ComparisonPreviewRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    获取对比预览数据
    
    - 不调用 AI，仅返回各产品的聚合统计数据
    - 用于前端展示对比前的数据预览
    - 帮助用户确认是否有足够的数据进行对比
    """
    service = AnalysisService(db)
    
    try:
        result = await service.get_comparison_preview(request.product_ids)
        return ComparisonPreviewResponse(**result)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"获取对比预览失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# Project-Level Review Query APIs (for Market Insight)
# ==========================================

@router.get("/projects/{project_id}/reviews-by-label")
async def get_project_reviews_by_label(
    project_id: UUID,
    dimension: str = Query(..., description="5W 维度类型: buyer/user/where/when/why/what"),
    label: str = Query(..., description="标签名称"),
    limit: int = Query(100, ge=1, le=500, description="每个产品返回数量"),
    db: AsyncSession = Depends(get_db)
):
    """
    [Market Insight] 根据标签查询所有产品的相关评论
    
    逻辑：
    1. 优先通过 project_label_mappings 找到项目级标签对应的所有产品级标签
    2. 如果找不到项目级标签，回退到直接从产品级评论中查询（兼容 data_statistics 中的产品级标签统计）
    3. 查询每个产品中匹配的评论
    4. 返回所有产品的评论列表（按产品分组）
    """
    from app.models.product import Product
    from app.models.review import Review
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.project_learning import ProjectContextLabel, ProjectLabelMapping
    from app.models.product_context_label import ProductContextLabel
    from app.models.analysis import AnalysisProject
    
    products_data = []
    total_reviews = 0
    
    # 1. 查找项目级标签
    stmt = (
        select(ProjectContextLabel)
        .where(ProjectContextLabel.project_id == project_id)
        .where(ProjectContextLabel.type == dimension)
        .where(ProjectContextLabel.name == label)
    )
    result = await db.execute(stmt)
    project_label = result.scalar_one_or_none()
    
    if project_label:
        # 方式一：通过项目级标签映射查询
        # 获取所有映射的产品级标签
        mapping_stmt = (
            select(ProjectLabelMapping, ProductContextLabel, Product)
            .join(ProductContextLabel, ProjectLabelMapping.product_label_id == ProductContextLabel.id)
            .join(Product, ProjectLabelMapping.product_id == Product.id)
            .where(ProjectLabelMapping.project_label_id == project_label.id)
        )
        mapping_result = await db.execute(mapping_stmt)
        mappings = mapping_result.all()
        
        for mapping, product_label, product in mappings:
            # 查询该产品标签对应的评论
            reviews_stmt = (
                select(Review, ReviewThemeHighlight.confidence, ReviewThemeHighlight.explanation)
                .join(ReviewThemeHighlight, ReviewThemeHighlight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewThemeHighlight.theme_type == dimension,
                    ReviewThemeHighlight.label_name == product_label.name
                )
                .limit(limit)
            )
            reviews_result = await db.execute(reviews_stmt)
            reviews = reviews_result.all()
            
            if reviews:
                product_reviews = [
                    {
                        "id": str(r.id),
                        "author": r.author or "匿名",
                        "rating": r.rating,
                        "date": r.review_date.isoformat() if r.review_date else None,
                        "title_original": r.title_original,
                        "title_translated": r.title_translated,
                        "body_original": r.body_original,
                        "body_translated": r.body_translated,
                        "verified_purchase": r.verified_purchase,
                        "confidence": confidence or "high",
                        "explanation": explanation,
                    }
                    for r, confidence, explanation in reviews
                ]
                
                products_data.append({
                    "product_id": str(product.id),
                    "asin": product.asin,
                    "title": (product.title_translated or product.title or product.asin)[:60],
                    "image_url": product.image_url,
                    "product_label": product_label.name,
                    "review_count": len(product_reviews),
                    "reviews": product_reviews
                })
                total_reviews += len(product_reviews)
    else:
        # 方式二：回退到直接从产品级评论中查询
        # 当 data_statistics 中的标签是产品级标签统计时使用此方式
        from app.models.analysis import AnalysisProjectItem
        
        # 获取项目关联的所有产品（通过 AnalysisProjectItem）
        items_stmt = (
            select(AnalysisProjectItem, Product)
            .join(Product, AnalysisProjectItem.product_id == Product.id)
            .where(AnalysisProjectItem.project_id == project_id)
        )
        items_result = await db.execute(items_stmt)
        project_items = items_result.all()
        
        for item, product in project_items:
            # 直接查询产品评论中匹配标签的记录
            reviews_stmt = (
                select(Review, ReviewThemeHighlight.confidence, ReviewThemeHighlight.explanation)
                .join(ReviewThemeHighlight, ReviewThemeHighlight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewThemeHighlight.theme_type == dimension,
                    ReviewThemeHighlight.label_name == label
                )
                .limit(limit)
            )
            reviews_result = await db.execute(reviews_stmt)
            reviews = reviews_result.all()
            
            if reviews:
                product_reviews = [
                    {
                        "id": str(r.id),
                        "author": r.author or "匿名",
                        "rating": r.rating,
                        "date": r.review_date.isoformat() if r.review_date else None,
                        "title_original": r.title_original,
                        "title_translated": r.title_translated,
                        "body_original": r.body_original,
                        "body_translated": r.body_translated,
                        "verified_purchase": r.verified_purchase,
                        "confidence": confidence or "high",
                        "explanation": explanation,
                    }
                    for r, confidence, explanation in reviews
                ]
                
                products_data.append({
                    "product_id": str(product.id),
                    "asin": product.asin,
                    "title": (product.title_translated or product.title or product.asin)[:60],
                    "image_url": product.image_url,
                    "product_label": label,
                    "review_count": len(product_reviews),
                    "reviews": product_reviews
                })
                total_reviews += len(product_reviews)
    
    return {
        "success": True,
        "project_label": label,
        "dimension": dimension,
        "total_reviews": total_reviews,
        "products": products_data
    }


@router.get("/projects/{project_id}/reviews-by-dimension")
async def get_project_reviews_by_dimension(
    project_id: UUID,
    dimension_type: str = Query(..., description="维度类型: strength/weakness/suggestion/scenario/emotion"),
    dimension: str = Query(..., description="维度名称"),
    limit: int = Query(100, ge=1, le=500, description="每个产品返回数量"),
    db: AsyncSession = Depends(get_db)
):
    """
    [Market Insight] 根据维度查询所有产品的相关评论
    
    逻辑：
    1. 优先通过 project_dimension_mappings 找到项目级维度对应的所有产品级维度
    2. 如果找不到项目级维度，回退到直接从产品级评论中查询（兼容 data_statistics 中的产品级维度统计）
    3. 查询每个产品中匹配的评论
    4. 返回所有产品的评论列表（按产品分组）
    """
    from app.models.product import Product
    from app.models.review import Review
    from app.models.insight import ReviewInsight
    from app.models.project_learning import ProjectDimension, ProjectDimensionMapping
    from app.models.product_dimension import ProductDimension
    from app.models.analysis import AnalysisProject
    
    # 映射 insight 类型
    insight_type_map = {
        'strength': 'strength',
        'weakness': 'weakness',
        'pros': 'strength',  # 兼容旧参数
        'cons': 'weakness',  # 兼容旧参数
        'suggestion': 'suggestion',
        'scenario': 'scenario',
        'emotion': 'emotion'
    }
    insight_type = insight_type_map.get(dimension_type, dimension_type)
    
    # 映射到 ProductDimension 的 dimension_type
    dim_type_map = {
        'strength': 'product',
        'weakness': 'product',
        'pros': 'product',
        'cons': 'product',
        'suggestion': 'product',
        'scenario': 'scenario',
        'emotion': 'emotion'
    }
    db_dim_type = dim_type_map.get(dimension_type, 'product')
    
    products_data = []
    total_reviews = 0
    
    # 1. 查找项目级维度
    stmt = (
        select(ProjectDimension)
        .where(ProjectDimension.project_id == project_id)
        .where(ProjectDimension.dimension_type == db_dim_type)
        .where(ProjectDimension.name == dimension)
    )
    result = await db.execute(stmt)
    project_dimension = result.scalar_one_or_none()
    
    if project_dimension:
        # 方式一：通过项目级维度映射查询
        # 获取所有映射的产品级维度
        mapping_stmt = (
            select(ProjectDimensionMapping, ProductDimension, Product)
            .join(ProductDimension, ProjectDimensionMapping.product_dimension_id == ProductDimension.id)
            .join(Product, ProjectDimensionMapping.product_id == Product.id)
            .where(ProjectDimensionMapping.project_dimension_id == project_dimension.id)
        )
        mapping_result = await db.execute(mapping_stmt)
        mappings = mapping_result.all()
        
        for mapping, product_dim, product in mappings:
            # 查询该产品维度对应的评论（通过 insights 表）
            reviews_stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == insight_type,
                    ReviewInsight.dimension == product_dim.name
                )
                .limit(limit)
            )
            reviews_result = await db.execute(reviews_stmt)
            reviews = reviews_result.all()
            
            if reviews:
                product_reviews = [
                    {
                        "id": str(r.id),
                        "author": r.author or "匿名",
                        "rating": r.rating,
                        "date": r.review_date.isoformat() if r.review_date else None,
                        "title_original": r.title_original,
                        "title_translated": r.title_translated,
                        "body_original": r.body_original,
                        "body_translated": r.body_translated,
                        "verified_purchase": r.verified_purchase,
                        "confidence": confidence or "high",
                        "explanation": analysis,
                    }
                    for r, confidence, analysis in reviews
                ]
                
                products_data.append({
                    "product_id": str(product.id),
                    "asin": product.asin,
                    "title": (product.title_translated or product.title or product.asin)[:60],
                    "image_url": product.image_url,
                    "product_dimension": product_dim.name,
                    "review_count": len(product_reviews),
                    "reviews": product_reviews
                })
                total_reviews += len(product_reviews)
    else:
        # 方式二：回退到直接从产品级评论中查询
        # 当 data_statistics 中的维度是产品级维度统计时使用此方式
        from app.models.analysis import AnalysisProjectItem
        
        # 获取项目关联的所有产品（通过 AnalysisProjectItem）
        items_stmt = (
            select(AnalysisProjectItem, Product)
            .join(Product, AnalysisProjectItem.product_id == Product.id)
            .where(AnalysisProjectItem.project_id == project_id)
        )
        items_result = await db.execute(items_stmt)
        project_items = items_result.all()
        
        for item, product in project_items:
            # 直接查询产品评论中匹配维度的记录
            reviews_stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == insight_type,
                    ReviewInsight.dimension == dimension
                )
                .limit(limit)
            )
            reviews_result = await db.execute(reviews_stmt)
            reviews = reviews_result.all()
            
            if reviews:
                product_reviews = [
                    {
                        "id": str(r.id),
                        "author": r.author or "匿名",
                        "rating": r.rating,
                        "date": r.review_date.isoformat() if r.review_date else None,
                        "title_original": r.title_original,
                        "title_translated": r.title_translated,
                        "body_original": r.body_original,
                        "body_translated": r.body_translated,
                        "verified_purchase": r.verified_purchase,
                        "confidence": confidence or "high",
                        "explanation": analysis,
                    }
                    for r, confidence, analysis in reviews
                ]
                
                products_data.append({
                    "product_id": str(product.id),
                    "asin": product.asin,
                    "title": (product.title_translated or product.title or product.asin)[:60],
                    "image_url": product.image_url,
                    "product_dimension": dimension,
                    "review_count": len(product_reviews),
                    "reviews": product_reviews
                })
                total_reviews += len(product_reviews)
    
    return {
        "success": True,
        "project_dimension": dimension,
        "dimension_type": dimension_type,
        "total_reviews": total_reviews,
        "products": products_data
    }


# ==========================================
# Product-Level Review Query APIs (for Comparison)
# ==========================================

@router.get("/products/{asin}/reviews-by-label")
async def get_reviews_by_label(
    asin: str,
    dimension: str = Query(..., description="维度类型: buyer/user/who/when/where/why/what/strength/weakness/suggestion/scenario/emotion"),
    label: str = Query(..., description="标签名称"),
    limit: int = Query(50, ge=1, le=200, description="返回数量"),
    db: AsyncSession = Depends(get_db)
):
    """
    根据维度和标签获取评论
    
    用于对比分析页面和报告详情页点击标签时显示相关评论
    
    维度类型:
    - 5W用户画像: buyer/user/who/when/where/why/what (2026-01-14: buyer/user 替代 who)
    - 5类口碑洞察: strength/weakness/suggestion/scenario/emotion
    """
    from app.models.product import Product
    from app.models.review import Review
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.insight import ReviewInsight
    
    # 获取产品
    stmt = select(Product).where(Product.asin == asin)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")
    
    review_data = []  # 存储 (review, confidence, explanation) 元组
    
    # "General" 标签在数据库中对应 "其他"、"Other"、"其它" 等值
    # summary_service.py 在聚合时将这些值统一映射为 "General"
    general_labels = ["General", "其他", "Other", "其它"]
    
    # 根据维度类型查询（同时获取 confidence 和 explanation）
    if dimension in ['buyer', 'user', 'who', 'when', 'where', 'why', 'what']:
        # 5W 维度 - 从 theme_highlights 表查询 (2026-01-14: 添加 buyer/user 支持)
        if label == "General":
            stmt = (
                select(Review, ReviewThemeHighlight.confidence, ReviewThemeHighlight.explanation)
                .join(ReviewThemeHighlight, ReviewThemeHighlight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewThemeHighlight.theme_type == dimension,
                    ReviewThemeHighlight.label_name.in_(general_labels)
                )
                .limit(limit)
            )
        else:
            stmt = (
                select(Review, ReviewThemeHighlight.confidence, ReviewThemeHighlight.explanation)
                .join(ReviewThemeHighlight, ReviewThemeHighlight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewThemeHighlight.theme_type == dimension,
                    ReviewThemeHighlight.label_name == label
                )
                .limit(limit)
            )
        result = await db.execute(stmt)
        review_data = [(row[0], row[1], row[2]) for row in result.all()]
        
    elif dimension in ['strength', 'weakness', 'suggestion', 'scenario', 'emotion']:
        # 5类口碑洞察 - 从 insights 表查询
        if label == "General":
            stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == dimension,
                    ReviewInsight.dimension.in_(general_labels)
                )
                .limit(limit)
            )
        else:
            stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == dimension,
                    ReviewInsight.dimension == label
                )
                .limit(limit)
            )
        result = await db.execute(stmt)
        review_data = [(row[0], row[1], row[2]) for row in result.all()]
    
    elif dimension in ['pros', 'cons']:
        # 兼容旧的 pros/cons 参数（映射到 strength/weakness）
        insight_type = 'strength' if dimension == 'pros' else 'weakness'
        if label == "General":
            stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == insight_type,
                    ReviewInsight.dimension.in_(general_labels)
                )
                .limit(limit)
            )
        else:
            stmt = (
                select(Review, ReviewInsight.confidence, ReviewInsight.analysis)
                .join(ReviewInsight, ReviewInsight.review_id == Review.id)
                .where(
                    Review.product_id == product.id,
                    ReviewInsight.insight_type == insight_type,
                    ReviewInsight.dimension == label
                )
                .limit(limit)
            )
        result = await db.execute(stmt)
        review_data = [(row[0], row[1], row[2]) for row in result.all()]
    
    # 转换为响应格式（包含置信度和解释）
    return {
        "success": True,
        "total": len(review_data),
        "reviews": [
            {
                "id": str(r.id),
                "author": r.author or "匿名",
                "rating": r.rating,
                "date": r.review_date.isoformat() if r.review_date else None,
                "title_original": r.title_original,
                "title_translated": r.title_translated,
                "body_original": r.body_original,
                "body_translated": r.body_translated,
                "verified_purchase": r.verified_purchase,
                "confidence": confidence or "high",  # 置信度：high/medium/low
                "explanation": explanation,  # 归类理由或洞察内容
            }
            for r, confidence, explanation in review_data
        ]
    }

