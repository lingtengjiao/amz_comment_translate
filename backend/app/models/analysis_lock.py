"""
ProductAnalysisLock Model - 分析锁表

设计理念：
防止多用户同时触发同一产品的分析任务，实现 Check-Lock-Serve 模式。

工作流程：
1. Check: 用户请求分析时，先检查是否有有效的缓存报告
2. Lock: 如果需要重新分析，尝试获取锁
   - 获取成功 → 触发分析任务
   - 锁已存在 → 转为"订阅者"模式，等待结果
3. Serve: 分析完成后，广播给所有订阅者

关键特性：
- 使用 PostgreSQL 部分唯一索引确保同时只有一个进行中的锁
- 支持增量分析判断（通过 last_review_count）
- 支持缓存有效期设置
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from enum import Enum

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.product import Product


class LockStatus(str, Enum):
    """锁状态枚举"""
    PROCESSING = "processing"  # 处理中
    COMPLETED = "completed"    # 完成
    FAILED = "failed"          # 失败
    EXPIRED = "expired"        # 过期


class ProductAnalysisLock(Base):
    """
    产品分析锁
    
    实现"抢锁"机制：
    - 多个用户同时请求分析时，只有第一个用户触发实际分析
    - 其他用户转为"订阅者"，等待结果
    
    Attributes:
        id: 唯一标识 (UUID)
        product_id: 产品 ID
        analysis_type: 分析类型（comprehensive, operations, product, supply_chain）
        status: 锁状态
        triggered_by: 触发者用户 ID
        result_valid_until: 结果有效期
        last_review_count: 分析时的评论数（用于增量判断）
        report_id: 关联的报告 ID
        celery_task_id: Celery 任务 ID
        created_at: 创建时间
        completed_at: 完成时间
    """
    __tablename__ = "product_analysis_locks"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 关联字段
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 分析类型
    analysis_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="分析类型：comprehensive, operations, product, supply_chain"
    )
    
    # 锁状态
    status: Mapped[str] = mapped_column(
        String(20),
        default=LockStatus.PROCESSING.value,
        index=True,
        comment="锁状态：processing, completed, failed, expired"
    )
    
    # 触发信息
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="触发者用户ID（可为空表示系统自动触发）"
    )
    
    # 缓存策略
    result_valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="结果有效期，超过此时间需要重新分析"
    )
    last_review_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="分析时的评论数，用于判断是否需要增量分析"
    )
    
    # 关联的报告
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        comment="分析完成后生成的报告ID"
    )
    
    # Celery 任务信息
    celery_task_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Celery 任务 ID"
    )
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # 关系（注意：不创建反向关系，避免复杂依赖）
    # product 和 user 关系通过 product_id 和 triggered_by 查询
    
    def __repr__(self) -> str:
        return f"<ProductAnalysisLock(product={self.product_id}, type={self.analysis_type}, status={self.status})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "analysis_type": self.analysis_type,
            "status": self.status,
            "triggered_by": str(self.triggered_by) if self.triggered_by else None,
            "result_valid_until": self.result_valid_until.isoformat() if self.result_valid_until else None,
            "last_review_count": self.last_review_count,
            "report_id": str(self.report_id) if self.report_id else None,
            "celery_task_id": self.celery_task_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }
    
    @property
    def is_valid(self) -> bool:
        """检查锁的结果是否仍然有效"""
        if self.status != LockStatus.COMPLETED.value:
            return False
        if self.result_valid_until is None:
            return True
        return datetime.now(self.result_valid_until.tzinfo) < self.result_valid_until
    
    @property
    def is_processing(self) -> bool:
        """检查是否正在处理中"""
        return self.status == LockStatus.PROCESSING.value
