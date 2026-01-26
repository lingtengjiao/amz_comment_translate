"""
数据透视AI Prompt模板库
标准化所有子模块的AI解读prompt
"""
from typing import Dict, Any, List
import json


# 子模块配置字典
MODULE_CONFIGS = {
    # ========== 人群洞察模块 ==========
    "decision_flow": {
        "analysis_name": "决策链路分析",
        "analysis_description": "分析购买者与使用者的配对关系，识别'买者非用者'场景",
        "business_value": "识别'买者非用者'场景，优化广告投放和文案话术",
        "focus_dimension": "购买者与使用者的配对关系",
        "data_description": "购买者-使用者配对数据，包含每种配对的出现次数和占比",
        "module_type": "2d",
        "dimensions": ["buyer", "user"],
        "severity_hints": {
            "high_mismatch": "warning",  # 购买者≠使用者占比高
            "gift_scenario": "info",     # 礼品场景明显
            "normal": "info"
        }
    },
    "audience_strength": {
        "analysis_name": "人群-卖点匹配分析",
        "analysis_description": "分析不同购买者群体关注的产品优势差异",
        "business_value": "识别不同人群最关注的优势点，用于广告素材定制",
        "focus_dimension": "不同购买者群体关注的产品优势差异",
        "data_description": "购买者-产品优势交叉矩阵，显示每个购买者群体提及各优势的次数",
        "module_type": "2d",
        "dimensions": ["buyer", "strength"],
        "severity_hints": {
            "clear_difference": "success",  # 不同人群优势偏好差异明显
            "overlap": "info"
        }
    },
    "decision_logic_chain": {
        "analysis_name": "决策逻辑链",
        "analysis_description": "分析完整的购买决策路径（购买者→使用者→动机）",
        "business_value": "完整还原购买决策路径，用于广告受众定位、识别礼品场景",
        "focus_dimension": "完整的购买决策路径（购买者→使用者→动机）",
        "data_description": "3D矩阵数据，按购买者分层，每层显示使用者×动机的热力图",
        "module_type": "3d",
        "dimensions": ["buyer", "user", "motivation"],
        "severity_hints": {
            "gift_scenario": "info",
            "clear_path": "success"
        }
    },
    
    # ========== 需求洞察模块 ==========
    "motivation_location": {
        "analysis_name": "刚需场景分析",
        "analysis_description": "分析购买动机与使用地点的交叉关系",
        "business_value": "识别高频高满意度场景，找到产品的'黄金使用场景'",
        "focus_dimension": "购买动机与使用地点的交叉关系",
        "data_description": "动机×地点热力图数据，显示每种动机-地点组合的出现频次",
        "module_type": "2d",
        "dimensions": ["motivation", "location"],
        "severity_hints": {
            "high_frequency": "success",  # 高频组合
            "golden_scenario": "success"  # 黄金场景
        }
    },
    "demand_satisfaction": {
        "analysis_name": "需求满足度矩阵",
        "analysis_description": "分析购买动机与用户满意度的匹配度",
        "business_value": "识别'期望高但满意度低'的需求，用于差评预警",
        "focus_dimension": "购买动机与用户满意度的匹配度",
        "data_description": "动机×情感倾向矩阵，显示每种动机对应的正面/中性/负面评论数量",
        "module_type": "2d",
        "dimensions": ["motivation", "sentiment"],
        "severity_hints": {
            "high_satisfaction": "success",
            "low_satisfaction": "warning",  # 期望落差大
            "critical_gap": "error"  # 致命期望落差
        }
    },
    "motivation_emotion": {
        "analysis_name": "心智匹配分析",
        "analysis_description": "分析购买动机与用户情感的匹配度",
        "business_value": "验证品牌定位，分析动机与情感的匹配度",
        "focus_dimension": "购买动机与用户情感的匹配度",
        "data_description": "动机×情感热力图，显示每种动机对应的情感类型和频次",
        "module_type": "2d",
        "dimensions": ["motivation", "emotion"],
        "severity_hints": {
            "good_match": "success",
            "mismatch": "warning"
        }
    },
    "rnd_priority": {
        "analysis_name": "研发优先级",
        "analysis_description": "分析核心痛点识别（动机→劣势→建议的完整链条）",
        "business_value": "核心痛点识别，用于PRD优先级排序",
        "focus_dimension": "核心痛点识别（动机→劣势→建议的完整链条）",
        "data_description": "3D矩阵数据，按动机分层，每层显示劣势×建议的热力图",
        "module_type": "3d",
        "dimensions": ["motivation", "weakness", "suggestion"],
        "severity_hints": {
            "high_priority": "warning",
            "critical": "critical"
        }
    },
    
    # ========== 产品洞察模块 ==========
    "critical_weakness": {
        "analysis_name": "致命缺陷识别",
        "analysis_description": "分析高负面情绪+高提及的致命缺陷",
        "business_value": "识别'高负面情绪+高提及'的致命缺陷，用于改进优先级",
        "focus_dimension": "高负面情绪+高提及的致命缺陷",
        "data_description": "劣势×情感倾向矩阵，显示每种劣势对应的正面/中性/负面评论数量",
        "module_type": "2d",
        "dimensions": ["weakness", "sentiment"],
        "severity_hints": {
            "high_negative": "error",
            "critical": "critical"
        }
    },
    "strength_weakness": {
        "analysis_name": "优劣势对比",
        "analysis_description": "分析各维度的优劣势对比",
        "business_value": "识别'纯优势无劣势'的维度，用于差异化方向",
        "focus_dimension": "各维度的优劣势对比",
        "data_description": "各维度的优势提及次数和劣势提及次数对比",
        "module_type": "2d",
        "dimensions": ["strength", "weakness"],
        "severity_hints": {
            "pure_strength": "success",
            "pure_weakness": "error",
            "balanced": "info"
        }
    },
    "strength_emotion": {
        "analysis_name": "优势情感分析",
        "analysis_description": "分析能触发强烈正面情感的优势维度",
        "business_value": "识别能触发强烈正面情感的优势维度，用于品牌溢价点",
        "focus_dimension": "能触发强烈正面情感的优势维度",
        "data_description": "优势×情感热力图，显示每种优势对应的情感类型和频次",
        "module_type": "2d",
        "dimensions": ["strength", "emotion"],
        "severity_hints": {
            "strong_emotion": "success",
            "brand_premium": "success"
        }
    },
    "improvement_priority": {
        "analysis_name": "场景化改进建议",
        "analysis_description": "分析环境相关的硬件需求",
        "business_value": "环境相关的硬件需求，用于PRD",
        "focus_dimension": "环境相关的硬件需求",
        "data_description": "地点×建议热力图，显示每个使用地点对应的改进建议频次",
        "module_type": "2d",
        "dimensions": ["location", "suggestion"],
        "severity_hints": {
            "high_frequency": "info",
            "critical_location": "warning"
        }
    },
    "motivation_suggestion": {
        "analysis_name": "动机分层优化",
        "analysis_description": "分析不同购买动机用户的改进诉求差异",
        "business_value": "发现不同购买动机用户的改进诉求差异，用于用户分层策略",
        "focus_dimension": "不同购买动机用户的改进诉求差异",
        "data_description": "动机×建议热力图，显示每种动机对应的改进建议频次",
        "module_type": "2d",
        "dimensions": ["motivation", "suggestion"],
        "severity_hints": {
            "clear_difference": "info",
            "user_segmentation": "success"
        }
    },
    "negative_optimization": {
        "analysis_name": "维度冲突分析",
        "analysis_description": "分析'优势被改进建议抵消'的维度",
        "business_value": "识别'优势被改进建议抵消'的维度，用于迭代优先级",
        "focus_dimension": "'优势被改进建议抵消'的维度",
        "data_description": "各维度的优势提及次数和改进建议提及次数对比",
        "module_type": "2d",
        "dimensions": ["strength", "suggestion"],
        "severity_hints": {
            "high_conflict": "warning",
            "low_conflict": "info"
        }
    },
    
    # ========== 场景洞察模块 ==========
    "scenario_distribution": {
        "analysis_name": "地点×时间的完整交叉关系热力图",
        "analysis_description": "分析高频使用时空的完整交叉关系",
        "business_value": "识别高频使用时空的完整交叉关系，用于流量密码（投放时段）",
        "focus_dimension": "高频使用时空的完整交叉关系",
        "data_description": "地点×时间热力图矩阵，显示每种地点-时间组合的出现频次",
        "module_type": "2d",
        "dimensions": ["location", "time"],
        "severity_hints": {
            "high_frequency": "success",
            "golden_time": "success"
        }
    },
    "scenario_sentiment": {
        "analysis_name": "场景×情感的完整交叉关系热力图",
        "analysis_description": "分析不同场景引发的情感反馈的完整交叉关系",
        "business_value": "不同场景引发的情感反馈的完整交叉关系，用于视觉指南（品牌定调）",
        "focus_dimension": "不同场景引发的情感反馈的完整交叉关系",
        "data_description": "场景×情感热力图矩阵，显示每种场景-情感组合的出现频次",
        "module_type": "2d",
        "dimensions": ["scenario", "emotion"],
        "severity_hints": {
            "positive_match": "success",
            "negative_match": "warning"
        }
    },
    "life_moment": {
        "analysis_name": "真实生活瞬间",
        "analysis_description": "分析完整还原用户使用场景",
        "business_value": "完整还原用户使用场景，用于产品定义(PD)",
        "focus_dimension": "完整还原用户使用场景",
        "data_description": "3D矩阵数据，按地点分层，每层显示时机×场景的热力图",
        "module_type": "3d",
        "dimensions": ["location", "time", "scenario"],
        "severity_hints": {
            "typical_scenario": "success",
            "diverse": "info"
        }
    },
    "environment_conflict": {
        "analysis_name": "环境冲突分析",
        "analysis_description": "分析特定环境下的产品问题",
        "business_value": "识别特定环境下的产品问题，用于产品线扩张",
        "focus_dimension": "特定环境下的产品问题",
        "data_description": "3D矩阵数据，按情感分层，每层显示产品维度×地点的热力图",
        "module_type": "3d",
        "dimensions": ["emotion", "dimension", "location"],
        "severity_hints": {
            "environment_issue": "warning",
            "expansion_opportunity": "success"
        }
    },
    
    # ========== 品牌洞察模块 ==========
    "brand_memory": {
        "analysis_name": "品牌记忆点",
        "analysis_description": "分析'优势+场景+正向情感'的强关联",
        "business_value": "识别'优势+场景+正向情感'的强关联，用于A+脚本/主图视频",
        "focus_dimension": "'优势+场景+正向情感'的强关联",
        "data_description": "3D矩阵数据，按产品优势分层，每层显示场景×情感的热力图",
        "module_type": "3d",
        "dimensions": ["strength", "scenario", "emotion"],
        "severity_hints": {
            "strong_association": "success",
            "brand_point": "success"
        }
    },
    "recommendation_willingness": {
        "analysis_name": "用户推荐意愿",
        "analysis_description": "分析用户推荐意愿和口碑",
        "business_value": "评估品牌口碑和NPS（净推荐值）",
        "focus_dimension": "用户推荐意愿和口碑",
        "data_description": "评分分布、平均评分、推荐率、高参与度评论数据",
        "module_type": "stat",
        "dimensions": ["rating", "sentiment"],
        "severity_hints": {
            "high_recommendation": "success",
            "low_recommendation": "warning"
        }
    },
    "brand_mind": {
        "analysis_name": "品牌核心心智",
        "analysis_description": "分析用户心智中的核心优势维度",
        "business_value": "识别用户心智中的核心优势维度",
        "focus_dimension": "用户心智中的核心优势维度",
        "data_description": "各优势维度的提及次数排序",
        "module_type": "stat",
        "dimensions": ["strength"],
        "severity_hints": {
            "clear_mind": "success",
            "diverse": "info"
        }
    },
}


