"""
UserProject Model - 用户-产品关联表

设计理念：
用户不"拥有"产品数据，只"关注"或"引用"公共资产池中的产品。
这是实现"公共资产池 + 私有视图"架构的核心。

工作流程：
1. 用户添加 ASIN 时，系统先查公共 products 表
2. 如果产品已存在 → 直接创建关联，用户秒级看到历史数据
3. 如果产品不存在 → 创建产品占位，等待用户采集
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, func, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.product import Product


class UserProject(Base):
    """
    用户-产品关联表
    
    实现"私有视图"层，每个用户可以：
    - 给产品起别名
    - 添加备注
    - 收藏产品
    - 记录贡献的评论数
    
    Attributes:
        id: 唯一标识 (UUID)
        user_id: 用户 ID
        product_id: 产品 ID（指向公共资产池）
        custom_alias: 用户自定义别名
        notes: 用户备注
        tags: 用户标签（JSON 数组）
        is_favorite: 是否收藏
        reviews_contributed: 该用户贡献的评论数
        created_at: 添加时间
        last_viewed_at: 最后查看时间
    """
    __tablename__ = "user_projects"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 关联字段
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 个性化字段
    custom_alias: Mapped[str | None] = mapped_column(
        String(255), 
        nullable=True,
        comment="用户自定义别名（如'我的爆款1'）"
    )
    notes: Mapped[str | None] = mapped_column(
        Text, 
        nullable=True,
        comment="用户备注"
    )
    tags: Mapped[str | None] = mapped_column(
        String(500), 
        nullable=True,
        comment="用户标签（JSON数组）"
    )
    is_favorite: Mapped[bool] = mapped_column(
        Boolean, 
        default=False,
        comment="是否收藏"
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, 
        default=False,
        comment="是否已删除（逻辑删除）"
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="删除时间"
    )
    
    # 贡献统计
    reviews_contributed: Mapped[int] = mapped_column(
        Integer, 
        default=0,
        comment="该用户为此产品贡献的评论数"
    )
    
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
    last_viewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最后查看时间"
    )
    
    # 关系
    user: Mapped["User"] = relationship(
        "User",
        back_populates="projects"
    )
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="user_projects"
    )
    
    # 联合唯一约束：防止同一用户重复添加同一产品
    __table_args__ = (
        UniqueConstraint('user_id', 'product_id', name='unique_user_product'),
    )
    
    def __repr__(self) -> str:
        return f"<UserProject(user_id={self.user_id}, product_id={self.product_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "product_id": str(self.product_id),
            "custom_alias": self.custom_alias,
            "notes": self.notes,
            "tags": self.tags,
            "is_favorite": self.is_favorite,
            "reviews_contributed": self.reviews_contributed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_viewed_at": self.last_viewed_at.isoformat() if self.last_viewed_at else None
        }
