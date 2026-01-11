# 🚀 6 队列 + 5 Worker 职能化架构

> **设计目标**：4核16G 服务器，354 并发 API，支持百人同时采集  
> **核心优化**：物理隔离队列 + 职能化 Worker 分工，解决翻译阻塞分析问题  
> **QPS 限制**：千问 API 20-30 QPS，通过限流和退避策略防止账号被封

---

## 📊 架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           用户请求 / 插件上传                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FastAPI Backend                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
    ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
    ▼             ▼             ▼             ▼             ▼             │
┌─────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ 🏎️ Base │ │ 🌟 VIP  │ │ 🔄 Trans    │ │ 🔍 Insight  │ │ 🏷️ Theme   │   │
│         │ │         │ │             │ │             │ │             │   │
│ingestion│ │learning │ │translation  │ │insight_extr.│ │theme_extr.  │   │
│ reports │ │         │ │             │ │ learning    │ │ learning    │   │
└────┬────┘ └────┬────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │
     │           │             │               │               │          │
     ▼           ▼             ▼               ▼               ▼          │
┌─────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│worker-  │ │worker-  │ │worker-      │ │worker-      │ │worker-      │   │
│base     │ │vip      │ │trans        │ │insight      │ │theme        │   │
│Prefork,4│ │Gevent,50│ │Gevent,100   │ │Gevent,100   │ │Gevent,100   │   │
│+Beat    │ │         │ │             │ │+闲时建模    │ │+闲时建模    │   │
└─────────┘ └─────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
                                    │                                      │
                                    ▼                                      │
                        ┌───────────────────────┐                         │
                        │  🚦 全局 API 限流器    │◀────────────────────────┘
                        │  Max QPS: 25          │
                        │  滑动窗口计数          │
                        └───────────────────────┘
                                    
                    总并发：4 + 50 + 100 + 100 + 100 = 354 并发 API！
                    实际 QPS：25（通过限流器控制）
```

---

## 🎯 6 队列职能说明

| 队列 | 职责 | 响应要求 | 所属 Worker |
|------|------|----------|-------------|
| `ingestion` | 入库任务 | **秒回** | worker-base |
| `learning` | 维度学习/5W建模 | **VIP 快车道** | worker-vip, worker-insight, worker-theme |
| `translation` | 评论翻译 | 独立处理 | worker-trans |
| `insight_extraction` | 洞察提取 | 专属处理 | worker-insight |
| `theme_extraction` | 主题提取 | 专属处理 | worker-theme |
| `reports` | 报告生成 | 秒回 | worker-base |

---

## 👷 5 Worker 职能分工

| Worker | 监听队列 | 模式 | 并发 | 内存 | 核心职责 |
|--------|----------|------|------|------|----------|
| **worker-base** | ingestion, reports, celery | Prefork | 4 | 1G | 死守入库，不接 AI 活 |
| **worker-vip** | learning | Gevent | 50 | 1G | VIP 快车道，建模开关 |
| **worker-trans** | translation | Gevent | 100 | 1.5G | 独立翻译，不阻塞分析 |
| **worker-insight** | insight_extraction, learning | Gevent | 100 | 1.5G | 洞察专员，闲时建模 |
| **worker-theme** | theme_extraction, learning | Gevent | 100 | 1.5G | 主题专员，闲时建模 |

**总计：354 并发，6.5G 内存（16G 服务器可承受）**

---

## 🎯 核心优势

### 1. 翻译不再是屏障

**问题**：原来翻译和分析共享 Worker，翻译量大时阻塞洞察/主题提取

**解决**：`worker-trans` 专属翻译队列，与分析完全隔离

```
原来：
翻译任务 ─┐
洞察任务 ─┼─→ worker-heavy ─→ 阻塞！
主题任务 ─┘

