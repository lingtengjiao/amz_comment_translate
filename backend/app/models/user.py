"""
User Model - 平台用户
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String, Boolean, DateTime, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user_project import UserProject


class User(Base):
    """
    用户实体
    
    设计理念：
    - 用户不"拥有"产品数据，只"关注"公共资产池中的产品
    - 通过 UserProject 关联表实现"私有视图"
    
    Attributes:
        id: 唯一标识 (UUID)
        email: 用户邮箱（唯一）
        name: 用户名称
        avatar_url: 头像 URL
        is_active: 是否激活
        is_admin: 是否管理员
        created_at: 创建时间
        updated_at: 更新时间
        last_login_at: 最后登录时间
    """
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 基本信息
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # 认证信息
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    oauth_provider: Mapped[str | None] = mapped_column(
        String(50), 
        nullable=True,
        comment="OAuth 登录提供商（如 google, github）"
    )
    oauth_id: Mapped[str | None] = mapped_column(
        String(255), 
        nullable=True,
        comment="OAuth 提供商的用户ID"
    )
    
    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # 关系：用户关注的产品列表
    projects: Mapped[List["UserProject"]] = relationship(
        "UserProject",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None
        }
