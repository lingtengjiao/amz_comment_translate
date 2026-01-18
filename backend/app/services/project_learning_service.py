"""
Project Learning Service - 项目级维度/标签学习与映射服务

用于市场洞察功能的"项目级学习"模式：
1. 从多个产品中采样评论（科学采样，与产品层面一致）
2. 调用现有的 translation_service 学习项目级维度和标签
3. 调用 AI 建立映射关系（只传名称列表，数据量小）
4. 存储项目级维度/标签和映射关系

参考产品层面的科学学习方法，只是数据量做了增加。
"""
import json
import logging
import random
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from difflib import SequenceMatcher

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_dimension import ProductDimension
from app.models.product_context_label import ProductContextLabel
from app.models.review import Review, TranslationStatus
from app.models.project_learning import (
    ProjectDimension, 
    ProjectContextLabel, 
    ProjectDimensionMapping, 
    ProjectLabelMapping
)
from app.services.translation import translation_service
from app.core.config import settings

logger = logging.getLogger(__name__)


class ProjectLearningService:
    """
    项目级维度/标签学习与映射服务
    
    核心功能：
    1. 采样评论：从多个产品中按比例采样评论
    2. 学习阶段：复用 translation_service 学习项目级维度和标签
    3. 映射阶段：调用 AI 建立映射关系
    4. 存储结果：持久化到数据库
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def learn_project_dimensions_and_labels(
        self,
        project_id: UUID,
        product_ids: List[UUID],
        sample_per_product: int = 40,
        max_total_samples: int = 100
    ) -> Dict:
        """
        核心方法：项目级维度和标签学习 + 映射建立
        
        流程：
        1. 从每个产品采样评论（限制数量，与产品层面一致）
        2. 调用 translation_service 学习项目级维度
        3. 调用 translation_service 学习项目级标签
        4. 调用 AI 建立映射关系
        5. 存储到数据库
        
        Args:
            project_id: 分析项目 ID
            product_ids: 参与分析的产品 ID 列表
            sample_per_product: 每个产品采样数量（默认 40 条）
            max_total_samples: 最大总样本数（默认 100 条，与产品层面类似）
            
        Returns:
            学习结果字典
        """
        logger.info(f"🎓 开始项目级学习，项目ID={project_id}，产品数={len(product_ids)}")
        
        # 1. 采样评论（英文原文，用于跨语言学习）
        sampled_reviews, review_stats = await self._sample_reviews_raw(
            product_ids, 
            sample_per_product,
            max_total_samples
        )
        
        if len(sampled_reviews) < 10:
            raise ValueError(f"样本不足：需要至少10条评论，当前只有 {len(sampled_reviews)} 条")
        
        logger.info(f"📝 采样完成：共 {len(sampled_reviews)} 条评论")
        
        # 2. 获取产品信息（用于学习上下文）
        product_info = await self._get_products_info(product_ids)
        
        # 合并产品标题和卖点作为上下文
        combined_title = " | ".join([p['title'][:50] for p in product_info.values()])
        combined_bullets = []
        for p in product_info.values():
            if p.get('bullet_points'):
                combined_bullets.extend(p['bullet_points'][:3])
        
        # 3. 学习项目级维度（复用现有方法）
        logger.info(f"🔍 开始学习项目级维度...")
        project_dimensions = translation_service.learn_dimensions_from_raw(
            raw_reviews=sampled_reviews[:80],  # 限制数量
            product_title=combined_title[:200],
            bullet_points="\n".join(combined_bullets[:10])
        )
        
        if not project_dimensions:
            logger.warning("项目级维度学习返回空，使用默认维度")
            project_dimensions = {
                "product": [{"name": "功能表现", "description": "产品核心功能的表现"}],
                "scenario": [{"name": "日常使用", "description": "日常使用场景"}],
                "emotion": [{"name": "满意度", "description": "整体满意度"}]
            }
        
        dim_count = sum(len(v) for v in project_dimensions.values())
        logger.info(f"✅ 项目级维度学习完成：{dim_count} 个维度")
        
        # 4. 学习项目级标签（复用现有方法）
        logger.info(f"🏷️ 开始学习项目级5W标签...")
        project_labels = translation_service.learn_context_labels_from_raw(
            raw_reviews=sampled_reviews[:80],  # 限制数量
            product_title=combined_title[:200],
            bullet_points=combined_bullets[:10]
        )
        
        if not project_labels:
            logger.warning("项目级标签学习返回空，使用默认标签")
            project_labels = {
                "buyer": [{"name": "普通消费者", "description": "一般购买者"}],
                "user": [{"name": "日常用户", "description": "日常使用者"}],
                "where": [{"name": "家庭", "description": "家庭环境"}],
                "when": [{"name": "日常", "description": "日常时刻"}],
                "why": [{"name": "实用需求", "description": "实用目的"}],
                "what": [{"name": "主要功能", "description": "核心功能"}]
            }
        
        label_count = sum(len(v) for v in project_labels.values())
        logger.info(f"✅ 项目级标签学习完成：{label_count} 个标签")
        
        # 5. 获取产品级维度和标签（用于建立映射）
        products_data = await self._get_products_dimensions_and_labels(product_ids)
        
        # 6. 调用 AI 建立映射关系
        logger.info(f"🔗 开始建立映射关系...")
        dimension_mappings = await self._create_dimension_mappings(
            project_dimensions, 
            products_data
        )
        label_mappings = await self._create_label_mappings(
            project_labels, 
            products_data
        )
        logger.info(f"✅ 映射关系建立完成")
        
        # 7. 存储到数据库
        await self._save_project_learning_result(
            project_id,
            product_ids,
            project_dimensions,
            project_labels,
            dimension_mappings,
            label_mappings,
            products_data
        )
        
        logger.info(f"✅ 项目级学习完成，已存储到数据库")
        
        return {
            "project_id": str(project_id),
            "sample_stats": review_stats,
            "dimensions": project_dimensions,
            "labels": project_labels,
            "dimension_mappings_count": sum(len(m) for m in dimension_mappings.values()),
            "label_mappings_count": sum(len(m) for m in label_mappings.values())
        }
    
    async def _sample_reviews_raw(
        self,
        product_ids: List[UUID],
        sample_per_product: int,
        max_total_samples: int
    ) -> Tuple[List[str], Dict]:
        """
        从多个产品中采样英文原文评论（用于跨语言学习）
        
        采样策略：
        1. 每个产品采样 sample_per_product 条
        2. 分层采样：保持评分分布
        3. 使用英文原文（跨语言学习）
        4. 总数上限控制
        """
        all_reviews = []
        stats = {
            "total_products": len(product_ids),
            "products_sampled": {},
            "total_reviews": 0,
            "rating_distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        }
        
        # 计算每个产品的配额
        quota_per_product = max(10, max_total_samples // len(product_ids))
        
        for product_id in product_ids:
            product_reviews = []
            
            # 分层采样：按评分分组
            for rating_range, ratio in [
                ((1, 2), 0.25),   # 差评 25%
                ((3, 3), 0.15),  # 中评 15%
                ((4, 5), 0.60),  # 好评 60%
            ]:
                range_sample = max(2, int(quota_per_product * ratio))
                
                reviews_result = await self.db.execute(
                    select(Review.body_original, Review.rating)
                    .where(Review.product_id == product_id)
                    .where(Review.is_deleted == False)
                    .where(Review.body_original.isnot(None))
                    .where(Review.rating >= rating_range[0])
                    .where(Review.rating <= rating_range[1])
                    .order_by(func.random())
                    .limit(range_sample)
                )
                
                for row in reviews_result.all():
                    text = row.body_original
                    if text and text.strip() and len(text.strip()) > 20:
                        # 截断过长的评论
                        truncated = text.strip()[:500]
                        product_reviews.append(truncated)
                        rating = int(row.rating) if row.rating else 3
                        if rating in stats["rating_distribution"]:
                            stats["rating_distribution"][rating] += 1
            
            if product_reviews:
                all_reviews.extend(product_reviews)
                stats["products_sampled"][str(product_id)] = len(product_reviews)
        
        stats["total_reviews"] = len(all_reviews)
        
        # 如果超过上限，随机抽取
        if len(all_reviews) > max_total_samples:
            all_reviews = random.sample(all_reviews, max_total_samples)
            stats["total_reviews"] = max_total_samples
        
        return all_reviews, stats
    
    async def _get_products_info(self, product_ids: List[UUID]) -> Dict[str, Dict]:
        """获取产品基本信息"""
        result = {}
        
        for product_id in product_ids:
            product_result = await self.db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = product_result.scalar_one_or_none()
            
            if product:
                # 解析 bullet_points
                bullet_list = []
                if product.bullet_points:
                    try:
                        bullet_list = json.loads(product.bullet_points)
                        if not isinstance(bullet_list, list):
                            bullet_list = []
                    except:
                        bullet_list = []
                
                result[str(product_id)] = {
                    "asin": product.asin,
                    "title": product.title or product.asin,
                    "bullet_points": bullet_list
                }
        
        return result
    
    async def _get_products_dimensions_and_labels(
        self,
        product_ids: List[UUID]
    ) -> Dict[str, Dict]:
        """获取所有产品的维度和标签"""
        products_data = {}
        
        for product_id in product_ids:
            # 获取产品信息
            product_result = await self.db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = product_result.scalar_one_or_none()
            
            if not product:
                continue
            
            # 获取维度
            dims_result = await self.db.execute(
                select(ProductDimension)
                .where(ProductDimension.product_id == product_id)
            )
            dimensions = {}
            for d in dims_result.scalars().all():
                dim_type = d.dimension_type or "product"
                if dim_type not in dimensions:
                    dimensions[dim_type] = []
                dimensions[dim_type].append({
                    "id": str(d.id),
                    "name": d.name
                })
            
            # 获取标签
            labels_result = await self.db.execute(
                select(ProductContextLabel)
                .where(ProductContextLabel.product_id == product_id)
            )
            labels = {}
            for label in labels_result.scalars().all():
                if label.type not in labels:
                    labels[label.type] = []
                labels[label.type].append({
                    "id": str(label.id),
                    "name": label.name
                })
            
            products_data[str(product_id)] = {
                "asin": product.asin,
                "title": product.title or product.asin,
                "dimensions": dimensions,
                "labels": labels
            }
        
        return products_data
    
    def _create_fallback_dimension_mappings(
        self,
        project_dimensions: Dict[str, List[Dict]],
        products_data: Dict[str, Dict],
        similarity_threshold: float = 0.5
    ) -> Dict[str, List[Dict]]:
        """
        基于名称相似度的后备维度映射方案
        
        当 AI 映射失败时使用
        
        维度映射限制类型（product->product, scenario->scenario, emotion->emotion）
        """
        mappings = {}
        total_checked = 0
        total_matched = 0
        
        for dim_type, project_dims in project_dimensions.items():
            mappings[dim_type] = []
            
            for project_dim in project_dims:
                project_dim_name = project_dim['name']
                
                # 在每个产品中查找相似维度（同类型）
                for product_id, data in products_data.items():
                    product_dims = data.get('dimensions', {}).get(dim_type, [])
                    
                    for product_dim in product_dims:
                        product_dim_name = product_dim['name']
                        total_checked += 1
                        
                        # 计算相似度
                        similarity = SequenceMatcher(
                            None, 
                            project_dim_name.lower(), 
                            product_dim_name.lower()
                        ).ratio()
                        
                        if similarity >= similarity_threshold:
                            total_matched += 1
                            mappings[dim_type].append({
                                "project_dimension_name": project_dim_name,
                                "product_id": product_id,
                                "product_dimension_name": product_dim_name
                            })
        
        logger.info(f"维度后备映射：检查了 {total_checked} 对，匹配了 {total_matched} 对（阈值={similarity_threshold}）")
        return mappings
    
    def _create_fallback_label_mappings(
        self,
        project_labels: Dict[str, List[Dict]],
        products_data: Dict[str, Dict],
        similarity_threshold: float = 0.5
    ) -> Dict[str, List[Dict]]:
        """
        基于名称相似度的后备标签映射方案
        
        当 AI 映射失败时使用
        
        标签映射按类型匹配（buyer->buyer, user->user 等），
        因为标签类型是有语义意义的。
        """
        mappings = {}
        total_checked = 0
        total_matched = 0
        
        for label_type, project_labels_list in project_labels.items():
            mappings[label_type] = []
            
            for project_label in project_labels_list:
                project_label_name = project_label['name']
                
                # 在每个产品中查找相似标签（同类型）
                for product_id, data in products_data.items():
                    product_labels_list = data.get('labels', {}).get(label_type, [])
                    
                    for product_label in product_labels_list:
                        product_label_name = product_label['name']
                        total_checked += 1
                        
                        # 计算相似度
                        similarity = SequenceMatcher(
                            None, 
                            project_label_name.lower(), 
                            product_label_name.lower()
                        ).ratio()
                        
                        if similarity >= similarity_threshold:
                            total_matched += 1
                            mappings[label_type].append({
                                "project_label_name": project_label_name,
                                "product_id": product_id,
                                "product_label_name": product_label_name
                            })
        
        logger.info(f"标签后备映射：检查了 {total_checked} 对，匹配了 {total_matched} 对（阈值={similarity_threshold}）")
        return mappings
    
    async def _create_dimension_mappings(
        self,
        project_dimensions: Dict[str, List[Dict]],
        products_data: Dict[str, Dict]
    ) -> Dict[str, List[Dict]]:
        """
        调用 AI 建立维度映射关系
        
        输入只有名称列表，数据量很小
        如果 AI 失败，使用基于名称相似度的后备方案
        """
        # 准备映射输入（只有名称）
        project_dim_names = {}
        for dim_type, dims in project_dimensions.items():
            project_dim_names[dim_type] = [d['name'] for d in dims]
        
        product_dim_names = {}
        for product_id, data in products_data.items():
            product_dim_names[product_id] = {}
            for dim_type, dims in data.get('dimensions', {}).items():
                product_dim_names[product_id][dim_type] = [d['name'] for d in dims]
        
        # 调用 AI 建立映射
        mappings = await self._call_ai_for_dimension_mapping(
            project_dim_names, 
            product_dim_names
        )
        
        # 如果 AI 映射失败或返回空，使用后备方案
        if not mappings or sum(len(m) for m in mappings.values()) == 0:
            logger.info("维度映射：AI 映射失败，使用基于名称相似度的后备方案")
            mappings = self._create_fallback_dimension_mappings(
                project_dimensions, 
                products_data
            )
            logger.info(f"维度映射：后备方案生成了 {sum(len(m) for m in mappings.values())} 个映射")
        
        return mappings
    
    async def _create_label_mappings(
        self,
        project_labels: Dict[str, List[Dict]],
        products_data: Dict[str, Dict]
    ) -> Dict[str, List[Dict]]:
        """
        调用 AI 建立标签映射关系
        
        输入只有名称列表，数据量很小
        如果 AI 失败，使用基于名称相似度的后备方案
        """
        # 准备映射输入（只有名称）
        project_label_names = {}
        for label_type, labels in project_labels.items():
            project_label_names[label_type] = [l['name'] for l in labels]
        
        product_label_names = {}
        for product_id, data in products_data.items():
            product_label_names[product_id] = {}
            for label_type, labels in data.get('labels', {}).items():
                product_label_names[product_id][label_type] = [l['name'] for l in labels]
        
        # 调用 AI 建立映射
        mappings = await self._call_ai_for_label_mapping(
            project_label_names, 
            product_label_names
        )
        
        # 如果 AI 映射失败或返回空，使用后备方案
        if not mappings or sum(len(m) for m in mappings.values()) == 0:
            logger.info("标签映射：AI 映射失败，使用基于名称相似度的后备方案")
            mappings = self._create_fallback_label_mappings(
                project_labels, 
                products_data
            )
            logger.info(f"标签映射：后备方案生成了 {sum(len(m) for m in mappings.values())} 个映射")
        
        return mappings
    
    def _safe_parse_json(self, text: str) -> Optional[dict]:
        """
        安全地解析 JSON，尝试修复常见错误
        
        Returns:
            解析后的字典，如果失败返回 None
        """
        if not text or not text.strip():
            return None
        
        # 清理 markdown 代码块
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        # 尝试直接解析
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON 解析失败，尝试修复: {e}")
            
            # 尝试修复常见的 JSON 错误
            # 1. 修复未终止的字符串（在字符串末尾添加引号）
            try:
                # 找到最后一个未闭合的引号位置
                last_quote = cleaned.rfind('"')
                if last_quote > 0:
                    # 检查是否在字符串中间（简单检查：引号数量是否为奇数）
                    before_quote = cleaned[:last_quote]
                    # 排除转义的引号
                    quote_count = 0
                    i = 0
                    while i < len(before_quote):
                        if before_quote[i] == '"' and (i == 0 or before_quote[i-1] != '\\'):
                            quote_count += 1
                        i += 1
                    
                    if quote_count % 2 == 1:  # 奇数个引号，说明有未闭合的
                        # 尝试在末尾添加引号和闭合括号
                        if cleaned.rstrip().endswith(','):
                            fixed = cleaned.rstrip()[:-1] + '"}'
                        else:
                            fixed = cleaned + '"'
                        return json.loads(fixed)
            except:
                pass
            
            # 2. 尝试修复字符串中的换行符（在字符串值中）
            try:
                import re
                # 简单方法：在字符串值中，将未转义的换行符替换为 \n
                # 注意：这个方法比较粗糙，但可以处理一些常见情况
                # 匹配 "key": "value\nwith newline" 这种情况
                fixed = re.sub(r'(?<!\\)\n', '\\n', cleaned)
                fixed = re.sub(r'(?<!\\)\r', '\\r', fixed)
                fixed = re.sub(r'(?<!\\)\t', '\\t', fixed)
                if fixed != cleaned:
                    return json.loads(fixed)
            except:
                pass
            
            # 3. 尝试提取第一个完整的 JSON 对象
            try:
                # 找到第一个 { 和最后一个 }
                start = cleaned.find('{')
                if start >= 0:
                    # 从后往前找匹配的 }
                    depth = 0
                    end = len(cleaned)
                    for i in range(len(cleaned) - 1, start - 1, -1):
                        if cleaned[i] == '}':
                            if depth == 0:
                                end = i + 1
                                break
                            depth -= 1
                        elif cleaned[i] == '{':
                            depth += 1
                    
                    if end > start:
                        partial = cleaned[start:end]
                        return json.loads(partial)
            except:
                pass
            
            # 3. 如果都失败了，记录详细的错误信息用于调试
            error_pos = getattr(e, 'pos', None) or 0
            start_pos = max(0, error_pos - 200)
            end_pos = min(len(cleaned), error_pos + 200)
            error_context = cleaned[start_pos:end_pos]
            logger.error(f"无法修复 JSON，错误: {e}，错误位置: {error_pos}")
            logger.error(f"错误上下文: {error_context}")
            logger.error(f"完整 JSON 长度: {len(cleaned)} 字符")
            # 保存完整 JSON 到日志（限制长度避免日志过大）
            if len(cleaned) > 2000:
                logger.error(f"JSON 前 1000 字符: {cleaned[:1000]}")
                logger.error(f"JSON 后 1000 字符: {cleaned[-1000:]}")
            else:
                logger.error(f"完整 JSON: {cleaned}")
            return None
    
    async def _call_ai_for_dimension_mapping(
        self,
        project_dims: Dict[str, List[str]],
        product_dims: Dict[str, Dict[str, List[str]]]
    ) -> Dict[str, List[Dict]]:
        """
        调用 AI 建立维度映射
        
        输入数据量很小：只有维度名称列表
        """
        from openai import OpenAI
        
        # 构建简洁的 Prompt
        prompt = f"""请建立项目级维度与产品级维度的映射关系。

