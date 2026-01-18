"""
Analysis Service - VOC 产品分析服务

支持两种分析类型：
1. COMPARISON (对比分析): 多产品横向对比，突出差异和定位
2. MARKET_INSIGHT (细分市场洞察): 多产品聚合分析，识别市场共性、趋势、机会

架构优化：
1. 使用 AsyncOpenAI 异步客户端，非阻塞
2. 分步骤处理：每个产品单独分析 -> 生成维度洞察 -> 合并对比/聚合
3. 精简数据：保留 Top 20 标签（确保分析数据完整性）
4. 增强重试：tenacity 自动重试
"""
import logging
import json
import asyncio
from uuid import UUID
from typing import List, Dict, Any, Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import AsyncOpenAI, APIConnectionError, APITimeoutError, RateLimitError

from app.models.analysis import (
    AnalysisProject, 
    AnalysisProjectItem, 
    AnalysisStatus, 
    AnalysisType
)
from app.models.product import Product
from app.models.project_learning import (
    ProjectDimension,
    ProjectContextLabel,
    ProjectDimensionMapping,
    ProjectLabelMapping
)
from app.services.summary_service import SummaryService
from app.core.config import settings

logger = logging.getLogger(__name__)

# 初始化异步 OpenAI 客户端
_async_client: Optional[AsyncOpenAI] = None

def get_async_client() -> AsyncOpenAI:
    """获取或创建异步 OpenAI 客户端"""
    global _async_client
    if _async_client is None:
        if not settings.QWEN_API_KEY:
            raise ValueError("QWEN_API_KEY 未配置")
        _async_client = AsyncOpenAI(
            api_key=settings.QWEN_API_KEY,
            base_url=settings.QWEN_API_BASE,
            timeout=60.0,  # 单个请求超时
            max_retries=3   # 内置重试
        )
    return _async_client


# ==============================================================================
# [PROMPT] VOC 对比分析 Prompt
# ==============================================================================

SINGLE_PRODUCT_PROMPT = """分析产品"{product_name}"的用户反馈数据，输出结构化JSON。

输入数据：{stats_json}

重要说明：
- **label** 必须是数据中的具体标签名称（如"儿童"、"家长"、"焦虑时"、"家中"、"送礼"等），不要用"用户类型"、"使用时机"这种通用词
- **desc** 是基于数据归纳的一句话描述
- **count** 必须从输入数据的 count 字段获取

输出格式示例：
{{
  "product_name": "{product_name}",
  "asin": "{asin}",
  "five_w": {{
    "who": [
      {{"label": "儿童", "desc": "主要使用者，用于感统训练", "count": 42}},
      {{"label": "家长", "desc": "重要购买群体", "count": 30}}
    ],
    "when": [
      {{"label": "焦虑时", "desc": "使用频率最高", "count": 18}},
      {{"label": "学习时", "desc": "用于集中注意力", "count": 11}}
    ],
    "where": [
      {{"label": "家庭", "desc": "最主要场景", "count": 37}},
      {{"label": "学校", "desc": "用于课堂专注力辅助", "count": 17}}
    ],
    "why": [
      {{"label": "改善行为", "desc": "改善多动、冲动等问题", "count": 23}},
      {{"label": "缓解焦虑", "desc": "核心需求", "count": 15}}
    ],
    "what": [
      {{"label": "触觉刺激", "desc": "通过纹理促进感官发展", "count": 38}},
      {{"label": "情绪安抚", "desc": "帮助安抚情绪波动", "count": 19}}
    ]
  }},
  "dimensions": {{
    "pros": [
      {{"label": "材料质感", "desc": "硅胶柔软安全", "count": 31}},
      {{"label": "功能表现", "desc": "有效缓解焦虑", "count": 30}}
    ],
    "cons": [
      {{"label": "结构瑕疵", "desc": "连接处不牢固", "count": 4}},
      {{"label": "佩戴不适", "desc": "长时间使用有压迫感", "count": 3}}
    ],
    "suggestion": [
      {{"label": "增加颜色选择", "desc": "用户希望有更多颜色款式", "count": 8}},
      {{"label": "改进包装", "desc": "建议使用更环保的包装", "count": 5}}
    ],
    "scenario": [
      {{"label": "课堂使用", "desc": "学生在课堂上使用辅助专注", "count": 12}},
      {{"label": "长途旅行", "desc": "飞机/汽车上打发时间", "count": 7}}
    ],
    "emotion": [
      {{"label": "惊喜好评", "desc": "超出预期，非常满意", "count": 15}},
      {{"label": "失望吐槽", "desc": "质量不如预期，有落差感", "count": 6}}
    ]
  }}
}}

要求：
1. label 必须从输入数据的 "label" 字段中提取，不要自己编造
2. count 必须从输入数据的 "count" 字段获取，保持原始数值
3. dimensions 包含5类口碑洞察：pros(优势)、cons(痛点)、suggestion(用户建议)、scenario(使用场景)、emotion(情绪反馈)
4. **数据补全策略**：如果某个维度的原始数据为空数组，请根据相关维度推断并生成合理内容，并标记 is_inferred: true：
   - suggestion 为空时 → 从 cons/weakness 反向推断用户期望的改进建议
   - scenario 为空时 → 从 where/when 推断具体使用场景故事
   - emotion 为空时 → 从 pros/cons 推断用户情绪倾向
   - 推断生成的条目格式：{{"label": "xxx", "desc": "xxx", "count": 0, "is_inferred": true}}
5. 非推断条目不要添加 is_inferred 字段
6. 只输出JSON，不要其他文字
7. 简体中文"""

DIMENSION_INSIGHT_PROMPT = """基于以下产品的对比数据，为每个维度生成洞察分析。

产品数量：{product_count}
产品列表：
{product_summaries}

为10个维度生成洞察，每个洞察包含：
1. commonality：所有产品的共性特征（1句话）
2. differences：每个产品的差异特点（每个产品1句话，标注产品序号）
3. positioning：每个产品的定位洞察（每个产品1句话，标注产品序号）

10个维度说明：
- 5W用户画像：who(用户是谁), when(何时使用), where(在哪里用), why(购买动机), what(具体用途)
- 5类口碑洞察：pros(优势卖点), cons(痛点问题), suggestion(用户建议), scenario(使用场景), emotion(情绪反馈)

输出JSON格式：
{{
  "dimension_insights": {{
    "who": {{
      "name": "用户是谁",
      "commonality": "五款产品均定位于减压解压赛道...",
      "differences": [
        {{"product": 1, "text": "全年龄覆盖，大众市场通用型产品"}},
        {{"product": 2, "text": "深耕特殊儿童市场"}}
      ],
      "positioning": [
        {{"product": 1, "text": "大众减压工具，追求市场覆盖最大化"}},
        {{"product": 2, "text": "医疗康复赛道，建立专业护城河"}}
      ]
    }},
    "when": {{ ... }},
    "where": {{ ... }},
    "why": {{ ... }},
    "what": {{ ... }},
    "pros": {{ ... }},
    "cons": {{ ... }},
    "suggestion": {{
      "name": "用户建议",
      "commonality": "用户普遍期望产品在颜色、尺寸方面提供更多选择...",
      "differences": [...],
      "positioning": [...]
    }},
    "scenario": {{
      "name": "使用场景",
      "commonality": "产品在家庭和办公场景均有较高使用频率...",
      "differences": [...],
      "positioning": [...]
    }},
    "emotion": {{
      "name": "情绪反馈",
      "commonality": "整体用户情绪偏正向，但对质量问题反应强烈...",
      "differences": [...],
      "positioning": [...]
    }}
  }}
}}

要求：
1. 基于实际数据分析，不要编造
2. 差异和定位洞察的产品序号从1开始
3. 洞察要有商业价值，帮助理解竞争格局
4. 只输出JSON，简体中文"""

STRATEGY_SUMMARY_PROMPT = """基于以下产品对比分析，生成竞品策略总结。

产品数量：{product_count}
产品列表：
{product_summaries}

输出JSON格式：
{{
  "market_summary": "整体市场概述（100字内）",
  "strategy_summary": {{
    "market_positioning": {{
      "title": "市场定位策略",
      "emoji": "🎯",
      "content": "分析各产品的市场定位差异和竞争策略（150字内）"
    }},
    "scenario_deep_dive": {{
      "title": "场景化深耕",
      "emoji": "💼",
      "content": "分析各产品在使用场景和时机上的差异化策略（150字内）"
    }},
    "growth_opportunities": {{
      "title": "增长机会点",
      "emoji": "⚡",
      "content": "基于分析识别的市场机会和增长建议（150字内）"
    }}
  }}
}}

要求：
1. 基于10维分析数据进行归纳（5W用户画像 + 5类口碑洞察）
2. 内容要有商业洞察价值
3. 使用产品序号标注具体建议
4. 只输出JSON，简体中文"""


