"""
Analysis API Router - 对比分析模块 API

提供以下功能：
1. 创建对比分析项目
2. 获取项目列表
3. 获取项目详情（含分析结果）
4. 触发分析任务
5. 删除项目
6. 获取对比预览数据
"""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_db, async_session_maker
from app.services.analysis_service import AnalysisService
from app.models.analysis import AnalysisStatus

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
    """创建对比分析请求"""
    title: str = Field(..., min_length=1, max_length=255, description="项目标题")
    description: Optional[str] = Field(None, description="项目描述")
    products: List[ProductItemInput] = Field(..., min_length=2, max_length=5, description="产品列表（2-5个）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "2024新款 vs 竞品X 对比分析",
                "description": "对比分析我们的新款产品与主要竞品的用户口碑差异",
                "products": [
                    {"product_id": "550e8400-e29b-41d4-a716-446655440000", "role_label": "target"},
                    {"product_id": "550e8400-e29b-41d4-a716-446655440001", "role_label": "competitor"}
                ]
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


# ==========================================
# API Endpoints
# ==========================================

@router.post("/projects", response_model=CreateAnalysisResponse, status_code=201)
async def create_analysis_project(
    request: CreateComparisonRequest,
    background_tasks: BackgroundTasks,
    auto_run: bool = Query(True, description="是否自动触发分析"),
    db: AsyncSession = Depends(get_db)
):
    """
    创建对比分析项目
    
    - 至少需要 2 个产品，最多支持 5 个
    - 默认会自动触发分析任务（后台执行）
    - 可通过 auto_run=false 仅创建项目不触发分析
    """
    service = AnalysisService(db)
    
    try:
        # 提取产品 ID 和角色标签
        product_ids = [p.product_id for p in request.products]
        role_labels = [p.role_label for p in request.products]
        
        # 创建项目
        project = await service.create_comparison_project(
            title=request.title,
            product_ids=product_ids,
            role_labels=role_labels,
            description=request.description
        )
        
        # 如果需要自动触发分析
        if auto_run:
            # 使用后台任务异步执行（不阻塞 API 响应）
            # 注意：不能直接传递 db session，需要在后台任务中重新创建
            background_tasks.add_task(_run_analysis_background, project.id)
            message = "项目已创建，分析任务已在后台启动"
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
    """后台执行分析任务"""
    # 在后台任务中重新创建数据库会话
    async with async_session_maker() as db:
        try:
            service = AnalysisService(db)
            await service.run_analysis(project_id)
            await db.commit()
            logger.info(f"后台分析任务完成: {project_id}")
        except Exception as e:
            await db.rollback()
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
    db: AsyncSession = Depends(get_db)
):
    """
    获取分析项目列表
    
    - 按创建时间倒序排列
    - 支持分页和状态筛选
    """
    service = AnalysisService(db)
    
    try:
        projects = await service.list_projects(limit=limit, offset=offset, status=status)
        
        return AnalysisProjectListResponse(
            success=True,
            total=len(projects),
            projects=[
                AnalysisProjectResponse(
                    id=str(p.id),
                    title=p.title,
                    description=p.description,
                    analysis_type=p.analysis_type,
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
    db: AsyncSession = Depends(get_db)
):
    """
    获取项目详情
    
    - 包含完整的分析结果（result_content）
    - 包含原始数据快照（raw_data_snapshot）
    - 包含关联的产品信息
    """
    service = AnalysisService(db)
    
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    return AnalysisProjectResponse(
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

