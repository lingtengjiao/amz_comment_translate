"""
Summary Service - 智能报告生成模块 (Report Generation Module)

核心功能：
1. 数据聚合 (Data Gathering): 从数据库中聚合 Insights（维度数据）和 ThemeHighlights（5W 数据）
2. 统计画像 (Profiling): 计算 Top N 人群、场景、动机等
3. 痛点关联 (Correlation): 找出最显著的痛点和爽点
4. AI 撰写 (Drafting): 将结构化数据填入 Prompt，让 LLM 生成 JSON 格式的结构化报告
5. 持久化存储 (Persistence): 将报告存入数据库，支持历史回溯

支持四种报告类型（四位一体决策中台）：
- COMPREHENSIVE: CEO/综合战略版
- OPERATIONS: CMO/运营市场版
- PRODUCT: CPO/产品研发版
- SUPPLY_CHAIN: 供应链/质检版

依赖：
- ReviewInsight 模型 (维度洞察)
- ReviewThemeHighlight 模型 (5W 主题)
- ProductReport 模型 (报告存储)
- TranslationService (LLM 调用)
"""
import logging
import json
from collections import defaultdict, Counter
from datetime import datetime
from typing import Optional, List, Dict, Any
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


# ==========================================
# [PROMPT CONFIGURATION] 角色化指令库 (JSON模式)
# ==========================================

COMMON_INSTRUCTION = """
# 输出格式要求 (CRITICAL)
1. **必须严格仅输出合法的 JSON 格式**。
2. **严禁**包含 markdown 代码块标记 (如 ```json ... ```)。
3. **严禁**在 JSON 前后添加任何解释性文字。
4. 语言风格：专业、数据驱动、客观。使用中文输出。
"""

# ------------------------------------------------------------------
# 1. [CEO/综合版] 全局战略视角
# ------------------------------------------------------------------
COMPREHENSIVE_PROMPT = """你是一位**企业CEO兼战略顾问**。请基于"用户画像(5W)"和"口碑洞察(Dimensions)"数据，生成一份**全局战略分析报告** (JSON)。

# 核心目标
评估产品与市场的匹配度(PMF)，识别核心增长点与致命风险，制定全盘策略。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像分析 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像深度分析。格式:
   {{
     "core_users": (String) 核心用户群体描述（结合 Who 数据，如"中老年人、家庭主妇"），
     "user_characteristics": (Array) 用户特征标签 ["..."],
     "usage_scenarios": (String) 典型使用场景描述（结合 Where/When 数据），
     "purchase_motivation": (String) 主要购买动机分析（结合 Why 数据），
     "jobs_to_be_done": (String) 用户核心任务/JTBD（结合 What 数据），
     "persona_insight": (String) 一句话用户画像总结
   }}

## B. 战略分析
2. "strategic_verdict": (String) 3句话的战略定调（例如：产品在细分市场表现强劲，但质量品控严重拖后腿，建议暂停扩量优先整改）。
3. "market_fit_analysis": (String) 基于用户画像，分析我们是否抓住了正确的用户和场景？有无错位？
4. "core_swot": (Object) SWOT分析，**每项需带source_tag用于溯源**。格式: 
   {{
     "strengths": [{{"point": "...", "source_tag": "Battery"}}],   <-- source_tag 对应 insight.strength 的 name
     "weaknesses": [{{"point": "...", "source_tag": "Noise"}}],
     "opportunities": ["..."],
     "threats": ["..."]
   }}
5. "department_directives": (Object) 给各部门的一句话指令。格式: {{"to_marketing": "...", "to_product": "...", "to_supply_chain": "..."}}
6. "priority_actions": (Array) Top 3 优先行动项，**带source_tag溯源**。格式: [{{"action": "...", "owner": "...", "deadline": "...", "source_tag": "..."}}]
7. "risk_level": (String) 风险等级：low/medium/high/critical

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 2. [运营/市场版] CMO视角
# ------------------------------------------------------------------
OPERATIONS_PROMPT = """你是一位**首席营销官(CMO)**。请基于统计数据，为**运营团队**生成一份JSON格式的策略报告。

