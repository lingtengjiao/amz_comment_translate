"""
分享服务 (Share Service)

提供分享链接的创建、验证、撤销等功能。
支持将评论详情页、报告详情页、竞品对比分析、市场品类分析、Rufus 调研详情页
分享给未登录用户查看。
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.share_link import ShareLink, ShareResourceType
from app.models.product import Product
from app.models.report import ProductReport
from app.models.analysis import AnalysisProject
from app.models.rufus_conversation import RufusConversation
from app.models.review import Review
from app.models.keyword_collection import KeywordCollection
from app.models.collection_product import CollectionProduct
from app.models.insight import ReviewInsight
from app.models.theme_highlight import ReviewThemeHighlight
from app.models.product_dimension import ProductDimension
from app.models.product_context_label import ProductContextLabel

logger = logging.getLogger(__name__)


class ShareService:
    """分享服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ==========================================
    # 创建分享链接
    # ==========================================
    
    async def create_share_link(
        self,
        user_id: UUID,
        resource_type: ShareResourceType,
        resource_id: Optional[UUID] = None,
        asin: Optional[str] = None,
        title: Optional[str] = None,
        expires_in_days: Optional[int] = None
    ) -> ShareLink:
        """
        创建分享链接
        
        Args:
            user_id: 创建者用户 ID
            resource_type: 资源类型
            resource_id: 资源 ID（报告/分析项目/会话 UUID）
            asin: ASIN（用于评论详情/报告）
            title: 分享标题
            expires_in_days: 过期天数（None 表示永久）
            
        Returns:
            创建的 ShareLink 对象
        """
        # 验证资源是否存在
        await self._validate_resource_exists(resource_type, resource_id, asin)
        
        # 自动生成标题（如果未提供）
        if not title:
            title = await self._generate_title(resource_type, resource_id, asin)
        
        # 计算过期时间
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        
        # 创建分享链接
        share_link = ShareLink(
            user_id=user_id,
            resource_type=resource_type.value,
            resource_id=resource_id,
            asin=asin,
            title=title,
            expires_at=expires_at
        )
        
        self.db.add(share_link)
        await self.db.commit()
        await self.db.refresh(share_link)
        
        logger.info(f"创建分享链接: token={share_link.token}, type={resource_type.value}, user={user_id}")
        return share_link
    
    async def _validate_resource_exists(
        self,
        resource_type: ShareResourceType,
        resource_id: Optional[UUID],
        asin: Optional[str]
    ) -> None:
        """验证资源是否存在"""
        if resource_type == ShareResourceType.REVIEW_READER:
            if not asin:
                raise ValueError("评论详情页分享需要提供 ASIN")
            result = await self.db.execute(
                select(Product).where(Product.asin == asin)
            )
            if not result.scalar_one_or_none():
                raise ValueError(f"产品不存在: {asin}")
                
        elif resource_type == ShareResourceType.REPORT:
            if not resource_id:
                raise ValueError("报告分享需要提供报告 ID")
            result = await self.db.execute(
                select(ProductReport).where(ProductReport.id == resource_id)
            )
            if not result.scalar_one_or_none():
                raise ValueError(f"报告不存在: {resource_id}")
                
        elif resource_type == ShareResourceType.ANALYSIS_PROJECT:
            if not resource_id:
                raise ValueError("分析项目分享需要提供项目 ID")
            result = await self.db.execute(
                select(AnalysisProject).where(AnalysisProject.id == resource_id)
            )
            if not result.scalar_one_or_none():
                raise ValueError(f"分析项目不存在: {resource_id}")
                
        elif resource_type == ShareResourceType.RUFUS_SESSION:
            # Rufus 使用虚拟 session_id 格式:
            # - asin_XXXXX: 产品详情页对话
            # - keyword_XXXXX: 关键词搜索对话
            # - 普通 session_id: 首页对话
            if not asin:
                raise ValueError("Rufus 会话分享需要提供 session_id")
            
            # 根据虚拟 session_id 格式构建查询
            if asin.startswith('asin_'):
                # 按 ASIN 查询产品详情页对话
                real_asin = asin[5:]  # 去掉 "asin_" 前缀
                result = await self.db.execute(
                    select(RufusConversation).where(
                        RufusConversation.asin == real_asin,
                        RufusConversation.page_type == 'product_detail'
                    ).limit(1)
                )
            elif asin.startswith('keyword_'):
                # 按关键词查询搜索页对话
                keyword = asin[8:]  # 去掉 "keyword_" 前缀
                result = await self.db.execute(
                    select(RufusConversation).where(
                        RufusConversation.keyword == keyword,
                        RufusConversation.page_type == 'keyword_search'
                    ).limit(1)
                )
            else:
                # 普通 session_id
                result = await self.db.execute(
                    select(RufusConversation).where(RufusConversation.session_id == asin).limit(1)
                )
            
            if not result.scalar_one_or_none():
                raise ValueError(f"Rufus 会话不存在: {asin}")
                
        elif resource_type == ShareResourceType.KEYWORD_COLLECTION:
            if not resource_id:
                raise ValueError("产品画板分享需要提供集合 ID")
            result = await self.db.execute(
                select(KeywordCollection).where(KeywordCollection.id == resource_id)
            )
            if not result.scalar_one_or_none():
                raise ValueError(f"产品画板不存在: {resource_id}")
    
    async def _generate_title(
        self,
        resource_type: ShareResourceType,
        resource_id: Optional[UUID],
        asin: Optional[str]
    ) -> str:
        """自动生成分享标题"""
        if resource_type == ShareResourceType.REVIEW_READER:
            result = await self.db.execute(
                select(Product).where(Product.asin == asin)
            )
            product = result.scalar_one_or_none()
            if product:
                title = product.title_translated or product.title or asin
                return f"评论详情 - {title[:50]}"
            return f"评论详情 - {asin}"
            
        elif resource_type == ShareResourceType.REPORT:
            result = await self.db.execute(
                select(ProductReport).where(ProductReport.id == resource_id)
            )
            report = result.scalar_one_or_none()
            if report and report.title:
                return report.title
            return "产品分析报告"
            
        elif resource_type == ShareResourceType.ANALYSIS_PROJECT:
            result = await self.db.execute(
                select(AnalysisProject).where(AnalysisProject.id == resource_id)
            )
            project = result.scalar_one_or_none()
            if project:
                return project.title
            return "竞品对比分析"
            
        elif resource_type == ShareResourceType.RUFUS_SESSION:
            return "Rufus AI 调研"
            
        elif resource_type == ShareResourceType.KEYWORD_COLLECTION:
            result = await self.db.execute(
                select(KeywordCollection).where(KeywordCollection.id == resource_id)
            )
            collection = result.scalar_one_or_none()
            if collection:
                return f"市场格局分析 - {collection.keyword}"
            return "市场格局分析"
            
        return "分享链接"
    
    # ==========================================
    # 获取分享链接
    # ==========================================
    
    async def get_share_link_by_token(self, token: str) -> Optional[ShareLink]:
        """通过令牌获取分享链接"""
        result = await self.db.execute(
            select(ShareLink).where(ShareLink.token == token)
        )
        return result.scalar_one_or_none()
    
    async def get_user_share_links(
        self,
        user_id: UUID,
        resource_type: Optional[ShareResourceType] = None,
        include_expired: bool = False
    ) -> List[ShareLink]:
        """获取用户创建的分享链接列表"""
        conditions = [ShareLink.user_id == user_id]
        
        if resource_type:
            conditions.append(ShareLink.resource_type == resource_type.value)
        
        if not include_expired:
            conditions.append(ShareLink.is_active == True)
        
        result = await self.db.execute(
            select(ShareLink)
            .where(and_(*conditions))
            .order_by(ShareLink.created_at.desc())
        )
        return list(result.scalars().all())
    
    # ==========================================
    # 验证并获取资源数据
    # ==========================================
    
    async def validate_and_get_resource(self, token: str, skip_increment: bool = False) -> Dict[str, Any]:
        """
        验证分享令牌并返回资源数据
        
        Args:
            token: 分享令牌
            skip_increment: 是否跳过访问次数增加（用于刷新页面等场景）
            
        Returns:
            包含资源类型和数据的字典
            
        Raises:
            ValueError: 链接无效或已过期
        """
        share_link = await self.get_share_link_by_token(token)
        
        if not share_link:
            raise ValueError("分享链接不存在")
        
        if not share_link.is_active:
            raise ValueError("分享链接已被撤销")
        
        if share_link.is_expired:
            raise ValueError("分享链接已过期")
        
        # 增加访问次数（仅在首次访问时）
        if not skip_increment:
            share_link.view_count += 1
            await self.db.commit()
        
        # 根据资源类型获取数据
        resource_type = ShareResourceType(share_link.resource_type)
        data = await self._get_resource_data(resource_type, share_link.resource_id, share_link.asin)
        
        return {
            "resource_type": resource_type.value,
            "title": share_link.title,
            "created_at": share_link.created_at.isoformat() if share_link.created_at else None,
            "view_count": share_link.view_count,
            "data": data
        }
    
    async def _get_resource_data(
        self,
        resource_type: ShareResourceType,
        resource_id: Optional[UUID],
        asin: Optional[str]
    ) -> Dict[str, Any]:
        """获取资源的完整数据"""
        if resource_type == ShareResourceType.REVIEW_READER:
            return await self._get_review_reader_data(asin)
        elif resource_type == ShareResourceType.REPORT:
            return await self._get_report_data(resource_id)
        elif resource_type == ShareResourceType.ANALYSIS_PROJECT:
            return await self._get_analysis_project_data(resource_id)
        elif resource_type == ShareResourceType.RUFUS_SESSION:
            return await self._get_rufus_session_data(asin)
        elif resource_type == ShareResourceType.KEYWORD_COLLECTION:
            return await self._get_keyword_collection_data(resource_id)
        
        return {}
    
    async def _get_review_reader_data(self, asin: str) -> Dict[str, Any]:
        """获取评论详情页数据（包含完整洞察和主题信息）"""
        import json
        from collections import defaultdict
        
        # 获取产品信息
        result = await self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise ValueError(f"产品不存在: {asin}")
        
        # 获取评论列表（通过 product_id 关联）
        review_result = await self.db.execute(
            select(Review)
            .where(Review.product_id == product.id)
            .order_by(Review.review_date.desc().nullslast())
            .limit(500)  # 限制数量
        )
        reviews = list(review_result.scalars().all())
        review_ids = [r.id for r in reviews]
        
        # 获取所有评论的 insights
        insights_result = await self.db.execute(
            select(ReviewInsight)
            .where(ReviewInsight.review_id.in_(review_ids))
        )
        insights_map = defaultdict(list)
        for insight in insights_result.scalars().all():
            insights_map[insight.review_id].append({
                "type": insight.insight_type,
                "quote": insight.quote,
                "quote_translated": insight.quote_translated,
                "analysis": insight.analysis,
                "dimension": insight.dimension,
                "confidence": insight.confidence or "high",
            })
        
        # 获取所有评论的 theme_highlights
        themes_result = await self.db.execute(
            select(ReviewThemeHighlight)
            .where(ReviewThemeHighlight.review_id.in_(review_ids))
        )
        themes_map = defaultdict(list)
        for theme in themes_result.scalars().all():
            # 构建 items 数组（向后兼容旧格式）
            items = []
            if theme.label_name:
                items.append({
                    "content": theme.label_name,
                    "content_original": theme.quote,
                    "quote_translated": theme.quote_translated,
                    "explanation": theme.explanation,
                    "confidence": theme.confidence or "high",
                })
            elif theme.items:
                items = theme.items if isinstance(theme.items, list) else []
            
            themes_map[theme.review_id].append({
                "theme_type": theme.theme_type,
                "label_name": theme.label_name,
                "items": items,
            })
        
        # 解析 bullet_points
        bullet_points = []
        if product.bullet_points_translated:
            try:
                bullet_points = json.loads(product.bullet_points_translated)
                if not isinstance(bullet_points, list):
                    bullet_points = []
            except:
                bullet_points = []
        
        # 计算评分分布
        rating_distribution = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        for r in reviews:
            if 1 <= r.rating <= 5:
                rating_distribution[r.rating] += 1
        
        # 计算情感分布
        sentiment_distribution = {"positive": 0, "neutral": 0, "negative": 0}
        for r in reviews:
            if r.sentiment in sentiment_distribution:
                sentiment_distribution[r.sentiment] += 1
        
        # 聚合 insights
        aggregated_insights = {
            "strengths": [],
            "weaknesses": [],
            "suggestions": [],
            "scenarios": [],
            "emotions": [],
        }
        for review_id, insights_list in insights_map.items():
            for insight in insights_list:
                insight_type = insight["type"]
                if insight_type == "strength":
                    aggregated_insights["strengths"].append({
                        "review_id": str(review_id),
                        "quote": insight["quote"],
                        "quote_translated": insight["quote_translated"],
                        "analysis": insight["analysis"],
                        "dimension": insight["dimension"],
                    })
                elif insight_type == "weakness":
                    aggregated_insights["weaknesses"].append({
                        "review_id": str(review_id),
                        "quote": insight["quote"],
                        "quote_translated": insight["quote_translated"],
                        "analysis": insight["analysis"],
                        "dimension": insight["dimension"],
                    })
                elif insight_type == "suggestion":
                    aggregated_insights["suggestions"].append({
                        "review_id": str(review_id),
                        "quote": insight["quote"],
                        "quote_translated": insight["quote_translated"],
                        "analysis": insight["analysis"],
                        "dimension": insight["dimension"],
                    })
                elif insight_type == "scenario":
                    aggregated_insights["scenarios"].append({
                        "review_id": str(review_id),
                        "quote": insight["quote"],
                        "quote_translated": insight["quote_translated"],
                        "analysis": insight["analysis"],
                        "dimension": insight["dimension"],
                    })
                elif insight_type == "emotion":
                    aggregated_insights["emotions"].append({
                        "review_id": str(review_id),
                        "quote": insight["quote"],
                        "quote_translated": insight["quote_translated"],
                        "analysis": insight["analysis"],
                        "dimension": insight["dimension"],
                    })
        
        # 聚合 themes
        aggregated_themes = {
            "buyer": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "user": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "who": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "where": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "when": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "why": defaultdict(lambda: {"count": 0, "review_ids": []}),
            "what": defaultdict(lambda: {"count": 0, "review_ids": []}),
        }
        
        for review_id, themes_list in themes_map.items():
            for theme in themes_list:
                theme_type = theme["theme_type"]
                label_name = theme["label_name"]
                
                if theme_type in aggregated_themes and label_name:
                    if review_id not in aggregated_themes[theme_type][label_name]["review_ids"]:
                        aggregated_themes[theme_type][label_name]["count"] += 1
                        aggregated_themes[theme_type][label_name]["review_ids"].append(str(review_id))
        
        # 转换为列表格式
        for theme_type in aggregated_themes:
            aggregated_themes[theme_type] = [
                {
                    "label": label,
                    "count": data["count"],
                    "review_ids": data["review_ids"],
                }
                for label, data in aggregated_themes[theme_type].items()
            ]
            # 按数量排序
            aggregated_themes[theme_type].sort(key=lambda x: x["count"], reverse=True)
        
        # 获取产品维度（product_dimensions）
        dimensions_result = await self.db.execute(
            select(ProductDimension)
            .where(ProductDimension.product_id == product.id)
            .order_by(ProductDimension.created_at)
        )
        product_dimensions = [
            {
                "id": str(d.id),
                "name": d.name,
                "description": d.description,
                "dimension_type": d.dimension_type,
                "is_ai_generated": d.is_ai_generated,
            }
            for d in dimensions_result.scalars().all()
        ]
        
        # 获取产品上下文标签（product_context_labels）- 已聚合的5W数据
        context_labels_result = await self.db.execute(
            select(ProductContextLabel)
            .where(ProductContextLabel.product_id == product.id)
            .order_by(ProductContextLabel.count.desc())
        )
        context_labels = {}
        for label in context_labels_result.scalars().all():
            label_type = label.type
            if label_type not in context_labels:
                context_labels[label_type] = []
            context_labels[label_type].append({
                "id": str(label.id),
                "name": label.name,
                "description": label.description,
                "count": label.count,
            })
        
        # 按维度统计 insights（用于维度对比可视化）
        dimension_insights = {}
        for insight_type in ["strengths", "weaknesses", "suggestions"]:
            for insight in aggregated_insights.get(insight_type, []):
                dim = insight.get("dimension") or "其他"
                if dim not in dimension_insights:
                    dimension_insights[dim] = {"strengths": 0, "weaknesses": 0, "suggestions": 0}
                dimension_insights[dim][insight_type] += 1
        
        # 获取维度总结（中观层AI分析）
        from app.models import ProductDimensionSummary
        summaries_result = await self.db.execute(
            select(ProductDimensionSummary)
            .where(ProductDimensionSummary.product_id == product.id)
            .order_by(ProductDimensionSummary.created_at)
        )
        dimension_summaries = [
            s.to_dict() for s in summaries_result.scalars().all()
        ]
        
        return {
            "product": {
                "asin": product.asin,
                "title": product.title_translated or product.title,
                "image_url": product.image_url,
                "marketplace": product.marketplace,
                "average_rating": float(product.average_rating) if product.average_rating else None,
                "review_count": len(reviews),
                "bullet_points_translated": product.bullet_points_translated,
            },
            "bullet_points": bullet_points,
            "reviews": [
                {
                    "id": str(r.id),
                    "title": r.title_translated or r.title_original or "",
                    "content": r.body_translated or r.body_original or "",
                    "rating": r.rating,
                    "author": r.author or "Anonymous",
                    "date": r.review_date.isoformat() if r.review_date else None,
                    "sentiment": r.sentiment,
                    "verified": r.verified_purchase,
                    "helpful_votes": r.helpful_votes or 0,
                    "has_media": r.has_video or r.has_images,
                    "review_url": r.review_url,
                    "insights": insights_map.get(r.id, []),
                    "theme_highlights": themes_map.get(r.id, []),
                }
                for r in reviews
            ],
            "stats": {
                "total_reviews": len(reviews),
                "average_rating": sum(r.rating for r in reviews) / len(reviews) if reviews else 0,
                "rating_distribution": rating_distribution,
                "sentiment_distribution": sentiment_distribution,
            },
            "aggregated_insights": aggregated_insights,
            "aggregated_themes": aggregated_themes,
            "product_dimensions": product_dimensions,
            "context_labels": context_labels,
            "dimension_insights": dimension_insights,
            "dimension_summaries": dimension_summaries,  # AI生成的维度总结
        }
    
    async def _get_report_data(self, report_id: UUID) -> Dict[str, Any]:
        """获取报告数据"""
        result = await self.db.execute(
            select(ProductReport).where(ProductReport.id == report_id)
        )
        report = result.scalar_one_or_none()
        
        if not report:
            raise ValueError(f"报告不存在: {report_id}")
        
        # 获取产品信息
        product_result = await self.db.execute(
            select(Product).where(Product.id == report.product_id)
        )
        product = product_result.scalar_one_or_none()
        
        return {
            "report": report.to_dict(),
            "product": {
                "asin": product.asin if product else None,
                "title": product.title_translated or product.title if product else None,
                "image_url": product.image_url if product else None,
            } if product else None
        }
    
    async def _get_analysis_project_data(self, project_id: UUID) -> Dict[str, Any]:
        """获取分析项目数据"""
        result = await self.db.execute(
            select(AnalysisProject)
            .options(selectinload(AnalysisProject.items))
            .where(AnalysisProject.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise ValueError(f"分析项目不存在: {project_id}")
        
        # 获取关联产品信息
        items_data = []
        for item in project.items:
            product_result = await self.db.execute(
                select(Product).where(Product.id == item.product_id)
            )
            product = product_result.scalar_one_or_none()
            items_data.append({
                "id": str(item.id),
                "role_label": item.role_label,
                "display_order": item.display_order,
                "product": {
                    "id": str(product.id) if product else None,
                    "asin": product.asin if product else None,
                    "title": product.title_translated or product.title if product else None,
                    "image_url": product.image_url if product else None,
                } if product else None
            })
        
        return {
            "project": {
                "id": str(project.id),
                "title": project.title,
                "description": project.description,
                "analysis_type": project.analysis_type,
                "status": project.status,
                "result_content": project.result_content,
                "raw_data_snapshot": project.raw_data_snapshot,
                "created_at": project.created_at.isoformat() if project.created_at else None,
            },
            "items": items_data
        }
    
    async def _get_rufus_session_data(self, session_id: str) -> Dict[str, Any]:
        """获取 Rufus 会话数据
        
        支持虚拟 session_id 格式:
        - asin_XXXXX: 产品详情页对话
        - keyword_XXXXX: 关键词搜索对话
        - 普通 session_id: 首页对话
        """
        # 根据虚拟 session_id 格式构建查询
        if session_id.startswith('asin_'):
            # 按 ASIN 查询产品详情页对话
            real_asin = session_id[5:]  # 去掉 "asin_" 前缀
            result = await self.db.execute(
                select(RufusConversation)
                .where(
                    RufusConversation.asin == real_asin,
                    RufusConversation.page_type == 'product_detail'
                )
                .order_by(RufusConversation.created_at.asc())
            )
        elif session_id.startswith('keyword_'):
            # 按关键词查询搜索页对话
            keyword = session_id[8:]  # 去掉 "keyword_" 前缀
            result = await self.db.execute(
                select(RufusConversation)
                .where(
                    RufusConversation.keyword == keyword,
                    RufusConversation.page_type == 'keyword_search'
                )
                .order_by(RufusConversation.created_at.asc())
            )
        else:
            # 普通 session_id
            result = await self.db.execute(
                select(RufusConversation)
                .where(RufusConversation.session_id == session_id)
                .order_by(RufusConversation.created_at.asc())
            )
        
        conversations = list(result.scalars().all())
        
        if not conversations:
            raise ValueError(f"Rufus 会话不存在: {session_id}")
        
        # 获取会话的基本信息（从第一条对话中提取）
        first_conv = conversations[0]
        
        return {
            "session": {
                "session_id": session_id,
                "page_type": first_conv.page_type,
                "asin": first_conv.asin,
                "keyword": first_conv.keyword,
                "product_title": first_conv.product_title,
                "product_image": first_conv.product_image,
                "marketplace": first_conv.marketplace,
                "created_at": first_conv.created_at.isoformat() if first_conv.created_at else None,
            },
            "conversations": [
                {
                    "id": str(c.id),
                    "question": c.question,
                    "answer": c.answer,
                    "question_type": c.question_type,
                    "question_index": c.question_index,
                    "ai_summary": c.ai_summary,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in conversations
            ]
        }
    
    async def _get_keyword_collection_data(self, collection_id: UUID) -> Dict[str, Any]:
        """获取产品画板（市场格局分析）数据"""
        result = await self.db.execute(
            select(KeywordCollection).where(KeywordCollection.id == collection_id)
        )
        collection = result.scalar_one_or_none()
        
        if not collection:
            raise ValueError(f"产品画板不存在: {collection_id}")
        
        # 获取关联产品
        products_result = await self.db.execute(
            select(CollectionProduct)
            .where(CollectionProduct.collection_id == collection_id)
            .order_by(CollectionProduct.created_at.asc())
        )
        collection_products = list(products_result.scalars().all())
        
        # 直接使用 CollectionProduct 的快照数据
        products_data = []
        for cp in collection_products:
            # 解析价格（可能是字符串格式，如 "$19.99"）
            price_value = None
            if cp.price:
                try:
                    # 尝试提取数字部分
                    import re
                    price_match = re.search(r'[\d.]+', cp.price)
                    if price_match:
                        price_value = float(price_match.group())
                except:
                    pass
            
            products_data.append({
                "id": str(cp.id),
                "product_id": None,  # CollectionProduct 是快照，不关联 Product 表
                "asin": cp.asin,
                "title": cp.title,
                "image_url": cp.image_url,
                "price": price_value,
                "average_rating": float(cp.rating) if cp.rating else None,
                "review_count": cp.review_count,
                "marketplace": collection.marketplace,  # 使用 collection 的 marketplace
                # CollectionProduct 扩展字段
                "brand": cp.brand,
                "year": cp.year,
                "sales_volume": cp.sales_volume,
                "sales_volume_manual": cp.sales_volume_manual,
                "major_category_rank": cp.major_category_rank,
                "minor_category_rank": cp.minor_category_rank,
                "major_category_name": cp.major_category_name,
                "minor_category_name": cp.minor_category_name,
            })
        
        return {
            "collection": {
                "id": str(collection.id),
                "keyword": collection.keyword,
                "marketplace": collection.marketplace,
                "description": collection.description,
                "product_count": len(products_data),
                "created_at": collection.created_at.isoformat() if collection.created_at else None,
                # 视图配置
                "board_config": collection.board_config,
                "view_config": collection.view_config,
            },
            "products": products_data
        }
    
    # ==========================================
    # 撤销分享链接
    # ==========================================
    
    async def revoke_share_link(self, token: str, user_id: UUID) -> bool:
        """
        撤销分享链接
        
        Args:
            token: 分享令牌
            user_id: 操作用户 ID（必须是创建者）
            
        Returns:
            是否成功
        """
        share_link = await self.get_share_link_by_token(token)
        
        if not share_link:
            raise ValueError("分享链接不存在")
        
        if share_link.user_id != user_id:
            raise ValueError("无权撤销此分享链接")
        
        share_link.is_active = False
        await self.db.commit()
        
        logger.info(f"撤销分享链接: token={token}, user={user_id}")
        return True
    
    async def delete_share_link(self, token: str, user_id: UUID) -> bool:
        """
        删除分享链接（物理删除）
        
        Args:
            token: 分享令牌
            user_id: 操作用户 ID（必须是创建者）
            
        Returns:
            是否成功
        """
        share_link = await self.get_share_link_by_token(token)
        
        if not share_link:
            raise ValueError("分享链接不存在")
        
        if share_link.user_id != user_id:
            raise ValueError("无权删除此分享链接")
        
        await self.db.delete(share_link)
        await self.db.commit()
        
        logger.info(f"删除分享链接: token={token}, user={user_id}")
        return True
    
    # ==========================================
    # 获取分享链接元信息（公开接口用）
    # ==========================================
    
    async def get_share_meta(self, token: str) -> Optional[Dict[str, Any]]:
        """
        获取分享链接的元信息（不包含完整数据，用于预览）
        
        Args:
            token: 分享令牌
            
        Returns:
            分享链接的基本信息
        """
        share_link = await self.get_share_link_by_token(token)
        
        if not share_link:
            return None
        
        return {
            "token": share_link.token,
            "resource_type": share_link.resource_type,
            "resource_id": str(share_link.resource_id) if share_link.resource_id else None,
            "asin": share_link.asin,
            "title": share_link.title,
            "is_valid": share_link.is_valid,
            "is_expired": share_link.is_expired,
            "expires_at": share_link.expires_at.isoformat() if share_link.expires_at else None,
            "view_count": share_link.view_count,
            "created_at": share_link.created_at.isoformat() if share_link.created_at else None,
        }
