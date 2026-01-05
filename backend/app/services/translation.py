"""
Translation Service - Qwen API Integration for Amazon Review Translation

This service handles:
1. E-commerce context-aware translation (English -> Chinese)
2. Sentiment preservation and analysis
3. Slang and colloquialism handling
4. Rate limiting and retry logic
5. Review insight extraction (深度解读)
"""
import logging
import json
from typing import Optional, Tuple, List
from enum import Enum

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

logger = logging.getLogger(__name__)


class Sentiment(str, Enum):
    """Sentiment analysis result"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


# System prompt for Amazon review translation
TRANSLATION_SYSTEM_PROMPT = """你是一位专业的亚马逊电商评论翻译专家。你的任务是将英文评论翻译成中文，同时保留原文的情感强度和语气。

翻译原则：
1. **情感还原**: 保留原文的情感色彩。愤怒、失望、惊喜、满意等情绪必须在译文中体现。
2. **电商语境**: 使用符合中国电商评论习惯的表达方式。例如：
   - "works great" → "很好用" 而不是 "工作得很好"
   - "waste of money" → "浪费钱" / "智商税"
   - "must have" → "必入" / "值得入手"
   - "game changer" → "真香" / "神器"
3. **俚语处理**: 识别并恰当翻译网络俚语和口语表达。
4. **负面评论**: 对于差评，忠实传达消费者的不满和批评，不要美化。
5. **简洁有力**: 中文译文应当简洁有力，避免冗余。

输出格式：
- 只输出翻译后的中文文本
- 不要添加任何解释、注释或原文引用
- 保持原文的段落结构"""


SENTIMENT_ANALYSIS_PROMPT = """分析以下亚马逊商品评论的情感倾向。

评论内容：
{review_text}

请只返回以下三个词之一，不要有任何其他内容：
- positive（正面：满意、推荐、喜欢）
- neutral（中性：客观描述、一般评价）
- negative（负面：不满、批评、退货）

情感判断："""


# System prompt for bullet points translation (产品五点描述翻译)
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


# Prompt for extracting insights from reviews
INSIGHT_EXTRACTION_PROMPT = """你是一位专业的亚马逊评论分析专家。请分析以下商品评论，提取有价值的洞察。

评论原文（英文）：
{original_text}

评论翻译（中文）：
{translated_text}

请从评论中提取关键洞察，每个洞察包含：
1. type: 洞察类型，必须是以下之一：
   - strength: 产品优势/优点
   - weakness: 产品劣势/缺点/改进空间
   - suggestion: 用户建议/期望
   - scenario: 使用场景描述
   - emotion: 情感洞察（特别强烈的情感表达）

2. quote: 原文中的关键片段（英文原文）
3. quote_translated: 引用片段的中文翻译
4. analysis: 深度解读（用一句话总结这个洞察的价值，中文）
5. dimension: 产品维度（如：质量、价格、外观、功能、物流、客服等，可为null）

注意事项：
- 只提取有实际价值的洞察，不要凑数
- 每条评论提取1-3个最重要的洞察即可
- 如果评论内容太短或无实质内容，可以返回空数组
- quote必须是原文中实际存在的片段

请以JSON数组格式返回，例如：
[
  {{
    "type": "weakness",
    "quote": "the arms are so flimsy",
    "quote_translated": "扶手太软了",
    "analysis": "产品结构支撑不足，可能存在安全隐患",
    "dimension": "质量"
  }}
]

如果没有有价值的洞察，返回空数组 []"""


class InsightType(str, Enum):
    """Insight type enumeration"""
    STRENGTH = "strength"
    WEAKNESS = "weakness"
    SUGGESTION = "suggestion"
    SCENARIO = "scenario"
    EMOTION = "emotion"


# Prompt for extracting theme content from reviews
THEME_EXTRACTION_PROMPT = """你是一位专业的亚马逊评论分析专家。请分析以下商品评论，识别其中与8个主题相关的内容（关键词、短语或句子）。

评论原文（英文）：
{original_text}

评论翻译（中文）：
{translated_text}

请从评论中提取以下8个主题的内容：

1. **who（使用者）**: 识别评论中提到的人群，如：孩子、老人、上班族、家人、妻子、丈夫、宝宝等
2. **where（使用场景）**: 识别使用地点和场景，如：家里、办公室、卧室、户外、车上、健身房等
3. **when（使用时机）**: 识别使用时间和时机，如：早上、晚上、睡前、运动时、上班时、周末等
4. **unmet_needs（未被满足的需求）**: 识别用户期待和建议，如：希望、如果能、建议、要是、应该增加等
5. **pain_points（痛点）**: 识别问题和不满，如：故障、坏了、不好用、太贵、质量差、失望等
6. **benefits（收益/好处）**: 识别正面体验，如：方便、省时、舒适、好用、值得、推荐、满意等
7. **features（功能特性）**: 识别产品功能描述，如：尺寸、材质、颜色、容量、电池、充电、音质等
8. **comparison（对比）**: 识别对比内容，如：比之前、相比其他、更好、不如、类似、升级版等

注意事项：
- 提取的内容可以是关键词、短语或完整句子
- 每个主题提取0-5个最相关的内容项
- 内容必须是评论中实际出现的，不能自己编造
- 如果某个主题在评论中没有相关内容，返回空数组
- 尽量提取完整有意义的内容，如"给孩子买的"而不只是"孩子"
- 如果内容来自英文原文，请同时提供英文原文和中文翻译