# 核心目标
挖掘产品卖点(Hooks)，规避退货风险，精准定位广告受众。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像与市场定位 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像分析，用于精准营销。格式:
   {{
     "primary_audience": (String) 主要目标人群描述（结合 Who 数据），
     "secondary_audience": (String) 次要/潜在人群，
     "usage_context": (String) 核心使用场景描述（结合 Where/When），
     "buying_triggers": (Array) 购买触发点/动机 ["..."]（结合 Why），
     "use_cases": (Array) 典型用例/JTBD ["..."]（结合 What），
     "ad_targeting_keywords": (Array) 广告投放关键词建议 ["..."]
   }}

## B. 营销策略
2. "executive_summary": (String) 市场现状的3句话总结。
3. "selling_points": (Array) 提炼3个核心卖点，**带source_tag溯源**。格式: 
   [{{"title": "强力吸尘", "copywriting": "3000Pa大吸力...", "source_tag": "Suction Power"}}]
   *注：source_tag 对应 insight.strength 的 name，前端可据此展示原始好评*
4. "marketing_risks": (Array) 客服预警痛点，**带source_tag溯源**。格式: 
   [{{"risk": "电池续航差", "talking_points": "...", "source_tag": "Battery"}}]
   *注：source_tag 对应 insight.weakness 的 name*
5. "target_audience": (Object) 广告投放建议。格式: {{"who": ["老人", "宝妈"], "scenario": ["地毯", "车内"], "strategy": "..."}}
6. "competitor_analysis": (String) 用户提到的竞品及我们的优劣势(如果没有则填"暂无")。
7. "listing_optimization": (Array) Listing 优化建议，**带source_tag溯源**。格式: 
   [{{"element": "Title", "suggestion": "...", "source_tag": "..."}}]
8. "review_response_templates": (Array) 差评回复模板，**带source_tag溯源**。格式: 
   [{{"pain_point": "...", "response": "...", "source_tag": "..."}}]

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 3. [产品/研发版] CPO视角
# ------------------------------------------------------------------
PRODUCT_PROMPT = """你是一位**产品总监(CPO)**。请基于统计数据，为**研发团队**生成一份JSON格式的迭代建议书。

# 核心目标
发现设计缺陷，明确下一代产品(Next-Gen)的改进方向。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户与场景分析 (基于 5W Context 数据)
1. "user_research": (Object) 用户研究洞察，用于产品设计。格式:
   {{
     "target_users": (String) 实际用户群体画像（结合 Who 数据），
     "user_pain_points": (Array) 按用户类型分类的痛点 ["老年用户: 按键太小", "..."],
     "real_usage_environments": (Array) 真实使用环境 ["..."]（结合 Where/When），
     "design_for_context": (String) 针对使用场景的设计建议，
     "user_goals": (Array) 用户核心目标/JTBD ["..."]（结合 What），
     "unmet_expectations": (String) 用户期望与产品现状的差距
   }}

## B. 产品改进
2. "quality_score": (Integer) 0-100分，基于好评率和痛点严重程度打分。
3. "critical_bugs": (Array) Top 3 致命缺陷，**带source_tag溯源**。格式: 
   [{{"issue": "电池死机", "severity": "High", "root_cause_guess": "BMS保护板故障", "suggestion": "更换供应商...", "source_tag": "Battery"}}]
   *注：source_tag 对应 insight.weakness 的 name，前端可据此展示原始差评*
4. "unmet_needs": (Array) 用户想要但我们没做的功能，**带source_tag溯源**。格式: 
   [{{"feature": "增加LED灯", "reason": "...", "source_tag": "LED Light"}}]
   *注：source_tag 对应 insight.suggestion 的 name*
5. "usage_context_gap": (String) 用户实际使用场景是否超出了设计预期？（结合 Where/When/Scenario 数据分析）
6. "roadmap_suggestion": (String) 下个版本的核心升级方向（综合用户画像和痛点）。
7. "usability_issues": (Array) 易用性问题，**带source_tag溯源**。格式: 
   [{{"issue": "...", "user_group": "...", "suggestion": "...", "source_tag": "..."}}]
8. "design_recommendations": (Array) 设计改进建议，**带source_tag溯源**。格式: 
   [{{"area": "...", "current_state": "...", "recommendation": "...", "source_tag": "..."}}]

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 4. [供应链/质检版] 供应链总监视角
# ------------------------------------------------------------------
SUPPLY_CHAIN_PROMPT = """你是一位**供应链总监**。请基于统计数据，为**工厂和QC团队**生成一份JSON格式的质量整改报告。