现在：
翻译任务 ───→ worker-trans   ─→ 独立处理
洞察任务 ───→ worker-insight ─→ 专属处理
主题任务 ───→ worker-theme   ─→ 专属处理
```

### 2. 建模永远优先

**设计**：3 个 AI Worker 都支援 `learning` 队列

```
worker-vip     → learning（专属）
worker-insight → insight_extraction, learning（闲时支援）
worker-theme   → theme_extraction, learning（闲时支援）
```

**效果**：新产品建模任务永远有 Worker 响应

### 3. 洞察/主题并行

**设计**：拆分 `analysis` 为 `insight_extraction` 和 `theme_extraction`

**效果**：洞察和主题可以真正并行处理，互不阻塞

---

## 🚀 批量翻译优化（10 倍效率提升）

### 核心策略

**问题**：单条翻译模式下，100 条评论 = 100 次 API 调用 = 消耗 100 QPS

**解决方案**：🎯 智能分类批量翻译 - 根据评论长度和质量差异化处理

---

### 🎯 评论分类标准（ReviewClassifier）

| 分类 | 条件 | 批量大小 | 策略 |
|------|------|----------|------|
| **VIP 评论** | 字数 > 200<br>或（极端星级 1/5星 且 字数 > 100） | **1 条/批** | 单独翻译，保证质量 |
| **标准评论** | 50 < 字数 ≤ 200 | **5 条/批** | 平衡质量和效率 |
| **短评论** | 字数 ≤ 50 | **20 条/批** | 最大化效率 |

```python
class ReviewClassifier:
    """评论智能分类器"""
    
    # 可配置的分类阈值
    VIP_LENGTH_THRESHOLD = 200
    VIP_EXTREME_RATING_LENGTH = 100
    EXTREME_RATINGS = [1, 5]
    
    BATCH_SIZE_VIP = 1       # VIP：单独翻译
    BATCH_SIZE_STANDARD = 5  # 标准：5条一批
    BATCH_SIZE_SHORT = 20    # 短评：20条一批
    
    @classmethod
    def classify(cls, review) -> str:
        """
        评论分类
        Returns: 'vip' | 'standard' | 'short'
        """
        text_length = len(review.body_original or "")
        
        # VIP 评论
        if text_length > cls.VIP_LENGTH_THRESHOLD:
            return 'vip'
        if text_length > cls.VIP_EXTREME_RATING_LENGTH and review.rating in cls.EXTREME_RATINGS:
            return 'vip'
        
        # 短评论
        if text_length <= cls.SHORT_MAX_LENGTH:
            return 'short'
        
        # 标准评论
        return 'standard'
```

---

### 🔄 Worker 翻译流程

```python
# 1. 获取待翻译评论（100 条）
pending_reviews = db.query(Review).filter(...).limit(100)

# 2. 按分类分组
grouped_reviews = ReviewClassifier.group_reviews(pending_reviews)
# {
#   'vip': [10条长评论],
#   'standard': [30条中等评论],
#   'short': [60条短评论]
# }

# 3. 分别处理（优先级：短 → 标准 → VIP）
for category in ['short', 'standard', 'vip']:
    batch_size = ReviewClassifier.get_batch_size(category)
    
    # VIP：单独翻译
    if batch_size == 1:
        translated = translation_service.translate_text(review.body_original)
    
    # 标准/短评：批量翻译
    else:
        batch_results = translation_service.translate_batch_with_fallback(batch_input)
```

---

### 📊 效率对比（100 条评论示例）

假设评论分布：
- 10% VIP 评论（10条，>200字）
- 30% 标准评论（30条，50-200字）
- 60% 短评论（60条，≤50字）

| 指标 | 单条模式（优化前） | 固定批量（10条） | 智能分类（差异化） | 提升 |
|------|-------------------|-----------------|------------------|------|
| API 调用次数 | 100 次 | 10 次 | **19 次**<br>(10+6+3) | **5.3x** |
| QPS 消耗 | 100 QPS | 10 QPS | **19 QPS** | **5.3x** |
| VIP 评论质量 | ⭐⭐⭐ | ⭐⭐ (降低) | **⭐⭐⭐** (保证) | ✅ |
| 短评论效率 | 低 | 中 | **极高** (20条/批) | ✅ |
| 翻译时间 | ~5 分钟 | ~1 分钟 | **~1.2 分钟** | **4x** |

**核心优势：**
1. ✅ **质量保证**：重要长评论单独翻译，不降低质量
2. ✅ **效率最大化**：短评论 20 条一批，QPS 消耗降低 20 倍
3. ✅ **灵活平衡**：中等评论 5 条一批，兼顾质量和效率
4. ✅ **自适应**：根据评论实际分布动态调整

---

### 🎨 Prompt 设计

#### 1. VIP 评论（单独翻译）

使用完整的 Few-Shot System Prompt：

```python
TRANSLATION_SYSTEM_PROMPT = """你是一位精通中美文化差异的资深亚马逊跨境电商翻译专家。

### 核心规则
1. **拒绝翻译腔**: 不要逐字翻译
2. **术语精准**: "DOA" -> "到手即坏"
3. **情感对齐**: 1星评论要体现愤怒，5星要体现兴奋

### 参考范例
Input: "Total lemon. Stopped working after 2 days."
Output: "简直是个次品！用了两天就坏了。"
```

#### 2. 标准/短评论（批量翻译）

使用批量翻译 Prompt：

```python
BATCH_TRANSLATION_SYSTEM_PROMPT = """你是一位翻译专家。请翻译以下多条评论。

