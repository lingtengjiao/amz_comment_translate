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


# [NEW] 动态维度提取 Prompt (用于执行)
INSIGHT_EXTRACTION_PROMPT_DYNAMIC = """# Role
亚马逊评论深度分析师

# Task
分析评论，提取关键洞察，并将其**严格归类**到指定的产品维度中。

# Input
原文: {original_text}
译文: {translated_text}

# 必须遵循的维度标准 (Schema)
请只使用以下维度进行归类。如果内容完全不属于以下任何维度，请归类为 "其他"。
{schema_str}

# Requirements
请仔细阅读评论，提取以下类型的洞察：
- **weakness（痛点）**: 用户不满意的地方
- **strength（爽点）**: 用户满意的地方  
- **scenario（使用场景）**: 用户如何使用产品
- **suggestion（用户建议）**: 用户的改进建议
- **emotion（情感表达）**: 用户的整体情感态度

# Output Format (JSON Array)
[
  {{
    "type": "weakness", 
    "dimension": "从上述维度中选择一个", 
    "quote": "原文引用", 
    "quote_translated": "引用翻译",
    "analysis": "简要分析" 
  }}
]

# 重要规则
1. **每条评论必须至少提取1个洞察**，即使评论很短。
2. **dimension 字段必须从维度标准中选择**，不能自己编造新维度。
3. 对于简短的正面评论（如"Amazing!"），提取为 emotion 类型。
4. 对于简短的负面评论（如"Terrible"），提取为 weakness 类型。
5. 提取要"颗粒度细"，不要笼统地说"质量不好"，要说"塑料感强"或"按键松动"。
6. 绝对不要返回空数组 []，至少要有1个洞察。
"""


# [UPDATED] Insight extraction prompt with Chain of Thought (CoT)
INSIGHT_EXTRACTION_PROMPT = """# Role
亚马逊评论深度分析师

# Task
分析以下评论，提取关键的用户洞察。**每条评论必须至少提取1个洞察**。

# Input
原文: {original_text}
译文: {translated_text}

# Requirements
请仔细阅读评论，提取以下类型的洞察：
- **weakness（痛点）**: 用户不满意的地方
- **strength（爽点）**: 用户满意的地方  
- **scenario（使用场景）**: 用户如何使用产品
- **suggestion（用户建议）**: 用户的改进建议
- **emotion（情感表达）**: 用户的整体情感态度

对于每一个洞察点，请遵循以下步骤思考：
1. 定位原文中的关键表达。
2. 判断它属于哪个维度（如：整体满意度、产品质量、使用体验、物流服务、性价比等）。
3. 用简练的中文总结价值。

# Output Format (JSON Array)
[
  {{
    "type": "strength", 
    "dimension": "整体满意度",
    "quote": "Amazing toy", 
    "quote_translated": "太棒了",
    "analysis": "用户对产品高度认可，表达了强烈的正面情感" 
  }},
  {{
    "type": "emotion",
    "dimension": "购买体验",
    "quote": "Great buy",
    "quote_translated": "买得值",
    "analysis": "用户认为这次购买物超所值"
  }}
]

# 重要规则
1. **每条评论必须至少提取1个洞察**，即使评论很短。
2. 对于简短的正面评论（如"Amazing!"、"Love it!"），提取为 emotion 类型，分析用户的情感态度。
3. 对于简短的负面评论（如"Terrible"、"Waste of money"），提取为 weakness 类型。
4. 提取要"颗粒度细"，不要笼统地说"质量不好"，要说"塑料感强"或"按键松动"。
5. 绝对不要返回空数组 []，至少要有1个洞察。
"""


class InsightType(str, Enum):
    """Insight type enumeration"""
    STRENGTH = "strength"
    WEAKNESS = "weakness"
    SUGGESTION = "suggestion"
    SCENARIO = "scenario"
    EMOTION = "emotion"





