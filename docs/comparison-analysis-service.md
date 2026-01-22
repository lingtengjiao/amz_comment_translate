# VOC 对比分析服务技术文档

## 一、服务概览

VOC（Voice of Customer）对比分析服务是一个基于 AI 的多产品横向对比分析系统，通过分析用户评论数据，生成结构化的产品洞察报告。

### 核心能力
- **11 维度分析**：6W 用户画像（buyer, user, when, where, why, what）+ 5 类口碑洞察（pros, cons, suggestion, scenario, emotion）
- **多产品对比**：支持 2-5 款产品同时对比
- **AI 智能洞察**：基于 Qwen 大模型生成维度洞察和策略总结
- **异步处理**：后台任务执行，不阻塞用户操作

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           前端 (React + Vite)                        │
│  ┌─────────────┐  ┌─────────────────┐  ┌───────────────────────┐    │
│  │ AICompare   │  │ AnalysisResult  │  │ VocComparison         │    │
│  │ Section     │──│ Page            │──│ Renderer              │    │
│  │ (列表页)     │  │ (详情页)         │  │ (核心渲染器)           │    │
│  └─────────────┘  └─────────────────┘  └───────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ HTTP API
┌─────────────────────────────────────────────────────────────────────┐
│                        后端 (FastAPI + SQLAlchemy)                   │
│  ┌─────────────────┐     ┌─────────────────────────────────────┐    │
│  │ /api/v1/analysis│     │         AnalysisService              │    │
│  │ - POST /projects│────▶│ - create_comparison_project()       │    │
│  │ - POST /{id}/run│────▶│ - run_analysis()                    │    │
│  │ - GET /{id}     │────▶│ - _run_comparison_analysis()        │    │
│  └─────────────────┘     └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
              ┌────────────┐              ┌────────────┐
              │ PostgreSQL │              │ Qwen API   │
              │ (数据存储)  │              │ (AI 分析)   │
              └────────────┘              └────────────┘
```

---

## 三、API 端点

### 3.1 创建分析项目

```http
POST /api/v1/analysis/projects
```

**请求体**:
```json
{
  "title": "竞品对比分析",
  "description": "可选描述",
  "products": [
    {"product_id": "uuid-1", "role_label": "target"},
    {"product_id": "uuid-2", "role_label": "competitor"}
  ],
  "analysis_type": "comparison"
}
```

**响应**:
```json
{
  "success": true,
  "message": "项目创建成功，分析任务已启动",
  "project": {
    "id": "project-uuid",
    "status": "pending"
  }
}
```

### 3.2 触发分析任务

```http
POST /api/v1/analysis/projects/{project_id}/run
```

### 3.3 获取项目详情

```http
GET /api/v1/analysis/projects/{project_id}
```

**响应 `result_content` 结构**:
```json
{
  "product_profiles": [...],      // 每个产品的 11 维度数据
  "dimension_insights": {...},    // 11 个维度的对比洞察
  "market_summary": "...",        // 市场概述
  "strategy_summary": {...}       // 策略总结
}
```

### 3.4 根据标签获取评论

```http
GET /api/v1/analysis/projects/{project_id}/reviews-by-label?dimension=buyer&label=宝妈
```

---

## 四、后端服务流程

### 4.1 分析执行流程

```
_run_comparison_analysis()
    │
    ├── 1. 更新状态为 PROCESSING
    │
    ├── 2. 收集产品数据 (_fetch_product_data)
    │       ├── 获取 5W 统计数据 (SummaryService)
    │       ├── 获取洞察统计数据
    │       └── 动态调整标签数量（根据产品数）
    │
    ├── 3. 并行分析每个产品 (analyze_single_product)
    │       ├── 调用 Qwen API (SINGLE_PRODUCT_PROMPT)
    │       ├── 生成 6W 用户画像
    │       ├── 生成 5 类口碑洞察
    │       └── 智能数据补全（is_inferred 标记）
    │
    ├── 4. 生成产品摘要 (_generate_product_summaries)
    │
    ├── 5. 并行生成洞察和总结
    │       ├── generate_all_dimension_insights()
    │       │     ├── 批次1: buyer, user, when, where, why, what
    │       │     ├── 批次2: pros, cons
    │       │     └── 批次3: suggestion, scenario, emotion
    │       │
    │       └── generate_strategy_summary()
    │             ├── 市场定位策略
    │             ├── 场景化深耕
    │             └── 增长机会点
    │
    ├── 6. 组装最终结果
    │
    └── 7. 更新状态为 COMPLETED