# 核心目标
降低退货率(Return Rate)，优化包装，追责供应商。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 使用场景与质量需求 (基于 5W Context 数据)
1. "usage_context_analysis": (Object) 使用环境分析，用于质量标准制定。格式:
   {{
     "user_groups": (String) 主要用户群体（结合 Who 数据，如"老人/儿童"需更高安全标准），
     "usage_environments": (Array) 主要使用环境 ["户外", "潮湿环境", "..."]（结合 Where/When），
     "environmental_requirements": (String) 针对使用环境的质量要求建议，
     "usage_intensity": (String) 使用强度/频率分析（结合 What/Scenario），
     "durability_focus": (Array) 重点耐久性关注点 ["..."]
   }}

## B. 质量整改
2. "material_defects": (Array) 材质做工问题，**带source_tag溯源**。格式: 
   [{{"part": "外壳", "problem": "塑料感强/易裂", "frequency": "High", "source_tag": "Build Quality"}}]
   *注：source_tag 对应 insight.weakness 的 name*
3. "packaging_issues": (Object) 包装与物流。格式: {{"is_damaged": true, "details": "...", "improvement": "加厚泡沫...", "source_tag": "Packaging"}}
4. "missing_parts": (Array) 经常漏发的配件列表，**带source_tag溯源**。格式: 
   [{{"part": "说明书", "source_tag": "Missing Parts"}}]
5. "qc_checklist": (Array) 下批次出货前必须重点检查的5个项目（结合用户场景优先级）。格式: 
   [{{"item": "电池充电测试", "priority": "High", "source_tag": "Battery"}}]
6. "supplier_issues": (Array) 供应商相关问题，**带source_tag溯源**。格式: 
   [{{"component": "...", "issue": "...", "action": "...", "source_tag": "..."}}]
7. "return_rate_factors": (Array) 主要退货原因，**带source_tag溯源**。格式: 
   [{{"reason": "...", "percentage": "...", "solution": "...", "source_tag": "..."}}]
8. "assembly_defects": (Array) 组装问题，**带source_tag溯源**。格式: 
   [{{"defect": "...", "frequency": "...", "station": "...", "source_tag": "..."}}]

