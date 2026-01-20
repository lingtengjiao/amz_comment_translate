"""
Translation Service - Qwen API Integration for Amazon Review Translation
[Optimized Version]
Features:
1. Few-Shot System Prompt for natural, e-commerce style translation
2. CoT (Chain of Thought) Prompt for insight extraction
3. Robust JSON parsing to handle LLM output errors
"""
import logging
import json
import re
from typing import Optional, Tuple, List
from enum import Enum
from concurrent.futures import ThreadPoolExecutor

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

logger = logging.getLogger(__name__)


class Sentiment(str, Enum):
    """Sentiment analysis result"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


# [UPDATED] System prompt with Few-Shot examples
TRANSLATION_SYSTEM_PROMPT = """你是一位精通中美文化差异的资深亚马逊跨境电商翻译专家。你的目标是提供"信、达、雅"的中文译文。

### 核心规则
1. **拒绝翻译腔**: 不要逐字翻译。
   - ❌ 错误: "这个产品工作得很好" (The product works great)
   - ✅ 正确: "这东西太好用了" / "效果绝了"
2. **术语精准**: 
   - "DOA (Dead on Arrival)" -> "到手即坏"
   - "Return window" -> "退货期"
   - "Steal" -> "捡漏/超值"
3. **情感对齐**: 
   - 1星评论通常带有愤怒，译文要用感叹号、反问句体现情绪。
   - 5星评论通常带有兴奋，译文要体现"种草"感。

### 参考范例 (Few-Shot)
Input: "Total lemon. Stopped working after 2 days. Don't waste your money."
Output: "简直是个次品！用了两天就坏了。千万别浪费钱！"

Input: "I was skeptical at first, but this thing is a game changer for my morning routine."
Output: "起初我还有点怀疑，但这东西彻底改变了我每天早上的习惯，真香！"

Input: "It fits a bit snug, suggest sizing up."
Output: "穿起来有点紧，建议买大一码。"

Input: "The battery life is a joke."
Output: "电池续航简直就是个笑话。"

请翻译以下内容，直接输出译文："""


SENTIMENT_ANALYSIS_PROMPT = """分析以下亚马逊商品评论的情感倾向。

评论内容：
{review_text}

请只返回以下三个词之一，不要有任何其他内容：
- positive（正面：满意、推荐、喜欢）
- neutral（中性：客观描述、一般评价）
- negative（负面：不满、批评、退货）

情感判断："""


# System prompt for bullet points translation
BULLET_POINTS_SYSTEM_PROMPT = """你是一位专业的亚马逊产品描述翻译专家。你的任务是将产品的五点描述（Bullet Points）从英文翻译成中文。

翻译原则：
1. **准确传达卖点**: 保留原文的核心卖点和产品优势
2. **电商文案风格**: 使用符合中国电商的文案风格，有吸引力
3. **简洁有力**: 每条描述简洁明了，突出重点
4. **专业术语**: 正确翻译产品相关的专业术语
5. **保持格式**: 保持原文的格式结构，每条描述独立成行

输出格式：
- 直接输出翻译后的中文五点描述
- 每条描述独立成行
- 不要添加序号或符号
- 不要添加任何解释或注释"""


# [NEW] 跨语言维度发现 Prompt (英文输入 → 中文维度输出)
# [UPDATED 2026-01-16] 扩展为3类维度：产品维度、场景维度、情绪维度
DIMENSION_DISCOVERY_RAW_PROMPT = """You are a senior product manager and user research expert. 
Based on the following **English product information** and **English user review samples**, 
build a **3-category evaluation dimension model** for this product.

# Product Official Information (English)
- **Product Title**: {product_title}
- **Bullet Points**: 
{bullet_points}

# User Review Samples ({count} reviews, English Original)
{reviews_text}

# Task
Extract **3 categories** of dimensions. **Output all names and descriptions in Chinese**.

## A. Product Dimensions (产品维度) - 4-6 dimensions
For evaluating product attributes: strengths, weaknesses, suggestions.
- Examples: 功能表现、结构做工、材料质感、安全性、续航能力、外观设计、性价比
- Focus on: What aspects of the product are users evaluating?

## B. Scenario Dimensions (场景维度) - 3-5 dimensions  
For categorizing usage scenarios: where/when/how users use the product.
- Examples: 家居日常、办公场景、户外活动、亲子互动、车载使用、旅行出差
- Focus on: In what situations/contexts do users use this product?
- ⚠️ These are NOT product attributes, but usage contexts!

## C. Emotion Dimensions (情绪维度) - 3-4 dimensions
For categorizing emotional reactions: user's feelings about the product.
- Examples: 惊喜好评、失望不满、感激推荐、后悔抱怨、超出预期
- Focus on: What emotional states do users express?
- ⚠️ These are about feelings, not product features!

# Requirements
1. **Product dimensions**: Combine official positioning with user perspective.
2. **Scenario dimensions**: Extract from actual usage stories in reviews, NOT product features.
3. **Emotion dimensions**: Extract from emotional expressions in reviews.
4. **Dimension names**: Use concise Chinese (2-6 characters ideal).
5. **Mutual exclusivity**: Dimensions within each category should not overlap.
6. **Clear boundaries**: Each category serves a different purpose.

# Output Format (JSON Only, Chinese output)
{{
  "product_dimensions": [
    {{ "name": "功能表现", "description": "产品核心功能的实际表现和效果" }},
    {{ "name": "结构做工", "description": "产品的结构设计、组装质量和耐用性" }},
    ...
  ],
  "scenario_dimensions": [
    {{ "name": "家居日常", "description": "在家中日常生活中使用产品的场景" }},
    {{ "name": "户外活动", "description": "在户外、旅行、露营等场景使用" }},
    ...
  ],
  "emotion_dimensions": [
    {{ "name": "惊喜好评", "description": "超出预期的正面情绪，强烈推荐" }},
    {{ "name": "失望不满", "description": "期望落空的负面情绪，不推荐" }},
    ...
  ]
}}

Output JSON only, no other text."""


# [NEW] 跨语言5W标签发现 Prompt (英文输入 → 中文标签输出)
# [UPDATED 2026-01-14] Who 拆分为 Buyer + User
CONTEXT_DISCOVERY_RAW_PROMPT = """You are a senior marketing expert and user researcher.
Based on the following **English product information** and **English user review samples**,
build a "5W User & Market Model" for this product.

# Product Official Information (English)
- **Product Title**: {product_title}
- **Bullet Points**:
{bullet_points}

# User Review Samples ({count} buyer reviews, English Original)
{reviews_text}

# Task
Synthesize official positioning and user feedback to identify 6 categories of core elements.
Extract **Top 5-8 typical labels per category**. **Output all labels in Chinese**.

**CRITICAL: Distinguish Buyer vs User**
- **Buyer**: The person who PAYS for the product (e.g., mom buying for child, gift giver)
- **User**: The person who actually USES the product (e.g., child, gift recipient)
- If Buyer and User are the same person, put in **User** category only.

1. **Buyer (购买者)**: Who pays for the product?
   - Look for phrases: "I bought this for...", "Gift for...", "Ordered for my..."
   - Examples: 妈妈、送礼者、丈夫、企业采购、女儿(为父母买)
   - Focus on the purchasing decision maker

2. **User (使用者)**: Who actually uses the product?
   - Look for phrases: "My son loves it", "Works great for my elderly mom", "I use it daily"
   - Examples: 3岁幼儿、老人、员工、敏感肌人群、游戏玩家
   - If buyer = user (e.g., "I bought this for myself"), put here

3. **Where (地点)**: Where is it used?
   - Reference official positioning (e.g.: "for Home Office, Garage")
   - Physical spaces: 卧室、办公室、厨房、车上、房车(RV)、户外露营

4. **When (时刻)**: When is it used?
   - Time points: 早上、睡前、深夜
   - Triggers: 停电时、旅行时、运动后、节假日

5. **Why (动机)**: What triggers the purchase? (Purchase Driver)
   - Replacement: 旧的坏了、升级换代
   - Gift: 生日礼物、圣诞礼物、乔迁送礼
   - External: 被种草、看了评测、朋友推荐

6. **What (任务)**: What specific task does the user try to accomplish? (Jobs to be Done)
   - Focus on core uses from official promotion
   - Note: Specific tasks, not product features
   - Examples: 清理地毯上的宠物毛、缓解背痛、哄孩子睡觉、去除异味

# Requirements
1. **Label names in concise Chinese** (2-6 characters ideal).
2. **Merge synonyms**: e.g., "妈妈", "老妈", "母亲" should be unified.
3. **Consistent granularity**: Not too coarse ("家人") or too fine ("62岁的独居母亲").
4. **Official info priority**: Include labels from official positioning even if not mentioned in reviews.
5. **Provide brief description**: One sentence explaining the label for classification.

# Output Format (JSON Only, Chinese output)
{{
  "buyer": [
    {{ "name": "宝妈", "description": "为孩子购买产品的母亲" }},
    {{ "name": "送礼者", "description": "购买产品作为礼物送人的用户" }}
  ],
  "user": [
    {{ "name": "3岁幼儿", "description": "实际使用产品的低龄儿童" }},
    {{ "name": "老年人", "description": "实际使用产品的老年人群" }}
  ],
  "where": [
    {{ "name": "卧室", "description": "卧室/睡眠场景下使用" }}
  ],
  "when": [
    {{ "name": "睡前", "description": "睡觉前使用" }}
  ],
  "why": [
    {{ "name": "替代旧品", "description": "原有产品损坏需要更换" }}
  ],
  "what": [
    {{ "name": "清理宠物毛", "description": "官方核心用途：清理家中的猫毛狗毛" }}
  ]
}}

Output JSON only, no other text."""


# =============================================================================
# [NEW] 项目级学习与映射 Prompt - 用于市场洞察功能
# =============================================================================
PROJECT_LEVEL_LEARNING_PROMPT = """你是一位资深的市场研究专家和数据分析师。你需要为一个**细分市场洞察项目**完成以下任务：

1. **学习项目级统一维度**：聚合多个产品的维度，形成市场级别的统一维度体系
2. **学习项目级统一5W标签**：聚合多个产品的5W标签，形成市场级别的统一标签体系
3. **建立映射关系**：记录每个项目级维度/标签对应哪些产品级维度/标签

# 评论样本（来自 {product_count} 个产品的采样，共约 100 条）
{reviews_text}

# 各产品的现有维度和标签
{products_data}

# 任务说明

## 1. 项目级维度学习
将各产品的维度聚合为市场级别的统一维度：
- **产品维度 (product)**：用于评价产品属性（功能表现、质量做工等），5-8个
- **场景维度 (scenario)**：用于分类使用场景（家居日常、办公场景等），3-5个
- **情绪维度 (emotion)**：用于分类情绪反馈（惊喜好评、失望不满等），3-5个

要求：
- 合并语义相同的维度（如"便携"和"携带方便"应合并为"便携性能"）
- 保持粒度一致，不要太粗也不要太细
- 记录每个项目维度映射自哪些产品维度