```

### 4.2 数据获取逻辑

```python
async def _fetch_product_data(item, product_count):
    """获取产品的统计数据"""
    
    # 1. 获取 5W 统计数据
    five_w = await summary_service._aggregate_5w_stats(product_id)
    # 返回: {buyer: [...], user: [...], when: [...], ...}
    
    # 2. 获取洞察统计数据
    insights = await summary_service._aggregate_insight_stats(product_id)
    # 返回: {strength: [...], weakness: [...], suggestion: [...], ...}
    
    # 3. 动态调整标签数量
    max_tags = self._calculate_max_tags(product_count)
    # 2产品: 20条, 3产品: 15条, 4产品: 12条, 5产品: 10条
    
    return _simplify_stats(data, max_tags)
```

### 4.3 AI Prompt 设计

**SINGLE_PRODUCT_PROMPT** - 单产品分析:
- 输入：产品统计数据 JSON
- 输出：结构化的 6W + 5 类洞察
- 特点：支持数据补全策略（is_inferred 标记）

**DIMENSION_INSIGHT_PROMPT** - 维度洞察生成:
- 输入：多产品摘要
- 输出：每个维度的 commonality/differences/positioning
- 特点：分 3 批处理，避免 token 超限

**STRATEGY_SUMMARY_PROMPT** - 策略总结:
- 输入：产品摘要
- 输出：市场定位、场景深耕、增长机会

---

## 五、前端组件结构

```
AnalysisResultPage.tsx              # 详情页容器
    │
    ├── 状态管理
    │   ├── 轮询分析状态
    │   └── 侧边栏状态
    │
    └── VocComparisonRenderer.tsx   # 核心渲染器
            │
            ├── ProductCompareHeader  # 产品对比头部（吸顶）
            │
            ├── 11 个维度区块
            │   ├── CompareDimensionRow    # 维度数据行
            │   │   ├── 产品标签列表
            │   │   └── 评论数按钮 → 打开侧边栏
            │   │
            │   └── CompareDimensionInsight # 维度洞察卡片
            │       ├── 共性特征
            │       ├── 差异特点
            │       └── 定位洞察
            │
            ├── StrategySummary       # 策略总结区块
            │
            └── CompareReviewSidebar  # 评论侧边栏
                ├── 按产品分组显示
                └── 显示原文 + 译文
