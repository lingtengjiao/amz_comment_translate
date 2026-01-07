"""
Product Report Model - 存储 AI 生成的产品分析报告

功能：
1. 持久化存储 JSON 格式的结构化报告内容（用于前端 Dashboard 渲染）
2. 保存原始统计数据（用于前端图表可视化）
3. 支持多种报告类型：CEO综合版、运营版、产品版、供应链版
4. 支持历史报告回溯和版本对比
"""
import uuid
import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, ForeignKey, func, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


# [NEW] 定义报告类型枚举：四位一体
class ReportType(str, enum.Enum):
    """报告类型枚举 - 四位一体决策中台"""
    COMPREHENSIVE = "comprehensive"  # CEO/综合战略版
    OPERATIONS = "operations"        # CMO/运营市场版
    PRODUCT = "product"              # CPO/产品研发版
    SUPPLY_CHAIN = "supply_chain"    # 供应链/质检版


class ReportStatus(str, enum.Enum):
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
        title: 报告标题 (如: "2024Q1 运营深度分析")
        content: JSON 格式的 AI 结构化分析结果（前端解析这个 JSON 来渲染"建议卡片"、"风险列表"等组件）
        analysis_data: 原始统计数据（Raw Data for Charts），前端直接读取这个字段来渲染 ECharts/Recharts 图表
        report_type: 报告类型 (comprehensive/operations/product/supply_chain)
        status: 报告状态 (creating/completed/failed)
        error_message: 错误信息（如果生成失败）
        created_at: 创建时间
        updated_at: 更新时间
    
    analysis_data 结构示例 (用于前端画图):
    {
        "context": {
            "who": [{"name": "老人", "value": 45}, {"name": "宝妈", "value": 23}],
            "where": [{"name": "卧室", "value": 30}],
            "when": [{"name": "睡前", "value": 25}],
            "why": [{"name": "送礼", "value": 40}],
            "what": [{"name": "清理宠物毛", "value": 50}]
        },
        "insight": {
            "weakness": [{"name": "电池续航", "value": 25}],
            "strength": [{"name": "外观设计", "value": 40}]
        }
    }
    
    content JSON 结构示例 (各类型不同):
    
    [COMPREHENSIVE 综合版]:
    {
        "strategic_verdict": "...",
        "market_fit_analysis": "...",
        "core_swot": {"strengths": [], "weaknesses": [], ...},
        "department_directives": {"to_marketing": "...", ...}
    }
    
    [OPERATIONS 运营版]:
    {
        "executive_summary": "...",
        "selling_points": [{"title": "...", "copywriting": "...", "source_strength": "..."}],
        "marketing_risks": ["..."],
        "target_audience": {"who": [], "scenario": [], "strategy": "..."},
        "competitor_analysis": "..."
    }
    
    [PRODUCT 产品版]:
    {
        "quality_score": 75,
        "critical_bugs": [{"issue": "...", "severity": "...", "suggestion": "..."}],
        "unmet_needs": ["..."],
        "usage_context_gap": "...",
        "roadmap_suggestion": "..."
    }
    
    [SUPPLY_CHAIN 供应链版]:
    {
        "material_defects": [{"part": "...", "problem": "...", "frequency": "..."}],
        "packaging_issues": {"is_damaged": false, "details": "...", "improvement": "..."},
        "missing_parts": ["..."],
        "qc_checklist": ["..."]
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
        comment="报告标题 (如: 2024Q1 运营深度分析)"
    )
    
    # [IMPORTANT] 存储 AI 生成的 JSON 结构化分析结果
    # 前端解析这个 JSON 来渲染"建议卡片"、"风险列表"等组件
    content: Mapped[str] = mapped_column(
        Text, 
        nullable=False,
        comment="JSON 格式的 AI 结构化分析结果"
    )
    
    # [IMPORTANT] 存储生成报告时的原始统计数据 (Raw Data for Charts)
    # 结构: { "context": {"who": [{"name":"老人", "value":45}...]}, "insight": {...} }
    # 前端直接读取这个字段来渲染 ECharts/Recharts 图表
    analysis_data: Mapped[dict] = mapped_column(
        JSONB, 
        default=dict,
        comment="原始统计数据快照（用于前端图表可视化）"
    )
    
    # [NEW] 报告类型字段
    report_type: Mapped[str] = mapped_column(
        String(50), 
        default=ReportType.COMPREHENSIVE.value,
        index=True,
        comment="报告类型：comprehensive/operations/product/supply_chain"
    )
    
    status: Mapped[str] = mapped_column(
        String(20),
        default=ReportStatus.COMPLETED.value,
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
    
    @property
    def report_type_display(self) -> str:
        """获取报告类型的显示名称"""
        names = {
            ReportType.COMPREHENSIVE.value: "全维度战略分析报告",
            ReportType.OPERATIONS.value: "运营与市场策略报告",
            ReportType.PRODUCT.value: "产品迭代建议书",
            ReportType.SUPPLY_CHAIN.value: "供应链质量整改报告",
        }
        return names.get(self.report_type, "分析报告")
