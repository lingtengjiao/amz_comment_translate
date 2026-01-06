"""
Pydantic Schemas for API Request/Response Validation
"""
from datetime import datetime, date
from typing import Optional, List
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict, field_validator
import json


# ============== Enums ==============

class TranslationStatus(str, Enum):
    """Translation status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Sentiment(str, Enum):
    """Sentiment analysis result"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class TaskStatus(str, Enum):
    """Task status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ============== Review Schemas ==============

class ReviewRawData(BaseModel):
    """
    Raw review data received from Chrome extension.
    This is the data structure the extension sends to backend.
    """
    review_id: str = Field(..., description="Amazon's internal review ID")
    author: Optional[str] = Field(None, description="Reviewer's name")
    rating: int = Field(..., ge=1, le=5, description="Star rating (1-5)")
    title: Optional[str] = Field(None, description="Review title (original, without star rating prefix)")
    body: str = Field(..., min_length=1, description="Review body (original)")
    review_date: Optional[str] = Field(None, description="Review date string")
    verified_purchase: bool = Field(False, description="Is verified purchase")
    helpful_votes: int = Field(0, ge=0, description="Helpful votes count")
    # Media fields
    has_video: bool = Field(False, description="Whether review contains video")
    has_images: bool = Field(False, description="Whether review contains images")
    image_urls: Optional[List[str]] = Field(None, description="List of image URLs")
    video_url: Optional[str] = Field(None, description="Video URL if present")


class ReviewIngestRequest(BaseModel):
    """
    Request body for POST /api/v1/reviews/ingest
    Contains product info and batch of reviews from extension.
    """
    asin: str = Field(..., min_length=5, max_length=20, description="Amazon ASIN")
    title: Optional[str] = Field(None, description="Product title")
    image_url: Optional[str] = Field(None, description="Product image URL")
    marketplace: str = Field("US", description="Amazon marketplace")
    average_rating: Optional[float] = Field(None, ge=0, le=5, description="Real average rating from product page")
    price: Optional[str] = Field(None, description="Product price with currency")
    bullet_points: Optional[List[str]] = Field(None, description="Product bullet points list")
    reviews: List[ReviewRawData] = Field(..., description="List of reviews")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "asin": "B0XXXXXXXXX",
                "title": "Product Name",
                "image_url": "https://images-na.ssl-images-amazon.com/...",
                "marketplace": "US",
                "reviews": [
                    {
                        "review_id": "R3XXXXXXXXX",
                        "author": "John Doe",
                        "rating": 4,
                        "title": "Great product!",
                        "body": "I love this product. It works exactly as described...",
                        "review_date": "January 1, 2024",
                        "verified_purchase": True,
                        "helpful_votes": 10
                    }
                ]
            }
        }
    )


class InsightType(str, Enum):
    """Insight type enumeration"""
    STRENGTH = "strength"      # 产品优势
    WEAKNESS = "weakness"      # 改进空间
    SUGGESTION = "suggestion"  # 用户建议
    SCENARIO = "scenario"      # 使用场景
    EMOTION = "emotion"        # 情感洞察


class ReviewInsightResponse(BaseModel):
    """Single insight response"""
    type: InsightType
    quote: str                          # 原文引用片段
    quote_translated: Optional[str]     # 引用片段翻译
    analysis: str                       # 深度解读（中文）
    dimension: Optional[str] = None     # 产品维度
    
    model_config = ConfigDict(from_attributes=True)


class ThemeType(str, Enum):
    """[UPDATED] 5W 营销模型主题类型"""
    WHO = "who"      # 人群/角色 - 蓝色
    WHERE = "where"  # 地点/场景 - 紫色
    WHEN = "when"    # 时刻/时机 - 绿色
    WHY = "why"      # 购买动机 - 粉色
    WHAT = "what"    # 待办任务 - 橙色


class ContextType(str, Enum):
    """5W 上下文类型枚举"""
    WHO = "who"      # 人群/角色
    WHERE = "where"  # 地点/场景
    WHEN = "when"    # 时刻/时机
    WHY = "why"      # 购买动机
    WHAT = "what"    # 待办任务


class ThemeItemResponse(BaseModel):
    """Single theme item response"""
    content: str                        # 中文内容（关键词/短语/句子）
    content_original: Optional[str] = None  # 原始英文内容（可选）
    content_translated: Optional[str] = None  # 翻译（可选）
    explanation: Optional[str] = None   # 解释说明（可选）
    
    model_config = ConfigDict(from_attributes=True)


class ReviewThemeResponse(BaseModel):
    """Single theme highlight response"""
    theme_type: str                     # 主题类型
    items: List[ThemeItemResponse]      # 该主题识别到的内容项列表
    keywords: Optional[List[str]] = None  # 已废弃：向后兼容字段
    
    model_config = ConfigDict(from_attributes=True)


class PinReviewRequest(BaseModel):
    """Request schema for pinning/unpinning a review"""
    isPinned: bool = Field(..., description="Whether to pin the review")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "isPinned": True
            }
        }
    )


class ToggleVisibilityRequest(BaseModel):
    """Request schema for hiding/showing a review"""
    isHidden: bool = Field(..., description="Whether to hide the review")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "isHidden": True
            }
        }
    )


class UpdateReviewRequest(BaseModel):
    """Request schema for updating review content"""
    originalTitle: Optional[str] = None
    translatedTitle: Optional[str] = None
    originalText: Optional[str] = None
    translatedText: Optional[str] = None
    sentiment: Optional[Sentiment] = None
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "originalTitle": "Great product",
                "translatedTitle": "很棒的产品",
                "originalText": "I love this product",
                "translatedText": "我喜欢这个产品",
                "sentiment": "positive"
            }
        }
    )


class ReviewResponse(BaseModel):
    """Single review response with translation"""
    id: UUID
    review_id: str
    author: Optional[str]
    rating: int
    title_original: Optional[str]
    title_translated: Optional[str]
    body_original: str
    body_translated: Optional[str]
    review_date: Optional[date]
    verified_purchase: bool
    helpful_votes: int
    # Media fields
    has_video: bool = False
    has_images: bool = False
    image_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    # Analysis
    sentiment: Sentiment
    translation_status: TranslationStatus
    # User actions
    is_pinned: bool = False
    is_hidden: bool = False
    is_deleted: bool = False
    # Insights - AI深度解读
    insights: Optional[List[ReviewInsightResponse]] = None
    # Theme highlights - 主题高亮关键词
    theme_highlights: Optional[List[ReviewThemeResponse]] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
    @field_validator('image_urls', mode='before')
    @classmethod
    def parse_image_urls(cls, v):
        """Convert JSON string to list if needed"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v
    
    @field_validator('insights', mode='before')
    @classmethod
    def parse_insights(cls, v):
        """Convert ORM objects to list of dicts if needed, filter out _empty markers"""
        if v is None:
            return []
        if isinstance(v, list) and len(v) > 0:
            # Check if it's a list of ORM objects
            if hasattr(v[0], '__dict__'):
                # Filter out _empty markers (processed but no insights)
                filtered = [
                    {
                        'type': item.insight_type,
                        'quote': item.quote,
                        'quote_translated': item.quote_translated,
                        'analysis': item.analysis,
                        'dimension': item.dimension
                    }
                    for item in v
                    if item.insight_type != '_empty'  # Filter out empty markers
                ]
                return filtered
            # If it's already a list of dicts, filter out _empty types
            elif isinstance(v[0], dict):
                return [item for item in v if item.get('type') != '_empty']
        return v
    
    @field_validator('theme_highlights', mode='before')
    @classmethod
    def parse_theme_highlights(cls, v):
        """Convert ORM objects to list of dicts if needed, filter out _empty markers"""
        if v is None:
            return []
        if isinstance(v, list) and len(v) > 0:
            # Check if it's a list of ORM objects
            if hasattr(v[0], '__dict__'):
                result = []
                for item in v:
                    # Filter out _empty markers (processed but no themes)
                    if item.theme_type == '_empty':
                        continue
                    
                    # Use items field if available, otherwise fallback to keywords for backward compatibility
                    items_data = []
                    if hasattr(item, 'items') and item.items:
                        items_data = item.items
                    elif hasattr(item, 'keywords') and item.keywords:
                        # Convert old keywords format to new items format
                        for kw in item.keywords:
                            if isinstance(kw, str):
                                items_data.append({
                                    'content': kw,
                                    'content_original': None,
                                    'content_translated': None,
                                    'explanation': None
                                })
                    
                    result.append({
                        'theme_type': item.theme_type,
                        'items': items_data,
                        'keywords': item.keywords if hasattr(item, 'keywords') and isinstance(item.keywords, list) else []
                    })
                return result
            # If it's already a list of dicts, filter out _empty types
            elif isinstance(v[0], dict):
                return [item for item in v if item.get('theme_type') != '_empty']
        return v


