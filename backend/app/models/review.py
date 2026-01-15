"""
Review Model - Represents an Amazon product review with translation
"""
import uuid
from datetime import datetime, date
from enum import Enum
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Integer, Boolean, Date, DateTime, Text, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight


class TranslationStatus(str, Enum):
    """Translation status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"  # 内容审查失败或不可翻译的内容，不再重试


class Sentiment(str, Enum):
    """Sentiment analysis result"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class Review(Base):
    """
    Review entity representing an Amazon product review.
    
    Attributes:
        id: Unique identifier (UUID)
        product_id: Foreign key to Product
        review_id: Amazon's internal review identifier
        author: Reviewer's name/alias
        rating: Star rating (1-5)
        title_original: Original review title
        title_translated: Translated review title
        body_original: Original review body (required)
        body_translated: Translated review body
        review_date: Date the review was posted
        verified_purchase: Whether it's a verified purchase
        helpful_votes: Number of helpful votes
        sentiment: Analyzed sentiment (positive/neutral/negative)
        translation_status: Current translation status
        created_at: Record creation timestamp
        updated_at: Record last update timestamp
    """
    __tablename__ = "reviews"
    
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
    
    # Amazon review identifier (for deduplication)
    review_id: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Review metadata
    author: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rating: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True
    )
    review_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False)
    helpful_votes: Mapped[int] = mapped_column(Integer, default=0)
    
    # Original content
    title_original: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_original: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Translated content
    title_translated: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_translated: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Media content
    has_video: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否包含视频")
    has_images: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否包含图片")
    image_urls: Mapped[str | None] = mapped_column(Text, nullable=True, comment="图片链接JSON数组")
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="视频链接")
    
    # Review link
    review_url: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="亚马逊评论原文链接")
    
    # Analysis results
    sentiment: Mapped[str] = mapped_column(
        String(20),
        default=Sentiment.NEUTRAL.value,
        index=True
    )
    
    # Status tracking
    translation_status: Mapped[str] = mapped_column(
        String(20),
        default=TranslationStatus.PENDING.value,
        index=True
    )
    
    # User actions
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True, comment="是否置顶")
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True, comment="是否隐藏")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True, comment="是否已删除（逻辑删除）")
    
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
        back_populates="reviews"
    )
    
    # Relationship to Insights
    insights: Mapped[List["ReviewInsight"]] = relationship(
        "ReviewInsight",
        back_populates="review",
        cascade="all, delete-orphan"
    )
    
    # Relationship to Theme Highlights
    theme_highlights: Mapped[List["ReviewThemeHighlight"]] = relationship(
        "ReviewThemeHighlight",
        back_populates="review",
        cascade="all, delete-orphan"
    )
    
    # Unique constraint: one review_id per product
    __table_args__ = (
        UniqueConstraint('product_id', 'review_id', name='unique_review_per_product'),
    )
    
    def __repr__(self) -> str:
        return f"<Review(id={self.id}, rating={self.rating}, status={self.translation_status})>"