## 2. 项目级5W标签学习
将各产品的5W标签聚合为市场级别的统一标签：
- **buyer**: 购买者身份（5-8个）
- **user**: 使用者身份（5-8个）
- **where**: 使用地点（5-8个）
- **when**: 使用时刻（5-8个）
- **why**: 购买动机（5-8个）
- **what**: 待办任务/用途（5-8个）

要求：
- 合并同义词（如"老人"和"老年人"应合并为"老年群体"）
- 保持粒度一致
- 记录每个项目标签映射自哪些产品标签

# 输出格式 (JSON Only)
{{
  "project_dimensions": {{
    "product": [
      {{
        "name": "便携性能",
        "description": "产品的便携程度和移动使用体验",
        "mapped_from": [
          {{"product_id": "产品ID1", "dimension_name": "便携"}},
          {{"product_id": "产品ID2", "dimension_name": "携带方便"}}
        ]
      }}
    ],
    "scenario": [
      {{
        "name": "家居日常",
        "description": "在家中日常生活场景下的使用",
        "mapped_from": [
          {{"product_id": "产品ID1", "dimension_name": "居家使用"}}
        ]
      }}
    ],
    "emotion": [
      {{
        "name": "惊喜好评",
        "description": "超出预期的正面情感反馈",
        "mapped_from": [
          {{"product_id": "产品ID1", "dimension_name": "惊喜"}}
        ]
      }}
    ]
  }},
  "project_labels": {{
    "buyer": [
      {{
        "name": "宝妈群体",
        "description": "为孩子购买产品的母亲",
        "mapped_from": [
          {{"product_id": "产品ID1", "label_name": "妈妈"}},
          {{"product_id": "产品ID2", "label_name": "宝妈"}}
        ]
      }}
    ],
    "user": [
      {{
        "name": "老年群体",
        "description": "实际使用产品的老年人",
        "mapped_from": [
          {{"product_id": "产品ID1", "label_name": "老人"}},
          {{"product_id": "产品ID2", "label_name": "老年人"}}
        ]
      }}
    ],
    "where": [...],
    "when": [...],
    "why": [...],
    "what": [...]
  }}
}}

重要提示：
1. 所有输出必须是中文
2. product_id 必须使用输入中给定的产品 ID（不要修改）
3. dimension_name 和 label_name 必须与输入中的产品维度/标签名称完全一致
4. 如果某个项目级维度/标签只来自一个产品，mapped_from 数组中只有一个元素也是允许的
5. 请只输出 JSON，不要有其他解释文字"""


# [UPDATED] 维度发现 Prompt (加入产品信息版)
DIMENSION_DISCOVERY_PROMPT = """你是一位资深的产品经理和用户研究专家。请基于以下**产品官方信息**和**用户评论样本**，构建该产品的核心评价维度模型。

# 产品官方信息
- **产品标题**: {product_title}
- **核心卖点 (Bullet Points)**: 
{bullet_points}

# 用户评论样本 ({count}条)
{reviews_text}

# 任务
提炼出 5-8 个核心评价维度。

# 要求
1. **结合官方定义与用户视角**: 维度名称应尽量使用官方术语（如来自卖点），但必须能覆盖用户的实际反馈。
2. **维度名称**: 使用简练的中文（如：外观设计、结构做工、材料质感、功能表现、安全性、性价比）。
3. **维度定义**: 用一句话描述该维度包含的具体内容，用于指导后续分类。
4. **互斥性**: 维度之间不要重叠，各维度定义边界清晰。
5. **覆盖率**: 
   - 必须覆盖评论中出现的主要痛点和爽点
   - 也要包含产品卖点中强调但用户可能"沉默满意"的维度（便于后续监控）
6. **数量控制**: 提炼 5-8 个最核心的维度，不要过多。

# 输出格式 (JSON Only)
{{
  "dimensions": [
    {{ "name": "维度名称", "description": "该维度的具体定义，描述它包含哪些内容" }},
    ...
  ]
}}

请只输出 JSON，不要有其他解释文字。"""


# [UPDATED] 跨语言洞察提取 Prompt - 5类洞察系统 (英文输入 → 中文输出)
# [UPDATED 2026-01-15] 添加置信度字段
# [UPDATED 2026-01-16] 支持3类维度匹配：产品维度、场景维度、情绪维度
INSIGHT_EXTRACTION_PROMPT_DYNAMIC = """# Role
Amazon Review Analyst (Cross-language Expert) with STRICT evidence standards

# Task
Analyze the following **English review** and extract key insights. 
**CRITICAL: Use the correct dimension category based on insight type!**

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `analysis` and `quote_translated` fields must be in **Simplified Chinese (简体中文)**.
- **Quote**: Keep the `quote` field in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

# ⚠️ THREE-CATEGORY DIMENSION SYSTEM (MUST FOLLOW)
Different insight types MUST use different dimension categories:

## For strength/weakness/suggestion → Use PRODUCT Dimensions:
{product_schema_str}

## For scenario → Use SCENARIO Dimensions:
{scenario_schema_str}

## For emotion → Use EMOTION Dimensions:
{emotion_schema_str}

# ⚠️ CONFIDENCE LEVELS (Must include in output)
- **high**: Insight is explicitly stated in the review with clear evidence
- **medium**: Insight can be reasonably inferred from context
- **low**: Use for fallback when review is too vague

# 5 Insight Types (CRITICAL - Use Correct Dimension Category!)

1. **strength (Product Advantage)** → dimension from PRODUCT Dimensions
   - Features or experiences explicitly praised by the user.
   - Example: type="strength", dimension="功能表现"

2. **weakness (Pain Point)** → dimension from PRODUCT Dimensions
   - Defects, bugs, or complaints mentioned by the user.
   - Example: type="weakness", dimension="结构做工"

3. **suggestion (Feature Request)** → dimension from PRODUCT Dimensions
   - Improvement suggestions or desired features.
   - Example: type="suggestion", dimension="功能表现"

4. **scenario (Usage Scenario)** → dimension from SCENARIO Dimensions ⚠️
   - **Specific** usage processes or behavioral stories.
   - ⚠️ MUST use SCENARIO dimensions like "家居日常", "办公场景"
   - ❌ WRONG: dimension="功能表现" (this is a product dimension!)
   - ✅ RIGHT: dimension="家居日常" (this is a scenario dimension!)
   - Example: "晚上喂奶时一键开启很方便" → type="scenario", dimension="亲子互动"

5. **emotion (Emotional Insight)** → dimension from EMOTION Dimensions ⚠️
   - Strong emotions expressed (anger/surprise/disappointment/gratitude).
   - ⚠️ MUST use EMOTION dimensions like "惊喜好评", "失望不满"
   - ❌ WRONG: dimension="整体满意度" (too vague!)
   - ✅ RIGHT: dimension="惊喜好评" (specific emotion category!)
   - Example: "后悔没早点买" → type="emotion", dimension="惊喜好评"

# Output Format (JSON Array)
[
  {{
    "type": "weakness", 
    "dimension": "结构做工",  // ← From PRODUCT dimensions
    "quote": "Original English quote",
    "quote_translated": "引用的中文翻译",
    "analysis": "简要分析（中文）",
    "sentiment": "negative",
    "confidence": "high"
  }},
  {{
    "type": "scenario",
    "dimension": "家居日常",  // ← From SCENARIO dimensions ⚠️
    "quote": "I use it every morning in the kitchen",
    "quote_translated": "我每天早上在厨房使用",
    "analysis": "家居早晨使用场景",
    "sentiment": "positive",
    "confidence": "high"
  }},
  {{
    "type": "emotion",
    "dimension": "惊喜好评",  // ← From EMOTION dimensions ⚠️
    "quote": "Best purchase ever!",
    "quote_translated": "买过的最好的东西！",
    "analysis": "用户表达强烈的正面惊喜情绪",
    "sentiment": "positive",
    "confidence": "high"
  }}
]

# Critical Rules
1. **每条评论必须至少提取1个洞察**, even for very short reviews.
2. **dimension MUST match insight type category** - this is the most important rule!
3. For short positive reviews → emotion type with EMOTION dimension
4. For short negative reviews → weakness type with PRODUCT dimension OR emotion type with EMOTION dimension
5. Be specific: not "质量不好" but "塑料感强" or "按键松动".
6. NEVER return empty array []. At least 1 insight required.
7. Scenario must be **dynamic behavior**, not simple place/time nouns.
8. **All Chinese output must be natural, fluent Simplified Chinese.**
9. **Always include confidence field** (high/medium/low) for each insight.
"""


# [UPDATED] 跨语言洞察提取 Prompt - 5类洞察系统 (无维度 Schema 版本，英文输入 → 中文输出)
# [UPDATED 2026-01-15] 添加置信度字段
# [UPDATED 2026-01-19] 为不同洞察类型提供独立的默认维度示例，避免维度混用
INSIGHT_EXTRACTION_PROMPT = """# Role
Amazon Review Analyst (Cross-language Expert) with STRICT evidence standards

# Task
Analyze the following **English review** and extract key user insights. **At least 1 insight must be extracted per review.**

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `analysis` and `quote_translated` fields must be in **Simplified Chinese (简体中文)**.
- **Quote**: Keep the `quote` field in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

# ⚠️ CONFIDENCE LEVELS (Must include in output)
- **high**: Insight is explicitly stated with clear evidence
  - ✅ "Battery dies after 2 hours" → weakness (high)
  
- **medium**: Reasonably inferred from context
  - ✅ "Works as expected" → satisfaction (medium)
  
- **low**: Fallback for very vague reviews
  - ⚠️ Only for "Good", "OK", "Nice" with no details

# 5 Insight Types with SPECIFIC Dimension Categories
Break down the review into specific insights. **CRITICAL: Use the correct dimension category for each type!**

## 1. strength / weakness / suggestion (Use PRODUCT Dimensions)
These types describe product features. Use product-related dimensions:
- **产品质量**: 耐用性、做工、材质
- **功能表现**: 核心功能的实际效果
- **设计外观**: 外形、颜色、尺寸
- **性价比**: 价格与价值的匹配
- **安全性**: 使用安全相关问题

## 2. scenario (Use SCENARIO Dimensions)
Describes **specific usage contexts**. ⚠️ Must use SCENARIO dimensions, NOT product dimensions!
- **家居日常**: 在家中日常生活使用
- **户外活动**: 户外、旅行、露营场景
- **工作办公**: 办公室或工作场景
- **亲子互动**: 家长与孩子共同使用
- **礼品赠送**: 作为礼物购买或赠送

## 3. emotion (Use EMOTION Dimensions)
Describes **user's emotional state**. ⚠️ Must use EMOTION dimensions, NOT product dimensions!
- **惊喜好评**: 超出预期的正面情绪，强烈推荐
- **失望不满**: 期望落空，批评抱怨
- **物超所值**: 感觉价格划算，购买决策正确
- **担忧警惕**: 对安全性或质量产生忧虑
- **后悔购买**: 觉得不值，希望退货