""" + COMMON_INSTRUCTION

# [MAP] 映射表：4个类型 -> 4个Prompt
PROMPT_MAP = {
    ReportType.COMPREHENSIVE.value: COMPREHENSIVE_PROMPT,
    ReportType.OPERATIONS.value: OPERATIONS_PROMPT,
    ReportType.PRODUCT.value: PRODUCT_PROMPT,
    ReportType.SUPPLY_CHAIN.value: SUPPLY_CHAIN_PROMPT,
}

# 报告标题映射
REPORT_TITLE_MAP = {
    ReportType.COMPREHENSIVE.value: "全维度战略分析报告",
    ReportType.OPERATIONS.value: "运营与市场策略报告",
    ReportType.PRODUCT.value: "产品迭代建议书",
    ReportType.SUPPLY_CHAIN.value: "供应链质量整改报告",
}


class SummaryService:
    """
    智能报告生成服务（支持持久化存储）
    
    支持四种报告类型：
    - comprehensive: CEO/综合战略版
    - operations: CMO/运营市场版
    - product: CPO/产品研发版
    - supply_chain: 供应链/质检版
    
    使用方法：
    ```python
    service = SummaryService(db)
    
    # 生成新报告（指定类型）
    report = await service.generate_report(product_id, report_type="operations")
    
    # 获取最新报告（秒开）
    latest = await service.get_latest_report(product_id)
    
    # 获取历史报告列表（可按类型筛选）
    history = await service.get_report_history(product_id, report_type="product")
    ```
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def generate_report(
        self, 
        product_id: UUID,
        report_type: str = ReportType.COMPREHENSIVE.value,
        min_reviews: int = 10,
        save_to_db: bool = True
    ) -> dict:
        """
        核心入口：生成指定类型的结构化报告 (JSON)
        
        Args:
            product_id: 产品 UUID
            report_type: 报告类型 (comprehensive/operations/product/supply_chain)
            min_reviews: 最少评论数（默认 10）
            save_to_db: 是否存入数据库（默认 True）
            
        Returns:
            {
                "success": True/False,
                "report": ProductReport 对象的 dict,
                "stats": {...原始统计数据...},
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
            
            # 3. 聚合原始数据 (Raw Data) - ECharts 格式
            context_stats = await self._aggregate_5w_stats(product_id)
            insight_stats = await self._aggregate_insight_stats(product_id)
            
            # 4. [关键] 数据融合格式化 - 喂给 LLM
            stats_text = self._format_stats_for_llm(context_stats, insight_stats, total_reviews)
            
            # 5. 选择 Prompt
            prompt_template = PROMPT_MAP.get(report_type, COMPREHENSIVE_PROMPT)
            final_prompt = prompt_template.format(stats_text=stats_text)
            
            # 6. 调用 LLM (强制 JSON 输出)
            if not translation_service.client:
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "context": context_stats,
                        "insight": insight_stats
                    },
                    "error": "AI 服务未配置（缺少 API Key）"
                }
            
            try:
                logger.info(f"Generating {report_type} report for product {product.asin}...")
                
                response = translation_service.client.chat.completions.create(
                    model=translation_service.model,
                    messages=[
                        {"role": "system", "content": "You are a data analyst. Output JSON only. Always respond in Chinese."},
                        {"role": "user", "content": final_prompt}
                    ],
                    temperature=0.4,  # 较低温度保证 JSON 结构稳定
                    max_tokens=3500,
                    response_format={"type": "json_object"}
                )
                content_json_str = response.choices[0].message.content
                
                # 简单清洗（防止 LLM 输出 Markdown 标记）
                cleaned_json_str = content_json_str.replace("```json", "").replace("```", "").strip()
                
                # 尝试解析以确保合法
                try:
                    parsed_content = json.loads(cleaned_json_str)
                    logger.info(f"成功解析 JSON 报告，共 {len(parsed_content)} 个顶级字段")
                except json.JSONDecodeError as e:
                    logger.error(f"LLM produced invalid JSON: {e}")
                    # 保存原始文本，标记为失败
                    cleaned_json_str = json.dumps({
                        "error": "AI 输出格式错误",
                        "raw_content": content_json_str[:500]
                    }, ensure_ascii=False)
                
                # 7. 构建 analysis_data (原始统计数据，给前端画图)
                analysis_data = {
                    "context": context_stats,
                    "insight": insight_stats,
                    "meta": {
                        "total_reviews": total_reviews,
                        "generated_at": datetime.now().isoformat(),
                        "report_type": report_type,
                        "product_asin": product.asin
                    }
                }
                
                # 8. 持久化存储
                if save_to_db:
                    report_title = f"{REPORT_TITLE_MAP.get(report_type, '分析报告')} - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                    
                    new_report = ProductReport(
                        product_id=product_id,
                        title=report_title,
                        content=cleaned_json_str,      # AI 的观点 (JSON)
                        report_type=report_type,
                        analysis_data=analysis_data,   # 原始数据 (给前端画图)
                        status=ReportStatus.COMPLETED.value
                    )
                    
                    self.db.add(new_report)
                    await self.db.commit()
                    await self.db.refresh(new_report)
                    
                    logger.info(f"Report saved to DB: {new_report.id}")
                    
                    return {
                        "success": True,
                        "report": new_report.to_dict(),
                        "stats": analysis_data,
                        "error": None
                    }
                else:
                    return {
                        "success": True,
                        "report": {
                            "content": cleaned_json_str,
                            "report_type": report_type,
                            "analysis_data": analysis_data
                        },
                        "stats": analysis_data,
                        "error": None
                    }
                
            except Exception as e:
                logger.error(f"AI 报告生成失败: {e}")
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "context": context_stats,
                        "insight": insight_stats
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
    
    def _format_stats_for_llm(
        self, 
        context: Dict[str, List[Dict[str, Any]]], 
        insight: Dict[str, List[Dict[str, Any]]],
        total_reviews: int
    ) -> str:
        """
        [核心逻辑] 将 5W (Context) 和 5类 Insight 数据结合成 LLM 可读的叙事结构。
        LLM 会根据此结构进行交叉分析。
        
        5类 Insight:
        - strength: 产品优势/卖点 -> 用于 Listing 五点描述
        - weakness: 改进空间/痛点 -> 用于产品改进和客服 QA
        - suggestion: 用户建议 -> 产品经理直接需求
        - scenario: 行为故事 -> 边缘场景发现/营销素材
        - emotion: 情绪预警 -> 客服和公关关注
        """
        
        # 提取 Top 数据，减少 Token 消耗，同时带上频次
        def get_fmt(items: List[Dict[str, Any]], max_items: int = 8) -> str:
            if not items:
                return "[]"
            formatted = [f"{x['name']}({x['value']}次)" for x in items[:max_items]]
            return json.dumps(formatted, ensure_ascii=False)

        return f"""