输入格式：{"r1": "original 1", "r2": "original 2", ...}
输出要求：
- 返回 JSON 字典，键与输入一致
- 值为翻译后的中文
- 使用电商翻译风格
- **只返回 JSON，不要添加任何解释**
```

---

### 📈 实时监控（Flower）

在 Flower 监控面板（`http://localhost:5555`）可以看到：

#### Tasks 页面

搜索 `task_ingest_translation_only`，查看日志：

```
[智能翻译] 📊 评论分类: VIP=8 | 标准=32 | 短评=60
[智能翻译] 🚀 处理 short 类评论: 60 条，批量大小=20
[智能翻译] short 批次翻译完成: 20/20 条
[智能翻译] 🚀 处理 standard 类评论: 32 条，批量大小=5
[智能翻译] 🚀 处理 vip 类评论: 8 条，批量大小=1
[智能翻译] ✅ 完成: 总计 100 条成功
  📊 VIP 评论: 8/8 条
  📊 标准评论: 32/32 条
  📊 短评论: 60/60 条
```

---

### ⚙️ 配置调优

如果需要调整分类阈值，修改 `backend/app/worker.py`：

```python
class ReviewClassifier:
    # 调整 VIP 评论阈值
    VIP_LENGTH_THRESHOLD = 250  # 从 200 调到 250
    
    # 调整批量大小
    BATCH_SIZE_SHORT = 30  # 从 20 调到 30（更激进）
    BATCH_SIZE_STANDARD = 3  # 从 5 调到 3（更保守）
```

---

## 🚦 QPS 限流与防封策略

### A. 全局 API 限流器

**问题**：404 并发瞬间开火会导致 QPS 冲到 400，远超千问 API 的 20-30 QPS 限制，导致账号被封。

**解决方案**：全局 API 限流器

```python
class APIRateLimiter:
    """
    全局 API 限流器，防止瞬间 QPS 冲高
    
    策略：
    - 使用 Redis 滑动窗口计数
    - 最大 QPS = 25（千问 API 限制 20-30 QPS）
    - 超过限制时，随机退避 0.1-0.5 秒
    """
    def __init__(self, redis_client, max_qps=25, window_seconds=1):
        self.redis_client = redis_client
        self.max_qps = max_qps
        self.window_seconds = window_seconds
    
    def acquire(self, api_name="qwen"):
        """获取 API 调用许可"""
        # 检查当前窗口内的请求数
        if current_count >= self.max_qps:
            # 超过限制，随机退避
            backoff = random.uniform(0.1, 0.5)
            time.sleep(backoff)
            return False
        
        # 记录本次请求
        return True
```

**使用装饰器**：

```python
@rate_limited_api("qwen")
def call_qwen_api():
    ...
```

### B. 任务启动随机延迟（防止 Worker 重启瞬间冲高）

| Worker | 启动延迟 | 原因 |
|--------|----------|------|
| worker-learning (VIP) | 0.1-0.5秒 | 快车道，更小延迟，优先抢占配额 |
| worker-heavy (翻译/分析) | 0.2-1.0秒 | 慢车道，更大延迟，避免瞬间冲高 |

**实现**：

```python
# VIP 快车道（worker-learning）
startup_delay = random.uniform(0.1, 0.5)
time.sleep(startup_delay)

# 慢车道（worker-heavy）
startup_delay = random.uniform(0.2, 1.0)
time.sleep(startup_delay)
```

### C. VIP 快车道优先级策略

**优势**：worker-learning (100协程) 优先抢占 20-30 QPS 的配额

**策略**：
1. **更小的启动延迟**：0.1-0.5秒（慢车道是 0.2-1.0秒）
2. **更激进的重试**：当 API 报错 429 时，重试频率更高
3. **独立队列**：不与翻译/分析任务竞争

