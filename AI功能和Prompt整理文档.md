# AI 功能和 Prompt 整理文档

## 项目概述
本项目是一个亚马逊评论分析平台，使用 AI (Qwen API) 进行评论翻译、情感分析、洞察提取和报告生成。本文档整理了所有用到 AI 的功能点及其对应的 Prompt。

**使用的 AI 模型：** 通义千问 (Qwen) - 通过 OpenAI 兼容接口调用  
**主要服务文件：** `backend/app/services/translation.py`

---

## 目录
1. [评论翻译](#1-评论翻译)
2. [情感分析](#2-情感分析)
3. [产品五点描述翻译](#3-产品五点描述翻译)
4. [产品标题翻译](#4-产品标题翻译)
5. [洞察提取 (Insight Extraction)](#5-洞察提取-insight-extraction)
6. [5W 主题提取 (Theme Extraction)](#6-5w-主题提取-theme-extraction)
7. [维度发现 (Dimension Discovery)](#7-维度发现-dimension-discovery)
8. [5W 标签发现 (Context Discovery)](#8-5w-标签发现-context-discovery)
9. [批量翻译](#9-批量翻译)
10. [智能报告生成](#10-智能报告生成)
11. [产品对比分析](#11-产品对比分析)

---

## 1. 评论翻译

### 功能描述
将英文亚马逊评论翻译成中文，采用电商风格的自然语言表达，拒绝"翻译腔"。

### 调用方法
```python
translation_service.translate_text(text: str) -> str
```

### System Prompt

```
你是一位精通中美文化差异的资深亚马逊跨境电商翻译专家。你的目标是提供"信、达、雅"的中文译文。

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

请翻译以下内容，直接输出译文：
```

### 参数配置
- **temperature:** 0.3 (较低温度保证翻译一致性)
- **max_tokens:** 2000
- **timeout:** 60.0 秒

---

## 2. 情感分析

### 功能描述
分析评论的情感倾向，返回 positive/neutral/negative 三种结果。

### 调用方法
```python
translation_service.analyze_sentiment(text: str) -> Sentiment
```

### Prompt

```
分析以下亚马逊商品评论的情感倾向。

评论内容：
{review_text}

请只返回以下三个词之一，不要有任何其他内容：
- positive（正面：满意、推荐、喜欢）
- neutral（中性：客观描述、一般评价）
- negative（负面：不满、批评、退货）

情感判断：
```

### 参数配置
- **temperature:** 0.1 (极低温度保证分类稳定)
- **max_tokens:** 20
- **timeout:** 30.0 秒

---

## 3. 产品五点描述翻译

### 功能描述
翻译亚马逊产品的 Bullet Points（五点描述），使用电商文案风格。

### 调用方法
```python
translation_service.translate_bullet_points(bullet_points: List[str]) -> List[str]
```

### System Prompt

```
你是一位专业的亚马逊产品描述翻译专家。你的任务是将产品的五点描述（Bullet Points）从英文翻译成中文。

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
- 不要添加任何解释或注释
```

### 参数配置
- **temperature:** 0.3
- **max_tokens:** 3000
- **timeout:** 60.0 秒

---

## 4. 产品标题翻译

### 功能描述
翻译亚马逊产品标题，保持关键信息完整。

### 调用方法
```python
translation_service.translate_product_title(title: str) -> str
```

### Prompt
复用评论翻译的 System Prompt（TRANSLATION_SYSTEM_PROMPT）

---

## 5. 洞察提取 (Insight Extraction)

### 功能描述
从评论中提取结构化的产品洞察，分为5类：
1. **strength** - 产品优势/卖点
2. **weakness** - 改进空间/痛点
3. **suggestion** - 用户建议/Feature Request
4. **scenario** - 具体使用场景/行为故事
5. **emotion** - 强烈情感洞察

**[UPDATED] 跨语言模式：**
- **输入**：直接使用英文原文（`original_text`），不再依赖翻译
- **输出**：所有分析结果（`analysis`、`quote_translated`）输出中文
- **优势**：与翻译任务完全解耦，可以并行执行，处理速度提升 2-3 倍
- **依赖**：必须在维度学习完成后触发（需要使用维度 Schema 进行归类）

**[2026-01-15 新增] 置信度机制：**
- 洞察提取也添加了 `confidence` 字段（high/medium/low）
- 对于简短评论（如 "Amazing!"），归类为 emotion 类型，使用 "整体满意度" 维度
- 详见 [置信度机制](#-置信度机制2026-01-15-新增)

### 调用方法
```python
translation_service.extract_insights(
    original_text: str,
    translated_text: str = None,  # [DEPRECATED] 不再使用，保留仅为向后兼容
    dimension_schema: List[dict] = None  # 可选：产品专属维度（推荐使用）
) -> List[dict]
```

### Prompt（动态维度版本 - 跨语言）

```
# Role
Amazon Review Analyst (Cross-language Expert)

# Task
Analyze the following **English review** and extract key insights. Categorize each insight into the specified product dimensions.

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `analysis` and `quote_translated` fields must be in **Simplified Chinese (简体中文)**.
- **Quote**: Keep the `quote` field in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

# Dimension Schema (Must Use)
Only categorize insights into the following dimensions. If content doesn't fit any dimension, use "其他".
{schema_str}

# 5 Insight Types (CRITICAL - Distinguish Carefully)
Break down the review into specific insights and categorize into one of these 5 types:

1. **strength (Product Advantage)**: Features or experiences explicitly praised by the user.
   - Example insights: "吸力非常强劲", "续航超出预期", "外观精美"
   - Use: Extract for Listing selling points

2. **weakness (Pain Point)**: Defects, bugs, or complaints mentioned by the user.
   - Example insights: "电池续航太短", "塑料感强", "噪音过大"
   - Use: Product improvement basis

3. **suggestion (Feature Request)**: Improvement suggestions or desired features.
   - Example insights: "如果能加LED灯就好了", "希望增加定时功能"
   - Use: Direct PM requirements

4. **scenario (Usage Scenario)**: **Specific** usage processes or behavioral stories.
   - Example insights: "尝试清理车库锯末时吸嘴被堵", "晚上喂奶时一键开启很方便"
   - ⚠️ Important: Different from 5W tags!
     - 5W tags are **simple nouns**: "卧室", "厨房"
     - Scenario is **dynamic behavior**: "在厨房做饭时清理面粉"
   - If it's just a simple place/time noun, do NOT extract as scenario

5. **emotion (Emotional Insight)**: Strong emotions expressed (anger/surprise/disappointment/gratitude).
   - Example insights: "对此极其失望", "这是我买过最好的东西", "后悔没早点买"
   - Use: Operations team sentiment alerts

# Output Format (JSON Array)
[
  {
    "type": "weakness", 
    "dimension": "选择上述维度之一", 
    "quote": "Original English quote from the review",
    "quote_translated": "引用的中文翻译",
    "analysis": "简要分析（中文）",
    "sentiment": "positive/negative/neutral"
  }
]

# Critical Rules
1. **每条评论必须至少提取1个洞察**, even for very short reviews.
2. **dimension must be from the schema**, do not invent new dimensions.
3. For short positive reviews (e.g., "Amazing!"), extract as emotion type.
4. For short negative reviews (e.g., "Terrible"), extract as weakness type.
5. Be specific: not "质量不好" but "塑料感强" or "按键松动".
6. NEVER return empty array []. At least 1 insight required.
7. Scenario must be **dynamic behavior**, not simple place/time nouns.
8. **All Chinese output must be natural, fluent Simplified Chinese.**
```

### Prompt（无维度版本 - 跨语言）

```
# Role
Amazon Review Analyst (Cross-language Expert)

# Task
Analyze the following **English review** and extract key user insights. **At least 1 insight must be extracted per review.**

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `analysis` and `quote_translated` fields must be in **Simplified Chinese (简体中文)**.
- **Quote**: Keep the `quote` field in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

# 5 Insight Types (CRITICAL - Distinguish Carefully)
Break down the review into specific insights and categorize into one of these 5 types:

1. **strength (Product Advantage)**: Features or experiences explicitly praised.
   - Example insights: "吸力强劲", "续航超出预期"
   - Use: Listing selling points

2. **weakness (Pain Point)**: Defects, bugs, or complaints.
   - Example insights: "电池续航太短", "塑料感强"
   - Use: Product improvement

3. **suggestion (Feature Request)**: Improvement suggestions.
   - Example insights: "如果能加LED灯就好了"
   - Use: PM requirements

4. **scenario (Usage Scenario)**: **Specific** usage processes.
   - Example insights: "清理车库锯末时吸嘴被堵"
   - ⚠️ Must be dynamic behavior, not simple nouns!

5. **emotion (Emotional Insight)**: Strong emotions expressed.
   - Example insights: "极其失望", "这是买过最好的东西"
   - Use: Sentiment alerts

# Dimension Detection
Auto-detect dimension based on review content (e.g.: 整体满意度, 产品质量, 使用体验, 物流服务, 性价比).

# Output Format (JSON Array)
[
  {
    "type": "strength", 
    "dimension": "整体满意度",
    "quote": "Amazing toy", 
    "quote_translated": "太棒的玩具了",
    "analysis": "用户对产品高度认可，表达强烈正面情感",
    "sentiment": "positive"
  }
]

# Critical Rules
1. **每条评论必须至少提取1个洞察**, even for very short reviews.
2. For short positive reviews (e.g., "Amazing!", "Love it!"), extract as emotion type.
3. For short negative reviews (e.g., "Terrible"), extract as weakness type.
4. Be specific: not "质量不好" but "塑料感强" or "按键松动".
5. NEVER return empty array []. At least 1 insight required.
6. Scenario must be **dynamic behavior**, not simple place/time nouns.
7. **All Chinese output must be natural, fluent Simplified Chinese.**
```

### 参数配置
- **temperature:** 0.2 (低温度保证结构化提取准确)
- **max_tokens:** 1500
- **timeout:** 60.0 秒

---

### 🔄 两种工作模式详解

洞察提取支持两种工作模式，根据是否传入 `dimension_schema` 参数自动切换：

#### 模式A：强制归类模式（推荐）✅

**触发条件：** 传入 `dimension_schema` 参数

**特点：**
- AI 必须将洞察归类到预定义的维度中
- 维度名称统一，统计准确
- 维度有明确定义，可解释性强
- 适合产品已经过维度发现的场景

**Prompt 关键指令：**
```
# 必须遵循的维度标准 (Schema)
请只使用以下维度进行归类。如果内容完全不属于以下任何维度，请归类为 "其他"。
{schema_str}

# 重要规则
2. **dimension 字段必须从维度标准中选择**，不能自己编造新维度。
```

**使用场景：**

1️⃣ **Celery 后台任务：洞察提取** (`backend/app/worker.py`)
```python
@celery_app.task
def task_extract_insights(self, product_id: str):
    """批量提取产品所有评论的洞察"""
    
    # 1. 获取产品的维度 Schema
    dimension_result = db.execute(
        select(ProductDimension)
        .where(ProductDimension.product_id == product_id)
    )
    dimensions = dimension_result.scalars().all()
    
    # 2. 转换为 schema 格式
    dimension_schema = None
    if dimensions and len(dimensions) > 0:
        dimension_schema = [
            {"name": dim.name, "description": dim.description or ""}
            for dim in dimensions
        ]
        logger.info(f"✅ 使用 {len(dimension_schema)} 个产品维度进行洞察提取")
    else:
        logger.info(f"⚠️ 产品暂无定义维度，使用通用洞察提取逻辑")
    
    # 3. 对每条评论提取洞察（传入维度约束）
    for review in reviews:
        insights = translation_service.extract_insights(
            original_text=review.body_original,
            translated_text=review.body_translated,
            dimension_schema=dimension_schema  # ← 传入维度约束
        )
```

**执行流程：**
```
产品 → 维度发现 → 生成维度 → 存入 product_dimensions 表
                       ↓
                  [维度Schema]
                       ↓
评论 → 翻译 → 洞察提取（使用维度约束） → 存入 review_insights 表
              ↓
         所有洞察按统一维度归类
```

2️⃣ **实时处理：并行评论处理** (`backend/app/services/translation.py`)
```python
def process_review_parallel(
    self,
    title: Optional[str],
    body: str,
    dimension_schema: List[dict] = None,  # ← 可选：产品专属维度
    context_schema: dict = None
) -> Optional[dict]:
    """并行执行翻译和分析任务"""
    
    # Phase 2: 高级分析任务（依赖翻译结果）
    future_insights = executor.submit(
        self.extract_insights,
        result["body_original"],
        result["body_translated"],
        dimension_schema  # ← 注入维度表
    )
```

**优势：**
- ✅ 维度名称统一，不会出现"电池"、"续航"、"Battery Life"等同义词分散
- ✅ 聚合统计准确，报告数据可靠
- ✅ 维度可追溯，用户可以理解每个维度的含义
- ✅ 支持手动编辑维度，灵活调整

---

#### 模式B：自由提取模式（降级）⚠️

**触发条件：** 不传入 `dimension_schema` 参数（或传入 `None`）

**特点：**
- AI 根据评论内容自动判断维度
- 维度名称可能不一致（同义词问题）
- 适合快速测试或产品还未进行维度发现

**Prompt 关键指令：**
```
# 维度判断
请根据评论内容自动判断维度（如：整体满意度、产品质量、使用体验、物流服务、性价比等）。
```

**使用场景：**

1️⃣ **产品首次分析（还未生成维度）**
```python
# 场景：用户刚采集产品，评论正在翻译中，还未生成维度
dimension_schema = None  # 暂无维度

insights = translation_service.extract_insights(
    original_text=review.body_original,
    translated_text=review.body_translated,
    dimension_schema=None  # ← 不传入，AI 自由判断
)

# 输出示例：
# [
#   {"type": "weakness", "dimension": "电池续航", ...},
#   {"type": "weakness", "dimension": "Battery Life", ...},  # ⚠️ 同义词
#   {"type": "weakness", "dimension": "续航时间", ...}      # ⚠️ 同义词
# ]
```

2️⃣ **临时测试或演示**
```python
# 场景：快速测试翻译效果，无需严格维度约束
result = translation_service.process_review_parallel(
    title="Great product",
    body="Battery life is terrible",
    dimension_schema=None  # ← 快速模式，不使用维度约束
)
```

**劣势：**
- ❌ 维度不统一，统计分散（"电池续航" vs "Battery Life" vs "续航时间"）
- ❌ 报告数据不准确，需要人工合并同义词
- ❌ 维度定义模糊，用户难以理解

**降级策略：**
```python
# Worker 中的自动降级逻辑
dimension_schema = None
if dimensions and len(dimensions) > 0:
    dimension_schema = [...]  # 使用产品维度
    logger.info("✅ 模式A：使用产品专属维度")
else:
    logger.info("⚠️ 模式B：产品暂无维度，AI 自由判断")

# 无论哪种模式，都能正常提取洞察
insights = translation_service.extract_insights(
    ...,
    dimension_schema=dimension_schema  # None 或 List[dict]
)
```

---

### 🎯 模式选择建议

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| **生产环境批量分析** | 模式A（强制归类） | 数据准确性要求高 |
| **产品深度分析** | 模式A（强制归类） | 需要生成标准化报告 |
| **产品对比分析** | 模式A（强制归类） | 维度必须一致才能对比 |
| **产品首次采集（维度未生成）** | 模式B（自由提取） | 降级方案，后续补维度 |
| **快速测试/演示** | 模式B（自由提取） | 无需等待维度生成 |
| **单条评论快速查看** | 模式B（自由提取） | 实时性优先 |

---

### 📊 实际效果对比

#### 模式A（强制归类）输出示例：
```json
[
  {
    "type": "weakness",
    "dimension": "电池续航",  // ← 统一维度名称
    "quote": "Battery died after 2 days",
    "analysis": "用户反馈电池续航时间极短"
  },
  {
    "type": "weakness",
    "dimension": "电池续航",  // ← 统一维度名称（即使原文不同）
    "quote": "The battery life is a joke",
    "analysis": "用户对电池续航非常不满"
  }
]

// 聚合统计：
// "电池续航": 2条痛点 ✅ 准确
```

#### 模式B（自由提取）输出示例：
```json
[
  {
    "type": "weakness",
    "dimension": "电池续航",  // ← AI 判断1
    "quote": "Battery died after 2 days",
    "analysis": "用户反馈电池续航时间极短"
  },
  {
    "type": "weakness",
    "dimension": "Battery Life",  // ← AI 判断2（同义词）
    "quote": "The battery life is a joke",
    "analysis": "用户对电池续航非常不满"
  }
]

// 聚合统计：
// "电池续航": 1条痛点
// "Battery Life": 1条痛点  ❌ 数据分散
```

---

### 🔧 代码实现位置总结

| 功能 | 文件路径 | 关键代码 |
|------|---------|---------|
| **洞察提取核心方法** | `backend/app/services/translation.py` | `TranslationService.extract_insights()` |
| **后台批量任务** | `backend/app/worker.py` | `task_extract_insights()` - 自动加载维度 |
| **实时并行处理** | `backend/app/services/translation.py` | `process_review_parallel()` - 可选维度参数 |
| **维度管理服务** | `backend/app/services/dimension_service.py` | `DimensionService.auto_generate_dimensions()` |
| **维度模型** | `backend/app/models/product_dimension.py` | `ProductDimension` |

---

## 6. 5W 主题提取 (Theme Extraction)

### 功能描述
从评论中提取5W市场要素（**[2026-01-14 更新] Who 拆分为 Buyer + User**）：
- **Buyer** - 购买者身份（谁付钱）🆕
- **User** - 使用者身份（谁实际使用）🆕     

**业务价值：** 将 Who 拆分为 Buyer 和 User 能提供更精准的营销洞察：
- **母婴/玩具产品**：买的是父母(Buyer)，用的是孩子(User)
- **礼品场景**：买的是送礼人(Buyer)，用的是收礼人(User)
- **B2B场景**：买的是采购(Buyer)，用的是员工(User)

**[UPDATED] 跨语言模式：**
- **输入**：直接使用英文原文（`original_text`），不再依赖翻译
- **输出**：所有分析结果（`content`、`content_translated`、`explanation`）输出中文
- **优势**：与翻译任务完全解耦，可以并行执行，处理速度提升 2-3 倍
- **依赖**：必须在5W标签学习完成后触发（需要使用5W标签 Schema 进行归类）

### 🎯 置信度机制（2026-01-15 新增）

为解决"用户觉得归类不准"的问题，引入了 **置信度机制（Confidence）**：

**核心原则："有勇气说没有"**
- ✅ **空数组优于弱证据猜测**：如果评论没有明确证据，宁可不归类
- ❌ **禁止基于产品类型推断**：不能因为产品是闹钟就假设用户是"深睡人群"
- ✅ **只有明确证据才归类**：必须在评论文本中找到直接支持归类的内容

**置信度级别：**

| Level | 定义 | 示例 | 是否输出 |
|-------|------|------|---------|
| **high** | 评论明确陈述 | "I bought this for my mom" → buyer: 子女 | ✅ 输出 |
| **medium** | 可合理推断 | "Great for my morning routine" → when: 早晨 | ✅ 输出 |
| **low** | 弱关联/猜测 | 闹钟产品 → 假设用户是"深睡人群" | ❌ 不输出 |

**输出格式更新：**
```json
{
  "tag": "深睡人群",
  "quote": "I'm a heavy sleeper and this alarm wakes me up",
  "quote_translated": "我睡得很沉，这个闹钟能把我叫醒",
  "confidence": "high",
  "explanation": "评论明确说'I'm a heavy sleeper'，直接证明用户是深睡人群"
}
```

**数据库字段：** `review_theme_highlights.confidence` (VARCHAR 20)

### 调用方法
```python
translation_service.extract_themes(
    original_text: str,
    translated_text: str = None,  # [DEPRECATED] 不再使用，保留仅为向后兼容
    context_schema: dict = None  # 可选：产品专属5W标签库（推荐使用）
) -> dict
```

### 🔄 两种工作模式详解

5W主题提取支持两种工作模式，根据是否传入 `context_schema` 参数自动切换：

#### 模式A：强制归类模式（标准流程）✅

**触发条件：** 系统自动学习5W标签库后，使用标签库进行强制归类

**实际使用场景：**
- ✅ **99% 的生产环境场景**：系统会自动学习5W标签库，然后使用强制归类模式
- ✅ **全自动分析流程**：`task_full_auto_analysis` → 科学学习（生成标签库）→ 主题提取（强制归类）
- ✅ **手动触发主题提取**：`task_extract_themes` 会自动检测并学习标签库（如果不存在）

**自动学习机制：**
```python
# Worker 自动检测并学习标签库
if label_count == 0:
    # 自动学习5W标签库（需要至少30条已翻译评论）
    learned_labels = translation_service.learn_context_labels_from_raw(...)
    # 存入 product_context_labels 表
    # 然后构建 context_schema
    context_schema = {...}  # 从数据库加载标签库

# 使用强制归类模式提取主题
themes = translation_service.extract_themes(
    original_text=review.body_original,
    context_schema=context_schema  # ← 传入标签库
)
```

**特点：**
- AI 必须将主题归类到预定义的标签库中
- 标签名称统一，统计准确
- 标签有明确定义，可解释性强
- 适合生成标准化报告和对比分析

**Prompt（强制归类模式 - 跨语言 + 置信度，2026-01-15 更新）**

```
You are a professional marketing analyst with STRICT evidence standards.
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
4. The connection requires more than one logical leap

**Remember: An empty array [] is a VALID and often CORRECT answer!**

# Task Rules
1. **Evidence-First**: Only categorize when there is CLEAR evidence in the review text
2. **Forced Labels**: The `tag` field must exactly match a label from the schema
3. **Quote Required**: Must include the exact English quote that supports categorization
4. **Confidence Required**: Must include confidence level (high/medium only, never low)
5. **Explanation Required**: Explain WHY this quote supports this categorization

**CRITICAL: Distinguish Buyer vs User**
- **buyer**: The person who PAYS/purchases
- **user**: The person who USES the product
- If same person, put in **user** only
- If unclear, put in **user** only

# Output Format (JSON Only)
{
  "buyer": [
    {
      "tag": "宝妈", 
      "quote": "I bought this for my son",
      "quote_translated": "我给儿子买的",
      "confidence": "high",
      "explanation": "评论明确说'给儿子买的'，证明购买者是母亲"
    }
  ],
  "user": [
    {
      "tag": "3岁男童", 
      "quote": "my 3 year old loves it",
      "quote_translated": "我3岁的孩子很喜欢",
      "confidence": "high",
      "explanation": "评论明确提到'3岁的孩子'是使用者"
    }
  ],
  "where": [],
  "when": [],
  "why": [],
  "what": []
}

# Examples of CORRECT Behavior

Example 1 - Short positive review with no 5W info:
Input: "Amazing alarm clock! Works perfectly!"
Output: { "buyer": [], "user": [], "where": [], "when": [], "why": [], "what": [] }
Reason: Review only praises product quality, no 5W elements mentioned.

Output JSON only, no other text.
```

---

#### 模式B：开放提取模式（降级方案）⚠️

**触发条件：** 以下情况会降级为开放提取模式（无 `context_schema`）：
- ❌ 已翻译评论不足30条（无法学习标签库）
- ❌ AI学习标签库失败
- ❌ 有效样本不足

**实际使用场景：**
- ⚠️ **数据不足时的降级**：产品刚采集，评论数少于30条
- ⚠️ **学习失败时的降级**：AI学习标签库时出错
- ⚠️ **快速测试**：临时测试单条评论提取效果

**特点：**
- AI 根据评论内容自由提取5W要素
- 标签名称可能不一致（同义词问题）
- 适合快速测试或数据不足的场景

**Prompt（开放提取模式 - 跨语言）**

```
You are a professional marketing analyst.
Analyze the following **English review** using the "5W Analysis Framework" and extract key market elements.

**CRITICAL Language Rules:**
- **Input**: The review text is in **English**.
- **Output**: All `content`, `content_translated`, and `explanation` fields must be in **Simplified Chinese (简体中文)**.
- **content_original**: Keep in **Original English** (for evidence tracing).

# Input (English Review)
{original_text}

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

# Important Notes:
- Extract concise and accurate content.
- Prefer complete semantic meaning: "清理猫毛" is better than "猫毛".
- Must be based on review facts, do not fabricate.
- All output content must be in natural Simplified Chinese.

# Output Format (JSON)
{
  "buyer": [
    {
      "content": "宝妈",
      "content_original": "I bought this for my son",
      "content_translated": "我给儿子买的",
      "explanation": "用户作为母亲为孩子购买"
    }
  ],
  "user": [
    {
      "content": "3岁男童",
      "content_original": "my 3 year old loves it",
      "content_translated": "我3岁的孩子很喜欢",
      "explanation": "实际使用者是3岁的小男孩"
    }
  ],
  "what": [],
  "why": [],
  "where": [],
  "when": []
}
```

---

### 🎯 模式选择建议

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| **生产环境批量分析** | 模式A（强制归类） | 系统自动学习标签库，数据准确性高 |
| **全自动分析流程** | 模式A（强制归类） | 科学学习阶段已生成标签库 |
| **产品对比分析** | 模式A（强制归类） | 标签必须一致才能对比 |
| **产品首次采集（评论<30条）** | 模式B（开放提取） | 数据不足，无法学习标签库 |
| **快速测试/演示** | 模式B（开放提取） | 无需等待标签库生成 |
| **单条评论快速查看** | 模式B（开放提取） | 实时性优先 |

**自动降级机制：**
```python
# Worker 会自动检测并学习标签库
if label_count == 0:
    # 尝试自动学习（需要至少30条已翻译评论）
    if len(sample_reviews) >= 30:
        learned_labels = learn_context_labels_from_raw(...)
        context_schema = build_schema(learned_labels)  # 模式A
    else:
        logger.warning("样本不足，降级为开放提取模式")
        context_schema = None  # 模式B（降级）
else:
    context_schema = load_schema_from_db()  # 模式A

# 无论哪种模式，都能正常提取主题
themes = translation_service.extract_themes(
    original_text=review.body_original,
    context_schema=context_schema  # None 或 dict
)
```

### 参数配置
- **temperature:** 0.2
- **max_tokens:** 2000
- **timeout:** 60.0 秒

---

## 7. 维度发现 (Dimension Discovery)

### 功能描述
从产品评论中学习并总结产品评价维度（如：外观设计、电池续航、材料质感等），用于后续的洞察归类。

**特点：** 跨语言零样本学习 - 直接使用英文评论输出中文维度。

### 调用方法
```python
# 跨语言版本（推荐）
translation_service.learn_dimensions_from_raw(
    raw_reviews: List[str],  # 英文原文评论
    product_title: str = "",  # 英文标题
    bullet_points: str = ""   # 英文五点描述
) -> List[dict]

# 中文评论版本（旧版）
translation_service.learn_dimensions(
    reviews_text: List[str],  # 中文翻译评论
    product_title: str = "",
    bullet_points: str = ""
) -> List[dict]
```

### Prompt（跨语言版本）

```
You are a senior product manager and user research expert. 
Based on the following **English product information** and **English user review samples**, 
build a core evaluation dimension model for this product.

# Product Official Information (English)
- **Product Title**: {product_title}
- **Bullet Points**: 
{bullet_points}

# User Review Samples ({count} reviews, English Original)
{reviews_text}

# Task
Extract 5-8 core evaluation dimensions. **Output dimension names and descriptions in Chinese**.

# Requirements
1. **Combine official positioning with user perspective**: Dimension names should use official terms when possible (from bullet points), but must cover actual user feedback.
2. **Dimension names**: Use concise Chinese (e.g.: 外观设计、结构做工、材料质感、功能表现、玩法多样性、安全性、性价比).
3. **Dimension definition**: One sentence describing what the dimension covers, to guide subsequent classification.
4. **Mutual exclusivity**: Dimensions should not overlap, clear boundaries.
5. **Coverage**: 
   - Must cover major pain points and benefits from reviews
   - Include dimensions emphasized in bullet points even if users are "silently satisfied"
6. **Quantity control**: Extract 5-8 most core dimensions, no more.

# Output Format (JSON Only, Chinese output)
{
  "dimensions": [
    { "name": "维度名称(中文)", "description": "该维度的具体定义(中文)" },
    ...
  ]
}

Output JSON only, no other text.
```

### 参数配置
- **temperature:** 0.3
- **max_tokens:** 2000
- **timeout:** 90.0 秒

---

## 8. 5W 标签发现 (Context Discovery)

### 功能描述
从产品信息和评论中学习并生成5W标准标签库，用于后续的强制归类。

**[2026-01-14 更新] Who 拆分为 Buyer + User：**
- **Buyer（购买者）**：识别购买决策者（谁付钱），如：妈妈、送礼者、企业采购
- **User（使用者）**：识别实际使用者（谁使用），如：孩子、老人、员工

**业务价值：**
- 🎁 **礼品场景**：通过"送礼人群"做精准营销，通过"使用者痛点"改产品
- 👶 **母婴产品**：理解"妈妈群体"的购买心理，优化"儿童"的使用体验
- 🏢 **B2B场景**：区分"采购决策"和"使用反馈"

**特点：** 结合官方信息（标题+五点）+ 用户反馈（评论），输出标准化标签。

### 调用方法
```python
# 跨语言版本（推荐）
translation_service.learn_context_labels_from_raw(
    raw_reviews: List[str],       # 英文原文评论
    product_title: str = "",       # 英文标题
    bullet_points: List[str] = None  # 英文五点描述列表
) -> dict

# 中文评论版本（旧版）
translation_service.learn_context_labels(
    reviews_text: List[str],
    product_title: str = "",
    bullet_points: List[str] = None
) -> dict
```

### Prompt（跨语言版本）

```
You are a senior marketing expert and user researcher.
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
{
  "buyer": [
    { "name": "宝妈", "description": "为孩子购买产品的母亲" },
    { "name": "送礼者", "description": "购买产品作为礼物送人的用户" }
  ],
  "user": [
    { "name": "3岁幼儿", "description": "实际使用产品的低龄儿童" },
    { "name": "老年人", "description": "实际使用产品的老年人群" }
  ],
  "where": [
    { "name": "卧室", "description": "卧室/睡眠场景下使用" }
  ],
  "when": [
    { "name": "睡前", "description": "睡觉前使用" }
  ],
  "why": [
    { "name": "替代旧品", "description": "原有产品损坏需要更换" }
  ],
  "what": [
    { "name": "清理宠物毛", "description": "官方核心用途：清理家中的猫毛狗毛" }
  ]
}

Output JSON only, no other text.
```

### 参数配置
- **temperature:** 0.3
- **max_tokens:** 3000
- **timeout:** 120.0 秒

---

## 9. 批量翻译

### 功能描述
一次API调用翻译10条评论，将QPS消耗降低10倍，效率提升8-10倍。

### 调用方法
```python
translation_service.translate_batch(
    reviews: List[dict]  # 格式: [{"id": "r1", "text": "..."}, ...]
) -> dict  # 返回: {"r1": "译文1", "r2": "译文2", ...}

# 带降级回退
translation_service.translate_batch_with_fallback(
    reviews: List[dict]
) -> dict
```

### System Prompt

```
你是一位精通中美文化差异的资深亚马逊跨境电商翻译专家。

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
输出: {"r1": "简直是个次品！别浪费钱了。", "r2": "彻底改变了我每天早上的习惯，真香！"}
```

### 参数配置
- **temperature:** 0.3
- **max_tokens:** 8000 (批量需要更多token)
- **timeout:** 120.0 秒 (批量需要更长时间)

---

## 10. 智能报告生成

### 功能描述
基于评论数据生成四种不同视角的AI分析报告，使用JSON格式输出结构化内容。

**服务文件：** `backend/app/services/summary_service.py`  
**任务文件：** `backend/app/worker.py` → `task_generate_report`

### 🆕 异步报告生成机制（2026-01-15 新增）

**推荐使用异步接口，避免前端页面卡顿：**

**API 接口：**
1. **触发生成**: `POST /api/v1/products/{asin}/report/generate-async?report_type=comprehensive`
   - 立即返回 `task_id`，用户可离开页面
   - 报告在后台 Celery Worker 中异步生成
   
2. **查询状态**: `GET /api/v1/products/{asin}/report/task/{task_id}`
   - 状态：`pending` → `processing` → `completed` / `failed`
   - 完成时返回 `report_id`

**Celery 任务：**
```python
@celery_app.task(name="app.worker.task_generate_report", queue="reports")
def task_generate_report(self, product_id: str, report_type: str = "comprehensive"):
    """异步生成报告任务"""
    # 调用 summary_service.generate_report()
    # 更新 Task 记录状态
    # 返回 report_id
```

**前端实现：**
- `ProductReportDialog.tsx` 使用 `generateReportAsync()` 和 `getReportTaskStatus()` 轮询状态
- 报告生成过程中用户可正常浏览其他页面

### 四种报告类型

#### 10.1 综合战略报告 (COMPREHENSIVE - CEO版)

**目标用户：** CEO/企业高管/战略决策层

**输出字段：**
- `user_profile` - 用户画像深度分析（5W数据）
- `strategic_verdict` - 战略定调（3句话）
- `market_fit_analysis` - PMF 分析
- `core_swot` - SWOT 分析（带source_tag溯源）
- `department_directives` - 各部门指令
- `priority_actions` - Top 3 优先行动项
- `risk_level` - 风险等级

#### 10.2 运营市场报告 (OPERATIONS - CMO版)

**目标用户：** CMO/运营经理/市场营销团队

**输出字段：**
- `user_profile` - 用户画像（精准营销）
- `executive_summary` - 市场现状总结
- `selling_points` - 核心卖点（带source_tag）
- `marketing_risks` - 客服预警痛点
- `target_audience` - 广告投放建议
- `listing_optimization` - Listing优化建议
- `review_response_templates` - 差评回复模板

#### 10.3 产品迭代报告 (PRODUCT - CPO版)

**目标用户：** CPO/产品经理/研发团队

**输出字段：**
- `user_research` - 用户研究洞察（设计参考）
- `quality_score` - 质量评分 (0-100)
- `critical_bugs` - Top 3 致命缺陷
- `unmet_needs` - 用户期望功能
- `usage_context_gap` - 使用场景差距分析
- `roadmap_suggestion` - 下版本升级方向
- `usability_issues` - 易用性问题
- `design_recommendations` - 设计改进建议

#### 10.4 供应链质检报告 (SUPPLY_CHAIN)

**目标用户：** 供应链总监/QC团队/工厂管理

**输出字段：**
- `usage_context_analysis` - 使用环境分析（质量标准，数组格式，每项包含 `insight`、`evidence`、`confidence`）
- `quality_summary` - 质量评估（包含 `overall_quality_score` 和 `estimated_return_rate`，**必填**）
- `material_defects` - 材质做工问题（数组格式）
- `packaging_issues` - 包装与物流问题（数组格式）
- `missing_parts` - 漏发配件列表（数组格式）
- `qc_checklist` - QC检查清单（数组格式，每项包含 `issue`、`evidence`、`confidence`、`suggestion`）
- `supplier_issues` - 供应商问题（数组格式，每项包含 `issue`、`insight`、`recommendation`、`evidence`、`confidence`）
- `return_rate_factors` - 退货原因分析（数组格式，每项包含 `factor`、`insight`、`recommendation`、`evidence`、`confidence`）
- `assembly_defects` - 组装问题（数组格式，每项包含 `issue`、`evidence`、`confidence`、`suggestion`）

### 通用输入格式

所有报告都基于以下统计数据生成：

```
=== 📊 基础信息 ===
- 分析样本: {total_reviews} 条已翻译评论

=== 📊 PART 1: 5W Context (宏观画像) ===
这里描述了产品的实际使用环境和人群（简单标签）：
- Buyer (购买者): [标签(频次, 占比), ...]
- User (使用者): [标签(频次, 占比), ...]
- Who (人群-旧数据兼容): [标签(频次, 占比), ...]
- Where (使用地点): [标签(频次, 占比), ...]
- When (使用时机): [标签(频次, 占比), ...]
- Why (购买动机): [标签(频次, 占比), ...]
- What (用户任务/JTBD): [标签(频次, 占比), ...]

=== 📉 PART 2: Deep Insights (微观洞察 - 5类) ===
这里是基于 5 类 Insight 的详细分析数据：

1. [Strength - 卖点库]: [维度(频次, 占比), ...]
   *用途：用于撰写 Listing 五点描述和广告文案。*

2. [Weakness - 痛点库]: [维度(频次, 占比), ...]
   *用途：用于产品改进和客服 QA。*

3. [Suggestion - 用户心声]: [维度(频次, 占比), ...]
   *用途：**产品经理请重点关注**，这是用户的直接需求/Feature Request。*

4. [Scenario - 行为故事]: [维度(频次, 占比), ...]
   *用途：用于发现边缘场景（Edge Cases）或营销故事素材。*

5. [Emotion - 情绪预警]: [维度(频次, 占比), ...]
   *用途：**客服和公关请关注**，识别愤怒或极度满意的用户。*

=== 指令 ===
请结合 PART 1 的宏观画像和 PART 2 的微观洞察进行交叉分析。
例如：
- 如果 Buyer="妈妈" 且 User="孩子" 且 Weakness="按键小"，则需指出适老化设计缺陷。
- 如果 Suggestion 中有高频需求，请在报告中重点建议产品团队采纳。
- 如果 Emotion 中有强烈负面情绪，请在报告中给出公关预警。
```

### 各报告类型 Prompt

#### 10.1 综合战略报告 Prompt

```
你是一位**企业CEO兼战略顾问**。请基于"用户画像(5W)"和"口碑洞察(Dimensions)"数据，生成一份**全局战略分析报告** (JSON)。

# 核心目标
评估产品与市场的匹配度(PMF)，识别核心增长点与致命风险，制定全盘策略。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像分析 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像深度分析。格式:
   {
     "core_buyers": (String) **购买者群体**描述（结合 Buyer 数据，如"宝妈、祖辈、企业采购"），
     "core_users": (String) **使用者群体**描述（结合 User 数据，如"学龄前儿童、老年人、员工"），
     "user_characteristics": (Array) 用户特征标签 ["..."],
     "usage_scenarios": (String) 典型使用场景描述（结合 Where/When 数据），
     "purchase_motivation": (String) 主要购买动机分析（结合 Why 数据），
     "jobs_to_be_done": (String) 用户核心任务/JTBD（结合 What 数据），
     "persona_insight": (String) 一句话用户画像总结（需明确区分购买者和使用者）
   }
   
   **重要：必须区分购买者和使用者**
   - core_buyers: 谁付钱购买（决策者、购买者）
   - core_users: 谁实际使用（最终用户、受益者）
   - 如果购买者和使用者是同一人，两个字段可以相同，但必须分别描述

## B. 战略分析
2. "strategic_verdict": (String) 3句话的战略定调
3. "market_fit_analysis": (String) 基于用户画像，分析我们是否抓住了正确的用户和场景？有无错位？
4. "core_swot": (Object) SWOT分析，**每项需带source_tag用于溯源**
5. "department_directives": (Object) 给各部门的一句话指令
6. "priority_actions": (Array) Top 3 优先行动项，**带source_tag溯源**
7. "risk_level": (String) 风险等级：low/medium/high/critical

# 输出格式要求 (CRITICAL)
1. **必须严格仅输出合法的 JSON 格式**。
2. **严禁**包含 markdown 代码块标记。
3. **严禁**在 JSON 前后添加任何解释性文字。
4. 语言风格：专业、数据驱动、客观。使用中文输出。
```

#### 10.2 运营市场报告 Prompt

```
你是一位**首席营销官(CMO)**。请基于统计数据，为**运营团队**生成一份JSON格式的策略报告。

# 核心目标
挖掘产品卖点(Hooks)，规避退货风险，精准定位广告受众。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户画像与市场定位 (基于 5W Context 数据)
1. "user_profile": (Object) 用户画像分析，用于精准营销。格式:
   {
     "primary_buyers": (String) **主要购买者**描述（结合 Buyer 数据），
     "primary_users": (String) **主要使用者**描述（结合 User 数据），
     "secondary_audience": (String) 次要/潜在人群，
     "usage_context": (String) 核心使用场景描述（结合 Where/When），
     "buying_triggers": (Array) 购买触发点/动机 ["..."]（结合 Why），
     "use_cases": (Array) 典型用例/JTBD ["..."]（结合 What），
     "ad_targeting_keywords": (Array) 广告投放关键词建议 ["..."]
   }
   
   **重要：必须区分购买者和使用者**
   - primary_buyers: 广告投放的目标购买决策者
   - primary_users: 产品的实际使用者

## B. 营销策略
2. "executive_summary": (String) 市场现状的3句话总结。
3. "selling_points": (Array) 提炼3个核心卖点，**带source_tag溯源**
4. "marketing_risks": (Array) 客服预警痛点，**带source_tag溯源**
5. "target_audience": (Object) 广告投放建议
6. "competitor_analysis": (String) 用户提到的竞品及我们的优劣势
7. "listing_optimization": (Array) Listing 优化建议，**带source_tag溯源**
8. "review_response_templates": (Array) 差评回复模板，**带source_tag溯源**

# 输出格式要求 (CRITICAL)
1. **必须严格仅输出合法的 JSON 格式**。
2. **严禁**包含 markdown 代码块标记。
3. **严禁**在 JSON 前后添加任何解释性文字。
4. 语言风格：专业、数据驱动、客观。使用中文输出。
```

#### 10.3 产品迭代报告 Prompt

```
你是一位**产品总监(CPO)**。请基于统计数据，为**研发团队**生成一份JSON格式的迭代建议书。

# 核心目标
发现设计缺陷，明确下一代产品(Next-Gen)的改进方向。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 用户与场景分析 (基于 5W Context 数据)
1. "user_research": (Object) 用户研究洞察，用于产品设计。格式:
   {
     "target_buyers": (String) **购买者群体**画像（结合 Buyer 数据），
     "target_users": (String) **使用者群体**画像（结合 User 数据），
     "user_pain_points": (Array) 按用户类型分类的痛点 ["老年用户: 按键太小", "..."],
     "real_usage_environments": (Array) 真实使用环境 ["..."]（结合 Where/When），
     "design_for_context": (String) 针对使用场景的设计建议，
     "user_goals": (Array) 用户核心目标/JTBD ["..."]（结合 What），
     "unmet_expectations": (String) 用户期望与产品现状的差距
   }
   
   **重要：必须区分购买者和使用者**
   - target_buyers: 产品设计需要考虑的购买决策者需求
   - target_users: 产品设计需要满足的实际使用者需求

## B. 产品改进
2. "quality_score": (Integer) 0-100分，基于好评率和痛点严重程度打分。
3. "critical_bugs": (Array) Top 3 致命缺陷，**带source_tag溯源**
4. "unmet_needs": (Array) 用户想要但我们没做的功能，**带source_tag溯源**
5. "usage_context_gap": (String) 用户实际使用场景是否超出了设计预期？
6. "roadmap_suggestion": (String) 下个版本的核心升级方向
7. "usability_issues": (Array) 易用性问题，**带source_tag溯源**
8. "design_recommendations": (Array) 设计改进建议，**带source_tag溯源**

# 输出格式要求 (CRITICAL)
1. **必须严格仅输出合法的 JSON 格式**。
2. **严禁**包含 markdown 代码块标记。
3. **严禁**在 JSON 前后添加任何解释性文字。
4. 语言风格：专业、数据驱动、客观。使用中文输出。
```

#### 10.4 供应链质检报告 Prompt

```
你是一位**供应链总监**。请基于统计数据，为**工厂和QC团队**生成一份JSON格式的质量整改报告。

# 核心目标
降低退货率(Return Rate)，优化包装，追责供应商。

# 输入数据
{stats_text}

# 必填字段 (JSON Key)

## A. 使用场景与质量需求 (基于 5W Context 数据)
1. "usage_context_analysis": (Array) 使用环境分析，用于质量标准制定。格式:
   [
     {
       "insight": (String) **分析洞察**（如"该产品在多场景下的适用性极强，尤其在缓解焦虑、学习专注和会议中使用时表现突出..."）,
       "evidence": (Array) 证据引用 [{"review_id": "...", "quote": "..."}],
       "confidence": "high|medium|low"
     },
     ...
   ]
   
   **注意**: 实际 AI 输出为简化数组格式，每项包含 `insight`、`evidence`、`confidence` 字段。

## B. 质量整改
2. "quality_summary": (Object) 质量概况，**必填字段**:
   {
     "summary": (String) 质量概况总结文本,
     "confidence": "high|medium|low",
     "evidence": (Array) 证据引用,
     "overall_quality_score": (Integer) **必填** 0-100分质量评分,
     "estimated_return_rate": (String) **必填** 估计退货率（如"15-20%"）,
     "top_quality_issues": (Array) Top 3 质量问题概要,
     "improvement_priority": (String) 优先改进方向
   }
3. "material_defects": (Array) 材质做工问题，**带confidence和evidence**
4. "packaging_issues": (Array) 包装与物流问题，**带confidence和evidence**
5. "missing_parts": (Array) 经常漏发的配件列表，**带confidence和evidence**
6. "qc_checklist": (Array) 下批次出货前必须重点检查的项目，**每项包含issue、evidence、confidence、suggestion**
7. "supplier_issues": (Array) 供应商相关问题，**每项包含issue、insight、recommendation、evidence、confidence**
8. "return_rate_factors": (Array) 主要退货原因，**每项包含factor、insight、recommendation、evidence、confidence**
9. "assembly_defects": (Array) 组装问题，**每项包含issue、evidence、confidence、suggestion**

# 输出格式要求 (CRITICAL)
1. **必须严格仅输出合法的 JSON 格式**。
2. **严禁**包含 markdown 代码块标记。
3. **严禁**在 JSON 前后添加任何解释性文字。
4. 语言风格：专业、数据驱动、客观。使用中文输出。
```

### 参数配置（所有报告通用）
- **model:** qwen-max (analysis model)
- **temperature:** 0.4 (较低温度保证JSON结构稳定)
- **max_tokens:** 3500
- **response_format:** `{"type": "json_object"}` (强制JSON输出)

---

## 11. 产品对比分析

### 功能描述
对比分析2-5个产品，生成包含10维度洞察和策略总结的对比报告。

**服务文件：** `backend/app/services/analysis_service.py`

### 11.1 单产品分析 Prompt

```
分析产品"{product_name}"的用户反馈数据，输出结构化JSON。

输入数据：{stats_json}

重要说明：
- **label** 必须是数据中的具体标签名称（如"儿童"、"家长"、"焦虑时"、"家中"、"送礼"等），不要用"用户类型"、"使用时机"这种通用词
- **desc** 是基于数据归纳的一句话描述
- **count** 必须从输入数据的 count 字段获取

输出格式示例：
{
  "product_name": "{product_name}",
  "asin": "{asin}",
  "five_w": {
    "who": [
      {"label": "儿童", "desc": "主要使用者，用于感统训练", "count": 42},
      {"label": "家长", "desc": "重要购买群体", "count": 30}
    ],
    "when": [
      {"label": "焦虑时", "desc": "使用频率最高", "count": 18},
      {"label": "学习时", "desc": "用于集中注意力", "count": 11}
    ],
    "where": [
      {"label": "家庭", "desc": "最主要场景", "count": 37},
      {"label": "学校", "desc": "用于课堂专注力辅助", "count": 17}
    ],
    "why": [
      {"label": "改善行为", "desc": "改善多动、冲动等问题", "count": 23},
      {"label": "缓解焦虑", "desc": "核心需求", "count": 15}
    ],
    "what": [
      {"label": "触觉刺激", "desc": "通过纹理促进感官发展", "count": 38},
      {"label": "情绪安抚", "desc": "帮助安抚情绪波动", "count": 19}
    ]
  },
  "dimensions": {
    "pros": [
      {"label": "材料质感", "desc": "硅胶柔软安全", "count": 31},
      {"label": "功能表现", "desc": "有效缓解焦虑", "count": 30}
    ],
    "cons": [
      {"label": "结构瑕疵", "desc": "连接处不牢固", "count": 4},
      {"label": "佩戴不适", "desc": "长时间使用有压迫感", "count": 3}
    ],
    "suggestion": [
      {"label": "增加颜色选择", "desc": "用户希望有更多颜色款式", "count": 8},
      {"label": "改进包装", "desc": "建议使用更环保的包装", "count": 5}
    ],
    "scenario": [
      {"label": "课堂使用", "desc": "学生在课堂上使用辅助专注", "count": 12},
      {"label": "长途旅行", "desc": "飞机/汽车上打发时间", "count": 7}
    ],
    "emotion": [
      {"label": "惊喜好评", "desc": "超出预期，非常满意", "count": 15},
      {"label": "失望吐槽", "desc": "质量不如预期，有落差感", "count": 6}
    ]
  }
}

要求：
1. label 必须从输入数据的 "label" 字段中提取，不要自己编造
2. count 必须从输入数据的 "count" 字段获取，保持原始数值
3. dimensions 包含5类口碑洞察：pros(优势)、cons(痛点)、suggestion(用户建议)、scenario(使用场景)、emotion(情绪反馈)
4. **数据补全策略**：如果某个维度的原始数据为空数组，请根据相关维度推断并生成合理内容，并标记 is_inferred: true：
   - suggestion 为空时 → 从 cons/weakness 反向推断用户期望的改进建议
   - scenario 为空时 → 从 where/when 推断具体使用场景故事
   - emotion 为空时 → 从 pros/cons 推断用户情绪倾向
   - 推断生成的条目格式：{"label": "xxx", "desc": "xxx", "count": 0, "is_inferred": true}
5. 非推断条目不要添加 is_inferred 字段
6. 只输出JSON，不要其他文字
7. 简体中文
```

### 11.2 维度洞察生成 Prompt

```
基于以下产品的对比数据，为每个维度生成洞察分析。

产品数量：{product_count}
产品列表：
{product_summaries}

请为以下维度生成洞察：{dim_list}

每个维度的洞察包含：
1. name：维度中文名称
2. commonality：所有产品的共性特征（1句话）
3. differences：每个产品的差异特点（数组，每项包含 product 序号和 text 描述）
4. positioning：每个产品的定位洞察（数组，每项包含 product 序号和 text 描述）

输出JSON格式（只输出指定维度）：
{
  "dimension_insights": {
    "{dimension_1}": {
      "name": "维度中文名称",
      "commonality": "...",
      "differences": [{"product": 1, "text": "..."}, ...],
      "positioning": [{"product": 1, "text": "..."}, ...]
    },
    ...
  }
}

要求：简体中文，只输出JSON。
```

**说明：**
- 维度分批生成：5W用户画像(5个) + 优势痛点(2个) + 建议场景情绪(3个)
- 10个维度包括：
  - 5W用户画像：who(用户是谁), when(何时使用), where(在哪里用), why(购买动机), what(具体用途)
  - 5类口碑洞察：pros(优势卖点), cons(痛点问题), suggestion(用户建议), scenario(使用场景), emotion(情绪反馈)

### 11.3 策略总结 Prompt

```
基于以下产品对比分析，生成竞品策略总结。

产品数量：{product_count}
产品列表：
{product_summaries}

输出JSON格式：
{
  "market_summary": "整体市场概述（100字内）",
  "strategy_summary": {
    "market_positioning": {
      "title": "市场定位策略",
      "emoji": "🎯",
      "content": "分析各产品的市场定位差异和竞争策略（150字内）"
    },
    "scenario_deep_dive": {
      "title": "场景化深耕",
      "emoji": "💼",
      "content": "分析各产品在使用场景和时机上的差异化策略（150字内）"
    },
    "growth_opportunities": {
      "title": "增长机会点",
      "emoji": "⚡",
      "content": "基于分析识别的市场机会和增长建议（150字内）"
    }
  }
}

要求：
1. 基于10维分析数据进行归纳（5W用户画像 + 5类口碑洞察）
2. 内容要有商业洞察价值
3. 使用产品序号标注具体建议
4. 只输出JSON，简体中文
```

### 参数配置
- **model:** qwen-max (analysis model)
- **temperature:** 0.3
- **max_tokens:** 
  - 单产品分析: 4000
  - 维度洞察: 2500 (每批)
  - 策略总结: 1500
- **response_format:** `{"type": "json_object"}` (强制JSON输出)

### 参数配置
- **model:** qwen-max (analysis model)
- **temperature:** 0.3
- **max_tokens:** 
  - 单产品分析: 4000
  - 维度洞察: 2500 (每批)
  - 策略总结: 1500

---

## 技术特点总结

### 1. Few-Shot Learning
使用示例引导翻译风格（如 `TRANSLATION_SYSTEM_PROMPT`）

### 2. JSON 输出模式
多数 AI 功能强制使用 `response_format={"type": "json_object"}` 保证结构化输出

### 3. 跨语言零样本学习
维度发现和5W标签发现支持直接用英文评论输出中文标签，无需等待翻译

### 4. 可溯源设计
报告中的洞察带 `source_tag` 字段，可追溯到原始评论证据

### 5. 批量优化
批量翻译将10条评论合并为1次API调用，大幅降低QPS消耗

### 6. 健壮性保障
- 使用 `tenacity` 库实现自动重试（指数退避）
- 多层 JSON 解析兜底（清理 markdown、修复格式）
- 温度参数精细调优（翻译0.3、分类0.1、分析0.2-0.4）

---

## 配置说明

### API 配置（通过环境变量）
```python
from app.core.config import settings

# API Key
settings.QWEN_API_KEY  # 通义千问 API Key

# API Base URL
settings.QWEN_API_BASE  # 默认: "https://dashscope.aliyuncs.com/compatible-mode/v1"

# 模型选择
settings.QWEN_MODEL  # 默认: "qwen-plus" (翻译/提取)
settings.QWEN_ANALYSIS_MODEL  # 默认: "qwen-max" (报告生成/对比分析)
```

### 重试策略（全局配置）
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),  # 最多重试3次
    wait=wait_exponential(multiplier=1, min=2, max=10),  # 指数退避：2s, 4s, 8s
    retry=retry_if_exception_type((Exception,)),
    reraise=True
)
```

---

## 性能优化建议

### 1. 批量处理
- 使用 `translate_batch` 替代单条翻译（效率提升10倍）
- 对比分析采用并行异步调用（AsyncOpenAI）

### 2. 缓存策略
- 报告生成带1小时去重机制（避免重复调用）
- 维度/标签生成后持久化到数据库

### 3. 流式处理
- 采集完成后立即触发翻译任务（Celery异步）
- 翻译完成后立即触发洞察提取（流水线）

### 4. 分批生成
- 对比分析的10个维度分3批生成（避免单次超时）
- 维度批次：5W画像(5) + 优势痛点(2) + 建议场景情绪(3)

---

## 常见问题 (FAQ)

### Q1: 为什么维度发现用英文输入？
**A:** 跨语言零样本学习效率更高，无需等待翻译完成，AI模型本身具备跨语言能力。

### Q2: source_tag 如何使用？
**A:** 前端可通过 source_tag 追溯到 ReviewInsight 或 ReviewThemeHighlight 的原始数据，展示证据引用。

### Q3: 如何添加新的报告类型？
**A:** 在 `REPORT_TYPE_CONFIGS` 中添加新配置，在 `PROMPT_MAP` 中添加对应Prompt即可。

### Q4: 翻译质量如何保证？
**A:** 
1. Few-Shot 示例引导风格
2. 温度参数调低(0.3)保证一致性
3. 批量翻译带降级回退机制
4. 人工抽样校验+反馈迭代






### Q5: 维度发现和洞察提取的关系是什么？
**A:** 这是一个 **"先建模，后执行"** 的两阶段架构：
- **维度发现（阶段1）：** 让AI学习产品评论，生成5-8个评价维度（如：电池续航、外观设计），存入 `product_dimensions` 表，每个产品只执行一次
- **洞察提取（阶段2）：** 对每条评论提取洞察，并强制归类到预定义的维度中，保证维度名称统一、统计准确

**完整流程：**
```
产品首次分析 → 维度发现 → 生成维度标准 → 存入数据库
                              ↓
每条评论翻译 → 洞察提取（使用维度约束） → 按统一维度归类
```

详见文档 [第5章](#5-洞察提取-insight-extraction) 的"两种工作模式详解"。

### Q6: 洞察提取的两种模式有什么区别？
**A:** 
- **模式A（推荐）：** 传入 `dimension_schema` 参数，AI强制将洞察归类到预定义维度，保证数据准确性，适合生产环境
- **模式B（降级）：** 不传入维度参数，AI自由判断维度，可能出现同义词分散（如"电池续航" vs "Battery Life"），适合快速测试或产品还未生成维度的场景

**自动降级逻辑：** Worker会先尝试加载产品维度，如果存在则使用模式A，否则自动降级为模式B。

---

## 附录

### 附录 A：维度发现 + 洞察提取完整工作流

本附录详细说明维度发现和洞察提取两个功能如何配合工作，实现"先学习标准，后强制归类"的AI-Native架构。

---

#### 1. 架构设计原理

**核心问题：** 如果让AI自由判断维度，会导致同义词分散问题

```
评论1: "Battery died"    → AI判断: "电池"
评论2: "Battery life bad" → AI判断: "续航"
评论3: "Power issues"     → AI判断: "Battery Life"

结果：3个本质相同的维度被拆分，统计不准确！
```

**解决方案：** 两阶段架构

```
┌────────────────────────────────────────────────────────┐
│ 阶段1：维度发现 (Dimension Discovery)                  │
│ ─────────────────────────────────────────────────      │
│ • 输入：30-50条评论样本 + 产品官方信息                 │
│ • AI任务：学习并总结产品的核心评价维度                 │
│ • 输出：5-8个维度（中文标准名称 + 定义）                │
│ • 存储：product_dimensions 表                          │
│ • 频率：每个产品只执行一次                             │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ 提供维度标准（Schema）
                 ▼
┌────────────────────────────────────────────────────────┐
│ 阶段2：洞察提取 (Insight Extraction)                   │
│ ─────────────────────────────────────────────────      │
│ • 输入：单条评论 + 维度标准（来自阶段1）                │
│ • AI任务：提取洞察并**强制归类**到预定义维度           │
│ • 输出：5类洞察（每个洞察必须匹配某个维度）             │
│ • 存储：review_insights 表                             │
│ • 频率：每条评论都执行                                 │
└────────────────────────────────────────────────────────┘
```

---

#### 2. 数据库设计

**维度存储表：** `product_dimensions`
```sql
CREATE TABLE product_dimensions (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL,           -- 关联产品
    name VARCHAR(100) NOT NULL,         -- 维度名称（如："电池续航"）
    description TEXT,                   -- 维度定义（如："与充电速度和使用时长..."）
    is_ai_generated BOOLEAN DEFAULT true, -- 是否AI生成
    created_at TIMESTAMP DEFAULT NOW()
);

-- 示例数据
-- product_id: xxx-xxx-xxx
-- name: "电池续航"
-- description: "与充电速度和使用时长相关的问题"
```

**洞察存储表：** `review_insights`
```sql
CREATE TABLE review_insights (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL,            -- 关联评论
    insight_type VARCHAR(50) NOT NULL,  -- 5类类型之一
    dimension VARCHAR(100),             -- 归属维度（来自 product_dimensions.name）
    quote TEXT,                         -- 原文引用
    quote_translated TEXT,              -- 翻译引用
    analysis TEXT,                      -- AI分析
    created_at TIMESTAMP DEFAULT NOW()
);

-- 示例数据
-- review_id: yyy-yyy-yyy
-- insight_type: "weakness"
-- dimension: "电池续航"  ← 必须匹配 product_dimensions.name
-- quote: "Battery died after 2 days"
-- analysis: "用户反馈电池续航时间极短"
```

---

#### 3. 完整代码流程

##### Step 1: 产品首次分析 - 生成维度

```python
# 文件：backend/app/services/dimension_service.py

class DimensionService:
    async def auto_generate_dimensions(
        self, 
        product_id: UUID,
        sample_limit: int = 50
    ) -> List[dict]:
        """让AI从评论样本中学习产品维度"""
        
        # 1. 获取产品信息
        product = await self.db.get(Product, product_id)
        product_title = product.title or ""
        bullet_points = json.loads(product.bullet_points or "[]")
        
        # 2. 获取评论样本（30-50条）
        reviews = await self.db.execute(
            select(Review.body_original, Review.body_translated)
            .where(Review.product_id == product_id)
            .limit(sample_limit)
        )
        sample_texts = [r.body_translated or r.body_original for r in reviews]
        
        # 3. 调用AI学习维度
        learned_dims = translation_service.learn_dimensions(
            reviews_text=sample_texts,
            product_title=product_title,
            bullet_points=bullet_points
        )
        
        # 4. 存入数据库
        for item in learned_dims:
            dim = ProductDimension(
                product_id=product_id,
                name=item['name'],           # "电池续航"
                description=item['description'], # "与充电速度..."
                is_ai_generated=True
            )
            self.db.add(dim)
        
        await self.db.commit()
        return learned_dims

# AI 返回示例：
# [
#   {"name": "电池续航", "description": "与充电速度和使用时长相关"},
#   {"name": "外观设计", "description": "产品的外观、颜色、材质等"},
#   {"name": "噪音控制", "description": "产品运行时的声音大小"}
# ]
```

##### Step 2: 批量提取洞察 - 使用维度约束

```python
# 文件：backend/app/worker.py

@celery_app.task
def task_extract_insights(self, product_id: str):
    """批量提取产品所有评论的洞察"""
    
    # 1. 加载产品的维度Schema
    dimensions = db.execute(
        select(ProductDimension)
        .where(ProductDimension.product_id == product_id)
    ).scalars().all()
    
    # 2. 转换为schema格式（供AI使用）
    dimension_schema = None
    if dimensions:
        dimension_schema = [
            {"name": dim.name, "description": dim.description}
            for dim in dimensions
        ]
        logger.info(f"✅ 使用 {len(dimension_schema)} 个产品维度")
        # 输出：[
        #   {"name": "电池续航", "description": "与充电速度..."},
        #   {"name": "外观设计", "description": "产品的外观..."}
        # ]
    else:
        logger.info("⚠️ 产品暂无维度，AI自由判断")
    
    # 3. 获取待处理的评论
    reviews = db.execute(
        select(Review)
        .where(Review.product_id == product_id)
        .where(Review.translation_status == "completed")
    ).scalars().all()
    
    # 4. 对每条评论提取洞察（传入维度约束）
    for review in reviews:
        insights = translation_service.extract_insights(
            original_text=review.body_original,
            translated_text=review.body_translated,
            dimension_schema=dimension_schema  # ← 关键：传入维度约束
        )
        
        # 5. 存储洞察
        for insight_data in insights:
            insight = ReviewInsight(
                review_id=review.id,
                insight_type=insight_data['type'],      # "weakness"
                dimension=insight_data['dimension'],    # "电池续航" ← 必定匹配schema
                quote=insight_data['quote'],
                analysis=insight_data['analysis']
            )
            db.add(insight)
    
    db.commit()

# AI 返回示例（使用维度约束）：
# [
#   {
#     "type": "weakness",
#     "dimension": "电池续航",  ← 从schema中选择，不会是"续航"或"Battery"
#     "quote": "Battery died after 2 days",
#     "analysis": "用户反馈电池续航时间极短"
#   }
# ]
```

---

#### 4. Prompt 协同机制

##### 维度发现 Prompt（输出维度标准）

```
# 输入：50条评论样本 + 产品信息
# 任务：提炼5-8个核心评价维度

输出格式 (JSON)：
{
  "dimensions": [
    {"name": "电池续航", "description": "与充电速度和使用时长相关的问题"},
    {"name": "外观设计", "description": "产品的外观、颜色、材质等视觉相关评价"}
  ]
}
```

##### 洞察提取 Prompt（使用维度标准）

```
# 输入：单条评论 + 维度标准（来自上一步）

# 必须遵循的维度标准 (Schema)
请只使用以下维度进行归类：
- 电池续航: 与充电速度和使用时长相关的问题
- 外观设计: 产品的外观、颜色、材质等视觉相关评价

# 重要规则
dimension 字段**必须从上述维度中选择**，不能自己编造新维度。

输出格式 (JSON)：
[
  {
    "type": "weakness",
    "dimension": "电池续航",  ← 必须是 "电池续航"，不能是 "续航" 或 "Battery"
    "quote": "Battery died after 2 days",
    "analysis": "..."
  }
]
```

---

#### 5. 统计聚合效果对比

##### ❌ 无维度约束（模式B）

```python
# 评论1 → AI判断: "电池"
# 评论2 → AI判断: "续航"
# 评论3 → AI判断: "Battery Life"

# 聚合统计结果：
{
    "电池": 1,
    "续航": 1,
    "Battery Life": 1
}
# 问题：同义词分散，无法准确统计
```

##### ✅ 使用维度约束（模式A）

```python
# 评论1 → AI强制归类: "电池续航"
# 评论2 → AI强制归类: "电池续航"
# 评论3 → AI强制归类: "电池续航"

# 聚合统计结果：
{
    "电池续航": 3
}
# 优势：维度统一，统计准确
```

---

#### 6. 触发时机和自动化

**核心原则：流式翻译边存边译，科学学习基于英文原文，不等待翻译**

**完整工作流程：**

```
[阶段1：数据采集阶段]
─────────────────────────────────────────────────
用户采集产品（Chrome 插件）
    ↓
评论入库 (reviews 表，包含 body_original 英文原文)
    ↓
[立即触发] 流式翻译任务 (task_ingest_translation_only)
    → 边采集边翻译，不等待采集完成
    → 更新 body_translated
    ↓
采集完成（Chrome 插件调用 /collection-complete）
    ↓
┌─────────────────────────────────────────────────┐
│ 根据 workflow_mode 决定后续流程                  │
├─────────────────────────────────────────────────┤
│                                                 │
│ 模式A：one_step_insight（一步到位，默认）         │
│   ↓                                             │
│ [自动触发] 全自动分析任务 (task_full_auto_analysis)│
│                                                 │
│ 模式B：translate_only（只翻译）                  │
│   ↓                                             │
│ 跳过自动分析，等待用户手动点击"开始分析"          │
│                                                 │
└─────────────────────────────────────────────────┘

[阶段2：全自动分析流程（task_full_auto_analysis）]
─────────────────────────────────────────────────
Step 0: 等待入库队列清空（确保所有评论已入库）
    ↓
Step 1: 科学学习（基于英文原文，不依赖翻译！）
    ↓
    ┌─────────────────────────────────────────┐
    │ 科学采样（从 body_original 采样 50 条）  │
    │   → 按 helpful_votes 和长度排序          │
    └─────────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────────┐
    │ 维度发现（如果不存在）                    │
    │   → learn_dimensions_from_raw()         │
    │   → 存入 product_dimensions 表          │
    └─────────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────────┐
    │ 5W标签发现（如果不存在）                  │
    │   → learn_context_labels_from_raw()     │
    │   → 存入 product_context_labels 表      │
    └─────────────────────────────────────────┘
    ↓
Step 2: 触发洞察+主题提取（翻译此时已在进行中！）
    ↓
    [触发] task_extract_insights.delay(product_id)
    [触发] task_extract_themes.delay(product_id)
    ↓
Step 3: 等待三任务并行完成（最多等待 30 分钟）
    ↓
    ┌─────────────────────────────────────────┐
    │ 并行执行（互不阻塞）                      │
    ├─────────────────────────────────────────┤
    │ • 翻译任务（已在进行，会先完成）         │
    │ • 洞察提取（边翻译边提取已完成的评论）    │
    │ • 主题提取（边翻译边提取已完成的评论）    │
    └─────────────────────────────────────────┘
    ↓
Step 4: 生成综合战略版报告
    ↓
    → 存入 product_reports 表
    → 状态更新为 completed
```

**两种工作流模式详解：**

##### 模式A：one_step_insight（一步到位，默认）✅

**触发时机：** 采集完成后自动触发（`/collection-complete?workflow_mode=one_step_insight`）

**流程：**
1. 采集时：评论入库 → 立即触发流式翻译
2. 采集完成：自动触发 `task_full_auto_analysis`
3. 全自动执行：科学学习 → 洞察提取 → 主题提取 → 报告生成
4. 用户无需二次操作，直接获得完整分析结果

**适用场景：**
- 快速获取分析结果
- 不需要自定义维度
- 标准分析流程

##### 模式B：translate_only（只翻译）📝

**触发时机：** 采集完成后不触发分析（`/collection-complete?workflow_mode=translate_only`）

**流程：**
1. 采集时：评论入库 → 立即触发流式翻译
2. 采集完成：仅完成翻译，状态变为"待分析"
3. 用户手动点击"开始分析"按钮（调用 `/products/{asin}/start-analysis`）
4. 触发 `task_full_auto_analysis`，执行完整分析流程

**适用场景：**
- 需要先查看翻译结果
- 需要手动编辑维度后再分析
- 分阶段处理，灵活控制

**关键点：**
- ✅ **流式翻译**：评论入库时立即触发翻译，不等待采集完成
- ✅ **科学学习不依赖翻译**：使用 `learn_dimensions_from_raw` 和 `learn_context_labels_from_raw`，直接基于英文原文
- ✅ **并行执行**：翻译、洞察提取、主题提取三任务并行，边翻译边提取
- ✅ **数据入库即可开始**：只要有 10+ 条英文评论，立即开始科学学习
- ✅ **时间优化**：预计节省 50%+ 的总时间（翻译在采集时就开始，不等待）

**自动降级机制：**
```python
# Worker 会自动检测维度是否存在
if has_dimensions:
    mode = "A (强制归类)"
    dimension_schema = load_dimensions()
else:
    mode = "B (自由提取)"
    dimension_schema = None

logger.info(f"洞察提取模式: {mode}")
```

**实际触发接口：**

1. **采集完成触发**（Chrome 插件调用）：
   ```http
   POST /api/v1/products/{asin}/collection-complete?workflow_mode=one_step_insight
   ```
   - `workflow_mode=one_step_insight`：自动触发全自动分析
   - `workflow_mode=translate_only`：只翻译，等待手动分析

2. **手动开始分析**（用户点击按钮）：
   ```http
   POST /api/v1/products/{asin}/start-analysis
   ```
   - 触发 `task_full_auto_analysis`，执行完整分析流程

3. **单独触发科学学习**（可选）：
   ```http
   POST /api/v1/products/{asin}/dimensions/generate
   POST /api/v1/products/{asin}/context-labels/generate
   ```
   - 或直接调用 Celery 任务：`task_scientific_learning_and_analysis.delay(product_id)`

**代码实现位置：**
- 采集完成接口：`backend/app/api/reviews.py` → `collection_complete()`
- 全自动分析任务：`backend/app/worker.py` → `task_full_auto_analysis()`
- 科学学习任务：`backend/app/worker.py` → `task_scientific_learning_and_analysis()`
- 流式翻译任务：`backend/app/worker.py` → `task_ingest_translation_only()`

---

#### 7. API调用示例

##### 后台任务（自动加载维度）
```python
# Celery Worker 自动处理
from app.worker import task_extract_insights

task_extract_insights.delay(product_id)
# Worker 会自动：
# 1. 检查产品是否有维度
# 2. 如果有 → 加载维度 → 模式A
# 3. 如果没有 → 模式B（降级）
```

##### 手动调用（灵活控制）
```python
# 模式A：使用维度约束
dimensions = await dimension_service.get_dimensions(product_id)
dimension_schema = [{"name": d.name, "description": d.description} for d in dimensions]

insights = translation_service.extract_insights(
    original_text="Battery died quickly",
    translated_text="电池很快就没电了",
    dimension_schema=dimension_schema  # ← 传入维度
)

# 模式B：自由提取
insights = translation_service.extract_insights(
    original_text="Battery died quickly",
    translated_text="电池很快就没电了",
    dimension_schema=None  # ← 不传入
)
```

---

#### 8. 优势总结

| 对比项 | 无维度架构 | 两阶段架构（维度+洞察） |
|-------|-----------|----------------------|
| **维度一致性** | ❌ 同义词分散 | ✅ 统一标准 |
| **统计准确性** | ❌ 需要人工合并 | ✅ 自动聚合 |
| **产品个性化** | ❌ 通用维度 | ✅ 每个产品定制 |
| **可解释性** | ❌ 维度名称模糊 | ✅ 有明确定义 |
| **灵活性** | ❌ 无法调整 | ✅ 可手动编辑维度 |
| **报告质量** | ❌ 数据不可靠 | ✅ 数据准确可信 |

---

#### 9. 注意事项

1. **维度数量控制：** 建议5-8个，过多会导致归类困难
2. **维度定义清晰：** description 要写明白，避免AI误判
3. **定期更新：** 产品迭代后，可能需要重新生成维度
4. **兼容旧数据：** 没有维度的产品，自动使用模式B（降级）
5. **维度可编辑：** 如果AI生成的维度不满意，可以手动修改

---

## 更新日志

### 2026-01-15 v1.8 更新 - 异步报告生成和供应链报告字段更新 🆕
- ✅ **异步报告生成机制**：新增 `task_generate_report` Celery 任务，支持后台异步生成
- ✅ **API 接口更新**：新增 `POST /api/v1/products/{asin}/report/generate-async` 和 `GET /api/v1/products/{asin}/report/task/{task_id}`
- ✅ **供应链报告字段更新**：更新 `usage_context_analysis` 为数组格式，明确 `quality_summary` 必填字段
- ✅ **前端架构更新**：报告页面模块化重构，支持侧边栏查看证据

### 2026-01-15 v1.7 更新 - 添加置信度机制和严格证据要求 🆕
- ✅ **置信度字段**：在5W主题提取和洞察提取中添加 `confidence` 字段（high/medium/low）
- ✅ **严格证据要求**：Prompt明确要求"只有明确证据才归类"，允许AI返回空数组
- ✅ **"有勇气说没有"规则**：明确告诉AI"空数组优于弱证据猜测"
- ✅ **禁止基于产品类型推断**：例如，不能因为产品是闹钟就假设用户是"深睡人群"
- ✅ **数据模型更新**：`review_theme_highlights` 表添加 `confidence` 字段
- ✅ **前端类型更新**：`ThemeItem`、`ApiThemeItem`、`ApiThemeHighlight` 添加 `confidence` 字段
- ✅ **业务价值**：提升归类准确性，让用户对AI分析结果更有信心

### 2026-01-14 v1.6 更新 - 明确5W主题提取两种模式的使用场景
- ✅ **使用场景说明**：明确强制归类模式（模式A）是标准流程，系统会自动学习标签库
- ✅ **降级机制说明**：明确开放提取模式（模式B）是降级方案，只在数据不足或学习失败时使用
- ✅ **自动学习机制**：添加代码示例说明Worker如何自动检测并学习标签库
- ✅ **模式选择建议表**：添加场景与推荐模式的对照表

### 2026-01-14 v1.5 更新 - 全面更新所有AI功能的Prompt 🆕
- ✅ **洞察提取Prompt更新**：更新为跨语言版本（英文输入→中文输出），包含动态维度和无维度两种模式
- ✅ **5W主题提取Prompt更新**：更新为跨语言版本，包含Buyer/User拆分说明
- ✅ **维度发现Prompt更新**：确认跨语言版本已是最新
- ✅ **5W标签发现Prompt更新**：确认跨语言版本已是最新，包含Buyer/User拆分
- ✅ **智能报告生成Prompt更新**：添加四种报告类型的完整Prompt，包含Buyer/User拆分说明
- ✅ **产品对比分析Prompt更新**：更新单产品分析、维度洞察生成、策略总结的完整Prompt
- ✅ **通用输入格式更新**：更新为包含Buyer/User拆分的格式

### 2026-01-14 v1.4 更新 - 触发时机和自动化流程文档修正 🆕
- ✅ **修正触发时机描述**：更新第6章"触发时机和自动化"，反映最新实际实现
  - 明确流式翻译机制：评论入库时立即触发翻译，不等待采集完成
  - 明确两种工作流模式：`one_step_insight`（一步到位）和 `translate_only`（只翻译）
  - 明确全自动分析流程：Step 0-4 的完整步骤说明
  - 添加实际触发接口说明和代码实现位置
- ✅ **流程优化说明**：补充时间优化说明（预计节省 50%+ 总时间）
- ✅ **代码位置标注**：明确各功能的代码实现位置，便于开发维护

### 2026-01-14 v1.3 更新 - 5W Who 拆分为 Buyer + User 🆕
- ✅ **Who 拆分**：将 "Who（人群）" 拆分为更精细的两个维度
  - **Buyer（购买者）**：谁付钱购买（如：妈妈、送礼者、企业采购）
  - **User（使用者）**：谁实际使用（如：孩子、老人、员工）
- ✅ **业务价值**：
  - 母婴/玩具产品：买的是父母，用的是孩子
  - 礼品场景：买的是送礼人，用的是收礼人
  - B2B场景：买的是采购，用的是员工
- ✅ **后端修改**：
  - 更新 4 个 Prompt（CONTEXT_DISCOVERY_RAW_PROMPT、CONTEXT_DISCOVERY_PROMPT、THEME_EXTRACTION_PROMPT、THEME_EXTRACTION_PROMPT_WITH_SCHEMA）
  - 扩展 ContextType、ThemeType 枚举（添加 BUYER、USER）
  - 更新 valid_types/valid_themes 集合
- ✅ **前端修改**：
  - 更新 ThemeTypeId 类型定义
  - 更新 themeTagsPreset、FIVE_W_CONFIG 配置
  - StatsDashboard 支持展示 Buyer 和 User 卡片
- ✅ **向后兼容**：保留 "who" 类型用于历史数据展示

### 2026-01-13 v1.2 更新 - 工作流模式优化
- ✅ **模式B重构**：将"手动分步触发"简化为"只翻译→后洞察"两步模式
  - 第一步：采集时选择"只翻译"，完成翻译后可查看译文
  - 第二步：用户点击"开始分析"按钮，一键触发完整分析流水线
- ✅ **一键分析接口**：`POST /api/v1/products/{asin}/start-analysis`
  - 调用 `task_full_auto_analysis` 任务，与模式A相同的完整流程
  - 包含：科学学习 → 洞察+主题提取 → 报告生成
- ✅ **简化用户操作**：模式B从原来的5-6步操作简化为2步

### 2026-01-13 v1.1 更新
- ✅ 新增：洞察提取两种工作模式详解（模式A强制归类 vs 模式B自由提取）
- ✅ 新增：附录A - 维度发现+洞察提取完整工作流（架构原理、代码实现、效果对比）
- ✅ 扩充：FAQ新增Q5和Q6，解答维度和洞察的关系
- ✅ 优化：第5章增加使用场景说明和代码示例

### 2024-01 v1.0 初始版本
- ✅ 添加批量翻译功能（10条/批）
- ✅ 跨语言维度发现（英文输入→中文输出）
- ✅ 5W标签库结合产品官方信息
- ✅ 报告生成添加完成度检查（95%阈值）
- ✅ 对比分析采用分批生成策略

---

**文档版本：** v1.8  
**最后更新：** 2026-01-15  
**维护者：** Backend Team
