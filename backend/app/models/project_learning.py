"""
Project Learning Models - 项目级维度/标签学习与映射模型

用于市场洞察功能：
- ProjectDimension: 项目级维度（聚合自多个产品）
- ProjectContextLabel: 项目级5W标签（聚合自多个产品）
- ProjectDimensionMapping: 维度映射关系（项目维度 -> 产品维度）
- ProjectLabelMapping: 标签映射关系（项目标签 -> 产品标签）
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.analysis import AnalysisProject
    from app.models.product import Product
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel


class ProjectDimension(Base):
    """
    项目级维度实体 - 存储市场洞察项目的统一维度定义。
    
    用于市场洞察的"项目级学习"模式：
    1. 从多个产品中采样评论，学习统一的市场维度
    2. 建立与产品级维度的映射关系
    3. 基于映射关系聚合产品级洞察数据
    
    Attributes:
        id: 唯一标识符 (UUID)
        project_id: 关联的分析项目 ID（必须是 market_insight 类型）
        name: 维度名称，如 "便携性能"
        description: 维度定义
        dimension_type: 维度类型 (product/scenario/emotion)
        is_ai_generated: 是否由 AI 自动生成
    """
    __tablename__ = "project_dimensions"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Foreign key to AnalysisProject
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Core fields
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="维度名称，如：便携性能、续航表现"
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="维度定义，用于指导数据归类"
    )
    
    # 维度类型
    dimension_type: Mapped[str] = mapped_column(
        String(20),
        default="product",
        nullable=False,
        index=True,
        comment="维度类型: product(产品维度), scenario(场景维度), emotion(情绪维度)"
    )
    
    # Metadata
    is_ai_generated: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="是否由 AI 自动生成"
    )
    
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
    
    # Relationships
    project: Mapped["AnalysisProject"] = relationship(
        "AnalysisProject",
        back_populates="project_dimensions"
    )
    
    # 映射关系
    dimension_mappings: Mapped[List["ProjectDimensionMapping"]] = relationship(
        "ProjectDimensionMapping",
        back_populates="project_dimension",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<ProjectDimension(name={self.name}, type={self.dimension_type}, project_id={self.project_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "name": self.name,
            "description": self.description,
            "dimension_type": self.dimension_type,
            "is_ai_generated": self.is_ai_generated
        }


class ProjectContextLabel(Base):
    """
    项目级5W标签实体 - 存储市场洞察项目的统一5W标签定义。
    
    用于市场洞察的"项目级学习"模式：
    1. 从多个产品中采样评论，学习统一的市场5W标签
    2. 建立与产品级标签的映射关系
    3. 基于映射关系聚合产品级主题数据
    
    Attributes:
        id: 唯一标识符 (UUID)
        project_id: 关联的分析项目 ID（必须是 market_insight 类型）
        type: 5W 类型 (buyer/user/where/when/why/what)
        name: 标签名称，如 "老年群体"
        description: 标签定义
        is_ai_generated: 是否由 AI 自动生成
    """
    __tablename__ = "project_context_labels"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Foreign key to AnalysisProject
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Core fields
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="5W 类型：buyer/user/where/when/why/what"
    )
    
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="标签名称，如：老年群体、儿童用户"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="标签定义/描述"
    )
    
    # Metadata
    is_ai_generated: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="是否由 AI 自动生成"
    )
    
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
    
    # Relationships
    project: Mapped["AnalysisProject"] = relationship(
        "AnalysisProject",
        back_populates="project_context_labels"
    )
    
    # 映射关系
    label_mappings: Mapped[List["ProjectLabelMapping"]] = relationship(
        "ProjectLabelMapping",
        back_populates="project_label",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<ProjectContextLabel(type={self.type}, name={self.name}, project_id={self.project_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "type": self.type,
            "name": self.name,
            "description": self.description,
            "is_ai_generated": self.is_ai_generated
        }


class ProjectDimensionMapping(Base):
    """
    维度映射实体 - 建立项目级维度与产品级维度的映射关系。
    
    一个项目维度可以映射到多个产品维度（1:N），
    表示这些产品维度在语义上属于同一个市场级维度。
    
    例如：
    项目维度 "便携性能" 映射到：
    - 产品A的 "便携" 维度
    - 产品B的 "携带方便" 维度
    - 产品C的 "重量轻" 维度
    """
    __tablename__ = "project_dimension_mappings"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 项目级维度 ID
    project_dimension_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_dimensions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 产品级维度 ID
    product_dimension_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_dimensions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 产品 ID（冗余字段，便于查询）
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Relationships
    project_dimension: Mapped["ProjectDimension"] = relationship(
        "ProjectDimension",
        back_populates="dimension_mappings"
    )
    
    product_dimension: Mapped["ProductDimension"] = relationship(
        "ProductDimension"
    )
    
    product: Mapped["Product"] = relationship(
        "Product"
    )
    
    def __repr__(self) -> str:
        return f"<ProjectDimensionMapping(project_dim={self.project_dimension_id}, product_dim={self.product_dimension_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "project_dimension_id": str(self.project_dimension_id),
            "product_dimension_id": str(self.product_dimension_id),
            "product_id": str(self.product_id)
        }


class ProjectLabelMapping(Base):
    """
    标签映射实体 - 建立项目级标签与产品级标签的映射关系。
    
    一个项目标签可以映射到多个产品标签（1:N），
    表示这些产品标签在语义上属于同一个市场级标签。
    
    例如：
    项目标签 "老年群体" (type=user) 映射到：
    - 产品A的 "老人" 标签
    - 产品B的 "老年人" 标签
    - 产品C的 "长辈" 标签
    """
    __tablename__ = "project_label_mappings"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 项目级标签 ID
    project_label_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_context_labels.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 产品级标签 ID
    product_label_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_context_labels.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 产品 ID（冗余字段，便于查询）
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Relationships
    project_label: Mapped["ProjectContextLabel"] = relationship(
        "ProjectContextLabel",
        back_populates="label_mappings"
    )
    
    product_label: Mapped["ProductContextLabel"] = relationship(
        "ProductContextLabel"
    )
    
    product: Mapped["Product"] = relationship(
        "Product"
    )
    
    def __repr__(self) -> str:
        return f"<ProjectLabelMapping(project_label={self.project_label_id}, product_label={self.product_label_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "project_label_id": str(self.project_label_id),
            "product_label_id": str(self.product_label_id),
            "product_id": str(self.product_id)
        }