## 项目级维度（统一标准）
{json.dumps(project_dims, ensure_ascii=False, indent=2)}

## 产品级维度（按产品ID组织）
{json.dumps(product_dims, ensure_ascii=False, indent=2)}

## 任务
对于每个项目级维度，找出语义相近的产品级维度。一个项目维度可以映射多个产品维度。

## 输出格式（JSON）
```json
{{
  "维度类型": {{
    "项目维度名": [
      {{"product_id": "xxx", "dimension_name": "产品维度名"}},
      ...
    ]
  }}
}}
```

请直接输出 JSON，不要有其他文字。确保所有字符串都用双引号包裹，JSON 格式完整。"""

        try:
            client = OpenAI(
                api_key=settings.QWEN_API_KEY,
                base_url=settings.QWEN_API_BASE,
                timeout=60.0
            )
            
            response = client.chat.completions.create(
                model=settings.QWEN_MODEL,  # 使用普通模型即可
                messages=[
                    {"role": "system", "content": "你是一个专业的数据映射专家。请严格按照 JSON 格式输出，确保：1) 所有字符串都用双引号包裹；2) 字符串中的特殊字符（如换行符、引号）要正确转义；3) JSON 格式完整且有效；4) 不要输出任何其他文字，只输出 JSON。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4000  # 增加 token 限制，避免截断
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 记录原始返回内容（用于调试）
            logger.debug(f"维度映射 AI 返回长度: {len(result_text)} 字符")
            if len(result_text) > 500:
                logger.debug(f"维度映射 AI 返回前 500 字符: {result_text[:500]}")
            
            # 使用安全的 JSON 解析
            parsed = self._safe_parse_json(result_text)
            
            if not parsed:
                logger.warning(f"维度映射：JSON 解析失败，返回空映射。原始返回长度: {len(result_text)}")
                # 记录更多调试信息
                if len(result_text) > 1000:
                    logger.warning(f"原始返回前 1000 字符: {result_text[:1000]}")
                else:
                    logger.warning(f"完整原始返回: {result_text}")
                return {}
            
            # 转换为统一格式
            mappings = {}
            for dim_type, type_mappings in parsed.items():
                if not isinstance(type_mappings, dict):
                    continue
                mappings[dim_type] = []
                for project_dim_name, product_mappings in type_mappings.items():
                    if not isinstance(product_mappings, list):
                        continue
                    for pm in product_mappings:
                        if isinstance(pm, dict):
                            mappings[dim_type].append({
                                "project_dimension_name": project_dim_name,
                                "product_id": pm.get("product_id"),
                                "product_dimension_name": pm.get("dimension_name")
                            })
            
            return mappings
            
        except Exception as e:
            logger.error(f"维度映射 AI 调用失败: {e}")
            return {}
    
    async def _call_ai_for_label_mapping(
        self,
        project_labels: Dict[str, List[str]],
        product_labels: Dict[str, Dict[str, List[str]]]
    ) -> Dict[str, List[Dict]]:
        """
        调用 AI 建立标签映射
        
        输入数据量很小：只有标签名称列表
        """
        from openai import OpenAI
        
        # 构建简洁的 Prompt
        prompt = f"""请建立项目级5W标签与产品级5W标签的映射关系。