请以JSON格式返回，每个主题的内容项格式如下：
{{
  "who": [
    {{
      "content": "孩子",
      "content_original": "for kids",
      "content_translated": "给孩子",
      "explanation": "评论中提到使用人群是孩子"
    }}
  ],
  "where": [
    {{
      "content": "家里",
      "content_original": "at home",
      "content_translated": "在家里",
      "explanation": "评论中提到使用场景是家里"
    }}
  ],
  "when": [],
  "unmet_needs": [
    {{
      "content": "希望能更大一些",
      "content_original": null,
      "content_translated": null,
      "explanation": "用户希望产品尺寸更大"
    }}
  ],
  "pain_points": [
    {{
      "content": "太贵了",
      "content_original": "too expensive",
      "content_translated": "太贵了",
      "explanation": "用户认为价格过高"
    }}
  ],
  "benefits": [],
  "features": [],
  "comparison": []
}}

说明：
- content: 中文内容（必需），可以是关键词、短语或句子
- content_original: 原始英文内容（可选），如果内容来自英文原文则提供
- content_translated: 翻译（可选），如果从英文提取则提供中文翻译
- explanation: 解释说明（可选），简要说明为什么提取这个内容

如果评论太短或无实质内容，返回所有主题为空数组的JSON。"""


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
        
        Args:
            text: English text to translate
            
        Returns:
            Translated Chinese text
            
        Raises:
            Exception: If translation fails after retries
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
                timeout=60.0,  # 60 seconds timeout
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
        
        Args:
            text: Review text (English or Chinese)
            
        Returns:
            Sentiment enum value
        """
        if not self._check_client():
            # Default to neutral if service not configured
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
                timeout=30.0,  # 30 seconds timeout
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
    def extract_insights(
        self,
        original_text: str,
        translated_text: str
    ) -> List[dict]:
        """
        Extract insights from a review.
        
        Args:
            original_text: Original English review text
            translated_text: Translated Chinese text
            
        Returns:
            List of insight dicts
        """
        if not self._check_client():
            return []
        
        # Skip very short reviews
        if not original_text or len(original_text.strip()) < 30:
            return []
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": INSIGHT_EXTRACTION_PROMPT.format(
                        original_text=original_text,
                        translated_text=translated_text or original_text
                    )}
                ],
                temperature=0.3,
                max_tokens=1500,
                timeout=60.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            # Parse JSON result
            # Handle markdown code blocks if present
            if result.startswith("```"):
                # Remove markdown code block markers
                lines = result.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                result = "\n".join(lines)
            
            insights = json.loads(result)
            
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
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse insights JSON: {e}")
            return []
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
        
        Args:
            title: Review title (optional)
            body: Review body (required)
            extract_insights: Whether to extract insights (default True)
            
        Returns:
            Tuple of (translated_title, translated_body, sentiment, insights)
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
    
    def batch_translate(
        self,
        reviews: list[dict]
    ) -> list[dict]:
        """
        Translate a batch of reviews.
        
        Args:
            reviews: List of review dicts with 'title' and 'body' keys
            
        Returns:
            List of dicts with 'title_translated', 'body_translated', 'sentiment'
        """
        results = []
        
        for review in reviews:
            title = review.get("title") or review.get("title_original")
            body = review.get("body") or review.get("body_original", "")
            
            try:
                translated_title, translated_body, sentiment = self.translate_review(
                    title=title,
                    body=body
                )
                results.append({
                    "title_translated": translated_title,
                    "body_translated": translated_body,
                    "sentiment": sentiment.value,
                    "success": True
                })
            except Exception as e:
                logger.error(f"Batch translation failed for review: {e}")
                results.append({
                    "title_translated": None,
                    "body_translated": None,
                    "sentiment": Sentiment.NEUTRAL.value,
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
        
        Args:
            bullet_points: List of English bullet point strings
            
        Returns:
            List of translated Chinese bullet point strings
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
        
        Args:
            title: English product title
            
        Returns:
            Translated Chinese title
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
    def extract_themes(self, original_text: str, translated_text: str) -> dict:
        """
        Extract theme content from a review (both original and translated).
        
        Args:
            original_text: Original English review text
            translated_text: Translated Chinese review text
            
        Returns:
            Dict with theme_type -> list of items
            Each item is a dict with: content, content_original, content_translated, explanation
            Example: {
                "who": [
                    {
                        "content": "孩子",
                        "content_original": "for kids",
                        "content_translated": "给孩子",
                        "explanation": "评论中提到使用人群是孩子"
                    }
                ],
                "pain_points": [
                    {
                        "content": "太贵了",
                        "content_original": "too expensive",
                        "content_translated": "太贵了",
                        "explanation": "用户认为价格过高"
                    }
                ]
            }
        """
        if not self._check_client():
            return {}
        
        # Skip very short reviews
        if not translated_text or len(translated_text.strip()) < 10:
            return {}
        
        # Valid theme types
        valid_themes = {
            "who", "where", "when", "unmet_needs", 
            "pain_points", "benefits", "features", "comparison"
        }
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": THEME_EXTRACTION_PROMPT.format(
                        original_text=original_text or "",
                        translated_text=translated_text
                    )}
                ],
                temperature=0.2,
                max_tokens=2000,  # Increased for more detailed responses
                timeout=60.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            # Parse JSON result
            # Handle markdown code blocks if present
            if result.startswith("```"):
                lines = result.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                result = "\n".join(lines)
            
            themes = json.loads(result)
            
            # Validate and filter themes
            valid_result = {}
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
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse themes JSON: {e}")
            return {}
        except Exception as e:
            logger.warning(f"Theme extraction failed: {e}")
            return {}


# Singleton instance
translation_service = TranslationService()

