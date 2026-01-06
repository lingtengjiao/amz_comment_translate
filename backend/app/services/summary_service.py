"""
Summary Service - 智能报告生成模块 (Report Generation Module)

核心功能：
1. 数据聚合 (Data Gathering): 从数据库中聚合 Insights（维度数据）和 ThemeHighlights（5W 数据）
2. 统计画像 (Profiling): 计算 Top N 人群、场景、动机等
3. 痛点关联 (Correlation): 找出最显著的痛点和爽点
4. AI 撰写 (Drafting): 将结构化数据填入 Prompt，让 LLM 生成 Markdown 报告
5. 持久化存储 (Persistence): 将报告存入数据库，支持历史回溯

依赖：
- ReviewInsight 模型 (维度洞察)
- ReviewThemeHighlight 模型 (5W 主题)
- ProductReport 模型 (报告存储)
- TranslationService (LLM 调用)
"""
import logging
from collections import defaultdict, Counter
from datetime import datetime
from typing import Optional, List
from uuid import UUID

from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import Review, TranslationStatus
from app.models.insight import ReviewInsight
from app.models.theme_highlight import ReviewThemeHighlight, ThemeType
from app.models.product import Product
from app.models.report import ProductReport, ReportType, ReportStatus
from app.services.translation import translation_service

logger = logging.getLogger(__name__)


# [REPORT PROMPT] 深度商业分析报告提示词
REPORT_PROMPT = """你是一位麦肯锡级别的资深商业分析师。请基于以下**真实的用户反馈统计数据**，为该产品撰写一份《产品机会与改进战略报告》。

# 产品基本信息
- **产品名称**: {product_title}
- **ASIN**: {product_asin}
- **分析样本**: {total_reviews} 条已翻译评论

# 1. 用户与场景画像 (基于 5W 分析)
- **核心用户 (Who)**: {who_stats}
- **使用场景 (Where/When)**: {scene_stats}
- **购买动机 (Why)**: {why_stats}
- **核心任务 (What - JTBD)**: {what_stats}

# 2. 关键口碑洞察 (基于维度分析)
- **高频痛点 (Weaknesses)**: 
{weakness_stats}

- **核心爽点 (Strengths)**: 
{strength_stats}

# 任务要求
请用 **Markdown** 格式输出报告，包含以下章节（语气客观、犀利、数据驱动）：

## 🎯 1. 执行摘要 (Executive Summary)
用 3-5 句话概括产品目前的市场地位和核心优劣势。

## 👤 2. 用户与场景画像 (User & Context)
描述谁在买、在哪用、用来解决什么问题？(结合 Who/Where/What 数据)。
*洞察提示：如果 What 和官方卖点不符，请重点指出新机会。*

## ⚠️ 3. 致命痛点与改进 (Critical Issues)
针对 Top 3 痛点，分别给出：
- **问题现象**: 结合原文证据描述。
- **影响程度**: 估算影响范围（高/中/低）。
- **改进建议**: 给研发或品控的具体建议。

## ✨ 4. 产品亮点与爽点 (Key Strengths)
列出最突出的 3 个用户认可点，这些是营销可以放大的卖点。

## 💡 5. 营销卖点重构 (Marketing Strategy)
基于 Why (动机) 和 Strength (爽点)，提炼 3 个最具杀伤力的 Listing 宣传语（Bullet Points 建议）。

## 📊 6. 数据附录 (Data Appendix)
简要列出本次分析使用的数据来源和样本量。

---
*注意：不要只罗列数字，要提炼观点。引用原文证据时请保留引号。*
"""