=== 📊 基础信息 ===
- 分析样本: {total_reviews} 条已翻译评论

=== 📊 PART 1: 5W Context (宏观画像) ===
这里描述了产品的实际使用环境和人群（简单标签）：
- Who (核心人群): {get_fmt(context.get('who', []))}
- Where (使用地点): {get_fmt(context.get('where', []))}
- When (使用时机): {get_fmt(context.get('when', []))}
- Why (购买动机): {get_fmt(context.get('why', []))}
- What (用户任务/JTBD): {get_fmt(context.get('what', []))}

=== 📉 PART 2: Deep Insights (微观洞察 - 5类) ===
这里是基于 5 类 Insight 的详细分析数据：

1. [Strength - 卖点库]: {get_fmt(insight.get('strength', []))}
   *用途：用于撰写 Listing 五点描述和广告文案。*

2. [Weakness - 痛点库]: {get_fmt(insight.get('weakness', []))}
   *用途：用于产品改进和客服 QA。*

3. [Suggestion - 用户心声]: {get_fmt(insight.get('suggestion', []))}
   *用途：**产品经理请重点关注**，这是用户的直接需求/Feature Request。*

4. [Scenario - 行为故事]: {get_fmt(insight.get('scenario', []))}
   *用途：用于发现边缘场景（Edge Cases）或营销故事素材。*

5. [Emotion - 情绪预警]: {get_fmt(insight.get('emotion', []))}
   *用途：**客服和公关请关注**，识别愤怒或极度满意的用户。*

