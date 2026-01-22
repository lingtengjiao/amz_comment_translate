"""
维度总结服务 (Dimension Summary Service)

负责生成中观层AI分析内容：
- 5W主题总结
- 产品维度总结
- 情感/场景维度总结
- 消费者原型
- 整体数据总结
"""
import json
import logging
from typing import Dict, List, Any, Optional
from uuid import UUID
from collections import defaultdict

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Product, Review, ReviewInsight, ReviewThemeHighlight,
    ProductDimension, ProductContextLabel,
    ProductDimensionSummary, DimensionSummaryType
)
from app.services.translation import translation_service
from app.core.config import settings
from openai import OpenAI

logger = logging.getLogger(__name__)


class DimensionSummaryService:
    """维度总结服务 - 生成中观层AI分析"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        # 使用translation_service的client，如果没有则创建新的
        if translation_service.client:
            self.client = translation_service.client
        else:
            self.client = OpenAI(
                api_key=settings.QWEN_API_KEY,
                base_url=settings.QWEN_API_BASE,
                timeout=120.0,
            )
        self.model = settings.QWEN_MODEL
    
    def _generate_text(self, prompt: str, max_tokens: int = 500) -> str:
        """调用AI生成文本（同步方法）"""
        if not self.client:
            raise RuntimeError("AI服务未配置")
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一个专业的产品分析专家，擅长从用户评论中提炼洞察。请用简洁、专业的语言输出分析结果。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=max_tokens,
                timeout=60.0,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"AI生成文本失败: {e}")
            raise
    
    async def generate_all_summaries(self, product_id: UUID) -> Dict[str, Any]:
        """生成产品的所有维度总结"""
        logger.info(f"开始生成产品维度总结: {product_id}")
        
        # 获取产品
        product = await self._get_product(product_id)
        if not product:
            raise ValueError(f"产品不存在: {product_id}")
        
        # 收集所有需要的数据
        data = await self._collect_data(product_id)
        
        results = {
            "theme_summaries": [],
            "dimension_summaries": [],
            "emotion_summaries": [],
            "scenario_summaries": [],
            "consumer_personas": [],
            "overall_summary": None,
        }
        
        # 1. 生成5W主题总结
        for theme_type in ["buyer", "user", "where", "when", "why", "what"]:
            if data["themes"].get(theme_type):
                summary = await self._generate_theme_summary(
                    product_id, theme_type, data["themes"][theme_type], product
                )
                if summary:
                    results["theme_summaries"].append(summary)
        
        # 2. 生成产品维度总结
        for dim_name, dim_data in data["dimensions"].items():
            if dim_data["total"] > 0:
                summary = await self._generate_dimension_summary(
                    product_id, dim_name, dim_data, product
                )
                if summary:
                    results["dimension_summaries"].append(summary)
        
        # 3. 生成情感维度总结
        for emotion_name, items in data["emotions"].items():
            if items:
                summary = await self._generate_emotion_summary(
                    product_id, emotion_name, items, product
                )
                if summary:
                    results["emotion_summaries"].append(summary)
        
        # 4. 生成场景维度总结
        for scenario_name, items in data["scenarios"].items():
            if items:
                summary = await self._generate_scenario_summary(
                    product_id, scenario_name, items, product
                )
                if summary:
                    results["scenario_summaries"].append(summary)
        
        # 5. 生成消费者原型（基于5W交叉分析）
        personas = await self._generate_consumer_personas(
            product_id, data["themes"], data["review_count"], product
        )
        results["consumer_personas"] = personas
        
        # 6. 生成整体数据总结
        overall = await self._generate_overall_summary(product_id, data, product)
        results["overall_summary"] = overall
        
        logger.info(f"维度总结生成完成: {product_id}")
        return results
    
    async def _get_product(self, product_id: UUID) -> Optional[Product]:
        """获取产品"""
        result = await self.db.execute(
            select(Product).where(Product.id == product_id)
        )
        return result.scalar_one_or_none()
    
    async def _collect_data(self, product_id: UUID) -> Dict[str, Any]:
        """收集产品的所有分析数据"""
        # 获取评论
        reviews_result = await self.db.execute(
            select(Review).where(Review.product_id == product_id)
        )
        reviews = list(reviews_result.scalars().all())
        review_ids = [r.id for r in reviews]
        
        # 获取洞察
        insights_result = await self.db.execute(
            select(ReviewInsight).where(ReviewInsight.review_id.in_(review_ids))
        )
        insights = list(insights_result.scalars().all())
        
        # 获取主题
        themes_result = await self.db.execute(
            select(ReviewThemeHighlight).where(ReviewThemeHighlight.review_id.in_(review_ids))
        )
        themes = list(themes_result.scalars().all())
        
        # 聚合主题数据
        theme_data = defaultdict(lambda: defaultdict(lambda: {"count": 0, "items": []}))
        for t in themes:
            if t.theme_type and t.label_name:
                theme_data[t.theme_type][t.label_name]["count"] += 1
                theme_data[t.theme_type][t.label_name]["items"].append({
                    "quote": t.quote,
                    "quote_translated": t.quote_translated,
                    "explanation": t.explanation,
                })
        
        # 转换为列表格式
        themes_aggregated = {}
        for theme_type, labels in theme_data.items():
            themes_aggregated[theme_type] = [
                {"label": label, "count": data["count"], "items": data["items"][:3]}
                for label, data in sorted(labels.items(), key=lambda x: x[1]["count"], reverse=True)
            ]
        
        # 聚合维度洞察
        dimensions = defaultdict(lambda: {"strengths": [], "weaknesses": [], "suggestions": [], "total": 0})
        emotions = defaultdict(list)
        scenarios = defaultdict(list)
        
        for insight in insights:
            dim = insight.dimension or "其他"
            item = {
                "quote": insight.quote,
                "quote_translated": insight.quote_translated,
                "analysis": insight.analysis,
            }
            
            if insight.insight_type == "strength":
                dimensions[dim]["strengths"].append(item)
                dimensions[dim]["total"] += 1
            elif insight.insight_type == "weakness":
                dimensions[dim]["weaknesses"].append(item)
                dimensions[dim]["total"] += 1
            elif insight.insight_type == "suggestion":
                dimensions[dim]["suggestions"].append(item)
                dimensions[dim]["total"] += 1
            elif insight.insight_type == "emotion":
                emotions[dim].append(item)
            elif insight.insight_type == "scenario":
                scenarios[dim].append(item)
        
        return {
            "review_count": len(reviews),
            "themes": themes_aggregated,
            "dimensions": dict(dimensions),
            "emotions": dict(emotions),
            "scenarios": dict(scenarios),
        }
    
    async def _generate_theme_summary(
        self, product_id: UUID, theme_type: str, 
        labels: List[Dict], product: Product
    ) -> Optional[Dict]:
        """生成5W主题总结 - 结构化JSON输出"""
        if not labels:
            return None
        
        theme_names = {
            "buyer": "购买者画像",
            "user": "使用者画像",
            "where": "购买/使用地点",
            "when": "购买/使用时机",
            "why": "购买动机",
            "what": "产品用途",
        }
        
        # 构建prompt - 要求JSON输出
        labels_text = "\n".join([
            f"- {l['label']}: {l['count']}次提及"
            for l in labels[:10]
        ])
        
        prompt = f"""请分析以下产品用户画像数据，生成结构化的总结洞察。