# ==============================================================================
# [PROMPT] 细分市场洞察 Prompt
# ==============================================================================

MARKET_AGGREGATION_PROMPT = """你是一位资深市场分析师。基于以下细分市场的多产品聚合数据，生成市场洞察分析。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}
- 市场名称：{market_name}

# 聚合数据
{aggregated_stats}

# 各产品数据摘要
{product_summaries}

请输出以下JSON格式的市场洞察分析：

{{
  "market_overview": {{
    "summary": "市场整体概述（100字内）",
    "market_size_indicator": "市场规模指标（如：高需求/中等需求/小众市场）",
    "maturity_level": "市场成熟度（新兴市场/成长期/成熟期/饱和期）",
    "competition_intensity": "竞争激烈程度（低/中/高）",
    "data_support": {{
      "cited_statistics": ["引用的数据统计1", "引用的数据统计2"]
    }}
  }},
  "common_needs": {{
    "description": "市场共性需求总结（150字内）",
    "top_needs": [
      {{"need": "需求描述", "frequency": "出现频率", "importance": "high/medium/low", "count": 数字}},
      ...
    ],
    "confidence": "high/medium/low",
    "data_support": {{
      "cited_statistics": ["引用的5W数据: xxx出现N次，占比X%", ...]
    }}
  }},
  "common_pain_points": {{
    "description": "市场共性痛点总结（150字内）",
    "top_pain_points": [
      {{"pain_point": "痛点描述", "severity": "high/medium/low", "count": 数字}},
      ...
    ],
    "confidence": "high/medium/low",
    "data_support": {{
      "cited_statistics": ["引用的痛点数据: xxx出现N次，占比X%", ...]
    }}
  }},
  "market_concentration": {{
    "description": "市场需求集中度分析",
    "concentration_level": "high/medium/low",
    "dominant_dimensions": ["最集中的维度1", "最集中的维度2"],
    "fragmented_dimensions": ["分散的维度1", "分散的维度2"]
  }}
}}

要求：
1. 所有洞察必须基于输入数据，不要编造
2. count 字段必须从数据中获取真实数值
3. data_support.cited_statistics 必须引用具体的数据统计，格式如："用户类型-儿童 出现80次，占比45%"
4. 每个分析观点必须有数据支撑
5. 只输出JSON，简体中文"""

MARKET_SEGMENT_PROMPT = """基于以下细分市场的聚合数据，生成市场用户画像分析。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 5W用户画像聚合数据
{five_w_stats}

请输出以下JSON格式的市场细分画像：

{{
  "market_persona": {{
    "primary_buyers": {{
      "description": "主要购买者群体描述",
      "segments": [
        {{"segment": "群体名称", "percentage": "占比", "characteristics": ["特征1", "特征2"]}}
      ],
      "confidence": "high/medium/low",
      "data_support": {{
        "cited_statistics": ["buyer数据：xxx占比Y%，出现N次", ...]
      }}
    }},
    "primary_users": {{
      "description": "主要使用者群体描述",
      "segments": [
        {{"segment": "群体名称", "percentage": "占比", "characteristics": ["特征1", "特征2"]}}
      ],
      "confidence": "high/medium/low",
      "data_support": {{
        "cited_statistics": ["user数据：xxx占比Y%，出现N次", ...]
      }}
    }},
    "usage_scenarios": {{
      "description": "典型使用场景总结",
      "top_scenarios": [
        {{"scenario": "场景描述", "frequency": "频率", "count": 数字}}
      ],
      "confidence": "high/medium/low",
      "data_support": {{
        "cited_statistics": ["where数据：xxx占比Y%，出现N次", ...]
      }}
    }},
    "purchase_motivations": {{
      "description": "主要购买动机总结",
      "top_motivations": [
        {{"motivation": "动机描述", "importance": "high/medium/low", "count": 数字}}
      ],
      "confidence": "high/medium/low",
      "data_support": {{
        "cited_statistics": ["why数据：xxx占比Y%，出现N次", ...]
      }}
    }},
    "jobs_to_be_done": {{
      "description": "用户核心任务/JTBD",
      "primary_jtbd": "核心任务描述",
      "secondary_jtbd": ["次要任务1", "次要任务2"],
      "data_support": {{
        "cited_statistics": ["what数据：xxx占比Y%，出现N次", ...]
      }}
    }}
  }},
  "typical_user_story": "一段描述典型用户画像的故事（100字内）"
}}

要求：
1. 基于实际数据分析，不要编造
2. 使用具体数据支撑结论，每个分析必须包含 data_support.cited_statistics
3. 引用格式："维度名称-标签名 出现N次，占比X%"
4. 只输出JSON，简体中文"""

MARKET_OPPORTUNITY_PROMPT = """基于以下细分市场的分析数据，挖掘市场机会。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 产品数据摘要
{product_summaries}

# 市场痛点和建议数据
{pain_points_data}

请输出以下JSON格式的市场机会分析：

{{
  "unmet_needs": {{
    "description": "未被满足的需求分析",
    "opportunities": [
      {{
        "need": "需求描述",
        "gap_analysis": "当前产品缺口分析",
        "market_potential": "high/medium/low",
        "recommendation": "建议切入点",
        "evidence_count": 数字
      }}
    ],
    "confidence": "high/medium/low",
    "data_support": {{
      "cited_statistics": ["痛点数据：xxx出现N次", "建议数据：xxx出现N次", ...]
    }}
  }},
  "white_space_opportunities": {{
    "description": "市场空白机会",
    "opportunities": [
      {{
        "area": "空白领域",
        "description": "机会描述",
        "target_segment": "目标人群",
        "entry_barrier": "low/medium/high"
      }}
    ],
    "data_support": {{
      "cited_statistics": ["基于xxx痛点（N次）推断的机会", ...]
    }}
  }},
  "differentiation_opportunities": {{
    "description": "差异化机会",
    "opportunities": [
      {{
        "dimension": "差异化维度",
        "current_leader": "当前领先产品（序号）",
        "opportunity": "差异化机会描述",
        "implementation_difficulty": "low/medium/high"
      }}
    ],
    "data_support": {{
      "cited_statistics": ["产品N在xxx维度领先（N次）", ...]
    }}
  }},
  "product_positioning_map": {{
    "description": "产品定位分析",
    "positions": [
      {{"product": 序号, "positioning": "定位描述", "strengths": ["优势1"], "gaps": ["不足1"]}}
    ],
    "market_leader": 序号,
    "niche_players": [序号],
    "positioning_advice": "定位建议（100字内）"
  }}
}}

要求：
1. 基于数据分析识别真实机会
2. 机会分析要有商业可行性
3. 每个机会分析必须包含 data_support.cited_statistics，引用痛点或建议数据
4. 只输出JSON，简体中文"""

MARKET_TREND_PROMPT = """基于以下细分市场的多产品数据，分析市场趋势。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 产品数据摘要（按评论数排序）
{product_summaries}

# 需求和痛点分布
{needs_distribution}

请输出以下JSON格式的市场趋势分析：

{{
  "emerging_needs": {{
    "description": "新兴需求分析",
    "trends": [
      {{
        "trend": "趋势描述",
        "signal_strength": "strong/medium/weak",
        "affected_products": [序号],
        "recommendation": "应对建议"
      }}
    ],
    "confidence": "high/medium/low",
    "data_support": {{
      "cited_statistics": ["需求分布：xxx占比Y%", "优势数据：xxx出现N次", ...]
    }}
  }},
  "declining_patterns": {{
    "description": "衰退趋势分析",
    "patterns": [
      {{
        "pattern": "衰退趋势描述",
        "risk_level": "high/medium/low",
        "recommendation": "规避建议"
      }}
    ],
    "data_support": {{
      "cited_statistics": ["痛点分布：xxx占比Y%", ...]
    }}
  }},
  "market_dynamics": {{
    "growth_drivers": ["增长驱动因素1", "增长驱动因素2"],
    "inhibitors": ["抑制因素1", "抑制因素2"],
    "disruption_risks": ["颠覆风险1"],
    "data_support": {{
      "cited_statistics": ["基于xxx数据（N次）推断", ...]
    }}
  }},
  "future_outlook": {{
    "short_term": "短期展望（3-6个月）",
    "medium_term": "中期展望（6-12个月）",
    "strategic_recommendation": "战略建议（100字内）",
    "data_support": {{
      "cited_statistics": ["基于当前市场数据推断", ...]
    }}
  }}
}}

要求：
1. 基于数据分布和产品对比推断趋势
2. 趋势分析要有依据，每个分析必须包含 data_support.cited_statistics
3. 引用格式："维度名称-标签名 出现N次，占比X%"
4. 只输出JSON，简体中文"""


