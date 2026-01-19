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
# Keyword Collection Models (产品分析库)
from app.models.keyword_collection import KeywordCollection
from app.models.collection_product import CollectionProduct

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
    # Keyword Collection Models
    "KeywordCollection",
    "CollectionProduct",
]

