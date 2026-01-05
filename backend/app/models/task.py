"""
Task Model - Tracks async processing jobs (translation, etc.)
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class TaskStatus(str, Enum):
    """Task status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskType(str, Enum):
    """Task type enumeration"""
    TRANSLATION = "translation"
    ANALYSIS = "analysis"


class Task(Base):
    """
    Task entity for tracking async processing jobs.
    
    Attributes:
        id: Unique identifier (UUID)
        product_id: Foreign key to Product
        task_type: Type of task (translation, analysis, etc.)
        status: Current task status
        total_items: Total items to process
        processed_items: Number of items already processed
        error_message: Error message if task failed
        created_at: Task creation timestamp
        updated_at: Task last update timestamp
    """
    __tablename__ = "tasks"
    
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
    
    task_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=TaskType.TRANSLATION.value
    )
    
    status: Mapped[str] = mapped_column(
        String(20),
        default=TaskStatus.PENDING.value,
        index=True
    )
    
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, default=0)
    
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
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
        back_populates="tasks"
    )
    
    # Unique constraint: one task per product per task_type
    __table_args__ = (
        UniqueConstraint('product_id', 'task_type', name='unique_task_per_product_type'),
    )
    
    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage"""
        if self.total_items == 0:
            return 0.0
        return (self.processed_items / self.total_items) * 100
    
    def __repr__(self) -> str:
        return f"<Task(id={self.id}, type={self.task_type}, status={self.status})>"