# ==============================================================================
# [PROMPT] 市场洞察扩展模块 Prompt（8模块完整版）
# ==============================================================================

STRATEGIC_POSITIONING_PROMPT = """基于以下细分市场数据，生成战略定位与SWOT分析。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 产品数据摘要
{product_summaries}

# 聚合数据（优势和痛点）
{aggregated_pros_cons}

请输出以下JSON格式的战略定位分析：

{{
  "strategic_positioning": {{
    "market_positioning": {{
      "description": "整体市场定位分析（150字内）",
      "positioning_map": [
        {{
          "product": 序号,
          "positioning_statement": "一句话定位",
          "target_segment": "目标人群",
          "value_proposition": "核心价值主张"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["产品N的优势xxx出现M次", ...]
      }}
    }},
    "swot_matrix": {{
      "strengths": [
        {{"item": "优势描述", "evidence_count": 数字, "confidence": "high/medium/low"}}
      ],
      "weaknesses": [
        {{"item": "劣势描述", "evidence_count": 数字, "confidence": "high/medium/low"}}
      ],
      "opportunities": [
        {{"item": "机会描述", "source": "来源分析", "confidence": "high/medium/low"}}
      ],
      "threats": [
        {{"item": "威胁描述", "risk_level": "high/medium/low", "confidence": "high/medium/low"}}
      ],
      "data_support": {{
        "cited_statistics": ["优势来自：xxx（N次）", "痛点来自：xxx（N次）", ...]
      }}
    }},
    "competitive_advantage": {{
      "description": "市场竞争优势分析",
      "leader_products": [序号],
      "differentiators": ["差异化因素1", "差异化因素2"],
      "data_support": {{
        "cited_statistics": ["基于优势数据分析", ...]
      }}
    }}
  }}
}}

要求：
1. SWOT 分析必须基于实际数据
2. 每个分析必须包含 data_support.cited_statistics
3. 只输出JSON，简体中文"""

USAGE_CONTEXT_ANALYSIS_PROMPT = """基于以下细分市场数据，生成使用场景与痛点深度分析。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 5W使用场景数据
{five_w_context}

# 痛点数据
{pain_points_data}

请输出以下JSON格式的使用场景分析：

{{
  "usage_context_analysis": {{
    "scene_mapping": {{
      "description": "使用场景全景图",
      "primary_scenes": [
        {{
          "scene": "场景描述",
          "when": "使用时机",
          "where": "使用地点",
          "user_type": "用户类型",
          "frequency": "高频/中频/低频",
          "count": 数字
        }}
      ],
      "confidence": "high/medium/low",
      "data_support": {{
        "cited_statistics": ["where数据：xxx（N次）", "when数据：xxx（N次）", ...]
      }}
    }},
    "pain_point_by_scene": {{
      "description": "场景化痛点分析",
      "scene_issues": [
        {{
          "scene": "场景",
          "pain_point": "痛点描述",
          "severity": "high/medium/low",
          "affected_users": "受影响用户群",
          "improvement_suggestion": "改进建议"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["痛点xxx在场景yyy中出现N次", ...]
      }}
    }},
    "user_journey_gaps": {{
      "description": "用户旅程缺口分析",
      "gaps": [
        {{
          "journey_stage": "旅程阶段（购买前/使用中/使用后）",
          "gap_description": "缺口描述",
          "impact": "影响程度",
          "recommendation": "建议"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["基于痛点分布推断", ...]
      }}
    }}
  }}
}}

要求：
1. 场景分析必须基于 where/when/what 数据
2. 痛点分析必须关联具体使用场景
3. 每个分析必须包含 data_support.cited_statistics
4. 只输出JSON，简体中文"""

QUALITY_ROADMAP_PROMPT = """基于以下细分市场数据，生成质量标杆与产品迭代方向分析。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 产品数据摘要
{product_summaries}

# 优势和痛点数据
{pros_cons_data}

# 用户建议数据
{suggestion_data}

请输出以下JSON格式的质量与迭代分析：

{{
  "quality_roadmap": {{
    "quality_benchmark": {{
      "description": "产品质量标杆对比",
      "quality_leaders": [
        {{
          "product": 序号,
          "excellence_areas": ["优秀领域1", "优秀领域2"],
          "quality_score_indicators": "质量指标描述"
        }}
      ],
      "quality_laggards": [
        {{
          "product": 序号,
          "improvement_areas": ["待改进领域1"],
          "priority": "high/medium/low"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["产品N优势xxx（M次）", "产品N痛点xxx（M次）", ...]
      }}
    }},
    "critical_issues": {{
      "description": "致命缺陷与紧急修复项",
      "issues": [
        {{
          "issue": "问题描述",
          "severity": "critical/high/medium",
          "affected_products": [序号],
          "evidence_count": 数字,
          "fix_recommendation": "修复建议"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["痛点数据：xxx（N次）", ...]
      }}
    }},
    "product_roadmap": {{
      "description": "产品迭代方向建议",
      "short_term_actions": [
        {{
          "action": "行动项",
          "priority": "P0/P1/P2",
          "expected_impact": "预期影响",
          "based_on": "基于的数据"
        }}
      ],
      "mid_term_features": [
        {{
          "feature": "功能特性",
          "user_demand": "用户需求来源",
          "demand_count": 数字
        }}
      ],
      "data_support": {{
        "cited_statistics": ["用户建议：xxx（N次）", ...]
      }}
    }},
    "design_recommendations": {{
      "description": "设计改进建议",
      "usability_improvements": ["易用性改进1", "易用性改进2"],
      "feature_requests": ["功能需求1", "功能需求2"],
      "data_support": {{
        "cited_statistics": ["建议数据：xxx（N次）", ...]
      }}
    }}
  }}
}}

要求：
1. 质量对比必须基于优势和痛点数据
2. 迭代方向必须基于用户建议
3. 每个分析必须包含 data_support.cited_statistics
4. 只输出JSON，简体中文"""

ACTION_PRIORITIES_PROMPT = """基于以下细分市场的完整分析数据，生成供应链风险与跨部门行动优先级。

# 市场概况
- 产品数量：{product_count}
- 总评论数：{total_reviews}

# 产品数据摘要
{product_summaries}

# 痛点数据（供应链相关）
{pain_points_data}

# 用户情绪数据
{emotion_data}

请输出以下JSON格式的行动优先级分析：

{{
  "action_priorities": {{
    "supply_chain_risks": {{
      "description": "供应链与质量风险预警",
      "quality_risks": [
        {{
          "risk": "风险描述",
          "risk_level": "high/medium/low",
          "evidence_count": 数字,
          "mitigation": "缓解措施"
        }}
      ],
      "packaging_issues": [
        {{
          "issue": "包装问题",
          "frequency": "高/中/低",
          "recommendation": "建议"
        }}
      ],
      "estimated_return_factors": ["退货因素1", "退货因素2"],
      "data_support": {{
        "cited_statistics": ["痛点数据：xxx（N次）", ...]
      }}
    }},
    "department_directives": {{
      "description": "各部门指令",
      "product_team": {{
        "priority_actions": ["行动项1", "行动项2"],
        "focus_areas": ["关注领域1"],
        "data_support": {{"cited_statistics": ["痛点/建议数据"]}}
      }},
      "marketing_team": {{
        "key_messages": ["营销信息1", "营销信息2"],
        "target_segments": ["目标人群1"],
        "avoid_claims": ["需规避的宣传点"],
        "data_support": {{"cited_statistics": ["优势数据"]}}
      }},
      "customer_service": {{
        "expected_issues": ["预期问题1", "预期问题2"],
        "response_templates": ["回复模板建议1"],
        "data_support": {{"cited_statistics": ["痛点数据"]}}
      }},
      "supply_chain": {{
        "qc_focus": ["质检重点1", "质检重点2"],
        "supplier_feedback": ["供应商反馈点"],
        "data_support": {{"cited_statistics": ["质量痛点"]}}
      }}
    }},
    "priority_action_list": {{
      "description": "优先行动项汇总（按紧急程度排序）",
      "p0_critical": [
        {{
          "action": "紧急行动项",
          "owner": "负责部门",
          "reason": "原因",
          "evidence_count": 数字
        }}
      ],
      "p1_high": [
        {{
          "action": "高优先级行动项",
          "owner": "负责部门",
          "reason": "原因"
        }}
      ],
      "p2_medium": [
        {{
          "action": "中优先级行动项",
          "owner": "负责部门"
        }}
      ],
      "data_support": {{
        "cited_statistics": ["基于痛点频次和严重程度排序", ...]
      }}
    }},
    "risk_level_summary": {{
      "overall_risk": "low/medium/high/critical",
      "main_concerns": ["主要担忧1", "主要担忧2"],
      "positive_signals": ["积极信号1", "积极信号2"]
    }}
  }}
}}

要求：
1. 供应链风险基于质量相关痛点
2. 部门指令要具体可执行
3. 优先级排序基于数据频次和严重程度
4. 每个分析必须包含 data_support.cited_statistics
5. 只输出JSON，简体中文"""