# [UPDATED] 5W Model Extraction Prompt (无标签库模式 - 开放提取)
THEME_EXTRACTION_PROMPT = """你是一位专业的市场营销分析专家。请基于"5W分析法"分析以下商品评论，提取关键的市场要素。

评论原文（英文）：
{original_text}

评论翻译（中文）：
{translated_text}

请从评论中提取以下 5 类核心要素（如果某类没有提及，则留空）：

1. **who（使用者/人群）**: 
   - 定义: 谁在使用产品？
   - 示例: 老年人、学生、宠物主、妻子、工程师。
2. **where（使用地点）**: 
   - 定义: 在什么物理空间使用？
   - 示例: 卧室、办公室、房车(RV)、车库、户外露营。
3. **when（使用时刻）**: 
   - 定义: 在什么时间或特定情境下使用？
   - 示例: 睡前、紧急停电时、圣诞节早晨、运动后。
4. **why（购买动机）**: 
   - 定义: 促使用户下单的触发点是什么？(Purchase Driver)
   - 示例: 旧的坏了(替代)、作为生日礼物、为了省钱、搬新家、被广告种草。
5. **what（待办任务/用途）**: 
   - 定义: 用户用它来解决什么具体问题？(Jobs to be Done)
   - 注意: 不是列举功能，而是列举任务。
   - 示例: 清理地毯上的猫毛(而不是"吸力大")、缓解背痛(而不是"人体工学")、哄孩子睡觉。

注意事项：
- 提取的内容必须简练、准确。
- 尽量提取完整语义，如"清理猫毛"优于"猫毛"。
- 必须基于评论事实，不可编造。
- 如果内容来自英文原文，请同时提供英文原文和中文翻译。

请以JSON格式返回：
{{
  "who": [
    {{
      "content": "孩子",
      "content_original": "for kids",
      "content_translated": "给孩子",
      "explanation": "用户买给孩子作为礼物"
    }}
  ],
  "what": [],
  "why": [],
  "where": [],
  "when": []
}}
"""


# [UPDATED] 5W 标签发现 Prompt (学习阶段 - 结合产品官方信息 + 用户评论)
CONTEXT_DISCOVERY_PROMPT = """你是一位资深的市场营销专家和用户研究员。请基于以下**产品官方信息**和**用户评论样本**，构建该产品的"5W 用户与市场模型"。

# 产品官方信息（卖家定义）
- **产品标题**: {product_title}
- **核心卖点 (Bullet Points)**:
{bullet_points}

# 用户评论样本（{count}条买家反馈）
{reviews_text}

# 任务
请综合官方定位与用户反馈，识别并归纳出以下 5 类核心要素，每类提取 **Top 5-8 个典型标签**：

1. **Who (人群)**: 谁是主要用户？
   - 优先参考官方定位（如: "Perfect for seniors"）
   - 结合用户实际反馈（如: "bought for my mom"）
   - 角色/身份，如: 老年人、新手妈妈、学生、宠物主
   - 家庭关系，如: 给父母买的、送给妻子、孩子的礼物

2. **Where (地点)**: 在哪里使用？
   - 优先参考官方定位（如: "for Home Office, Garage"）
   - 结合用户实际使用场景
   - 物理空间，如: 卧室、办公室、厨房、车上、房车(RV)、户外露营

3. **When (时刻)**: 什么时候使用？
   - 时间点，如: 早上、睡前、深夜
   - 触发时机，如: 停电时、旅行时、运动后、节假日

4. **Why (动机)**: 购买的触发点是什么？(Purchase Driver)
   - 替代需求，如: 旧的坏了、升级换代
   - 送礼需求，如: 生日礼物、圣诞礼物、乔迁送礼
   - 外部驱动，如: 被种草、看了评测、朋友推荐

5. **What (任务)**: 用户试图用它完成什么具体任务？(Jobs to be Done)
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
  "who": [
    {{ "name": "老年人", "description": "官方定位的核心用户群体，适合需要照顾的老人" }},
    {{ "name": "宠物主", "description": "养猫或养狗的用户" }}
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


# [UPDATED] 5W 定向提取 Prompt (执行阶段 - Execution，带证据的可解释强制归类)
THEME_EXTRACTION_PROMPT_WITH_SCHEMA = """你是一位专业的市场营销分析专家。请分析以下商品评论，识别其中涉及的 5W 要素。

