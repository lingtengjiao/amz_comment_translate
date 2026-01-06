"""
Product Model - Represents an Amazon product (identified by ASIN)
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, DateTime, func, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.review import Review
    from app.models.task import Task
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel


class Product(Base):
    """
    Product entity representing an Amazon product.
    
    Attributes:
        id: Unique identifier (UUID)
        asin: Amazon Standard Identification Number (unique)
        title: Product title
        image_url: Product main image URL
        marketplace: Amazon marketplace (e.g., US, UK, DE)
        created_at: Record creation timestamp
        updated_at: Record last update timestamp
    """
    __tablename__ = "products"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    asin: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True
    )
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title_translated: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="Translated product title")
    image_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    marketplace: Mapped[str] = mapped_column(String(20), default="US")
    # Price - stored as string to preserve currency symbol and format
    price: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="Product price with currency")
    # Bullet points - stored as JSON array
    bullet_points: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Product bullet points as JSON array")
    bullet_points_translated: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Translated bullet points as JSON array")
    # Real average rating from product page (not calculated from collected reviews)
    average_rating: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
        comment="Real average rating from Amazon product page"
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
    
    # Relationships
    reviews: Mapped[List["Review"]] = relationship(
        "Review",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    dimensions: Mapped[List["ProductDimension"]] = relationship(
        "ProductDimension",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    context_labels: Mapped[List["ProductContextLabel"]] = relationship(
        "ProductContextLabel",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Product(asin={self.asin}, title={self.title[:50] if self.title else 'N/A'})>"