```

### 维度配置

```typescript
const DIMENSION_CONFIG = [
  // 6W 用户画像
  { key: 'buyer', name: '购买者', icon: Users, color: '#3B82F6' },
  { key: 'user', name: '使用者', icon: Users, color: '#06B6D4' },
  { key: 'when', name: '何时使用', icon: Clock, color: '#8B5CF6' },
  { key: 'where', name: '在哪里用', icon: MapPin, color: '#10B981' },
  { key: 'why', name: '购买动机', icon: ShoppingCart, color: '#F59E0B' },
  { key: 'what', name: '具体用途', icon: Target, color: '#EC4899' },
  
  // 5 类口碑洞察
  { key: 'pros', name: '用户好评点', icon: ThumbsUp, color: '#22C55E' },
  { key: 'cons', name: '用户痛点', icon: AlertTriangle, color: '#EF4444' },
  { key: 'suggestion', name: '用户建议', icon: Lightbulb, color: '#F97316' },
  { key: 'scenario', name: '使用场景', icon: Play, color: '#6366F1' },
  { key: 'emotion', name: '情绪反馈', icon: Heart, color: '#F43F5E' },
];
```

---

## 六、数据模型

### 6.1 AnalysisProject

```sql
CREATE TABLE analysis_projects (
    id UUID PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    analysis_type VARCHAR(50),  -- 'comparison' | 'market_insight'
    status VARCHAR(50),         -- 'pending' | 'processing' | 'completed' | 'failed'
    user_id UUID,               -- 创建者
    result_content JSONB,       -- 分析结果
    raw_data_snapshot JSONB,    -- 原始数据快照
    error_message TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### 6.2 result_content 结构

```typescript
interface ResultContent {
  product_profiles: ProductProfile[];
  dimension_insights: DimensionInsights;
  market_summary: string;
  strategy_summary: StrategySummary;
}

interface ProductProfile {
  product_name: string;
  asin: string;
  image_url: string;
  five_w: {
    buyer: LabelDescItem[];
    user: LabelDescItem[];
    when: LabelDescItem[];
    where: LabelDescItem[];
    why: LabelDescItem[];
    what: LabelDescItem[];
  };
  dimensions: {
    pros: LabelDescItem[];
    cons: LabelDescItem[];
    suggestion: LabelDescItem[];
    scenario: LabelDescItem[];
    emotion: LabelDescItem[];
  };
}

interface LabelDescItem {
  label: string;
  desc: string;
  count: number;
  is_inferred?: boolean;  // 智能推断标记
}
```

---

## 七、性能优化措施

### 当前已实现

| 优化项 | 实现方式 | 效果 |
|--------|----------|------|
| **异步 AI 调用** | AsyncOpenAI 客户端 | 非阻塞，支持并发 |
| **并行产品分析** | asyncio.gather() | 5 产品同时分析 |
| **分批维度洞察** | 3 批次处理 | 避免 token 超限 |
| **智能重试** | tenacity + 手动重试 | 提高稳定性 |
| **Redis 缓存** | 完成项目缓存 10 分钟 | 减少数据库查询 |
| **动态标签数** | 根据产品数调整 | 控制 token 使用 |
| **数据压缩** | 只保留 Top N 标签 | 减少 AI 输入量 |
| **🆕 批量数据库查询** | batch_aggregate_5w_stats/insights | 减少 30-50% 数据库耗时 |
| **🆕 SSE 流式进度** | /progress/stream 端点 | 用户实时看到进度 |
| **🆕 Celery 任务队列** | task_run_comparison_analysis | 支持高并发，避免阻塞 |

### 🆕 高优先级优化详情 (2026-01-22 实施)

#### 1. 批量数据库查询优化

**文件**: `backend/app/services/summary_service.py`

**新增方法**:
- `batch_aggregate_5w_stats(product_ids: List[UUID])` - 批量获取 5W 数据
- `batch_aggregate_insight_stats(product_ids: List[UUID])` - 批量获取洞察数据

**优化原理**:
```python
# 优化前：N 次数据库查询
for item in project.items:
    context_stats = await summary_service._aggregate_5w_stats(item.product_id)
    insight_stats = await summary_service._aggregate_insight_stats(item.product_id)

# 优化后：2 次数据库查询
product_ids = [item.product_id for item in project.items]
batch_5w_stats = await summary_service.batch_aggregate_5w_stats(product_ids)
batch_insight_stats = await summary_service.batch_aggregate_insight_stats(product_ids)
```

**预期效果**: 减少 30-50% 数据收集阶段耗时

---

#### 2. SSE 流式进度推送

**文件**: `backend/app/api/analysis.py`

**新增端点**:

```http
GET /api/v1/analysis/projects/{project_id}/progress/stream
```

**响应格式** (Server-Sent Events):
```
data: {"status": "processing", "step": 2, "step_name": "产品分析", "percent": 45, "message": "分析中..."}

data: {"status": "completed", "step": 5, "step_name": "完成", "percent": 100, "message": "分析完成"}

event: close
data: {"reason": "completed"}
```

**前端使用示例**:
```typescript
const eventSource = new EventSource(
  `/api/v1/analysis/projects/${projectId}/progress/stream`
);

eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  setProgress(progress.percent);
  setMessage(progress.message);
};

eventSource.addEventListener('close', () => {
  eventSource.close();
});
```

**进度回调接口**: `backend/app/core/redis.py`
- `AnalysisProgressTracker` - 异步版本（FastAPI）
- `AnalysisProgressTrackerSync` - 同步版本（Celery Worker）

---

#### 3. Celery 任务队列

**文件**: `backend/app/worker.py`

**新增任务**:
```python
@celery_app.task(bind=True, max_retries=2, default_retry_delay=60, time_limit=600)
def task_run_comparison_analysis(self, project_id: str):
    """对比分析异步任务"""
    ...
```

**任务特性**:
- 最大重试: 2 次
- 重试间隔: 60 秒
- 超时限制: 10 分钟
- 软超时: 9 分钟（提前警告）

**API 调用方式** (可选，用于替代 BackgroundTasks):
```python
from app.worker import task_run_comparison_analysis

# 方式1: 异步调用（立即返回）
task_run_comparison_analysis.delay(str(project_id))

# 方式2: 带优先级调用
task_run_comparison_analysis.apply_async(
    args=[str(project_id)],
    queue='analysis',
    priority=5
)
```

**监控**: 通过 Flower 监控面板查看任务状态

---

## 八、优化建议

### 8.1 🔴 高优先级

#### 1. 增加流式输出支持
**现状**: 用户需等待全部分析完成才能看到结果  
**建议**: 使用 Server-Sent Events (SSE) 实时推送分析进度

```python
# 后端
@router.get("/projects/{project_id}/stream")
async def stream_analysis(project_id: UUID):
    async def generate():
        yield f"data: {json.dumps({'step': 1, 'message': '正在分析产品1...'})}\n\n"
        # ...
    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### 2. 添加分析任务队列
**现状**: 后台任务直接在 API 进程执行  
**建议**: 使用 Celery + Redis 任务队列，支持任务优先级和重试

```python
@celery_app.task(bind=True, max_retries=3)
def run_comparison_analysis_task(self, project_id: str):
    # 独立 worker 执行
    pass
```

#### 3. 优化数据库查询
**现状**: 每个产品单独查询 5W 和洞察数据  
**建议**: 批量查询 + 预加载

```python
# 当前
for item in project.items:
    data = await self._fetch_product_data(item)

# 优化后
product_ids = [item.product_id for item in project.items]
all_data = await self._fetch_products_data_batch(product_ids)
```

### 8.2 🟡 中优先级

#### 4. Prompt 优化 - 减少 token 消耗
**现状**: 每个产品分析约消耗 3000-4000 tokens  
**建议**: 
- 使用更简洁的 prompt 模板
- 只传递必要的统计字段
- 考虑使用 JSON Schema 约束输出

#### 5. 添加分析历史版本
**现状**: 每次重新分析覆盖旧结果  
**建议**: 保留历史版本，支持对比和回滚

```sql
CREATE TABLE analysis_versions (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES analysis_projects(id),
    version INT,
    result_content JSONB,
    created_at TIMESTAMP
);
```

#### 6. 前端虚拟滚动
**现状**: 所有维度一次性渲染  
**建议**: 对于大量标签使用虚拟滚动

```typescript
import { VirtualizedList } from 'react-virtualized';
// 只渲染可见区域的标签
```

### 8.3 🟢 低优先级

#### 7. 支持自定义维度权重
**建议**: 允许用户调整各维度的重要性权重

#### 8. 添加导出功能
**建议**: 支持导出为 PDF/Excel 报告

#### 9. 多语言支持
**建议**: Prompt 和输出支持英文/日文等

---

## 九、监控与告警

### 建议添加的监控指标

```python
# Prometheus 指标示例
analysis_duration = Histogram(
    'analysis_duration_seconds',
    'Time spent on analysis',
    ['analysis_type', 'product_count']
)

analysis_failures = Counter(
    'analysis_failures_total',
    'Number of failed analyses',
    ['error_type']
)

ai_api_latency = Histogram(
    'ai_api_latency_seconds',
    'AI API response time',
    ['model', 'prompt_type']
)
```

### 关键告警

| 告警 | 阈值 | 处理 |
|------|------|------|
| 分析超时 | > 5 分钟 | 检查 AI API 状态 |
| 失败率 | > 10% | 检查数据质量/Prompt |
| 队列积压 | > 50 任务 | 扩容 worker |

---

## 十、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-01-01 | 初始版本，5W + 2 维度 |
| v1.1 | 2026-01-15 | 扩展至 10 维度 |
| v1.2 | 2026-01-22 | who 拆分为 buyer + user，共 11 维度 |
| v1.3 | 2026-01-22 | 添加智能推断（is_inferred）支持 |

---

## 附录：完整流程时序图

```
用户                前端                    后端API              AnalysisService          Qwen API
 │                   │                        │                        │                      │
 │  点击"新建对比"    │                        │                        │                      │
 │ ─────────────────>│                        │                        │                      │
 │                   │ POST /projects          │                        │                      │
 │                   │ ───────────────────────>│                        │                      │
 │                   │                        │ create_comparison_project()                   │
 │                   │                        │ ───────────────────────>│                      │
 │                   │                        │                        │ 保存项目到数据库        │
 │                   │                        │<───────────────────────│                      │
 │                   │ 返回 project_id        │                        │                      │
 │                   │<───────────────────────│                        │                      │
 │                   │                        │                        │                      │
 │                   │  跳转详情页 + 轮询状态   │                        │                      │
 │                   │ ═══════════════════════>│                        │                      │
 │                   │                        │                        │                      │
 │                   │                        │ [后台任务]              │                      │
 │                   │                        │ run_analysis()          │                      │
 │                   │                        │ ───────────────────────>│                      │
 │                   │                        │                        │                      │
 │                   │                        │                        │ 1. 获取产品数据        │
 │                   │                        │                        │ 2. 并行分析产品        │
 │                   │                        │                        │ ────────────────────>│
 │                   │                        │                        │      产品1分析        │
 │                   │                        │                        │<────────────────────│
 │                   │                        │                        │ ────────────────────>│
 │                   │                        │                        │      产品2分析        │
 │                   │                        │                        │<────────────────────│
 │                   │                        │                        │                      │
 │                   │                        │                        │ 3. 分批生成洞察        │
 │                   │                        │                        │ ────────────────────>│
 │                   │                        │                        │      批次1: 6W        │
 │                   │                        │                        │<────────────────────│
 │                   │                        │                        │ ────────────────────>│
 │                   │                        │                        │      批次2: 口碑      │
 │                   │                        │                        │<────────────────────│
 │                   │                        │                        │                      │
 │                   │                        │                        │ 4. 生成策略总结        │
 │                   │                        │                        │ ────────────────────>│
 │                   │                        │                        │<────────────────────│
 │                   │                        │                        │                      │
 │                   │                        │                        │ 5. 保存结果           │
 │                   │                        │<───────────────────────│                      │
 │                   │                        │                        │                      │
 │                   │ GET /projects/{id}     │                        │                      │
 │                   │ ───────────────────────>│                        │                      │
 │                   │ 返回 status=completed   │                        │                      │
 │                   │<───────────────────────│                        │                      │
 │                   │                        │                        │                      │
 │  查看分析结果      │                        │                        │                      │
 │<─────────────────│                        │                        │                      │
 │                   │                        │                        │                      │
```
