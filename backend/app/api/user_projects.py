"""
用户项目 API (User Projects API)

管理用户与产品的关联关系
"""
import logging
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.user_project import UserProject
from app.models.product import Product
from app.models.review import Review, TranslationStatus
from app.services.auth_service import get_current_user_required, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user/projects", tags=["User Projects"])


# ==========================================
# 响应模型
# ==========================================

class UserProjectResponse(BaseModel):
    """用户项目响应"""
    id: str
    product_id: str  # 产品ID，用于分析项目创建
    asin: str
    title: Optional[str]
    image_url: Optional[str]
    marketplace: Optional[str]
    custom_alias: Optional[str]
    notes: Optional[str]
    is_favorite: bool
    reviews_contributed: int
    total_reviews: int
    translated_reviews: int
    average_rating: Optional[float]  # 产品评分
    created_at: Optional[str]


class UserProjectListResponse(BaseModel):
    """用户项目列表响应"""
    total: int
    projects: List[UserProjectResponse]


class AddProjectRequest(BaseModel):
    """添加项目请求"""
    custom_alias: Optional[str] = None
    notes: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    """更新项目请求"""
    custom_alias: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: Optional[bool] = None


# ==========================================
# 接口
# ==========================================

@router.get("", response_model=UserProjectListResponse)
async def get_my_projects(
    favorites_only: bool = Query(False, description="只显示收藏的项目"),
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户关联的所有产品
    """
    # 构建查询 - 排除已逻辑删除的项目
    query = (
        select(UserProject, Product)
        .join(Product, UserProject.product_id == Product.id)
        .where(
            and_(
                UserProject.user_id == user.id,
                UserProject.is_deleted == False
            )
        )
    )
    
    if favorites_only:
        query = query.where(UserProject.is_favorite == True)
    
    query = query.order_by(UserProject.created_at.desc())
    
    result = await db.execute(query)
    rows = result.all()
    
    projects = []
    for up, product in rows:
        # 获取评论统计
        review_count_result = await db.execute(
            select(func.count(Review.id))
            .where(Review.product_id == product.id)
        )
        total_reviews = review_count_result.scalar() or 0
        
        translated_count_result = await db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.COMPLETED.value
                )
            )
        )
        translated_reviews = translated_count_result.scalar() or 0
        
        projects.append(UserProjectResponse(
            id=str(up.id),
            product_id=str(product.id),  # 产品ID，用于分析项目创建
            asin=product.asin,
            title=product.title,
            image_url=product.image_url,
            marketplace=product.marketplace,
            custom_alias=up.custom_alias,
            notes=up.notes,
            is_favorite=up.is_favorite,
            reviews_contributed=up.reviews_contributed or 0,
            total_reviews=total_reviews,
            translated_reviews=translated_reviews,
            average_rating=product.average_rating,  # 产品评分
            created_at=up.created_at.isoformat() if up.created_at else None
        ))
    
    return UserProjectListResponse(
        total=len(projects),
        projects=projects
    )


@router.post("/{asin}")
async def add_project(
    asin: str,
    request: Optional[AddProjectRequest] = None,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    将产品添加到当前用户的项目列表
    """
    # 查找产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"产品 {asin} 不存在"
        )
    
    # 检查是否已关联（包括已删除的）
    existing_result = await db.execute(
        select(UserProject).where(
            and_(
                UserProject.user_id == user.id,
                UserProject.product_id == product.id
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    
    if existing:
        if existing.is_deleted:
            # 恢复已删除的关联
            existing.is_deleted = False
            existing.deleted_at = None
            if request:
                if request.custom_alias:
                    existing.custom_alias = request.custom_alias
                if request.notes:
                    existing.notes = request.notes
            await db.commit()
            logger.info(f"用户 {user.email} 恢复项目 {asin}")
            return {
                "success": True,
                "message": "产品已恢复到您的项目列表",
                "project_id": str(existing.id)
            }
        else:
            return {
                "success": True,
                "message": "产品已在您的项目列表中",
                "project_id": str(existing.id)
            }
    
    # 创建关联
    user_project = UserProject(
        user_id=user.id,
        product_id=product.id,
        custom_alias=request.custom_alias if request else None,
        notes=request.notes if request else None
    )
    
    db.add(user_project)
    await db.commit()
    await db.refresh(user_project)
    
    logger.info(f"用户 {user.email} 添加项目 {asin}")
    
    return {
        "success": True,
        "message": "产品已添加到您的项目列表",
        "project_id": str(user_project.id)
    }


@router.delete("/{asin}")
async def remove_project(
    asin: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    从当前用户的项目列表中移除产品（逻辑删除）
    产品将被释放回洞察广场，用户可以重新添加
    """
    # 查找产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"产品 {asin} 不存在"
        )
    
    # 查找关联
    result = await db.execute(
        select(UserProject).where(
            and_(
                UserProject.user_id == user.id,
                UserProject.product_id == product.id
            )
        )
    )
    user_project = result.scalar_one_or_none()
    
    if not user_project:
        return {
            "success": True,
            "message": "产品不在您的项目列表中"
        }
    
    # 逻辑删除：标记为已删除，不物理删除
    user_project.is_deleted = True
    user_project.deleted_at = datetime.utcnow()
    await db.commit()
    
    logger.info(f"用户 {user.email} 移除项目 {asin}（逻辑删除）")
    
    return {
        "success": True,
        "message": "产品已从您的项目列表中移除"
    }


@router.get("/{asin}")
async def get_project(
    asin: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户与特定产品的关联信息
    """
    # 查找产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        return {
            "is_my_project": False,
            "product_exists": False
        }
    
    # 查找关联
    result = await db.execute(
        select(UserProject).where(
            and_(
                UserProject.user_id == user.id,
                UserProject.product_id == product.id
            )
        )
    )
    user_project = result.scalar_one_or_none()
    
    if not user_project:
        return {
            "is_my_project": False,
            "product_exists": True,
            "asin": asin,
            "title": product.title
        }
    
    return {
        "is_my_project": True,
        "product_exists": True,
        "project_id": str(user_project.id),
        "asin": asin,
        "title": product.title,
        "custom_alias": user_project.custom_alias,
        "notes": user_project.notes,
        "is_favorite": user_project.is_favorite,
        "reviews_contributed": user_project.reviews_contributed or 0,
        "created_at": user_project.created_at.isoformat() if user_project.created_at else None
    }


@router.put("/{asin}")
async def update_project(
    asin: str,
    request: UpdateProjectRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户项目信息（别名、备注、收藏状态）
    """
    # 查找产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"产品 {asin} 不存在"
        )
    
    # 查找关联
    result = await db.execute(
        select(UserProject).where(
            and_(
                UserProject.user_id == user.id,
                UserProject.product_id == product.id
            )
        )
    )
    user_project = result.scalar_one_or_none()
    
    if not user_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不在您的项目列表中"
        )
    
    # 更新字段
    if request.custom_alias is not None:
        user_project.custom_alias = request.custom_alias
    if request.notes is not None:
        user_project.notes = request.notes
    if request.is_favorite is not None:
        user_project.is_favorite = request.is_favorite
    
    await db.commit()
    
    return {
        "success": True,
        "message": "项目信息已更新"
    }


@router.post("/{asin}/favorite")
async def toggle_favorite(
    asin: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    切换收藏状态
    """
    # 查找产品
    product_result = await db.execute(
        select(Product).where(Product.asin == asin)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"产品 {asin} 不存在"
        )
    
    # 查找关联
    result = await db.execute(
        select(UserProject).where(
            and_(
                UserProject.user_id == user.id,
                UserProject.product_id == product.id
            )
        )
    )
    user_project = result.scalar_one_or_none()
    
    if not user_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不在您的项目列表中"
        )
    
    # 切换收藏状态
    user_project.is_favorite = not user_project.is_favorite
    await db.commit()
    
    return {
        "success": True,
        "is_favorite": user_project.is_favorite,
        "message": "已收藏" if user_project.is_favorite else "已取消收藏"
    }
