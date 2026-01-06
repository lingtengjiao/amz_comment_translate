"""
Product Dimension Model - Stores AI-learned product-specific evaluation dimensions
产品维度模型 - 存储 AI 学习到的产品专属评价维度
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ProductDimension(Base):
    """
    产品维度实体 - 存储 AI 学习到的产品专属维度定义。
    
    用于"AI 学习建模 -> 标准化执行"模式：
    1. 系统读取产品评论样本，生成该产品专属的评价维度（如"吸力"、"续航"）
    2. 将维度存入此表，关联产品，支持用户微调
    3. 在分析单条评论时，强制 LLM 基于已生成的维度进行归类
    
    Attributes:
        id: 唯一标识符 (UUID)
        product_id: 关联的产品 ID
        name: 维度名称，如 "Battery Life" / "电池续航"
        description: 维度定义，用于告诉 AI 这个维度包含什么
        is_ai_generated: 是否由 AI 自动生成（False 表示用户手动添加）
        created_at: 记录创建时间
        updated_at: 记录更新时间
    """
    __tablename__ = "product_dimensions"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Foreign key to Product
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Core fields
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="维度名称，如：电池续航、外观设计"
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="维度定义，用于指导 AI 归类，如：与充电速度和使用时长相关的问题"
    )
    
    # Metadata
    is_ai_generated: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="是否由 AI 自动生成"
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationship back to Product
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="dimensions"
    )
    
    def __repr__(self) -> str:
        return f"<ProductDimension(name={self.name}, product_id={self.product_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式，供 TranslationService 使用"""
        return {
            "name": self.name,
            "description": self.description
        }