class ReviewListResponse(BaseModel):
    """Paginated list of reviews"""
    total: int
    page: int
    page_size: int
    reviews: List[ReviewResponse]


# ============== Product Schemas ==============

class ProductResponse(BaseModel):
    """Product response with summary statistics"""
    id: UUID
    asin: str
    title: Optional[str]
    title_translated: Optional[str] = None
    image_url: Optional[str]
    marketplace: str
    price: Optional[str] = None
    bullet_points: Optional[List[str]] = None
    bullet_points_translated: Optional[List[str]] = None
    total_reviews: int = 0
    translated_reviews: int = 0
    reviews_with_insights: int = 0
    reviews_with_themes: int = 0
    average_rating: float = 0.0
    translation_status: TranslationStatus = TranslationStatus.PENDING
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
    @field_validator('bullet_points', 'bullet_points_translated', mode='before')
    @classmethod
    def parse_bullet_points(cls, v):
        """Convert JSON string to list if needed"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v


class ProductListResponse(BaseModel):
    """List of products"""
    total: int
    products: List[ProductResponse]


# ============== Task Schemas ==============

class TaskResponse(BaseModel):
    """Task status response"""
    id: UUID
    product_id: UUID
    task_type: str
    status: TaskStatus
    total_items: int
    processed_items: int
    progress_percentage: float
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ============== Ingest Response ==============

class IngestResponse(BaseModel):
    """Response for review ingest endpoint"""
    success: bool
    message: str
    product_id: UUID
    task_id: Optional[UUID] = None  # Optional - only set when translation task is created
    reviews_received: int
    dashboard_url: str = Field(..., description="URL to view results in dashboard")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Reviews received, translation in progress",
                "product_id": "550e8400-e29b-41d4-a716-446655440000",
                "task_id": "550e8400-e29b-41d4-a716-446655440001",
                "reviews_received": 25,
                "dashboard_url": "http://localhost:3000/products/B0XXXXXXXXX"
            }
        }
    )


# ============== Statistics Schemas ==============

class RatingDistribution(BaseModel):
    """Rating distribution for a product"""
    star_1: int = 0
    star_2: int = 0
    star_3: int = 0
    star_4: int = 0
    star_5: int = 0


class SentimentDistribution(BaseModel):
    """Sentiment distribution for a product"""
    positive: int = 0
    neutral: int = 0
    negative: int = 0


class ProductStatsResponse(BaseModel):
    """Detailed statistics for a product"""
    product: ProductResponse
    rating_distribution: RatingDistribution
    sentiment_distribution: SentimentDistribution


# ============== Dimension Schemas ==============

class DimensionResponse(BaseModel):
    """产品维度响应"""
    id: UUID
    product_id: UUID
    name: str = Field(..., description="维度名称，如：电池续航、外观设计")
    description: Optional[str] = Field(None, description="维度定义，用于指导 AI 归类")
    is_ai_generated: bool = Field(True, description="是否由 AI 自动生成")
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class DimensionListResponse(BaseModel):
    """维度列表响应"""
    total: int
    dimensions: List[DimensionResponse]


class DimensionCreateRequest(BaseModel):
    """创建维度请求"""
    name: str = Field(..., min_length=1, max_length=100, description="维度名称")
    description: Optional[str] = Field(None, max_length=500, description="维度定义")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "电池续航",
                "description": "与充电速度和使用时长相关的问题"
            }
        }
    )


class DimensionUpdateRequest(BaseModel):
    """更新维度请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="新的维度名称")
    description: Optional[str] = Field(None, max_length=500, description="新的维度定义")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "电池续航",
                "description": "与充电速度和使用时长相关的问题"
            }
        }
    )


