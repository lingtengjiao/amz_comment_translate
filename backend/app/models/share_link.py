"""
ShareLink Model - 分享链接数据模型

用于存储分享链接信息，支持将评论详情页、报告详情页、竞品对比分析、
市场品类分析、Rufus 调研详情页分享给未登录用户查看。
"""
import uuid
import enum
import secrets
import string
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User


def generate_share_token(length: int = 12) -> str:
    """
    生成 URL 安全的分享令牌
    
    使用 URL 安全字符：a-z, A-Z, 0-9, -, _
    12 位长度提供足够的熵（约 72 bits）
    """
    alphabet = string.ascii_letters + string.digits + '-_'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


class ShareResourceType(str, enum.Enum):
    """分享资源类型枚举"""
    REVIEW_READER = "review_reader"           # 评论详情页
    REPORT = "report"                          # 报告详情页
    ANALYSIS_PROJECT = "analysis_project"      # 对比分析/市场洞察
    RUFUS_SESSION = "rufus_session"            # Rufus 会话
    KEYWORD_COLLECTION = "keyword_collection"  # 产品画板（市场格局分析）


class ShareLink(Base):
    """
    分享链接实体
    
    Attributes:
        id: 唯一标识 (UUID)
        token: 分享令牌（12位 URL 安全字符串）
        resource_type: 资源类型
        resource_id: 资源 UUID（报告/分析项目/会话 ID）
        asin: ASIN（用于评论详情/报告，可选）
        user_id: 创建者用户 ID
        title: 分享标题（可选，用于显示）
        expires_at: 过期时间（可选，NULL 表示永久有效）
        view_count: 访问次数
        is_active: 是否有效
        created_at: 创建时间
        updated_at: 更新时间
    """
    __tablename__ = "share_links"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    token: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True,
        default=generate_share_token
    )
    
    resource_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )
    
    # 资源 ID（报告/分析项目/Rufus 会话的 UUID）
    # 对于评论详情页可以为空（使用 asin 字段）
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True
    )
    
    # ASIN（用于评论详情页和报告）
    asin: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        index=True
    )
    
    # 创建者用户 ID
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # 分享标题（用于显示）
    title: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )
    
    # 过期时间（NULL 表示永久有效）
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # 访问次数统计
    view_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    
    # 是否有效（可以手动撤销）
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
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
    
    # 关联用户
    user: Mapped["User"] = relationship(
        "User",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        return f"<ShareLink(token={self.token}, type={self.resource_type}, active={self.is_active})>"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": str(self.id),
            "token": self.token,
            "resource_type": self.resource_type,
            "resource_id": str(self.resource_id) if self.resource_id else None,
            "asin": self.asin,
            "title": self.title,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "view_count": self.view_count,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "share_url": f"/share/{self.token}"
        }
    
    @property
    def is_expired(self) -> bool:
        """检查链接是否已过期"""
        if self.expires_at is None:
            return False
        from datetime import timezone
        return datetime.now(timezone.utc) > self.expires_at
    
    @property
    def is_valid(self) -> bool:
        """检查链接是否有效（未过期且未撤销）"""
        return self.is_active and not self.is_expired
