"""
Theme Highlight Model - Stores AI-extracted theme keywords for reviews
"""
import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import String, DateTime, Text, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ThemeType(str, Enum):
    """预设的8个主题类型"""
    WHO = "who"                    # 使用者 - 蓝色
    WHERE = "where"                # 使用场景 - 紫色
    WHEN = "when"                  # 使用时机 - 绿色
    UNMET_NEEDS = "unmet_needs"    # 未被满足的需求 - 红色
    PAIN_POINTS = "pain_points"    # 痛点 - 橙色
    BENEFITS = "benefits"          # 收益/好处 - 翠绿色
    FEATURES = "features"          # 功能特性 - 琥珀色
    COMPARISON = "comparison"      # 对比 - 粉色


# 主题配置
THEME_CONFIG = {
    ThemeType.WHO: {
        "label": "Who（使用者）",
        "color": "blue",
        "description": "识别评论中提到的使用人群，如：孩子、老人、上班族等"
    },
    ThemeType.WHERE: {
        "label": "Where（使用场景）",
        "color": "purple", 
        "description": "识别使用地点和场景，如：家里、办公室、户外等"
    },
    ThemeType.WHEN: {
        "label": "When（使用时机）",
        "color": "green",
        "description": "识别使用时间和时机，如：早上、睡前、运动时等"
    },
    ThemeType.UNMET_NEEDS: {
        "label": "未被满足的需求",
        "color": "red",
        "description": "识别用户的期待和建议，如：希望、如果能、建议等"
    },
    ThemeType.PAIN_POINTS: {
        "label": "Pain Points（痛点）",
        "color": "orange",
        "description": "识别问题和不满，如：故障、不好用、太贵等"
    },
    ThemeType.BENEFITS: {
        "label": "Benefits（收益/好处）",
        "color": "emerald",
        "description": "识别正面体验，如：方便、省时、舒适等"
    },
    ThemeType.FEATURES: {
        "label": "Features（功能特性）",
        "color": "amber",
        "description": "识别产品功能描述，如：尺寸、材质、性能等"
    },
    ThemeType.COMPARISON: {
        "label": "Comparison（对比）",
        "color": "pink",
        "description": "识别对比内容，如：比之前、相比其他、更好等"
    }
}


class ReviewThemeHighlight(Base):
    """
    ReviewThemeHighlight entity stores AI-extracted theme content for each review.
    每条评论可以有多个主题，每个主题包含多个内容项（关键词、短语或句子）。
    每个内容项包含：中文内容、原始英文内容、翻译、解释说明。
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
        comment="主题类型：who/where/when/unmet_needs/pain_points/benefits/features/comparison"
    )
    
    # 内容项列表，存储为JSON数组
    # 每个项格式：{
    #   "content": "孩子",  # 中文内容（关键词/短语/句子）
    #   "content_original": "for kids",  # 原始英文内容（可选）
    #   "content_translated": "给孩子",  # 翻译（如果从英文提取，可选）
    #   "explanation": "评论中提到使用人群是孩子"  # 解释说明（可选）
    # }
    items: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        comment="该主题在评论中识别到的内容项列表，每个项包含content/content_original/content_translated/explanation"
    )
    
    # 向后兼容：保留 keywords 字段（已废弃，使用 items 代替）
    keywords: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        default=None,
        comment="已废弃：使用 items 字段代替"
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

    def __repr__(self) -> str:
        items_count = len(self.items) if self.items else 0
        return f"<ReviewThemeHighlight(id={self.id}, theme={self.theme_type}, items={items_count})>"

