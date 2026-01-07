"""
Analysis Service - 对比分析服务模块

核心功能：
1. 创建对比分析项目
2. 并行聚合多产品数据
3. 构建专用的对比分析 Prompt
4. 调用 AI 生成对比报告
5. 持久化存储分析结果

设计原则：
1. 复用 SummaryService 的聚合能力，但保持独立
2. 异步任务支持，前端可轮询状态
3. 快照机制保证历史数据可追溯
"""
import logging
import json
from uuid import UUID
from typing import List, Dict, Any, Optional

from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.analysis import (
    AnalysisProject, 
    AnalysisProjectItem, 
    AnalysisStatus, 
    AnalysisType
)
from app.models.product import Product
from app.services.summary_service import SummaryService
from app.services.translation import translation_service

logger = logging.getLogger(__name__)


# ==========================================
# [PROMPT] 对比分析专用 Prompt
# ==========================================

COMPARISON_PROMPT_JSON = """你是一位**高级竞品分析专家**。请基于以下产品的对比数据，生成一份深度的《竞品对比分析报告》(JSON)。

# 核心目标
识别产品的差异化优势(Competitive Edge)与劣势，指导差异化打法。

# 输入数据 (JSON格式)
{stats_json}

# 产品信息
{product_info}

# 必填字段 (JSON Key)

## 1. 总体评判
1. "overview_verdict": (String) 300字以内的综合胜负定调。
   - 明确指出哪个产品整体更优
   - 总结核心差异点
   - 给出战略建议

## 2. 维度对比矩阵
2. "feature_matrix": (Array) 核心维度的横向对比矩阵。
   格式: [
     {{
       "dimension": "电池续航",
       "winner": "Product A",
       "score_gap": "A(85分) vs B(60分)",
       "product_a_summary": "A产品电池持久，用户普遍满意",
       "product_b_summary": "B产品续航较短，多次被提及需要改进",
       "analysis": "A产品采用更大容量电池，在实际使用中续航表现明显优于B产品"
     }},
     ...
   ]
   *注：至少包含 5 个关键维度的对比*

## 3. 人群画像差异
3. "audience_diff": (Object) 人群画像差异分析。
   格式: {{
     "product_a_audience": {{
       "core_users": "主要用户群体描述",
       "usage_scenarios": "典型使用场景",
       "purchase_motivation": "购买动机"
     }},
     "product_b_audience": {{
       "core_users": "主要用户群体描述",
       "usage_scenarios": "典型使用场景",
       "purchase_motivation": "购买动机"
     }},
     "overlap_analysis": "人群重叠与差异分析",
     "market_insight": "市场定位洞察"
   }}

## 4. SWOT 对比
4. "swot_comparison": (Object) 针对两个产品的综合 SWOT 分析。
   格式: {{
     "product_a": {{
       "strengths": ["优势1", "优势2"],
       "weaknesses": ["劣势1", "劣势2"],
       "opportunities": ["机会1"],
       "threats": ["威胁1"]
     }},
     "product_b": {{
       "strengths": ["优势1", "优势2"],
       "weaknesses": ["劣势1", "劣势2"],
       "opportunities": ["机会1"],
       "threats": ["威胁1"]
     }}
   }}

## 5. 口碑热词对比
5. "sentiment_comparison": (Object) 用户口碑热词对比。
   格式: {{
     "product_a_positive_keywords": ["好评关键词1", "好评关键词2"],
     "product_a_negative_keywords": ["差评关键词1", "差评关键词2"],
     "product_b_positive_keywords": ["好评关键词1", "好评关键词2"],
     "product_b_negative_keywords": ["差评关键词1", "差评关键词2"],
     "insight": "口碑差异分析总结"
   }}

## 6. 行动建议
6. "actionable_advice": (Array) 给产品经理的 5 条具体建议。
   格式: [
     {{
       "priority": "High/Medium/Low",
       "category": "产品/营销/供应链",
       "advice": "具体建议内容",
       "expected_impact": "预期影响"
     }},
     ...
   ]

## 7. 结论
7. "final_conclusion": (String) 200字以内的最终结论，包含：
   - 推荐选择哪个产品（如果是竞品对比）
   - 或哪个版本更优（如果是迭代对比）
   - 核心决策依据

# 输出要求
- 严禁包含 Markdown 标记，仅输出合法 JSON
- 使用中文输出
- 分析要客观、数据驱动
- 每个结论都需要有数据支撑
"""