产品：{product.title or product.asin}
分析维度：{theme_names.get(theme_type, theme_type)}

标签统计：
{labels_text}

请以JSON格式输出分析结果，格式如下：
{{
  "key_insight": "核心发现（一句话，指出最主要的群体/特征及其占比）",
  "pattern": "模式趋势（发现的有趣模式或趋势，一句话）",
  "recommendation": "营销建议（对产品营销或定位的具体启示，一句话）"
}}

只输出JSON，不要其他内容。"""

        try:
            response = self._generate_text(prompt, max_tokens=400)
            
            # 解析JSON
            structured_data = None
            summary_text = response.strip()
            try:
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    clean_response = clean_response.split("```")[1]
                    if clean_response.startswith("json"):
                        clean_response = clean_response[4:]
                structured_data = json.loads(clean_response.strip())
                # 拼接为完整文本
                summary_text = f"{structured_data.get('key_insight', '')} {structured_data.get('pattern', '')} {structured_data.get('recommendation', '')}"
            except json.JSONDecodeError:
                logger.warning(f"主题总结JSON解析失败，使用原文: {theme_type}")
                structured_data = {"raw": response.strip()}
            
            # 保存到数据库
            key_points_data = [{"label": l["label"], "count": l["count"]} for l in labels[:5]]
            if structured_data:
                key_points_data.append({"structured": structured_data})
            
            summary = ProductDimensionSummary(
                product_id=product_id,
                summary_type=f"theme_{theme_type}",
                category=theme_type,
                title=theme_names.get(theme_type, theme_type),
                summary=summary_text,
                evidence_count=sum(l["count"] for l in labels),
                key_points=key_points_data,
                ai_model="qwen-max",
            )
            
            # 先删除旧的
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == f"theme_{theme_type}",
                )
            )
            
            self.db.add(summary)
            await self.db.commit()
            
            return summary.to_dict()
        except Exception as e:
            logger.error(f"生成主题总结失败: {theme_type}, {e}")
            return None
    
    async def _generate_dimension_summary(
        self, product_id: UUID, dim_name: str,
        dim_data: Dict, product: Product
    ) -> Optional[Dict]:
        """生成产品维度总结 - 结构化JSON输出"""
        strengths = dim_data.get("strengths", [])
        weaknesses = dim_data.get("weaknesses", [])
        suggestions = dim_data.get("suggestions", [])
        
        if not (strengths or weaknesses or suggestions):
            return None
        
        # 构建prompt - 要求JSON输出
        strengths_text = "\n".join([f"- {s['analysis']}" for s in strengths[:5]])
        weaknesses_text = "\n".join([f"- {w['analysis']}" for w in weaknesses[:5]])
        suggestions_text = "\n".join([f"- {s['analysis']}" for s in suggestions[:5]])
        
        prompt = f"""请分析以下产品维度的评价数据，生成结构化的维度总结。

