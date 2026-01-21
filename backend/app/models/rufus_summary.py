"""
Rufus Summary Model - Stores AI summaries for Rufus conversations
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from enum import Enum

from sqlalchemy import String, DateTime, Text, ForeignKey, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.rufus_conversation import RufusConversation


class SummaryType(str, Enum):
    """Summary type enumeration"""
    CONVERSATION = "conversation"  # 单个对话总结
    SESSION_GROUP = "session_group"  # 总体总结（更重要）


class RufusSummary(Base):
    """
    RufusSummary entity representing AI-generated summaries for Rufus conversations.
    
    Supports two levels of summaries:
    1. Individual conversation summaries (conversation_id)
    2. Session group summaries (session_group_id) - more important, overall summary
    
    Attributes:
        id: Unique identifier (UUID)
        summary_type: Type of summary ('conversation' or 'session_group')
        conversation_id: Reference to individual conversation (for conversation-type summaries)
        session_group_id: Session group identifier (e.g., 'asin_B0XXXXX', 'keyword_YYYYY', 'session_ZZZZZ')
        page_type: Page type context (homepage, keyword_search, product_detail)
        summary_text: The AI-generated summary content
        user_id: User who owns this summary
        created_at: Record creation timestamp
        updated_at: Record update timestamp
    """
    __tablename__ = "rufus_summaries"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Summary type: 'conversation' or 'session_group'
    summary_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True
    )
    
    # For individual conversation summary
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rufus_conversations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        unique=True
    )
    
    # For session group summary (e.g., 'asin_B0XXXXX', 'keyword_YYYYY', 'session_ZZZZZ')
    session_group_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        unique=True
    )
    
    # Page type for context
    page_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="product_detail",
        index=True
    )
    
    # Summary content
    summary_text: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    
    # User who owns this summary
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=func.now()
    )
    
    # Relationships
    user: Mapped[Optional["User"]] = relationship(
        "User",
        lazy="selectin"
    )
    
    conversation: Mapped[Optional["RufusConversation"]] = relationship(
        "RufusConversation",
        lazy="selectin"
    )
    
    # Table constraint
    __table_args__ = (
        CheckConstraint(
            "(conversation_id IS NOT NULL AND session_group_id IS NULL) OR "
            "(conversation_id IS NULL AND session_group_id IS NOT NULL)",
            name="check_summary_reference"
        ),
        CheckConstraint(
            "summary_type IN ('conversation', 'session_group')",
            name="check_summary_type"
        ),
    )
    
    def __repr__(self) -> str:
        return f"<RufusSummary(id={self.id}, type={self.summary_type}, session_group_id={self.session_group_id})>"