def generate_pivot_insight_prompt(
    sub_type: str,
    data: Dict[str, Any],
    total_reviews: int = 0
) -> str:
    """
    生成标准化的数据透视AI prompt
    
    Args:
        sub_type: 子模块类型（如 'decision_flow', 'audience_strength'）
        data: 输入数据字典
        total_reviews: 总评论数
    
    Returns:
        完整的prompt字符串
    """
    if sub_type not in MODULE_CONFIGS:
        raise ValueError(f"Unknown sub_type: {sub_type}")
    
    config = MODULE_CONFIGS[sub_type]
    module_type = config["module_type"]
    
    # 根据模块类型选择不同的模板
    if module_type == "3d":
        template = _get_3d_template()
    elif module_type == "stat":
        template = _get_stat_template()
    else:
        template = _get_2d_template()
    
    # 格式化数据描述
    data_json = json.dumps(data, ensure_ascii=False, indent=2)
    
    # 生成数据支撑提示
    data_support_hint = _generate_data_support_hint(data, total_reviews, config)
    
    # 填充模板
    prompt = template.format(
        analysis_name=config["analysis_name"],
        analysis_description=config["analysis_description"],
        business_value=config["business_value"],
        focus_dimension=config["focus_dimension"],
        data_description=config["data_description"],
        data_json=data_json,
        data_support_hint=data_support_hint,
        dimensions=" × ".join([DIMENSION_LABELS.get(d, d) for d in config["dimensions"]])
    )
    
    return prompt