产品：{product.title or product.asin}
分析维度：{dim_name}

【产品优势】({len(strengths)}条)
{strengths_text if strengths_text else "暂无"}

【改进空间】({len(weaknesses)}条)
{weaknesses_text if weaknesses_text else "暂无"}

【用户建议】({len(suggestions)}条)
{suggestions_text if suggestions_text else "暂无"}

请以JSON格式输出分析结果，格式如下：
{{
  "overall": "整体评价（一句话概括用户对该维度的整体看法，如正面/负面/两极分化）",
  "pros_highlight": "突出优点（最值得称赞的1-2个优点，简洁描述）",
  "cons_highlight": "主要问题（最需要关注的1-2个问题，简洁描述）",
  "suggestion": "改进建议（基于用户反馈的具体改进方向，一句话）"
}}

只输出JSON，不要其他内容。"""

        try:
            response = self._generate_text(prompt, max_tokens=400)
            
            # 解析JSON
            structured_data = None
            summary_text = response.strip()
            try:
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    clean_response = clean_response.split("```")[1]
                    if clean_response.startswith("json"):
                        clean_response = clean_response[4:]
                structured_data = json.loads(clean_response.strip())
                # 拼接为完整文本
                summary_text = f"{structured_data.get('overall', '')} {structured_data.get('pros_highlight', '')} {structured_data.get('cons_highlight', '')} {structured_data.get('suggestion', '')}"
            except json.JSONDecodeError:
                logger.warning(f"维度总结JSON解析失败，使用原文: {dim_name}")
                structured_data = {"raw": response.strip()}
            
            # 判断情感倾向
            pos_count = len(strengths)
            neg_count = len(weaknesses)
            if pos_count > neg_count * 2:
                tendency = "positive"
            elif neg_count > pos_count * 2:
                tendency = "negative"
            elif pos_count > 0 and neg_count > 0:
                tendency = "mixed"
            else:
                tendency = "neutral"
            
            key_points_data = [
                {"type": "strengths", "count": len(strengths)},
                {"type": "weaknesses", "count": len(weaknesses)},
                {"type": "suggestions", "count": len(suggestions)},
            ]
            if structured_data:
                key_points_data.append({"structured": structured_data})
            
            summary = ProductDimensionSummary(
                product_id=product_id,
                summary_type="dimension",
                category=dim_name,
                title=dim_name,
                summary=summary_text,
                evidence_count=dim_data["total"],
                key_points=key_points_data,
                sentiment_tendency=tendency,
                ai_model="qwen-max",
            )
            
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == "dimension",
                    ProductDimensionSummary.category == dim_name,
                )
            )
            
            self.db.add(summary)
            await self.db.commit()
            
            return summary.to_dict()
        except Exception as e:
            logger.error(f"生成维度总结失败: {dim_name}, {e}")
            return None
    
    async def _generate_emotion_summary(
        self, product_id: UUID, emotion_name: str,
        items: List[Dict], product: Product
    ) -> Optional[Dict]:
        """生成情感维度总结"""
        if not items:
            return None
        
        analyses = "\n".join([f"- {i['analysis']}" for i in items[:5]])
        
        prompt = f"""请分析以下产品的情感维度数据。