class AnalysisService:
    """
    VOC 产品对比分析服务
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.summary_service = SummaryService(db)

    # ==========================================
    # 项目管理
    # ==========================================
    
    async def create_comparison_project(
        self, 
        title: str, 
        product_ids: List[UUID],
        description: Optional[str] = None,
        role_labels: Optional[List[str]] = None
    ) -> AnalysisProject:
        """创建分析项目"""
        if len(product_ids) < 2:
            raise ValueError("至少需要 2 个产品")
        
        if len(product_ids) > 5:
            raise ValueError("最多支持 5 个产品")

        stmt = select(Product).where(Product.id.in_(product_ids))
        result = await self.db.execute(stmt)
        products = result.scalars().all()
        
        if len(products) != len(product_ids):
            found_ids = {p.id for p in products}
            missing_ids = [pid for pid in product_ids if pid not in found_ids]
            raise ValueError(f"部分产品不存在: {missing_ids}")

        project = AnalysisProject(
            title=title,
            description=description,
            analysis_type=AnalysisType.COMPARISON.value,
            status=AnalysisStatus.PENDING.value
        )
        self.db.add(project)
        await self.db.flush()

        for i, pid in enumerate(product_ids):
            if role_labels and i < len(role_labels):
                label = role_labels[i]
            else:
                label = f"Product {i + 1}"
            
            item = AnalysisProjectItem(
                project_id=project.id,
                product_id=pid,
                role_label=label,
                display_order=i
            )
            self.db.add(item)
        
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def create_market_insight_project(
        self, 
        title: str, 
        product_ids: List[UUID],
        description: Optional[str] = None,
        role_labels: Optional[List[str]] = None
    ) -> AnalysisProject:
        """创建细分市场洞察项目"""
        if len(product_ids) < 2:
            raise ValueError("市场洞察至少需要 2 个产品")
        
        if len(product_ids) > 10:
            raise ValueError("市场洞察最多支持 10 个产品")

        stmt = select(Product).where(Product.id.in_(product_ids))
        result = await self.db.execute(stmt)
        products = result.scalars().all()
        
        if len(products) != len(product_ids):
            found_ids = {p.id for p in products}
            missing_ids = [pid for pid in product_ids if pid not in found_ids]
            raise ValueError(f"部分产品不存在: {missing_ids}")

        project = AnalysisProject(
            title=title,
            description=description,
            analysis_type=AnalysisType.MARKET_INSIGHT.value,
            status=AnalysisStatus.PENDING.value
        )
        self.db.add(project)
        await self.db.flush()

        for i, pid in enumerate(product_ids):
            if role_labels and i < len(role_labels):
                label = role_labels[i]
            else:
                label = f"Product {i + 1}"
            
            item = AnalysisProjectItem(
                project_id=project.id,
                product_id=pid,
                role_label=label,
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
        status: Optional[str] = None,
        admin_only: bool = False,
        user_id: Optional[UUID] = None
    ) -> List[AnalysisProject]:
        """
        获取项目列表
        
        Args:
            limit: 每页数量
            offset: 偏移量
            status: 按状态筛选
            admin_only: 只返回包含管理员关注产品的项目（用于市场洞察广场）
            user_id: 只返回指定用户创建的项目（用于我的项目）
        """
        from app.models.user import User
        from app.models.user_project import UserProject
        
        if admin_only:
            # 市场洞察广场：只显示包含管理员关注产品的项目
            # 查询逻辑：analysis_projects -> analysis_project_items -> products -> user_projects -> users(is_admin=true)
            stmt = (
                select(AnalysisProject)
                .options(selectinload(AnalysisProject.items).selectinload(AnalysisProjectItem.product))
                .join(AnalysisProjectItem, AnalysisProject.id == AnalysisProjectItem.project_id)
                .join(UserProject, AnalysisProjectItem.product_id == UserProject.product_id)
                .join(User, UserProject.user_id == User.id)
                .where(User.is_admin == True)
                .where(UserProject.is_deleted == False)
                .distinct()
                .order_by(desc(AnalysisProject.created_at))
                .limit(limit)
                .offset(offset)
            )
            
            if status:
                stmt = stmt.where(AnalysisProject.status == status)
        elif user_id:
            # 我的项目：只显示当前用户创建的项目
            stmt = (
                select(AnalysisProject)
                .options(selectinload(AnalysisProject.items).selectinload(AnalysisProjectItem.product))
                .where(AnalysisProject.user_id == user_id)
                .order_by(desc(AnalysisProject.created_at))
                .limit(limit)
                .offset(offset)
            )
            
            if status:
                stmt = stmt.where(AnalysisProject.status == status)
        else:
            # 普通列表查询
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
        return list(result.scalars().unique().all())

    async def delete_project(self, project_id: UUID) -> bool:
        """删除项目"""
        project = await self.db.get(AnalysisProject, project_id)
        if not project:
            return False
        
        await self.db.delete(project)
        await self.db.commit()
        return True

    # ==========================================
    # 核心分析逻辑 - 路由入口
    # ==========================================
    
    async def run_analysis(self, project_id: UUID) -> AnalysisProject:
        """
        分析入口：根据 analysis_type 路由到不同的分析方法
        """
        project = await self.get_project(project_id)
        if not project or not project.items:
            raise ValueError("项目无效")
        
        # 根据分析类型路由
        if project.analysis_type == AnalysisType.MARKET_INSIGHT.value:
            return await self._run_market_insight_analysis(project)
        else:
            # 默认执行对比分析
            return await self._run_comparison_analysis(project)

    # ==========================================
    # 对比分析逻辑 (Comparison Analysis)
    # ==========================================
    
    async def _run_comparison_analysis(self, project: AnalysisProject) -> AnalysisProject:
        """
        执行 VOC 对比分析
        
        优化架构：
        1. 使用 AsyncOpenAI 异步客户端
        2. 每个产品独立分析（小请求，稳定）
        3. 并行调用 AI（多产品同时分析）
        4. 生成维度洞察和策略总结
        """

        try:
            # 更新状态
            project.status = AnalysisStatus.PROCESSING.value
            await self.db.commit()

            # 1. 收集产品数据（顺序，因为 SQLAlchemy 限制）
            products_info = []
            product_data_map = {}
            product_count = len(project.items)  # 获取产品总数，用于动态调整标签数量
            
            for item in project.items:
                res = await self._fetch_product_data(item, product_count=product_count)
                products_info.append(res)
                product_data_map[res['name']] = res['data']
                product_data_map[res['name']]['asin'] = res['asin']
            
            # 保存快照
            project.raw_data_snapshot = product_data_map
            await self.db.commit()
            
            # 2. 获取异步客户端
            client = get_async_client()
            
            # 3. 并行分析每个产品
            logger.info(f"开始并行分析 {len(products_info)} 个产品...")
            
            async def analyze_single_product(info: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]:
                """分析单个产品（带重试机制，确保稳健性）"""
                prompt = SINGLE_PRODUCT_PROMPT.format(
                    product_name=info['name'],
                    asin=info['asin'],
                    stats_json=json.dumps(info['data'], ensure_ascii=False)
                )
                
                last_error = None
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=4000,  # 增加 token 限制，确保完整输出
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        result = json.loads(content.replace("```json", "").replace("```", "").strip())
                        
                        # 验证结果完整性
                        if not result.get("five_w") or not result.get("dimensions"):
                            raise ValueError("AI 返回的数据结构不完整")
                        
                        return result
                        
                    except json.JSONDecodeError as e:
                        last_error = e
                        logger.warning(f"产品 {info['asin']} 第 {attempt+1}/{max_retries} 次 JSON 解析失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2 * (attempt + 1))  # 指数退避
                    except Exception as e:
                        last_error = e
                        logger.warning(f"产品 {info['asin']} 第 {attempt+1}/{max_retries} 次分析失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2 * (attempt + 1))
                
                # 所有重试都失败，抛出最后的错误
                raise last_error or Exception("未知错误")
            
            # 并行执行所有产品分析
            product_profiles = await asyncio.gather(
                *[analyze_single_product(info) for info in products_info],
                return_exceptions=True
            )
            
            # 过滤错误并添加 image_url
            valid_profiles = []
            for i, result in enumerate(product_profiles):
                if isinstance(result, Exception):
                    logger.error(f"产品 {i+1} 分析失败: {result}")
                    # 创建空的占位结果
                    valid_profiles.append({
                        "product_name": products_info[i]['name'],
                        "asin": products_info[i]['asin'],
                        "image_url": products_info[i].get('image_url'),
                        "five_w": {"who": [], "when": [], "where": [], "why": [], "what": []},
                        "dimensions": {"pros": [], "cons": []},
                        "error": str(result)
                    })
                else:
                    # 添加 image_url 到结果中
                    result["image_url"] = products_info[i].get('image_url')
                    valid_profiles.append(result)
            
            logger.info(f"产品分析完成，成功 {len([p for p in valid_profiles if 'error' not in p])} 个")
            
            # 4. 生成产品摘要用于后续分析
            product_summaries = self._generate_product_summaries(valid_profiles)
            
            # 5. 分批生成维度洞察和策略总结
            async def generate_dimension_insights_batch(dimensions: List[str], batch_name: str) -> Dict[str, Any]:
                """分批生成维度洞察（每批3-5个维度）"""
                dimension_names = {
                    "who": "用户是谁", "when": "何时使用", "where": "在哪里用",
                    "why": "购买动机", "what": "具体用途", "pros": "优势卖点",
                    "cons": "痛点问题", "suggestion": "用户建议", 
                    "scenario": "使用场景", "emotion": "情绪反馈"
                }
                
                dim_list = ", ".join([f"{d}({dimension_names[d]})" for d in dimensions])
                
                batch_prompt = f"""基于以下产品的对比数据，为指定维度生成洞察分析。