**效果**：即使 API 返回 429，VIP Worker 也能因为重试频率更高而更容易抢到下一个可用的 API 调用槽位。

---

## 📋 5 独立队列

| 队列 | 用途 | Worker | 特点 |
|------|------|--------|------|
| `ingestion` | 数据入库 | worker-base | 流式写入，秒级响应 |
| `reports` | 报告生成 | worker-base | 报告组装，秒级响应 |
| `learning` | 学习维度/5W | worker-learning + heavy | VIP 快车道 + 备份 |
| `translation` | 评论翻译 | worker-heavy | 高并发 API + 限流 |
| `analysis` | 洞察 + 主题 | worker-heavy | 高并发 API + 限流 |

---

## 👷 4 Worker 配置

### Worker 1: 基础响应员 (Base Worker)

```yaml
worker-base:
  command: celery -A app.worker worker --beat --loglevel=info --concurrency=4 -Q ingestion,reports,celery -n base@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | Prefork | 默认多进程模式 |
| 并发数 | 4 | 4 线程 |
| 队列 | ingestion, reports, celery | 快速响应队列 |
| 附加 | --beat | 运行定时任务调度器 |
| 内存 | 1GB | 轻量级任务 |
| 限流 | 无 | 不调用 AI API |

**职责**：
- ✅ 流式数据写入（插件上传不等待）
- ✅ 报告组装（用户不等待）
- ✅ Celery Beat 定时任务

### Worker 2: VIP 建模员 (Vanguard/Learning)

```yaml
worker-learning:
  command: celery -A app.worker worker --loglevel=info --pool=gevent --concurrency=100 -Q learning -n learning@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | **Gevent** | 协程模式 |
| 并发数 | 100 | 100 协程 |
| 队列 | learning | VIP 快车道 |
| 内存 | 2GB | AI 任务需要更多内存 |
| 启动延迟 | **0.1-0.5秒** | 更小延迟，优先抢占 |
| 限流 | 全局限流器 | Max QPS 25 |

**职责**：
- ✅ 新产品秒级建模（维度发现 + 5W）
- ✅ 独立进程，不受翻译/分析干扰
- ✅ VIP 快车道，优先抢占 API 配额

### Worker 3 & 4: AI 吞吐主力 (Heavy Lifters)

```yaml
worker-heavy-1/2:
  command: celery -A app.worker worker --loglevel=info --pool=gevent --concurrency=150 -Q learning,translation,analysis -n heavy1/2@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | **Gevent** | 协程模式 |
| 并发数 | 150 × 2 = **300** | 超高并发 |
| 队列 | learning, translation, analysis | AI 任务 |
| 内存 | 2GB × 2 | 4GB 总计 |
| 启动延迟 | **0.2-1.0秒** | 更大延迟，避免冲高 |
| 限流 | 全局限流器 | Max QPS 25 |

**职责**：
- ✅ 翻译 + 洞察 + 主题提取
- ✅ 300 并发 API 请求（实际 QPS 受限流器控制）
- ✅ learning 队列作为 VIP Worker 的备份

---

## 📈 硬件资源分配 (Memory Map)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     4核16G 服务器资源分配                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PostgreSQL              ████████████████░░░░  4GB + 1GB 额外 = 5GB    │
│     shared_buffers=4GB                                                  │
│     work_mem=64MB                                                       │
│     max_connections=500                                                 │
│                                                                         │
│   Redis                   ████████░░░░░░░░░░░░  2GB                     │
│     maxmemory=2GB                                                       │
│     maxmemory-policy=allkeys-lru                                        │
│                                                                         │
│   worker-base             ████░░░░░░░░░░░░░░░░  1GB                     │
│   worker-learning         ████████░░░░░░░░░░░░  2GB                     │
│   worker-heavy-1          ████████░░░░░░░░░░░░  2GB                     │
│   worker-heavy-2          ████████░░░░░░░░░░░░  2GB                     │
│                                                                         │
│   FastAPI + Nginx         ████░░░░░░░░░░░░░░░░  1GB                     │
│   操作系统                ████░░░░░░░░░░░░░░░░  1GB                     │
│                                                                         │
│   总计：5 + 2 + 1 + 2 + 2 + 2 + 1 + 1 = 16GB ✅                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 任务路由配置

```python
# backend/app/worker.py

