"""
KeywordCollection Model - 关键词产品库（用于存储搜索结果快照）
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Integer, DateTime, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.collection_product import CollectionProduct


class KeywordCollection(Base):
    """
    关键词产品库实体
    
    用于存储用户在亚马逊搜索结果页采集的产品快照。
    每次保存都是一个独立的快照，同一关键词可以多次保存。
    
    Attributes:
        id: 唯一标识 (UUID)
        user_id: 用户 ID
        keyword: 搜索关键词
        marketplace: 站点（US, UK, DE 等）
        product_count: 产品数量
        created_at: 创建时间（快照时间）
        updated_at: 更新时间
    """
    __tablename__ = "keyword_collections"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 关联用户
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 搜索关键词
    keyword: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        index=True,
        comment="搜索关键词"
    )
    
    # 站点
    marketplace: Mapped[str] = mapped_column(
        String(20),
        default="US",
        comment="亚马逊站点（US, UK, DE, FR, JP, AU）"
    )
    
    # 产品数量
    product_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="产品数量"
    )
    
    # 备注/描述
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="用户备注"
    )
    
    # 画板配置（JSON 格式，存储自定义画板和产品分配）
    # 格式: { "boards": [{"id": "xxx", "name": "画板名"}], "productBoards": {"productId": "boardId"} }
    board_config: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="画板配置（JSON 格式）：画板列表和产品映射"
    )
    
    # 视图配置（JSON 格式，存储视图相关的配置）
    # 格式: { "colorRules": [...], "yearRanges": [...], "rankingRanges": [...], "rankingMetric": "major", "priceRanges": [...], "salesRanges": [...], "brandRanges": [...] }
    view_config: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="视图配置（JSON 格式）：颜色规则、年份区间、排名区间、价格区间、销量区间、品牌区间等"
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
    
    # 关系
    user: Mapped["User"] = relationship(
        "User",
        back_populates="keyword_collections"
    )
    
    products: Mapped[List["CollectionProduct"]] = relationship(
        "CollectionProduct",
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="CollectionProduct.position"
    )
    
    def __repr__(self) -> str:
        return f"<KeywordCollection(id={self.id}, keyword={self.keyword}, products={self.product_count})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "keyword": self.keyword,
            "marketplace": self.marketplace,
            "product_count": self.product_count,
            "description": self.description,
            "board_config": self.board_config,
            "view_config": self.view_config,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
