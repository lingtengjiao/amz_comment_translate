"""
Theme Highlight Model - Stores AI-extracted theme keywords for reviews
[UPDATED] 重构为一条记录 = 一个标签，增加 label_name 字段关联 product_context_labels
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import String, DateTime, Text, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.review import Review
    from app.models.product_context_label import ProductContextLabel


class ThemeType(str, Enum):
    """[UPDATED] 5W 营销模型主题类型"""
    WHO = "who"      # 人群/角色
    WHERE = "where"  # 地点/场景
    WHEN = "when"    # 时刻/时机
    WHY = "why"      # 购买动机 (Purchase Driver)
    WHAT = "what"    # 待办任务 (Jobs to be Done)


# [UPDATED] 5W 主题配置
THEME_CONFIG = {
    ThemeType.WHO: {
        "label": "Who（使用者/人群）",
        "color": "blue",
        "description": "识别核心用户画像，如：独居老人、新手宝妈、宠物主、工程师等"
    },
    ThemeType.WHERE: {
        "label": "Where（使用地点）",
        "color": "purple", 
        "description": "识别物理空间和环境，如：小户型厨房、房车(RV)、车库、办公室桌面等"
    },
    ThemeType.WHEN: {
        "label": "When（使用时刻）",
        "color": "green",
        "description": "识别时间点和触发时机，如：睡前、停电时、圣诞节、运动后等"
    },
    ThemeType.WHY: {
        "label": "Why（购买动机）",
        "color": "pink",
        "description": "识别购买的触发原因，如：旧的坏了、作为礼物、为了省钱、被TikTok种草等"
    },
    ThemeType.WHAT: {
        "label": "What（待办任务/用途）",
        "color": "orange",
        "description": "识别用户试图完成的具体任务(JTBD)，如：清理地毯猫毛、缓解背痛、哄孩子睡觉等"
    }
}


class ReviewThemeHighlight(Base):
    """
    ReviewThemeHighlight entity stores AI-extracted theme content for each review.
    
    [UPDATED] 重构设计：一条记录 = 一个标签
    - 增加 label_name 字段，与 product_context_labels.name 关联
    - 增加 context_label_id 可选外键，直接关联标签库
    - 保留 items JSON 用于存储证据和解释（向后兼容）
    
    数据结构：
    - theme_type: "who"
    - label_name: "老年人"  <-- [NEW] 标签名称
    - quote: "bought for my grandma"  <-- [NEW] 原文证据
    - explanation: "评论提到买给奶奶"  <-- [NEW] 归类理由
    """
    __tablename__ = "review_theme_highlights"

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
    
    theme_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
        comment="主题类型：who/where/when/why/what"
    )
    
    # [NEW] 标签名称 - 关联 product_context_labels.name
    label_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="标签名称，如：老年人、卧室、睡前（关联 product_context_labels.name）"
    )
    
    # [NEW] 原文证据 - 支持溯源
    quote: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="原文证据，如：bought for my grandma"
    )
    
    # [NEW] 中文翻译证据
    quote_translated: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="中文翻译证据，如：给奶奶买的"
    )
    
    # [NEW] 归类理由 - 可解释性
    explanation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="归类理由，如：评论明确提到买给奶奶"
    )
    
    # [NEW] 可选外键关联到 product_context_labels
    context_label_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_context_labels.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="关联的标签库 ID（可选）"
    )
    
    # [DEPRECATED] 保留 items 字段用于向后兼容
    items: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        default=None,
        comment="[已废弃] 旧版内容项列表，请使用 label_name/quote/explanation"
    )
    
    # [DEPRECATED] 向后兼容：保留 keywords 字段
    keywords: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        default=None,
        comment="[已废弃] 使用 label_name 代替"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationship back to Review
    review: Mapped["Review"] = relationship(
        "Review",
        back_populates="theme_highlights"
    )
    
    # [NEW] Relationship to ProductContextLabel
    context_label: Mapped["ProductContextLabel"] = relationship(
        "ProductContextLabel",
        foreign_keys=[context_label_id]
    )

    def __repr__(self) -> str:
        return f"<ReviewThemeHighlight(type={self.theme_type}, label={self.label_name})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "review_id": str(self.review_id),
            "theme_type": self.theme_type,
            "label_name": self.label_name,
            "quote": self.quote,
            "quote_translated": self.quote_translated,
            "explanation": self.explanation,
            "context_label_id": str(self.context_label_id) if self.context_label_id else None
        }

