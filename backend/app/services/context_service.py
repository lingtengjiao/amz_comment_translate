"""
Context Service - 5W 上下文标签发现与管理服务
用于实现 "AI 学习建模 -> 标准化归类" 的 AI-Native 模式

5W Model:
- Who: 使用者/人群
- Where: 使用地点/场景
- When: 使用时刻/时机
- Why: 购买动机
- What: 待办任务 (Jobs to be Done)
"""
import logging
from typing import List, Optional, Dict
from uuid import UUID

from sqlalchemy import select, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_context_label import ProductContextLabel, ContextType
from app.models.review import Review, TranslationStatus
from app.services.translation import translation_service

logger = logging.getLogger(__name__)


class ContextService:
    """
    5W 上下文标签发现与管理服务
    
    核心功能：
    1. 自动生成标签：从产品评论中学习并生成 5W 标准标签库
    2. 获取标签：供分析时使用，实现强制归类
    3. 管理标签：增删改查
    4. 统计更新：更新标签命中次数
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def auto_generate_context_labels(
        self, 
        product_id: UUID,
        sample_limit: int = 50,
        replace_existing: bool = True
    ) -> Dict[str, List[dict]]:
        """
        核心业务逻辑：自动为产品生成 5W 标准标签库（Definition 阶段）
        
        **[UPDATED] 结合产品官方信息 + 用户评论**
        - 标题和五点是商家的"卖家秀"，提供精准的官方定义
        - 评论是买家的"买家秀"，提供真实的使用反馈
        
        流程：
        1. 获取产品信息（标题、五点）
        2. 获取该产品最近的评论样本
        3. 调用 TranslationService.learn_context_labels 让 AI 结合官方+用户信息学习
        4. 将学习到的标签存入 product_context_labels 表
        
        Args:
            product_id: 产品 UUID
            sample_limit: 样本数量限制，默认50条
            replace_existing: 是否替换现有标签，默认 True
            
        Returns:
            生成的标签字典，格式：{"who": [...], "where": [...], ...}
            
        Raises:
            ValueError: 产品不存在或样本不足
            RuntimeError: AI 学习失败
        """
        import json as json_lib
        
        # 1. 检查产品是否存在
        product_result = await self.db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            raise ValueError(f"产品不存在: {product_id}")
        
        # [NEW] 获取产品官方信息（标题和五点）
        product_title = product.title or ""
        bullet_points = []
        if product.bullet_points:
            try:
                bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
            except:
                bullet_points = []
        
        logger.info(f"📦 产品信息：{product.asin}，标题长度={len(product_title)}，五点={len(bullet_points)}条")
        
        # 2. 获取评论样本（优先使用已翻译的评论，混合好评差评）
        reviews_result = await self.db.execute(
            select(Review.body_original, Review.body_translated, Review.rating)
            .where(Review.product_id == product_id)
            .where(Review.is_deleted == False)
            .where(Review.translation_status == TranslationStatus.COMPLETED.value)
            .order_by(Review.created_at.desc())
            .limit(sample_limit)
        )
        reviews = reviews_result.all()
        
        if not reviews or len(reviews) < 30:
            raise ValueError(f"样本不足：需要至少30条已翻译评论，当前只有 {len(reviews)} 条")
        
        # 3. 准备样本文本（优先使用翻译文本）
        sample_texts = []
        for row in reviews:
            # 优先使用翻译后的文本，否则使用原文
            text = row.body_translated or row.body_original
            if text and text.strip():
                sample_texts.append(text.strip())
        
        if len(sample_texts) < 30:
            raise ValueError(f"有效样本不足：需要至少30条有内容的评论")
        
        logger.info(f"开始为产品 {product.asin} 学习 5W 标签，样本数量: {len(sample_texts)}")
        
        # 4. [UPDATED] 调用 AI 学习 5W 标签（结合产品官方信息）
        learned_labels = translation_service.learn_context_labels(
            reviews_text=sample_texts,
            product_title=product_title,      # [NEW] 产品标题
            bullet_points=bullet_points       # [NEW] 五点卖点
        )
        
        if not learned_labels:
            raise RuntimeError("AI 学习失败，未能生成 5W 标签")
        
        # 5. 存入数据库
        if replace_existing:
            # 先删除该产品的旧标签
            await self.db.execute(
                delete(ProductContextLabel).where(ProductContextLabel.product_id == product_id)
            )
            logger.debug(f"已清除产品 {product.asin} 的旧 5W 标签")
        
        # 创建新标签记录
        saved_labels = {}
        total_count = 0
        
        for context_type in ["who", "where", "when", "why", "what"]:
            labels = learned_labels.get(context_type, [])
            saved_labels[context_type] = []
            
            for item in labels:
                if not isinstance(item, dict) or not item.get("name"):
                    continue
                    
                label = ProductContextLabel(
                    product_id=product_id,
                    type=context_type,
                    name=item["name"].strip(),
                    description=item.get("description", "").strip() or None,
                    count=0,
                    is_ai_generated=True
                )
                self.db.add(label)
                saved_labels[context_type].append({
                    "name": item["name"].strip(),
                    "description": item.get("description", "").strip()
                })
                total_count += 1
        
        await self.db.commit()
        
        logger.info(f"产品 {product.asin} 成功生成 {total_count} 个 5W 标签")
        for ctx_type, labels in saved_labels.items():
            if labels:
                logger.info(f"  - {ctx_type}: {len(labels)} 个标签")
        
        return saved_labels
    
    async def get_context_labels(
        self, 
        product_id: UUID,
        context_type: Optional[str] = None
    ) -> List[ProductContextLabel]:
        """
        获取产品的 5W 标签
        
        Args:
            product_id: 产品 UUID
            context_type: 可选，指定获取某一类型的标签 (who/where/when/why/what)
            
        Returns:
            ProductContextLabel 对象列表
        """
        query = select(ProductContextLabel).where(
            ProductContextLabel.product_id == product_id
        )
        
        if context_type:
            query = query.where(ProductContextLabel.type == context_type)
        
        # 按类型分组，按命中次数降序
        query = query.order_by(
            ProductContextLabel.type,
            ProductContextLabel.count.desc(),
            ProductContextLabel.created_at
        )
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_context_schema(self, product_id: UUID) -> Dict[str, List[dict]]:
        """
        获取用于强制归类的 5W Schema
        
        返回格式化的标签库，供 TranslationService.extract_themes 使用
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            5W 标签 Schema，格式：
            {
                "who": [{"name": "老年人", "description": "..."}, ...],
                "where": [...],
                "when": [...],
                "why": [...],
                "what": [...]
            }
        """
        labels = await self.get_context_labels(product_id)
        
        schema = {
            "who": [],
            "where": [],
            "when": [],
            "why": [],
            "what": []
        }
        
        for label in labels:
            if label.type in schema:
                schema[label.type].append({
                    "name": label.name,
                    "description": label.description or ""
                })
        
        return schema
    
    async def has_context_labels(self, product_id: UUID) -> bool:
        """
        检查产品是否已有 5W 标签库
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            是否存在标签
        """
        result = await self.db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product_id)
        )
        count = result.scalar() or 0
        return count > 0
    
    async def get_labels_summary(self, product_id: UUID) -> Dict[str, int]:
        """
        获取标签统计摘要
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            各类型的标签数量，格式：{"who": 5, "where": 3, ...}
        """
        result = await self.db.execute(
            select(
                ProductContextLabel.type,
                func.count(ProductContextLabel.id).label("count")
            )
            .where(ProductContextLabel.product_id == product_id)
            .group_by(ProductContextLabel.type)
        )
        
        summary = {"who": 0, "where": 0, "when": 0, "why": 0, "what": 0}
        for row in result.all():
            if row.type in summary:
                summary[row.type] = row.count
        
        return summary
    
    async def add_label(
        self,
        product_id: UUID,
        context_type: str,
        name: str,
        description: Optional[str] = None
    ) -> ProductContextLabel:
        """
        手动添加一个标签
        
        Args:
            product_id: 产品 UUID
            context_type: 5W 类型 (who/where/when/why/what)
            name: 标签名称
            description: 标签定义
            
        Returns:
            创建的 ProductContextLabel 对象
            
        Raises:
            ValueError: 类型无效
        """
        valid_types = {"who", "where", "when", "why", "what"}
        if context_type not in valid_types:
            raise ValueError(f"无效的标签类型: {context_type}，必须是 {valid_types}")
        
        label = ProductContextLabel(
            product_id=product_id,
            type=context_type,
            name=name.strip(),
            description=description.strip() if description else None,
            count=0,
            is_ai_generated=False  # 手动添加
        )
        self.db.add(label)
        await self.db.commit()
        await self.db.refresh(label)
        
        logger.info(f"手动添加标签: [{context_type}] {name} (产品: {product_id})")
        return label
    
    async def update_label(
        self,
        label_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[ProductContextLabel]:
        """
        更新标签信息
        
        Args:
            label_id: 标签 UUID
            name: 新的标签名称
            description: 新的标签定义
            
        Returns:
            更新后的 ProductContextLabel 对象，如果不存在返回 None
        """
        result = await self.db.execute(
            select(ProductContextLabel).where(ProductContextLabel.id == label_id)
        )
        label = result.scalar_one_or_none()
        
        if not label:
            return None
        
        if name is not None:
            label.name = name.strip()
        if description is not None:
            label.description = description.strip() if description else None
        
        await self.db.commit()
        await self.db.refresh(label)
        
        logger.info(f"更新标签: {label.name} (ID: {label_id})")
        return label
    
    async def delete_label(self, label_id: UUID) -> bool:
        """
        删除标签
        
        Args:
            label_id: 标签 UUID
            
        Returns:
            是否删除成功
        """
        result = await self.db.execute(
            select(ProductContextLabel).where(ProductContextLabel.id == label_id)
        )
        label = result.scalar_one_or_none()
        
        if not label:
            return False
        
        await self.db.delete(label)
        await self.db.commit()
        
        logger.info(f"删除标签: [{label.type}] {label.name} (ID: {label_id})")
        return True
    
    async def increment_label_count(self, product_id: UUID, label_names: Dict[str, List[str]]):
        """
        批量增加标签的命中次数
        
        Args:
            product_id: 产品 UUID
            label_names: 命中的标签名称，格式：{"who": ["老年人"], "what": ["清理猫毛"], ...}
        """
        for context_type, names in label_names.items():
            if not names:
                continue
                
            # 批量更新该类型下命中的标签
            await self.db.execute(
                update(ProductContextLabel)
                .where(ProductContextLabel.product_id == product_id)
                .where(ProductContextLabel.type == context_type)
                .where(ProductContextLabel.name.in_(names))
                .values(count=ProductContextLabel.count + 1)
            )
        
        await self.db.commit()
    
    async def get_top_labels(
        self, 
        product_id: UUID, 
        context_type: Optional[str] = None,
        limit: int = 10
    ) -> List[ProductContextLabel]:
        """
        获取热门标签（按命中次数排序）
        
        Args:
            product_id: 产品 UUID
            context_type: 可选，指定类型
            limit: 返回数量限制
            
        Returns:
            ProductContextLabel 对象列表
        """
        query = (
            select(ProductContextLabel)
            .where(ProductContextLabel.product_id == product_id)
            .where(ProductContextLabel.count > 0)
            .order_by(ProductContextLabel.count.desc())
            .limit(limit)
        )
        
        if context_type:
            query = query.where(ProductContextLabel.type == context_type)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