评论原文（英文）：
{original_text}

评论翻译（中文）：
{translated_text}

# 标准标签库 (Schema - 只能从以下标签中选择)
{schema_str}

# 任务规则
1. **强制归类**：你提取的 `tag` 字段必须严格等于上述标签库中的标签名。不要编造新标签。
2. **证据留存**：必须引用原文 `quote`（英文）和 `quote_translated`（中文翻译）作为判断依据。
3. **解释说明**：提供简短的 `explanation` 解释为什么这样归类。
4. **多选**：如果评论涉及多个标签，请生成多个对象。
5. **忽略无关**：如果评论内容不匹配某个类别的任何标签，该类别返回空数组。

# 输出格式 (JSON Only)
{{
  "who": [
    {{
      "tag": "老年人", 
      "quote": "bought this for my 80yo dad",
      "quote_translated": "给我80岁的父亲买的",
      "explanation": "评论明确提及买给80岁的父亲"
    }}
  ],
  "where": [],
  "when": [],
  "why": [
    {{
      "tag": "送礼",
      "quote": "as a gift for my mom",
      "quote_translated": "作为礼物送给妈妈",
      "explanation": "用户明确说是作为礼物送给母亲"
    }}
  ],
  "what": [
    {{
      "tag": "缓解背痛",
      "quote": "helps with my lower back pain",
      "quote_translated": "帮助缓解我的腰痛",
      "explanation": "用户使用该产品来解决背痛问题"
    }}
  ]
}}