class DimensionGenerateResponse(BaseModel):
    """维度生成响应"""
    success: bool
    message: str
    product_id: UUID
    dimensions: List[DimensionResponse]
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "成功生成 6 个产品维度",
                "product_id": "550e8400-e29b-41d4-a716-446655440000",
                "dimensions": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440001",
                        "product_id": "550e8400-e29b-41d4-a716-446655440000",
                        "name": "外观设计",
                        "description": "产品的外观、颜色、材质等视觉相关评价",
                        "is_ai_generated": True,
                        "created_at": "2024-01-01T00:00:00Z"
                    }
                ]
            }
        }
    )


# ============== 5W Context Label Schemas ==============

class ContextLabelResponse(BaseModel):
    """5W 上下文标签响应"""
    id: UUID
    product_id: UUID
    type: ContextType = Field(..., description="5W 类型：who/where/when/why/what")
    name: str = Field(..., description="标签名称，如：老年人、睡前、送礼")
    description: Optional[str] = Field(None, description="标签定义/描述")
    count: int = Field(0, description="该标签被命中的次数")
    is_ai_generated: bool = Field(True, description="是否由 AI 自动生成")
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class ContextLabelListResponse(BaseModel):
    """5W 标签列表响应"""
    total: int
    labels: List[ContextLabelResponse]
    summary: Optional[dict] = Field(None, description="各类型标签数量统计")