def _get_2d_template() -> str:
    """2D交叉分析模板"""
    return """你是一位专业的产品分析专家，擅长从用户评论的交叉分析中提炼商业洞察。

# 分析任务
{analysis_name} - {analysis_description}

# 业务价值
{business_value}

# 分析维度
{dimensions} 的交叉关系分析

# 输入数据
{data_description}

# 数据内容
{data_json}

# 数据支撑提示
{data_support_hint}

# 分析要求
1. **关键发现**（2-4条）：
   - 聚焦于{focus_dimension}的交叉关系洞察
   - 识别显著的决策模式、异常模式或业务机会
   - 每条发现必须包含具体数据（如"X次提及"、"占比Y%"、"出现Z次"）
   - 避免单维度统计，强调交叉关系的意义
   - 发现要具体、可量化，避免泛泛而谈

2. **数据支撑**：
   - 提供关键数据指标（如"基于N条评论分析"、"共识别M种组合"）
   - 可以是一个字符串，也可以是多个指标数组
   - 格式示例：
     - 字符串: "基于53条评论分析，共识别6种购买者-使用者配对组合"
     - 数组: [{{"metric": "购买者群体数", "value": "4个"}}, {{"metric": "优势维度数", "value": "6个"}}]

3. **行动建议**（2-3条）：
   - 基于交叉分析发现，提供可执行的商业建议
   - 建议要具体、可操作，避免泛泛而谈
   - 优先考虑对业务影响最大的建议
   - 每条建议要明确针对哪个发现

4. **严重程度判断**：
   - `info`: 一般信息性洞察
   - `success`: 发现积极机会或优势
   - `warning`: 需要关注的问题或风险
   - `error`: 严重问题需要立即处理
   - `critical`: 致命问题，可能影响产品生存

# 输出格式
请返回标准JSON格式，严格遵循以下结构：
{{
  "keyFindings": [
    "发现1（包含具体数据，如'主要购买者: 宝妈 (24次提及)'）",
    "发现2（包含具体数据，如'购买者≠使用者，存在礼品场景，占比68.5%'）",
    "发现3（包含具体数据）"
  ],
  "dataSupport": "基于X条评论分析，共识别Y种组合" 或 [
    {{"metric": "指标1", "value": "数值1"}},
    {{"metric": "指标2", "value": "数值2"}}
  ],
  "recommendations": [
    "建议1（具体可执行，如'针对主要人群定制营销素材：突出XX场景'）",
    "建议2（具体可执行）",
    "建议3（具体可执行）"
  ],
  "severity": "info|success|warning|error|critical"
}}

# 注意事项
- 必须返回有效的JSON格式
- 所有发现必须基于输入数据，不要编造
- 关键发现中必须包含具体数字（次数、占比、频次等）
- 行动建议要具体可执行，避免空泛
- 严重程度要根据业务影响判断，不要过度使用critical
"""