产品：{product.title or product.asin}
情感类型：{emotion_name}
提及次数：{len(items)}

具体表述：
{analyses}

请用1-2句话总结用户在这个情感维度上的核心感受。直接输出总结。"""

        try:
            response = self._generate_text(prompt, max_tokens=200)
            
            summary = ProductDimensionSummary(
                product_id=product_id,
                summary_type="emotion",
                category=emotion_name,
                title=emotion_name,
                summary=response.strip(),
                evidence_count=len(items),
                ai_model="qwen-max",
            )
            
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == "emotion",
                    ProductDimensionSummary.category == emotion_name,
                )
            )
            
            self.db.add(summary)
            await self.db.commit()
            
            return summary.to_dict()
        except Exception as e:
            logger.error(f"生成情感总结失败: {emotion_name}, {e}")
            return None
    
    async def _generate_scenario_summary(
        self, product_id: UUID, scenario_name: str,
        items: List[Dict], product: Product
    ) -> Optional[Dict]:
        """生成场景维度总结"""
        if not items:
            return None
        
        analyses = "\n".join([f"- {i['analysis']}" for i in items[:5]])
        
        prompt = f"""请分析以下产品的使用场景数据。

产品：{product.title or product.asin}
场景类型：{scenario_name}
提及次数：{len(items)}

具体表述：
{analyses}

请用1-2句话总结用户在这个场景下的使用情况和反馈。直接输出总结。"""

        try:
            response = self._generate_text(prompt, max_tokens=200)
            
            summary = ProductDimensionSummary(
                product_id=product_id,
                summary_type="scenario",
                category=scenario_name,
                title=scenario_name,
                summary=response.strip(),
                evidence_count=len(items),
                ai_model="qwen-max",
            )
            
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == "scenario",
                    ProductDimensionSummary.category == scenario_name,
                )
            )
            
            self.db.add(summary)
            await self.db.commit()
            
            return summary.to_dict()
        except Exception as e:
            logger.error(f"生成场景总结失败: {scenario_name}, {e}")
            return None
    
    async def _generate_consumer_personas(
        self, product_id: UUID, themes: Dict,
        review_count: int, product: Product
    ) -> List[Dict]:
        """生成消费者原型（3-5个）"""
        if not themes:
            return []
        
        # 构建5W数据
        theme_summary = []
        for theme_type in ["buyer", "user", "where", "when", "why", "what"]:
            labels = themes.get(theme_type, [])
            if labels:
                top_labels = ", ".join([f"{l['label']}({l['count']})" for l in labels[:3]])
                theme_summary.append(f"{theme_type}: {top_labels}")
        
        if not theme_summary:
            return []
        
        prompt = f"""请基于以下产品的5W用户画像数据，提炼出3-5个典型的消费者原型。

产品：{product.title or product.asin}
评论数量：{review_count}

5W数据：
{chr(10).join(theme_summary)}

请生成3-5个消费者原型，每个原型包含：
1. 一个简短的原型名称（如"新手宝妈"、"送礼达人"等）
2. 一句话描述这个原型的特征组合
3. 对应的5W标签组合

请以JSON格式输出，格式如下：
[
  {{
    "name": "原型名称",
    "description": "一句话描述",
    "tags": {{"buyer": "标签", "user": "标签", "why": "标签", ...}}
  }}
]