## 项目级标签（统一标准）
{json.dumps(project_labels, ensure_ascii=False, indent=2)}

## 产品级标签（按产品ID组织）
{json.dumps(product_labels, ensure_ascii=False, indent=2)}

## 任务
对于每个项目级标签，找出语义相近的产品级标签（同类型内匹配）。一个项目标签可以映射多个产品标签。

## 输出格式（JSON）
```json
{{
  "标签类型": {{
    "项目标签名": [
      {{"product_id": "xxx", "label_name": "产品标签名"}},
      ...
    ]
  }}
}}
```

请直接输出 JSON，不要有其他文字。确保所有字符串都用双引号包裹，JSON 格式完整。"""

        try:
            client = OpenAI(
                api_key=settings.QWEN_API_KEY,
                base_url=settings.QWEN_API_BASE,
                timeout=60.0
            )
            
            response = client.chat.completions.create(
                model=settings.QWEN_MODEL,  # 使用普通模型即可
                messages=[
                    {"role": "system", "content": "你是一个专业的数据映射专家。请严格按照 JSON 格式输出，确保：1) 所有字符串都用双引号包裹；2) 字符串中的特殊字符（如换行符、引号）要正确转义；3) JSON 格式完整且有效；4) 不要输出任何其他文字，只输出 JSON。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4000  # 增加 token 限制，避免截断
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 记录原始返回内容（用于调试）
            logger.debug(f"标签映射 AI 返回长度: {len(result_text)} 字符")
            if len(result_text) > 500:
                logger.debug(f"标签映射 AI 返回前 500 字符: {result_text[:500]}")
            
            # 使用安全的 JSON 解析
            parsed = self._safe_parse_json(result_text)
            
            if not parsed:
                logger.warning(f"标签映射：JSON 解析失败，返回空映射。原始返回长度: {len(result_text)}")
                # 记录更多调试信息
                if len(result_text) > 1000:
                    logger.warning(f"原始返回前 1000 字符: {result_text[:1000]}")
                else:
                    logger.warning(f"完整原始返回: {result_text}")
                return {}
            
            # 转换为统一格式
            mappings = {}
            for label_type, type_mappings in parsed.items():
                if not isinstance(type_mappings, dict):
                    continue
                mappings[label_type] = []
                for project_label_name, product_mappings in type_mappings.items():
                    if not isinstance(product_mappings, list):
                        continue
                    for pm in product_mappings:
                        if isinstance(pm, dict):
                            mappings[label_type].append({
                                "project_label_name": project_label_name,
                                "product_id": pm.get("product_id"),
                                "product_label_name": pm.get("label_name")
                            })
            
            return mappings
            
        except Exception as e:
            logger.error(f"标签映射 AI 调用失败: {e}")
            return {}
    
    async def _save_project_learning_result(
        self,
        project_id: UUID,
        product_ids: List[UUID],
        project_dimensions: Dict[str, List[Dict]],
        project_labels: Dict[str, List[Dict]],
        dimension_mappings: Dict[str, List[Dict]],
        label_mappings: Dict[str, List[Dict]],
        products_data: Dict[str, Dict]
    ):
        """存储项目级学习结果到数据库"""
        
        # 先清除旧数据
        await self.db.execute(
            delete(ProjectDimension).where(ProjectDimension.project_id == project_id)
        )
        await self.db.execute(
            delete(ProjectContextLabel).where(ProjectContextLabel.project_id == project_id)
        )
        
        # 构建产品维度/标签的名称 -> ID 映射
        product_dim_id_map = {}  # {product_id: {name: dimension_id}}
        product_label_id_map = {}  # {product_id: {type: {name: label_id}}}
        
        for product_id_str, data in products_data.items():
            product_dim_id_map[product_id_str] = {}
            for dim_type, dims in data.get('dimensions', {}).items():
                for d in dims:
                    product_dim_id_map[product_id_str][d['name']] = d['id']
            
            product_label_id_map[product_id_str] = {}
            for label_type, labels in data.get('labels', {}).items():
                product_label_id_map[product_id_str][label_type] = {}
                for l in labels:
                    product_label_id_map[product_id_str][label_type][l['name']] = l['id']
        
        # 保存项目级维度
        project_dim_id_map = {}  # {dim_type: {name: project_dim_id}}
        for dim_type, dims in project_dimensions.items():
            project_dim_id_map[dim_type] = {}
            for dim_data in dims:
                project_dim = ProjectDimension(
                    project_id=project_id,
                    name=dim_data['name'],
                    description=dim_data.get('description', ''),
                    dimension_type=dim_type,
                    is_ai_generated=True
                )
                self.db.add(project_dim)
                await self.db.flush()
                project_dim_id_map[dim_type][dim_data['name']] = project_dim.id
        
        # 保存维度映射
        for dim_type, mappings in dimension_mappings.items():
            for mapping in mappings:
                project_dim_name = mapping.get('project_dimension_name')
                product_id_str = mapping.get('product_id')
                product_dim_name = mapping.get('product_dimension_name')
                
                project_dim_id = project_dim_id_map.get(dim_type, {}).get(project_dim_name)
                product_dim_id = product_dim_id_map.get(product_id_str, {}).get(product_dim_name)
                
                if project_dim_id and product_dim_id:
                    dim_mapping = ProjectDimensionMapping(
                        project_dimension_id=project_dim_id,
                        product_dimension_id=UUID(product_dim_id),
                        product_id=UUID(product_id_str)
                    )
                    self.db.add(dim_mapping)
        
        # 保存项目级标签
        project_label_id_map = {}  # {label_type: {name: project_label_id}}
        for label_type, labels in project_labels.items():
            project_label_id_map[label_type] = {}
            for label_data in labels:
                project_label = ProjectContextLabel(
                    project_id=project_id,
                    type=label_type,
                    name=label_data['name'],
                    description=label_data.get('description', ''),
                    is_ai_generated=True
                )
                self.db.add(project_label)
                await self.db.flush()
                project_label_id_map[label_type][label_data['name']] = project_label.id
        
        # 保存标签映射
        for label_type, mappings in label_mappings.items():
            for mapping in mappings:
                project_label_name = mapping.get('project_label_name')
                product_id_str = mapping.get('product_id')
                product_label_name = mapping.get('product_label_name')
                
                project_label_id = project_label_id_map.get(label_type, {}).get(project_label_name)
                product_label_id = (
                    product_label_id_map
                    .get(product_id_str, {})
                    .get(label_type, {})
                    .get(product_label_name)
                )
                
                if project_label_id and product_label_id:
                    label_mapping = ProjectLabelMapping(
                        project_label_id=project_label_id,
                        product_label_id=UUID(product_label_id),
                        product_id=UUID(product_id_str)
                    )
                    self.db.add(label_mapping)
        
        await self.db.commit()
        logger.info(f"✅ 项目级学习结果已保存到数据库")
    
    async def check_products_analysis_status(
        self,
        product_ids: List[UUID]
    ) -> Dict[str, Dict]:
        """
        检查多个产品的分析完成状态
        
        市场洞察需要所有产品都已完成分析（有维度和标签）
        """
        result = {}
        
        for product_id in product_ids:
            # 检查是否有维度
            dim_count = await self.db.execute(
                select(func.count(ProductDimension.id))
                .where(ProductDimension.product_id == product_id)
            )
            has_dimensions = (dim_count.scalar() or 0) > 0
            
            # 检查是否有标签
            label_count = await self.db.execute(
                select(func.count(ProductContextLabel.id))
                .where(ProductContextLabel.product_id == product_id)
            )
            has_labels = (label_count.scalar() or 0) > 0
            
            # 获取产品信息
            product_result = await self.db.execute(
                select(Product.asin, Product.title)
                .where(Product.id == product_id)
            )
            product = product_result.first()
            
            result[str(product_id)] = {
                "asin": product.asin if product else "Unknown",
                "title": product.title if product else "Unknown",
                "has_dimensions": has_dimensions,
                "has_labels": has_labels,
                "is_ready": has_dimensions and has_labels
            }
        
        return result
    
    async def get_incomplete_products(
        self,
        product_ids: List[UUID]
    ) -> List[Dict]:
        """获取未完成分析的产品列表"""
        status = await self.check_products_analysis_status(product_ids)
        incomplete = [
            {"product_id": pid, **info}
            for pid, info in status.items()
            if not info["is_ready"]
        ]
        return incomplete