def _get_3d_template() -> str:
    """3D交叉分析模板"""
    return """你是一位专业的产品分析专家，擅长从用户评论的3D交叉分析中提炼商业洞察。

# 分析任务
{analysis_name} - {analysis_description}

# 业务价值
{business_value}

# 分析维度
{dimensions} 的3D交叉关系分析

# 输入数据
{data_description}

# 数据内容
{data_json}

# 数据支撑提示
{data_support_hint}

# 分析要求
1. **关键发现**（2-4条）：
   - 聚焦于{focus_dimension}的3D交叉关系洞察
   - 识别完整的决策链条或使用场景链条
   - 每条发现必须包含具体数据（如"X次提及"、"占比Y%"、"出现Z次"）
   - 强调3个维度之间的完整关系，而非单维度或2D关系
   - 发现要具体、可量化，避免泛泛而谈

2. **数据支撑**：
   - 提供关键数据指标（如"基于N条评论分析"、"共识别M种3D组合"）
   - 可以是一个字符串，也可以是多个指标数组
   - 格式示例：
     - 字符串: "基于53条评论分析，识别出5种购买者×4种使用者×6种动机的组合"
     - 数组: [{{"metric": "维度1类型数", "value": "5种"}}, {{"metric": "维度2类型数", "value": "4种"}}, {{"metric": "总3D组合数", "value": "45次"}}]

3. **行动建议**（2-3条）：
   - 基于3D交叉分析发现，提供可执行的商业建议
   - 建议要具体、可操作，避免泛泛而谈
   - 优先考虑对业务影响最大的建议
   - 每条建议要明确针对哪个发现

4. **严重程度判断**：
   - `info`: 一般信息性洞察
   - `success`: 发现积极机会或优势
   - `warning`: 需要关注的问题或风险
   - `error`: 严重问题需要立即处理
   - `critical`: 致命问题，可能影响产品生存

# 输出格式
请返回标准JSON格式，严格遵循以下结构：
{{
  "keyFindings": [
    "发现1（包含具体数据，如'主要决策路径: 宝妈（购买者）→ 学龄前儿童（使用者）→ 安全需求（动机），出现18次'）",
    "发现2（包含具体数据，如'礼品场景明显：68%的购买者是为他人购买'）",
    "发现3（包含具体数据）"
  ],
  "dataSupport": "基于X条评论分析，识别出Y种3D组合" 或 [
    {{"metric": "维度1类型数", "value": "X种"}},
    {{"metric": "维度2类型数", "value": "Y种"}},
    {{"metric": "总3D组合数", "value": "Z次"}}
  ],
  "recommendations": [
    "建议1（具体可执行，如'针对礼品场景：优化产品包装和赠送体验'）",
    "建议2（具体可执行）",
    "建议3（具体可执行）"
  ],
  "severity": "info|success|warning|error|critical"
}}

# 注意事项
- 必须返回有效的JSON格式
- 所有发现必须基于输入数据，不要编造
- 关键发现中必须包含具体数字（次数、占比、频次等）
- 行动建议要具体可执行，避免空泛
- 严重程度要根据业务影响判断，不要过度使用critical
- 强调3D关系的完整性，而非单维度或2D关系
"""