class ContextLabelCreateRequest(BaseModel):
    """创建标签请求"""
    type: ContextType = Field(..., description="5W 类型：who/where/when/why/what")
    name: str = Field(..., min_length=1, max_length=100, description="标签名称")
    description: Optional[str] = Field(None, max_length=500, description="标签定义")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "who",
                "name": "老年人",
                "description": "独居或需要照顾的老年用户群体"
            }
        }
    )


class ContextLabelUpdateRequest(BaseModel):
    """更新标签请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="新的标签名称")
    description: Optional[str] = Field(None, max_length=500, description="新的标签定义")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "独居老人",
                "description": "独自居住的老年用户，需要便捷易用的产品"
            }
        }
    )


class ContextLabelGenerateResponse(BaseModel):
    """5W 标签生成响应"""
    success: bool
    message: str
    product_id: UUID
    labels: dict = Field(..., description="各类型的标签列表")
    summary: dict = Field(..., description="各类型标签数量统计")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "成功生成 25 个 5W 标签",
                "product_id": "550e8400-e29b-41d4-a716-446655440000",
                "labels": {
                    "who": [{"name": "老年人", "description": "独居老年用户"}],
                    "where": [{"name": "卧室", "description": "卧室场景"}],
                    "when": [{"name": "睡前", "description": "睡觉前使用"}],
                    "why": [{"name": "送礼", "description": "作为礼物送人"}],
                    "what": [{"name": "缓解背痛", "description": "缓解背部疼痛"}]
                },
                "summary": {"who": 5, "where": 4, "when": 6, "why": 5, "what": 5}
            }
        }
    )