task_routes={
    # ============== 快车道：入库 + 报告 (worker-base) ==============
    "app.worker.task_process_ingestion_queue": {"queue": "ingestion"},
    "app.worker.task_check_pending_translations": {"queue": "ingestion"},
    "app.worker.task_generate_report": {"queue": "reports"},
    
    # ============== VIP 快车道：学习建模 (worker-learning) ==============
    "app.worker.task_full_auto_analysis": {"queue": "learning"},
    "app.worker.task_scientific_learning_and_analysis": {"queue": "learning"},
    
    # ============== 慢车道：翻译 + 分析 (worker-heavy × 2) ==============
    "app.worker.task_translate_bullet_points": {"queue": "translation"},
    "app.worker.task_process_reviews": {"queue": "translation"},
    "app.worker.task_ingest_translation_only": {"queue": "translation"},
    "app.worker.task_extract_insights": {"queue": "analysis"},
    "app.worker.task_extract_themes": {"queue": "analysis"},
}
```

---

## ⏰ Celery Beat 定时任务

| 任务 | 间隔 | 队列 | 说明 |
|------|------|------|------|
| `process-ingestion-queue` | 5秒 | ingestion | 消费 Redis 队列，入库到 PostgreSQL |
| `check-pending-translations` | 15秒 | ingestion | 检查待翻译评论，触发翻译任务 |

---

## 🗄️ 数据库优化配置

### PostgreSQL (16GB 服务器优化)

```yaml
command: >
  postgres
  -c shared_buffers=4GB          # 缓存热门数据
  -c work_mem=64MB               # 加快复杂查询排序
  -c max_connections=500         # 支持多 Worker 连接
  -c effective_cache_size=8GB    # 告诉优化器系统有多少缓存
  -c maintenance_work_mem=512MB  # 加快索引创建/VACUUM
  -c checkpoint_completion_target=0.9
  -c wal_buffers=64MB
  -c random_page_cost=1.1        # SSD 优化
```

### Redis (队列缓冲区 + 限流计数)

```yaml
command: >
  redis-server
  --maxmemory 2gb                # 最大 2GB 内存
  --maxmemory-policy allkeys-lru # LRU 淘汰策略
  --appendonly yes               # 持久化
  --appendfsync everysec         # 每秒同步
```

### SQLAlchemy 连接池（支持 400+ 并发）

**问题**：默认连接池 `pool_size=5` 无法支撑 404 并发 Worker

**解决方案**：

```python
# backend/app/worker.py（Celery Worker 同步连接）
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    poolclass=QueuePool,
    pool_size=100,        # 基础连接数
    max_overflow=400,     # 溢出连接数（总共 500）
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,    # 30 分钟回收
)