def _get_stat_template() -> str:
    """统计分析模板"""
    return """你是一位专业的产品分析专家，擅长从用户评论的统计分析中提炼商业洞察。

# 分析任务
{analysis_name} - {analysis_description}

# 业务价值
{business_value}

# 分析维度
{dimensions} 的统计分析

# 输入数据
{data_description}

# 数据内容
{data_json}

# 数据支撑提示
{data_support_hint}

# 分析要求
1. **关键发现**（2-4条）：
   - 聚焦于{focus_dimension}的统计洞察
   - 识别显著的模式、趋势或异常
   - 每条发现必须包含具体数据（如"X次提及"、"占比Y%"、"平均Z分"）
   - 发现要具体、可量化，避免泛泛而谈

2. **数据支撑**：
   - 提供关键数据指标（如"基于N条评论分析"、"总提及次数"）
   - 可以是一个字符串，也可以是多个指标数组
   - 格式示例：
     - 字符串: "基于53条评论分析，平均评分4.5分"
     - 数组: [{{"metric": "总评论数", "value": "53条"}}, {{"metric": "平均评分", "value": "4.5分"}}]

3. **行动建议**（2-3条）：
   - 基于统计分析发现，提供可执行的商业建议
   - 建议要具体、可操作，避免泛泛而谈
   - 优先考虑对业务影响最大的建议
   - 每条建议要明确针对哪个发现

4. **严重程度判断**：
   - `info`: 一般信息性洞察
   - `success`: 发现积极机会或优势
   - `warning`: 需要关注的问题或风险
   - `error`: 严重问题需要立即处理
   - `critical`: 致命问题，可能影响产品生存

# 输出格式
请返回标准JSON格式，严格遵循以下结构：
{{
  "keyFindings": [
    "发现1（包含具体数据，如''设计'维度提及率最高（24次，占比45%）'）",
    "发现2（包含具体数据）",
    "发现3（包含具体数据）"
  ],
  "dataSupport": "基于X条评论分析" 或 [
    {{"metric": "指标1", "value": "数值1"}},
    {{"metric": "指标2", "value": "数值2"}}
  ],
  "recommendations": [
    "建议1（具体可执行）",
    "建议2（具体可执行）",
    "建议3（具体可执行）"
  ],
  "severity": "info|success|warning|error|critical"
}}

# 注意事项
- 必须返回有效的JSON格式
- 所有发现必须基于输入数据，不要编造
- 关键发现中必须包含具体数字（次数、占比、平均值等）
- 行动建议要具体可执行，避免空泛
- 严重程度要根据业务影响判断，不要过度使用critical
"""


