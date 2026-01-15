"""
Product Context Label Model - Stores AI-learned 5W marketing element labels
产品上下文标签模型 - 存储 AI 学习到的 5W 营销要素标准标签

5W Model (扩展版):
- Buyer: 购买者身份（谁付钱）- [NEW] 从 Who 拆分
- User: 使用者身份（谁使用）- [NEW] 从 Who 拆分
- Who: 人群（向后兼容旧数据）
- Where: 使用地点/场景
- When: 使用时刻/时机
- Why: 购买动机
- What: 待办任务 (Jobs to be Done)
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ContextType(str, Enum):
    """5W 上下文类型枚举（扩展版：Who 拆分为 Buyer + User）"""
    WHO = "who"      # [DEPRECATED] 保留向后兼容，新数据使用 buyer/user
    BUYER = "buyer"  # [NEW] 购买者身份（谁付钱）
    USER = "user"    # [NEW] 使用者身份（谁使用）
    WHERE = "where"  # 地点/场景
    WHEN = "when"    # 时刻/时机
    WHY = "why"      # 购买动机 (Purchase Driver)
    WHAT = "what"    # 待办任务 (Jobs to be Done)


# 5W 类型配置（用于 UI 展示）- 扩展版：Who 拆分为 Buyer + User
CONTEXT_TYPE_CONFIG = {
    ContextType.BUYER: {
        "label": "Buyer（购买者）",
        "color": "blue",
        "description": "识别购买者身份（谁付钱），如：妈妈、送礼者、企业采购、丈夫给妻子买等"
    },
    ContextType.USER: {
        "label": "User（使用者）",
        "color": "cyan",
        "description": "识别实际使用者身份（谁使用），如：3岁幼儿、老人、员工、宠物主自己等"
    },
    ContextType.WHO: {
        "label": "Who（人群）",
        "color": "blue",
        "description": "[历史数据] 未区分购买者/使用者的人群标签"
    },
    ContextType.WHERE: {
        "label": "Where（使用地点）",
        "color": "purple", 
        "description": "识别物理空间和环境，如：小户型厨房、房车(RV)、车库、办公室桌面等"
    },
    ContextType.WHEN: {
        "label": "When（使用时刻）",
        "color": "green",
        "description": "识别时间点和触发时机，如：睡前、停电时、圣诞节、运动后等"
    },
    ContextType.WHY: {
        "label": "Why（购买动机）",
        "color": "pink",
        "description": "识别购买的触发原因，如：旧的坏了、作为礼物、为了省钱、被TikTok种草等"
    },
    ContextType.WHAT: {
        "label": "What（待办任务/用途）",
        "color": "orange",
        "description": "识别用户试图完成的具体任务(JTBD)，如：清理地毯猫毛、缓解背痛、哄孩子睡觉等"
    }
}


class ProductContextLabel(Base):
    """
    产品上下文标签实体 - 存储 AI 学习到的 5W 标准标签定义。
    
    用于"AI 学习建模 -> 标准化执行"模式：
    1. 系统读取产品评论样本，为每个 5W 类型生成标准标签库
    2. 将标签存入此表，关联产品，支持用户微调
    3. 在分析单条评论时，强制 LLM 只能归类到已定义的标签中
    
    Example:
        type='who', name='老年人', description='独居或需要照顾的老年用户群体'
    
    Attributes:
        id: 唯一标识符 (UUID)
        product_id: 关联的产品 ID
        type: 5W 类型 (who/where/when/why/what)
        name: 标准标签名称
        description: 标签定义/描述
        count: 该标签被命中的次数（用于热度排序）
        is_ai_generated: 是否由 AI 自动生成（False 表示用户手动添加）
        created_at: 记录创建时间
        updated_at: 记录更新时间
    """
    __tablename__ = "product_context_labels"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Foreign key to Product
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Core fields
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="5W 类型：who/where/when/why/what"
    )
    
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="标准标签名称，如：老年人、宠物主、睡前"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="标签定义/描述，用于指导 AI 归类和 UI 展示"
    )
    
    # Usage statistics
    count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="该标签被命中的次数，用于热度排序"
    )
    
    # Metadata
    is_ai_generated: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="是否由 AI 自动生成（False 表示用户手动添加）"
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
    
    # Relationship back to Product
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="context_labels"
    )
    
    # Unique constraint: same product + type + name should be unique
    __table_args__ = (
        UniqueConstraint('product_id', 'type', 'name', name='uix_product_context_label'),
    )
    
    def __repr__(self) -> str:
        return f"<ProductContextLabel(type={self.type}, name={self.name}, product_id={self.product_id})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "type": self.type,
            "name": self.name,
            "description": self.description,
            "count": self.count,
            "is_ai_generated": self.is_ai_generated
        }