# backend/app/db/session.py（FastAPI 异步连接）
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=50,         # 基础连接数
    max_overflow=100,     # 溢出连接数（总共 150）
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)
```

**连接分配**：

| 组件 | pool_size | max_overflow | 总计 |
|------|-----------|--------------|------|
| Celery Workers | 100 | 400 | 500 |
| FastAPI | 50 | 100 | 150 |
| PostgreSQL max_connections | - | - | 500 |

---

## 📊 监控命令

### 查看队列长度
```bash
docker exec voc-redis redis-cli LLEN ingestion
docker exec voc-redis redis-cli LLEN reports
docker exec voc-redis redis-cli LLEN learning
docker exec voc-redis redis-cli LLEN translation
docker exec voc-redis redis-cli LLEN analysis
```

### 查看 API 限流状态
```bash
# 查看当前 QPS
docker exec voc-redis redis-cli ZCARD "api_rate_limit:qwen"
```

### 查看活跃任务
```bash
docker exec voc-worker-base celery -A app.worker inspect active
docker exec voc-worker-learning celery -A app.worker inspect active
docker exec voc-worker-heavy-1 celery -A app.worker inspect active
```

### 查看 Worker 监听的队列
```bash
docker exec voc-worker-base celery -A app.worker inspect active_queues
```

---

## 🎯 效果总结

| 场景 | 效果 |
|------|------|
| 新用户上传数据 | ✅ 秒级入库，worker-base 独立处理 |
| 新产品学习维度 | ✅ 秒级建模，worker-learning VIP 快车道（0.1-0.5s 延迟）|
| 用户生成报告 | ✅ 秒级响应，worker-base 独立处理 |
| 后台 10 万条评论翻译中 | ✅ worker-heavy 300 并发（实际 QPS 25）|
| 100 用户同时采集 | ✅ 404 并发任务，限流器控制 QPS 25 |
| Worker 重启 | ✅ 随机延迟启动，避免瞬间冲高 QPS |
| 千问 API 429 | ✅ VIP Worker 优先抢占下一个可用槽位 |

---

## 🔥 关键优势

1. **快车道保障**：独立的 `learning` Worker 确保建模不排队
2. **QPS 限流**：全局限流器防止账号被封，Max QPS 25
3. **启动保护**：随机延迟启动，避免 Worker 重启瞬间冲高
4. **VIP 优先**：更小延迟 + 更激进重试，优先抢占 API 配额
5. **吞吐量**：合计超过 400 的并发处理能力
6. **写入安全**：4GB 数据库缓冲 + 2GB Redis 确保众包采集稳如泰山
7. **公共数据资产**：一次分析，多次读取，数据库索引全部载入内存

---

## 📝 依赖

```
# backend/requirements.txt
gevent==24.2.1  # Celery 协程池，支持高并发 I/O 密集任务
tenacity==8.2.3 # 重试逻辑
```

---

*更新时间：2026-01-10*

---

## 🎯 设计理念

### 为什么需要 4 Worker？

在 16GB 内存的"小豪华"配置下，系统瓶颈不再是内存，而是 **AI API 的 QPS 限制**。

**策略**：用充裕的内存撑起超高并发的协程（Gevent），同时给数据库预留足够的缓存空间。

| Worker | 角色 | 特点 |
|--------|------|------|
| worker-base | 基础响应员 | 纯 CPU + 磁盘，保证 API 永远不卡 |
| worker-learning | VIP 建模员 | 新产品秒级建模，独立快车道 |
| worker-heavy-1/2 | AI 吞吐主力 | 300 并发 API，翻译/分析一起处理 |

---

## 📋 5 独立队列

| 队列 | 用途 | Worker | 特点 |
|------|------|--------|------|
| `ingestion` | 数据入库 | worker-base | 流式写入，秒级响应 |
| `reports` | 报告生成 | worker-base | 报告组装，秒级响应 |
| `learning` | 学习维度/5W | worker-learning + heavy | VIP 快车道 |
| `translation` | 评论翻译 | worker-heavy | 高并发 API |
| `analysis` | 洞察 + 主题 | worker-heavy | 高并发 API |

---

## 👷 4 Worker 配置

### Worker 1: 基础响应员 (Base Worker)

```yaml
worker-base:
  command: celery -A app.worker worker --beat --loglevel=info --concurrency=4 -Q ingestion,reports,celery -n base@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | Prefork | 默认多进程模式 |
| 并发数 | 4 | 4 线程 |
| 队列 | ingestion, reports, celery | 快速响应队列 |
| 附加 | --beat | 运行定时任务调度器 |
| 内存 | 1GB | 轻量级任务 |

**职责**：
- ✅ 流式数据写入（插件上传不等待）
- ✅ 报告组装（用户不等待）
- ✅ Celery Beat 定时任务

### Worker 2: VIP 建模员 (Vanguard/Learning)

```yaml
worker-learning:
  command: celery -A app.worker worker --loglevel=info --pool=gevent --concurrency=100 -Q learning -n learning@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | **Gevent** | 协程模式 |
| 并发数 | 100 | 100 协程 |
| 队列 | learning | VIP 快车道 |
| 内存 | 2GB | AI 任务需要更多内存 |

**职责**：
- ✅ 新产品秒级建模（维度发现 + 5W）
- ✅ 独立进程，不受翻译/分析干扰
- ✅ VIP 快车道，优先处理

### Worker 3 & 4: AI 吞吐主力 (Heavy Lifters)

```yaml
worker-heavy-1/2:
  command: celery -A app.worker worker --loglevel=info --pool=gevent --concurrency=150 -Q learning,translation,analysis -n heavy1/2@%h
