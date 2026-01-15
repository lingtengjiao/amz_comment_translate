"""
Product Time Series Model - Stores historical data from Keepa API
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, DateTime, func, Text, Integer, Numeric, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ProductTimeSeries(Base):
    """
    Product time series data from Keepa API.
    
    Stores historical data including:
    - Price history (NEW, USED, REFURBISHED, etc.)
    - Sales rank history
    - Rating and review count history
    """
    __tablename__ = "product_time_series"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Keepa product data stored as JSONB for flexibility
    # Contains: price history, sales rank, ratings, etc.
    keepa_data: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        comment="Keepa API product data including price history, sales rank, etc."
    )
    
    # Metadata
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Relationship
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="time_series"
    )
    
    # Index for efficient queries
    __table_args__ = (
        Index('idx_product_time_series_product_id', 'product_id'),
        Index('idx_product_time_series_last_updated', 'last_updated'),
    )
    
    def __repr__(self) -> str:
        return f"<ProductTimeSeries(product_id={self.product_id}, last_updated={self.last_updated})>"
