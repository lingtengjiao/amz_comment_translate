"""
Product Dimension Model - Stores AI-learned product-specific evaluation dimensions
产品维度模型 - 存储 AI 学习到的产品专属评价维度

[UPDATED 2026-01-16] 支持3类维度体系：
- product: 产品维度（用于 strength/weakness/suggestion）
- scenario: 场景维度（用于 scenario 类型洞察）
- emotion: 情绪维度（用于 emotion 类型洞察）
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class DimensionType(str, Enum):
    """维度类型枚举 - 3类维度体系"""
    PRODUCT = "product"    # 产品维度：功能表现、结构做工、安全性等
    SCENARIO = "scenario"  # 场景维度：家居日常、办公场景、户外活动等
    EMOTION = "emotion"    # 情绪维度：惊喜好评、失望不满、感激推荐等


# 维度类型配置（用于 UI 展示）
DIMENSION_TYPE_CONFIG = {
    DimensionType.PRODUCT: {
        "label": "产品维度",
        "color": "blue",
        "description": "用于评价产品属性：优点(strength)、缺点(weakness)、建议(suggestion)",
        "insight_types": ["strength", "weakness", "suggestion"]
    },
    DimensionType.SCENARIO: {
        "label": "场景维度",
        "color": "green",
        "description": "用于分类使用场景：用户在什么情境下使用产品",
        "insight_types": ["scenario"]
    },
    DimensionType.EMOTION: {
        "label": "情绪维度",
        "color": "orange",
        "description": "用于分类情绪反馈：用户表达的情感状态",
        "insight_types": ["emotion"]
    }
}


class ProductDimension(Base):
    """
    产品维度实体 - 存储 AI 学习到的产品专属维度定义。
    
    用于"AI 学习建模 -> 标准化执行"模式：
    1. 系统读取产品评论样本，生成该产品专属的评价维度（如"吸力"、"续航"）
    2. 将维度存入此表，关联产品，支持用户微调
    3. 在分析单条评论时，强制 LLM 基于已生成的维度进行归类
    
    [UPDATED 2026-01-16] 支持3类维度体系：
    - product: 产品维度（用于 strength/weakness/suggestion）
    - scenario: 场景维度（用于 scenario 类型洞察）
    - emotion: 情绪维度（用于 emotion 类型洞察）
    
    Attributes:
        id: 唯一标识符 (UUID)
        product_id: 关联的产品 ID
        name: 维度名称，如 "Battery Life" / "电池续航"
        description: 维度定义，用于告诉 AI 这个维度包含什么
        dimension_type: 维度类型 (product/scenario/emotion)
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
    
    # [NEW 2026-01-16] 维度类型
    dimension_type: Mapped[str] = mapped_column(
        String(20),
        default="product",
        nullable=False,
        index=True,
        comment="维度类型: product(产品维度), scenario(场景维度), emotion(情绪维度)"
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
        return f"<ProductDimension(name={self.name}, type={self.dimension_type}, product_id={self.product_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式，供 TranslationService 使用"""
        return {
            "name": self.name,
            "description": self.description,
            "dimension_type": self.dimension_type
        }