```

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 模式 | **Gevent** | 协程模式 |
| 并发数 | 150 × 2 = **300** | 超高并发 |
| 队列 | learning, translation, analysis | AI 任务 |
| 内存 | 2GB × 2 | 4GB 总计 |

**职责**：
- ✅ 翻译 + 洞察 + 主题提取
- ✅ 300 并发 API 请求
- ✅ learning 队列作为 VIP Worker 的备份

---

## 📈 硬件资源分配 (Memory Map)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     4核16G 服务器资源分配                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PostgreSQL              ████████████████░░░░  4GB + 1GB 额外 = 5GB    │
│     shared_buffers=4GB                                                  │
│     work_mem=64MB                                                       │
│     max_connections=500                                                 │
│                                                                         │
│   Redis                   ████████░░░░░░░░░░░░  2GB                     │
│     maxmemory=2GB                                                       │
│     maxmemory-policy=allkeys-lru                                        │
│                                                                         │
│   worker-base             ████░░░░░░░░░░░░░░░░  1GB                     │
│   worker-learning         ████████░░░░░░░░░░░░  2GB                     │
│   worker-heavy-1          ████████░░░░░░░░░░░░  2GB                     │
│   worker-heavy-2          ████████░░░░░░░░░░░░  2GB                     │
│                                                                         │
│   FastAPI + Nginx         ████░░░░░░░░░░░░░░░░  1GB                     │
│   操作系统                ████░░░░░░░░░░░░░░░░  1GB                     │
│                                                                         │
│   总计：5 + 2 + 1 + 2 + 2 + 2 + 1 + 1 = 16GB ✅                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 任务路由配置

```python
# backend/app/worker.py

task_routes={
    # ============== 快车道：入库 + 报告 (worker-base) ==============
    "app.worker.task_process_ingestion_queue": {"queue": "ingestion"},
    "app.worker.task_check_pending_translations": {"queue": "ingestion"},
    "app.worker.task_generate_report": {"queue": "reports"},
    
    # ============== VIP 快车道：学习建模 (worker-learning) ==============
    "app.worker.task_full_auto_analysis": {"queue": "learning"},
    "app.worker.task_scientific_learning_and_analysis": {"queue": "learning"},
    
    # ============== 慢车道：翻译 + 分析 (worker-heavy × 2) ==============
    "app.worker.task_translate_bullet_points": {"queue": "translation"},
    "app.worker.task_process_reviews": {"queue": "translation"},
    "app.worker.task_ingest_translation_only": {"queue": "translation"},
    "app.worker.task_extract_insights": {"queue": "analysis"},
    "app.worker.task_extract_themes": {"queue": "analysis"},
}
```

---

## ⏰ Celery Beat 定时任务

| 任务 | 间隔 | 队列 | 说明 |
|------|------|------|------|
| `process-ingestion-queue` | 5秒 | ingestion | 消费 Redis 队列，入库到 PostgreSQL |
| `check-pending-translations` | 15秒 | ingestion | 检查待翻译评论，触发翻译任务 |

---

## 🗄️ 数据库优化配置

### PostgreSQL (16GB 服务器优化)

```yaml
command: >
  postgres
  -c shared_buffers=4GB          # 缓存热门数据
  -c work_mem=64MB               # 加快复杂查询排序
  -c max_connections=500         # 支持多 Worker 连接
  -c effective_cache_size=8GB    # 告诉优化器系统有多少缓存
  -c maintenance_work_mem=512MB  # 加快索引创建/VACUUM
  -c checkpoint_completion_target=0.9
  -c wal_buffers=64MB
  -c random_page_cost=1.1        # SSD 优化
```

### Redis (队列缓冲区)

```yaml
command: >
  redis-server
  --maxmemory 2gb                # 最大 2GB 内存
  --maxmemory-policy allkeys-lru # LRU 淘汰策略
  --appendonly yes               # 持久化
  --appendfsync everysec         # 每秒同步
```

---

## 📊 监控命令

### 查看队列长度
```bash
docker exec voc-redis redis-cli LLEN ingestion
docker exec voc-redis redis-cli LLEN reports
docker exec voc-redis redis-cli LLEN learning
docker exec voc-redis redis-cli LLEN translation
docker exec voc-redis redis-cli LLEN analysis
```

### 查看活跃任务
```bash
docker exec voc-worker-base celery -A app.worker inspect active
```

### 查看 Worker 监听的队列
```bash
docker exec voc-worker-base celery -A app.worker inspect active_queues
```

### 查看 PostgreSQL 配置
```bash
docker exec voc-postgres psql -U vocmaster -d vocmaster -c "SHOW shared_buffers; SHOW work_mem; SHOW max_connections;"
```

### 查看 Redis 内存使用
```bash
docker exec voc-redis redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human"
```

---

## 🧹 "脏累活"优化：洞察与主题提取

> **核心问题**：洞察提取和主题提取是典型的 "AI 脏累活"，数据量大、Prompt 复杂、IO 双重密集。

### 为什么这两个任务最重？

| 特征 | 说明 |
|------|------|
| **Fan-out 效应** | 翻译是 1:1，但一条评论可能提取 3-5 条洞察、4-5 个 5W 标签 |
| **Prompt 复杂** | 需要 AI 归纳、推理、分类，输入 Token 显著增加 |
| **双重密集** | CPU（格式化 JSON）+ IO（海量数据库写入） |

### 优化策略

#### 1. 批量入库（Bulk Insert）

**问题**：每条评论提交一次 `db.commit()`，磁盘"反复折磨"

**解决**：攒满 20 条评论的洞察/主题，一次性 `db.add_all()` 批量提交

```python
# 🔥 批量入库优化
BATCH_SIZE = 20
pending_insights = []

