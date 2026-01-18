"""
Analytics API - 用户行为分析 API

提供：
1. 事件收集接口（前端SDK调用）
2. 统计查询接口（仅管理员）
"""
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_current_user, get_current_user_required
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ==========================================
# 请求/响应模型
# ==========================================

class EventData(BaseModel):
    """事件数据"""
    user_id: Optional[str] = None
    event_type: str
    event_name: str
    event_data: Optional[Dict[str, Any]] = None
    page_path: Optional[str] = None
    session_id: Optional[str] = None


class BatchEventsRequest(BaseModel):
    """批量事件请求"""
    events: List[EventData]


class SessionHeartbeatRequest(BaseModel):
    """会话心跳请求"""
    session_id: str
    page_views: Optional[int] = None


class MessageResponse(BaseModel):
    """消息响应"""
    success: bool
    message: str


# ==========================================
# 管理员权限检查
# ==========================================

async def require_admin(user: User = Depends(get_current_user_required)) -> User:
    """要求管理员权限"""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return user


# ==========================================
# 事件收集接口（所有用户可调用）
# ==========================================

@router.post("/events", response_model=MessageResponse)
async def record_events(
    request: BatchEventsRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    批量记录用户事件
    
    前端SDK调用此接口上报事件
    """
    try:
        service = AnalyticsService(db)
        
        # 转换事件数据
        events_data = []
        for event in request.events:
            event_dict = {
                "user_id": UUID(event.user_id) if event.user_id else (user.id if user else None),
                "event_type": event.event_type,
                "event_name": event.event_name,
                "event_data": event.event_data,
                "page_path": event.page_path,
                "session_id": event.session_id
            }
            events_data.append(event_dict)
        
        await service.record_events_batch(events_data)
        await db.commit()
        
        return MessageResponse(
            success=True,
            message=f"成功记录 {len(events_data)} 个事件"
        )
    except Exception as e:
        logger.error(f"记录事件失败: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"记录事件失败: {str(e)}"
        )


@router.post("/session/heartbeat", response_model=MessageResponse)
async def session_heartbeat(
    request: SessionHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    会话心跳
    
    前端定期调用此接口更新会话状态
    """
    try:
        service = AnalyticsService(db)
        await service.update_session_heartbeat(
            session_id=request.session_id,
            page_views=request.page_views
        )
        await db.commit()
        
        return MessageResponse(
            success=True,
            message="心跳更新成功"
        )
    except Exception as e:
        logger.error(f"更新会话心跳失败: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新会话心跳失败: {str(e)}"
        )


# ==========================================
# 统计查询接口（仅管理员）
# ==========================================

@router.get("/dashboard")
async def get_dashboard(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取仪表盘概览数据
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    overview = await service.get_dashboard_overview(days=days)
    return {
        "success": True,
        "data": overview
    }


@router.get("/users/growth")
async def get_user_growth(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取用户增长趋势（按天）
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    trend = await service.get_user_growth_trend(days=days)
    return {
        "success": True,
        "data": trend
    }


@router.get("/users/active")
async def get_active_users(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取活跃用户统计
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    stats = await service.get_active_users_stat(days=days)
    return {
        "success": True,
        "data": stats
    }


@router.get("/features")
async def get_feature_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取功能使用统计
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    stats = await service.get_feature_usage_stat(days=days)
    return {
        "success": True,
        "data": stats
    }


@router.get("/retention")
async def get_user_retention(
    cohort_days: int = 7,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取用户留存率
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    retention = await service.get_user_retention(cohort_days=cohort_days)
    return {
        "success": True,
        "data": retention
    }


@router.get("/events/recent")
async def get_recent_events(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    获取最近事件流
    
    仅管理员可访问
    """
    service = AnalyticsService(db)
    events = await service.get_recent_events(limit=limit)
    return {
        "success": True,
        "data": events
    }
