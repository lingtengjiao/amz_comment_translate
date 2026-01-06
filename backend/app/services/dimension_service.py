"""
Dimension Service - 维度发现与管理服务
用于实现 "AI 学习建模 -> 标准化执行" 模式
"""
import json
import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_dimension import ProductDimension
from app.models.review import Review, TranslationStatus
from app.services.translation import translation_service

logger = logging.getLogger(__name__)


class DimensionService:
    """
    维度发现与管理服务
    
    核心功能：
    1. 自动生成维度：从产品评论中学习并生成评价维度
    2. 获取维度：供分析时使用
    3. 管理维度：增删改查
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def auto_generate_dimensions(
        self, 
        product_id: UUID,
        sample_limit: int = 50,
        replace_existing: bool = True
    ) -> List[dict]:
        """
        核心业务逻辑：自动为产品生成评价维度
        
        流程：
        1. 获取该产品最近的评论样本
        2. 调用 TranslationService.learn_dimensions 让 AI 学习
        3. 将学习到的维度存入 product_dimensions 表
        
        Args:
            product_id: 产品 UUID
            sample_limit: 样本数量限制，默认50条
            replace_existing: 是否替换现有维度，默认 True
            
        Returns:
            生成的维度列表
            
        Raises:
            Exception: 样本不足或 AI 学习失败时抛出异常
        """
        # 1. 检查产品是否存在
        product_result = await self.db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            raise ValueError(f"产品不存在: {product_id}")
        
        # 2. 获取评论样本（优先使用已翻译的评论）
        reviews_result = await self.db.execute(
            select(Review.body_original, Review.body_translated)
            .where(Review.product_id == product_id)
            .where(Review.is_deleted == False)
            .order_by(Review.created_at.desc())
            .limit(sample_limit)
        )
        reviews = reviews_result.all()
        
        if not reviews or len(reviews) < 5:
            raise ValueError(f"样本不足：需要至少5条评论，当前只有 {len(reviews)} 条")
        
        # 3. 准备样本文本（优先使用翻译文本，更利于 AI 理解）
        sample_texts = []
        for row in reviews:
            # 优先使用翻译后的文本，否则使用原文
            text = row.body_translated or row.body_original
            if text and text.strip():
                sample_texts.append(text.strip())
        
        if len(sample_texts) < 5:
            raise ValueError(f"有效样本不足：需要至少5条有内容的评论")
        
        # 4. 准备产品信息（标题和五点描述）
        product_title = product.title or ""
        
        # 解析 bullet_points (存储为 JSON 数组)
        bullet_points_text = ""
        if product.bullet_points:
            try:
                bullet_list = json.loads(product.bullet_points)
                if isinstance(bullet_list, list):
                    # 格式化为有序列表
                    bullet_points_text = "\n".join(
                        f"  {i+1}. {bp}" for i, bp in enumerate(bullet_list) if bp
                    )
            except json.JSONDecodeError:
                # 如果不是 JSON，直接当作纯文本
                bullet_points_text = product.bullet_points
        
        logger.info(f"开始为产品 {product.asin} 学习维度，样本数量: {len(sample_texts)}")
        if product_title:
            logger.info(f"产品标题: {product_title[:60]}...")
        if bullet_points_text:
            logger.info(f"产品卖点: {len(bullet_points_text)} 字符")
        
        # 5. 调用 AI 学习维度（传入产品上下文）
        learned_dims = translation_service.learn_dimensions(
            reviews_text=sample_texts,
            product_title=product_title,
            bullet_points=bullet_points_text
        )
        
        if not learned_dims:
            raise RuntimeError("AI 学习失败，未能生成维度")
        
        # 6. 存入数据库
        if replace_existing:
            # 先删除该产品的旧维度
            await self.db.execute(
                delete(ProductDimension).where(ProductDimension.product_id == product_id)
            )
            logger.debug(f"已清除产品 {product.asin} 的旧维度")
        
        # 创建新维度记录
        new_dimensions = []
        for item in learned_dims:
            dim = ProductDimension(
                product_id=product_id,
                name=item['name'],
                description=item.get('description', ''),
                is_ai_generated=True
            )
            self.db.add(dim)
            new_dimensions.append({
                "name": item['name'],
                "description": item.get('description', ''),
                "is_ai_generated": True
            })
        
        await self.db.commit()
        
        logger.info(f"产品 {product.asin} 成功生成 {len(new_dimensions)} 个维度")
        return new_dimensions
    
    async def get_dimensions(self, product_id: UUID) -> List[ProductDimension]:
        """
        获取产品的所有维度
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            ProductDimension 对象列表
        """
        result = await self.db.execute(
            select(ProductDimension)
            .where(ProductDimension.product_id == product_id)
            .order_by(ProductDimension.created_at)
        )
        return list(result.scalars().all())
    
    async def get_dimensions_for_analysis(self, product_id: UUID) -> List[dict]:
        """
        获取用于分析的维度 Schema
        
        返回简单的 dict 列表，供 TranslationService.extract_insights 使用
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            维度字典列表，格式: [{"name": "维度名", "description": "维度定义"}, ...]
        """
        dimensions = await self.get_dimensions(product_id)
        return [dim.to_dict() for dim in dimensions]
    
    async def add_dimension(
        self,
        product_id: UUID,
        name: str,
        description: Optional[str] = None
    ) -> ProductDimension:
        """
        手动添加一个维度
        
        Args:
            product_id: 产品 UUID
            name: 维度名称
            description: 维度定义
            
        Returns:
            创建的 ProductDimension 对象
        """
        dim = ProductDimension(
            product_id=product_id,
            name=name.strip(),
            description=description.strip() if description else None,
            is_ai_generated=False  # 手动添加
        )
        self.db.add(dim)
        await self.db.commit()
        await self.db.refresh(dim)
        
        logger.info(f"手动添加维度: {name} (产品: {product_id})")
        return dim
    
    async def update_dimension(
        self,
        dimension_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[ProductDimension]:
        """
        更新维度信息
        
        Args:
            dimension_id: 维度 UUID
            name: 新的维度名称
            description: 新的维度定义
            
        Returns:
            更新后的 ProductDimension 对象，如果不存在返回 None
        """
        result = await self.db.execute(
            select(ProductDimension).where(ProductDimension.id == dimension_id)
        )
        dim = result.scalar_one_or_none()
        
        if not dim:
            return None
        
        if name is not None:
            dim.name = name.strip()
        if description is not None:
            dim.description = description.strip() if description else None
        
        await self.db.commit()
        await self.db.refresh(dim)
        
        logger.info(f"更新维度: {dim.name} (ID: {dimension_id})")
        return dim
    
    async def delete_dimension(self, dimension_id: UUID) -> bool:
        """
        删除维度
        
        Args:
            dimension_id: 维度 UUID
            
        Returns:
            是否删除成功
        """
        result = await self.db.execute(
            select(ProductDimension).where(ProductDimension.id == dimension_id)
        )
        dim = result.scalar_one_or_none()
        
        if not dim:
            return False
        
        await self.db.delete(dim)
        await self.db.commit()
        
        logger.info(f"删除维度: {dim.name} (ID: {dimension_id})")
        return True
    
    async def has_dimensions(self, product_id: UUID) -> bool:
        """
        检查产品是否已有维度定义
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            是否存在维度
        """
        from sqlalchemy import func
        
        result = await self.db.execute(
            select(func.count(ProductDimension.id))
            .where(ProductDimension.product_id == product_id)
        )
        count = result.scalar() or 0
        return count > 0