=== 指令 ===
请结合 PART 1 的宏观画像和 PART 2 的微观洞察进行交叉分析。
例如：
- 如果 Who="老人" 且 Weakness="按键小"，则需指出适老化设计缺陷。
- 如果 Suggestion 中有高频需求，请在报告中重点建议产品团队采纳。
- 如果 Emotion 中有强烈负面情绪，请在报告中给出公关预警。
        """
    
    # --- 数据聚合方法 (返回 ECharts 格式) ---
    
    async def _aggregate_5w_stats(self, product_id: UUID) -> Dict[str, List[Dict[str, Any]]]:
        """
        [Traceable] 聚合 5W 数据，包含原文证据锚点
        
        Return: {
            "who": [
                {
                    "name": "老人", 
                    "value": 45,
                    "evidence": [
                        {"review_id": "uuid-1", "quote": "作为老年人...", "rating": 3, "date": "2024-01-15"},
                        ...
                    ]
                }, 
                ...
            ], 
            ...
        }
        """
        # 查询该产品所有的 theme highlights，同时 JOIN Review 获取原文
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
            select(ReviewThemeHighlight, Review)
            .join(Review, ReviewThemeHighlight.review_id == Review.id)
            .where(ReviewThemeHighlight.review_id.in_(review_ids_subquery))
        )
        rows = result.all()  # [(highlight, review), ...]
        
        # 结构: stats[type][tag_name] = {"count": 0, "samples": []}
        stats = defaultdict(lambda: defaultdict(lambda: {"count": 0, "samples": []}))
        
        for h, r in rows:
            name = ""
            quote = ""
            
            # 新版数据结构：使用 label_name 字段
            if h.label_name:
                name = h.label_name
                # 优先使用 quote，否则使用评论原文
                quote = h.quote or (r.body_original[:80] if r.body_original else "")
            # 兼容旧版数据结构：使用 items 字段
            elif h.items:
                items_list = h.items if isinstance(h.items, list) else []
                for item in items_list:
                    if isinstance(item, dict):
                        name = item.get('content') or item.get('tag') or ""
                        quote = item.get('content_original') or item.get('quote') or (r.body_original[:80] if r.body_original else "")
                    elif isinstance(item, str):
                        name = item
                        quote = r.body_original[:80] if r.body_original else ""
                    
                    if name:
                        entry = stats[h.theme_type][name]
                        entry["count"] += 1
                        # 只保留前 5 条作为直接证据 (避免 JSON 过大)
                        if len(entry["samples"]) < 5:
                            entry["samples"].append({
                                "review_id": str(r.id),
                                "quote": quote[:150],  # 限制长度
                                "rating": r.rating,
                                "date": r.review_date.strftime('%Y-%m-%d') if r.review_date else None
                            })
                continue  # items 循环处理完毕，跳过后续
            
            # 处理 label_name 的情况
            if name:
                entry = stats[h.theme_type][name]
                entry["count"] += 1
                if len(entry["samples"]) < 5:
                    entry["samples"].append({
                        "review_id": str(r.id),
                        "quote": quote[:150],
                        "rating": r.rating,
                        "date": r.review_date.strftime('%Y-%m-%d') if r.review_date else None
                    })
        
        def get_top(theme_key: str, top_n: int = 15) -> List[Dict[str, Any]]:
            """获取 Top N，包含证据"""
            data = stats.get(theme_key, {})
            sorted_items = sorted(data.items(), key=lambda x: x[1]['count'], reverse=True)[:top_n]
            
            return [{
                "name": k, 
                "value": v["count"],
                "evidence": v["samples"]  # <--- 注入证据
            } for k, v in sorted_items]
        
        return {
            "who": get_top(ThemeType.WHO.value if hasattr(ThemeType, 'WHO') else "who"),
            "where": get_top(ThemeType.WHERE.value if hasattr(ThemeType, 'WHERE') else "where"),
            "when": get_top(ThemeType.WHEN.value if hasattr(ThemeType, 'WHEN') else "when"),
            "why": get_top(ThemeType.WHY.value if hasattr(ThemeType, 'WHY') else "why"),
            "what": get_top(ThemeType.WHAT.value if hasattr(ThemeType, 'WHAT') else "what")
        }
    
    async def _aggregate_insight_stats(self, product_id: UUID) -> Dict[str, List[Dict[str, Any]]]:
        """
        [Traceable] 聚合 5 类 Insight 数据，包含原文证据锚点
        
        5类洞察类型：
        - strength: 产品优势/卖点
        - weakness: 改进空间/痛点  
        - suggestion: 用户建议/Feature Request
        - scenario: 具体使用场景/行为故事
        - emotion: 强烈情感洞察
        
        Return: {
            "strength": [
                {
                    "name": "电池续航", 
                    "value": 30,
                    "evidence": [
                        {"review_id": "uuid-1", "quote": "电池能用很久...", "analysis": "用户称赞续航", "rating": 5},
                        ...
                    ]
                }, 
                ...
            ],
            ...
        }
        """
        # 查询该产品所有的 insights，同时 JOIN Review 获取原文
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
            select(ReviewInsight, Review)
            .join(Review, ReviewInsight.review_id == Review.id)
            .where(ReviewInsight.review_id.in_(review_ids_subquery))
        )
        rows = result.all()  # [(insight, review), ...]
        
        # 结构: stats[insight_type][dimension] = {"count": 0, "samples": []}
        stats = defaultdict(lambda: defaultdict(lambda: {"count": 0, "samples": []}))
        
        # 支持的 5 类洞察类型
        valid_types = ["strength", "weakness", "suggestion", "scenario", "emotion"]
        
        for i, r in rows:
            if not i.insight_type or i.insight_type not in valid_types:
                continue
            
            # 维度清洗 (处理空值)
            dim_name = i.dimension if i.dimension and i.dimension not in ["其他", "Other", "其它"] else "General"
            
            entry = stats[i.insight_type][dim_name]
            entry["count"] += 1
            
            # 只保留前 5 条作为直接证据
            if len(entry["samples"]) < 5:
                # 优先使用翻译后的引用
                quote = i.quote_translated or i.quote or (r.body_original[:100] if r.body_original else "")
                
                entry["samples"].append({
                    "review_id": str(r.id),
                    "quote": quote[:150],  # 限制长度
                    "analysis": i.analysis[:100] if i.analysis else None,  # AI 对单条的分析
                    "rating": r.rating,
                    "sentiment": r.sentiment if hasattr(r, 'sentiment') else None
                })
        
        def get_top(itype: str, top_n: int = 15) -> List[Dict[str, Any]]:
            """获取 Top N，包含证据"""
            data = stats.get(itype, {})
            sorted_items = sorted(data.items(), key=lambda x: x[1]['count'], reverse=True)[:top_n]
            
            return [{
                "name": k, 
                "value": v["count"],
                "evidence": v["samples"]  # <--- 注入证据
            } for k, v in sorted_items]
        
        # 返回所有 5 个类型的数据
        return {
            "strength": get_top("strength"),
            "weakness": get_top("weakness"),
            "suggestion": get_top("suggestion"),
            "scenario": get_top("scenario"),
            "emotion": get_top("emotion")
        }
    
    # --- 报告查询方法 ---
    
    async def get_latest_report(
        self, 
        product_id: UUID, 
        report_type: Optional[str] = None
    ) -> Optional[ProductReport]:
        """
        获取该产品最近的一份报告（秒开，不用重新生成）
        
        Args:
            product_id: 产品 UUID
            report_type: 可选，按类型筛选
            
        Returns:
            ProductReport 对象，如果没有则返回 None
        """
        stmt = select(ProductReport).where(
            and_(
                ProductReport.product_id == product_id,
                ProductReport.status == ReportStatus.COMPLETED.value
            )
        )
        
        if report_type:
            stmt = stmt.where(ProductReport.report_type == report_type)
        
        stmt = stmt.order_by(desc(ProductReport.created_at)).limit(1)
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_report_history(
        self, 
        product_id: UUID, 
        limit: int = 10,
        report_type: Optional[str] = None
    ) -> List[ProductReport]:
        """
        获取该产品的历史报告列表
        
        Args:
            product_id: 产品 UUID
            limit: 返回数量（默认 10）
            report_type: 可选，按类型筛选
            
        Returns:
            ProductReport 对象列表
        """
        stmt = select(ProductReport).where(ProductReport.product_id == product_id)
        
        if report_type:
            stmt = stmt.where(ProductReport.report_type == report_type)
        
        stmt = stmt.order_by(desc(ProductReport.created_at)).limit(limit)
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    async def get_report_by_id(self, report_id: UUID) -> Optional[ProductReport]:
        """根据 ID 获取报告"""
        result = await self.db.execute(
            select(ProductReport).where(ProductReport.id == report_id)
        )
        return result.scalar_one_or_none()
    
    async def delete_report(self, report_id: UUID) -> bool:
        """删除报告"""
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
    
    # --- 兼容旧版 API 的方法 ---
    
    async def _aggregate_5w_stats_with_lists(self, product_id: UUID) -> tuple:
        """
        聚合 5W 数据（兼容旧版，同时返回格式化字符串和列表）
        """
        stats = await self._aggregate_5w_stats(product_id)
        
        def fmt_top(items: List[Dict[str, Any]], top_n: int = 5) -> str:
            if not items:
                return "无"
            return ", ".join([f"{x['name']}({x['value']})" for x in items[:top_n]])
        
        def get_list(items: List[Dict[str, Any]], top_n: int = 10) -> List[Dict[str, Any]]:
            return [{"name": x['name'], "count": x['value']} for x in items[:top_n]]
        
        # 合并 Where 和 When 为 Scene
        where_str = fmt_top(stats.get('where', []))
        when_str = fmt_top(stats.get('when', []))
        
        formatted_stats = {
            "who": fmt_top(stats.get('who', [])),
            "scene": f"{where_str} / {when_str}",
            "why": fmt_top(stats.get('why', [])),
            "what": fmt_top(stats.get('what', []))
        }
        
        lists = {
            "who": get_list(stats.get('who', [])),
            "where": get_list(stats.get('where', [])),
            "when": get_list(stats.get('when', [])),
            "why": get_list(stats.get('why', [])),
            "what": get_list(stats.get('what', []))
        }
        
        return formatted_stats, lists
    
    async def _aggregate_insight_stats_with_lists(self, product_id: UUID) -> tuple:
        """
        聚合 5 类 Insight 数据（兼容旧版，同时返回格式化字符串和列表）
        
        5类洞察类型：
        - strength: 产品优势/卖点
        - weakness: 改进空间/痛点  
        - suggestion: 用户建议/Feature Request
        - scenario: 具体使用场景/行为故事
        - emotion: 强烈情感洞察
        """
        # 查询该产品所有的 insights（需要完整数据以获取 quotes）
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
        
        # 支持的 5 类洞察类型
        valid_types = ["strength", "weakness", "suggestion", "scenario", "emotion"]
        
        for insight in insights:
            if not insight.insight_type or insight.insight_type not in valid_types:
                continue
            
            # 维度清洗
            dim = insight.dimension if insight.dimension and insight.dimension not in ["其他", "Other", "其它"] else "General"
            
            entry = data[insight.insight_type][dim]
            entry["count"] += 1
            
            # 只保留前 3 条原文作为证据
            if len(entry["quotes"]) < 3:
                quote = insight.quote_translated or insight.quote
                if quote and quote.strip():
                    entry["quotes"].append(quote[:50] + "..." if len(quote) > 50 else quote)
        
        def fmt_section(insight_type: str) -> str:
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
        
        # 返回所有 5 类数据
        formatted_stats = {
            "strength": fmt_section("strength"),
            "weakness": fmt_section("weakness"),
            "suggestion": fmt_section("suggestion"),
            "scenario": fmt_section("scenario"),
            "emotion": fmt_section("emotion")
        }
        
        lists = {
            "strength": get_list("strength"),
            "weakness": get_list("weakness"),
            "suggestion": get_list("suggestion"),
            "scenario": get_list("scenario"),
            "emotion": get_list("emotion")
        }
        
        return formatted_stats, lists
    
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
        
        # 获取 ECharts 格式的数据
        context_stats = await self._aggregate_5w_stats(product_id)
        insight_stats = await self._aggregate_insight_stats(product_id)
        
        # 同时获取旧版格式（用于前端兼容）
        context_formatted, context_lists = await self._aggregate_5w_stats_with_lists(product_id)
        insight_formatted, insight_lists = await self._aggregate_insight_stats_with_lists(product_id)
        
        # 同时检查是否有历史报告
        latest_report = await self.get_latest_report(product_id)
        
        # 获取各类型报告数量
        report_counts = {}
        for rt in [ReportType.COMPREHENSIVE.value, ReportType.OPERATIONS.value, 
                   ReportType.PRODUCT.value, ReportType.SUPPLY_CHAIN.value]:
            stmt = select(func.count(ProductReport.id)).where(
                and_(
                    ProductReport.product_id == product_id,
                    ProductReport.report_type == rt
                )
            )
            result = await self.db.execute(stmt)
            report_counts[rt] = result.scalar() or 0
        
        return {
            "success": True,
            "product": {
                "id": str(product.id),
                "asin": product.asin,
                "title": product.title_translated or product.title
            },
            "stats": {
                "total_reviews": total_reviews,
                # ECharts 格式（新版 - 5类 Insight）
                "context": context_stats,
                "insight": insight_stats,
                # 字符串格式（兼容旧版）
                "context_stats": context_formatted,
                "insight_stats": insight_formatted,
                # 列表格式（兼容旧版）- 5W Context
                "top_who": context_lists.get("who", [])[:5],
                "top_where": context_lists.get("where", [])[:5],
                "top_when": context_lists.get("when", [])[:5],
                "top_why": context_lists.get("why", [])[:5],
                "top_what": context_lists.get("what", [])[:5],
                # 列表格式（兼容旧版）- 5类 Insight
                "top_strengths": insight_lists.get("strength", [])[:5],
                "top_weaknesses": insight_lists.get("weakness", [])[:5],
                "top_suggestions": insight_lists.get("suggestion", [])[:5],
                "top_scenarios": insight_lists.get("scenario", [])[:5],
                "top_emotions": insight_lists.get("emotion", [])[:5]
            },
            "report_counts": report_counts,
            "has_existing_report": latest_report is not None,
            "latest_report_id": str(latest_report.id) if latest_report else None,
            "latest_report_date": latest_report.created_at.isoformat() if latest_report else None,
            "latest_report_type": latest_report.report_type if latest_report else None
        }
