"""
产品维度总结模型 (Product Dimension Summary)

打通微观(单条评论洞察)到宏观(项目报告)的桥梁层。
存储AI生成的中观层分析内容：
- 5W主题总结 (theme_buyer, theme_user, theme_where, theme_when, theme_why, theme_what)
- 产品维度总结 (dimension)
- 情感维度总结 (emotion)
- 场景维度总结 (scenario)
- 消费者原型 (consumer_persona)
- 整体数据总结 (overall)
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4

from sqlalchemy import Column, String, Text, Integer, Float, ForeignKey, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class ProductDimensionSummary(Base):
    """产品维度总结"""
    __tablename__ = "product_dimension_summaries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    product_id = Column(PGUUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 总结类型
    summary_type = Column(String(50), nullable=False, index=True)
    # theme_buyer, theme_user, theme_where, theme_when, theme_why, theme_what
    # dimension, emotion, scenario, consumer_persona, overall
    
    # 具体分类
    category = Column(String(200), nullable=True)  # 维度名、情感类型名等
    
    # AI生成内容
    title = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    key_points = Column(JSONB, default=list)  # [{"point": "...", "evidence_count": 10}]
    evidence_count = Column(Integer, default=0)
    sentiment_tendency = Column(String(20), nullable=True)  # positive/negative/neutral/mixed
    
    # 消费者原型专用
    persona_data = Column(JSONB, nullable=True)  # {"buyer": "宝妈", "user": "学龄前儿童", ...}
    
    # 元数据
    ai_model = Column(String(50), default="qwen-max")
    confidence = Column(Float, default=0.8)
    raw_response = Column(JSONB, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    product = relationship("Product", back_populates="dimension_summaries")
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "summary_type": self.summary_type,
            "category": self.category,
            "title": self.title,
            "summary": self.summary,
            "key_points": self.key_points or [],
            "evidence_count": self.evidence_count,
            "sentiment_tendency": self.sentiment_tendency,
            "persona_data": self.persona_data,
            "ai_model": self.ai_model,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    @classmethod
    def get_summary_types(cls) -> List[str]:
        """获取所有总结类型"""
        return [
            "theme_buyer", "theme_user", "theme_where", "theme_when", "theme_why", "theme_what",
            "dimension", "emotion", "scenario", "consumer_persona", "overall"
        ]


# 类型常量
class SummaryType:
    THEME_BUYER = "theme_buyer"
    THEME_USER = "theme_user"
    THEME_WHERE = "theme_where"
    THEME_WHEN = "theme_when"
    THEME_WHY = "theme_why"
    THEME_WHAT = "theme_what"
    DIMENSION = "dimension"
    EMOTION = "emotion"
    SCENARIO = "scenario"
    CONSUMER_PERSONA = "consumer_persona"
    OVERALL = "overall"
