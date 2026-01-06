"""
Product Report Model - 存储 AI 生成的产品分析报告

功能：
1. 持久化存储 Markdown 格式的报告内容
2. 保存结构化分析数据（用于前端可视化）
3. 支持历史报告回溯和版本对比
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, ForeignKey, func, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ReportType:
    """报告类型枚举"""
    COMPREHENSIVE = "comprehensive"  # 综合分析报告
    MARKETING = "marketing"          # 营销策略报告
    RESEARCH = "research"            # 研发改进报告


class ReportStatus:
    """报告状态枚举"""
    CREATING = "creating"     # 生成中
    COMPLETED = "completed"   # 已完成
    FAILED = "failed"         # 生成失败


class ProductReport(Base):
    """
    存储 AI 生成的产品分析报告
    
    Attributes:
        id: 报告唯一标识 (UUID)
        product_id: 关联产品 ID
        title: 报告标题
        content: Markdown 格式的报告内容
        analysis_data: 结构化分析数据（JSON），用于前端可视化
        report_type: 报告类型 (comprehensive/marketing/research)
        status: 报告状态 (creating/completed/failed)
        error_message: 错误信息（如果生成失败）
        created_at: 创建时间
        updated_at: 更新时间
    
    analysis_data 结构示例:
    {
        "total_reviews": 150,
        "context_stats": {
            "who": "老年人(45), 宠物主(23)",
            "scene": "卧室(30) / 睡前(25)",
            "why": "送礼(40)",
            "what": "清理宠物毛(50)"
        },
        "insight_stats": {
            "weakness": "- **电池续航** (25次)...",
            "strength": "- **外观设计** (40次)..."
        },
        "top_who": [
            {"name": "老年人", "count": 45},
            {"name": "宠物主", "count": 23}
        ],
        "top_weaknesses": [
            {"dimension": "电池续航", "count": 25, "quotes": ["充电太慢", "用一会就没电"]},
            {"dimension": "做工质量", "count": 18, "quotes": ["塑料感强"]}
        ],
        "top_strengths": [
            {"dimension": "外观设计", "count": 40, "quotes": ["颜值很高", "摆在客厅好看"]}
        ]
    }
    """
    __tablename__ = "product_reports"

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
    
    title: Mapped[str | None] = mapped_column(
        String(255), 
        nullable=True,
        comment="报告标题"
    )
    
    content: Mapped[str] = mapped_column(
        Text, 
        nullable=False,
        comment="Markdown 格式的报告内容"
    )
    
    # 存储生成报告时的原始统计数据，方便前端做可视化看板
    analysis_data: Mapped[dict] = mapped_column(
        JSONB, 
        default=dict,
        comment="结构化分析数据快照"
    )
    
    report_type: Mapped[str] = mapped_column(
        String(50), 
        default=ReportType.COMPREHENSIVE,
        comment="报告类型：comprehensive/marketing/research"
    )
    
    status: Mapped[str] = mapped_column(
        String(20),
        default=ReportStatus.COMPLETED,
        comment="报告状态：creating/completed/failed"
    )
    
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="错误信息（如果生成失败）"
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

    # 关联到 Product
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="reports"
    )
    
    def __repr__(self) -> str:
        return f"<ProductReport(id={self.id}, title={self.title}, type={self.report_type})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "title": self.title,
            "content": self.content,
            "analysis_data": self.analysis_data,
            "report_type": self.report_type,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

