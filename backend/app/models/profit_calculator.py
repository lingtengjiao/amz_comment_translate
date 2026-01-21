"""
Profit Calculator Models - 毛利计算相关模型
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, Text, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ProfitProduct(Base):
    """
    产品毛利表 - 存储用户录入的产品信息
    """
    __tablename__ = "profit_products"
    
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
    
    # 产品信息
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    
    # 产品尺寸
    length_cm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    width_cm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    height_cm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    weight_g: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    
    # 价格和成本
    selling_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_cost_cny: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    
    # 可选字段
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
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
    
    def __repr__(self) -> str:
        return f"<ProfitProduct(id={self.id}, name={self.name})>"
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "length_cm": float(self.length_cm),
            "width_cm": float(self.width_cm),
            "height_cm": float(self.height_cm),
            "weight_g": float(self.weight_g),
            "selling_price_usd": float(self.selling_price_usd),
            "total_cost_cny": float(self.total_cost_cny),
            "category": self.category,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class FBAFeeRule(Base):
    """
    FBA配送费率表 - 按尺寸分段存储费率
    """
    __tablename__ = "fba_fee_rules"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,  # NULL表示系统默认规则
        index=True
    )
    
    size_tier: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    weight_min_oz: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    weight_max_oz: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    fee_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "size_tier": self.size_tier,
            "weight_min_oz": float(self.weight_min_oz) if self.weight_min_oz else None,
            "weight_max_oz": float(self.weight_max_oz) if self.weight_max_oz else None,
            "fee_usd": float(self.fee_usd),
            "is_active": self.is_active
        }


class ReferralFeeRule(Base):
    """
    亚马逊佣金比例表 - 按品类存储佣金比例
    """
    __tablename__ = "referral_fee_rules"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    fee_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    min_fee_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "category": self.category,
            "fee_percentage": float(self.fee_percentage),
            "min_fee_usd": float(self.min_fee_usd),
            "is_active": self.is_active
        }


class ShippingFeeRule(Base):
    """
    头程运费费率表 - 普海/美森/空运
    """
    __tablename__ = "shipping_fee_rules"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    shipping_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    rate_per_unit: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "shipping_type": self.shipping_type,
            "rate_per_unit": float(self.rate_per_unit),
            "unit_type": self.unit_type,
            "description": self.description,
            "is_active": self.is_active
        }


class ExchangeRate(Base):
    """
    汇率配置表
    """
    __tablename__ = "exchange_rates"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    currency_pair: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "currency_pair": self.currency_pair,
            "rate": float(self.rate),
            "is_active": self.is_active
        }


class OtherCostRule(Base):
    """
    其他费用规则表 - 关税、配置金等
    """
    __tablename__ = "other_cost_rules"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    rule_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False)  # percentage or fixed
    value: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    base_field: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "rule_name": self.rule_name,
            "rule_type": self.rule_type,
            "value": float(self.value),
            "base_field": self.base_field,
            "description": self.description,
            "is_active": self.is_active
        }