产品数量：{len(valid_profiles)}
产品列表：
{product_summaries}

请为以下维度生成洞察：{dim_list}

每个维度的洞察包含：
1. name：维度中文名称
2. commonality：所有产品的共性特征（1句话）
3. differences：每个产品的差异特点（数组，每项包含 product 序号和 text 描述）
4. positioning：每个产品的定位洞察（数组，每项包含 product 序号和 text 描述）

输出JSON格式（只输出指定维度）：
{{
  "dimension_insights": {{
    "{dimensions[0]}": {{
      "name": "{dimension_names[dimensions[0]]}",
      "commonality": "...",
      "differences": [{{"product": 1, "text": "..."}}, ...],
      "positioning": [{{"product": 1, "text": "..."}}, ...]
    }},
    ...
  }}
}}

要求：简体中文，只输出JSON。"""

                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        logger.info(f"生成维度洞察批次 [{batch_name}]: {dimensions}")
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": batch_prompt}
                            ],
                            temperature=0.3,
                            max_tokens=2500,  # 每批只需要较少的 token
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        logger.info(f"维度洞察批次 [{batch_name}] 响应长度: {len(content)} 字符")
                        
                        result = json.loads(content.replace("```json", "").replace("```", "").strip())
                        return result.get("dimension_insights", {})
                    except json.JSONDecodeError as e:
                        logger.error(f"维度洞察批次 [{batch_name}] JSON 解析失败: {e}")
                        return {}
                    except Exception as e:
                        logger.warning(f"维度洞察批次 [{batch_name}] 尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"维度洞察批次 [{batch_name}] 最终失败: {e}")
                            return {}
            
            async def generate_all_dimension_insights() -> Dict[str, Any]:
                """分3批生成所有10个维度的洞察"""
                # 将10个维度分成3批：5W画像(5个) + 正面口碑(2个) + 负面/建议口碑(3个)
                batches = [
                    (["who", "when", "where", "why", "what"], "5W用户画像"),
                    (["pros", "cons"], "优势痛点"),
                    (["suggestion", "scenario", "emotion"], "建议场景情绪"),
                ]
                
                all_insights = {}
                for dimensions, batch_name in batches:
                    batch_result = await generate_dimension_insights_batch(dimensions, batch_name)
                    all_insights.update(batch_result)
                    # 批次之间稍作停顿，避免 API 限流
                    await asyncio.sleep(1)
                
                logger.info(f"维度洞察生成完成，共 {len(all_insights)} 个维度")
                return {"dimension_insights": all_insights}
            
            async def generate_strategy_summary() -> Dict[str, Any]:
                """生成策略总结（带重试机制）"""
                prompt = STRATEGY_SUMMARY_PROMPT.format(
                    product_count=len(valid_profiles),
                    product_summaries=product_summaries
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=1500,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"策略总结生成尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(5 * (attempt + 1))  # 指数退避
                        else:
                            logger.error(f"策略总结生成最终失败: {e}")
                            return {"market_summary": "", "strategy_summary": {}}
            
            # 并行执行洞察和总结生成
            insights_result, strategy_result = await asyncio.gather(
                generate_all_dimension_insights(),
                generate_strategy_summary(),
                return_exceptions=True
            )
            
            # 处理结果
            dimension_insights = {}
            if isinstance(insights_result, Exception):
                logger.error(f"维度洞察生成失败: {insights_result}")
            else:
                dimension_insights = insights_result.get("dimension_insights", {})
            
            strategy_summary = {}
            market_summary = ""
            if isinstance(strategy_result, Exception):
                logger.error(f"策略总结生成失败: {strategy_result}")
            else:
                market_summary = strategy_result.get("market_summary", "")
                strategy_summary = strategy_result.get("strategy_summary", {})
            
            # 6. 组装最终结果
            result_data = {
                "product_profiles": valid_profiles,
                "dimension_insights": dimension_insights,
                "market_summary": market_summary,
                "strategy_summary": strategy_summary
            }
            
            project.result_content = result_data
            project.status = AnalysisStatus.COMPLETED.value
            project.error_message = None
            
            logger.info(f"对比分析完成: {project.id}")
            
        except Exception as e:
            logger.error(f"Analysis Error: {e}", exc_info=True)
            project.status = AnalysisStatus.FAILED.value
            project.error_message = str(e)
        
        await self.db.commit()
        await self.db.refresh(project)
        return project

    def _generate_product_summaries(self, profiles: List[Dict[str, Any]]) -> str:
        """生成产品摘要用于后续 prompt（10维）"""
        summaries = []
        for i, p in enumerate(profiles, 1):
            name = p.get("product_name", f"产品{i}")
            asin = p.get("asin", "")
            
            # 提取关键标签 - 5W用户画像
            five_w = p.get("five_w", {})
            who_tags = [t.get("label", "") for t in five_w.get("who", [])[:3]]
            when_tags = [t.get("label", "") for t in five_w.get("when", [])[:3]]
            where_tags = [t.get("label", "") for t in five_w.get("where", [])[:3]]
            why_tags = [t.get("label", "") for t in five_w.get("why", [])[:3]]
            what_tags = [t.get("label", "") for t in five_w.get("what", [])[:3]]
            
            # 提取关键标签 - 5类口碑洞察
            dims = p.get("dimensions", {})
            pros_tags = [t.get("label", "") for t in dims.get("pros", [])[:3]]
            cons_tags = [t.get("label", "") for t in dims.get("cons", [])[:3]]
            suggestion_tags = [t.get("label", "") for t in dims.get("suggestion", [])[:3]]
            scenario_tags = [t.get("label", "") for t in dims.get("scenario", [])[:3]]
            emotion_tags = [t.get("label", "") for t in dims.get("emotion", [])[:3]]
            
            summary = f"""产品{i}: {name} ({asin})
  【5W用户画像】
  - 用户(Who): {', '.join(who_tags) or '无数据'}
  - 时机(When): {', '.join(when_tags) or '无数据'}
  - 场景(Where): {', '.join(where_tags) or '无数据'}
  - 动机(Why): {', '.join(why_tags) or '无数据'}
  - 用途(What): {', '.join(what_tags) or '无数据'}
  【5类口碑洞察】
  - 优势(Pros): {', '.join(pros_tags) or '无数据'}
  - 痛点(Cons): {', '.join(cons_tags) or '无数据'}
  - 建议(Suggestion): {', '.join(suggestion_tags) or '无数据'}
  - 场景(Scenario): {', '.join(scenario_tags) or '无数据'}
  - 情绪(Emotion): {', '.join(emotion_tags) or '无数据'}"""
            summaries.append(summary)
        
        return "\n\n".join(summaries)

    async def _fetch_product_data(self, item: AnalysisProjectItem, product_count: int = 1) -> Dict[str, Any]:
        """
        [Helper] 异步获取单个产品的全量数据
        
        Args:
            item: 分析项目条目
            product_count: 总产品数量（用于动态调整标签数量）
        """
        product = item.product
        
        # 构建安全的产品名称
        raw_name = product.title_translated or product.title or product.asin
        safe_name = raw_name[:30].replace('"', '').replace("'", "").strip() + f" ({product.asin[-4:]})"
        
        # 聚合核心数据 (5W + Insight)
        context_stats = await self.summary_service._aggregate_5w_stats(product.id)
        insight_stats = await self.summary_service._aggregate_insight_stats(product.id)
        
        return {
            "name": safe_name,
            "asin": product.asin,
            "image_url": product.image_url,
            "data": {
                "user_context": self._simplify_stats(context_stats, product_count=product_count),
                "key_insights": self._simplify_stats(insight_stats, product_count=product_count)
            }
        }

    def _simplify_stats(self, data: Dict[str, Any], max_items: int = 15, product_count: int = 1) -> Dict[str, List[Dict[str, Any]]]:
        """
        精简数据：每类只保留 Top N，只保留 label 和 count
        
        动态调整策略（确保 Token 不超限）：
        - 2个产品: 每维度最多 20 个标签
        - 3个产品: 每维度最多 15 个标签
        - 4-5个产品: 每维度最多 12 个标签
        """
        # 根据产品数量动态调整标签数量
        if product_count <= 2:
            max_items = 20
        elif product_count == 3:
            max_items = 15
        else:
            max_items = 12
        simplified = {}
        
        for category, content in data.items():
            if not isinstance(content, dict): 
                continue
            
            items = content.get("items", [])
            # 只保留必要字段，减少 Token
            simplified[category] = [
                {"label": item.get("name"), "count": item.get("value")}
                for item in items[:max_items]
                if isinstance(item, dict)
            ]
        
        return simplified

    # ==========================================
    # 预览功能
    # ==========================================
    
    async def get_comparison_preview(self, product_ids: List[UUID]) -> Dict[str, Any]:
        """
        获取对比预览数据（不调用 AI，仅返回聚合数据）
        """
        if len(product_ids) < 2:
            raise ValueError("对比分析至少需要 2 个产品")
        
        preview_data = {}
        
        for pid in product_ids:
            product = await self.db.get(Product, pid)
            if not product:
                continue
            
            total_reviews = await self.summary_service._count_translated_reviews(pid)
            
            preview_data[str(pid)] = {
                "product": {
                    "id": str(product.id),
                    "asin": product.asin,
                    "title": product.title_translated or product.title,
                    "image_url": product.image_url,
                    "marketplace": product.marketplace
                },
                "total_reviews": total_reviews,
                "ready": total_reviews > 0
            }
        
        return {
            "success": True,
            "products": preview_data,
            "can_compare": len(preview_data) >= 2 and all(p.get("ready", False) for p in preview_data.values())
        }

    # ==========================================
    # 细分市场洞察分析 (Market Insight Analysis)
    # ==========================================
    
    async def _run_market_insight_analysis(self, project: AnalysisProject) -> AnalysisProject:
        """
        执行细分市场洞察分析
        
        [UPDATED 2026-01-17] 重构架构：
        0. [NEW] 项目级学习：学习统一维度/标签并建立映射
        1. 收集所有产品数据
        2. 聚合市场级别数据（基于映射关系）
        3. 生成市场共性洞察
        4. 生成市场用户画像
        5. 挖掘市场机会
        6. 分析市场趋势
        7. 保留产品对比视角
        """
        try:
            # 更新状态
            project.status = AnalysisStatus.PROCESSING.value
            await self.db.commit()
            
            # 获取产品 ID 列表
            product_ids = [item.product_id for item in project.items]
            product_count = len(product_ids)
            
            # =================================================================
            # [NEW] Step 0: 项目级维度/标签学习
            # =================================================================
            from app.services.project_learning_service import ProjectLearningService
            
            logger.info(f"🎓 开始项目级学习（{product_count} 个产品）...")
            
            learning_service = ProjectLearningService(self.db)
            
            # 执行项目级学习
            learning_result = await learning_service.learn_project_dimensions_and_labels(
                project_id=project.id,
                product_ids=product_ids,
                sample_per_product=40,  # 每个产品采样 40 条
                max_total_samples=100  # 最多 100 条总样本
            )
            
            logger.info(f"✅ 项目级学习完成：{learning_result.get('sample_stats', {}).get('total_reviews', 0)} 条评论")
            
            # =================================================================
            # Step 1: 收集产品数据
            # =================================================================
            products_info = []
            product_data_map = {}
            total_reviews = 0
            
            for item in project.items:
                res = await self._fetch_product_data_full(item)
                products_info.append(res)
                product_data_map[res['name']] = res['data']
                product_data_map[res['name']]['asin'] = res['asin']
                total_reviews += res.get('review_count', 0)
            
            # 保存快照
            project.raw_data_snapshot = product_data_map
            await self.db.commit()
            
            # 2. 聚合市场级别数据
            market_aggregated = self._aggregate_market_data(products_info)
            
            # 3. 获取异步客户端
            client = get_async_client()
            
            # 4. 生成产品摘要
            product_summaries = self._generate_product_summaries_for_market(products_info)
            
            # 5. 并行执行 AI 分析
            logger.info(f"开始市场洞察分析，{product_count} 个产品，{total_reviews} 条评论...")
            
            async def generate_market_overview() -> Dict[str, Any]:
                """生成市场概览分析"""
                prompt = MARKET_AGGREGATION_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    market_name=project.title,
                    aggregated_stats=json.dumps(market_aggregated, ensure_ascii=False),
                    product_summaries=product_summaries
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3000,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"市场概览生成尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"市场概览生成最终失败: {e}")
                            return {}
            
            async def generate_market_persona() -> Dict[str, Any]:
                """生成市场用户画像"""
                prompt = MARKET_SEGMENT_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    five_w_stats=json.dumps(market_aggregated.get("five_w", {}), ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=2500,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"市场画像生成尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"市场画像生成最终失败: {e}")
                            return {}
            
            async def generate_market_opportunities() -> Dict[str, Any]:
                """挖掘市场机会"""
                pain_points_data = {
                    "cons": market_aggregated.get("dimensions", {}).get("cons", []),
                    "suggestion": market_aggregated.get("dimensions", {}).get("suggestion", [])
                }
                
                prompt = MARKET_OPPORTUNITY_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    product_summaries=product_summaries,
                    pain_points_data=json.dumps(pain_points_data, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3000,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"市场机会挖掘尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"市场机会挖掘最终失败: {e}")
                            return {}
            
            async def generate_market_trends() -> Dict[str, Any]:
                """分析市场趋势"""
                needs_distribution = {
                    "pros": market_aggregated.get("dimensions", {}).get("pros", []),
                    "cons": market_aggregated.get("dimensions", {}).get("cons", []),
                    "what": market_aggregated.get("five_w", {}).get("what", []),
                    "why": market_aggregated.get("five_w", {}).get("why", [])
                }
                
                prompt = MARKET_TREND_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    product_summaries=product_summaries,
                    needs_distribution=json.dumps(needs_distribution, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=2500,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"市场趋势分析尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"市场趋势分析最终失败: {e}")
                            return {}
            
            # ============== 新增4个分析模块 ==============
            
            async def generate_strategic_positioning() -> Dict[str, Any]:
                """生成战略定位与SWOT分析"""
                aggregated_pros_cons = {
                    "pros": market_aggregated.get("dimensions", {}).get("pros", []),
                    "cons": market_aggregated.get("dimensions", {}).get("cons", [])
                }
                
                prompt = STRATEGIC_POSITIONING_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    product_summaries=product_summaries,
                    aggregated_pros_cons=json.dumps(aggregated_pros_cons, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3000,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"战略定位分析尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"战略定位分析最终失败: {e}")
                            return {}
            
            async def generate_usage_context_analysis() -> Dict[str, Any]:
                """生成使用场景与痛点分析"""
                five_w_context = {
                    "where": market_aggregated.get("five_w", {}).get("where", []),
                    "when": market_aggregated.get("five_w", {}).get("when", []),
                    "what": market_aggregated.get("five_w", {}).get("what", []),
                    "user": market_aggregated.get("five_w", {}).get("user", [])
                }
                pain_points = {
                    "cons": market_aggregated.get("dimensions", {}).get("cons", []),
                    "scenario": market_aggregated.get("dimensions", {}).get("scenario", [])
                }
                
                prompt = USAGE_CONTEXT_ANALYSIS_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    five_w_context=json.dumps(five_w_context, ensure_ascii=False),
                    pain_points_data=json.dumps(pain_points, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3000,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"使用场景分析尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"使用场景分析最终失败: {e}")
                            return {}
            
            async def generate_quality_roadmap() -> Dict[str, Any]:
                """生成质量标杆与产品迭代方向"""
                pros_cons = {
                    "pros": market_aggregated.get("dimensions", {}).get("pros", []),
                    "cons": market_aggregated.get("dimensions", {}).get("cons", [])
                }
                suggestions = market_aggregated.get("dimensions", {}).get("suggestion", [])
                
                prompt = QUALITY_ROADMAP_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    product_summaries=product_summaries,
                    pros_cons_data=json.dumps(pros_cons, ensure_ascii=False),
                    suggestion_data=json.dumps(suggestions, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3000,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"质量迭代分析尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"质量迭代分析最终失败: {e}")
                            return {}
            
            async def generate_action_priorities() -> Dict[str, Any]:
                """生成供应链风险与行动优先级"""
                pain_points = {
                    "cons": market_aggregated.get("dimensions", {}).get("cons", []),
                    "suggestion": market_aggregated.get("dimensions", {}).get("suggestion", [])
                }
                emotions = market_aggregated.get("dimensions", {}).get("emotion", [])
                
                prompt = ACTION_PRIORITIES_PROMPT.format(
                    product_count=product_count,
                    total_reviews=total_reviews,
                    product_summaries=product_summaries,
                    pain_points_data=json.dumps(pain_points, ensure_ascii=False),
                    emotion_data=json.dumps(emotions, ensure_ascii=False)
                )
                
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        response = await client.chat.completions.create(
                            model=settings.QWEN_ANALYSIS_MODEL,
                            messages=[
                                {"role": "system", "content": "输出纯JSON，简体中文。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.3,
                            max_tokens=3500,
                            response_format={"type": "json_object"}
                        )
                        
                        content = response.choices[0].message.content
                        return json.loads(content.replace("```json", "").replace("```", "").strip())
                    except Exception as e:
                        logger.warning(f"行动优先级分析尝试 {attempt + 1}/{max_retries} 失败: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(3 * (attempt + 1))
                        else:
                            logger.error(f"行动优先级分析最终失败: {e}")
                            return {}
            
            # ============== 两轮并行执行策略 ==============
            # Round 1: 基础分析模块（market_overview, market_persona, market_opportunities, market_trends）
            # Round 2: 深度分析模块（strategic_positioning, usage_context_analysis, quality_roadmap, action_priorities）
            
            logger.info("📊 开始第一轮并行分析（市场概览、用户画像、机会挖掘、趋势分析）...")
            
            overview_result, persona_result, opportunity_result, trend_result = await asyncio.gather(
                generate_market_overview(),
                generate_market_persona(),
                generate_market_opportunities(),
                generate_market_trends(),
                return_exceptions=True
            )
            
            # 处理第一轮结果
            market_overview = overview_result if not isinstance(overview_result, Exception) else {}
            market_persona = persona_result if not isinstance(persona_result, Exception) else {}
            market_opportunities = opportunity_result if not isinstance(opportunity_result, Exception) else {}
            market_trends = trend_result if not isinstance(trend_result, Exception) else {}
            
            # 记录第一轮完成状态
            round1_completed = 0
            for name, result in [("市场概览", overview_result), ("市场用户画像", persona_result), 
                                 ("市场机会挖掘", opportunity_result), ("市场趋势分析", trend_result)]:
                if isinstance(result, Exception):
                    logger.error(f"{name}生成失败: {result}")
                else:
                    logger.info(f"✅ {name}完成")
                    round1_completed += 1
            
            logger.info(f"📊 第一轮完成 ({round1_completed}/4)，开始第二轮并行分析（战略定位、场景分析、质量迭代、行动优先级）...")
            
            positioning_result, context_result, roadmap_result, actions_result = await asyncio.gather(
                generate_strategic_positioning(),
                generate_usage_context_analysis(),
                generate_quality_roadmap(),
                generate_action_priorities(),
                return_exceptions=True
            )
            
            # 处理第二轮结果
            strategic_positioning = positioning_result if not isinstance(positioning_result, Exception) else {}
            usage_context_analysis = context_result if not isinstance(context_result, Exception) else {}
            quality_roadmap = roadmap_result if not isinstance(roadmap_result, Exception) else {}
            action_priorities = actions_result if not isinstance(actions_result, Exception) else {}
            
            # 记录第二轮完成状态
            round2_completed = 0
            for name, result in [("战略定位", positioning_result), ("使用场景分析", context_result), 
                                 ("质量迭代方向", roadmap_result), ("行动优先级", actions_result)]:
                if isinstance(result, Exception):
                    logger.error(f"{name}生成失败: {result}")
                else:
                    logger.info(f"✅ {name}完成")
                    round2_completed += 1
            
            logger.info(f"🎉 全部8个分析模块完成 (第一轮: {round1_completed}/4, 第二轮: {round2_completed}/4)")
            
            # 6. 构建产品对比数据（保留对比视角）
            product_profiles = []
            for i, info in enumerate(products_info, 1):
                product_profiles.append({
                    "product_index": i,
                    "product_name": info['name'],
                    "asin": info['asin'],
                    "image_url": info.get('image_url'),
                    "review_count": info.get('review_count', 0),
                    "five_w": info['data'].get('user_context', {}),
                    "dimensions": info['data'].get('key_insights', {})
                })
            
            # 7. 构建 data_statistics（纯数据统计，可点击查看原文）
            data_statistics = self._build_data_statistics(market_aggregated)
            
            # 8. 组装最终结果
            result_data = {
                "analysis_type": "market_insight",
                "market_name": project.title,
                "product_count": product_count,
                "total_reviews": total_reviews,
                
                # 第一部分：数据统计（纯数据展示，可点击查看原文）
                "data_statistics": data_statistics,
                
                # 第二部分：基于数据的推理（AI 分析观点，8模块完整版）
                "market_analysis": {
                    # 板块A: 市场格局
                    "market_overview": market_overview,
                    "strategic_positioning": strategic_positioning,
                    
                    # 板块B: 用户洞察
                    "market_persona": market_persona,
                    "usage_context_analysis": usage_context_analysis,
                    
                    # 板块C: 产品策略
                    "market_opportunities": market_opportunities,
                    "quality_roadmap": quality_roadmap,
                    
                    # 板块D: 运营行动
                    "market_trends": market_trends,
                    "action_priorities": action_priorities
                },
                
                # 生成进度追踪
                "generation_progress": {
                    "total_modules": 8,
                    "completed_modules": round1_completed + round2_completed,
                    "round1_completed": round1_completed,
                    "round2_completed": round2_completed
                },
                
                # 保留原有字段（向后兼容）
                "market_overview": market_overview,
                "market_persona": market_persona,
                "market_opportunities": market_opportunities,
                "market_trends": market_trends,
                "strategic_positioning": strategic_positioning,
                "usage_context_analysis": usage_context_analysis,
                "quality_roadmap": quality_roadmap,
                "action_priorities": action_priorities,
                "aggregated_data": market_aggregated,
                "product_profiles": product_profiles,
                # [NEW] 项目级学习结果
                "project_learning": {
                    "dimensions": learning_result.get("dimensions", {}),
                    "labels": learning_result.get("labels", {}),
                    "sample_stats": learning_result.get("sample_stats", {})
                }
            }
            
            project.result_content = result_data
            project.status = AnalysisStatus.COMPLETED.value
            project.error_message = None
            
            logger.info(f"市场洞察分析完成: {project.id}")
            
        except Exception as e:
            logger.error(f"Market Insight Analysis Error: {e}", exc_info=True)
            project.status = AnalysisStatus.FAILED.value
            project.error_message = str(e)
        
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def _fetch_product_data_full(self, item: AnalysisProjectItem) -> Dict[str, Any]:
        """
        获取单个产品的完整数据（用于市场洞察）
        """
        product = item.product
        
        # 构建安全的产品名称
        raw_name = product.title_translated or product.title or product.asin
        safe_name = raw_name[:30].replace('"', '').replace("'", "").strip() + f" ({product.asin[-4:]})"
        
        # 聚合核心数据 (5W + Insight)
        context_stats = await self.summary_service._aggregate_5w_stats(product.id)
        insight_stats = await self.summary_service._aggregate_insight_stats(product.id)
        
        # 获取评论数
        review_count = await self.summary_service._count_translated_reviews(product.id)
        
        return {
            "name": safe_name,
            "asin": product.asin,
            "image_url": product.image_url,
            "review_count": review_count,
            "data": {
                "user_context": context_stats,
                "key_insights": insight_stats
            }
        }

    def _aggregate_market_data(self, products_info: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        聚合市场级别数据（跨产品标签合并）
        
        将多个产品的5W数据和洞察数据聚合，计算市场级别的统计
        """
        from collections import defaultdict
        
        # 5W维度聚合
        five_w_aggregated = defaultdict(lambda: defaultdict(int))
        # 洞察维度聚合
        insight_aggregated = defaultdict(lambda: defaultdict(int))
        
        for info in products_info:
            # 聚合5W数据
            context = info['data'].get('user_context', {})
            for dim_key in ['who', 'buyer', 'user', 'when', 'where', 'why', 'what']:
                dim_data = context.get(dim_key, {})
                items = dim_data.get('items', []) if isinstance(dim_data, dict) else []
                for item in items:
                    label = item.get('name', '')
                    count = item.get('value', 0)
                    if label:
                        five_w_aggregated[dim_key][label] += count
            
            # 聚合洞察数据
            insights = info['data'].get('key_insights', {})
            for dim_key in ['strength', 'weakness', 'suggestion', 'scenario', 'emotion']:
                dim_data = insights.get(dim_key, {})
                items = dim_data.get('items', []) if isinstance(dim_data, dict) else []
                for item in items:
                    label = item.get('name', '')
                    count = item.get('value', 0)
                    if label:
                        insight_aggregated[dim_key][label] += count
        
        # 转换为列表格式并排序
        def to_sorted_list(data: Dict[str, int], limit: int = 20) -> List[Dict[str, Any]]:
            sorted_items = sorted(data.items(), key=lambda x: x[1], reverse=True)[:limit]
            total = sum(data.values())
            return [
                {
                    "label": label,
                    "count": count,
                    "percentage": f"{(count / total * 100):.1f}%" if total > 0 else "0%"
                }
                for label, count in sorted_items
            ]
        
        # 构建聚合结果
        five_w_result = {}
        for dim_key in ['who', 'buyer', 'user', 'when', 'where', 'why', 'what']:
            five_w_result[dim_key] = to_sorted_list(dict(five_w_aggregated[dim_key]))
        
        dimensions_result = {}
        # 映射洞察类型到前端展示名称
        insight_mapping = {
            'strength': 'pros',
            'weakness': 'cons',
            'suggestion': 'suggestion',
            'scenario': 'scenario',
            'emotion': 'emotion'
        }
        for dim_key, display_key in insight_mapping.items():
            dimensions_result[display_key] = to_sorted_list(dict(insight_aggregated[dim_key]))
        
        return {
            "five_w": five_w_result,
            "dimensions": dimensions_result,
            "total_products": len(products_info),
            "total_labels": sum(len(v) for v in five_w_aggregated.values()) + sum(len(v) for v in insight_aggregated.values())
        }

    def _generate_product_summaries_for_market(self, products_info: List[Dict[str, Any]]) -> str:
        """生成产品摘要（用于市场洞察）"""
        summaries = []
        for i, info in enumerate(products_info, 1):
            name = info.get("name", f"产品{i}")
            asin = info.get("asin", "")
            review_count = info.get("review_count", 0)
            
            # 提取关键标签 - 5W用户画像
            context = info['data'].get('user_context', {})
            who_tags = self._extract_top_labels(context.get('who', {}))
            when_tags = self._extract_top_labels(context.get('when', {}))
            where_tags = self._extract_top_labels(context.get('where', {}))
            why_tags = self._extract_top_labels(context.get('why', {}))
            what_tags = self._extract_top_labels(context.get('what', {}))
            
            # 提取关键标签 - 洞察
            insights = info['data'].get('key_insights', {})
            pros_tags = self._extract_top_labels(insights.get('strength', {}))
            cons_tags = self._extract_top_labels(insights.get('weakness', {}))
            
            summary = f"""产品{i}: {name} ({asin}) - {review_count}条评论
  【用户画像】用户: {', '.join(who_tags) or '无'} | 时机: {', '.join(when_tags) or '无'} | 场景: {', '.join(where_tags) or '无'}
  【购买动机】{', '.join(why_tags) or '无'} | 用途: {', '.join(what_tags) or '无'}
  【口碑】优势: {', '.join(pros_tags) or '无'} | 痛点: {', '.join(cons_tags) or '无'}"""
            summaries.append(summary)
        
        return "\n\n".join(summaries)

    def _extract_top_labels(self, data: Dict[str, Any], limit: int = 3) -> List[str]:
        """从聚合数据中提取Top标签"""
        if not isinstance(data, dict):
            return []
        items = data.get('items', [])
        return [item.get('name', '') for item in items[:limit] if isinstance(item, dict) and item.get('name')]

    def _build_data_statistics(self, aggregated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        构建数据统计结构（用于报告第一部分展示）
        
        将 aggregated_data 转换为前端友好的 data_statistics 格式：
        - five_w: 5W 用户画像数据统计
        - insights: 洞察数据统计
        
        每个维度包含：标签名称、出现次数、占比
        """
        five_w = aggregated_data.get("five_w", {})
        dimensions = aggregated_data.get("dimensions", {})
        
        # 5W 用户画像数据统计
        five_w_stats = {}
        for dim_key in ['buyer', 'user', 'where', 'when', 'why', 'what']:
            dim_data = five_w.get(dim_key, [])
            if isinstance(dim_data, list):
                five_w_stats[dim_key] = [
                    {
                        "label": item.get("label", ""),
                        "count": item.get("count", 0),
                        "percentage": item.get("percentage", "0%")
                    }
                    for item in dim_data
                    if isinstance(item, dict) and item.get("label")
                ]
            else:
                five_w_stats[dim_key] = []
        
        # 洞察数据统计
        # 映射 pros/cons 到 strength/weakness
        insight_mapping = {
            'strength': 'pros',
            'weakness': 'cons',
            'suggestion': 'suggestion',
            'scenario': 'scenario',
            'emotion': 'emotion'
        }
        
        insight_stats = {}
        for insight_key, source_key in insight_mapping.items():
            dim_data = dimensions.get(source_key, [])
            if isinstance(dim_data, list):
                insight_stats[insight_key] = [
                    {
                        "label": item.get("label", ""),
                        "count": item.get("count", 0),
                        "percentage": item.get("percentage", "0%")
                    }
                    for item in dim_data
                    if isinstance(item, dict) and item.get("label")
                ]
            else:
                insight_stats[insight_key] = []
        
        return {
            "five_w": five_w_stats,
            "insights": insight_stats,
            "total_products": aggregated_data.get("total_products", 0),
            "total_labels": aggregated_data.get("total_labels", 0)
        }