只输出JSON，不要其他内容。"""

        try:
            response = self._generate_text(prompt, max_tokens=800)
            
            # 解析JSON
            try:
                # 清理可能的markdown代码块
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    clean_response = clean_response.split("```")[1]
                    if clean_response.startswith("json"):
                        clean_response = clean_response[4:]
                
                personas_data = json.loads(clean_response.strip())
            except json.JSONDecodeError:
                logger.error(f"消费者原型JSON解析失败: {response}")
                return []
            
            # 先删除旧的
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == "consumer_persona",
                )
            )
            
            results = []
            for i, persona in enumerate(personas_data[:5]):
                summary = ProductDimensionSummary(
                    product_id=product_id,
                    summary_type="consumer_persona",
                    category=f"persona_{i+1}",
                    title=persona.get("name", f"原型{i+1}"),
                    summary=persona.get("description", ""),
                    persona_data=persona.get("tags", {}),
                    ai_model="qwen-max",
                )
                self.db.add(summary)
                results.append(summary.to_dict())
            
            await self.db.commit()
            return results
        except Exception as e:
            logger.error(f"生成消费者原型失败: {e}")
            return []
    
    async def _generate_overall_summary(
        self, product_id: UUID, data: Dict, product: Product
    ) -> Optional[Dict]:
        """生成整体数据总结 - 结构化JSON输出"""
        # 构建综合数据
        themes_summary = []
        for theme_type in ["buyer", "user", "where", "when", "why", "what"]:
            labels = data["themes"].get(theme_type, [])
            if labels:
                top = labels[0]["label"] if labels else "无"
                themes_summary.append(f"{theme_type}: {top}")
        
        dimensions_summary = []
        for dim_name, dim_data in list(data["dimensions"].items())[:5]:
            s = len(dim_data.get("strengths", []))
            w = len(dim_data.get("weaknesses", []))
            dimensions_summary.append(f"{dim_name}: {s}优/{w}劣")
        
        prompt = f"""请为以下产品生成结构化的整体数据总结。

产品：{product.title or product.asin}
评论数量：{data['review_count']}

用户画像摘要：
{', '.join(themes_summary)}

产品维度摘要：
{', '.join(dimensions_summary)}

情感维度数量：{len(data['emotions'])}个类别
场景维度数量：{len(data['scenarios'])}个类别

请以JSON格式输出分析结果，格式如下：
{{
  "target_users": "核心用户群体（简洁描述主要购买者和使用者，一句话）",
  "usage_scenario": "典型使用场景（什么情况下购买/使用，一句话）",
  "main_pros": "主要优势（产品最受好评的2-3个方面，简洁）",
  "main_cons": "主要问题（用户最常抱怨的2-3个问题，简洁）",
  "recommendation": "改进建议（最值得优先改进的方向，一句话）"
}}

只输出JSON，不要其他内容。"""

        try:
            response = self._generate_text(prompt, max_tokens=500)
            
            # 解析JSON
            structured_data = None
            summary_text = response.strip()
            try:
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    clean_response = clean_response.split("```")[1]
                    if clean_response.startswith("json"):
                        clean_response = clean_response[4:]
                structured_data = json.loads(clean_response.strip())
                # 拼接为完整文本
                parts = [
                    structured_data.get('target_users', ''),
                    structured_data.get('usage_scenario', ''),
                    f"优势：{structured_data.get('main_pros', '')}",
                    f"问题：{structured_data.get('main_cons', '')}",
                    f"建议：{structured_data.get('recommendation', '')}"
                ]
                summary_text = " ".join([p for p in parts if p])
            except json.JSONDecodeError:
                logger.warning(f"整体总结JSON解析失败，使用原文")
                structured_data = {"raw": response.strip()}
            
            key_points_data = []
            if structured_data:
                key_points_data.append({"structured": structured_data})
            
            summary = ProductDimensionSummary(
                product_id=product_id,
                summary_type="overall",
                category=None,
                title="整体数据总结",
                summary=summary_text,
                evidence_count=data["review_count"],
                key_points=key_points_data,
                ai_model="qwen-max",
            )
            
            await self.db.execute(
                delete(ProductDimensionSummary).where(
                    ProductDimensionSummary.product_id == product_id,
                    ProductDimensionSummary.summary_type == "overall",
                )
            )
            
            self.db.add(summary)
            await self.db.commit()
            
            return summary.to_dict()
        except Exception as e:
            logger.error(f"生成整体总结失败: {e}")
            return None
