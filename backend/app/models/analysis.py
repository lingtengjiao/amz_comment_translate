"""
Analysis Models - 分析模块

核心概念：
- AnalysisProject: 分析项目，用于组织一次特定的分析任务
- AnalysisProjectItem: 分析项目包含的产品明细

支持的分析类型：
- comparison: 对比分析（竞品 A vs B，或 一代 vs 二代）
- market_insight: 细分市场洞察（聚合多产品分析市场共性、趋势、机会）

设计原则：
1. 完全解耦：AnalysisProject 和 Product 是两条平行线
2. 快照机制：raw_data_snapshot 保证历史报告的数据基准不变
3. 异步友好：支持 pending -> processing -> completed 状态流转
"""
import uuid
import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, String, ForeignKey, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.project_learning import ProjectDimension, ProjectContextLabel
    from app.models.user import User


class AnalysisType(str, enum.Enum):
    """分析类型枚举"""
    COMPARISON = "comparison"  # 对比分析 (A vs B)
    MARKET_INSIGHT = "market_insight"  # 细分市场洞察（聚合多产品分析市场共性、趋势、机会）


class AnalysisStatus(str, enum.Enum):
    """分析状态枚举"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisProject(Base):
    """
    分析项目：用于组织一次特定的分析任务
    例如："2024新款 vs 竞品X 对比分析"
    
    Attributes:
        id: 主键 UUID
        title: 项目标题
        description: 项目描述
        analysis_type: 分析类型（comparison/overall 等）
        status: 当前状态（pending/processing/completed/failed）
        result_content: AI 生成的分析结论 (JSON 格式)
        raw_data_snapshot: 对比时的原始聚合数据快照
        created_at: 创建时间
        updated_at: 更新时间
    """
    __tablename__ = "analysis_projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 分析类型：'comparison' (对比分析) 或 'market_insight' (细分市场洞察)
    analysis_type: Mapped[str] = mapped_column(
        String(50), 
        default=AnalysisType.COMPARISON.value
    )
    
    # 状态
    status: Mapped[str] = mapped_column(
        String(50), 
        default=AnalysisStatus.PENDING.value
    )
    
    # 存储 AI 生成的分析结论 (JSON格式)
    # 结构示例: {"winner": "Product A", "matrix": [...], "conclusion": "..."}
    result_content: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # 存储对比时的原始聚合数据 (快照)
    # 结构示例: {"product_A": {...stats...}, "product_B": {...stats...}}
    # 存下来的目的是：即使产品后续有了新评论，这份历史报告的数据基准不变
    raw_data_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # 错误信息（如果失败）
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 创建者用户 ID（用于"我的市场洞察"过滤）
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
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), 
        onupdate=func.now(),
        nullable=True
    )

    # 关联项目中的产品项
    items: Mapped[List["AnalysisProjectItem"]] = relationship(
        "AnalysisProjectItem", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    
    # 关联创建者用户
    user: Mapped[Optional["User"]] = relationship("User")
    
    # [NEW] 项目级维度（用于市场洞察）
    project_dimensions: Mapped[List["ProjectDimension"]] = relationship(
        "ProjectDimension",
        back_populates="project",
        cascade="all, delete-orphan"
    )
    
    # [NEW] 项目级5W标签（用于市场洞察）
    project_context_labels: Mapped[List["ProjectContextLabel"]] = relationship(
        "ProjectContextLabel",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<AnalysisProject(id={self.id}, title={self.title[:30] if self.title else 'N/A'}, status={self.status})>"

    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "result_content": self.result_content,
            "raw_data_snapshot": self.raw_data_snapshot,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "items": [item.to_dict() for item in self.items] if self.items else []
        }


class AnalysisProjectItem(Base):
    """
    分析项目包含的产品明细
    
    Attributes:
        id: 主键 UUID
        project_id: 关联的分析项目 ID
        product_id: 关联的产品 ID
        role_label: 产品角色标签（如 "target" 本品, "competitor" 竞品）
        display_order: 显示顺序
        created_at: 创建时间
    """
    __tablename__ = "analysis_project_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("analysis_projects.id", ondelete="CASCADE"),
        nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # 产品角色标签（例如 "target", "competitor", "gen1", "gen2"）
    # 方便 AI 识别身份，也方便前端展示
    role_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # 显示顺序（用于前端排序）
    display_order: Mapped[int] = mapped_column(default=0)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )

    # 关联
    project: Mapped["AnalysisProject"] = relationship(
        "AnalysisProject", 
        back_populates="items"
    )
    product: Mapped["Product"] = relationship("Product")  # 单向关联即可

    def __repr__(self) -> str:
        return f"<AnalysisProjectItem(project_id={self.project_id}, product_id={self.product_id}, role={self.role_label})>"

    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "product_id": str(self.product_id),
            "role_label": self.role_label,
            "display_order": self.display_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            # 如果需要产品详情，可以在这里展开
            "product": {
                "id": str(self.product.id),
                "asin": self.product.asin,
                "title": self.product.title_translated or self.product.title,
                "image_url": self.product.image_url,
                "marketplace": self.product.marketplace
            } if self.product else None
        }