# Output Format (JSON Array)
[
  {{
    "type": "strength", 
    "dimension": "产品质量",
    "quote": "Very durable material", 
    "quote_translated": "材料非常耐用",
    "analysis": "用户对产品的耐用性表示认可",
    "sentiment": "positive",
    "confidence": "high"
  }},
  {{
    "type": "scenario",
    "dimension": "亲子互动",
    "quote": "My kids love playing with it",
    "quote_translated": "我的孩子们喜欢玩这个",
    "analysis": "产品被用于亲子游戏场景",
    "sentiment": "positive",
    "confidence": "high"
  }},
  {{
    "type": "emotion",
    "dimension": "惊喜好评",
    "quote": "Best purchase ever!",
    "quote_translated": "有史以来最棒的购买！",
    "analysis": "用户对产品超出预期，表达强烈好评",
    "sentiment": "positive",
    "confidence": "high"
  }}
]

# Critical Rules
1. **每条评论必须至少提取1个洞察**, even for very short reviews.
2. **CRITICAL**: Match dimension to insight type correctly:
   - strength/weakness/suggestion → Product dimensions (产品质量, 功能表现, etc.)
   - scenario → Scenario dimensions (家居日常, 亲子互动, etc.)
   - emotion → Emotion dimensions (惊喜好评, 失望不满, etc.)
3. For short positive reviews (e.g., "Amazing!"), extract as emotion with dimension "惊喜好评".
4. For short negative reviews (e.g., "Terrible"), extract as emotion with dimension "失望不满".
5. NEVER return empty array []. At least 1 insight required.
6. Scenario must be **dynamic behavior in specific context**, not simple place/time nouns.
7. **All Chinese output must be natural, fluent Simplified Chinese.**
8. **Always include confidence field** (high/medium/low) for each insight.
"""


class InsightType(str, Enum):
    """Insight type enumeration"""
    STRENGTH = "strength"
    WEAKNESS = "weakness"
    SUGGESTION = "suggestion"
    SCENARIO = "scenario"
    EMOTION = "emotion"





# [UPDATED 2026-01-14] 跨语言5W Model Extraction Prompt (Who 拆分为 Buyer + User)
# [UPDATED 2026-01-15] 添加置信度字段和严格证据要求
THEME_EXTRACTION_PROMPT = """You are a professional marketing analyst with STRICT evidence standards.
Analyze the following **English review** using the "5W Analysis Framework" and extract key market elements.

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `content`, `content_translated`, and `explanation` fields must be in **Simplified Chinese (简体中文)**.
- **content_original**: Keep in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

# ⚠️ EVIDENCE STANDARDS (MOST CRITICAL)

**The "Courage to Say Nothing" Rule:**
It is FAR BETTER to return an empty array than to make a weak or speculative extraction!

## Confidence Levels (MUST include in output)
- **high**: Reviewer EXPLICITLY states the information
  - ✅ "I bought this for my mom" → buyer with confidence: "high"
  - ✅ "I'm a heavy sleeper" → user with confidence: "high"
  
- **medium**: Information can be REASONABLY INFERRED from clear context
  - ✅ "Works great for my morning routine" → when: "早晨" with confidence: "medium"
  
- **low**: DO NOT OUTPUT! If evidence is weak, do not extract at all.
  - ❌ Product is an alarm clock → assuming user is "深睡人群" (WRONG!)
  - ❌ General praise like "Great product!" → extracting any 5W (WRONG!)

## When NOT to Extract (Return Empty Array Instead)
1. Review only talks about product quality (e.g., "Great product!", "Love it!")
2. No direct evidence in the review text for that category
3. Extraction would be based on product type assumptions, not review content
4. The connection requires more than one logical leap

**Remember: An empty array [] is a VALID and often CORRECT answer!**

# Extract the following 6 core elements (leave empty array if not mentioned):

**CRITICAL: Distinguish Buyer vs User**
- **Buyer**: The person who PAYS (e.g., "I bought this for my son" → Buyer is "妈妈/爸爸")
- **User**: The person who USES (e.g., "my son loves it" → User is "孩子")
- If same person, put in **User** only

1. **buyer (Purchaser/Gift Giver)**: 
   - Definition: Who is paying for the product?
   - Look for: "I bought this for...", "Gift for...", "Ordered for my..."
   - Output examples (Chinese): 妈妈, 送礼者, 丈夫, 企业采购

2. **user (Actual User)**: 
   - Definition: Who is actually using the product?
   - Look for: "My son uses it", "Works great for my elderly mom", "I use it daily"
   - Output examples (Chinese): 3岁幼儿, 老年人, 员工, 游戏玩家

3. **where (Location)**: 
   - Definition: In what physical space is it used?
   - Output examples (Chinese): 卧室, 办公室, 房车, 车库, 户外露营

4. **when (Timing)**: 
   - Definition: At what time or specific situation is it used?
   - Output examples (Chinese): 睡前, 停电时, 圣诞节早晨, 运动后

5. **why (Purchase Motivation)**: 
   - Definition: What triggered the purchase decision? (Purchase Driver)
   - Output examples (Chinese): 旧的坏了, 作为生日礼物, 为了省钱, 搬新家

6. **what (Jobs to be Done)**: 
   - Definition: What specific task is the user trying to accomplish?
   - Note: Focus on tasks, not product features.
   - Output examples (Chinese): 清理猫毛, 缓解背痛, 哄孩子睡觉

# Output Format (JSON)
{{
  "buyer": [
    {{
      "content": "宝妈",
      "content_original": "I bought this for my son",
      "content_translated": "我给儿子买的",
      "confidence": "high",
      "explanation": "评论明确说'给儿子买的'，证明购买者是母亲"
    }}
  ],
  "user": [
    {{
      "content": "3岁男童",
      "content_original": "my 3 year old loves it",
      "content_translated": "我3岁的孩子很喜欢",
      "confidence": "high",
      "explanation": "评论明确提到'3岁的孩子'是使用者"
    }}
  ],
  "what": [],
  "why": [],
  "where": [],
  "when": []
}}

# Example of CORRECT Behavior for Short Reviews
Input: "Amazing alarm clock! Works perfectly!"
Output: {{ "buyer": [], "user": [], "where": [], "when": [], "why": [], "what": [] }}
Reason: Review only praises product quality, no 5W elements mentioned.
"""


# [UPDATED 2026-01-14] 5W 标签发现 Prompt (学习阶段 - Who 拆分为 Buyer + User)
CONTEXT_DISCOVERY_PROMPT = """你是一位资深的市场营销专家和用户研究员。请基于以下**产品官方信息**和**用户评论样本**，构建该产品的"5W 用户与市场模型"。

# 产品官方信息（卖家定义）
- **产品标题**: {product_title}
- **核心卖点 (Bullet Points)**:
{bullet_points}

# 用户评论样本（{count}条买家反馈）
{reviews_text}

# 任务
请综合官方定位与用户反馈，识别并归纳出以下 **6 类核心要素**，每类提取 **Top 5-8 个典型标签**：

**重要：必须区分购买者和使用者**
- **购买者(Buyer)**: 付钱买产品的人（如：妈妈给孩子买、送礼者）
- **使用者(User)**: 实际使用产品的人（如：孩子、收礼者、老人）
- 如果购买者和使用者是同一人，只填入**使用者**类别

1. **Buyer (购买者)**: 谁是购买决策者？谁付钱？
   - 关注表述如："I bought this for..."、"Gift for..."、"Ordered for my..."
   - 示例标签：妈妈、送礼者、丈夫、企业采购、女儿(为父母买)
   - 重点识别购买决策者的身份

2. **User (使用者)**: 谁实际使用产品？
   - 关注表述如："My son loves it"、"Works great for my elderly mom"、"I use it daily"
   - 示例标签：3岁幼儿、老年人、员工、敏感肌人群、游戏玩家
   - 如果买家自用（如"I bought this for myself"），放入此类别

3. **Where (地点)**: 在哪里使用？
   - 优先参考官方定位（如: "for Home Office, Garage"）
   - 结合用户实际使用场景
   - 物理空间，如: 卧室、办公室、厨房、车上、房车(RV)、户外露营

4. **When (时刻)**: 什么时候使用？
   - 时间点，如: 早上、睡前、深夜
   - 触发时机，如: 停电时、旅行时、运动后、节假日

5. **Why (动机)**: 购买的触发点是什么？(Purchase Driver)
   - 替代需求，如: 旧的坏了、升级换代
   - 送礼需求，如: 生日礼物、圣诞礼物、乔迁送礼
   - 外部驱动，如: 被种草、看了评测、朋友推荐

6. **What (任务)**: 用户试图用它完成什么具体任务？(Jobs to be Done)
   - **重点关注官方宣传的核心用途**（如: "remove pet hair", "eliminate odors"）
   - 注意: 是具体任务，不是产品功能
   - 如: 清理地毯上的宠物毛、缓解背痛、哄孩子睡觉、去除异味

# 要求
1. **标签名称使用简练的中文**（2-6个字最佳）。
2. **合并同义词**：如"妈妈"、"老妈"、"母亲"应统一为一个标签。
3. **保持颗粒度一致**：不要太粗（如"家人"）也不要太细（如"62岁的独居母亲"）。
4. **官方信息优先**：如果官方明确提到的人群/场景/用途，即使评论中没提及也应列入。
5. **提供简短描述**：用一句话解释该标签的含义，便于后续归类判断。

# 输出格式 (JSON Only)
{{
  "buyer": [
    {{ "name": "宝妈", "description": "为孩子购买产品的母亲" }},
    {{ "name": "送礼者", "description": "购买产品作为礼物送人的用户" }}
  ],
  "user": [
    {{ "name": "3岁幼儿", "description": "实际使用产品的低龄儿童" }},
    {{ "name": "老年人", "description": "实际使用产品的老年人群" }}
  ],
  "where": [
    {{ "name": "卧室", "description": "卧室/睡眠场景下使用" }},
    {{ "name": "车库", "description": "官方推荐的使用场景之一" }}
  ],
  "when": [
    {{ "name": "睡前", "description": "睡觉前使用" }}
  ],
  "why": [
    {{ "name": "替代旧品", "description": "原有产品损坏需要更换" }},
    {{ "name": "送礼", "description": "作为礼物送给他人" }}
  ],
  "what": [
    {{ "name": "清理宠物毛", "description": "官方核心用途：清理家中的猫毛狗毛" }},
    {{ "name": "去除异味", "description": "官方核心用途：消除宠物或其他异味" }}
  ]
}}

请只输出 JSON，不要有其他解释文字。"""


# [UPDATED 2026-01-14] 跨语言5W 定向提取 Prompt (执行阶段 - Who 拆分为 Buyer + User)
# [UPDATED 2026-01-15] 添加置信度字段和严格证据要求
THEME_EXTRACTION_PROMPT_WITH_SCHEMA = """You are a professional marketing analyst with STRICT evidence standards.
Analyze the following **English review** and identify the 5W elements it contains.

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: `quote_translated` and `explanation` fields must be in **Simplified Chinese (简体中文)**.
- **quote**: Keep in **Original English** (for evidence tracing).
- **tag**: Must match exactly with the provided Schema labels (Chinese).