def _generate_data_support_hint(data: Dict[str, Any], total_reviews: int, config: Dict) -> str:
    """生成数据支撑提示"""
    hints = []
    
    if total_reviews > 0:
        hints.append(f"- 总评论数: {total_reviews}条")
    
    # 根据数据类型生成提示
    if "pairs" in data or "buyerUserPairs" in data:
        pairs = data.get('pairs') or data.get('buyerUserPairs', [])
        hints.append(f"- 配对组合数: {len(pairs)}种")
    if "buyerStrengthMap" in data:
        buyers = len(data.get('buyerStrengthMap', {}))
        hints.append(f"- 购买者群体数: {buyers}个")
    if "motivationSentiment" in data:
        motivations = len(data.get('motivationSentiment', []))
        hints.append(f"- 动机类型数: {motivations}种")
    if "motivationLocationMap" in data:
        motivations = len(data.get('motivationLocationMap', {}))
        locations = set()
        for loc_dict in data.get('motivationLocationMap', {}).values():
            locations.update(loc_dict.keys())
        hints.append(f"- 动机类型数: {motivations}种，地点类型数: {len(locations)}种")
    if "motivationEmotionMap" in data:
        motivations = len(data.get('motivationEmotionMap', {}))
        emotions = set()
        for emo_dict in data.get('motivationEmotionMap', {}).values():
            emotions.update(emo_dict.keys())
        hints.append(f"- 动机类型数: {motivations}种，情感类型数: {len(emotions)}种")
    if "strengthEmotionMap" in data:
        strengths = len(data.get('strengthEmotionMap', {}))
        emotions = set()
        for emo_dict in data.get('strengthEmotionMap', {}).values():
            emotions.update(emo_dict.keys())
        hints.append(f"- 优势维度数: {strengths}种，情感类型数: {len(emotions)}种")
    if "weaknessSentiment" in data:
        weaknesses = len(data.get('weaknessSentiment', []))
        hints.append(f"- 劣势维度数: {weaknesses}种")
    if "dimensionComparison" in data:
        dimensions = len(data.get('dimensionComparison', {}))
        hints.append(f"- 维度总数: {dimensions}个")
    if "slices" in data:
        slices = len(data.get('slices', []))
        hints.append(f"- 3D分层数: {slices}层")
        # 统计总组合数
        total_combinations = sum(slice.get('count', 0) for slice in data.get('slices', []))
        if total_combinations > 0:
            hints.append(f"- 总3D组合数: {total_combinations}次")
    if "scenarioEmotionMatrix" in data:
        scenarios = len(data.get('scenarios', []))
        emotions = len(data.get('emotions', []))
        hints.append(f"- 场景类型数: {scenarios}种，情感类型数: {emotions}种")
    if "strengthDistribution" in data:
        strengths = len(data.get('strengthDistribution', []))
        total = sum(s.get('count', 0) for s in data.get('strengthDistribution', []))
        hints.append(f"- 优势维度数: {strengths}种，总提及次数: {total}次")
    if "ratingDistribution" in data:
        total = data.get('totalReviews', 0)
        avg_rating = data.get('avgRating', 0)
        recommendation_rate = data.get('recommendationRate', 0)
        hints.append(f"- 平均评分: {avg_rating}分，推荐率: {recommendation_rate}%")
    
    if hints:
        return "\n".join(hints)
    return "- 请根据数据内容提取关键指标"


# 维度标签映射
DIMENSION_LABELS = {
    "buyer": "购买者",
    "user": "使用者",
    "motivation": "动机",
    "location": "地点",
    "time": "时机",
    "scenario": "场景",
    "strength": "产品优势",
    "weakness": "产品劣势",
    "suggestion": "改进建议",
    "sentiment": "情感倾向",
    "emotion": "用户情感",
    "rating": "评分",
    "dimension": "产品维度"
}