class AnalysisService:
    """
    对比分析服务
    
    职责：
    1. 管理分析项目的生命周期
    2. 聚合多产品的评论数据
    3. 调用 AI 生成对比分析报告
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        # 复用 SummaryService 的聚合能力
        self.summary_service = SummaryService(db)

    # ==========================================
    # 项目管理
    # ==========================================
    
    async def create_comparison_project(
        self, 
        title: str, 
        product_ids: List[UUID],
        role_labels: Optional[List[str]] = None,
        description: Optional[str] = None
    ) -> AnalysisProject:
        """
        创建对比分析项目
        
        Args:
            title: 项目标题
            product_ids: 产品 ID 列表（至少 2 个）
            role_labels: 产品角色标签列表（可选，如 ["target", "competitor"]）
            description: 项目描述
            
        Returns:
            AnalysisProject 对象
        """
        if len(product_ids) < 2:
            raise ValueError("对比分析至少需要 2 个产品")
        
        if len(product_ids) > 5:
            raise ValueError("对比分析最多支持 5 个产品")

        # 验证产品是否存在
        for pid in product_ids:
            product = await self.db.get(Product, pid)
            if not product:
                raise ValueError(f"产品不存在: {pid}")

        # 1. 创建 Project
        project = AnalysisProject(
            title=title,
            description=description,
            analysis_type=AnalysisType.COMPARISON.value,
            status=AnalysisStatus.PENDING.value
        )
        self.db.add(project)
        await self.db.flush()  # 获取 project.id

        # 2. 创建 Items
        for i, pid in enumerate(product_ids):
            # 确定角色标签
            if role_labels and i < len(role_labels):
                role = role_labels[i]
            else:
                # 默认第一个是 target，其余是 competitor
                role = "target" if i == 0 else "competitor"
            
            item = AnalysisProjectItem(
                project_id=project.id,
                product_id=pid,
                role_label=role,
                display_order=i
            )
            self.db.add(item)
        
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def get_project(self, project_id: UUID) -> Optional[AnalysisProject]:
        """获取项目详情"""
        stmt = (
            select(AnalysisProject)
            .options(selectinload(AnalysisProject.items).selectinload(AnalysisProjectItem.product))
            .where(AnalysisProject.id == project_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_projects(
        self, 
        limit: int = 20, 
        offset: int = 0,
        status: Optional[str] = None
    ) -> List[AnalysisProject]:
        """获取项目列表"""
        stmt = (
            select(AnalysisProject)
            .options(selectinload(AnalysisProject.items).selectinload(AnalysisProjectItem.product))
            .order_by(desc(AnalysisProject.created_at))
            .limit(limit)
            .offset(offset)
        )
        
        if status:
            stmt = stmt.where(AnalysisProject.status == status)
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_project(self, project_id: UUID) -> bool:
        """删除项目"""
        project = await self.db.get(AnalysisProject, project_id)
        if not project:
            return False
        
        await self.db.delete(project)
        await self.db.commit()
        return True

    # ==========================================
    # 分析执行
    # ==========================================
    
    async def run_analysis(self, project_id: UUID) -> AnalysisProject:
        """
        执行分析任务（耗时操作）
        
        流程：
        1. 加载项目和关联产品
        2. 并行聚合每个产品的数据
        3. 构建对比 Prompt
        4. 调用 AI 生成报告
        5. 保存结果
        """
        project = await self.get_project(project_id)
        if not project:
            raise ValueError("项目不存在")
        
        if not project.items or len(project.items) < 2:
            raise ValueError("项目缺少有效的产品关联")

        try:
            # 更新状态为处理中
            project.status = AnalysisStatus.PROCESSING.value
            await self.db.commit()

            # 1. 并行聚合每个产品的数据
            comparison_map = {}
            product_info_list = []
            
            for item in project.items:
                product = item.product
                product_id = item.product_id
                
                # 获取产品名称（用于报告中的标识）
                product_name = product.title_translated or product.title or f"Product_{product.asin}"
                
                # 复用 summary_service 的聚合逻辑
                context_stats = await self.summary_service._aggregate_5w_stats(product_id)
                insight_stats = await self.summary_service._aggregate_insight_stats(product_id)
                
                # 精简数据：只取 Top 8 喂给 AI，防止 Context Window 爆炸
                comparison_map[product_name] = {
                    "role": item.role_label,
                    "asin": product.asin,
                    "context_top": self._simplify_stats(context_stats),
                    "insight_top": self._simplify_stats(insight_stats)
                }
                
                product_info_list.append(f"- {product_name} (ASIN: {product.asin}, 角色: {item.role_label or 'N/A'})")

            # 2. 保存原始数据快照
            project.raw_data_snapshot = comparison_map
            
            # 3. 构建 Prompt
            stats_json_str = json.dumps(comparison_map, ensure_ascii=False, indent=2)
            product_info_str = "\n".join(product_info_list)
            
            final_prompt = COMPARISON_PROMPT_JSON.format(
                stats_json=stats_json_str,
                product_info=product_info_str
            )

            # 4. 调用 AI
            if not translation_service.client:
                raise ValueError("AI 服务未配置（缺少 API Key）")
            
            logger.info(f"Generating comparison analysis for project {project_id}...")
            
            response = translation_service.client.chat.completions.create(
                model=translation_service.model,
                messages=[
                    {"role": "system", "content": "You are a competitive analysis expert. Output JSON only. Always respond in Chinese."},
                    {"role": "user", "content": final_prompt}
                ],
                temperature=0.4,
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
            
            ai_content = response.choices[0].message.content
            
            # 清洗 & 校验
            clean_json = ai_content.replace("```json", "").replace("```", "").strip()
            
            try:
                result_data = json.loads(clean_json)
                logger.info(f"成功解析对比分析 JSON，共 {len(result_data)} 个顶级字段")
            except json.JSONDecodeError as e:
                logger.error(f"AI 输出 JSON 解析失败: {e}")
                result_data = {
                    "error": "AI 输出格式错误",
                    "raw_content": ai_content[:1000]
                }

            # 5. 更新结果
            project.result_content = result_data
            project.status = AnalysisStatus.COMPLETED.value
            project.error_message = None
            
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            project.status = AnalysisStatus.FAILED.value
            project.error_message = str(e)
        
        await self.db.commit()
        await self.db.refresh(project)
        return project

    def _simplify_stats(self, data: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        """
        辅助：简化统计数据，去掉冗余的 evidence，只保留 name/value/percent
        目的：减少 Token 消耗
        """
        simplified = {}
        
        for category, content in data.items():
            # content 结构: {"total_count": 100, "items": [...]}
            if not isinstance(content, dict):
                continue
            
            items = content.get("items", [])
            # 只取 Top 5，且不要 evidence 字段
            simple_items = []
            for item in items[:5]:
                if isinstance(item, dict):
                    simple_items.append({
                        "name": item.get("name"),
                        "val": item.get("value"),
                        "pct": item.get("percent")
                    })
            
            simplified[category] = simple_items
        
        return simplified

    # ==========================================
    # 预览与查询
    # ==========================================
    
    async def get_comparison_preview(self, product_ids: List[UUID]) -> Dict[str, Any]:
        """
        获取对比预览数据（不调用 AI，仅返回聚合数据）
        
        用于前端展示对比前的数据预览
        """
        if len(product_ids) < 2:
            raise ValueError("对比分析至少需要 2 个产品")
        
        preview_data = {}
        
        for pid in product_ids:
            product = await self.db.get(Product, pid)
            if not product:
                continue
            
            product_name = product.title_translated or product.title or product.asin
            
            # 获取评论数
            total_reviews = await self.summary_service._count_translated_reviews(pid)
            
            # 获取统计数据
            context_stats = await self.summary_service._aggregate_5w_stats(pid)
            insight_stats = await self.summary_service._aggregate_insight_stats(pid)
            
            preview_data[str(pid)] = {
                "product": {
                    "id": str(product.id),
                    "asin": product.asin,
                    "title": product_name,
                    "image_url": product.image_url,
                    "marketplace": product.marketplace
                },
                "total_reviews": total_reviews,
                "context": context_stats,
                "insight": insight_stats
            }
        
        return {
            "success": True,
            "products": preview_data,
            "can_compare": len(preview_data) >= 2
        }

