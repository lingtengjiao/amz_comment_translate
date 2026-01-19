"""
CollectionProduct Model - 产品库中的产品明细（快照数据）
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, func, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.keyword_collection import KeywordCollection


class CollectionProduct(Base):
    """
    产品库明细实体
    
    存储产品的快照信息，包括 ASIN、标题、价格、评分、评论数、销量等。
    这是快照数据，创建后不会更新。
    
    Attributes:
        id: 唯一标识 (UUID)
        collection_id: 所属产品库 ID
        asin: 产品 ASIN（必需）
        title: 产品标题
        image_url: 产品图片 URL（必需）
        product_url: 产品链接 URL（必需）
        price: 价格（带货币符号）
        rating: 评分（0-5）
        review_count: 评论数
        sales_volume: 销量数字
        sales_volume_text: 销量原始文本
        is_sponsored: 是否为广告产品
        position: 在搜索结果中的排名位置
        created_at: 创建时间
    """
    __tablename__ = "collection_products"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 关联产品库
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("keyword_collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 产品标识（必需）
    asin: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="产品 ASIN"
    )
    
    # 产品标题
    title: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="产品标题"
    )
    
    # 产品图片 URL（必需）
    image_url: Mapped[str] = mapped_column(
        String(2000),
        nullable=False,
        comment="产品图片 URL"
    )
    
    # 产品链接 URL（必需）
    product_url: Mapped[str] = mapped_column(
        String(2000),
        nullable=False,
        comment="产品链接 URL"
    )
    
    # 价格（带货币符号）
    price: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="价格（含货币符号）"
    )
    
    # 评分（0-5）
    rating: Mapped[float | None] = mapped_column(
        Numeric(3, 2),
        nullable=True,
        comment="评分（0-5）"
    )
    
    # 评论数
    review_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="评论数"
    )
    
    # 销量数字（初步估算销售量）
    sales_volume: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="初步估算销售量"
    )
    
    # 补充数据的销售量（手动输入或导入）
    sales_volume_manual: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="补充数据的销售量（手动输入或导入）"
    )
    
    # 销量原始文本
    sales_volume_text: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="销量原始文本（如 '9K+ bought in past month'）"
    )
    
    # 是否为广告产品
    is_sponsored: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="是否为广告产品"
    )
    
    # 在搜索结果中的页面位置（不是排名）
    position: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="在搜索结果中的页面位置（不是排名）"
    )
    
    # 大类排名
    major_category_rank: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="大类排名"
    )
    
    # 小类排名
    minor_category_rank: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="小类排名"
    )
    
    # 大类名称
    major_category_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="大类名称"
    )
    
    # 小类名称
    minor_category_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="小类名称"
    )
    
    # 产品上架年份（用于年份分类视图）
    year: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="产品上架年份"
    )
    
    # 品牌（用于品牌分类视图）
    brand: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        index=True,
        comment="产品品牌"
    )
    
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # 关系
    collection: Mapped["KeywordCollection"] = relationship(
        "KeywordCollection",
        back_populates="products"
    )
    
    def __repr__(self) -> str:
        return f"<CollectionProduct(asin={self.asin}, title={self.title[:30] if self.title else 'N/A'})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "collection_id": str(self.collection_id),
            "asin": self.asin,
            "title": self.title,
            "image_url": self.image_url,
            "product_url": self.product_url,
            "price": self.price,
            "rating": float(self.rating) if self.rating else None,
            "review_count": self.review_count,
            "sales_volume": self.sales_volume,
            "sales_volume_manual": self.sales_volume_manual,
            "sales_volume_text": self.sales_volume_text,
            "is_sponsored": self.is_sponsored,
            "position": self.position,
            "major_category_rank": self.major_category_rank,
            "minor_category_rank": self.minor_category_rank,
            "major_category_name": self.major_category_name,
            "minor_category_name": self.minor_category_name,
            "year": self.year,
            "brand": self.brand,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
