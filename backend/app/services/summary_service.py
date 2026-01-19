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

# 🔗 证据引用规范（CRITICAL - 必须遵守）

## 置信度评估标准
每个分析结论必须标注 `confidence` 字段：
- **"high"**: ≥5条评论明确支持 + 数据占比≥15%，证据直接明确
- **"medium"**: 2-4条评论支持，或占比10-15%，需要合理推断
- **"low"**: 仅1条评论或占比<10%，证据较弱，标记为"参考性建议"

## 证据引用要求
1. **每个分析点必须引用真实评论**
   - 从输入数据的 `evidence` 列表中选取 `review_id`
   - 严禁编造不存在的 ID 或引用内容
   - 如无足够证据支持，应降低置信度或不输出该结论

2. **引用格式**（适用于所有带 source_tag 的字段）
   示例: {{"point": "分析结论", "confidence": "high", "source_tag": "Battery", "evidence": {{"count": 30, "percentage": "23.5%", "sample_ids": ["uuid-1"], "sample_quotes": ["电池续航很久..."]}}}}

3. **禁止行为**
   - ❌ 使用不在输入数据中的 review_id
   - ❌ 编造引用内容或虚构数据
   - ❌ 给出没有证据支持的强结论
   - ❌ 在证据不足时使用 "high" 置信度

4. **专业性要求**
   - 引用具体数据（样本量、百分比、趋势）
   - 使用专业术语（PMF、NPS、JTBD、CAC、LTV）
   - 进行交叉分析（结合用户画像和痛点）
   - 给出可执行建议（明确责任人、优先级）
"""

# ------------------------------------------------------------------
# 1. [CEO/综合版] 全局战略视角
# ------------------------------------------------------------------
COMPREHENSIVE_PROMPT = """你是一位**企业CEO兼战略顾问**，拥有丰富的电商产品分析经验。请基于"用户画像(5W)"和"口碑洞察(5类)"数据，生成一份**深度全局战略分析报告** (JSON)。

