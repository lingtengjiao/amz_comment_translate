"""
分享 API (Share API)

提供分享链接的创建、查看、撤销等接口。
包含需要认证的接口（资源所有者）和公开接口（阅读者访问）。
"""
import logging
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.share_link import ShareResourceType
from app.services.share_service import ShareService
from app.services.auth_service import get_current_user_required, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/share", tags=["Share"])


# ==========================================
# 请求/响应模型
# ==========================================

class CreateShareLinkRequest(BaseModel):
    """创建分享链接请求"""
    resource_type: str = Field(..., description="资源类型: review_reader/report/analysis_project/rufus_session")
    resource_id: Optional[str] = Field(None, description="资源 UUID（报告/分析项目 ID）")
    asin: Optional[str] = Field(None, description="ASIN 或 session_id（用于评论详情/Rufus 会话）")
    title: Optional[str] = Field(None, description="分享标题（可选，会自动生成）")
    expires_in_days: Optional[int] = Field(None, description="过期天数（可选，不填表示永久）")


class ShareLinkResponse(BaseModel):
    """分享链接响应"""
    success: bool
    share_link: dict
    share_url: str


class ShareLinkListResponse(BaseModel):
    """分享链接列表响应"""
    success: bool
    share_links: List[dict]
    total: int


class ShareMetaResponse(BaseModel):
    """分享链接元信息响应"""
    success: bool
    meta: dict


class ShareDataResponse(BaseModel):
    """分享资源数据响应"""
    success: bool
    resource_type: str
    title: Optional[str]
    view_count: int
    data: dict


class MessageResponse(BaseModel):
    """通用消息响应"""
    success: bool
    message: str


# ==========================================
# 需要认证的接口（资源所有者）
# ==========================================

@router.post("", response_model=ShareLinkResponse)
async def create_share_link(
    request: CreateShareLinkRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    创建分享链接
    
    需要登录，创建指定资源的分享链接。
    
    - **resource_type**: 资源类型
      - `review_reader`: 评论详情页（需要 asin）
      - `report`: 报告详情页（需要 resource_id）
      - `analysis_project`: 分析项目（需要 resource_id）
      - `rufus_session`: Rufus 会话（需要 asin 填写 session_id）
    - **resource_id**: 资源 UUID（报告/分析项目 ID）
    - **asin**: ASIN 或 session_id
    - **title**: 自定义标题（可选）
    - **expires_in_days**: 过期天数（可选，不填表示永久）
    """
    try:
        # 验证资源类型
        try:
            resource_type = ShareResourceType(request.resource_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"无效的资源类型: {request.resource_type}"
            )
        
        # 解析 resource_id
        resource_id = None
        if request.resource_id:
            try:
                resource_id = UUID(request.resource_id)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="无效的资源 ID 格式"
                )
        
        service = ShareService(db)
        share_link = await service.create_share_link(
            user_id=user.id,
            resource_type=resource_type,
            resource_id=resource_id,
            asin=request.asin,
            title=request.title,
            expires_in_days=request.expires_in_days
        )
        
        return ShareLinkResponse(
            success=True,
            share_link=share_link.to_dict(),
            share_url=f"/share/{share_link.token}"
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception(f"创建分享链接失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建分享链接失败"
        )


@router.get("/my", response_model=ShareLinkListResponse)
async def get_my_share_links(
    resource_type: Optional[str] = None,
    include_expired: bool = False,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取我的分享链接列表
    
    需要登录，返回当前用户创建的所有分享链接。
    
    - **resource_type**: 可选，筛选特定资源类型
    - **include_expired**: 是否包含已过期/已撤销的链接
    """
    try:
        # 验证资源类型
        rt = None
        if resource_type:
            try:
                rt = ShareResourceType(resource_type)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"无效的资源类型: {resource_type}"
                )
        
        service = ShareService(db)
        share_links = await service.get_user_share_links(
            user_id=user.id,
            resource_type=rt,
            include_expired=include_expired
        )
        
        return ShareLinkListResponse(
            success=True,
            share_links=[sl.to_dict() for sl in share_links],
            total=len(share_links)
        )
        
    except Exception as e:
        logger.exception(f"获取分享链接列表失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取分享链接列表失败"
        )


@router.delete("/{token}", response_model=MessageResponse)
async def revoke_share_link(
    token: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    撤销分享链接
    
    需要登录，只能撤销自己创建的分享链接。
    撤销后链接将不可访问。
    """
    try:
        service = ShareService(db)
        await service.revoke_share_link(token=token, user_id=user.id)
        
        return MessageResponse(
            success=True,
            message="分享链接已撤销"
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception(f"撤销分享链接失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="撤销分享链接失败"
        )


# ==========================================
# 公开接口（阅读者访问，无需认证）
# ==========================================

@router.get("/{token}/meta", response_model=ShareMetaResponse)
async def get_share_link_meta(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取分享链接元信息（公开）
    
    无需登录，返回分享链接的基本信息，用于预览和验证。
    不会增加访问次数。
    """
    try:
        service = ShareService(db)
        meta = await service.get_share_meta(token)
        
        if not meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="分享链接不存在"
            )
        
        return ShareMetaResponse(
            success=True,
            meta=meta
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"获取分享链接元信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取分享链接信息失败"
        )


