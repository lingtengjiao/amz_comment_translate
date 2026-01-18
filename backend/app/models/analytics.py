"""
Analytics Models - 用户行为分析相关模型

用于追踪用户行为、会话和统计数据
"""
import uuid
from datetime import datetime, date
from typing import TYPE_CHECKING, Optional, Dict, Any

from sqlalchemy import String, Integer, DateTime, ForeignKey, func, Text, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User


class UserEvent(Base):
    """
    用户事件实体
    
    记录所有用户操作事件，包括页面访问、功能点击等
    
    Attributes:
        id: 唯一标识 (UUID)
        user_id: 用户ID (可为空,支持匿名事件)
        event_type: 事件类型 (page_view/click/feature_use)
        event_name: 事件名称 (home_visit/add_product/start_analysis)
        event_data: 附加数据 (JSON格式)
        page_path: 页面路径
        session_id: 会话ID
        created_at: 事件时间
    """
    __tablename__ = "user_events"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="事件类型: page_view/click/feature_use"
    )
    
    event_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="事件名称: home_visit/add_product/start_analysis"
    )
    
    event_data: Mapped[Dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="附加数据 (JSON格式)"
    )
    
    page_path: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="页面路径"
    )
    
    session_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="会话ID"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )
    
    # 关系
    user: Mapped[Optional["User"]] = relationship("User")
    
    def __repr__(self) -> str:
        return f"<UserEvent(id={self.id}, event_type={self.event_type}, event_name={self.event_name})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "event_type": self.event_type,
            "event_name": self.event_name,
            "event_data": self.event_data,
            "page_path": self.page_path,
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class UserSession(Base):
    """
    用户会话实体
    
    追踪用户访问会话信息
    
    Attributes:
        id: 唯一标识 (UUID)
        user_id: 用户ID
        session_id: 会话标识 (唯一)
        started_at: 开始时间
        ended_at: 结束时间
        duration_seconds: 会话时长 (秒)
        page_views: 页面浏览数
        user_agent: 浏览器信息
        ip_address: IP地址
    """
    __tablename__ = "user_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    session_id: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
        comment="会话标识 (唯一)"
    )
    
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )
    
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="会话时长 (秒)"
    )
    
    page_views: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="页面浏览数"
    )
    
    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="浏览器信息"
    )
    
    ip_address: Mapped[str | None] = mapped_column(
        INET,
        nullable=True
    )
    
    # 关系
    user: Mapped["User"] = relationship("User")
    
    def __repr__(self) -> str:
        return f"<UserSession(id={self.id}, user_id={self.user_id}, session_id={self.session_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "session_id": self.session_id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
            "page_views": self.page_views,
            "user_agent": self.user_agent,
            "ip_address": str(self.ip_address) if self.ip_address else None
        }


class DailyStat(Base):
    """
    每日统计实体
    
    聚合每日统计数据
    
    Attributes:
        id: 唯一标识 (UUID)
        stat_date: 统计日期 (唯一)
        total_users: 累计用户数
        new_users: 新增用户数
        active_users: 活跃用户数
        products_added: 新增产品数
        tasks_completed: 完成任务数
        reports_generated: 生成报告数
        page_views: 页面浏览数
        created_at: 创建时间
        updated_at: 更新时间
    """
    __tablename__ = "daily_stats"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    stat_date: Mapped[date] = mapped_column(
        Date,
        unique=True,
        nullable=False,
        index=True,
        comment="统计日期 (唯一)"
    )
    
    total_users: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="累计用户数"
    )
    
    new_users: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="新增用户数"
    )
    
    active_users: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="活跃用户数"
    )
    
    products_added: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="新增产品数"
    )
    
    tasks_completed: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="完成任务数"
    )
    
    reports_generated: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="生成报告数"
    )
    
    page_views: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="页面浏览数"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def __repr__(self) -> str:
        return f"<DailyStat(id={self.id}, stat_date={self.stat_date}, active_users={self.active_users})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "stat_date": self.stat_date.isoformat() if self.stat_date else None,
            "total_users": self.total_users,
            "new_users": self.new_users,
            "active_users": self.active_users,
            "products_added": self.products_added,
            "tasks_completed": self.tasks_completed,
            "reports_generated": self.reports_generated,
            "page_views": self.page_views,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