# Input (English Review)
{original_text}

# Label Schema (MUST use these labels only)
{schema_str}

# ⚠️ EVIDENCE STANDARDS (MOST CRITICAL)

**The "Courage to Say Nothing" Rule:**
It is FAR BETTER to return an empty array than to make a weak or speculative categorization!

## Confidence Levels (MUST include in output)
- **high**: Reviewer EXPLICITLY states the information in the review text
  - ✅ "I bought this for my mom" → buyer: 子女 (high)
  - ✅ "I'm a heavy sleeper" → user: 深睡人群 (high)
  
- **medium**: Information can be REASONABLY INFERRED from clear context
  - ✅ "Works great for my morning routine" → when: 早晨 (medium)
  - ✅ "Perfect for the nursery" → where: 儿童房 (medium)
  
- **low**: DO NOT OUTPUT! If evidence is weak, do not categorize at all.
  - ❌ Product is an alarm clock → assuming user is "深睡人群" (WRONG!)
  - ❌ Product is a toy → assuming buyer is "家长" without evidence (WRONG!)

## When NOT to Categorize (Return Empty Array Instead)
1. Review only talks about product quality (e.g., "Great product!", "Love it!")
2. No direct evidence in the review text for that category
3. Categorization would be based on product type assumptions, not review content
4. You're relying on stereotypes or common associations
5. The connection requires more than one logical leap

**Remember: An empty array [] is a VALID and often CORRECT answer!**

# Task Rules
1. **Evidence-First**: Only categorize when there is CLEAR evidence in the review text
2. **Forced Labels**: The `tag` field must exactly match a label from the schema
3. **Quote Required**: Must include the exact English quote that supports categorization
4. **Confidence Required**: Must include confidence level (high/medium only, never low)
5. **Explanation Required**: Explain WHY this quote supports this categorization

**CRITICAL: Distinguish Buyer vs User**
- **buyer**: The person who PAYS/purchases (e.g., "I bought this for my son" → Buyer is the parent)
- **user**: The person who USES the product (e.g., "my son loves it" → User is the child)
- If same person, put in **user** only
- If unclear who pays vs uses, put in **user** only

# Output Format (JSON Only)
{{
  "buyer": [
    {{
      "tag": "宝妈", 
      "quote": "I bought this for my son",
      "quote_translated": "我给儿子买的",
      "confidence": "high",
      "explanation": "评论明确说'给儿子买的'，证明购买者是母亲"
    }}
  ],
  "user": [
    {{
      "tag": "3岁男童", 
      "quote": "my 3 year old loves it",
      "quote_translated": "我3岁的孩子很喜欢",
      "confidence": "high",
      "explanation": "评论明确提到'3岁的孩子'是使用者"
    }}
  ],
  "where": [],
  "when": [],
  "why": [
    {{
      "tag": "送礼",
      "quote": "as a gift for my mom",
      "quote_translated": "作为礼物送给妈妈",
      "confidence": "high",
      "explanation": "评论明确说'作为礼物'，购买动机是送礼"
    }}
  ],
  "what": []
}}

# Examples of CORRECT Behavior

Example 1 - Short positive review with no 5W info:
Input: "Amazing alarm clock! Works perfectly!"
Output: {{ "buyer": [], "user": [], "where": [], "when": [], "why": [], "what": [] }}
Reason: Review only praises product quality, no 5W elements mentioned.

Example 2 - Review with clear evidence:
Input: "Bought this for my elderly mother who has trouble hearing. The loud alarm helps her wake up in the morning."
Output: {{
  "buyer": [{{"tag": "子女", "quote": "Bought this for my elderly mother", "quote_translated": "给年迈的母亲买的", "confidence": "high", "explanation": "明确说是给母亲购买"}}],
  "user": [{{"tag": "老年人", "quote": "my elderly mother who has trouble hearing", "quote_translated": "年迈的母亲听力不好", "confidence": "high", "explanation": "明确说使用者是年迈的母亲"}}],
  "where": [],
  "when": [{{"tag": "早晨", "quote": "wake up in the morning", "quote_translated": "早上起床", "confidence": "high", "explanation": "明确说早上使用"}}],
  "why": [],
  "what": [{{"tag": "起床", "quote": "helps her wake up", "quote_translated": "帮助她起床", "confidence": "high", "explanation": "明确说用途是帮助起床"}}]
}}

Output JSON only, no other text."""


# [NEW] Helper function for robust JSON parsing
def parse_json_safely(text: str):
    """
    Safely parse JSON from LLM output, handling markdown blocks and extra characters.
    """
    if not text:
        return None
        
    # 1. Try direct parsing
    try:
        return json.loads(text)
    except:
        pass
    
    # 2. Try to extract from ```json ... ``` blocks
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        try:
            return json.loads(match.group(1))
        except:
            pass
            
    # 3. Try to find the first [ or { and last ] or }
    try:
        text = text.strip()
        if '}' in text: # Likely an object
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end != -1:
                return json.loads(text[start:end])
        if ']' in text: # Likely an array
            start = text.find('[')
            end = text.rfind(']') + 1
            if start != -1 and end != -1:
                return json.loads(text[start:end])
    except:
        pass
        
    return None


class TranslationService:
    """
    Service for translating Amazon reviews using Qwen API.
    
    Features:
    - Context-aware e-commerce translation
    - Sentiment analysis
    - Automatic retry with exponential backoff
    - Rate limiting awareness
    """
    
    def __init__(self):
        """Initialize the translation service with Qwen API client."""
        if not settings.QWEN_API_KEY:
            logger.warning("QWEN_API_KEY not configured, translation will fail")
            self.client = None
        else:
            self.client = OpenAI(
                api_key=settings.QWEN_API_KEY,
                base_url=settings.QWEN_API_BASE,
                timeout=120.0,  # 2分钟超时，适合复杂任务
            )
        self.model = settings.QWEN_MODEL
    
    def _check_client(self) -> bool:
        """Check if API client is properly configured."""
        if self.client is None:
            logger.error("Translation service not configured: missing API key")
            return False
        return True
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def translate_text(self, text: str) -> str:
        """
        Translate English text to Chinese with e-commerce context.
        """
        if not self._check_client():
            raise RuntimeError("Translation service not configured")
        
        if not text or not text.strip():
            return ""
        
        # Clean text: remove extra whitespace and normalize
        text = " ".join(text.split())
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ],
                temperature=0.3,  # Lower temperature for more consistent translations
                max_tokens=2000,
                timeout=60.0,
            )
            
            translated = response.choices[0].message.content.strip()
            
            # Validate translation result
            if not translated or len(translated.strip()) == 0:
                logger.warning(f"Translation returned empty for text: {text[:100]}")
                # Retry with a more explicit prompt for short text
                if len(text) < 50:
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": "你是一位专业的翻译专家。请将以下英文文本翻译成中文，即使文本很短也要翻译。"},
                            {"role": "user", "content": f"请翻译：{text}"}
                        ],
                        temperature=0.3,
                        max_tokens=500,
                    )
                    translated = response.choices[0].message.content.strip()
            
            if not translated or len(translated.strip()) == 0:
                # Fallback: return a note if translation truly fails
                logger.error(f"Translation failed to produce result for: {text[:100]}")
                raise ValueError(f"Translation returned empty for text: {text[:50]}")
            
            logger.debug(f"Translated: {text[:50]}... -> {translated[:50]}...")
            return translated
            
        except Exception as e:
            logger.error(f"Translation failed for text: {text[:100]}... Error: {e}")
            raise
    
    # ==========================================================================
    # 🔥 批量翻译方法（10 条一批，提升 10 倍效率）
    # ==========================================================================
    
    # 批量翻译系统提示
    BATCH_TRANSLATION_SYSTEM_PROMPT = """你是一位精通中美文化差异的资深亚马逊跨境电商翻译专家。

## 任务
将多条亚马逊英文评论批量翻译成中文。

## 翻译原则
1. **拒绝翻译腔**: 使用自然流畅的中文表达
2. **情感对齐**: 保持原文的语气和情绪
3. **电商风格**: 使用符合中国电商的文案风格

## 输入/输出格式
- 输入: JSON 字典，键为评论 ID，值为英文原文
- 输出: JSON 字典，键与输入一致，值为中文译文
- **严格要求**: 只返回 JSON，不要添加任何解释、Markdown 标记或其他文字