for review in reviews:
    insights = translation_service.extract_insights(...)
    for insight in insights:
        pending_insights.append(ReviewInsight(...))
    
    # 每 20 条批量提交
    if len(pending_insights) >= BATCH_SIZE:
        db.add_all(pending_insights)
        db.commit()
        pending_insights = []

# 最终提交剩余
if pending_insights:
    db.add_all(pending_insights)
    db.commit()
```

**效果**：磁盘 IO 压力降低一个数量级

#### 2. 标签映射 Redis 缓存

**问题**：主题提取需频繁查找标签 ID，每次都查 PostgreSQL

**解决**：将标签映射表缓存到 Redis，有效期 1 小时

```python
class LabelCacheManager:
    CACHE_PREFIX = "label_cache"
    CACHE_TTL = 3600  # 1 小时
    
    def get_label_id_map(self, product_id) -> dict:
        # 优先从 Redis 获取
        cached = redis.get(f"{CACHE_PREFIX}:{product_id}")
        if cached:
            return json.loads(cached)
        return None
    
    def set_label_id_map(self, product_id, label_map):
        redis.setex(f"{CACHE_PREFIX}:{product_id}", CACHE_TTL, json.dumps(label_map))
```

**效果**：热门产品标签常驻内存，避免重复查询

#### 3. 队列隔离保护

**原则**：永远不要让执行"洞察"和"主题"的 Worker 监听 `ingestion` 队列

**当前配置**：

| Worker | 队列 | 说明 |
|--------|------|------|
| worker-base | ingestion, reports | ✅ 隔离：不处理 AI 任务 |
| worker-learning | learning | ✅ VIP 快车道 |
| worker-heavy-1/2 | learning, translation, analysis | ✅ 仅处理 AI 任务 |

#### 4. 任务优先级"生存法则"

```
🚀 快车道（Learning）        🐢 慢车道（Analysis）
   ├─ 维度学习                  ├─ 洞察提取
   ├─ 5W 标签学习               └─ 主题提取
   └─ 新产品建模
   
快车道决定分析质量，必须最快
慢车道虽然脏累，但可以慢慢跑
```

### 性能对比

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 单条评论入库次数 | 每条 commit | 20 条 batch |
| 标签查询 | 每次查 PostgreSQL | Redis 缓存命中 |
| 磁盘 IO | 高频小写入 | 低频批量写入 |
| 入库队列堵塞 | 可能 | ✅ 完全隔离 |

---

## 🎯 效果总结

| 场景 | 效果 |
|------|------|
| 新用户上传数据 | ✅ 秒级入库，worker-base 独立处理 |
| 新产品学习维度 | ✅ 秒级建模，worker-learning VIP 快车道 |
| 用户生成报告 | ✅ 秒级响应，worker-base 独立处理 |
| 后台 10 万条评论翻译中 | ✅ worker-heavy 300 并发处理 |
| 100 用户同时采集 | ✅ 404 并发 API，数据库 4GB 缓存 |
| 洞察/主题提取 | ✅ 批量入库 + 缓存，IO 压力降低 90% |

---

## 📝 依赖

```
# backend/requirements.txt
gevent==24.2.1  # Celery 协程池，支持高并发 I/O 密集任务
```

---

## 🏆 关键优势

1. **快车道保障**：独立的 `learning` Worker 确保建模不排队
2. **吞吐量**：合计超过 400 的并发处理能力
3. **写入安全**：4GB 数据库缓冲区 + 2GB Redis 确保众包采集稳如泰山
4. **公共数据资产**：一次分析，多次读取，数据库索引全部载入内存

---

*更新时间：2026-01-10*