请只输出 JSON，不要有其他解释文字。"""


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
        
        if not reviews_text or len(reviews_text) < 5:
            logger.warning("样本数量不足（至少需要5条评论），无法有效学习维度")
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
        
        if not reviews_text or len(reviews_text) < 30:
            logger.warning("样本数量不足（至少需要30条评论），无法有效学习 5W 标签")
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
            
            # 验证和清理每个 5W 类型的标签
            valid_types = {"who", "where", "when", "why", "what"}
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
        translated_text: str,
        dimension_schema: List[dict] = None
    ) -> List[dict]:
        """
        Extract insights from a review.
        
        Args:
            original_text: 原始评论文本
            translated_text: 翻译后的文本
            dimension_schema: 可选的维度模式列表，用于限定 AI 只使用这些维度进行归类
                             格式: [{"name": "维度名", "description": "维度定义"}, ...]
        
        Returns:
            洞察列表，每个洞察包含 type, dimension, quote, analysis 等字段
        """
        if not self._check_client():
            return []
        
        # Skip very short reviews
        if not original_text or len(original_text.strip()) < 20:
            return []
        
        try:
            # 根据是否有维度模式选择不同的 Prompt
            if dimension_schema and len(dimension_schema) > 0:
                # 使用动态维度 Prompt - 强制 AI 按指定维度归类
                schema_str = "\n".join([
                    f"- {d['name']}: {d.get('description', '无具体定义')}" 
                    for d in dimension_schema
                ])
                prompt = INSIGHT_EXTRACTION_PROMPT_DYNAMIC.format(
                    original_text=original_text,
                    translated_text=translated_text or original_text,
                    schema_str=schema_str
                )
                logger.debug(f"使用动态维度 Prompt，共 {len(dimension_schema)} 个维度")
            else:
                # 使用原有 Prompt - 兼容旧逻辑
                prompt = INSIGHT_EXTRACTION_PROMPT.format(
                    original_text=original_text,
                    translated_text=translated_text or original_text
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
                
                valid_insights.append({
                    "type": insight["type"],
                    "quote": insight["quote"],
                    "quote_translated": insight.get("quote_translated"),
                    "analysis": insight["analysis"],
                    "dimension": insight.get("dimension")
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
    
    def process_review_parallel(self, title: Optional[str], body: str) -> Optional[dict]:
        """
        [High Performance] Execute distinct prompts in parallel to maintain quality while boosting speed.
        
        This method orchestrates parallel execution of translation and analysis tasks:
        - Phase 1: Translate Title, Translate Body, Analyze Sentiment (Parallel - no dependencies)
        - Phase 2: Extract Insights, Extract Themes (Parallel - dependent on Phase 1 translation results)
        
        Expected speedup: ~50% (from ~6s to ~3.5s per review) while maintaining 100% quality.
        
        Args:
            title: Review title (optional)
            body: Review body (required)
            
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
            
            future_insights = executor.submit(
                self.extract_insights, 
                result["body_original"], 
                result["body_translated"]
            )
            
            future_themes = executor.submit(
                self.extract_themes, 
                result["body_original"], 
                result["body_translated"]
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
        translated_text: str,
        context_schema: dict = None
    ) -> dict:
        """
        Extract 5W theme content from a review.
        
        支持两种模式：
        1. 开放提取模式（无 context_schema）：AI 自由提取 5W 要素
        2. 强制归类模式（有 context_schema）：AI 只能输出标签库中已有的标签
        
        Args:
            original_text: 评论原文
            translated_text: 评论翻译
            context_schema: 可选的 5W 标签库，格式：
                {
                    "who": [{"name": "老年人", "description": "..."}, ...],
                    "where": [...],
                    ...
                }
                
        Returns:
            提取的主题内容，格式：
            - 开放模式：{"who": [{"content": "...", ...}], ...}
            - 归类模式：{"who": ["老年人", "宠物主"], "where": [], ...}
        """
        if not self._check_client():
            return {}
        
        # Skip very short reviews
        if not translated_text or len(translated_text.strip()) < 10:
            return {}
        
        # [UPDATED] Valid theme types for 5W model
        valid_themes = {"who", "where", "when", "why", "what"}
        
        try:
            # 根据是否有标签库选择不同的 Prompt
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
                    translated_text=translated_text,
                    schema_str=schema_str
                )
                logger.debug(f"使用强制归类模式，标签库包含 {len(schema_lines)} 个类型")
            else:
                # 开放提取模式 - 自由提取
                prompt = THEME_EXTRACTION_PROMPT.format(
                    original_text=original_text or "",
                    translated_text=translated_text
                )
                logger.debug("使用开放提取模式")
            
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
                            # 新格式: 带 tag/quote/quote_translated/explanation 的对象
                            tag = item.get("tag") or item.get("content")
                            if tag and tag.strip() in allowed_labels:
                                valid_items.append({
                                    "content": tag.strip(),  # 标准标签名
                                    "content_original": item.get("quote") or item.get("content_original"),  # 原文证据
                                    "quote_translated": item.get("quote_translated"),  # [NEW] 中文翻译证据
                                    "content_translated": item.get("content_translated"),  # 翻译（可选，向后兼容）
                                    "explanation": item.get("explanation")  # 归类理由
                                })
                        elif isinstance(item, str):
                            # 兼容旧格式: 纯字符串
                            if item.strip() in allowed_labels:
                                valid_items.append({
                                    "content": item.strip(),
                                    "content_original": None,
                                    "content_translated": None,
                                    "explanation": f"命中标签库: {item.strip()}"
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
                                # Build valid item
                                valid_item = {
                                    "content": content,
                                    "content_original": item.get("content_original") or None,
                                    "content_translated": item.get("content_translated") or None,
                                    "explanation": item.get("explanation") or None
                                }
                                valid_items.append(valid_item)
                        elif isinstance(item, str):
                            # Backward compatibility: if item is a string, convert to new format
                            if item.strip():
                                valid_items.append({
                                    "content": item.strip(),
                                    "content_original": None,
                                    "content_translated": None,
                                    "explanation": None
                                })
                    
                    if valid_items:
                        valid_result[theme_type] = valid_items
            
            logger.debug(f"Extracted themes: {list(valid_result.keys())}")
            return valid_result
            
        except Exception as e:
            logger.warning(f"Theme extraction failed: {e}")
            return {}


# Singleton instance
translation_service = TranslationService()