## 示例
输入: {"r1": "Total lemon. Don't waste your money.", "r2": "Game changer for my morning routine."}
输出: {"r1": "简直是个次品！别浪费钱了。", "r2": "彻底改变了我每天早上的习惯，真香！"}"""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def translate_batch(self, reviews: List[dict]) -> dict:
        """
        批量翻译多条评论（10 条一批）
        
        🔥 核心优化：一次 API 调用翻译 10 条评论
        - QPS 消耗降低 10 倍
        - 总体效率提升 8-10 倍
        
        Args:
            reviews: 评论列表，每项包含 {"id": "xxx", "text": "original text"}
            
        Returns:
            翻译结果字典，格式: {"id1": "translated1", "id2": "translated2", ...}
            
        Example:
            results = translation_service.translate_batch([
                {"id": "r1", "text": "Great product!"},
                {"id": "r2", "text": "Not worth the money."}
            ])
            # 返回: {"r1": "很棒的产品！", "r2": "不值这个价。"}
        """
        if not self._check_client():
            raise RuntimeError("Translation service not configured")
        
        if not reviews or len(reviews) == 0:
            return {}
        
        # 构建输入 JSON
        input_dict = {}
        for review in reviews:
            review_id = str(review.get("id", ""))
            text = review.get("text", "")
            if review_id and text and text.strip():
                # 截断超长文本（防止超出 token 限制）
                text = " ".join(text.split())  # 清理空白
                if len(text) > 2000:
                    text = text[:2000] + "..."
                input_dict[review_id] = text
        
        if not input_dict:
            return {}
        
        input_json = json.dumps(input_dict, ensure_ascii=False)
        
        logger.info(f"[批量翻译] 开始翻译 {len(input_dict)} 条评论")
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.BATCH_TRANSLATION_SYSTEM_PROMPT},
                    {"role": "user", "content": input_json}
                ],
                temperature=0.3,
                max_tokens=8000,  # 批量翻译需要更多 token
                timeout=120.0,   # 批量翻译需要更长超时
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 解析 JSON 结果
            result_dict = self._parse_batch_translation_result(result_text, input_dict)
            
            logger.info(f"[批量翻译] 完成: 输入 {len(input_dict)} 条, 成功 {len(result_dict)} 条")
            
            return result_dict
            
        except Exception as e:
            logger.error(f"[批量翻译] API 调用失败: {e}")
            raise
    
    def _parse_batch_translation_result(self, result_text: str, input_dict: dict) -> dict:
        """
        解析批量翻译结果，带容错处理
        
        处理常见的 LLM 输出问题：
        1. 多余的 Markdown 代码块标记
        2. 前后有解释文字
        3. JSON 格式错误
        """
        result_dict = {}
        
        # 1. 尝试清理 Markdown 代码块
        clean_text = result_text
        if "```json" in clean_text:
            match = re.search(r'```json\s*(.*?)\s*```', clean_text, re.DOTALL)
            if match:
                clean_text = match.group(1)
        elif "```" in clean_text:
            match = re.search(r'```\s*(.*?)\s*```', clean_text, re.DOTALL)
            if match:
                clean_text = match.group(1)
        
        # 2. 尝试提取 JSON 对象
        json_match = re.search(r'\{[^{}]*\}', clean_text, re.DOTALL)
        if json_match:
            clean_text = json_match.group(0)
        
        # 3. 尝试解析 JSON
        try:
            result_dict = json.loads(clean_text)
            if isinstance(result_dict, dict):
                # 验证键与输入一致
                valid_result = {}
                for key in input_dict.keys():
                    if key in result_dict and result_dict[key]:
                        valid_result[key] = str(result_dict[key]).strip()
                return valid_result
        except json.JSONDecodeError as e:
            logger.warning(f"[批量翻译] JSON 解析失败: {e}")
        
        # 4. 解析失败，尝试 json_repair（如果可用）
        try:
            import json_repair
            repaired = json_repair.loads(clean_text)
            if isinstance(repaired, dict):
                valid_result = {}
                for key in input_dict.keys():
                    if key in repaired and repaired[key]:
                        valid_result[key] = str(repaired[key]).strip()
                return valid_result
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"[批量翻译] json_repair 失败: {e}")
        
        # 5. 最终回退：返回空，让调用方降级为单条翻译
        logger.error(f"[批量翻译] 无法解析结果，原始输出: {result_text[:500]}")
        return {}
    
    def translate_batch_with_fallback(self, reviews: List[dict]) -> dict:
        """
        批量翻译，带单条回退机制
        
        如果批量翻译失败或部分失败，自动降级为单条翻译
        
        Args:
            reviews: 评论列表，每项包含 {"id": "xxx", "text": "original text"}
            
        Returns:
            翻译结果字典，格式: {"id1": "translated1", "id2": "translated2", ...}
        """
        result = {}
        
        # 1. 尝试批量翻译
        try:
            batch_result = self.translate_batch(reviews)
            result.update(batch_result)
        except Exception as e:
            logger.warning(f"[批量翻译] 批量模式失败，降级为单条: {e}")
        
        # 2. 检查是否有未翻译的评论，单条回退
        for review in reviews:
            review_id = str(review.get("id", ""))
            text = review.get("text", "")
            
            if review_id and text and review_id not in result:
                try:
                    translated = self.translate_text(text)
                    if translated:
                        result[review_id] = translated
                        logger.debug(f"[批量翻译] 单条回退成功: {review_id}")
                except Exception as e:
                    logger.warning(f"[批量翻译] 单条回退失败 {review_id}: {e}")
        
        return result
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def analyze_sentiment(self, text: str) -> Sentiment:
        """
        Analyze the sentiment of a review.
        """
        if not self._check_client():
            return Sentiment.NEUTRAL
        
        if not text or not text.strip():
            return Sentiment.NEUTRAL
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": SENTIMENT_ANALYSIS_PROMPT.format(review_text=text)}
                ],
                temperature=0.1,
                max_tokens=20,
                timeout=30.0,
            )
            
            result = response.choices[0].message.content.strip().lower()
            
            if "positive" in result:
                return Sentiment.POSITIVE
            elif "negative" in result:
                return Sentiment.NEGATIVE
            else:
                return Sentiment.NEUTRAL
                
        except Exception as e:
            logger.warning(f"Sentiment analysis failed: {e}, defaulting to neutral")
            return Sentiment.NEUTRAL
    
    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def learn_dimensions(
        self, 
        reviews_text: List[str],
        product_title: str = "",
        bullet_points: str = ""
    ) -> List[dict]:
        """
        让 AI 从产品信息和评论样本中学习并总结产品评价维度。
        
        Args:
            reviews_text: 评论文本列表（建议30-50条）
            product_title: 产品标题（可选，用于提供产品上下文）
            bullet_points: 产品五点描述（可选，用于补充产品卖点）
            
        Returns:
            维度列表，每个维度包含 name 和 description
            
        Example:
            [
                {"name": "电池续航", "description": "与充电速度和使用时长相关的问题"},
                {"name": "外观设计", "description": "产品的外观、颜色、材质等视觉相关评价"}
            ]
        """
        if not self._check_client():
            logger.error("Translation service not configured for dimension learning")
            return []
        
        # [UPDATED 2026-01-19] 降低最低样本要求
        if not reviews_text or len(reviews_text) < 1:
            logger.warning("没有可用样本，无法学习维度")
            return []
        
        # 限制样本量防止超 token
        sample_texts = reviews_text[:50]
        combined_text = "\n---\n".join(sample_texts)
        
        # 处理产品信息
        title_text = product_title.strip() if product_title else "（未提供）"
        bullet_text = bullet_points.strip() if bullet_points else "（未提供）"
        
        try:
            prompt = DIMENSION_DISCOVERY_PROMPT.format(
                product_title=title_text,
                bullet_points=bullet_text,
                count=len(sample_texts),
                reviews_text=combined_text
            )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,  # 较低温度保证一致性
                max_tokens=2000,
                timeout=90.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            # 使用健壮的 JSON 解析器
            parsed = parse_json_safely(result)
            
            if not isinstance(parsed, dict) or "dimensions" not in parsed:
                logger.warning(f"维度发现返回格式不正确: {type(parsed)}")
                return []
            
            dimensions = parsed.get("dimensions", [])
            
            # 验证维度格式
            valid_dimensions = []
            for dim in dimensions:
                if isinstance(dim, dict) and dim.get("name"):
                    valid_dimensions.append({
                        "name": dim["name"].strip(),
                        "description": (dim.get("description") or "").strip()
                    })
            
            logger.info(f"AI 成功学习到 {len(valid_dimensions)} 个产品维度")
            return valid_dimensions
            
        except Exception as e:
            logger.error(f"维度学习失败: {e}")
            return []

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def learn_dimensions_from_raw(
        self, 
        raw_reviews: List[str],
        product_title: str = "",
        bullet_points: str = ""
    ) -> dict:
        """
        跨语言零样本学习：从英文原文评论直接学习3类维度（输出中文）。
        
        [UPDATED 2026-01-16] 扩展为3类维度体系：
        - 产品维度 (product): 用于 strength/weakness/suggestion
        - 场景维度 (scenario): 用于 scenario 类型洞察
        - 情绪维度 (emotion): 用于 emotion 类型洞察
        
        这是流式处理架构的核心方法：
        - 不需要等待翻译完成
        - 直接使用英文原文进行学习
        - AI 输出中文维度名称和描述
        
        Args:
            raw_reviews: 英文原文评论列表（来自 get_scientific_samples）
            product_title: 产品英文标题
            bullet_points: 产品英文五点描述
            
        Returns:
            3类维度字典（中文），格式：
            {
                "product": [{"name": "功能表现", "description": "..."}, ...],
                "scenario": [{"name": "家居日常", "description": "..."}, ...],
                "emotion": [{"name": "惊喜好评", "description": "..."}, ...]
            }
            
            向后兼容：如果调用方期望 List[dict]，可以使用 result.get("product", [])
        """
        if not self._check_client():
            logger.error("Translation service not configured for raw dimension learning")
            return {}
        
        # [UPDATED 2026-01-19] 降低最低样本要求，只要有评论就尝试学习
        if not raw_reviews or len(raw_reviews) < 1:
            logger.warning("没有可用样本，无法学习维度")
            return None
        
        # 限制样本量防止超 token
        sample_texts = raw_reviews[:50]
        combined_text = "\n---\n".join([f"Review {i+1}: {text}" for i, text in enumerate(sample_texts)])
        
        # 处理产品信息
        title_text = product_title.strip() if product_title else "(Not provided)"
        bullet_text = bullet_points.strip() if bullet_points else "(Not provided)"
        
        try:
            prompt = DIMENSION_DISCOVERY_RAW_PROMPT.format(
                product_title=title_text,
                bullet_points=bullet_text,
                count=len(sample_texts),
                reviews_text=combined_text
            )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=3000,  # 增加 token 限制以支持3类维度
                timeout=120.0,   # 增加超时时间
            )
            
            result = response.choices[0].message.content.strip()
            parsed = parse_json_safely(result)
            
            if not isinstance(parsed, dict):
                logger.warning(f"跨语言维度发现返回格式不正确: {type(parsed)}")
                # [FIX] 返回 None 而不是空字典，让调用方知道是解析失败
                return None
            
            # [UPDATED] 解析3类维度
            valid_result = {}
            
            # 1. 产品维度
            product_dims = parsed.get("product_dimensions", [])
            valid_product = []
            for dim in product_dims:
                if isinstance(dim, dict) and dim.get("name"):
                    valid_product.append({
                        "name": dim["name"].strip(),
                        "description": (dim.get("description") or "").strip()
                    })
            if valid_product:
                valid_result["product"] = valid_product
            
            # 2. 场景维度
            scenario_dims = parsed.get("scenario_dimensions", [])
            valid_scenario = []
            for dim in scenario_dims:
                if isinstance(dim, dict) and dim.get("name"):
                    valid_scenario.append({
                        "name": dim["name"].strip(),
                        "description": (dim.get("description") or "").strip()
                    })
            if valid_scenario:
                valid_result["scenario"] = valid_scenario
            
            # 3. 情绪维度
            emotion_dims = parsed.get("emotion_dimensions", [])
            valid_emotion = []
            for dim in emotion_dims:
                if isinstance(dim, dict) and dim.get("name"):
                    valid_emotion.append({
                        "name": dim["name"].strip(),
                        "description": (dim.get("description") or "").strip()
                    })
            if valid_emotion:
                valid_result["emotion"] = valid_emotion
            
            # 向后兼容：如果AI返回旧格式（单一 dimensions 列表），转换为新格式
            if not valid_result and "dimensions" in parsed:
                old_dims = parsed.get("dimensions", [])
                valid_product = []
                for dim in old_dims:
                    if isinstance(dim, dict) and dim.get("name"):
                        valid_product.append({
                            "name": dim["name"].strip(),
                            "description": (dim.get("description") or "").strip()
                        })
                if valid_product:
                    valid_result["product"] = valid_product
                    # 添加默认的场景和情绪维度
                    valid_result["scenario"] = [
                        {"name": "家居日常", "description": "在家中日常生活场景"},
                        {"name": "工作办公", "description": "办公室或工作场景"},
                        {"name": "户外出行", "description": "户外活动或出行场景"}
                    ]
                    valid_result["emotion"] = [
                        {"name": "惊喜好评", "description": "超出预期的正面情绪"},
                        {"name": "失望不满", "description": "期望落空的负面情绪"},
                        {"name": "感激推荐", "description": "感谢并愿意推荐的情绪"}
                    ]
                    logger.warning("[跨语言学习] AI返回旧格式，已自动补充场景和情绪维度")
            
            total_dims = sum(len(v) for v in valid_result.values())
            
            # [FIX 2026-01-19] 结果校验 - 确保每类维度至少有 2 个
            product_count = len(valid_result.get('product', []))
            scenario_count = len(valid_result.get('scenario', []))
            emotion_count = len(valid_result.get('emotion', []))
            
            if product_count < 2 or scenario_count < 2 or emotion_count < 2:
                logger.warning(f"[跨语言学习] 维度数量不足: 产品={product_count}, 场景={scenario_count}, 情绪={emotion_count}，需要每类至少2个")
                return None  # 返回 None 表示学习失败，触发重试
            
            logger.info(f"[跨语言学习] 从 {len(sample_texts)} 条英文评论学习到 {total_dims} 个中文维度 "
                       f"(产品:{product_count}, 场景:{scenario_count}, 情绪:{emotion_count})")
            return valid_result
            
        except Exception as e:
            logger.error(f"跨语言维度学习失败: {e}")
            # [FIX] 返回 None 而不是空字典，触发重试
            return None

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def learn_context_labels_from_raw(
        self, 
        raw_reviews: List[str],
        product_title: str = "",
        bullet_points: List[str] = None
    ) -> dict:
        """
        跨语言零样本学习：从英文原文评论直接学习 5W 标签库（输出中文）。
        
        这是流式处理架构的核心方法：
        - 不需要等待翻译完成
        - 直接使用英文原文进行学习
        - AI 输出中文标签名称和描述
        
        Args:
            raw_reviews: 英文原文评论列表（来自 get_scientific_samples）
            product_title: 产品英文标题
            bullet_points: 产品英文五点描述列表
            
        Returns:
            5W 标签字典（中文），格式：
            {
                "who": [{"name": "老年人", "description": "..."}, ...],
                "where": [...],
                "when": [...],
                "why": [...],
                "what": [...]
            }
        """
        if not self._check_client():
            logger.error("Translation service not configured for raw context learning")
            return {}
        
        # [UPDATED 2026-01-19] 降低最低样本要求，只要有评论就尝试学习
        if not raw_reviews or len(raw_reviews) < 1:
            logger.warning("没有可用样本，无法学习 5W 标签")
            return {}
        
        # 限制样本量防止超 token
        sample_texts = raw_reviews[:50]
        combined_reviews = "\n---\n".join([f"Review {i+1}: {text}" for i, text in enumerate(sample_texts)])
        
        # 格式化产品官方信息
        formatted_title = product_title.strip() if product_title else "(Not provided)"
        formatted_bullets = "(Not provided)"
        if bullet_points and len(bullet_points) > 0:
            formatted_bullets = "\n".join([f"  - {bp}" for bp in bullet_points if bp and bp.strip()])
        
        logger.info(f"[跨语言学习] 5W标签学习：{len(sample_texts)} 条英文评论 + 产品信息")
        
        try:
            prompt = CONTEXT_DISCOVERY_RAW_PROMPT.format(
                product_title=formatted_title,
                bullet_points=formatted_bullets,
                count=len(sample_texts),
                reviews_text=combined_reviews
            )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=3000,
                timeout=120.0,
            )
            
            result = response.choices[0].message.content.strip()
            parsed = parse_json_safely(result)
            
            if not isinstance(parsed, dict):
                logger.warning(f"跨语言 5W 标签发现返回格式不正确: {type(parsed)}")
                return {}
            
            # [UPDATED 2026-01-14] 扩展 valid_types: buyer/user 替代 who，同时兼容旧的 who
            valid_types = {"buyer", "user", "who", "where", "when", "why", "what"}
            valid_result = {}
            
            for context_type in valid_types:
                labels = parsed.get(context_type, [])
                valid_labels = []
                
                for label in labels:
                    if isinstance(label, dict) and label.get("name"):
                        valid_labels.append({
                            "name": label["name"].strip(),
                            "description": (label.get("description") or "").strip()
                        })
                
                if valid_labels:
                    valid_result[context_type] = valid_labels
            
            total_labels = sum(len(v) for v in valid_result.values())
            logger.info(f"[跨语言学习] 从英文评论学习到 {total_labels} 个中文 5W 标签（{len(valid_result)} 个类型）")
            return valid_result
            
        except Exception as e:
            logger.error(f"跨语言 5W 标签学习失败: {e}")
            return {}

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def learn_context_labels(
        self, 
        reviews_text: List[str],
        product_title: str = "",
        bullet_points: List[str] = None
    ) -> dict:
        """
        让 AI 结合产品官方信息和评论样本学习 5W 标准标签库（Definition 阶段）。
        
        这是 AI-Native 架构的核心："先学习标准，后强制归类"。
        AI 会分析产品标题、五点卖点和评论样本，为每个 5W 类型生成标准标签。
        
        **[UPDATED] 加入产品官方信息：**
        - 标题和五点是商家的"卖家秀"，往往比用户评论更精准
        - 特别对 Who（人群）、Where（场景）、What（任务）提升显著
        
        Args:
            reviews_text: 评论文本列表（建议30-50条，混合好评差评）
            product_title: 产品标题（英文原文）
            bullet_points: 产品五点卖点列表（英文原文）
            
        Returns:
            5W 标签字典，格式：
            {
                "who": [{"name": "老年人", "description": "..."}, ...],
                "where": [...],
                "when": [...],
                "why": [...],
                "what": [...]
            }
            
        Example:
            >>> labels = service.learn_context_labels(
            ...     reviews[:50],
            ...     product_title="LED Light for Seniors",
            ...     bullet_points=["Perfect for elderly", "Home Office use"]
            ... )
        """
        if not self._check_client():
            logger.error("Translation service not configured for context learning")
            return {}
        
        # [UPDATED 2026-01-19] 降低最低样本要求
        if not reviews_text or len(reviews_text) < 1:
            logger.warning("没有可用样本，无法学习 5W 标签")
            return {}
        
        # 限制样本量防止超 token（50条评论约 4000-6000 tokens）
        sample_texts = reviews_text[:50]
        combined_reviews = "\n---\n".join([f"评论{i+1}: {text}" for i, text in enumerate(sample_texts)])
        
        # [NEW] 格式化产品官方信息
        formatted_title = product_title.strip() if product_title else "（无）"
        formatted_bullets = "（无）"
        if bullet_points and len(bullet_points) > 0:
            formatted_bullets = "\n".join([f"  - {bp}" for bp in bullet_points if bp and bp.strip()])
        
        logger.info(f"5W 标签学习：{len(sample_texts)} 条评论 + 产品信息（标题: {len(formatted_title)}字, 五点: {len(bullet_points or [])}条）")
        
        try:
            prompt = CONTEXT_DISCOVERY_PROMPT.format(
                product_title=formatted_title,
                bullet_points=formatted_bullets,
                count=len(sample_texts),
                reviews_text=combined_reviews
            )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,  # 较低温度保证一致性
                max_tokens=3000,
                timeout=120.0,  # 稍长的超时时间
            )
            
            result = response.choices[0].message.content.strip()
            
            # 使用健壮的 JSON 解析器
            parsed = parse_json_safely(result)
            
            if not isinstance(parsed, dict):
                logger.warning(f"5W 标签发现返回格式不正确: {type(parsed)}")
                return {}
            
            # [UPDATED 2026-01-14] 验证和清理每个 5W 类型的标签（扩展版：buyer/user 替代 who）
            valid_types = {"buyer", "user", "who", "where", "when", "why", "what"}
            valid_result = {}
            
            for context_type in valid_types:
                labels = parsed.get(context_type, [])
                valid_labels = []
                
                for label in labels:
                    if isinstance(label, dict) and label.get("name"):
                        valid_labels.append({
                            "name": label["name"].strip(),
                            "description": (label.get("description") or "").strip()
                        })
                
                if valid_labels:
                    valid_result[context_type] = valid_labels
                    logger.debug(f"  {context_type}: {len(valid_labels)} 个标签")
            
            total_labels = sum(len(v) for v in valid_result.values())
            logger.info(f"AI 成功学习到 {total_labels} 个 5W 标签（{len(valid_result)} 个类型）")
            return valid_result
            
        except Exception as e:
            logger.error(f"5W 标签学习失败: {e}")
            return {}

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def extract_insights(
        self,
        original_text: str,
        translated_text: str = None,  # [UPDATED] 不再使用，保留参数仅为向后兼容
        dimension_schema = None  # [UPDATED 2026-01-16] 支持 List[dict] 或 dict (3类维度)
    ) -> List[dict]:
        """
        Extract insights from a review using cross-language analysis.
        
        [UPDATED] 跨语言洞察提取 - 直接从英文原文提取洞察，输出中文结果。
        不再依赖翻译后的文本，实现与翻译任务的完全解耦。
        
        [UPDATED 2026-01-16] 支持3类维度体系：
        - 产品维度 (product): 用于 strength/weakness/suggestion
        - 场景维度 (scenario): 用于 scenario 类型洞察
        - 情绪维度 (emotion): 用于 emotion 类型洞察
        
        Args:
            original_text: 原始评论文本（英文）
            translated_text: [DEPRECATED] 不再使用，保留仅为向后兼容
            dimension_schema: 维度模式，支持两种格式：
                - 旧格式 List[dict]: [{"name": "维度名", "description": "..."}, ...]
                - 新格式 dict: {
                    "product": [{"name": "功能表现", "description": "..."}],
                    "scenario": [{"name": "家居日常", "description": "..."}],
                    "emotion": [{"name": "惊喜好评", "description": "..."}]
                  }
        
        Returns:
            洞察列表，每个洞察包含 type, dimension, quote(英文), quote_translated(中文), analysis(中文) 等字段
        """
        if not self._check_client():
            return []
        
        # [优化] 移除长度限制 - 确保每条评论都能提取洞察
        # 即使是短评论也可能包含重要信息
        if not original_text or not original_text.strip():
            return []
        
        try:
            # [UPDATED 2026-01-16] 检测维度格式并构建对应的 prompt
            if dimension_schema:
                # 检测是新格式（dict with product/scenario/emotion）还是旧格式（list）
                is_new_format = (
                    isinstance(dimension_schema, dict) and 
                    any(k in dimension_schema for k in ["product", "scenario", "emotion"])
                )
                
                if is_new_format:
                    # 新格式：3类维度体系
                    product_dims = dimension_schema.get("product", [])
                    scenario_dims = dimension_schema.get("scenario", [])
                    emotion_dims = dimension_schema.get("emotion", [])
                    
                    # 构建3类维度的 schema 字符串
                    product_schema_str = "\n".join([
                        f"- {d['name']}: {d.get('description', '无具体定义')}" 
                        for d in product_dims
                    ]) if product_dims else "- 整体满意度: 通用产品维度"
                    
                    scenario_schema_str = "\n".join([
                        f"- {d['name']}: {d.get('description', '无具体定义')}" 
                        for d in scenario_dims
                    ]) if scenario_dims else "- 日常使用: 通用场景维度"
                    
                    emotion_schema_str = "\n".join([
                        f"- {d['name']}: {d.get('description', '无具体定义')}" 
                        for d in emotion_dims
                    ]) if emotion_dims else "- 正面情绪: 积极情感\n- 负面情绪: 消极情感"
                    
                    prompt = INSIGHT_EXTRACTION_PROMPT_DYNAMIC.format(
                        original_text=original_text,
                        product_schema_str=product_schema_str,
                        scenario_schema_str=scenario_schema_str,
                        emotion_schema_str=emotion_schema_str
                    )
                    logger.debug(f"[跨语言洞察] 使用3类维度 Prompt "
                               f"(产品:{len(product_dims)}, 场景:{len(scenario_dims)}, 情绪:{len(emotion_dims)})")
                else:
                    # 旧格式：单一维度列表，向后兼容
                    # 将旧格式转换为新格式（全部作为产品维度，使用默认场景和情绪维度）
                    if isinstance(dimension_schema, list) and len(dimension_schema) > 0:
                        product_schema_str = "\n".join([
                    f"- {d['name']}: {d.get('description', '无具体定义')}" 
                    for d in dimension_schema
                ])
                        scenario_schema_str = "- 日常使用: 通用场景维度\n- 工作办公: 办公场景\n- 户外出行: 户外场景"
                        emotion_schema_str = "- 惊喜好评: 超出预期的正面情绪\n- 失望不满: 期望落空的负面情绪\n- 感激推荐: 感谢并推荐"
                        
                prompt = INSIGHT_EXTRACTION_PROMPT_DYNAMIC.format(
                    original_text=original_text,
                            product_schema_str=product_schema_str,
                            scenario_schema_str=scenario_schema_str,
                            emotion_schema_str=emotion_schema_str
                )
                        logger.debug(f"[跨语言洞察] 旧格式维度已转换，共 {len(dimension_schema)} 个产品维度")
            else:
                        # 维度列表为空，使用无维度 Prompt
                prompt = INSIGHT_EXTRACTION_PROMPT.format(
                            original_text=original_text
                        )
            else:
                # 使用无维度 Prompt - 自动检测维度
                prompt = INSIGHT_EXTRACTION_PROMPT.format(
                    original_text=original_text
                )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2, # Lower temperature for structural extraction
                max_tokens=1500,
                timeout=60.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            # [UPDATED] Use robust JSON parser
            insights = parse_json_safely(result)
            
            if not isinstance(insights, list):
                logger.warning(f"Parsed insights is not a list: {type(insights)}")
                return []
            
            # Validate insights
            valid_insights = []
            valid_types = {"strength", "weakness", "suggestion", "scenario", "emotion"}
            
            for insight in insights:
                if not isinstance(insight, dict):
                    continue
                if insight.get("type") not in valid_types:
                    continue
                if not insight.get("quote") or not insight.get("analysis"):
                    continue
                
                # [UPDATED 2026-01-15] 添加 confidence 字段支持
                confidence = insight.get("confidence", "high")
                if confidence not in ("high", "medium", "low"):
                    confidence = "high"
                
                valid_insights.append({
                    "type": insight["type"],
                    "quote": insight["quote"],
                    "quote_translated": insight.get("quote_translated"),
                    "analysis": insight["analysis"],
                    "dimension": insight.get("dimension"),
                    "confidence": confidence  # [NEW] 置信度
                })
            
            logger.debug(f"Extracted {len(valid_insights)} insights from review")
            return valid_insights
            
        except Exception as e:
            logger.warning(f"Insight extraction failed: {e}")
            return []
    
    def translate_review(
        self,
        title: Optional[str],
        body: str,
        extract_insights: bool = True
    ) -> Tuple[Optional[str], str, Sentiment, List[dict]]:
        """
        Translate a complete review (title and body), analyze sentiment, and extract insights.
        """
        # Translate title if present
        translated_title = None
        if title and title.strip():
            try:
                translated_title = self.translate_text(title)
            except Exception as e:
                logger.error(f"Failed to translate title: {e}")
                translated_title = None
        
        # Translate body (required)
        try:
            translated_body = self.translate_text(body)
        except Exception as e:
            logger.error(f"Failed to translate body: {e}")
            translated_body = ""
        
        # Analyze sentiment from original text (more accurate)
        sentiment = self.analyze_sentiment(body)
        
        # Extract insights
        insights = []
        if extract_insights and translated_body:
            try:
                insights = self.extract_insights(body, translated_body)
            except Exception as e:
                logger.warning(f"Failed to extract insights: {e}")
                insights = []
        
        return translated_title, translated_body, sentiment, insights
    
    def process_review_parallel(
        self, 
        title: Optional[str], 
        body: str,
        dimension_schema: List[dict] = None,  # [NEW] 接收专属维度（用于洞察提取）
        context_schema: dict = None           # [NEW] 接收专属5W标签（用于主题提取）
    ) -> Optional[dict]:
        """
        [High Performance] Execute distinct prompts in parallel to maintain quality while boosting speed.
        
        This method orchestrates parallel execution of translation and analysis tasks:
        - Phase 1: Translate Title, Translate Body, Analyze Sentiment (Parallel - no dependencies)
        - Phase 2: Extract Insights, Extract Themes (Parallel - dependent on Phase 1 translation results)
        
        [UPDATED] Now supports dynamic schemas for personalized analysis:
        - dimension_schema: Product-specific dimensions for insight categorization
        - context_schema: Product-specific 5W labels for theme categorization
        
        Expected speedup: ~50% (from ~6s to ~3.5s per review) while maintaining 100% quality.
        
        Args:
            title: Review title (optional)
            body: Review body (required)
            dimension_schema: Optional list of dimension dicts for insight extraction
                             [{"name": "维度名", "description": "维度定义"}, ...]
            context_schema: Optional 5W label dict for theme extraction
                           {"who": [{"name": "...", "description": "..."}], ...}
            
        Returns:
            Dict with all analysis results, or None if processing fails
            
        Example:
            {
                "title_original": "Great product",
                "body_original": "Love it!",
                "title_translated": "很棒的产品",
                "body_translated": "太喜欢了！",
                "sentiment": "positive",
                "insights": [...],
                "themes": {...}
            }
        """
        if not self._check_client() or not body:
            return None

        result = {
            "title_original": title or None,
            "body_original": body,
            "title_translated": None,
            "body_translated": None,
            "sentiment": Sentiment.NEUTRAL.value,
            "insights": [],
            "themes": {}
        }

        # Create thread pool (max_workers=5 balances concurrency with API rate limits)
        with ThreadPoolExecutor(max_workers=5) as executor:
            # --- Phase 1: 基础任务 (无依赖，可以并行) ---
            future_title = executor.submit(self.translate_text, title) if title and title.strip() else None
            future_body = executor.submit(self.translate_text, body)
            future_sentiment = executor.submit(self.analyze_sentiment, body)

            # Wait for Phase 1 results (blocks until all complete)
            try:
                if future_title:
                    result["title_translated"] = future_title.result()
                
                # Critical: must get body translation before Phase 2 analysis
                result["body_translated"] = future_body.result()
                
                result["sentiment"] = future_sentiment.result().value
                
                logger.debug(f"Phase 1 completed: translation and sentiment analysis done")
            except Exception as e:
                logger.error(f"Phase 1 (translation) failed: {e}")
                # If body translation fails, cannot proceed to Phase 2
                if not result["body_translated"]:
                    logger.warning("Body translation failed, skipping Phase 2 analysis")
                    return result

            # --- Phase 2: 高级分析任务 (依赖翻译结果，并行执行) ---
            # Now we have both original_text and translated_text
            # We can launch insight extraction and theme extraction in parallel
            
            # [FIXED] 将专属维度 (dimension_schema) 透传给提取方法
            future_insights = executor.submit(
                self.extract_insights, 
                result["body_original"], 
                result["body_translated"],
                dimension_schema  # <--- 注入维度表
            )
            
            # [FIXED] 将专属标签 (context_schema) 透传给提取方法
            future_themes = executor.submit(
                self.extract_themes, 
                result["body_original"], 
                result["body_translated"],
                context_schema  # <--- 注入5W标签库
            )

            # Wait for Phase 2 results (both can fail independently)
            try:
                result["insights"] = future_insights.result() or []
                logger.debug(f"Extracted {len(result['insights'])} insights")
            except Exception as e:
                logger.warning(f"Insight extraction failed: {e}")
                result["insights"] = []

            try:
                result["themes"] = future_themes.result() or {}
                logger.debug(f"Extracted {len(result['themes'])} theme categories")
            except Exception as e:
                logger.warning(f"Theme extraction failed: {e}")
                result["themes"] = {}

        logger.info(
            f"Parallel processing completed: "
            f"translation={bool(result['body_translated'])}, "
            f"sentiment={result['sentiment']}, "
            f"insights={len(result['insights'])}, "
            f"themes={len(result['themes'])}"
        )
        return result
    
    def batch_translate(
        self,
        reviews: list[dict]
    ) -> list[dict]:
        """
        Translate a batch of reviews.
        """
        results = []
        
        for review in reviews:
            title = review.get("title") or review.get("title_original")
            body = review.get("body") or review.get("body_original", "")
            
            try:
                translated_title, translated_body, sentiment, insights = self.translate_review(
                    title=title,
                    body=body,
                    extract_insights=True 
                )
                results.append({
                    "title_translated": translated_title,
                    "body_translated": translated_body,
                    "sentiment": sentiment.value,
                    "insights": insights,
                    "success": True
                })
            except Exception as e:
                logger.error(f"Batch translation failed for review: {e}")
                results.append({
                    "title_translated": None,
                    "body_translated": None,
                    "sentiment": Sentiment.NEUTRAL.value,
                    "insights": [],
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def translate_bullet_points(self, bullet_points: List[str]) -> List[str]:
        """
        Translate product bullet points from English to Chinese.
        """
        if not self._check_client():
            raise RuntimeError("Translation service not configured")
        
        if not bullet_points or len(bullet_points) == 0:
            return []
        
        # Combine bullet points for batch translation
        combined_text = "\n".join(bullet_points)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": BULLET_POINTS_SYSTEM_PROMPT},
                    {"role": "user", "content": combined_text}
                ],
                temperature=0.3,
                max_tokens=3000,
                timeout=60.0,
            )
            
            translated_text = response.choices[0].message.content.strip()
            
            # Split back into individual bullet points
            translated_points = [p.strip() for p in translated_text.split("\n") if p.strip()]
            
            # Ensure we have the same number of translations
            if len(translated_points) != len(bullet_points):
                logger.warning(
                    f"Bullet point count mismatch: original {len(bullet_points)}, "
                    f"translated {len(translated_points)}"
                )
                # Pad with empty strings or truncate
                while len(translated_points) < len(bullet_points):
                    translated_points.append("")
                translated_points = translated_points[:len(bullet_points)]
            
            logger.info(f"Translated {len(bullet_points)} bullet points")
            return translated_points
            
        except Exception as e:
            logger.error(f"Bullet points translation failed: {e}")
            raise
    
    def translate_product_title(self, title: str) -> str:
        """
        Translate product title from English to Chinese.
        """
        if not title or not title.strip():
            return ""
        
        try:
            return self.translate_text(title)
        except Exception as e:
            logger.error(f"Product title translation failed: {e}")
            raise

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def extract_themes(
        self, 
        original_text: str, 
        translated_text: str = None,  # [UPDATED] 不再使用，保留参数仅为向后兼容
        context_schema: dict = None
    ) -> dict:
        """
        Extract 5W theme content from a review using cross-language analysis.
        
        [UPDATED] 跨语言5W主题提取 - 直接从英文原文提取5W要素，输出中文结果。
        不再依赖翻译后的文本，实现与翻译任务的完全解耦。
        
        支持两种模式：
        1. 开放提取模式（无 context_schema）：AI 自由提取 5W 要素
        2. 强制归类模式（有 context_schema）：AI 只能输出标签库中已有的标签
        
        Args:
            original_text: 评论原文（英文）
            translated_text: [DEPRECATED] 不再使用，保留仅为向后兼容
            context_schema: 可选的 5W 标签库，格式：
                {
                    "who": [{"name": "老年人", "description": "..."}, ...],
                    "where": [...],
                    ...
                }
                
        Returns:
            提取的主题内容，格式：
            - 开放模式：{"who": [{"content": "中文内容", "content_original": "English quote", ...}], ...}
            - 归类模式：{"who": [{"content": "老年人", "quote": "English quote", ...}], ...}
        """
        if not self._check_client():
            return {}
        
        # [UPDATED] 使用原文检查长度，跳过过短的评论
        if not original_text or len(original_text.strip()) < 10:
            return {}
        
        # [UPDATED] Valid theme types for 5W model (2026-01-14: 添加 buyer/user 拆分)
        valid_themes = {"buyer", "user", "who", "where", "when", "why", "what"}
        
        try:
            # 根据是否有标签库选择不同的 Prompt
            # [UPDATED] 跨语言模式：只传入英文原文，AI 输出中文分析
            if context_schema and any(context_schema.get(t) for t in valid_themes):
                # 强制归类模式 - 使用标签库
                schema_lines = []
                for theme_type in valid_themes:
                    labels = context_schema.get(theme_type, [])
                    if labels:
                        label_names = [l["name"] for l in labels if isinstance(l, dict) and l.get("name")]
                        if label_names:
                            schema_lines.append(f"- **{theme_type}**: {', '.join(label_names)}")
                
                schema_str = "\n".join(schema_lines) if schema_lines else "（无标签库）"
                
                prompt = THEME_EXTRACTION_PROMPT_WITH_SCHEMA.format(
                    original_text=original_text or "",
                    schema_str=schema_str
                )
                logger.debug(f"[跨语言5W] 使用强制归类模式，标签库包含 {len(schema_lines)} 个类型")
            else:
                # 开放提取模式 - 自由提取
                prompt = THEME_EXTRACTION_PROMPT.format(
                    original_text=original_text or ""
                )
                logger.debug("[跨语言5W] 使用开放提取模式")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=2000,
                timeout=60.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            # [UPDATED] Use robust JSON parser
            themes = parse_json_safely(result)
            
            if not isinstance(themes, dict):
                logger.warning(f"Parsed themes is not a dict: {type(themes)}")
                return {}
            
            # 根据模式处理返回结果
            valid_result = {}
            
            if context_schema and any(context_schema.get(t) for t in valid_themes):
                # [UPDATED] 强制归类模式 - 支持带证据的可解释归类
                # 新格式: {"tag": "老年人", "quote": "...", "explanation": "..."}
                for theme_type in valid_themes:
                    items = themes.get(theme_type, [])
                    if not isinstance(items, list):
                        continue
                    
                    # 获取该类型允许的标签
                    allowed_labels = {
                        l["name"] for l in context_schema.get(theme_type, []) 
                        if isinstance(l, dict) and l.get("name")
                    }
                    
                    valid_items = []
                    for item in items:
                        if isinstance(item, dict):
                            # 新格式: 带 tag/quote/quote_translated/confidence/explanation 的对象
                            tag = item.get("tag") or item.get("content")
                            if tag and tag.strip() in allowed_labels:
                                # [UPDATED 2026-01-15] 添加 confidence 字段支持
                                confidence = item.get("confidence", "high")
                                # 验证 confidence 值
                                if confidence not in ("high", "medium", "low"):
                                    confidence = "high"
                                valid_items.append({
                                    "content": tag.strip(),  # 标准标签名
                                    "content_original": item.get("quote") or item.get("content_original"),  # 原文证据
                                    "quote_translated": item.get("quote_translated"),  # [NEW] 中文翻译证据
                                    "content_translated": item.get("content_translated"),  # 翻译（可选，向后兼容）
                                    "explanation": item.get("explanation"),  # 归类理由
                                    "confidence": confidence  # [NEW] 置信度
                                })
                        elif isinstance(item, str):
                            # 兼容旧格式: 纯字符串
                            if item.strip() in allowed_labels:
                                valid_items.append({
                                    "content": item.strip(),
                                    "content_original": None,
                                    "content_translated": None,
                                    "explanation": f"命中标签库: {item.strip()}",
                                    "confidence": "high"  # 旧格式默认高置信度
                                })
                    
                    if valid_items:
                        valid_result[theme_type] = valid_items
                        logger.debug(f"  {theme_type}: {len(valid_items)} 个标签 (带证据)")
            else:
                # 开放提取模式 - 返回的是完整内容项
                for theme_type, items in themes.items():
                    if theme_type not in valid_themes:
                        continue
                    if not isinstance(items, list):
                        continue
                    
                    # Validate each item
                    valid_items = []
                    for item in items:
                        if isinstance(item, dict) and "content" in item:
                            # Ensure content is a non-empty string
                            content = item.get("content", "").strip()
                            if content:
                                # [UPDATED 2026-01-15] 添加 confidence 字段支持
                                confidence = item.get("confidence", "high")
                                if confidence not in ("high", "medium", "low"):
                                    confidence = "high"
                                # Build valid item
                                valid_item = {
                                    "content": content,
                                    "content_original": item.get("content_original") or None,
                                    "content_translated": item.get("content_translated") or None,
                                    "explanation": item.get("explanation") or None,
                                    "confidence": confidence  # [NEW] 置信度
                                }
                                valid_items.append(valid_item)
                        elif isinstance(item, str):
                            # Backward compatibility: if item is a string, convert to new format
                            if item.strip():
                                valid_items.append({
                                    "content": item.strip(),
                                    "content_original": None,
                                    "content_translated": None,
                                    "explanation": None,
                                    "confidence": "high"  # 旧格式默认高置信度
                                })
                    
                    if valid_items:
                        valid_result[theme_type] = valid_items
            
            logger.debug(f"Extracted themes: {list(valid_result.keys())}")
            return valid_result
            
        except Exception as e:
            logger.warning(f"Theme extraction failed: {e}")
            return {}
    
    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    def learn_project_level(
        self,
        reviews_text: str,
        products_data: str,
        product_count: int
    ) -> dict:
        """
        项目级维度/标签学习与映射 - 用于市场洞察功能。
        
        一次 AI 调用完成：
        1. 学习项目级统一维度（聚合自多个产品）
        2. 学习项目级统一5W标签（聚合自多个产品）
        3. 建立项目级 -> 产品级的映射关系
        
        Args:
            reviews_text: 采样的评论文本（已格式化）
            products_data: 所有产品的维度和标签数据（已格式化）
            product_count: 产品数量
            
        Returns:
            学习结果字典，格式：
            {
                "project_dimensions": {
                    "product": [{"name": "...", "description": "...", "mapped_from": [...]}],
                    "scenario": [...],
                    "emotion": [...]
                },
                "project_labels": {
                    "buyer": [{"name": "...", "description": "...", "mapped_from": [...]}],
                    "user": [...],
                    "where": [...],
                    "when": [...],
                    "why": [...],
                    "what": [...]
                }
            }
        """
        if not self._check_client():
            logger.error("Translation service not configured for project level learning")
            return {}
        
        if not reviews_text or not products_data:
            logger.warning("评论样本或产品数据为空，无法进行项目级学习")
            return {}
        
        try:
            # 构建 Prompt
            prompt = PROJECT_LEVEL_LEARNING_PROMPT.format(
                reviews_text=reviews_text,
                products_data=products_data,
                product_count=product_count
            )
            
            logger.info(f"🎓 开始项目级学习，产品数量: {product_count}，Prompt长度: {len(prompt)}")
            
            # 调用 AI（使用更长超时）
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一位专业的市场研究专家。请按照指定的 JSON 格式输出结果，不要有任何其他文字。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,  # 较低的温度，确保输出稳定
                max_tokens=4000,  # 控制输出长度
                timeout=180.0,  # 3分钟超时，项目级学习需要更长时间
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 清理 markdown 代码块
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            if result_text.startswith("```"):
                result_text = result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()
            
            # 解析 JSON
            parsed = json.loads(result_text)
            
            # 验证结构
            valid_result = {
                "project_dimensions": {},
                "project_labels": {}
            }
            
            # 验证维度
            project_dimensions = parsed.get("project_dimensions", {})
            for dim_type in ["product", "scenario", "emotion"]:
                dims = project_dimensions.get(dim_type, [])
                valid_dims = []
                for dim in dims:
                    if isinstance(dim, dict) and dim.get("name"):
                        valid_dims.append({
                            "name": dim["name"].strip(),
                            "description": (dim.get("description") or "").strip(),
                            "mapped_from": dim.get("mapped_from", [])
                        })
                if valid_dims:
                    valid_result["project_dimensions"][dim_type] = valid_dims
            
            # 验证标签
            project_labels = parsed.get("project_labels", {})
            for label_type in ["buyer", "user", "where", "when", "why", "what"]:
                labels = project_labels.get(label_type, [])
                valid_labels = []
                for label in labels:
                    if isinstance(label, dict) and label.get("name"):
                        valid_labels.append({
                            "name": label["name"].strip(),
                            "description": (label.get("description") or "").strip(),
                            "mapped_from": label.get("mapped_from", [])
                        })
                if valid_labels:
                    valid_result["project_labels"][label_type] = valid_labels
            
            # 统计
            dim_count = sum(len(v) for v in valid_result["project_dimensions"].values())
            label_count = sum(len(v) for v in valid_result["project_labels"].values())
            logger.info(f"✅ 项目级学习完成：{dim_count} 个维度，{label_count} 个标签")
            
            return valid_result
            
        except json.JSONDecodeError as e:
            logger.error(f"项目级学习 JSON 解析失败: {e}")
            logger.debug(f"原始响应: {result_text[:500]}...")
            return {}
        except Exception as e:
            logger.error(f"项目级学习失败: {e}")
            return {}


# Singleton instance
translation_service = TranslationService()
