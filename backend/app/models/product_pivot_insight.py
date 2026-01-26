"""
产品数据透视AI洞察模型
"""
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
from decimal import Decimal

from sqlalchemy import String, TIMESTAMP, Numeric, Text, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ProductPivotInsight(Base):
    """产品数据透视AI洞察"""
    __tablename__ = "product_pivot_insights"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 洞察类型：audience/demand/product/scenario/brand/dimension_summary
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # 子类型：decision_flow/strength_mapping等
    sub_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 维度名称（用于dimension_summary类型）
    dimension: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 总结类型（用于dimension_summary类型）
    summary_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # AI生成的洞察内容
    insight_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    
    # 原始数据
    raw_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True, default=dict)
    
    # 置信度
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2), nullable=True)
    
    # 生成状态
    generation_status: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default='pending',
        index=True
    )
    
    # 错误信息
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, 
        nullable=False, 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow
    )

    # 关系
    product: Mapped["Product"] = relationship("Product", back_populates="pivot_insights")

    # 唯一约束索引
    __table_args__ = (
        Index(
            'unique_product_insight',
            'product_id', 'insight_type', 'sub_type', 'dimension', 'summary_type',
            unique=True,
            postgresql_nulls_not_distinct=False
        ),
    )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "insight_type": self.insight_type,
            "sub_type": self.sub_type,
            "dimension": self.dimension,
            "summary_type": self.summary_type,
            "insight_data": self.insight_data,
            "raw_data": self.raw_data,
            "confidence": float(self.confidence) if self.confidence else None,
            "generation_status": self.generation_status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