class SummaryService:
    """
    智能报告生成服务（支持持久化存储）
    
    使用方法：
    ```python
    service = SummaryService(db)
    
    # 生成新报告（自动存入数据库）
    report = await service.generate_report(product_id)
    
    # 获取最新报告（秒开）
    latest = await service.get_latest_report(product_id)
    
    # 获取历史报告列表
    history = await service.get_report_history(product_id)
    ```
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def generate_report(
        self, 
        product_id: UUID,
        min_reviews: int = 10,
        report_type: str = ReportType.COMPREHENSIVE,
        save_to_db: bool = True
    ) -> dict:
        """
        核心入口：生成产品分析报告并持久化存储
        
        Args:
            product_id: 产品 UUID
            min_reviews: 最少评论数（默认 10）
            report_type: 报告类型 (comprehensive/marketing/research)
            save_to_db: 是否存入数据库（默认 True）
            
        Returns:
            {
                "success": True/False,
                "report": ProductReport 对象或 dict,
                "stats": {...统计数据...},
                "error": "错误信息（如果失败）"
            }
        """
        try:
            # 1. 获取产品信息
            product = await self._get_product(product_id)
            if not product:
                return {
                    "success": False,
                    "report": None,
                    "stats": None,
                    "error": "产品不存在"
                }
            
            # 2. 检查数据量
            total_reviews = await self._count_translated_reviews(product_id)
            
            if total_reviews < min_reviews:
                return {
                    "success": False,
                    "report": None,
                    "stats": {"total_reviews": total_reviews},
                    "error": f"数据量不足（当前 {total_reviews} 条，需要至少 {min_reviews} 条）。请先采集更多评论并完成翻译。"
                }
            
            # 3. 获取 5W 统计数据 (Context) - 同时返回列表和格式化字符串
            context_stats, context_lists = await self._aggregate_5w_stats_with_lists(product_id)
            
            # 4. 获取维度统计数据 (Dimensions) - 同时返回列表和格式化字符串
            insight_stats, insight_lists = await self._aggregate_insight_stats_with_lists(product_id)
            
            # 5. 构建 Prompt
            prompt = REPORT_PROMPT.format(
                product_title=product.title_translated or product.title or "未知产品",
                product_asin=product.asin,
                total_reviews=total_reviews,
                who_stats=context_stats.get('who', '无显著数据'),
                scene_stats=context_stats.get('scene', '无显著数据'),
                why_stats=context_stats.get('why', '无显著数据'),
                what_stats=context_stats.get('what', '无显著数据'),
                weakness_stats=insight_stats.get('weakness', '  - 暂无显著痛点数据'),
                strength_stats=insight_stats.get('strength', '  - 暂无显著爽点数据')
            )
            
            # 6. 调用 LLM 生成报告
            if not translation_service.client:
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "total_reviews": total_reviews,
                        "context_stats": context_stats,
                        "insight_stats": insight_stats
                    },
                    "error": "AI 服务未配置（缺少 API Key）"
                }
            
            try:
                response = translation_service.client.chat.completions.create(
                    model=translation_service.model,
                    messages=[
                        {"role": "system", "content": "You are an expert Product Strategy Consultant specializing in e-commerce and Amazon marketplace analysis. You write in Chinese."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.5,  # 适中的创造力
                    max_tokens=3500   # 报告需要较长的输出
                )
                report_content = response.choices[0].message.content
                
                logger.info(f"成功为产品 {product.asin} 生成报告，共 {len(report_content)} 字符")
                
                # 7. 构建结构化分析数据（用于前端可视化）
                analysis_data = {
                    "total_reviews": total_reviews,
                    "generated_at": datetime.now().isoformat(),
                    "context_stats": context_stats,
                    "insight_stats": insight_stats,
                    # 列表形式的数据，方便前端做图表
                    "top_who": context_lists.get("who", [])[:5],
                    "top_where": context_lists.get("where", [])[:5],
                    "top_when": context_lists.get("when", [])[:5],
                    "top_why": context_lists.get("why", [])[:5],
                    "top_what": context_lists.get("what", [])[:5],
                    "top_weaknesses": insight_lists.get("weakness", [])[:5],
                    "top_strengths": insight_lists.get("strength", [])[:5]
                }
                
                # 8. 持久化存储
                if save_to_db:
                    report_title = f"产品深度洞察报告 - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                    
                    new_report = ProductReport(
                        product_id=product_id,
                        title=report_title,
                        content=report_content,
                        analysis_data=analysis_data,
                        report_type=report_type,
                        status=ReportStatus.COMPLETED
                    )
                    
                    self.db.add(new_report)
                    await self.db.commit()
                    await self.db.refresh(new_report)
                    
                    logger.info(f"报告已存入数据库，ID: {new_report.id}")
                    
                    return {
                        "success": True,
                        "report": new_report.to_dict(),
                        "stats": analysis_data,
                        "error": None
                    }
                else:
                    return {
                        "success": True,
                        "report": report_content,
                        "stats": analysis_data,
                        "error": None
                    }
                
            except Exception as e:
                logger.error(f"AI 报告生成失败: {e}")
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "total_reviews": total_reviews,
                        "context_stats": context_stats,
                        "insight_stats": insight_stats
                    },
                    "error": f"AI 报告生成失败: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"报告生成过程出错: {e}")
            return {
                "success": False,
                "report": None,
                "stats": None,
                "error": f"报告生成失败: {str(e)}"
            }
    
    async def get_latest_report(self, product_id: UUID) -> Optional[ProductReport]:
        """
        获取该产品最近的一份报告（秒开，不用重新生成）
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            ProductReport 对象，如果没有则返回 None
        """
        result = await self.db.execute(
            select(ProductReport)
            .where(
                and_(
                    ProductReport.product_id == product_id,
                    ProductReport.status == ReportStatus.COMPLETED
                )
            )
            .order_by(desc(ProductReport.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def get_report_history(
        self, 
        product_id: UUID, 
        limit: int = 10
    ) -> List[ProductReport]:
        """
        获取该产品的历史报告列表
        
        Args:
            product_id: 产品 UUID
            limit: 返回数量（默认 10）
            
        Returns:
            ProductReport 对象列表
        """
        result = await self.db.execute(
            select(ProductReport)
            .where(ProductReport.product_id == product_id)
            .order_by(desc(ProductReport.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_report_by_id(self, report_id: UUID) -> Optional[ProductReport]:
        """
        根据 ID 获取报告
        
        Args:
            report_id: 报告 UUID
            
        Returns:
            ProductReport 对象
        """
        result = await self.db.execute(
            select(ProductReport).where(ProductReport.id == report_id)
        )
        return result.scalar_one_or_none()
    
    async def delete_report(self, report_id: UUID) -> bool:
        """
        删除报告
        
        Args:
            report_id: 报告 UUID
            
        Returns:
            是否删除成功
        """
        report = await self.get_report_by_id(report_id)
        if not report:
            return False
        
        await self.db.delete(report)
        await self.db.commit()
        return True
    
    async def _get_product(self, product_id: UUID) -> Optional[Product]:
        """获取产品信息"""
        result = await self.db.execute(
            select(Product).where(Product.id == product_id)
        )
        return result.scalar_one_or_none()
    
    async def _count_translated_reviews(self, product_id: UUID) -> int:
        """统计已翻译评论数"""
        result = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        return result.scalar() or 0
    
    async def _aggregate_5w_stats_with_lists(self, product_id: UUID) -> tuple:
        """
        聚合 5W 数据：Who, Where, When, Why, What
        同时返回格式化字符串和列表数据
        
        Returns:
            (stats_dict, lists_dict)
            stats_dict: {"who": "老年人(45), 宠物主(23)", ...}
            lists_dict: {"who": [{"name": "老年人", "count": 45}, ...], ...}
        """
        # 查询该产品所有的 theme highlights
        review_ids_subquery = (
            select(Review.id)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        
        result = await self.db.execute(
            select(ReviewThemeHighlight)
            .where(ReviewThemeHighlight.review_id.in_(review_ids_subquery))
        )
        highlights = result.scalars().all()
        
        # 计数器: counters[theme_type][label_name] = count
        counters = defaultdict(Counter)
        
        for h in highlights:
            # 新版数据结构：使用 label_name 字段
            if h.label_name:
                counters[h.theme_type].update([h.label_name])
            # 兼容旧版数据结构：使用 items 字段
            elif h.items:
                for item in h.items:
                    if isinstance(item, dict) and 'content' in item:
                        counters[h.theme_type].update([item['content']])
        
        def fmt_top(theme_key: str, top_n: int = 5) -> str:
            """格式化 Top N 统计，如: "老人(45), 学生(12)" """
            data = counters.get(theme_key, Counter())
            if not data:
                return "无"
            return ", ".join([f"{k}({v})" for k, v in data.most_common(top_n)])
        
        def get_list(theme_key: str, top_n: int = 10) -> list:
            """获取 Top N 列表，如: [{"name": "老人", "count": 45}, ...]"""
            data = counters.get(theme_key, Counter())
            return [{"name": k, "count": v} for k, v in data.most_common(top_n)]
        
        # 合并 Where 和 When 为 Scene
        where_str = fmt_top(ThemeType.WHERE.value)
        when_str = fmt_top(ThemeType.WHEN.value)
        
        stats = {
            "who": fmt_top(ThemeType.WHO.value),
            "scene": f"{where_str} / {when_str}",
            "why": fmt_top(ThemeType.WHY.value),
            "what": fmt_top(ThemeType.WHAT.value)
        }
        
        lists = {
            "who": get_list(ThemeType.WHO.value),
            "where": get_list(ThemeType.WHERE.value),
            "when": get_list(ThemeType.WHEN.value),
            "why": get_list(ThemeType.WHY.value),
            "what": get_list(ThemeType.WHAT.value)
        }
        
        return stats, lists
    
    async def _aggregate_insight_stats_with_lists(self, product_id: UUID) -> tuple:
        """
        聚合维度数据：Weakness, Strength
        同时返回格式化字符串和列表数据
        
        Returns:
            (stats_dict, lists_dict)
        """
        # 查询该产品所有的 insights
        review_ids_subquery = (
            select(Review.id)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        
        result = await self.db.execute(
            select(ReviewInsight)
            .where(ReviewInsight.review_id.in_(review_ids_subquery))
        )
        insights = result.scalars().all()
        
        # stats[insight_type][dimension] = {"count": 0, "quotes": []}
        data = defaultdict(lambda: defaultdict(lambda: {"count": 0, "quotes": []}))
        
        for insight in insights:
            # 跳过无维度或"其他"维度
            if not insight.dimension or insight.dimension in ["其他", "Other", "其它"]:
                continue
            
            # 只统计 weakness 和 strength
            if insight.insight_type not in ["weakness", "strength"]:
                continue
            
            entry = data[insight.insight_type][insight.dimension]
            entry["count"] += 1
            
            # 只保留前 3 条原文作为证据
            if len(entry["quotes"]) < 3:
                quote = insight.quote_translated or insight.quote
                if quote and quote.strip():
                    entry["quotes"].append(quote[:50] + "..." if len(quote) > 50 else quote)
        
        def fmt_section(insight_type: str) -> str:
            """格式化某个类型的洞察统计"""
            sorted_dims = sorted(
                data[insight_type].items(),
                key=lambda x: x[1]["count"],
                reverse=True
            )[:6]
            
            if not sorted_dims:
                return "  - 暂无显著数据"
            
            lines = []
            for dim, info in sorted_dims:
                quotes_str = " | ".join([f'"{q}"' for q in info["quotes"][:2]])
                if quotes_str:
                    lines.append(f"  - **{dim}** ({info['count']}次): {quotes_str}")
                else:
                    lines.append(f"  - **{dim}** ({info['count']}次)")
            
            return "\n".join(lines)
        
        def get_list(insight_type: str, top_n: int = 10) -> list:
            """获取 Top N 列表"""
            sorted_dims = sorted(
                data[insight_type].items(),
                key=lambda x: x[1]["count"],
                reverse=True
            )[:top_n]
            
            return [
                {
                    "dimension": dim, 
                    "count": info["count"], 
                    "quotes": info["quotes"]
                } 
                for dim, info in sorted_dims
            ]
        
        stats = {
            "weakness": fmt_section("weakness"),
            "strength": fmt_section("strength")
        }
        
        lists = {
            "weakness": get_list("weakness"),
            "strength": get_list("strength")
        }
        
        return stats, lists
    
    # ===== 兼容旧版 API 的方法 =====
    
    async def _aggregate_5w_stats(self, product_id: UUID) -> dict:
        """聚合 5W 数据（兼容旧版）"""
        stats, _ = await self._aggregate_5w_stats_with_lists(product_id)
        return stats
    
    async def _aggregate_insight_stats(self, product_id: UUID) -> dict:
        """聚合维度数据（兼容旧版）"""
        stats, _ = await self._aggregate_insight_stats_with_lists(product_id)
        return stats
    
    async def get_report_preview(self, product_id: UUID) -> dict:
        """
        获取报告预览数据（不调用 AI，只返回统计数据）
        
        用于前端展示"正在分析..."时的进度提示，
        也用于调试和查看原始聚合数据。
        """
        product = await self._get_product(product_id)
        if not product:
            return {"success": False, "error": "产品不存在"}
        
        total_reviews = await self._count_translated_reviews(product_id)
        context_stats = await self._aggregate_5w_stats(product_id)
        insight_stats = await self._aggregate_insight_stats(product_id)
        
        # 同时检查是否有历史报告
        latest_report = await self.get_latest_report(product_id)
        
        return {
            "success": True,
            "product": {
                "id": str(product.id),
                "asin": product.asin,
                "title": product.title_translated or product.title
            },
            "stats": {
                "total_reviews": total_reviews,
                "context_stats": context_stats,
                "insight_stats": insight_stats
            },
            "has_existing_report": latest_report is not None,
            "latest_report_id": str(latest_report.id) if latest_report else None,
            "latest_report_date": latest_report.created_at.isoformat() if latest_report else None
        }