@router.get("/{token}/data", response_model=ShareDataResponse)
async def get_share_link_data(
    token: str,
    skip_increment: bool = Query(False, description="是否跳过访问次数增加（用于刷新页面等场景）"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取分享资源的完整数据（公开）
    
    无需登录，返回分享资源的完整数据。
    首次访问会增加访问次数统计，刷新页面不会重复增加。
    
    如果链接已过期或已撤销，将返回错误。
    """
    try:
        service = ShareService(db)
        result = await service.validate_and_get_resource(token, skip_increment=skip_increment)
        
        return ShareDataResponse(
            success=True,
            resource_type=result["resource_type"],
            title=result.get("title"),
            view_count=result.get("view_count", 0),
            data=result["data"]
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception(f"获取分享资源数据失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取分享资源数据失败"
        )


class ShareReviewsResponse(BaseModel):
    """分页评论响应"""
    success: bool
    reviews: List[dict]
    pagination: dict
    filters: dict


@router.get("/{token}/reviews")
async def get_share_reviews_paginated(
    token: str,
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(50, ge=10, le=100, description="每页数量（10-100）"),
    rating: Optional[int] = Query(None, ge=1, le=5, description="筛选评分（1-5）"),
    sentiment: Optional[str] = Query(None, description="筛选情感（positive/neutral/negative）"),
    db: AsyncSession = Depends(get_db)
):
    """
    分页获取分享链接的评论列表（公开）
    
    无需登录，返回分页的评论列表。
    支持按评分和情感筛选。
    
    性能优化：
    - 带 Redis 缓存（5分钟TTL）
    - 按需加载，减少首次加载数据量
    """
    try:
        # 验证 sentiment 参数
        if sentiment and sentiment not in ["positive", "neutral", "negative"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="sentiment 必须是 positive/neutral/negative 之一"
            )
        
        service = ShareService(db)
        result = await service.get_share_reviews_paginated(
            token=token,
            page=page,
            page_size=page_size,
            rating=rating,
            sentiment=sentiment
        )
        
        return ShareReviewsResponse(
            success=True,
            reviews=result["reviews"],
            pagination=result["pagination"],
            filters=result["filters"]
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception(f"获取分页评论失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取评论列表失败"
        )


# ==========================================
# 兼容性接口：直接通过 token 获取数据
# ==========================================

@router.get("/{token}")
async def get_share_link(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取分享链接信息（公开）
    
    无需登录，返回分享链接信息和资源数据。
    这是一个兼容性接口，同时返回元信息和数据。
    """
    try:
        service = ShareService(db)
        
        # 先获取元信息
        meta = await service.get_share_meta(token)
        if not meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="分享链接不存在"
            )
        
        # 检查有效性
        if not meta.get("is_valid"):
            if meta.get("is_expired"):
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="分享链接已过期"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="分享链接已被撤销"
                )
        
        # 获取完整数据
        result = await service.validate_and_get_resource(token)
        
        return {
            "success": True,
            "meta": meta,
            "resource_type": result["resource_type"],
            "title": result.get("title"),
            "view_count": result.get("view_count", 0),
            "data": result["data"]
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception(f"获取分享链接失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取分享链接失败"
        )


# ==========================================
# AI 分析生成接口
# ==========================================

class GenerateSummariesResponse(BaseModel):
    """生成AI总结响应"""
    success: bool
    message: str
    summary_counts: Optional[dict] = None


class DataChangeCheckResponse(BaseModel):
    """数据变化检查响应"""
    success: bool
    has_changes: bool
    current_review_count: int
    last_summary_review_count: Optional[int] = None
    message: str


@router.get("/{token}/check-data-changes", response_model=DataChangeCheckResponse)
async def check_data_changes(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    检查数据是否有变化（公开）
    
    检查评论数据是否在AI总结生成后发生了变化。
    用于判断是否需要重新生成AI分析。
    """
    from app.models import Product
    from app.models.review import Review
    from app.models.product_dimension_summary import ProductDimensionSummary
    from sqlalchemy import select, func, and_
    
    try:
        # 验证token并获取资源信息
        service = ShareService(db)
        meta = await service.get_share_meta(token)
        
        if not meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="分享链接不存在"
            )
        
        if not meta.get("is_valid"):
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="分享链接已失效"
            )
        
        # 只支持 review_reader 类型
        if meta.get("resource_type") != "review_reader":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="此类型的分享链接不支持数据变化检查"
            )
        
        # 获取ASIN对应的product_id
        asin = meta.get("asin")
        if not asin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法获取产品信息"
            )
        
        result = await db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"产品不存在: {asin}"
            )
        
        # 获取当前评论数量
        current_count_result = await db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.is_deleted == False
                )
            )
        )
        current_review_count = current_count_result.scalar() or 0
        
        # 获取上次生成AI总结的时间
        last_summary_result = await db.execute(
            select(ProductDimensionSummary.created_at)
            .where(ProductDimensionSummary.product_id == product.id)
            .order_by(ProductDimensionSummary.created_at.desc())
            .limit(1)
        )
        last_summary_time = last_summary_result.scalar_one_or_none()
        
        last_summary_review_count = None
        has_changes = False
        
        if last_summary_time:
            # 获取上次生成总结时的评论数量（基于created_at时间点）
            # 这里我们使用一个简化的方法：比较当前评论数量和上次总结时的评论数量
            # 如果存在AI总结，我们假设数据可能已经变化，需要重新生成
            # 更精确的方法是在生成总结时记录当时的评论数量，但这里先简化处理
            
            # 检查是否有新增或删除的评论（通过比较时间戳）
            # 简化：如果当前评论数量与上次不同，则认为有变化
            # 或者检查是否有在last_summary_time之后创建或更新的评论
            new_reviews_result = await db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.is_deleted == False,
                        Review.created_at > last_summary_time
                    )
                )
            )
            new_reviews_count = new_reviews_result.scalar() or 0
            
            deleted_reviews_result = await db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.is_deleted == True,
                        Review.updated_at > last_summary_time
                    )
                )
            )
            deleted_reviews_count = deleted_reviews_result.scalar() or 0
            
            has_changes = (new_reviews_count > 0) or (deleted_reviews_count > 0)
            last_summary_review_count = current_review_count - new_reviews_count + deleted_reviews_count
        else:
            # 如果没有AI总结，认为需要生成（数据有变化）
            has_changes = True
        
        message = "数据已发生变化，可以重新生成AI分析" if has_changes else "数据未发生变化，无需重新生成"
        
        return DataChangeCheckResponse(
            success=True,
            has_changes=has_changes,
            current_review_count=current_review_count,
            last_summary_review_count=last_summary_review_count,
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"检查数据变化失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"检查数据变化失败: {str(e)}"
        )


@router.post("/{token}/generate-summaries", response_model=GenerateSummariesResponse)
async def generate_dimension_summaries(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    生成AI维度总结（公开）
    
    通过分享链接token触发AI分析生成，包括：
    - 5W主题总结（buyer/user/where/when/why/what）
    - 产品维度总结
    - 情感/场景维度总结
    - 消费者原型（3-5个）
    - 整体数据总结
    
    注意：此操作可能需要1-3分钟完成。
    注意：建议先调用 /check-data-changes 检查数据是否有变化。
    """
    from app.services.dimension_summary_service import DimensionSummaryService
    from app.models import Product
    from sqlalchemy import select
    
    try:
        # 验证token并获取资源信息
        service = ShareService(db)
        meta = await service.get_share_meta(token)
        
        if not meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="分享链接不存在"
            )
        
        if not meta.get("is_valid"):
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="分享链接已失效"
            )
        
        # 只支持 review_reader 类型
        if meta.get("resource_type") != "review_reader":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="此类型的分享链接不支持生成AI总结"
            )
        
        # 获取ASIN对应的product_id
        asin = meta.get("asin")
        if not asin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法获取产品信息"
            )
        
        result = await db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"产品不存在: {asin}"
            )
        
        # 调用维度总结服务
        logger.info(f"[AI总结] 开始为产品 {asin} 生成维度总结 (token: {token})")
        
        summary_service = DimensionSummaryService(db)
        results = await summary_service.generate_all_summaries(product.id)
        
        summary_counts = {
            "themes": len(results.get("theme_summaries", [])),
            "dimensions": len(results.get("dimension_summaries", [])),
            "emotions": len(results.get("emotion_summaries", [])),
            "scenarios": len(results.get("scenario_summaries", [])),
            "personas": len(results.get("consumer_personas", [])),
            "overall": 1 if results.get("overall_summary") else 0,
        }
        
        total_generated = sum(summary_counts.values())
        logger.info(f"[AI总结] 产品 {asin} 维度总结生成完成，共生成 {total_generated} 条")
        
        return GenerateSummariesResponse(
            success=True,
            message=f"AI分析生成完成，共生成 {total_generated} 条洞察",
            summary_counts=summary_counts
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"生成AI总结失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成AI总结失败: {str(e)}"
        )
