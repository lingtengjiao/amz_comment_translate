"""
Review Insight Model - AI-generated insights from reviews
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, DateTime, func, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.review import Review


class InsightType(str, enum.Enum):
    """Insight type enumeration"""
    STRENGTH = "strength"      # 产品优势
    WEAKNESS = "weakness"      # 改进空间
    SUGGESTION = "suggestion"  # 用户建议
    SCENARIO = "scenario"      # 使用场景
    EMOTION = "emotion"        # 情感洞察


class ReviewInsight(Base):
    """
    Review Insight entity representing AI-extracted insights from reviews.
    
    Attributes:
        id: Unique identifier (UUID)
        review_id: Foreign key to Review
        type: Type of insight (strength, weakness, etc.)
        quote: Original text quote from review
        quote_translated: Translated quote
        analysis: AI analysis/interpretation
        dimension: Product dimension (quality, price, etc.)
    """
    __tablename__ = "review_insights"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    insight_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Insight type: strength, weakness, suggestion, scenario, emotion"
    )
    quote: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Original text quote from review"
    )
    quote_translated: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Translated quote"
    )
    analysis: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="AI analysis/interpretation"
    )
    dimension: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Product dimension: quality, price, appearance, etc."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Relationships
    review: Mapped["Review"] = relationship(
        "Review",
        back_populates="insights"
    )
    
    def __repr__(self) -> str:
        return f"<ReviewInsight(type={self.type}, dimension={self.dimension})>"
