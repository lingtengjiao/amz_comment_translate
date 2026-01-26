"""
SQLAlchemy Models for VOC-Master
"""
from app.models.product import Product
from app.models.review import Review
from app.models.task import Task
from app.models.insight import ReviewInsight
from app.models.theme_highlight import ReviewThemeHighlight, ThemeType, THEME_CONFIG
from app.models.product_dimension import ProductDimension
from app.models.product_context_label import ProductContextLabel, ContextType, CONTEXT_TYPE_CONFIG
from app.models.report import ProductReport, ReportType, ReportStatus
from app.models.analysis import AnalysisProject, AnalysisProjectItem, AnalysisType, AnalysisStatus
# 项目级学习模型（市场洞察）- 必须在 AnalysisProject 之后导入，因为有 relationship 依赖
from app.models.project_learning import (
    ProjectDimension, 
    ProjectContextLabel, 
    ProjectDimensionMapping, 
    ProjectLabelMapping
)
# 用户系统模型
from app.models.user import User
from app.models.user_project import UserProject
from app.models.analysis_lock import ProductAnalysisLock, LockStatus
from app.models.product_time_series import ProductTimeSeries
# Analytics Models
from app.models.analytics import UserEvent, UserSession, DailyStat
# Rufus Conversation Model
from app.models.rufus_conversation import RufusConversation
from app.models.rufus_summary import RufusSummary, SummaryType
# Keyword Collection Models (产品分析库)
from app.models.keyword_collection import KeywordCollection
from app.models.collection_product import CollectionProduct
# Profit Calculator Models (毛利计算)
from app.models.profit_calculator import (
    ProfitProduct,
    FBAFeeRule,
    ReferralFeeRule,
    ShippingFeeRule,
    ExchangeRate,
    OtherCostRule
)
# Share Link Model (分享链接)
from app.models.share_link import ShareLink, ShareResourceType
# Product Dimension Summary Model (维度总结 - 中观层AI分析)
from app.models.product_dimension_summary import ProductDimensionSummary, SummaryType as DimensionSummaryType
# Product Pivot Insight Model (数据透视AI洞察)
from app.models.product_pivot_insight import ProductPivotInsight

__all__ = [
    "Product", 
    "Review", 
    "Task", 
    "ReviewInsight", 
    "ReviewThemeHighlight", 
    "ThemeType", 
    "THEME_CONFIG",
    "ProductDimension",
    "ProductContextLabel",
    "ContextType",
    "CONTEXT_TYPE_CONFIG",
    "ProductReport",
    "ReportType",
    "ReportStatus",
    # Analysis Models
    "AnalysisProject",
    "AnalysisProjectItem",
    "AnalysisType",
    "AnalysisStatus",
    # Project Learning Models (Market Insight)
    "ProjectDimension",
    "ProjectContextLabel",
    "ProjectDimensionMapping",
    "ProjectLabelMapping",
    # User System Models
    "User",
    "UserProject",
    "ProductAnalysisLock",
    "LockStatus",
    "ProductTimeSeries",
    # Analytics Models
    "UserEvent",
    "UserSession",
    "DailyStat",
    # Rufus Conversation Model
    "RufusConversation",
    "RufusSummary",
    "SummaryType",
    # Keyword Collection Models
    "KeywordCollection",
    "CollectionProduct",
    # Profit Calculator Models
    "ProfitProduct",
    "FBAFeeRule",
    "ReferralFeeRule",
    "ShippingFeeRule",
    "ExchangeRate",
    "OtherCostRule",
    # Share Link Model
    "ShareLink",
    "ShareResourceType",
    # Product Dimension Summary Model
    "ProductDimensionSummary",
    "DimensionSummaryType",
    # Product Pivot Insight Model
    "ProductPivotInsight",
]