# 核心目标
评估产品与市场的匹配度(PMF)，识别核心增长点与致命风险，制定可执行的全盘策略。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像深度分析 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像深度分析。格式:
   {{
     "core_buyers": {{
       "description": (String) **购买者群体**描述（结合 Buyer 数据），
       "confidence": "high|medium|low",
       "evidence": {{
         "count": 数字,
         "percentage": "百分比",
         "sample_ids": ["uuid-1", "uuid-2"],
         "sample_quotes": ["引用1...", "引用2..."]
       }}
     }},
     "core_users": {{
       "description": (String) **使用者群体**描述（结合 User 数据），
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "user_characteristics": (Array) 用户特征标签 ["..."],
     "usage_scenarios": {{
       "description": (String) 典型使用场景描述（结合 Where/When 数据），
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "purchase_motivation": {{
       "description": (String) 主要购买动机分析（结合 Why 数据），
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "jobs_to_be_done": {{
       "description": (String) 用户核心任务/JTBD（结合 What 数据），
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "persona_insight": (String) 一句话用户画像总结（需明确区分购买者和使用者）
   }}

## B. 战略分析
2. "strategic_verdict": {{
     "summary": (String) 3-5句话的战略定调，包含：当前市场定位评估、核心竞争力、主要风险、战略建议,
     "pmf_score": (Integer) 产品市场匹配度评分 0-100,
     "pmf_analysis": (String) PMF 评分依据
   }}

3. "market_fit_analysis": {{
     "current_positioning": (String) 当前产品定位,
     "ideal_positioning": (String) 基于用户反馈的理想定位,
     "gap_analysis": (String) 定位差距分析,
     "recommendations": (Array) 调整建议 ["..."]
   }}

4. "core_swot": (Object) SWOT分析，**每项必须带 confidence 和 evidence**。格式: 
   {{
     "strengths": [{{
       "point": "...", 
       "source_tag": "Battery",
       "confidence": "high|medium|low",
       "evidence": {{
         "count": 30,
         "percentage": "23.5%",
         "sample_ids": ["uuid-1", "uuid-2"],
         "sample_quotes": ["电池续航很好...", "充电一次用三天..."]
       }}
     }}],
     "weaknesses": [{{...同上格式...}}],
     "opportunities": [{{
       "point": "...",
       "source_tag": "可选",
       "rationale": "机会分析依据"
     }}],
     "threats": [{{
       "point": "...",
       "source_tag": "可选", 
       "rationale": "威胁分析依据"
     }}]
   }}

5. "department_directives": (Object) 给各部门的详细指令。格式: 
   {{
     "to_marketing": {{
       "directive": "一句话指令",
       "key_actions": ["具体行动1", "具体行动2"],
       "kpi": "衡量指标"
     }},
     "to_product": {{...同上格式...}},
     "to_supply_chain": {{...同上格式...}},
     "to_customer_service": {{...同上格式...}}
   }}

6. "priority_actions": (Array) Top 5 优先行动项，**必须带 confidence 和 evidence**。格式: 
   [{{
     "action": "具体行动描述",
     "owner": "责任部门",
     "priority": "P0/P1/P2",
     "deadline": "建议时间线",
     "expected_impact": "预期影响",
     "confidence": "high|medium|low",
     "source_tag": "关联标签",
     "evidence": {{
       "count": 数字,
       "percentage": "百分比",
       "sample_ids": ["uuid-1"],
       "sample_quotes": ["相关引用..."]
     }}
   }}]

7. "risk_assessment": {{
     "overall_level": (String) "low|medium|high|critical",
     "key_risks": [{{
       "risk": "风险描述",
       "probability": "high|medium|low",
       "impact": "high|medium|low",
       "mitigation": "缓解措施",
       "source_tag": "关联痛点标签",
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }}]
   }}

8. "executive_summary": (String) 150字以内的执行摘要，供高管快速阅读

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 2. [运营/市场版] CMO视角
# ------------------------------------------------------------------
OPERATIONS_PROMPT = """你是一位**首席营销官(CMO)**，精通电商运营和用户增长。请基于统计数据，为**运营团队**生成一份专业的JSON格式策略报告。

# 核心目标
挖掘产品卖点(Hooks)，规避退货风险，精准定位广告受众，优化转化漏斗。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像与市场定位 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像分析，用于精准营销。格式:
   {{
     "primary_buyers": {{
       "description": (String) **主要购买者**描述（结合 Buyer 数据），
       "confidence": "high|medium|low",
       "evidence": {{
         "count": 数字,
         "percentage": "百分比",
         "sample_ids": ["uuid-1", "uuid-2"],
         "sample_quotes": ["引用1...", "引用2..."]
       }}
     }},
     "primary_users": {{
       "description": (String) **主要使用者**描述（结合 User 数据），
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "secondary_audience": (String) 次要/潜在人群,
     "usage_context": {{
       "description": (String) 核心使用场景描述,
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "buying_triggers": (Array) 购买触发点 ["..."],
     "use_cases": (Array) 典型用例 ["..."],
     "ad_targeting_keywords": (Array) 广告投放关键词建议 ["..."],
     "negative_keywords": (Array) 建议排除的关键词（避免错误流量）["..."]
   }}

## B. 营销策略
2. "executive_summary": {{
     "market_status": (String) 市场现状3-5句话总结,
     "key_opportunity": (String) 最大机会点,
     "key_risk": (String) 最大风险点,
     "recommended_action": (String) 首要建议行动
   }}

3. "selling_points": (Array) 提炼5个核心卖点，**必须带 confidence 和 evidence**。格式: 
   [{{
     "title": "卖点标题（如：超长续航）",
     "copywriting": "广告文案建议（50字以内）",
     "hook": "一句话钩子（用于广告开头）",
     "source_tag": "Battery",
     "confidence": "high|medium|low",
     "evidence": {{
       "count": 30,
       "percentage": "23.5%",
       "sample_ids": ["uuid-1", "uuid-2"],
       "sample_quotes": ["电池很耐用...", "充电一次用三天..."]
     }}
   }}]

4. "marketing_risks": (Array) 客服预警痛点，**必须带 confidence 和 evidence**。格式: 
   [{{
     "risk": "风险描述",
     "severity": "high|medium|low",
     "talking_points": "客服话术建议",
     "preemptive_action": "预防措施（如：在Listing中提前说明）",
     "source_tag": "Battery",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

5. "target_audience": {{
     "primary_segments": [{{
       "segment": "人群名称",
       "size_estimate": "规模估计（如：占比30%）",
       "key_messaging": "针对性信息",
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }}],
     "secondary_segments": ["..."],
     "ad_strategy": {{
       "platform_recommendations": ["推荐投放平台"],
       "budget_allocation": "预算分配建议",
       "creative_direction": "创意方向建议"
     }}
   }}

6. "competitor_analysis": {{
     "mentioned_competitors": (Array) 用户提到的竞品 ["..."],
     "our_advantages": (Array) 相比竞品的优势 ["..."],
     "our_disadvantages": (Array) 相比竞品的劣势 ["..."],
     "differentiation_strategy": (String) 差异化策略建议,
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}

7. "listing_optimization": (Array) Listing 优化建议，**必须带 confidence 和 evidence**。格式: 
   [{{
     "element": "Title|Bullets|Images|A+Content|Backend Keywords",
     "current_issue": "当前问题",
     "suggestion": "优化建议",
     "priority": "P0|P1|P2",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

8. "review_response_templates": (Array) 差评回复模板，**必须带 confidence 和 evidence**。格式: 
   [{{
     "pain_point": "痛点描述",
     "response_template": "回复模板（100字以内）",
     "follow_up_action": "后续行动建议",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

9. "conversion_funnel_analysis": {{
     "traffic_quality": (String) 流量质量分析,
     "conversion_barriers": (Array) 转化障碍 ["..."],
     "optimization_suggestions": (Array) 优化建议 ["..."]
   }}

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 3. [产品/研发版] CPO视角
# ------------------------------------------------------------------
PRODUCT_PROMPT = """你是一位**产品总监(CPO)**，专注于用户体验和产品迭代。请基于统计数据，为**研发团队**生成一份专业的JSON格式迭代建议书。

# 核心目标
发现设计缺陷，明确下一代产品(Next-Gen)的改进方向，提升用户满意度。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户研究洞察 (基于 5W Context 数据)
1. "user_research": (Object) 用户研究洞察，用于产品设计。格式:
   {{
     "target_buyers": {{
       "description": (String) **购买者群体**画像,
       "decision_factors": (Array) 购买决策因素 ["..."],
       "confidence": "high|medium|low",
       "evidence": {{
         "count": 数字,
         "percentage": "百分比",
         "sample_ids": ["uuid-1", "uuid-2"],
         "sample_quotes": ["引用1...", "引用2..."]
       }}
     }},
     "target_users": {{
       "description": (String) **使用者群体**画像,
       "usage_frequency": (String) 使用频率分析,
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "user_pain_points_by_group": (Array) 按用户类型分类的痛点:
       [{{
         "user_group": "老年用户",
         "pain_points": ["按键太小", "字体看不清"],
         "design_implications": "适老化设计需求",
         "confidence": "high|medium|low",
         "evidence": {{...}}
       }}],
     "real_usage_environments": {{
       "environments": (Array) 真实使用环境 ["车内", "办公室", "..."],
       "unexpected_scenarios": (Array) 超出设计预期的场景 ["..."],
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }},
     "jobs_to_be_done": {{
       "primary_jtbd": (String) 核心用户任务,
       "secondary_jtbd": (Array) 次要任务 ["..."],
       "unmet_jtbd": (Array) 未满足的任务 ["..."],
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }},
     "expectation_gap": {{
       "user_expectations": (Array) 用户期望 ["..."],
       "current_reality": (Array) 产品现状 ["..."],
       "gap_analysis": (String) 差距分析
     }}
   }}

## B. 产品质量评估
2. "quality_assessment": {{
     "overall_score": (Integer) 0-100分,
     "scoring_breakdown": {{
       "functionality": (Integer) 功能性得分 0-100,
       "usability": (Integer) 易用性得分 0-100,
       "reliability": (Integer) 可靠性得分 0-100,
       "aesthetics": (Integer) 外观得分 0-100
     }},
     "scoring_rationale": (String) 评分依据
   }}

3. "critical_bugs": (Array) Top 5 致命缺陷，**必须带 confidence 和 evidence**。格式: 
   [{{
     "issue": "问题描述",
     "severity": "Critical|High|Medium|Low",
     "affected_users": "受影响用户群体",
     "frequency": "发生频率估计",
     "root_cause_hypothesis": "根因假设",
     "suggested_fix": "建议修复方案",
     "priority": "P0|P1|P2",
     "source_tag": "Battery",
     "confidence": "high|medium|low",
     "evidence": {{
       "count": 30,
       "percentage": "23.5%",
       "sample_ids": ["uuid-1", "uuid-2"],
       "sample_quotes": ["电池经常死机...", "用了两周就坏了..."]
     }}
   }}]

4. "unmet_needs": (Array) 用户期望的功能，**必须带 confidence 和 evidence**。格式: 
   [{{
     "feature": "功能描述",
     "user_demand_level": "High|Medium|Low",
     "implementation_complexity": "High|Medium|Low",
     "business_value": "High|Medium|Low",
     "recommendation": "建议实现方式",
     "priority": "P0|P1|P2",
     "source_tag": "LED Light",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

5. "usage_context_analysis": {{
     "designed_for": (String) 产品设计的目标场景,
     "actually_used_for": (Array) 实际使用场景 ["..."],
     "context_gaps": (Array) 场景差距 ["..."],
     "design_adaptations_needed": (Array) 需要的设计调整 ["..."],
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}

6. "product_roadmap": {{
     "next_version_focus": (String) 下版本核心方向,
     "short_term_fixes": (Array) 短期修复项（1个月内）["..."],
     "medium_term_improvements": (Array) 中期改进项（3个月内）["..."],
     "long_term_innovations": (Array) 长期创新项（6个月+）["..."],
     "version_naming_suggestion": (String) 版本命名建议（如 V2.0 - 适老化升级版）
   }}

7. "usability_issues": (Array) 易用性问题，**必须带 confidence 和 evidence**。格式: 
   [{{
     "issue": "问题描述",
     "affected_user_group": "受影响群体",
     "impact_level": "High|Medium|Low",
     "current_workaround": "用户当前的解决方法（如果有）",
     "suggested_improvement": "改进建议",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

8. "design_recommendations": (Array) 设计改进建议，**必须带 confidence 和 evidence**。格式: 
   [{{
     "area": "改进领域（如：按钮设计、包装、说明书）",
     "current_state": "当前状态",
     "user_feedback": "用户反馈摘要",
     "recommendation": "改进建议",
     "expected_impact": "预期影响",
     "priority": "P0|P1|P2",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

9. "competitive_feature_gap": {{
     "features_users_expect": (Array) 用户期望我们有的功能（可能来自竞品）["..."],
     "our_unique_advantages": (Array) 我们的独特优势 ["..."],
     "recommendations": (Array) 功能差距建议 ["..."]
   }}

""" + COMMON_INSTRUCTION

# ------------------------------------------------------------------
# 4. [供应链/质检版] 供应链总监视角
# ------------------------------------------------------------------
SUPPLY_CHAIN_PROMPT = """你是一位**供应链总监**，专注于质量管理和成本控制。请基于统计数据，为**工厂和QC团队**生成一份专业的JSON格式质量整改报告。

# 核心目标
降低退货率(Return Rate)，优化包装，追责供应商，提升出厂良品率。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 使用场景与质量需求 (基于 5W Context 数据)
1. "usage_context_analysis": (Object) 使用环境分析，用于质量标准制定。格式:
   {{
     "buyer_groups": {{
       "description": (String) **购买者群体**画像,
       "quality_expectations": (Array) 购买者的质量期望 ["..."],
       "confidence": "high|medium|low",
       "evidence": {{
         "count": 数字,
         "percentage": "百分比",
         "sample_ids": ["uuid-1", "uuid-2"],
         "sample_quotes": ["引用1...", "引用2..."]
       }}
     }},
     "user_groups": {{
       "description": (String) **使用者群体**画像,
       "special_requirements": (Array) 特殊质量要求（如儿童安全、老人易用）["..."],
       "confidence": "high|medium|low",
       "evidence": {{...同上格式...}}
     }},
     "usage_environments": {{
       "environments": (Array) 主要使用环境 ["户外", "潮湿环境", "..."],
       "environmental_stress_factors": (Array) 环境压力因素 ["高温", "震动", "..."],
       "quality_implications": (String) 对质量标准的影响,
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }},
     "usage_intensity": {{
       "frequency": (String) 使用频率分析,
       "duration": (String) 单次使用时长,
       "durability_requirements": (Array) 耐久性要求 ["..."],
       "confidence": "high|medium|low",
       "evidence": {{...}}
     }}
   }}

## B. 质量问题分析
2. "quality_summary": {{
     "summary": (String) 质量概况总结文本,
     "confidence": (String) "high"|"medium"|"low",
     "evidence": (Array) 证据引用 [{{"review_id": "...", "quote": "..."}}],
     "overall_quality_score": (Integer) **必填** 0-100分质量评分，基于负面反馈比例和严重程度计算,
     "estimated_return_rate": (String) **必填** 估计退货率（如"15-20%"），基于退货原因分析,
     "top_quality_issues": (Array) Top 3 质量问题概要 ["..."],
     "improvement_priority": (String) 优先改进方向
   }}

3. "material_defects": (Array) 材质做工问题，**必须带 confidence 和 evidence**。格式: 
   [{{
     "part": "部件名称（如：外壳、按键、密封圈）",
     "problem": "问题描述",
     "frequency": "High|Medium|Low",
     "affected_percentage": "受影响比例估计",
     "root_cause_hypothesis": "根因假设",
     "suggested_fix": "建议修复方案",
     "supplier_action": "供应商整改要求",
     "source_tag": "Build Quality",
     "confidence": "high|medium|low",
     "evidence": {{
       "count": 数字,
       "percentage": "百分比",
       "sample_ids": ["uuid-1", "uuid-2"],
       "sample_quotes": ["塑料感很强...", "用了两周就裂了..."]
     }}
   }}]

4. "packaging_issues": {{
     "has_damage_reports": (Boolean) 是否有包装损坏报告,
     "damage_types": (Array) 损坏类型 ["运输破损", "包装不足", "..."],
     "current_packaging": (String) 当前包装描述,
     "improvement_suggestions": (Array) 改进建议 ["加厚泡沫", "增加角保护", "..."],
     "cost_impact_estimate": (String) 成本影响估计,
     "source_tag": "Packaging",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}

5. "missing_parts": (Array) 漏发配件问题，**必须带 confidence 和 evidence**。格式: 
   [{{
     "part": "配件名称",
     "frequency": "High|Medium|Low",
     "packing_station_issue": "可能的包装工位问题",
     "prevention_measure": "预防措施",
     "source_tag": "Missing Parts",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

6. "qc_checklist": (Array) 出货前必检项目，**必须带 confidence 和 evidence**。格式: 
   [{{
     "item": "检查项目",
     "check_method": "检查方法",
     "acceptance_criteria": "合格标准",
     "priority": "Critical|High|Medium",
     "related_complaints": "相关投诉数量",
     "source_tag": "Battery",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

7. "supplier_issues": (Array) 供应商问题，**必须带 confidence 和 evidence**。格式: 
   [{{
     "component": "部件名称",
     "issue": "问题描述",
     "severity": "Critical|High|Medium|Low",
     "recommended_action": "建议行动（如：更换供应商、加强来料检验）",
     "timeline": "整改时间线",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

8. "return_rate_factors": (Array) 退货原因分析，**必须带 confidence 和 evidence**。格式: 
   [{{
     "reason": "退货原因",
     "estimated_percentage": "占退货比例估计",
     "preventable": (Boolean) 是否可预防,
     "prevention_measure": "预防措施",
     "cost_of_inaction": "不行动的成本估计",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

9. "assembly_defects": (Array) 组装问题，**必须带 confidence 和 evidence**。格式: 
   [{{
     "defect": "缺陷描述",
     "frequency": "High|Medium|Low",
     "likely_station": "可能的工位",
     "detection_method": "检测方法建议",
     "correction_action": "纠正措施",
     "source_tag": "关联标签",
     "confidence": "high|medium|low",
     "evidence": {{...}}
   }}]

10. "continuous_improvement": {{
      "immediate_actions": (Array) 立即行动项（本周）["..."],
      "short_term_actions": (Array) 短期行动项（本月）["..."],
      "process_improvements": (Array) 流程改进建议 ["..."],
      "training_needs": (Array) 培训需求 ["..."]
    }}

""" + COMMON_INSTRUCTION

# ==========================================
# [REPORT TYPE CONFIGS] 统一配置注册表
# ==========================================
# 导入 ReportTypeConfig
from app.models.report import ReportTypeConfig

# [MAP] 映射表：类型 -> Prompt（保留向后兼容）
PROMPT_MAP = {
    ReportType.COMPREHENSIVE.value: COMPREHENSIVE_PROMPT,
    ReportType.OPERATIONS.value: OPERATIONS_PROMPT,
    ReportType.PRODUCT.value: PRODUCT_PROMPT,
    ReportType.SUPPLY_CHAIN.value: SUPPLY_CHAIN_PROMPT,
}

# [NEW] 统一配置注册表 - 管理所有报告类型的元数据
# 添加新类型时，在此添加配置项即可
REPORT_TYPE_CONFIGS: Dict[str, ReportTypeConfig] = {
    ReportType.COMPREHENSIVE.value: ReportTypeConfig(
        key=ReportType.COMPREHENSIVE.value,
        display_name="全维度战略分析报告",
        short_name="CEO综合版",
        description="面向企业高管的全局战略视角报告，评估产品市场匹配度(PMF)、SWOT分析、部门指令",
        target_audience="CEO/企业高管/战略决策层",
        icon="🎯",
        color="#4F46E5",
        sort_order=1,
        is_active=True,
        expected_fields=["user_profile", "strategic_verdict", "market_fit_analysis", "core_swot", "department_directives", "priority_actions", "risk_level"],
        category="strategy"
    ),
    ReportType.OPERATIONS.value: ReportTypeConfig(
        key=ReportType.OPERATIONS.value,
        display_name="运营与市场策略报告",
        short_name="运营版",
        description="面向运营团队的营销策略报告，挖掘产品卖点、规避退货风险、精准定位广告受众",
        target_audience="CMO/运营经理/市场营销团队",
        icon="📈",
        color="#059669",
        sort_order=2,
        is_active=True,
        expected_fields=["user_profile", "executive_summary", "selling_points", "marketing_risks", "target_audience", "competitor_analysis", "listing_optimization", "review_response_templates"],
        category="operations"
    ),
    ReportType.PRODUCT.value: ReportTypeConfig(
        key=ReportType.PRODUCT.value,
        display_name="产品迭代建议书",
        short_name="产品版",
        description="面向研发团队的产品改进报告，发现设计缺陷、明确下一代产品改进方向",
        target_audience="CPO/产品经理/研发团队",
        icon="🔧",
        color="#D97706",
        sort_order=3,
        is_active=True,
        expected_fields=["user_research", "quality_score", "critical_bugs", "unmet_needs", "usage_context_gap", "roadmap_suggestion", "usability_issues", "design_recommendations"],
        category="product"
    ),
    ReportType.SUPPLY_CHAIN.value: ReportTypeConfig(
        key=ReportType.SUPPLY_CHAIN.value,
        display_name="供应链质量整改报告",
        short_name="供应链版",
        description="面向工厂和QC团队的质量整改报告，降低退货率、优化包装、追责供应商",
        target_audience="供应链总监/QC团队/工厂管理",
        icon="🏭",
        color="#DC2626",
        sort_order=4,
        is_active=True,
        expected_fields=["usage_context_analysis", "material_defects", "packaging_issues", "missing_parts", "qc_checklist", "supplier_issues", "return_rate_factors", "assembly_defects"],
        category="quality"
    ),
    # ==========================================
    # [预留扩展位置] 未来可添加更多类型：
    # ==========================================
    # "logistics": ReportTypeConfig(
    #     key="logistics",
    #     display_name="物流配送优化报告",
    #     short_name="物流版",
    #     description="分析物流相关问题，优化配送体验",
    #     target_audience="物流经理/仓储团队",
    #     icon="🚚",
    #     color="#8B5CF6",
    #     sort_order=5,
    #     expected_fields=["delivery_issues", "packaging_damage", "logistics_recommendations"],
    #     category="logistics"
    # ),
}

# 报告标题映射（向后兼容，从配置中自动生成）
REPORT_TITLE_MAP = {key: config.display_name for key, config in REPORT_TYPE_CONFIGS.items()}


# ==========================================
# [辅助函数] 报告类型管理
# ==========================================

def get_available_report_types() -> List[ReportTypeConfig]:
    """
    获取所有可用（已启用）的报告类型配置
    
    Returns:
        按 sort_order 排序的配置列表
    """
    return sorted(
        [c for c in REPORT_TYPE_CONFIGS.values() if c.is_active],
        key=lambda x: x.sort_order
    )


def get_report_type_config(type_key: str) -> Optional[ReportTypeConfig]:
    """
    获取指定类型的配置
    
    Args:
        type_key: 报告类型标识（如 "comprehensive"）
        
    Returns:
        ReportTypeConfig 对象，或 None（如果类型不存在）
    """
    return REPORT_TYPE_CONFIGS.get(type_key)


def validate_report_type(type_key: str) -> bool:
    """
    验证报告类型是否有效且已启用
    
    Args:
        type_key: 报告类型标识
        
    Returns:
        True 如果类型有效且已启用
    """
    config = REPORT_TYPE_CONFIGS.get(type_key)
    return config is not None and config.is_active


def get_prompt_for_type(type_key: str) -> Optional[str]:
    """
    获取指定类型的 Prompt 模板
    
    Args:
        type_key: 报告类型标识
        
    Returns:
        Prompt 模板字符串，或 None
    """
    return PROMPT_MAP.get(type_key)


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
        min_reviews: int = 30,  # [UPDATED 2026-01-19] 报告生成需要至少30条评论
        save_to_db: bool = True,
        force_regenerate: bool = False,  # [NEW] 是否强制重新生成（忽略去重）
        require_full_completion: bool = True  # [NEW] 是否要求洞察和主题100%完成
    ) -> dict:
        """
        核心入口：生成指定类型的结构化报告 (JSON)
        
        Args:
            product_id: 产品 UUID
            report_type: 报告类型 (使用 ReportType 枚举值)
            min_reviews: 最少评论数（默认 30，报告生成需要足够数据量保证质量）
            save_to_db: 是否存入数据库（默认 True）
            force_regenerate: 是否强制重新生成（默认 False，会检查去重）
            require_full_completion: 是否要求洞察和主题100%完成（默认 True）
            
        Returns:
            {
                "success": True/False,
                "report": ProductReport 对象的 dict,
                "stats": {...原始统计数据...},
                "report_type_config": {...报告类型配置...},
                "error": "错误信息（如果失败）"
            }
            
        Note:
            支持的报告类型请参考 REPORT_TYPE_CONFIGS 配置表
        """
        try:
            # 0. [NEW] 验证报告类型
            type_config = get_report_type_config(report_type)
            if not type_config:
                return {
                    "success": False,
                    "report": None,
                    "stats": None,
                    "report_type_config": None,
                    "error": f"不支持的报告类型: {report_type}。可用类型: {', '.join(REPORT_TYPE_CONFIGS.keys())}"
                }
            
            if not type_config.is_active:
                return {
                    "success": False,
                    "report": None,
                    "stats": None,
                    "report_type_config": type_config.to_dict(),
                    "error": f"报告类型 '{type_config.display_name}' 当前已禁用"
                }
            
            # [NEW] 0.5 检查去重：1小时内是否已有相同类型的报告
            if not force_regenerate:
                from datetime import timedelta
                one_hour_ago = datetime.now() - timedelta(hours=1)
                
                existing_report_result = await self.db.execute(
                    select(ProductReport)
                    .where(
                        and_(
                            ProductReport.product_id == product_id,
                            ProductReport.report_type == report_type,
                            ProductReport.status == ReportStatus.COMPLETED.value,
                            ProductReport.created_at >= one_hour_ago
                        )
                    )
                    .order_by(ProductReport.created_at.desc())
                    .limit(1)
                )
                existing_report = existing_report_result.scalar_one_or_none()
                
                if existing_report:
                    logger.info(f"[去重] 产品 {product_id} 在1小时内已有 {report_type} 报告，跳过生成")
                    return {
                        "success": True,
                        "report": existing_report.to_dict(),
                        "stats": existing_report.analysis_data,
                        "report_type_config": type_config.to_dict(),
                        "error": None,
                        "is_cached": True  # 标记为缓存结果
                    }
            
            # 1. 获取产品信息
            product = await self._get_product(product_id)
            if not product:
                return {
                    "success": False,
                    "report": None,
                    "stats": None,
                    "report_type_config": type_config.to_dict(),
                    "error": "产品不存在"
                }
            
            # 2. 检查数据量
            total_reviews = await self._count_translated_reviews(product_id)
            
            # [UPDATED 2026-01-19] 报告生成需要至少30条评论以保证分析质量
            if total_reviews < min_reviews:
                return {
                    "success": False,
                    "report": None,
                    "stats": {"total_reviews": total_reviews},
                    "report_type_config": type_config.to_dict(),
                    "error": f"评论数据不足，无法生成高质量报告。当前仅有 {total_reviews} 条评论，建议采集至少 {min_reviews} 条评论后再生成报告。"
                }
            
            # [NEW] 2.5 检查洞察和主题是否100%完成
            if require_full_completion:
                from app.models.insight import ReviewInsight
                from app.models.theme_highlight import ReviewThemeHighlight
                
                # 检查洞察完成度
                insight_count_result = await self.db.execute(
                    select(func.count(func.distinct(ReviewInsight.review_id)))
                    .select_from(ReviewInsight)
                    .join(Review, ReviewInsight.review_id == Review.id)
                    .where(Review.product_id == product_id)
                )
                insight_count = insight_count_result.scalar() or 0
                
                # 检查主题完成度
                theme_count_result = await self.db.execute(
                    select(func.count(func.distinct(ReviewThemeHighlight.review_id)))
                    .select_from(ReviewThemeHighlight)
                    .join(Review, ReviewThemeHighlight.review_id == Review.id)
                    .where(Review.product_id == product_id)
                )
                theme_count = theme_count_result.scalar() or 0
                
                # 计算完成度
                insight_completion = insight_count / total_reviews if total_reviews > 0 else 0
                theme_completion = theme_count / total_reviews if total_reviews > 0 else 0
                
                logger.info(f"[完成度检查] 洞察: {insight_count}/{total_reviews} ({insight_completion:.1%}), 主题: {theme_count}/{total_reviews} ({theme_completion:.1%})")
                
                # 要求100%完成（或允许少量误差，如95%）
                COMPLETION_THRESHOLD = 0.95
                
                if insight_completion < COMPLETION_THRESHOLD:
                    return {
                        "success": False,
                        "report": None,
                        "stats": {
                            "total_reviews": total_reviews,
                            "insight_count": insight_count,
                            "theme_count": theme_count,
                            "insight_completion": f"{insight_completion:.1%}",
                            "theme_completion": f"{theme_completion:.1%}"
                        },
                        "report_type_config": type_config.to_dict(),
                        "error": f"洞察提取未完成（{insight_count}/{total_reviews}，{insight_completion:.1%}）。请等待洞察提取完成后再生成报告。"
                    }
                
                if theme_completion < COMPLETION_THRESHOLD:
                    return {
                        "success": False,
                        "report": None,
                        "stats": {
                            "total_reviews": total_reviews,
                            "insight_count": insight_count,
                            "theme_count": theme_count,
                            "insight_completion": f"{insight_completion:.1%}",
                            "theme_completion": f"{theme_completion:.1%}"
                        },
                        "report_type_config": type_config.to_dict(),
                        "error": f"主题提取未完成（{theme_count}/{total_reviews}，{theme_completion:.1%}）。请等待主题提取完成后再生成报告。"
                    }
            
            # 3. 聚合原始数据 (Raw Data) - ECharts 格式
            context_stats = await self._aggregate_5w_stats(product_id)
            insight_stats = await self._aggregate_insight_stats(product_id)
            
            # 4. [关键] 数据融合格式化 - 喂给 LLM
            stats_text = self._format_stats_for_llm(context_stats, insight_stats, total_reviews)
            
            # 5. [UPDATED] 从配置表获取 Prompt
            prompt_template = get_prompt_for_type(report_type)
            if not prompt_template:
                prompt_template = COMPREHENSIVE_PROMPT  # 降级到默认
                logger.warning(f"No prompt found for type '{report_type}', falling back to comprehensive")
            final_prompt = prompt_template.format(stats_text=stats_text)
            
            # 6. 调用 LLM (强制 JSON 输出)
            if not translation_service.client:
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "total_reviews": total_reviews,
                        "context": context_stats,
                        "insight": insight_stats
                    },
                    "report_type_config": type_config.to_dict(),
                    "error": "AI 服务未配置（缺少 API Key）"
                }
            
            try:
                logger.info(f"Generating {report_type} report for product {product.asin}...")
                
                # === 分模块生成策略 ===
                # 将大报告拆分成多个小模块，分别调用 AI，然后合并
                parsed_content = await self._generate_report_in_modules(
                    report_type=report_type,
                    stats_text=stats_text,
                    prompt_template=prompt_template
                )
                
                cleaned_json_str = json.dumps(parsed_content, ensure_ascii=False)
                logger.info(f"成功生成报告，共 {len(parsed_content)} 个顶级字段")
                
                # 7. 构建 analysis_data (原始统计数据，给前端画图)
                analysis_data = {
                    "total_reviews": total_reviews,  # 顶层，符合 ReportStats 接口
                    "context": context_stats,
                    "insight": insight_stats,
                    "meta": {
                        "total_reviews": total_reviews,  # 保留在 meta 中用于兼容
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
                        "report_type_config": type_config.to_dict(),
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
                        "report_type_config": type_config.to_dict(),
                        "error": None
                    }
                
            except Exception as e:
                logger.error(f"AI 报告生成失败: {e}")
                return {
                    "success": False,
                    "report": None,
                    "stats": {
                        "total_reviews": total_reviews,
                        "context": context_stats,
                        "insight": insight_stats
                    },
                    "report_type_config": type_config.to_dict(),
                    "error": f"AI 报告生成失败: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"报告生成过程出错: {e}")
            return {
                "success": False,
                "report": None,
                "stats": None,
                "report_type_config": None,
                "error": f"报告生成失败: {str(e)}"
            }
    
    async def _generate_report_in_modules(
        self,
        report_type: str,
        stats_text: str,
        prompt_template: str
    ) -> Dict[str, Any]:
        """
        分模块生成报告 - 将大报告拆分成多个小模块分别生成，提高成功率
        
        策略：
        1. 根据报告类型定义模块列表
        2. 每个模块独立调用 AI
        3. 合并所有模块的输出
        """
        # 定义各报告类型的模块
        MODULE_CONFIGS = {
            "comprehensive": [
                {"name": "user_profile", "fields": ["user_profile"], "desc": "用户画像分析（购买者、使用者、场景、动机）"},
                {"name": "strategy", "fields": ["strategic_verdict", "market_fit_analysis", "risk_level"], "desc": "战略定调与市场匹配度"},
                {"name": "swot", "fields": ["core_swot"], "desc": "SWOT分析（优势、劣势、机会、威胁）"},
                {"name": "actions", "fields": ["department_directives", "priority_actions"], "desc": "部门指令与优先行动项"},
            ],
            "operations": [
                {"name": "user_profile", "fields": ["user_profile"], "desc": "用户画像与市场定位"},
                {"name": "marketing", "fields": ["executive_summary", "selling_points"], "desc": "市场现状与核心卖点"},
                {"name": "risks", "fields": ["marketing_risks", "target_audience", "competitor_analysis"], "desc": "营销风险与竞品分析"},
                {"name": "optimization", "fields": ["listing_optimization", "review_response_templates"], "desc": "Listing优化与差评回复"},
            ],
            "product": [
                {"name": "user_research", "fields": ["user_research"], "desc": "用户研究洞察"},
                {"name": "quality", "fields": ["quality_score", "critical_bugs"], "desc": "产品质量评估与致命缺陷"},
                {"name": "needs", "fields": ["unmet_needs", "usage_context_gap", "roadmap_suggestion"], "desc": "未满足需求与迭代方向"},
                {"name": "usability", "fields": ["usability_issues", "design_recommendations"], "desc": "易用性问题与设计建议"},
            ],
            "supply_chain": [
                {"name": "context", "fields": ["usage_context_analysis"], "desc": "使用场景与质量需求分析"},
                {"name": "quality", "fields": ["quality_summary", "material_defects", "packaging_issues"], "desc": "质量问题与包装分析"},
                {"name": "supplier", "fields": ["supplier_issues", "return_rate_factors", "missing_parts"], "desc": "供应商问题与退货分析"},
                {"name": "qc", "fields": ["qc_checklist", "assembly_defects"], "desc": "QC检查清单与组装问题"},
            ]
        }
        
        modules = MODULE_CONFIGS.get(report_type, MODULE_CONFIGS["comprehensive"])
        
        # 合并结果
        final_result = {}
        
        for module in modules:
            try:
                logger.info(f"生成模块: {module['name']} - {module['desc']}")
                
                # 构建模块专用 Prompt（加强格式约束）
                fields_format_hint = self._get_fields_format_hint(module['fields'])
                module_prompt = f"""基于以下数据，只生成 {module['desc']} 部分的 JSON。

# 输入数据
{stats_text}

# 输出格式要求（必须严格遵守）
1. 只输出 JSON 格式，不要任何解释文字
2. 只生成这些字段: {', '.join(module['fields'])}
3. **重要**: 以下字段必须是数组格式 [{{...}}, {{...}}]，即使只有一条数据：
   - usage_context_analysis, material_defects, packaging_issues, missing_parts
   - supplier_issues, return_rate_factors, qc_checklist, assembly_defects
   - user_profile, user_research, selling_points, critical_bugs
4. 每个对象必须包含:
   - "insight" 或 "issue": 主要内容描述
   - "confidence": "high" | "medium" | "low"
   - "evidence": [{{ "review_id": null, "quote": "引用原文" }}]
5. 使用中文
{fields_format_hint}

请直接输出 JSON:"""

                response = translation_service.client.chat.completions.create(
                    model="qwen-plus",  # 使用 qwen-plus，速度更快
                    messages=[
                        {"role": "system", "content": "You are a data analyst. Output JSON only. Always respond in Chinese."},
                        {"role": "user", "content": module_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                    timeout=60  # 每个模块60秒超时
                )
                
                content = response.choices[0].message.content
                cleaned = content.replace("```json", "").replace("```", "").strip()
                
                try:
                    module_data = json.loads(cleaned)
                    final_result.update(module_data)
                    logger.info(f"模块 {module['name']} 生成成功，包含 {len(module_data)} 个字段")
                except json.JSONDecodeError as e:
                    logger.warning(f"模块 {module['name']} JSON 解析失败: {e}")
                    
            except Exception as e:
                logger.warning(f"模块 {module['name']} 生成失败: {e}")
                # 继续生成其他模块
                continue
        
        if not final_result:
            raise Exception("所有模块生成失败")
        
        # 🔧 格式校验和修复
        final_result = self._normalize_report_format(final_result, report_type)
        
        return final_result
    
    def _get_fields_format_hint(self, fields: List[str]) -> str:
        """
        根据字段列表生成格式提示示例
        """
        hints = []
        
        FIELD_EXAMPLES = {
            # ========== 供应链报告字段 ==========
            "usage_context_analysis": '''
# usage_context_analysis 格式示例（必须是数组）:
"usage_context_analysis": [
  {"insight": "用户主要是...", "confidence": "high", "evidence": [{"review_id": null, "quote": "..."}]}
]''',
            "quality_summary": '''
# quality_summary 格式示例（单个对象）:
"quality_summary": {
  "summary": "整体质量评估描述...",
  "confidence": "high",
  "evidence": [{"review_id": null, "quote": "..."}]
}''',
            "material_defects": '''
# material_defects 格式示例（必须是数组）:
"material_defects": [
  {"issue": "问题描述...", "confidence": "high", "evidence": [{"review_id": null, "quote": "..."}]}
]''',
            "packaging_issues": '''
# packaging_issues 格式示例（必须是数组）:
"packaging_issues": [
  {"issue": "包装问题描述...", "confidence": "medium", "evidence": [...]}
]''',
            "missing_parts": '''
# missing_parts 格式示例（必须是数组）:
"missing_parts": [
  {"issue": "缺失配件描述...", "confidence": "medium", "evidence": [...]}
]''',
            "supplier_issues": '''
# supplier_issues 格式示例（必须是数组）:
"supplier_issues": [
  {"issue": "供应商问题描述...", "confidence": "high", "evidence": [...]}
]''',
            "return_rate_factors": '''
# return_rate_factors 格式示例（必须是数组）:
"return_rate_factors": [
  {"insight": "退货原因分析...", "confidence": "high", "evidence": [...]}
]''',
            "qc_checklist": '''
# qc_checklist 格式示例（必须是数组，每项包含 issue 字段）:
"qc_checklist": [
  {"issue": "检查项描述...", "suggestion": "建议措施", "confidence": "high", "evidence": [...]}
]''',
            "assembly_defects": '''
# assembly_defects 格式示例（必须是数组）:
"assembly_defects": [
  {"issue": "组装问题描述...", "confidence": "medium", "evidence": [...]}
]''',
            # ========== 综合报告字段 ==========
            "user_profile": '''
# user_profile 格式示例（必须是数组）:
"user_profile": [
  {"insight": "购买者画像描述...", "confidence": "high", "evidence": [...]},
  {"insight": "使用者特征...", "confidence": "medium", "evidence": [...]}
]''',
            "strategic_verdict": '''
# strategic_verdict 格式示例（字符串）:
"strategic_verdict": "战略定调描述文本..."''',
            "market_fit_analysis": '''
# market_fit_analysis 格式示例（数组）:
"market_fit_analysis": [
  {"insight": "市场匹配分析...", "confidence": "high", "evidence": [...]}
]''',
            "core_swot": '''
# core_swot 格式示例（必须是对象，包含四个分类数组）:
# 重要：这是一个对象，不是数组！必须按 strengths/weaknesses/opportunities/threats 分类
"core_swot": {
  "strengths": [
    {"point": "产品优势描述...", "confidence": "high", "evidence": [{"review_id": null, "quote": "用户正面评价..."}]}
  ],
  "weaknesses": [
    {"point": "产品劣势/痛点描述...", "confidence": "high", "evidence": [...]}
  ],
  "opportunities": [
    {"point": "市场机会描述...", "rationale": "机会分析依据"}
  ],
  "threats": [
    {"point": "潜在威胁描述...", "rationale": "威胁分析依据"}
  ]
}''',
            "department_directives": '''
# department_directives 格式示例（必须是数组，每项有 insight 和 department）:
"department_directives": [
  {"department": "市场部", "insight": "指令内容...", "confidence": "high", "evidence": [...]}
]''',
            "priority_actions": '''
# priority_actions 格式示例（必须是数组，每项有 action 字段）:
"priority_actions": [
  {"action": "行动描述...", "owner": "负责人", "priority": "P0", "confidence": "high", "evidence": [...]}
]''',
            # ========== 运营报告字段 ==========
            "selling_points": '''
# selling_points 格式示例（必须是数组）:
"selling_points": [
  {"insight": "卖点描述...", "confidence": "high", "evidence": [...]}
]''',
            "marketing_risks": '''
# marketing_risks 格式示例（必须是数组）:
"marketing_risks": [
  {"insight": "风险描述...", "confidence": "high", "evidence": [...]}
]''',
            "target_audience": '''
# target_audience 格式示例（必须是数组，不要嵌套其他字段）:
"target_audience": [
  {"insight": "目标受众描述...", "confidence": "high", "evidence": [...]}
]''',
            "competitor_analysis": '''
# competitor_analysis 格式示例（必须是数组，不要嵌套其他字段）:
"competitor_analysis": [
  {"insight": "竞品分析描述...", "confidence": "medium", "evidence": [...]}
]''',
            "listing_optimization": '''
# listing_optimization 格式示例（必须是数组）:
"listing_optimization": [
  {"element": "Title/Bullets/Images", "suggestion": "优化建议...", "confidence": "high", "evidence": [...]}
]''',
            "review_response_templates": '''
# review_response_templates 格式示例（必须是数组）:
"review_response_templates": [
  {"issue": "问题类型", "response": "回复模板内容...", "confidence": "medium", "evidence": [...]}
]''',
            "executive_summary": '''
# executive_summary 格式示例（可以是字符串或数组）:
"executive_summary": "执行摘要文本..."''',
            # ========== 产品报告字段 ==========
            "user_research": '''
# user_research 格式示例（必须是数组）:
"user_research": [
  {"insight": "用户研究洞察...", "confidence": "high", "evidence": [...]}
]''',
            "quality_score": '''
# quality_score 格式示例（对象）:
"quality_score": {
  "overall": 75,
  "design": 80,
  "functionality": 70
}''',
            "critical_bugs": '''
# critical_bugs 格式示例（必须是数组）:
"critical_bugs": [
  {"issue": "严重缺陷描述...", "priority": "P0", "confidence": "high", "evidence": [...]}
]''',
            "unmet_needs": '''
# unmet_needs 格式示例（必须是数组）:
"unmet_needs": [
  {"insight": "用户未满足需求...", "confidence": "medium", "evidence": [...]}
]''',
            "usability_issues": '''
# usability_issues 格式示例（必须是数组）:
"usability_issues": [
  {"insight": "易用性问题描述...", "confidence": "high", "evidence": [...]}
]''',
            "design_recommendations": '''
# design_recommendations 格式示例（必须是数组）:
"design_recommendations": [
  {"insight": "设计改进建议...", "confidence": "medium", "evidence": [...]}
]''',
            "usage_context_gap": '''
# usage_context_gap 格式示例（可以是字符串或数组）:
"usage_context_gap": "使用场景差距分析描述..."''',
            "roadmap_suggestion": '''
# roadmap_suggestion 格式示例（可以是字符串或数组）:
"roadmap_suggestion": "下版本升级方向描述..."''',
        }
        
        for field in fields:
            if field in FIELD_EXAMPLES:
                hints.append(FIELD_EXAMPLES[field])
        
        return "\n".join(hints) if hints else ""
    
    def _normalize_report_format(self, data: Dict[str, Any], report_type: str) -> Dict[str, Any]:
        """
        🔧 标准化报告输出格式
        
        AI 输出经常不遵守 prompt 定义的格式，这里进行统一修复：
        1. 将应该是数组的字段转换为数组
        2. 统一字段名（如 issue -> insight）
        3. 确保必要字段存在
        """
        result = data.copy()
        
        # ==========================================
        # 通用修复：将单对象转为数组
        # ==========================================
        ARRAY_FIELDS = {
            # 供应链报告
            "usage_context_analysis": True,
            "material_defects": True,
            "packaging_issues": True,
            "missing_parts": True,
            "supplier_issues": True,
            "return_rate_factors": True,
            "qc_checklist": True,
            "assembly_defects": True,
            # 综合报告
            "user_profile": True,
            "priority_actions": True,
            # 运营报告
            "selling_points": True,
            "marketing_risks": True,
            "review_response_templates": True,
            # 产品报告
            "user_research": True,
            "critical_bugs": True,
            "unmet_needs": True,
            "usability_issues": True,
            "design_recommendations": True,
        }
        
        for field, should_be_array in ARRAY_FIELDS.items():
            if field in result and should_be_array:
                value = result[field]
                # 如果是单个对象且有 issue/insight 等内容字段，转为数组
                if isinstance(value, dict) and not isinstance(value, list):
                    # 检查是否是"已转换"的嵌套结构（如 {issues: [...]}）
                    if 'issues' in value and isinstance(value['issues'], list):
                        result[field] = value['issues']
                    elif 'items' in value and isinstance(value['items'], list):
                        result[field] = value['items']
                    else:
                        # 单对象转数组
                        result[field] = [value]
                        logger.info(f"[格式修复] {field}: 单对象转为数组")
        
        # ==========================================
        # 供应链报告专用修复
        # ==========================================
        if report_type == "supply_chain":
            # 1. usage_context_analysis 字段标准化
            if "usage_context_analysis" in result:
                items = result["usage_context_analysis"]
                if isinstance(items, list):
                    for item in items:
                        # 确保有 insight 字段（从 issue 复制）
                        if 'issue' in item and 'insight' not in item:
                            item['insight'] = item['issue']
                        # 确保有 evidence 字段
                        if 'evidence' not in item:
                            item['evidence'] = []
            
            # 2. quality_summary 字段标准化
            if "quality_summary" in result:
                qs = result["quality_summary"]
                if isinstance(qs, dict):
                    # 确保有 summary 字段（从 issue 复制）
                    if 'issue' in qs and 'summary' not in qs:
                        qs['summary'] = qs['issue']
            
            # 3. 其他数组字段标准化
            for field in ["material_defects", "packaging_issues", "supplier_issues", 
                          "return_rate_factors", "missing_parts", "qc_checklist", "assembly_defects"]:
                if field in result:
                    items = result[field]
                    if isinstance(items, list):
                        for item in items:
                            # 确保有 confidence 字段
                            if 'confidence' not in item:
                                item['confidence'] = 'medium'
                            # 确保有 evidence 字段
                            if 'evidence' not in item:
                                item['evidence'] = []
        
        # ==========================================
        # 通用字段标准化
        # ==========================================
        for field in ["user_profile", "user_research"]:
            if field in result and isinstance(result[field], list):
                for item in result[field]:
                    # 确保有 insight 字段
                    if 'insight' not in item:
                        # 尝试从其他字段获取
                        for alt in ['issue', 'description', 'point', 'buyer', 'user', 
                                    'scenario', 'motivation', 'what', 'where', 'when', 'why']:
                            if alt in item:
                                item['insight'] = item[alt]
                                break
                    # 确保有 confidence 字段
                    if 'confidence' not in item:
                        item['confidence'] = 'medium'
                    # 确保有 evidence 字段
                    if 'evidence' not in item:
                        item['evidence'] = []
        
        # ==========================================
        # 综合报告专用修复：core_swot
        # ==========================================
        if report_type == "comprehensive" and "core_swot" in result:
            swot = result["core_swot"]
            
            # 如果 core_swot 是数组格式，转换为对象格式
            if isinstance(swot, list):
                logger.info(f"[格式修复] core_swot 是数组格式，需要转换为对象格式")
                
                # 尝试基于关键词分类
                strengths = []
                weaknesses = []
                opportunities = []
                threats = []
                
                positive_keywords = ['优势', '优点', '卖点', '亮点', '好评', '满意', '出色', '优秀', '高质量', 
                                     '续航', '保温', '设计好', '做工好', '质量好', '性价比', '推荐', '喜欢', '五星']
                negative_keywords = ['劣势', '缺点', '问题', '痛点', '差评', '失望', '糟糕', '质量差', '损坏', 
                                     '故障', '坏了', '不满', '退货', '售后', '充电慢', '电池衰减', '不耐用']
                opportunity_keywords = ['机会', '潜力', '市场', '增长', '需求', '趋势', '空间', '拓展', '场景']
                threat_keywords = ['威胁', '风险', '竞争', '挑战', '下降', '流失', '负面', '危机']
                
                for item in swot:
                    if not isinstance(item, dict):
                        continue
                    
                    # 获取文本内容用于分类
                    text = str(item.get('insight', '') or item.get('point', '') or item.get('description', '')).lower()
                    
                    # 转换字段名：insight -> point
                    if 'insight' in item and 'point' not in item:
                        item['point'] = item['insight']
                    
                    # 基于关键词分类
                    is_positive = any(kw in text for kw in positive_keywords)
                    is_negative = any(kw in text for kw in negative_keywords)
                    is_opportunity = any(kw in text for kw in opportunity_keywords)
                    is_threat = any(kw in text for kw in threat_keywords)
                    
                    if is_threat or (is_negative and '风险' in text):
                        threats.append(item)
                    elif is_opportunity:
                        opportunities.append(item)
                    elif is_negative or ('问题' in text) or ('缺' in text) or ('差' in text):
                        weaknesses.append(item)
                    else:
                        # 默认归类为优势
                        strengths.append(item)
                
                result["core_swot"] = {
                    "strengths": strengths,
                    "weaknesses": weaknesses,
                    "opportunities": opportunities,
                    "threats": threats
                }
                logger.info(f"[格式修复] core_swot 转换完成: S={len(strengths)}, W={len(weaknesses)}, O={len(opportunities)}, T={len(threats)}")
            
            # 如果是对象格式但缺少某些分类，补全
            elif isinstance(swot, dict):
                for key in ['strengths', 'weaknesses', 'opportunities', 'threats']:
                    if key not in swot:
                        swot[key] = []
                        logger.info(f"[格式修复] core_swot 补全缺失字段: {key}")
                    elif not isinstance(swot[key], list):
                        swot[key] = [swot[key]] if swot[key] else []
        
        # ==========================================
        # 综合报告专用修复：priority_actions
        # ==========================================
        if report_type == "comprehensive" and "priority_actions" in result:
            items = result["priority_actions"]
            if isinstance(items, list):
                for item in items:
                    # issue -> action 转换
                    if 'issue' in item and 'action' not in item:
                        item['action'] = item['issue']
                        logger.info(f"[格式修复] priority_actions: issue -> action")
                    # 确保有 confidence 和 evidence
                    if 'confidence' not in item:
                        item['confidence'] = 'medium'
                    if 'evidence' not in item:
                        item['evidence'] = []
        
        # ==========================================
        # 综合报告专用修复：department_directives
        # ==========================================
        if report_type == "comprehensive" and "department_directives" in result:
            items = result["department_directives"]
            if isinstance(items, list):
                for i, item in enumerate(items):
                    # 确保有 insight 字段
                    if 'insight' not in item:
                        for alt in ['directive', 'action', 'issue', 'description', 'content']:
                            if alt in item:
                                item['insight'] = item[alt]
                                break
                    # 确保有 department 字段
                    if 'department' not in item:
                        item['department'] = item.get('to', f'指令 {i+1}')
                    if 'confidence' not in item:
                        item['confidence'] = 'medium'
                    if 'evidence' not in item:
                        item['evidence'] = []
        
        # ==========================================
        # 运营报告专用修复
        # ==========================================
        if report_type == "operations":
            # 修复 target_audience：如果是嵌套结构，提取出来
            if "target_audience" in result:
                ta = result["target_audience"]
                if isinstance(ta, list) and len(ta) > 0:
                    first = ta[0]
                    # 检查是否嵌套了其他字段
                    if isinstance(first, dict) and any(k in first for k in ['user_profile', 'user_research', 'selling_points', 'critical_bugs']):
                        # 提取嵌套的 insight
                        extracted = []
                        for item in ta:
                            if isinstance(item, dict):
                                for key, value in item.items():
                                    if isinstance(value, list):
                                        extracted.extend(value)
                                    elif isinstance(value, dict) and 'insight' in value:
                                        extracted.append(value)
                        result["target_audience"] = extracted if extracted else [{"insight": "目标受众数据格式异常", "confidence": "low", "evidence": []}]
                        logger.info(f"[格式修复] target_audience: 修复嵌套结构")
                elif isinstance(ta, dict):
                    # 对象转数组
                    result["target_audience"] = [ta] if ta else []
            
            # 修复 competitor_analysis：如果是嵌套结构，提取出来
            if "competitor_analysis" in result:
                ca = result["competitor_analysis"]
                if isinstance(ca, list) and len(ca) > 0:
                    first = ca[0]
                    # 检查是否嵌套了其他字段
                    if isinstance(first, dict) and any(k in first for k in ['usage_context_analysis', 'material_defects', 'supplier_issues', 'qc_checklist']):
                        # 提取嵌套的 insight/issue
                        extracted = []
                        for item in ca:
                            if isinstance(item, dict):
                                for key, value in item.items():
                                    if isinstance(value, list):
                                        for v in value:
                                            if isinstance(v, dict) and ('insight' in v or 'issue' in v):
                                                # 确保有 insight
                                                if 'issue' in v and 'insight' not in v:
                                                    v['insight'] = v['issue']
                                                extracted.append(v)
                        result["competitor_analysis"] = extracted if extracted else []
                        logger.info(f"[格式修复] competitor_analysis: 修复嵌套结构")
                elif isinstance(ca, dict):
                    result["competitor_analysis"] = [ca] if ca else []
            
            # 修复 selling_points, marketing_risks 等数组字段
            for field in ["selling_points", "marketing_risks", "listing_optimization", "review_response_templates"]:
                if field in result and isinstance(result[field], list):
                    for item in result[field]:
                        if isinstance(item, dict):
                            # 确保有内容字段
                            if 'insight' not in item and 'issue' not in item:
                                for alt in ['point', 'description', 'content', 'element', 'suggestion', 'response']:
                                    if alt in item:
                                        item['insight'] = item[alt]
                                        break
                            if 'confidence' not in item:
                                item['confidence'] = 'medium'
                            if 'evidence' not in item:
                                item['evidence'] = []
            
            # 修复 executive_summary：如果是数组，提取第一个的 insight
            if "executive_summary" in result:
                es = result["executive_summary"]
                if isinstance(es, list) and len(es) > 0:
                    first = es[0]
                    if isinstance(first, dict) and 'insight' in first:
                        result["executive_summary"] = first['insight']
                        logger.info(f"[格式修复] executive_summary: 数组转字符串")
        
        # ==========================================
        # 产品报告专用修复
        # ==========================================
        if report_type == "product":
            # 修复数组字段
            for field in ["critical_bugs", "unmet_needs", "usability_issues", "design_recommendations"]:
                if field in result and isinstance(result[field], list):
                    for item in result[field]:
                        if isinstance(item, dict):
                            # issue/insight 互换
                            if field == "critical_bugs":
                                if 'insight' in item and 'issue' not in item:
                                    item['issue'] = item['insight']
                            else:
                                if 'issue' in item and 'insight' not in item:
                                    item['insight'] = item['issue']
                            if 'confidence' not in item:
                                item['confidence'] = 'medium'
                            if 'evidence' not in item:
                                item['evidence'] = []
        
        # ==========================================
        # 供应链报告专用修复：qc_checklist 的 insight -> issue
        # ==========================================
        if report_type == "supply_chain" and "qc_checklist" in result:
            items = result["qc_checklist"]
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        # insight -> issue 转换（前端期望 issue）
                        if 'insight' in item and 'issue' not in item:
                            item['issue'] = item['insight']
                            logger.info(f"[格式修复] qc_checklist: insight -> issue")
        
        logger.info(f"[格式修复] 完成 {report_type} 报告格式标准化")
        return result
    
    def _format_stats_for_llm(
        self, 
        context: Dict[str, Any], 
        insight: Dict[str, Any],
        total_reviews: int
    ) -> str:
        """
        [核心逻辑] 将 5W (Context) 和 5类 Insight 数据结合成 LLM 可读的叙事结构。
        LLM 会根据此结构进行交叉分析。
        
        2026-01-14 增强：传入 evidence 详情（review_id + quote），支持证据溯源
        
        5类 Insight:
        - strength: 产品优势/卖点 -> 用于 Listing 五点描述
        - weakness: 改进空间/痛点 -> 用于产品改进和客服 QA
        - suggestion: 用户建议 -> 产品经理直接需求
        - scenario: 行为故事 -> 边缘场景发现/营销素材
        - emotion: 情绪预警 -> 客服和公关关注
        """
        
        def get_fmt_with_evidence(data: Any, max_items: int = 3) -> str:
            """
            格式化数据，包含证据详情（用于 AI 引用）
            2026-01-14: 优化 - 大幅减少数据量以控制 Prompt 长度
            """
            if isinstance(data, dict) and 'items' in data:
                items = data.get('items', [])
                total_count = data.get('total_count', 0)
            elif isinstance(data, list):
                items = data
                total_count = sum(x.get('value', 0) for x in items)
            else:
                return "暂无"
            
            if not items:
                return "暂无"
            
            result = []
            for item in items[:max_items]:
                entry = {
                    "tag": item['name'],
                    "count": item['value'],
                    "percent": f"{item.get('percent', 0):.1f}%"
                }
                # 仅添加1条证据样本
                evidence_list = item.get('evidence', [])
                if evidence_list:
                    e = evidence_list[0]
                    entry["quote"] = (e.get("quote", "") or "")[:50]
                result.append(entry)
            
            return json.dumps(result, ensure_ascii=False)
        
        # 简化格式（用于概览）
        def get_fmt_simple(data: Any, max_items: int = 8) -> str:
            if isinstance(data, dict) and 'items' in data:
                items = data.get('items', [])
            elif isinstance(data, list):
                items = data
            else:
                return "暂无数据"
            
            if not items:
                return "暂无数据"
            
            formatted = [f"{x['name']}({x['value']}次, {x.get('percent', 0):.1f}%)" for x in items[:max_items]]
            return ", ".join(formatted)

        return f"""
=== 📊 基础信息 ===
- 分析样本: {total_reviews} 条已翻译评论
- 数据说明: 每个标签都附带 evidence（证据），包含 review_id 和 quote，**你必须从这些证据中引用**

=== 📊 PART 1: 5W Context (宏观画像) ===
用户画像数据，用于理解"谁在买、谁在用、在哪用、什么时候用、为什么买、买来做什么"。

**概览:**
- Buyer (购买者): {get_fmt_simple(context.get('buyer', {}))}
- User (使用者): {get_fmt_simple(context.get('user', {}))}
- Where (使用地点): {get_fmt_simple(context.get('where', {}))}
- When (使用时机): {get_fmt_simple(context.get('when', {}))}
- Why (购买动机): {get_fmt_simple(context.get('why', {}))}
- What (用户任务/JTBD): {get_fmt_simple(context.get('what', {}))}

**详细数据（含证据，用于引用）:**

[Buyer - 购买者]:
{get_fmt_with_evidence(context.get('buyer', {}))}

[User - 使用者]:
{get_fmt_with_evidence(context.get('user', {}))}

[Where - 使用地点]:
{get_fmt_with_evidence(context.get('where', {}))}

[When - 使用时机]:
{get_fmt_with_evidence(context.get('when', {}))}

[Why - 购买动机]:
{get_fmt_with_evidence(context.get('why', {}))}

[What - 用户任务]:
{get_fmt_with_evidence(context.get('what', {}))}

=== 📉 PART 2: Deep Insights (微观洞察 - 5类) ===
基于评论内容提取的深度洞察，每个洞察都有证据支持。

**概览:**
- Strength (优势/卖点): {get_fmt_simple(insight.get('strength', {}))}
- Weakness (痛点/问题): {get_fmt_simple(insight.get('weakness', {}))}
- Suggestion (用户建议): {get_fmt_simple(insight.get('suggestion', {}))}
- Scenario (使用场景): {get_fmt_simple(insight.get('scenario', {}))}
- Emotion (情绪反馈): {get_fmt_simple(insight.get('emotion', {}))}

**详细数据（含证据，用于引用）:**

[Strength - 产品优势/卖点]:
{get_fmt_with_evidence(insight.get('strength', {}))}
*用途：Listing 五点描述、广告文案、差异化卖点*

[Weakness - 痛点/问题]:
{get_fmt_with_evidence(insight.get('weakness', {}))}
*用途：产品改进、客服 QA、差评预防*

[Suggestion - 用户建议]:
{get_fmt_with_evidence(insight.get('suggestion', {}))}
*用途：产品路线图、功能需求、用户期望*

[Scenario - 使用场景]:
{get_fmt_with_evidence(insight.get('scenario', {}))}
*用途：边缘场景发现、营销故事素材*

[Emotion - 情绪反馈]:
{get_fmt_with_evidence(insight.get('emotion', {}))}
*用途：公关预警、客服重点关注、NPS 分析*

=== 📋 分析指令 ===
1. **交叉分析**: 结合 PART 1 用户画像和 PART 2 洞察进行关联分析
   - 例如：老人用户 + 按键小痛点 = 适老化设计缺陷
   - 例如：送礼场景 + 包装问题 = 礼品包装优化需求

2. **证据引用**: 每个分析结论必须引用真实的 review_id 和 quote
   - 从上述 evidence 列表中选取
   - 严禁编造不存在的证据

3. **置信度评估**: 基于证据数量和强度评估每个结论的置信度
   - high: ≥5条评论明确支持，占比≥15%
   - medium: 2-4条评论支持，占比10-15%
   - low: 1条评论或占比<10%

4. **专业深度**: 使用专业术语，给出可执行建议
   - PMF（产品市场匹配度）
   - JTBD（用户任务）
   - NPS（净推荐值趋势）
   - CAC/LTV（获客成本/用户生命周期价值）
        """
    
    # --- 数据聚合方法 (返回 ECharts 格式) ---
    
    def _add_stats_metadata(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        辅助方法：
        1. 计算总数 (total_count)
        2. 计算每项占比 (percent)
        3. 封装成前端友好的结构
        
        Return: {
            "total_count": 150,
            "items": [{"name": "老人", "value": 45, "percent": 30.0, "evidence": [...]}]
        }
        """
        total_count = sum(item['value'] for item in items)
        
        for item in items:
            # 计算占比，保留1位小数
            item['percent'] = round((item['value'] / total_count * 100), 1) if total_count > 0 else 0.0
        
        return {
            "total_count": total_count,  # 该维度的总样本数
            "items": items               # 已排序的列表 (带 percent)
        }
    
    async def _aggregate_5w_stats(self, product_id: UUID) -> Dict[str, Any]:
        """
        [Traceable] 聚合 5W 数据，包含原文证据锚点
        
        Return: {
            "who": {
                "total_count": 150,
                "items": [
                    {
                        "name": "老人", 
                        "value": 45,
                        "percent": 30.0,
                        "evidence": [
                            {"review_id": "uuid-1", "quote": "作为老年人...", "rating": 3, "date": "2024-01-15"},
                            ...
                        ]
                    }, 
                    ...
                ]
            },
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
                # 优先使用翻译后的 quote，否则使用原文
                quote = h.quote_translated or h.quote or (r.body_translated[:80] if r.body_translated else (r.body_original[:80] if r.body_original else ""))
                quote_original = h.quote or (r.body_original[:80] if r.body_original else "")
            # 兼容旧版数据结构：使用 items 字段
            elif h.items:
                items_list = h.items if isinstance(h.items, list) else []
                for item in items_list:
                    if isinstance(item, dict):
                        name = item.get('content') or item.get('tag') or ""
                        quote = item.get('content_translated') or item.get('content_original') or item.get('quote') or (r.body_translated[:80] if r.body_translated else (r.body_original[:80] if r.body_original else ""))
                        quote_original = item.get('content_original') or item.get('quote') or (r.body_original[:80] if r.body_original else "")
                    elif isinstance(item, str):
                        name = item
                        quote = r.body_translated[:80] if r.body_translated else (r.body_original[:80] if r.body_original else "")
                        quote_original = r.body_original[:80] if r.body_original else ""
                    
                    if name:
                        entry = stats[h.theme_type][name]
                        entry["count"] += 1
                        # 只保留前 5 条作为直接证据 (避免 JSON 过大)
                        if len(entry["samples"]) < 5:
                            entry["samples"].append({
                                "review_id": str(r.id),
                                "quote": quote[:150],  # 限制长度，优先使用翻译
                                "quote_original": quote_original[:150] if quote_original != quote else None,  # 如果翻译和原文不同，保存原文
                                "rating": r.rating,
                                "date": r.review_date.strftime('%Y-%m-%d') if r.review_date else None
                            })
                continue  # items 循环处理完毕，跳过后续
            
            # 处理 label_name 的情况
            if name:
                entry = stats[h.theme_type][name]
                entry["count"] += 1
                if len(entry["samples"]) < 5:
                    quote_original = h.quote or (r.body_original[:80] if r.body_original else "")
                    entry["samples"].append({
                        "review_id": str(r.id),
                        "quote": quote[:150],  # 优先使用翻译
                        "quote_original": quote_original[:150] if quote_original != quote else None,  # 如果翻译和原文不同，保存原文
                        "rating": r.rating,
                        "date": r.review_date.strftime('%Y-%m-%d') if r.review_date else None
                    })
        
        def get_top(theme_key: str, top_n: int = 10) -> List[Dict[str, Any]]:
            """获取 Top N，包含证据 (默认 Top 10，适配小样本)"""
            data = stats.get(theme_key, {})
            # [关键] 严格倒序 + Top 10
            sorted_items = sorted(data.items(), key=lambda x: x[1]['count'], reverse=True)[:top_n]
            
            return [{
                "name": k, 
                "value": v["count"],
                "evidence": v["samples"]  # <--- 注入证据
            } for k, v in sorted_items]
        
        # 返回带 total_count 和 percent 的结构
        # 2026-01-14: 添加 buyer 和 user 类型，将 who 拆分为购买者和使用者
        return {
            "buyer": self._add_stats_metadata(get_top(ThemeType.BUYER.value if hasattr(ThemeType, 'BUYER') else "buyer")),
            "user": self._add_stats_metadata(get_top(ThemeType.USER.value if hasattr(ThemeType, 'USER') else "user")),
            "who": self._add_stats_metadata(get_top(ThemeType.WHO.value if hasattr(ThemeType, 'WHO') else "who")),  # 兼容旧数据
            "where": self._add_stats_metadata(get_top(ThemeType.WHERE.value if hasattr(ThemeType, 'WHERE') else "where")),
            "when": self._add_stats_metadata(get_top(ThemeType.WHEN.value if hasattr(ThemeType, 'WHEN') else "when")),
            "why": self._add_stats_metadata(get_top(ThemeType.WHY.value if hasattr(ThemeType, 'WHY') else "why")),
            "what": self._add_stats_metadata(get_top(ThemeType.WHAT.value if hasattr(ThemeType, 'WHAT') else "what"))
        }
    
    async def _aggregate_insight_stats(self, product_id: UUID) -> Dict[str, Any]:
        """
        [Traceable] 聚合 5 类 Insight 数据，包含原文证据锚点
        
        5类洞察类型：
        - strength: 产品优势/卖点
        - weakness: 改进空间/痛点  
        - suggestion: 用户建议/Feature Request
        - scenario: 具体使用场景/行为故事
        - emotion: 强烈情感洞察
        
        Return: {
            "strength": {
                "total_count": 80,
                "items": [
                    {
                        "name": "电池续航", 
                        "value": 30,
                        "percent": 37.5,
                        "evidence": [
                            {"review_id": "uuid-1", "quote": "电池能用很久...", "analysis": "用户称赞续航", "rating": 5},
                            ...
                        ]
                    }, 
                    ...
                ]
            },
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
                quote = i.quote_translated or i.quote or (r.body_translated[:100] if r.body_translated else (r.body_original[:100] if r.body_original else ""))
                quote_original = i.quote or (r.body_original[:100] if r.body_original else "")
                
                entry["samples"].append({
                    "review_id": str(r.id),
                    "quote": quote[:150],  # 限制长度，优先使用翻译
                    "quote_original": quote_original[:150] if quote_original != quote else None,  # 如果翻译和原文不同，保存原文
                    "analysis": i.analysis[:100] if i.analysis else None,  # AI 对单条的分析
                    "rating": r.rating,
                    "sentiment": r.sentiment if hasattr(r, 'sentiment') else None
                })
        
        def get_top(itype: str, top_n: int = 10) -> List[Dict[str, Any]]:
            """获取 Top N，包含证据 (默认 Top 10，适配小样本)"""
            data = stats.get(itype, {})
            # [关键] 严格倒序 + Top 10
            sorted_items = sorted(data.items(), key=lambda x: x[1]['count'], reverse=True)[:top_n]
            
            return [{
                "name": k, 
                "value": v["count"],
                "evidence": v["samples"]  # <--- 注入证据
            } for k, v in sorted_items]
        
        # 返回所有 5 个类型的数据，带 total_count 和 percent
        return {
            "strength": self._add_stats_metadata(get_top("strength")),
            "weakness": self._add_stats_metadata(get_top("weakness")),
            "suggestion": self._add_stats_metadata(get_top("suggestion")),
            "scenario": self._add_stats_metadata(get_top("scenario")),
            "emotion": self._add_stats_metadata(get_top("emotion"))
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
        
        # 辅助函数：从新格式中提取 items 列表
        def get_items(data: Any) -> List[Dict[str, Any]]:
            if isinstance(data, dict) and 'items' in data:
                return data.get('items', [])
            elif isinstance(data, list):
                return data
            else:
                return []
        
        def fmt_top(data: Any, top_n: int = 5) -> str:
            items = get_items(data)
            if not items:
                return "无"
            return ", ".join([f"{x['name']}({x['value']})" for x in items[:top_n]])
        
        def get_list(data: Any, top_n: int = 10) -> List[Dict[str, Any]]:
            items = get_items(data)
            return [{"name": x['name'], "count": x['value']} for x in items[:top_n]]
        
        # 合并 Where 和 When 为 Scene
        where_str = fmt_top(stats.get('where', {}))
        when_str = fmt_top(stats.get('when', {}))
        
        formatted_stats = {
            "buyer": fmt_top(stats.get('buyer', {})),
            "user": fmt_top(stats.get('user', {})),
            "who": fmt_top(stats.get('who', {})),  # 兼容旧数据
            "scene": f"{where_str} / {when_str}",
            "why": fmt_top(stats.get('why', {})),
            "what": fmt_top(stats.get('what', {}))
        }
        
        lists = {
            "buyer": get_list(stats.get('buyer', {})),
            "user": get_list(stats.get('user', {})),
            "who": get_list(stats.get('who', {})),  # 兼容旧数据
            "where": get_list(stats.get('where', {})),
            "when": get_list(stats.get('when', {})),
            "why": get_list(stats.get('why', {})),
            "what": get_list(stats.get('what', {}))
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
                "top_buyer": context_lists.get("buyer", [])[:5],
                "top_user": context_lists.get("user", [])[:5],
                "top_who": context_lists.get("who", [])[:5],  # 兼容旧数据
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
