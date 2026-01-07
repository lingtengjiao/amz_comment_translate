"""
Task Model - Tracks async processing jobs (translation, etc.)

支持心跳机制，用于检测卡住的任务并自动恢复。
"""
import uuid
from datetime import datetime, timedelta
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
    TIMEOUT = "timeout"  # [NEW] 超时状态


class TaskType(str, Enum):
    """Task type enumeration"""
    TRANSLATION = "translation"
    ANALYSIS = "analysis"
    THEMES = "themes"      # [NEW] 主题提取
    INSIGHTS = "insights"  # [NEW] 洞察提取


# 每种任务的心跳超时时间（秒）
TASK_HEARTBEAT_TIMEOUT = {
    TaskType.TRANSLATION.value: 120,   # 翻译任务 2 分钟无心跳视为超时
    TaskType.THEMES.value: 60,         # 主题提取 1 分钟无心跳视为超时
    TaskType.INSIGHTS.value: 60,       # 洞察提取 1 分钟无心跳视为超时
    TaskType.ANALYSIS.value: 120,      # 分析任务 2 分钟无心跳视为超时
}


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
    
    # [NEW] 心跳相关字段
    last_heartbeat: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最后一次心跳时间，Worker 处理时定期更新"
    )
    
    celery_task_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Celery 任务 ID，用于追踪和取消任务"
    )
    
    retry_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="重试次数"
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
    
    @property
    def is_heartbeat_timeout(self) -> bool:
        """
        检测任务是否心跳超时（卡住）。
        
        只有 PROCESSING 状态的任务才需要检测心跳。
        如果没有心跳记录但状态是 PROCESSING，也视为超时。
        """
        if self.status != TaskStatus.PROCESSING.value:
            return False
        
        if self.last_heartbeat is None:
            # 没有心跳记录，检查任务创建时间
            # 如果创建超过 2 分钟还没有心跳，视为超时
            if self.created_at:
                from datetime import timezone
                now = datetime.now(timezone.utc)
                created = self.created_at.replace(tzinfo=timezone.utc) if self.created_at.tzinfo is None else self.created_at
                return (now - created).total_seconds() > 120
            return True
        
        # 获取该任务类型的超时时间
        timeout_seconds = TASK_HEARTBEAT_TIMEOUT.get(self.task_type, 120)
        
        from datetime import timezone
        now = datetime.now(timezone.utc)
        last_hb = self.last_heartbeat.replace(tzinfo=timezone.utc) if self.last_heartbeat.tzinfo is None else self.last_heartbeat
        
        return (now - last_hb).total_seconds() > timeout_seconds
    
    @property
    def heartbeat_timeout_seconds(self) -> int:
        """获取该任务类型的心跳超时时间"""
        return TASK_HEARTBEAT_TIMEOUT.get(self.task_type, 120)
    
    def __repr__(self) -> str:
        return f"<Task(id={self.id}, type={self.task_type}, status={self.status})>"

