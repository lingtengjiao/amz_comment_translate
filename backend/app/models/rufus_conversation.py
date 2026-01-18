"""
Rufus Conversation Model - Stores conversations with Amazon Rufus AI
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User


class RufusConversation(Base):
    """
    RufusConversation entity representing a conversation with Amazon Rufus AI.
    
    Attributes:
        id: Unique identifier (UUID)
        asin: Amazon product ASIN
        marketplace: Amazon marketplace (US, UK, AU, etc.)
        question: The question asked to Rufus
        answer: Rufus's response
        question_type: Type of question (wish_it_had, comparison, etc.)
        conversation_id: Optional original conversation ID from Rufus
        raw_html: Optional raw HTML for debugging
        user_id: User who initiated the conversation (optional)
        created_at: Record creation timestamp
    """
    __tablename__ = "rufus_conversations"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    asin: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True
    )
    
    marketplace: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="US"
    )
    
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    
    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    
    question_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="wish_it_had"
    )
    
    question_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )
    
    conversation_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )
    
    raw_html: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Relationships
    user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="rufus_conversations",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        return f"<RufusConversation(id={self.id}, asin={self.asin}, type={self.question_type})>"
