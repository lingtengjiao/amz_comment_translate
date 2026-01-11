"""
Analysis Service - VOC 产品对比分析服务 (Optimized Comparison)

架构优化：
1. 使用 AsyncOpenAI 异步客户端，非阻塞
2. 分步骤处理：每个产品单独分析 -> 生成维度洞察 -> 合并对比
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
    # 核心分析逻辑 (Full Structuring)
    # ==========================================
    
    async def run_analysis(self, project_id: UUID) -> AnalysisProject:
        """
        执行 VOC 对比分析
        
        优化架构：
        1. 使用 AsyncOpenAI 异步客户端
        2. 每个产品独立分析（小请求，稳定）
        3. 并行调用 AI（多产品同时分析）
        4. 生成维度洞察和策略总结
        """
        project = await self.get_project(project_id)
        if not project or not project.items:
            raise ValueError("项目无效")

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
            
            logger.info(f"对比分析完成: {project_id}")
            
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
