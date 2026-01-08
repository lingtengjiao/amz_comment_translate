# 对比分析模块 - 后端代码设计文档

> **版本**：v2.0 (N-Way Mutual Comparison)  
> **更新日期**：2026-01-07  
> **重大变更**：从"本品 vs 竞品 (1 vs N)"升级为"互为竞品 (N vs N)"上帝视角

## 📋 目录

1. [整体架构设计](#整体架构设计)
2. [核心设计原则](#核心设计原则)
3. [代码文件结构](#代码文件结构)
4. [数据模型层](#数据模型层)
5. [服务层](#服务层)
6. [API 路由层](#api-路由层)
7. [数据库迁移](#数据库迁移)
8. [关键流程说明](#关键流程说明)

---

## 整体架构设计

### 设计目标

对比分析模块旨在实现**高内聚、低耦合**的架构，将对比分析逻辑从产品数据中完全解耦，形成一个独立的分析项目管理系统。

### 核心理念变更 (v2.0)

| 维度 | v1.0 (旧) | v2.0 (新) |
|------|-----------|-----------|
| **角色定位** | 竞品分析师 | 第三方测评专家 (Consumer Reports) |
| **立场** | 帮"本品"找优势 | 完全中立，客观评测 |
| **输出风格** | "谁是赢家" | "各有特色的矩阵对比" |
| **role_label 作用** | 影响 Prompt 构建 | 仅作标记，不影响分析 |

### 核心概念

- **AnalysisProject（分析项目）**：组织一次特定的分析任务，如"2024新款 vs 竞品X 对比分析"
- **AnalysisProjectItem（项目明细）**：关联项目与产品，支持多对多关系，可标注产品角色（仅作标记）

### 架构分层

```
┌─────────────────────────────────────────┐
│         API 路由层 (analysis.py)        │  ← FastAPI 路由，处理 HTTP 请求
├─────────────────────────────────────────┤
│      服务层 (analysis_service.py)        │  ← 业务逻辑，数据聚合，AI 调用
├─────────────────────────────────────────┤
│      数据模型层 (analysis.py)            │  ← SQLAlchemy ORM 模型
├─────────────────────────────────────────┤
│      数据库层 (PostgreSQL)               │  ← 持久化存储
└─────────────────────────────────────────┘
```

---

## 核心设计原则

### 1. **完全解耦**

- `AnalysisProject` 和 `Product` 是两条平行线
- 不在 `Product` 表中添加对比相关字段
- 通过 `AnalysisProjectItem` 建立关联关系
- 即使产品被删除，历史分析报告仍可保留（通过快照机制）

### 2. **快照机制**

- `raw_data_snapshot` 字段存储对比时的原始聚合数据
- 保证历史报告的数据基准不变
- 即使产品后续有了新评论，历史报告的数据依然准确

### 3. **异步友好**

- 支持状态流转：`pending` → `processing` → `completed` / `failed`
- 使用 FastAPI `BackgroundTasks` 异步执行耗时操作
- 前端可通过轮询获取分析进度

### 4. **可扩展性**

- 支持多种分析类型（目前是 `comparison`，未来可扩展 `overall`、`trend` 等）
- 支持 2-5 个产品的对比分析
- 产品角色标签可自定义（target/competitor/gen1/gen2 等）

---

## 代码文件结构

### 涉及的核心文件

```
backend/
├── app/
│   ├── models/
│   │   ├── __init__.py              # 模型导出（包含 AnalysisProject）
│   │   └── analysis.py               # ⭐ 数据模型定义
│   ├── services/
│   │   └── analysis_service.py       # ⭐ 业务逻辑服务
│   ├── api/
│   │   └── analysis.py               # ⭐ API 路由定义
│   ├── db/
│   │   └── session.py                # 数据库会话（导入模型以注册）
│   └── main.py                       # ⭐ FastAPI 应用入口（注册路由）
│
└── db/
    └── migrate_analysis.sql          # ⭐ 数据库迁移脚本
```

---

## 数据模型层

### 文件：`backend/app/models/analysis.py`

#### 1. 枚举类型

```python
class AnalysisType(str, enum.Enum):
    """分析类型枚举"""
    COMPARISON = "comparison"  # 对比分析 (A vs B)
    # 未来可扩展: OVERALL, TREND

class AnalysisStatus(str, enum.Enum):
    """分析状态枚举"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
```

#### 2. AnalysisProject 模型

**核心字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `title` | String(255) | 项目标题 |
| `description` | Text | 项目描述（可选） |
| `analysis_type` | String(50) | 分析类型（默认 'comparison'） |
| `status` | String(50) | 状态（pending/processing/completed/failed） |
| `result_content` | JSONB | AI 生成的分析结论（JSON 格式） |
| `raw_data_snapshot` | JSONB | 原始聚合数据快照 |
| `error_message` | Text | 错误信息（如果失败） |
| `created_at` | DateTime | 创建时间 |
| `updated_at` | DateTime | 更新时间 |

**关系：**
- `items`: 一对多关系，关联到 `AnalysisProjectItem`

**关键方法：**
- `to_dict()`: 转换为字典格式，用于 API 响应

#### 3. AnalysisProjectItem 模型

**核心字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `project_id` | UUID | 关联的分析项目 ID（外键，级联删除） |
| `product_id` | UUID | 关联的产品 ID（外键，级联删除） |
| `role_label` | String(50) | 产品角色标签（target/competitor/gen1/gen2） |
| `display_order` | Integer | 显示顺序（用于前端排序） |
| `created_at` | DateTime | 创建时间 |

**关系：**
- `project`: 多对一关系，关联到 `AnalysisProject`
- `product`: 多对一关系，关联到 `Product`

**关键方法：**
- `to_dict()`: 转换为字典格式，包含产品详情

### 文件：`backend/app/models/__init__.py`

**作用：** 导出所有模型，确保 SQLAlchemy 能够识别并创建表

```python
from app.models.analysis import AnalysisProject, AnalysisProjectItem, AnalysisType, AnalysisStatus

__all__ = [
    # ... 其他模型
    "AnalysisProject",
    "AnalysisProjectItem",
    "AnalysisType",
    "AnalysisStatus"
]
```

### 文件：`backend/app/db/session.py`

**作用：** 数据库会话管理，导入模型以确保表创建

```python
async def init_db():
    from app.models import Product, Review, Task, AnalysisProject, AnalysisProjectItem
    # 创建所有表
    await conn.run_sync(Base.metadata.create_all)
```

---

## 服务层

### 文件：`backend/app/services/analysis_service.py`

#### 核心职责

1. **项目管理**：创建、查询、删除分析项目
2. **并行数据聚合**：使用 `asyncio.gather` 并行聚合多个产品的评论数据
3. **AI 调用**：构建中立视角的 Prompt，调用 AI 生成横向评测报告
4. **结果持久化**：保存分析结果和原始数据快照

#### 关键类：`AnalysisService`

**初始化：**
```python
def __init__(self, db: AsyncSession):
    self.db = db
    self.summary_service = SummaryService(db)  # 复用聚合能力
```

**核心方法：**

##### 1. `create_comparison_project()`

**功能：** 创建对比分析项目

**参数：**
- `title`: 项目标题
- `product_ids`: 产品 ID 列表（2-5 个）
- `description`: 项目描述（可选）
- `role_labels`: 产品角色标签列表（可选，**仅作标记，不影响分析**）

**流程：**
1. 验证产品数量（2-5 个）
2. 验证产品是否存在
3. 创建 `AnalysisProject` 记录
4. 为每个产品创建 `AnalysisProjectItem` 记录
5. 提交事务并返回项目对象

##### 2. `run_analysis()` (v2.0 重构)

**功能：** 执行 N-Way 对比分析任务（耗时操作）

**v2.0 关键变更：**
- 使用 `asyncio.gather` 并行获取数据（性能提升 5x）
- 使用 `asyncio.to_thread` 异步调用 AI（避免阻塞事件循环）
- 使用 `MUTUAL_COMPETITOR_PROMPT` 中立视角 Prompt

**流程：**
1. 加载项目和关联产品
2. **并行聚合每个产品的数据** (`asyncio.gather`)：
   ```python
   tasks = []
   for item in project.items:
       tasks.append(self._fetch_product_data(item))
   results = await asyncio.gather(*tasks)
   ```
3. **保存原始数据快照**到 `raw_data_snapshot`
4. **构建 N-Way Prompt**：
   - 使用 `MUTUAL_COMPETITOR_PROMPT` 模板
   - 传入产品数量、统计数据、产品列表
5. **异步调用 AI 生成报告**：
   ```python
   response = await asyncio.to_thread(
       translation_service.client.chat.completions.create,
       ...
   )
   ```
6. **保存结果**：
   - 更新 `result_content` 字段
   - 更新 `status` 为 `completed` 或 `failed`

##### 3. `_fetch_product_data()` (新增)

**功能：** 异步获取单个产品的聚合数据

**返回结构：**
```python
{
    "name": "产品名称 (ASIN后4位)",
    "asin": "B0XXXXXXXX",
    "data": {
        "user_context": {...},
        "key_insights": {...}
    }
}
```

##### 4. `_simplify_stats()` (v2.0 优化)

**功能：** 数据瘦身，减少 Token 消耗

**v2.0 变更：**
- 只取 Top 6（原来是 Top 5）
- 使用更语义化的字段名：`label`/`count`/`rate`
- 直接格式化百分比：`"rate": "10%"`

##### 5. `get_comparison_preview()`

**功能：** 获取对比预览数据（不调用 AI）

**返回：**
```json
{
  "success": true,
  "products": {
    "product_id_1": {
      "product": {...},
      "total_reviews": 1000,
      "ready": true
    }
  },
  "can_compare": true
}
```

#### Prompt 模板：`MUTUAL_COMPETITOR_PROMPT` (v2.0)

**位置：** `backend/app/services/analysis_service.py` 第 42-112 行

**角色定位：** 公正的第三方产品评测专家（类似 Consumer Reports）

**7 大输出模块：**

| 模块 | JSON Key | 说明 |
|------|----------|------|
| 总体评判 | `overview_verdict` | 市场全景总结（综合机皇/性价比之选/偏科生） |
| 维度对比矩阵 | `feature_matrix` | N 产品横向打分表，含 rankings 数组 |
| 人群场景差异 | `audience_diff` | **必须包含百分比(%)数据** |
| SWOT 对比 | `swot_comparison` | Key 为产品名称（动态） |
| 口碑热词对比 | `sentiment_comparison` | 正负面主题对比 |
| 行动建议 | `actionable_advice` | 5 条建议，含 rationale |
| 购买结论 | `final_conclusion` | 场景化选购指南 |

**feature_matrix 新结构示例：**
```json
{
  "dimension": "电池续航",
  "weight": "高",
  "rankings": [
    { "product_name": "产品A", "score": 90, "reason": "续航超预期" },
    { "product_name": "产品B", "score": 60, "reason": "需一天两充" }
  ],
  "summary": "产品A具有压倒性优势"
}
```

---

## API 路由层

### 文件：`backend/app/api/analysis.py`

#### 路由前缀

```python
router = APIRouter(prefix="/analysis", tags=["Analysis"])
```

#### Pydantic Schemas

##### 请求模型

- `ProductItemInput`: 产品输入项（包含 product_id 和 role_label）
- `CreateComparisonRequest`: 创建对比分析请求
- `ComparisonPreviewRequest`: 对比预览请求

##### 响应模型

- `AnalysisProjectItemResponse`: 分析项目产品项响应
- `AnalysisProjectResponse`: 分析项目响应
- `AnalysisProjectListResponse`: 项目列表响应
- `CreateAnalysisResponse`: 创建分析响应
- `RunAnalysisResponse`: 触发分析响应
- `ComparisonPreviewResponse`: 对比预览响应

#### API 端点

##### 1. `POST /api/v1/analysis/projects`

**功能：** 创建对比分析项目

**请求体：**
```json
{
  "title": "2024新款 vs 竞品X 对比分析",
  "description": "对比分析我们的新款产品与主要竞品的用户口碑差异",
  "products": [
    {"product_id": "uuid-1", "role_label": "target"},
    {"product_id": "uuid-2", "role_label": "competitor"}
  ]
}
```

**查询参数：**
- `auto_run` (bool, 默认 true): 是否自动触发分析

**流程：**
1. 调用 `AnalysisService.create_comparison_project()`
2. 如果 `auto_run=true`，添加后台任务 `_run_analysis_background()`
3. 返回项目信息

##### 2. `GET /api/v1/analysis/projects`

**功能：** 获取分析项目列表

**查询参数：**
- `limit` (int, 默认 20): 每页数量
- `offset` (int, 默认 0): 偏移量
- `status` (str, 可选): 按状态筛选

**返回：** 项目列表（按创建时间倒序）

##### 3. `GET /api/v1/analysis/projects/{project_id}`

**功能：** 获取项目详情

**返回：** 包含完整的分析结果、原始数据快照、关联产品信息

##### 4. `POST /api/v1/analysis/projects/{project_id}/run`

**功能：** 手动触发分析任务

**用途：** 如果项目状态为 `pending` 或 `failed`，可以重新触发

**流程：**
1. 检查项目状态
2. 重置状态为 `pending`
3. 添加后台任务执行分析

##### 5. `DELETE /api/v1/analysis/projects/{project_id}`

**功能：** 删除分析项目

**注意：** 级联删除关联的项目明细

##### 6. `POST /api/v1/analysis/preview`

**功能：** 获取对比预览数据

**请求体：**
```json
{
  "product_ids": ["uuid-1", "uuid-2"]
}
```

**返回：** 各产品的聚合统计数据（不调用 AI）

#### 后台任务：`_run_analysis_background()`

**关键点：**
- **不能直接传递 `db` session**，因为 `BackgroundTasks` 无法传递异步对象
- 在后台任务中**重新创建数据库会话**：
  ```python
  async with async_session_maker() as db:
      service = AnalysisService(db)
      await service.run_analysis(project_id)
  ```
- 处理异常并更新项目状态为 `failed`

### 文件：`backend/app/main.py`

**作用：** 注册分析路由到 FastAPI 应用

```python
from app.api.analysis import router as analysis_router

app.include_router(analysis_router, prefix="/api/v1")
```

---

## 数据库迁移

### 文件：`db/migrate_analysis.sql`

#### 表结构

##### 1. `analysis_projects` 表

```sql
CREATE TABLE IF NOT EXISTS analysis_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    analysis_type VARCHAR(50) DEFAULT 'comparison',
    status VARCHAR(50) DEFAULT 'pending',
    result_content JSONB,
    raw_data_snapshot JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);
```

##### 2. `analysis_project_items` 表

```sql
CREATE TABLE IF NOT EXISTS analysis_project_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    role_label VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 索引

- `idx_analysis_project_created`: 按创建时间倒序查询
- `idx_analysis_project_status`: 按状态筛选
- `idx_analysis_project_type`: 按类型筛选
- `idx_analysis_item_project`: 按项目ID查询明细
- `idx_analysis_item_product`: 按产品ID查询关联的分析项目

#### 注释

SQL 文件包含详细的表和字段注释，说明各字段的用途和可选值。

---

## 关键流程说明

### 创建并执行对比分析的完整流程

```
1. 前端调用 POST /api/v1/analysis/projects
   ↓
2. API 路由层接收请求，调用 AnalysisService.create_comparison_project()
   ↓
3. 服务层创建 AnalysisProject 和 AnalysisProjectItem 记录
   ↓
4. 如果 auto_run=true，添加后台任务 _run_analysis_background()
   ↓
5. 后台任务执行：
   a. 加载项目和关联产品
   b. 并行聚合每个产品的数据（复用 SummaryService）
   c. 保存原始数据快照到 raw_data_snapshot
   d. 构建对比分析 Prompt
   e. 调用 AI 生成报告
   f. 解析 JSON 响应
   g. 更新 result_content 和 status
   ↓
6. 前端轮询 GET /api/v1/analysis/projects/{project_id} 获取结果
```

### 数据流转

```
Product (产品表)
    ↓ (通过 AnalysisProjectItem 关联)
AnalysisProject (分析项目)
    ├── raw_data_snapshot (原始数据快照)
    │   └── 各产品的聚合统计数据
    └── result_content (AI 生成的分析结果)
        ├── overview_verdict
        ├── feature_matrix
        ├── audience_diff
        ├── swot_comparison
        ├── sentiment_comparison
        ├── actionable_advice
        └── final_conclusion
```

---

## 依赖关系

### 内部依赖

- `app.services.summary_service.SummaryService`: 复用数据聚合能力
- `app.services.translation.translation_service`: 调用 AI 生成报告
- `app.models.product.Product`: 关联产品信息

### 外部依赖

- **FastAPI**: Web 框架
- **SQLAlchemy**: ORM 框架
- **PostgreSQL**: 数据库（使用 JSONB 存储结构化数据）
- **Qwen LLM**: AI 模型（通过 translation_service）

---

## 扩展性设计

### 未来可扩展的功能

1. **更多分析类型**：
   - `overall`: 整体/系列分析
   - `trend`: 趋势分析
   - `sentiment_tracking`: 情感追踪

2. **更多产品支持**：
   - 目前支持 2-5 个产品
   - 可扩展支持更多产品（需要优化 Prompt 和 Token 限制）

3. **分析模板**：
   - 不同行业/场景的分析模板
   - 自定义 Prompt 模板

4. **历史对比**：
   - 同一产品不同时间段的对比
   - 版本迭代对比（gen1 vs gen2）

---

## 总结

对比分析模块通过**完全解耦**的设计，实现了：

✅ **高内聚**：所有对比分析逻辑集中在 `AnalysisService`  
✅ **低耦合**：与产品数据完全独立，通过关联表建立关系  
✅ **可追溯**：快照机制保证历史数据准确性  
✅ **异步友好**：支持后台任务和状态流转  
✅ **可扩展**：支持多种分析类型和产品角色  

这种设计使得对比分析模块既能独立运行，又能与现有系统无缝集成，为未来的功能扩展奠定了良好的基础。

