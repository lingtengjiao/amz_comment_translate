"""
Celery Worker Configuration and Tasks

This module handles asynchronous processing of reviews:
1. Translation via Qwen API
2. Sentiment analysis
3. Database updates
"""
import logging
import time
import random
from typing import Optional
from functools import wraps
from uuid import UUID

from celery import Celery
from sqlalchemy import create_engine, select, update, and_, func
from sqlalchemy.orm import sessionmaker
import redis
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# 🎯 智能评论分类器（根据长度和质量差异化处理）
# ============================================================================

class ReviewClassifier:
    """
    评论分类器：根据评论长度和质量分类，采用差异化翻译策略
    
    分类标准：
    - VIP 评论：长评论（> 200字）或极端星级的详细评论（1/5星 且 > 100字）
      → 单独翻译，保证质量
    
    - 标准评论：中等长度（50-200字）
      → 5条一批翻译，平衡质量和效率
    
    - 短评论：简短表达（≤ 50字）
      → 20条一批翻译，最大化效率
    
    优势：
    - 质量保证：重要评论单独翻译，不降低质量
    - 效率最大化：短评论大批量处理，QPS 消耗降低 20 倍
    - 灵活平衡：中等评论适度批量，兼顾质量和效率
    """
    
    # 可配置的分类阈值
    VIP_LENGTH_THRESHOLD = 200        # VIP 评论最低字数
    VIP_EXTREME_RATING_LENGTH = 100   # 极端星级评论的字数阈值
    EXTREME_RATINGS = [1, 5]          # 极端星级（差评/好评）
    
    STANDARD_MIN_LENGTH = 50          # 标准评论最低字数
    STANDARD_MAX_LENGTH = 200         # 标准评论最高字数
    
    SHORT_MAX_LENGTH = 50             # 短评论最高字数
    
    # 批量大小配置
    BATCH_SIZE_VIP = 1       # VIP 评论：单独翻译
    BATCH_SIZE_STANDARD = 5  # 标准评论：5 条一批
    BATCH_SIZE_SHORT = 20    # 短评论：20 条一批
    
    @classmethod
    def classify(cls, review) -> str:
        """
        评论分类
        
        Args:
            review: Review 对象
        
        Returns:
            'vip': 高质量长评论
            'standard': 中等评论
            'short': 短评论
        """
        text = review.body_original or ""
        text_length = len(text.strip())
        rating = review.rating
        
        # VIP 评论：长评论或极端星级的详细评论
        if text_length > cls.VIP_LENGTH_THRESHOLD:
            return 'vip'
        
        if text_length > cls.VIP_EXTREME_RATING_LENGTH and rating in cls.EXTREME_RATINGS:
            return 'vip'
        
        # 短评论
        if text_length <= cls.SHORT_MAX_LENGTH:
            return 'short'
        
        # 标准评论（默认）
        return 'standard'
    
    @classmethod
    def get_batch_size(cls, category: str) -> int:
        """获取批量大小"""
        batch_sizes = {
            'vip': cls.BATCH_SIZE_VIP,
            'standard': cls.BATCH_SIZE_STANDARD,
            'short': cls.BATCH_SIZE_SHORT
        }
        return batch_sizes.get(category, cls.BATCH_SIZE_STANDARD)
    
    @classmethod
    def group_reviews(cls, reviews: list) -> dict:
        """
        将评论按分类分组
        
        Returns:
            {
                'vip': [...],
                'standard': [...],
                'short': [...]
            }
        """
        groups = {
            'vip': [],
            'standard': [],
            'short': []
        }
        
        for review in reviews:
            category = cls.classify(review)
            groups[category].append(review)
        
        return groups


# ============================================================================
# 🚦 全局 API 限流器（防止 QPS 冲高导致账号被封）
# ============================================================================

class APIRateLimiter:
    """
    全局 API 限流器，防止瞬间 RPS 冲高
    
    策略：
    - 使用 Redis 滑动窗口计数
    - qwen-plus-latest: 40,000 RPM = 666 RPS
    - 安全上限: 666 * 0.75 = 500 RPS（留 25% 余量）
    - 支持分布式部署（多服务器共享 Redis 限流）
    - 超过限制时，随机退避 0.05-0.2 秒
    """
    def __init__(self, redis_client, max_qps=200, window_seconds=1):
        self.redis_client = redis_client
        self.max_qps = max_qps
        self.window_seconds = window_seconds
        self.key_prefix = "api_rate_limit"
    
    def acquire(self, api_name="qwen"):
        """
        获取 API 调用许可
        
        Returns:
            bool: True if allowed, False if rate limited
        """
        key = f"{self.key_prefix}:{api_name}"
        current_time = time.time()
        window_start = current_time - self.window_seconds
        
        # 清理过期计数
        self.redis_client.zremrangebyscore(key, 0, window_start)
        
        # 检查当前窗口内的请求数
        current_count = self.redis_client.zcard(key)
        
        if current_count >= self.max_qps:
            # 超过限制，随机退避
            backoff = random.uniform(0.1, 0.5)
            logger.warning(f"[限流] API QPS 达到 {current_count}/{self.max_qps}，退避 {backoff:.2f}s")
            time.sleep(backoff)
            return False
        
        # 记录本次请求
        self.redis_client.zadd(key, {str(current_time): current_time})
        self.redis_client.expire(key, self.window_seconds * 2)  # 2 倍窗口时间过期
        
        return True
    
    def wait_and_acquire(self, api_name="qwen", max_retries=10):
        """
        等待直到获取到 API 调用许可
        
        Args:
            api_name: API 名称
            max_retries: 最大重试次数
        """
        for i in range(max_retries):
            if self.acquire(api_name):
                return True
            time.sleep(random.uniform(0.05, 0.2))  # 短暂随机退避
        
        raise Exception(f"[限流] 无法获取 API 许可，已重试 {max_retries} 次")

# Redis 客户端（用于分布式锁和限流）
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# 全局限流器实例
# qwen-plus-latest: 40,000 RPM = 666 RPS，安全上限 500 RPS（留 25% 余量）
import os
MAX_API_RPS = int(os.environ.get('MAX_API_RPS', '500'))
api_limiter = APIRateLimiter(redis_client, max_qps=MAX_API_RPS)

def rate_limited_api(api_name="qwen"):
    """
    API 限流装饰器
    
    用法：
        @rate_limited_api("qwen")
        def call_qwen_api():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 等待获取 API 许可
            api_limiter.wait_and_acquire(api_name)
            
            # 调用原函数
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


# ============================================================================
# 🔥 标签映射 Redis 缓存（避免频繁查询 PostgreSQL）
# ============================================================================

class LabelCacheManager:
    """
    标签映射 Redis 缓存管理器
    
    优化点：
    - 将热门产品的标签库常驻 Redis
    - 避免 Worker 每次提取主题都查询标签表
    - 缓存有效期 1 小时（标签库变化不频繁）
    """
    CACHE_PREFIX = "label_cache"
    CACHE_TTL = 3600  # 1 小时
    
    def __init__(self, redis_client):
        self.redis_client = redis_client
    
    def get_label_id_map(self, product_id: str) -> dict:
        """
        从缓存获取标签映射表
        
        Returns:
            dict: {(theme_type, label_name): label_id} 或 None（缓存未命中）
        """
        cache_key = f"{self.CACHE_PREFIX}:{product_id}"
        cached_data = self.redis_client.get(cache_key)
        
        if cached_data:
            try:
                import json
                data = json.loads(cached_data)
                # 重建 tuple key
                return {(k.split("|")[0], k.split("|")[1]): v for k, v in data.items()}
            except Exception as e:
                logger.warning(f"[标签缓存] 解析缓存失败: {e}")
                return None
        
        return None
    
    def set_label_id_map(self, product_id: str, label_id_map: dict):
        """
        将标签映射表存入缓存
        
        Args:
            product_id: 产品 ID
            label_id_map: {(theme_type, label_name): label_id}
        """
        if not label_id_map:
            return
        
        cache_key = f"{self.CACHE_PREFIX}:{product_id}"
        
        try:
            import json
            # 将 tuple key 转换为字符串 key
            data = {f"{k[0]}|{k[1]}": str(v) for k, v in label_id_map.items()}
            self.redis_client.setex(cache_key, self.CACHE_TTL, json.dumps(data))
            logger.info(f"[标签缓存] 已缓存 {len(label_id_map)} 个标签（产品: {product_id}）")
        except Exception as e:
            logger.warning(f"[标签缓存] 缓存写入失败: {e}")
    
    def invalidate(self, product_id: str):
        """使缓存失效（标签库更新时调用）"""
        cache_key = f"{self.CACHE_PREFIX}:{product_id}"
        self.redis_client.delete(cache_key)
        logger.info(f"[标签缓存] 已清除缓存（产品: {product_id}）")

# 全局标签缓存管理器实例
label_cache = LabelCacheManager(redis_client)

# Create Celery application
celery_app = Celery(
    "voc_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes timeout per task (increased from 600s to handle large batches)
    task_soft_time_limit=1500,  # 25 minutes soft limit (warning before hard kill)
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_send_task_events=True,  # 🔥 支持 Flower 监控
    # ============================================================================
    # 🚀 6 队列 + 5 Worker 职能化架构（4核16G，解决翻译阻塞分析问题）
    # ============================================================================
    #
    # 🎯 核心优化：物理隔离队列 + 职能化 Worker 分工
    #
    # 6 个独立队列：
    # ┌─────────────────────────────────────────────────────────────────────────┐
    # │ 1. ingestion          - 入库（秒回）                                    │
    # │ 2. learning           - 建模（VIP 快车道）                              │
    # │ 3. translation        - 翻译（独立队列，不阻塞分析）                     │
    # │ 4. insight_extraction - 洞察提取（专属队列）                            │
    # │ 5. theme_extraction   - 主题提取（专属队列）                            │
    # │ 6. reports            - 报告生成                                        │
    # └─────────────────────────────────────────────────────────────────────────┘
    #
    # 5 个职能化 Worker：
    # ┌─────────────────────────────────────────────────────────────────────────┐
    # │ Worker 1 (Base):    ingestion, reports       | Prefork, 4 线程         │
    # │   → 死守入库，不接 AI 活，确保插件上传秒回                              │
    # ├─────────────────────────────────────────────────────────────────────────┤
    # │ Worker 2 (VIP):     learning                 | Gevent, 50 协程         │
    # │   → 建模快车道，专攻维度学习和 5W 建模                                  │
    # ├─────────────────────────────────────────────────────────────────────────┤
    # │ Worker 3 (Trans):   translation              | Gevent, 100 协程        │
    # │   → 独立翻译组，专门消化海量翻译，不影响分析                            │
    # ├─────────────────────────────────────────────────────────────────────────┤
    # │ Worker 4 (Insight): insight_extraction, learning | Gevent, 100 协程    │
    # │   → 洞察专员，主攻洞察提取，闲时支援建模                                │
    # ├─────────────────────────────────────────────────────────────────────────┤
    # │ Worker 5 (Theme):   theme_extraction, learning   | Gevent, 100 协程    │
    # │   → 主题专员，主攻主题提取，闲时支援建模                                │
    # └─────────────────────────────────────────────────────────────────────────┘
    #
    # 总并发：4 + 50 + 100 + 100 + 100 = 354 并发！
    #
    # 🎯 核心优势：
    # - 翻译不再是屏障：独立 Worker，不阻塞分析
    # - 建模永远优先：所有 AI Worker 都支援 learning
    # - 洞察/主题并行：各有专属队列，不互相竞争
    #
    task_routes={
        # ============== 1. 快车道：入库 (worker-base) ==============
        # 🏎️ 纯 CPU + 磁盘，保证 API 秒级响应
        "app.worker.task_process_ingestion_queue": {"queue": "ingestion"},
        "app.worker.task_check_pending_translations": {"queue": "ingestion"},
        
        # ============== 2. VIP 快车道：学习建模 (worker-vip) ==============
        # 🌟 新产品秒级建模，独立进程不受干扰
        "app.worker.task_full_auto_analysis": {"queue": "learning"},
        "app.worker.task_scientific_learning_and_analysis": {"queue": "learning"},
        
        # ============== 3. 独立：翻译 (worker-trans) ==============
        # 🔄 专门消化海量翻译，不影响其他分析任务
        "app.worker.task_translate_bullet_points": {"queue": "translation"},
        "app.worker.task_process_reviews": {"queue": "translation"},
        "app.worker.task_ingest_translation_only": {"queue": "translation"},
        
        # ============== 4. 专属：洞察提取 (worker-insight) ==============
        # 🔍 主攻洞察提取，闲时支援建模
        "app.worker.task_extract_insights": {"queue": "insight_extraction"},
        
        # ============== 5. 专属：主题提取 (worker-theme) ==============
        # 🏷️ 主攻主题提取，闲时支援建模
        "app.worker.task_extract_themes": {"queue": "theme_extraction"},
        
        # ============== 5.5. 维度总结生成 (worker-insight/vip) ==============
        # 📊 AI 总结生成，需要大量 AI 调用
        "app.worker.task_generate_dimension_summaries": {"queue": "learning"},
        
        # ============== 6. 组装：报告生成 (worker-base) ==============
        # 📊 最后的整合，生成分析报告
        "app.worker.task_generate_report": {"queue": "reports"},
    },
    # Celery Beat 定时任务配置
    beat_schedule={
        # 每 5 秒消费一次入库队列
        "process-ingestion-queue": {
            "task": "app.worker.task_process_ingestion_queue",
            "schedule": 5.0,
        },
        # 🔥 每 15 秒检查并触发待翻译任务（确保翻译持续进行）
        "check-pending-translations": {
            "task": "app.worker.task_check_pending_translations",
            "schedule": 15.0,
        },
        # 🛡️ 每 5 分钟运行补全巡检（最后一道防线，确保无遗漏）
        "analysis-completion-patrol": {
            "task": "app.worker.task_analysis_completion_patrol",
            "schedule": 300.0,  # 5 分钟
        },
    },
)

# ============================================================================
# 🔧 同步数据库连接（Celery Worker 专用）
# ============================================================================
# Celery 使用 Gevent 协程，需要特殊的连接池配置
# 
# 策略说明：
# - 使用 NullPool：每次操作创建新连接，适合高并发协程场景
# - 避免连接池瓶颈：Gevent 150 协程 vs 默认 pool_size=5 会严重阻塞
# - PostgreSQL max_connections=500 足以支撑
# ============================================================================
from sqlalchemy.pool import NullPool, QueuePool

SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")

# 🔥 高并发连接池配置（支持 400+ 并发 Worker）
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=settings.DEBUG,
    # 使用 QueuePool 配合大容量，比 NullPool 更高效
    poolclass=QueuePool,
    pool_size=100,        # 基础连接数
    max_overflow=400,     # 溢出连接数（总共支持 500 连接）
    pool_timeout=30,      # 等待连接超时
    pool_pre_ping=True,   # 检测断开的连接
    pool_recycle=1800,    # 30 分钟回收连接，防止数据库超时
)
SyncSession = sessionmaker(bind=sync_engine)


def get_sync_db():
    """Get synchronous database session for worker."""
    return SyncSession()


# ============== Worker 启动时清理卡住的任务 ==============

def cleanup_stuck_reviews():
    """
    清理卡在 'processing' 状态的评论。
    当 Worker 重启时，之前正在处理的评论可能会卡在 processing 状态。
    这个函数将它们重置为 pending，让它们可以被重新处理。
    """
    from app.models.review import Review
    
    db = get_sync_db()
    try:
        result = db.execute(
            update(Review)
            .where(Review.translation_status == "processing")
            .values(translation_status="pending")
        )
        db.commit()
        
        if result.rowcount > 0:
            logger.warning(f"[启动清理] 已将 {result.rowcount} 条卡住的评论重置为 pending 状态")
        else:
            logger.info("[启动清理] 没有发现卡住的评论")
    except Exception as e:
        logger.error(f"[启动清理] 清理卡住评论失败: {e}")
        db.rollback()
    finally:
        db.close()


def cleanup_stuck_tasks():
    """
    清理卡住的任务（心跳超时）。
    将 PROCESSING 状态但心跳超时的任务标记为 TIMEOUT。
    """
    from app.models.task import Task, TaskStatus
    from datetime import datetime, timezone, timedelta
    
    db = get_sync_db()
    try:
        # 查找所有 processing 状态的任务
        result = db.execute(
            select(Task).where(Task.status == TaskStatus.PROCESSING.value)
        )
        tasks = result.scalars().all()
        
        timeout_count = 0
        for task in tasks:
            if task.is_heartbeat_timeout:
                task.status = TaskStatus.TIMEOUT.value
                task.error_message = f"心跳超时：最后心跳时间 {task.last_heartbeat}"
                timeout_count += 1
                logger.warning(f"[启动清理] 任务 {task.id} ({task.task_type}) 心跳超时，标记为 TIMEOUT")
        
        if timeout_count > 0:
            db.commit()
            logger.warning(f"[启动清理] 已将 {timeout_count} 个超时任务标记为 TIMEOUT")
        else:
            logger.info("[启动清理] 没有发现心跳超时的任务")
            
    except Exception as e:
        logger.error(f"[启动清理] 清理超时任务失败: {e}")
        db.rollback()
    finally:
        db.close()


# ============== 心跳更新辅助函数 ==============

def update_task_heartbeat(db, task_id: str, processed_items: int = None):
    """
    更新任务心跳时间。
    
    Args:
        db: 数据库会话
        task_id: 任务 ID
        processed_items: 可选，同时更新已处理数量
    """
    from app.models.task import Task
    from datetime import datetime, timezone
    
    try:
        values = {"last_heartbeat": datetime.now(timezone.utc)}
        if processed_items is not None:
            values["processed_items"] = processed_items
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(**values)
        )
        db.commit()
    except Exception as e:
        logger.error(f"更新任务心跳失败: {e}")
        db.rollback()


def get_or_create_task(db, product_id: str, task_type: str, total_items: int = 0, celery_task_id: str = None):
    """
    获取或创建任务记录。
    
    Args:
        db: 数据库会话
        product_id: 产品 ID
        task_type: 任务类型
        total_items: 总项目数
        celery_task_id: Celery 任务 ID
        
    Returns:
        Task: 任务对象
    """
    from app.models.task import Task, TaskStatus
    from datetime import datetime, timezone
    
    # 查找现有任务
    result = db.execute(
        select(Task).where(
            and_(
                Task.product_id == product_id,
                Task.task_type == task_type
            )
        )
    )
    task = result.scalar_one_or_none()
    
    now = datetime.now(timezone.utc)
    
    if task:
        # 更新现有任务
        task.status = TaskStatus.PROCESSING.value
        task.total_items = total_items
        task.processed_items = 0
        task.last_heartbeat = now
        task.celery_task_id = celery_task_id
        task.error_message = None
    else:
        # 创建新任务
        task = Task(
            product_id=product_id,
            task_type=task_type,
            status=TaskStatus.PROCESSING.value,
            total_items=total_items,
            processed_items=0,
            last_heartbeat=now,
            celery_task_id=celery_task_id
        )
        db.add(task)
    
    db.commit()
    db.refresh(task)
    return task


def complete_task(db, task_id: str, success: bool = True, error_message: str = None):
    """
    完成任务。
    
    Args:
        db: 数据库会话
        task_id: 任务 ID
        success: 是否成功
        error_message: 错误信息（失败时）
    """
    from app.models.task import Task, TaskStatus
    
    try:
        status = TaskStatus.COMPLETED.value if success else TaskStatus.FAILED.value
        values = {
            "status": status,
            "last_heartbeat": None  # 清除心跳，表示任务已结束
        }
        if error_message:
            values["error_message"] = error_message
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(**values)
        )
        db.commit()
    except Exception as e:
        logger.error(f"完成任务失败: {e}")
        db.rollback()


# 使用 Celery 信号在 Worker 启动时执行清理
from celery.signals import worker_ready

@worker_ready.connect
def on_worker_ready(**kwargs):
    """Worker 启动完成后执行清理"""
    logger.info("Worker 已就绪，开始检查卡住的任务...")
    cleanup_stuck_reviews()
    cleanup_stuck_tasks()  # [NEW] 清理心跳超时的任务


# ============== 任务1: 五点翻译 ==============

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def task_translate_bullet_points(self, product_id: str):
    """
    Translate product bullet points and title.
    This task should run FIRST, before review translation.
    
    Args:
        product_id: UUID of the product
    """
    from app.models.product import Product
    from app.services.translation import translation_service
    import json
    
    logger.info(f"Starting bullet points translation for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Get product
        result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            logger.error(f"Product {product_id} not found")
            return {"success": False, "error": "Product not found"}
        
        translated_title = None
        translated_bullets = None
        
        # 1. Translate product title if not already translated
        if product.title and not product.title_translated:
            try:
                translated_title = translation_service.translate_product_title(product.title)
                product.title_translated = translated_title
                logger.info(f"Translated product title: {translated_title[:50]}...")
            except Exception as e:
                logger.error(f"Failed to translate product title: {e}")
        
        # 2. Translate bullet points if not already translated
        if product.bullet_points and not product.bullet_points_translated:
            try:
                # Parse bullet points from JSON, PostgreSQL array, or Python list
                bullet_points = []
                if isinstance(product.bullet_points, list):
                    bullet_points = product.bullet_points
                elif isinstance(product.bullet_points, str):
                    bp_str = product.bullet_points.strip()
                    # 尝试 JSON 格式 [...]
                    if bp_str.startswith('['):
                        bullet_points = json.loads(bp_str)
                    # 处理 PostgreSQL 数组格式 {...}
                    elif bp_str.startswith('{') and bp_str.endswith('}'):
                        # 移除首尾的 {} 并按逗号分割（考虑引号内的逗号）
                        import re
                        # 匹配引号内的内容或非逗号字符
                        content = bp_str[1:-1]  # 移除 { }
                        # 使用正则匹配带引号的字符串
                        matches = re.findall(r'"([^"]*)"', content)
                        if matches:
                            bullet_points = matches
                        else:
                            # 简单分割（不带引号的情况）
                            bullet_points = [s.strip() for s in content.split(',') if s.strip()]
                    else:
                        # 尝试直接 JSON 解析
                        try:
                            bullet_points = json.loads(bp_str)
                        except:
                            bullet_points = [bp_str] if bp_str else []
                
                if bullet_points and len(bullet_points) > 0:
                    translated_bullets = translation_service.translate_bullet_points(bullet_points)
                    # 统一保存为 JSON 字符串格式
                    product.bullet_points_translated = json.dumps(translated_bullets, ensure_ascii=False)
                    logger.info(f"Translated {len(translated_bullets)} bullet points")
            except Exception as e:
                logger.error(f"Failed to translate bullet points: {e}")
        
        db.commit()
        
        return {
            "success": True,
            "product_id": product_id,
            "title_translated": translated_title is not None,
            "bullet_points_translated": translated_bullets is not None
        }
        
    except Exception as e:
        logger.error(f"Bullet points translation failed for product {product_id}: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== 任务2: 评论翻译 ==============

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def task_process_reviews(self, product_id: str, task_id: str):
    """
    Async task to process and translate reviews.
    
    Workflow:
    1. Get pending reviews from database
    2. For each review:
       a. Call Qwen API for translation
       b. Analyze sentiment
       c. Extract insights (深度解读)
       d. Update database
       e. Update task progress
    3. Mark task as completed
    
    Args:
        product_id: UUID of the product
        task_id: UUID of the task to track progress
    """
    from app.models.review import Review
    from app.models.task import Task
    from app.models.insight import ReviewInsight
    from app.services.translation import translation_service
    
    logger.info(f"Starting translation task {task_id} for product {product_id}")
    
    db = get_sync_db()
    
    try:
        # Update task status to processing
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(status="processing")
        )
        db.commit()
        
        # Get pending reviews (including processing and failed - to retry stuck/failed translations)
        # ordered by review_date descending (newest first, matching frontend display)
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status.in_(["pending", "processing", "failed"])
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        failed = 0
        
        logger.info(f"Found {total_reviews} pending reviews to translate")
        
        for review in reviews:
            try:
                # Mark as processing
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(translation_status="processing")
                )
                db.commit()
                
                # Validate body_original exists
                if not review.body_original or not review.body_original.strip():
                    logger.warning(f"Review {review.id} has empty body, skipping translation")
                    db.execute(
                        update(Review)
                        .where(Review.id == review.id)
                        .values(translation_status="failed")
                    )
                    db.commit()
                    failed += 1
                    continue
                
                # 只做翻译，不提取洞察（洞察需要用户手动触发）
                title_translated, body_translated, sentiment, _ = translation_service.translate_review(
                    title=review.title_original,
                    body=review.body_original,
                    extract_insights=False  # 关闭自动洞察提取
                )
                
                # Validate translation results
                if not body_translated or not body_translated.strip():
                    logger.error(f"Translation returned empty for review {review.id}, body: {review.body_original[:100]}")
                    raise ValueError("Translation returned empty result")
                
                # Update review with translation only
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(
                        title_translated=title_translated if title_translated and title_translated.strip() else None,
                        body_translated=body_translated,
                        sentiment=sentiment.value,
                        translation_status="completed"
                    )
                )
                
                processed += 1
                
                # Update task progress
                db.execute(
                    update(Task)
                    .where(Task.id == task_id)
                    .values(processed_items=processed)
                )
                db.commit()
                
                logger.debug(f"Translated review {review.id}: {review.rating} stars")
                
                # Rate limiting: wait between API calls
                time.sleep(0.2)
                
            except Exception as e:
                logger.error(f"Failed to translate review {review.id}: {e}", exc_info=True)
                failed += 1
                
                # Mark review as failed (don't save empty translations)
                db.execute(
                    update(Review)
                    .where(Review.id == review.id)
                    .values(
                        translation_status="failed",
                        title_translated=None,
                        body_translated=None
                    )
                )
                db.commit()
                
                # Continue with next review
                continue
        
        # Check if there are still pending reviews
        from app.models.review import TranslationStatus
        pending_count_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.PENDING.value
                )
            )
        )
        pending_count = pending_count_result.scalar() or 0
        
        # Update task status - only mark as completed if no pending reviews
        if pending_count == 0:
            final_status = "completed" if failed == 0 else "completed"
        else:
            # Still have pending reviews, keep as processing
            final_status = "processing"
        
        error_msg = f"{failed} reviews failed" if failed > 0 else None
        
        db.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                status=final_status,
                processed_items=processed,
                error_message=error_msg
            )
        )
        db.commit()
        
        logger.info(f"Task {task_id} completed: {processed} translated, {failed} failed")
        
        return {
            "task_id": task_id,
            "product_id": product_id,
            "total": total_reviews,
            "processed": processed,
            "failed": failed
        }
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}")
        
        # Mark task as failed
        try:
            db.execute(
                update(Task)
                .where(Task.id == task_id)
                .values(
                    status="failed",
                    error_message=str(e)
                )
            )
            db.commit()
        except:
            pass
        
        # Retry the task
        raise self.retry(exc=e)
        
    finally:
        db.close()


@celery_app.task
def task_health_check():
    """Simple task to verify worker is running."""
    return {"status": "healthy", "worker": "voc_worker"}


@celery_app.task
def task_retry_failed_reviews(product_id: str):
    """
    Retry translation for failed reviews.
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    
    db = get_sync_db()
    
    try:
        # Reset failed reviews to pending
        result = db.execute(
            update(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == "failed"
                )
            )
            .values(translation_status="pending")
        )
        db.commit()
        
        logger.info(f"Reset {result.rowcount} failed reviews to pending")
        
        # Trigger processing
        task_process_reviews.delay(product_id, None)
        
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_extract_insights(self, product_id: str):
    """
    Extract insights for already translated reviews (without re-translating).
    
    This task:
    1. Gets all translated reviews that don't have insights yet
    2. **[NEW] Loads product-specific dimensions if available**
    3. Calls AI to extract insights (using dimensions for categorization)
    4. Saves insights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.insight import ReviewInsight
    from app.models.product_dimension import ProductDimension
    from app.models.task import Task, TaskType, TaskStatus
    from app.services.translation import translation_service
    from sqlalchemy import delete, exists
    
    # 🚦 慢车道：启动随机延迟
    startup_delay = random.uniform(0.2, 1.0)
    logger.info(f"[洞察提取] 🐢 慢车道启动，延迟 {startup_delay:.2f}s")
    time.sleep(startup_delay)
    
    logger.info(f"Starting insight extraction for product {product_id}")
    
    db = get_sync_db()
    task_record = None
    
    try:
        # [NEW] 获取产品的维度 Schema（如果有的话）
        # [UPDATED 2026-01-16] 支持3类维度体系
        dimension_result = db.execute(
            select(ProductDimension)
            .where(ProductDimension.product_id == product_id)
            .order_by(ProductDimension.created_at)
        )
        dimensions = dimension_result.scalars().all()
        
        # [UPDATED 2026-01-16] 按维度类型分组
        dimension_schema = None
        if dimensions and len(dimensions) > 0:
            # 检查是否有 dimension_type 字段（新版本数据）
            has_type_field = hasattr(dimensions[0], 'dimension_type') and dimensions[0].dimension_type
            
            if has_type_field:
                # 新格式：按类型分组
                dimension_schema = {
                    "product": [],
                    "scenario": [],
                    "emotion": []
                }
                for dim in dimensions:
                    dim_type = getattr(dim, 'dimension_type', 'product') or 'product'
                    if dim_type in dimension_schema:
                        dimension_schema[dim_type].append({
                            "name": dim.name, 
                            "description": dim.description or ""
                        })
                    else:
                        # 未知类型默认归入产品维度
                        dimension_schema["product"].append({
                            "name": dim.name, 
                            "description": dim.description or ""
                        })
                
                total_dims = sum(len(v) for v in dimension_schema.values())
                logger.info(f"使用3类维度进行洞察提取: 总计 {total_dims} 个 "
                           f"(产品:{len(dimension_schema['product'])}, "
                           f"场景:{len(dimension_schema['scenario'])}, "
                           f"情绪:{len(dimension_schema['emotion'])})")
            else:
                # 旧格式：全部作为产品维度，使用默认场景和情绪维度
                product_dims = [
                    {"name": dim.name, "description": dim.description or ""}
                    for dim in dimensions
                ]
                dimension_schema = {
                    "product": product_dims,
                    "scenario": [
                        {"name": "日常使用", "description": "日常生活场景"},
                        {"name": "工作办公", "description": "办公场景"},
                        {"name": "户外出行", "description": "户外场景"}
                    ],
                    "emotion": [
                        {"name": "惊喜好评", "description": "超出预期的正面情绪"},
                        {"name": "失望不满", "description": "期望落空的负面情绪"},
                        {"name": "感激推荐", "description": "感谢并推荐"}
                    ]
                }
                logger.info(f"使用 {len(product_dims)} 个产品维度 + 默认场景/情绪维度进行洞察提取")
        else:
            logger.info(f"产品暂无定义维度，使用通用洞察提取逻辑")
        
        # [UPDATED] 跨语言模式：获取总评论数（有原文的评论，不再依赖翻译）
        total_reviews_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可
                    Review.is_deleted == False
                )
            )
        )
        total_reviews = total_reviews_result.scalar() or 0
        
        # [FIX] 获取已有洞察的评论数（processed_items）
        already_processed_result = db.execute(
            select(func.count(func.distinct(ReviewInsight.review_id)))
            .join(Review, Review.id == ReviewInsight.review_id)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.is_deleted == False
                )
            )
        )
        already_processed = already_processed_result.scalar() or 0
        
        # [NEW] 创建/更新 Task 记录（total_items = 总评论数，processed_items = 已处理数）
        task_record = get_or_create_task(
            db=db,
            product_id=product_id,
            task_type=TaskType.INSIGHTS.value,
            total_items=total_reviews,  # [UPDATED] 总评论数（不再是已翻译数）
            celery_task_id=self.request.id
        )
        # 设置已处理数为当前已有洞察的评论数
        task_record.processed_items = already_processed
        db.commit()
        logger.info(f"[跨语言洞察] Task record: total_items={total_reviews}, processed_items={already_processed}, remaining={total_reviews - already_processed}")
        
        # [FIX] 使用 NOT EXISTS 子查询排除已有洞察的评论，避免重复处理
        insight_exists_subquery = (
            select(ReviewInsight.id)
            .where(ReviewInsight.review_id == Review.id)
            .exists()
        )
        
        # [UPDATED] 跨语言模式：获取有原文的评论（不再依赖翻译），排除已有洞察的评论
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可，不再依赖翻译
                    Review.is_deleted == False,
                    ~insight_exists_subquery  # [FIX] Only process reviews without insights
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        reviews_to_process = len(reviews)
        processed = 0
        insights_extracted = 0
        
        # 🚀 并行协程优化：使用 gevent pool 并行调用 AI API
        # 支持环境变量配置，服务器 B 可以使用更高的值
        import os
        PARALLEL_SIZE = int(os.environ.get('INSIGHT_PARALLEL_SIZE', '120'))  # 40K RPM 优化：60→120
        
        # 🔥 [OPTIMIZED] BATCH_SIZE = PARALLEL_SIZE，充分利用并行池
        # 之前 BATCH_SIZE=20 限制了真实并发，现在与 PARALLEL_SIZE 同步
        BATCH_SIZE = PARALLEL_SIZE
        pending_insights = []  # 待提交的洞察列表
        
        logger.info(f"[跨语言洞察] Found {reviews_to_process} reviews remaining for insight extraction (total={total_reviews}, already_done={already_processed})")
        logger.info(f"[并行优化-洞察] 使用 PARALLEL_SIZE={PARALLEL_SIZE} 并行处理, BATCH_SIZE={BATCH_SIZE} 批量入库")
        
        # [UPDATED] 跨语言模式：只使用英文原文进行洞察提取
        def process_single_insight(review):
            """并行处理单条评论的洞察提取（跨语言模式：英文输入→中文输出）"""
            try:
                insights = translation_service.extract_insights(
                    original_text=review.body_original or "",
                    # [UPDATED] 不再传入 translated_text，跨语言模式直接从原文提取
                    dimension_schema=dimension_schema
                )
                return {
                    "review_id": review.id,
                    "insights": insights,
                    "success": True
                }
            except Exception as e:
                logger.error(f"[跨语言洞察] Failed to extract insights for review {review.id}: {e}")
                return {
                    "review_id": review.id,
                    "insights": None,
                    "success": False,
                    "error": str(e)
                }
        
        # 使用 gevent pool 并行处理
        from gevent.pool import Pool
        pool = Pool(PARALLEL_SIZE)
        
        # 分批并行处理
        for batch_start in range(0, reviews_to_process, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, reviews_to_process)
            batch_reviews = reviews[batch_start:batch_end]
            
            # 🚀 并行调用 AI API
            results = pool.map(process_single_insight, batch_reviews)
            
            # 处理结果
            for result in results:
                # [FIX 2026-01-15] 区分"成功但空结果"和"失败"
                # 注意：洞察提取Prompt要求至少1个洞察，所以空结果理论上不应该发生
                # 但如果发生，应该记录警告而不是当作失败
                if result["success"]:
                    insights = result.get("insights", [])
                    if insights:  # 有洞察，正常处理
                        for insight_data in insights:
                            # [UPDATED 2026-01-15] 添加 confidence 字段支持
                            confidence = insight_data.get('confidence', 'high')
                            if confidence not in ('high', 'medium', 'low'):
                                confidence = 'high'
                            
                            insight = ReviewInsight(
                                review_id=result["review_id"],
                                insight_type=insight_data.get('type', 'emotion'),
                                quote=insight_data.get('quote', ''),
                                quote_translated=insight_data.get('quote_translated'),
                                analysis=insight_data.get('analysis', ''),
                                dimension=insight_data.get('dimension'),
                                confidence=confidence  # [NEW] 置信度
                            )
                            pending_insights.append(insight)
                        insights_extracted += len(insights)
                    else:
                        # 成功但空结果（虽然Prompt要求至少1个，但AI可能返回空）
                        logger.warning(f"[跨语言洞察] 评论 {result['review_id']} AI返回空洞察数组（不符合Prompt要求，但视为成功）")
                else:
                    # 🛡️ [FIX v3] 基于重试次数判断，避免无限循环
                    from app.core.redis import get_sync_redis
                    redis_client = get_sync_redis()
                    review_id_str = str(result["review_id"])
                    retry_key = f"insight_retry:{review_id_str}"
                    
                    # 增加失败计数
                    retry_count = redis_client.incr(retry_key)
                    redis_client.expire(retry_key, 86400)  # 24小时后过期
                    
                    if retry_count >= 3:
                        # 已重试 3 次，AI 仍无法提取，标记为"已处理"
                        review_obj = next((r for r in reviews if str(r.id) == review_id_str), None)
                        review_text = review_obj.body_original[:100] if review_obj and review_obj.body_original else None
                        
                        empty_marker = ReviewInsight(
                            review_id=result["review_id"],
                            insight_type="_ai_no_content",
                            quote=review_text or "",
                            analysis=f"AI多次尝试后判定无法提取有意义洞察（重试{retry_count}次）"
                        )
                        pending_insights.append(empty_marker)
                        redis_client.delete(retry_key)  # 清除计数
                        logger.info(f"[跨语言洞察] ⏭️ 评论 {review_id_str} 重试{retry_count}次后AI判定无法提取，标记为已处理")
                    else:
                        # 未达到重试上限，允许下次重试
                        error_msg = result.get("error", "Unknown error")
                        logger.warning(f"[跨语言洞察] ⚠️ 评论 {review_id_str} 提取失败(第{retry_count}次): {error_msg}，将在下次任务中重试")
                
                processed += 1
            
            # 🔥 批量提交数据库
            if pending_insights:
                db.add_all(pending_insights)
                db.commit()
                logger.info(f"[并行入库] 已提交 {len(pending_insights)} 条洞察（进度: {processed}/{reviews_to_process}）")
                pending_insights = []
                # 注：缓存通过 API 层 2 秒 TTL 自动过期，无需在此处手动清除
            
            # 更新 Task 进度
            if task_record:
                task_record.processed_items = already_processed + processed
                db.commit()
            
            # [OPTIMIZED] 批次间微小休息，阿里云 API 限流一般 60-100 QPS，0.05s 足够
            time.sleep(0.05)
        
        # 🔥 提交剩余的待处理洞察
        if pending_insights:
            db.add_all(pending_insights)
            db.commit()
            logger.info(f"[并行入库] 最终提交 {len(pending_insights)} 条洞察")
        
        logger.info(f"[跨语言洞察] Insight extraction completed: processed {processed} new reviews (total={total_reviews}, now_done={already_processed + processed}), {insights_extracted} insights extracted")
        
        # 🚀 缓存失效 - 洞察提取完成后清除产品相关缓存
        if insights_extracted > 0:
            try:
                from app.core.cache import get_cache_service_sync
                from app.models.product import Product
                product_result = db.execute(select(Product).where(Product.id == product_id))
                product = product_result.scalar_one_or_none()
                if product:
                    cache = get_cache_service_sync()
                    cache.invalidate_all_for_product(product.asin)
                    logger.info(f"[Cache] Invalidated caches for product {product.asin} after insight extraction")
            except Exception as cache_error:
                logger.warning(f"[Cache] Failed to invalidate cache: {cache_error}")
        
        # 🛡️ [NEW] 末尾补全检查：确保没有遗漏的评论
        # 重新查询是否有遗漏（可能因为时序问题或处理失败）
        final_check_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.is_deleted == False,
                    ~insight_exists_subquery
                )
            )
        )
        remaining = final_check_result.scalar() or 0
        
        if remaining > 0:
            logger.warning(f"[跨语言洞察] ⚠️ 发现 {remaining} 条遗漏评论，5秒后触发补全任务...")
            # 短暂延迟后触发补全任务（避免立即递归导致资源争抢）
            time.sleep(5)
            task_extract_insights.apply_async(
                args=[product_id],
                countdown=10  # 10秒后执行，避免任务堆积
            )
            logger.info(f"[跨语言洞察] 🔄 补全任务已触发，将处理 {remaining} 条遗漏评论")
        
        # [FIX] 更新 Task 状态为完成
        if task_record:
            task_record.status = TaskStatus.COMPLETED.value
            task_record.processed_items = already_processed + processed  # 最终处理数
            db.commit()
        
        return {
            "product_id": product_id,
            "total_reviews": total_reviews,  # [UPDATED] 跨语言模式：总评论数（不再是已翻译数）
            "processed": processed,
            "insights_extracted": insights_extracted,
            "remaining": remaining  # [NEW] 返回剩余未处理数
        }
        
    except Exception as e:
        logger.error(f"Insight extraction failed for product {product_id}: {e}")
        # [NEW] 更新 Task 状态为失败
        if task_record:
            task_record.status = TaskStatus.FAILED.value
            task_record.error_message = str(e)
            db.commit()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== 任务4: 主题高亮提取 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30, time_limit=1800, soft_time_limit=1700)
def task_extract_themes(self, product_id: str):
    """
    Extract 5W theme keywords for already translated reviews.
    
    This task:
    1. **[NEW] Auto-generates 5W context labels if not exists (Definition phase)**
    2. Gets all translated reviews that don't have theme highlights yet
    3. **[NEW] Uses context labels for forced categorization (Execution phase)**
    4. Calls AI to extract 5W themes with evidence and explanation
    5. Saves theme highlights to database
    
    Args:
        product_id: UUID of the product
    """
    from app.models.review import Review
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.product_context_label import ProductContextLabel
    from app.models.task import Task, TaskType, TaskStatus
    from app.services.translation import translation_service
    from sqlalchemy import delete, exists, func
    
    # 🚦 慢车道：启动随机延迟
    startup_delay = random.uniform(0.2, 1.0)
    logger.info(f"[主题提取] 🐢 慢车道启动，延迟 {startup_delay:.2f}s")
    time.sleep(startup_delay)
    
    logger.info(f"Starting theme extraction for product {product_id}")
    
    db = get_sync_db()
    task_record = None
    
    try:
        # [NEW] Step 1: 检查是否有 5W 标签库，如果没有则自动生成
        label_count_result = db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product_id)
        )
        label_count = label_count_result.scalar() or 0
        
        context_schema = None
        labels_generated = False
        
        if label_count == 0:
            logger.info(f"产品 {product_id} 暂无 5W 标签库，开始自动学习...")
            
            # [NEW] 先获取产品信息（标题和五点）
            from app.models.product import Product
            import json as json_lib
            
            product_result = db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = product_result.scalar_one_or_none()
            
            product_title = ""
            bullet_points = []
            
            if product:
                product_title = product.title or ""
                # 解析五点（存储为 JSON 字符串）
                if product.bullet_points:
                    try:
                        bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
                    except:
                        bullet_points = []
                logger.info(f"📦 产品信息：{product.asin}，标题长度={len(product_title)}，五点={len(bullet_points)}条")
            
            # 获取已翻译的评论样本（至少10条）
            sample_result = db.execute(
                select(Review.body_original, Review.body_translated)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == "completed",
                        Review.body_translated.isnot(None),
                        Review.is_deleted == False
                    )
                )
                .order_by(Review.created_at.desc())
                .limit(50)
            )
            sample_reviews = sample_result.all()
            
            # [UPDATED 2026-01-19] 降低最低样本要求，只要有评论就进行学习
            if len(sample_reviews) >= 1:
                # 准备样本文本
                sample_texts = []
                for row in sample_reviews:
                    text = row.body_translated or row.body_original
                    if text and text.strip():
                        sample_texts.append(text.strip())
                
                if len(sample_texts) >= 1:
                    logger.info(f"📝 样本数量: {len(sample_texts)} 条，开始学习 5W 标签库...")
                    # [UPDATED] 调用 AI 学习标签库（传入产品信息）
                    learned_labels = translation_service.learn_context_labels(
                        reviews_text=sample_texts,
                        product_title=product_title,      # [NEW] 产品标题
                        bullet_points=bullet_points       # [NEW] 五点卖点
                    )
                    
                    if learned_labels:
                        # 存入数据库（扩展版：buyer/user 替代 who）
                        for context_type in ["buyer", "user", "who", "where", "when", "why", "what"]:
                            labels = learned_labels.get(context_type, [])
                            for item in labels:
                                if isinstance(item, dict) and item.get("name"):
                                    label = ProductContextLabel(
                                        product_id=product_id,
                                        type=context_type,
                                        name=item["name"].strip(),
                                        description=item.get("description", "").strip() or None,
                                        count=0,
                                        is_ai_generated=True
                                    )
                                    db.add(label)
                        
                        db.commit()
                        labels_generated = True
                        total_labels = sum(len(v) for v in learned_labels.values())
                        logger.info(f"✅ 自动生成 5W 标签库成功，共 {total_labels} 个标签")
                    else:
                        logger.warning(f"⚠️ AI 学习标签库失败，将使用开放提取模式")
                else:
                    logger.warning(f"⚠️ 没有有效样本，将使用开放提取模式")
            else:
                logger.warning(f"⚠️ 没有可用评论，将使用开放提取模式")
        
        # Step 2: 获取标签库 Schema（如果存在或刚生成）
        if label_count > 0 or labels_generated:
            label_result = db.execute(
                select(ProductContextLabel)
                .where(ProductContextLabel.product_id == product_id)
                .order_by(ProductContextLabel.type, ProductContextLabel.created_at)
            )
            labels = label_result.scalars().all()
            
            if labels:
                context_schema = {}
                for label in labels:
                    if label.type not in context_schema:
                        context_schema[label.type] = []
                    context_schema[label.type].append({
                        "name": label.name,
                        "description": label.description or ""
                    })
                logger.info(f"✅ 使用 5W 标签库进行强制归类，共 {len(labels)} 个标签")
        else:
            logger.info(f"ℹ️ 未使用标签库，将使用开放提取模式")
        
        # [UPDATED] 跨语言模式：获取有原文的评论（不再依赖翻译），排除已有主题的评论
        # Use a subquery to check for existing theme highlights
        theme_exists_subquery = (
            select(ReviewThemeHighlight.id)
            .where(ReviewThemeHighlight.review_id == Review.id)
            .exists()
        )
        
        # Ordered by review_date to match page display order
        result = db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),  # [UPDATED] 只需有原文即可，不再依赖翻译
                    Review.is_deleted == False,
                    ~theme_exists_subquery  # Reviews without theme highlights
                )
            )
            .order_by(Review.review_date.desc().nullslast(), Review.created_at.desc())
        )
        reviews = result.scalars().all()
        
        total_reviews = len(reviews)
        processed = 0
        themes_extracted = 0
        
        logger.info(f"[跨语言5W] Found {total_reviews} reviews for theme extraction (no translation required)")
        
        # [NEW] 创建/更新任务记录，启用心跳
        if total_reviews > 0:
            task_record = get_or_create_task(
                db=db,
                product_id=product_id,
                task_type=TaskType.THEMES.value,
                total_items=total_reviews,
                celery_task_id=self.request.id
            )
            logger.info(f"任务记录已创建: {task_record.id}")
        
        # 🔥 优先从 Redis 缓存获取标签映射表（避免频繁查 PostgreSQL）
        label_id_map = label_cache.get_label_id_map(str(product_id))
        
        if label_id_map:
            logger.info(f"[标签缓存] ✅ 命中缓存，共 {len(label_id_map)} 个标签")
        elif context_schema:
            # 缓存未命中，从数据库构建并缓存
            label_id_map = {}
            for label in labels:
                key = (label.type, label.name)
                label_id_map[key] = label.id
            
            # 存入 Redis 缓存
            label_cache.set_label_id_map(str(product_id), label_id_map)
            logger.info(f"[标签缓存] ⚡ 已构建并缓存 {len(label_id_map)} 个标签")
        else:
            label_id_map = {}
            logger.debug(f"无标签库，使用开放提取模式")
        
        # 🚀 并行协程优化：使用 gevent pool 并行调用 AI API
        # 支持环境变量配置，服务器 B 可以使用更高的值
        import os
        PARALLEL_SIZE = int(os.environ.get('THEME_PARALLEL_SIZE', '150'))  # 40K RPM 优化：80→150
        
        # 🔥 [OPTIMIZED] BATCH_SIZE = PARALLEL_SIZE，充分利用并行池
        # 之前 BATCH_SIZE=20 限制了真实并发，现在与 PARALLEL_SIZE 同步
        BATCH_SIZE = PARALLEL_SIZE
        pending_themes = []  # 待提交的主题列表
        
        logger.info(f"[并行优化-主题] 使用 PARALLEL_SIZE={PARALLEL_SIZE} 并行处理, BATCH_SIZE={BATCH_SIZE} 批量入库")
        
        # [UPDATED] 跨语言模式：只使用英文原文进行5W主题提取
        def process_single_theme(review):
            """并行处理单条评论的主题提取（跨语言模式：英文输入→中文输出）"""
            try:
                themes = translation_service.extract_themes(
                    original_text=review.body_original or "",
                    # [UPDATED] 不再传入 translated_text，跨语言模式直接从原文提取
                    context_schema=context_schema
                )
                return {
                    "review_id": review.id,
                    "themes": themes,
                    "success": True
                }
            except Exception as e:
                logger.error(f"[跨语言5W] Failed to extract themes for review {review.id}: {e}")
                return {
                    "review_id": review.id,
                    "themes": None,
                    "success": False,
                    "error": str(e)
                }
        
        # 使用 gevent pool 并行处理
        from gevent.pool import Pool
        pool = Pool(PARALLEL_SIZE)
        
        # 分批并行处理
        for batch_start in range(0, total_reviews, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, total_reviews)
            batch_reviews = reviews[batch_start:batch_end]
            
            # 🚀 并行调用 AI API
            results = pool.map(process_single_theme, batch_reviews)
            
            # 处理结果
            batch_themes_count = 0
            for result in results:
                # [FIX 2026-01-15] 区分"成功但空结果"和"失败"
                # - success=True, themes={} → 成功但无主题（符合"有勇气说没有"规则），不创建记录
                # - success=False → 真正的失败，需要重试
                if result["success"]:
                    # 成功：处理有主题的情况，空字典表示AI判定无主题，这是正确的
                    themes = result.get("themes", {})
                    if themes:  # 只有当themes非空时才处理
                        for theme_type, items in themes.items():
                            if not items or len(items) == 0:
                                continue
                            
                            for item in items:
                                label_name = item.get("content", "").strip()
                                quote = item.get("quote") or item.get("content_original") or None
                                quote_translated = item.get("quote_translated") or item.get("content_translated") or None
                                explanation = item.get("explanation") or None
                                # [NEW 2026-01-15] 获取置信度
                                confidence = item.get("confidence", "high")
                                if confidence not in ("high", "medium", "low"):
                                    confidence = "high"
                                
                                if not label_name:
                                    continue
                                
                                context_label_id = label_id_map.get((theme_type, label_name))
                                
                                theme_highlight = ReviewThemeHighlight(
                                    review_id=result["review_id"],
                                    theme_type=theme_type,
                                    label_name=label_name,
                                    quote=quote,
                                    quote_translated=quote_translated,
                                    explanation=explanation,
                                    confidence=confidence,  # [NEW] 置信度
                                    context_label_id=context_label_id,
                                    items=[item]
                                )
                                pending_themes.append(theme_highlight)
                                batch_themes_count += 1
                    else:
                        # 🔥 [FIX 2026-01-15] themes为空字典，表示AI判定该评论无主题
                        # 创建一个 skipped 类型的记录，避免被标记为"遗漏"而无限重试
                        skipped_highlight = ReviewThemeHighlight(
                            review_id=result["review_id"],
                            theme_type="skipped",
                            label_name="无主题",
                            quote=None,
                            quote_translated=None,
                            explanation="AI判定该评论内容过短或无明确5W主题信息",
                            confidence="high",
                            context_label_id=None,
                            items=[]
                        )
                        pending_themes.append(skipped_highlight)
                        logger.debug(f"[跨语言5W] 评论 {result['review_id']} AI判定无主题，创建skipped标记")
                else:
                    # 🛡️ [FIX v3] 基于重试次数判断，避免无限循环
                    # 使用 Redis 记录失败次数，超过 3 次就标记为"AI判定无法提取"
                    from app.core.redis import get_sync_redis
                    redis_client = get_sync_redis()
                    review_id_str = str(result["review_id"])
                    retry_key = f"theme_retry:{review_id_str}"
                    
                    # 增加失败计数
                    retry_count = redis_client.incr(retry_key)
                    redis_client.expire(retry_key, 86400)  # 24小时后过期
                    
                    if retry_count >= 3:
                        # 已重试 3 次，AI 仍无法提取，标记为"已处理"
                        review_obj = next((r for r in reviews if str(r.id) == review_id_str), None)
                        review_text = review_obj.body_original[:100] if review_obj and review_obj.body_original else None
                        
                        empty_marker = ReviewThemeHighlight(
                            review_id=result["review_id"],
                            theme_type="skipped",
                            label_name="_ai_no_content",
                            quote=review_text,
                            explanation=f"AI多次尝试后判定无法提取有意义主题（重试{retry_count}次）"
                        )
                        pending_themes.append(empty_marker)
                        redis_client.delete(retry_key)  # 清除计数
                        logger.info(f"[跨语言主题] ⏭️ 评论 {review_id_str} 重试{retry_count}次后AI判定无法提取，标记为已处理")
                    else:
                        # 未达到重试上限，允许下次重试
                        error_msg = result.get("error", "Unknown error")
                        logger.warning(f"[跨语言主题] ⚠️ 评论 {review_id_str} 提取失败(第{retry_count}次): {error_msg}，将在下次任务中重试")
                
                processed += 1
            
            themes_extracted += batch_themes_count
            
            # 🔥 批量提交数据库
            if pending_themes:
                db.add_all(pending_themes)
                db.commit()
                logger.info(f"[并行入库] 已提交 {len(pending_themes)} 条主题（进度: {processed}/{total_reviews}）")
                pending_themes = []
                # 注：缓存通过 API 层 2 秒 TTL 自动过期，无需在此处手动清除
            
            # 更新 Task 进度
            if task_record:
                update_task_heartbeat(db, str(task_record.id), processed_items=processed)
            
            # [OPTIMIZED] 批次间微小休息，阿里云 API 限流一般 60-100 QPS，0.05s 足够
            time.sleep(0.05)
        
        # 🔥 提交剩余的待处理主题
        if pending_themes:
            db.add_all(pending_themes)
            db.commit()
            logger.info(f"[并行入库] 最终提交 {len(pending_themes)} 条主题")
        
        logger.info(f"Theme extraction completed: {processed}/{total_reviews} reviews processed, {themes_extracted} theme entries created")
        
        # 🔥 [NEW 2026-01-15] 同步更新 context_labels 的 count 值
        # 根据 review_theme_highlights 表中的关联情况，更新统计数量
        if themes_extracted > 0 and context_schema:
            try:
                from sqlalchemy import update as sql_update
                
                # 获取所有关联的 label 统计
                count_result = db.execute(
                    select(ReviewThemeHighlight.context_label_id, func.count(ReviewThemeHighlight.id))
                    .join(Review, ReviewThemeHighlight.review_id == Review.id)
                    .where(
                        and_(
                            Review.product_id == product_id,
                            ReviewThemeHighlight.context_label_id.isnot(None)
                        )
                    )
                    .group_by(ReviewThemeHighlight.context_label_id)
                )
                label_counts = {row[0]: row[1] for row in count_result.all()}
                
                # 批量更新 count 字段
                if label_counts:
                    for label_id, count in label_counts.items():
                        db.execute(
                            sql_update(ProductContextLabel)
                            .where(ProductContextLabel.id == label_id)
                            .values(count=count)
                        )
                    db.commit()
                    logger.info(f"[5W标签同步] ✅ 已更新 {len(label_counts)} 个标签的 count 值")
            except Exception as count_error:
                logger.error(f"[5W标签同步] ❌ 更新 count 失败: {count_error}")
        
        # 🚀 缓存失效 - 主题提取完成后清除产品相关缓存
        if themes_extracted > 0:
            try:
                from app.core.cache import get_cache_service_sync
                from app.models.product import Product
                product_result = db.execute(select(Product).where(Product.id == product_id))
                product = product_result.scalar_one_or_none()
                if product:
                    cache = get_cache_service_sync()
                    cache.invalidate_all_for_product(product.asin)
                    logger.info(f"[Cache] Invalidated caches for product {product.asin} after theme extraction")
            except Exception as cache_error:
                logger.warning(f"[Cache] Failed to invalidate cache: {cache_error}")
        
        # 🛡️ [NEW] 末尾补全检查：确保没有遗漏的评论
        # 重新查询是否有遗漏（可能因为时序问题或处理失败）
        final_check_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.is_deleted == False,
                    ~theme_exists_subquery
                )
            )
        )
        remaining = final_check_result.scalar() or 0
        
        if remaining > 0:
            logger.warning(f"[跨语言主题] ⚠️ 发现 {remaining} 条遗漏评论，5秒后触发补全任务...")
            # 短暂延迟后触发补全任务（避免立即递归导致资源争抢）
            time.sleep(5)
            task_extract_themes.apply_async(
                args=[product_id],
                countdown=10  # 10秒后执行，避免任务堆积
            )
            logger.info(f"[跨语言主题] 🔄 补全任务已触发，将处理 {remaining} 条遗漏评论")
        
        # [NEW] 更新 Task 状态为完成
        if task_record:
            task_record.status = TaskStatus.COMPLETED.value
            task_record.total_items = total_reviews
            task_record.processed_items = processed
            db.commit()
        
        # [NOTE 2026-01-22] 维度总结改为用户手动触发（通过分享页面的"生成AI分析"按钮）
        # 不再自动触发，避免在数据不完整时生成，同时节省AI调用成本
        
        return {
            "product_id": product_id,
            "total_reviews": total_reviews,
            "processed": processed,
            "themes_extracted": themes_extracted,
            "remaining": remaining  # [NEW] 返回剩余未处理数
        }
        
    except Exception as e:
        logger.error(f"Theme extraction failed for product {product_id}: {e}")
        # [NEW] 更新 Task 状态为失败
        if task_record:
            task_record.status = TaskStatus.FAILED.value
            task_record.error_message = str(e)
            db.commit()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 任务5: 流式轻量翻译 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_ingest_translation_only(self, product_id: str):
    """
    流式轻量翻译任务 (Stream Translation Only)
    
    数据入库后立即运行，只负责：
    1. Title/BulletPoints 翻译
    2. Review Text 翻译
    
    不负责：
    - 维度提取
    - 洞察分析
    - 主题提取
    
    设计理念：让用户在前台"边采边看"翻译结果
    
    🔒 并发策略：使用 PostgreSQL 行级锁（SELECT FOR UPDATE SKIP LOCKED）
       - 多个任务可以并发处理同一产品的不同评论
       - 自动避免重复处理同一条评论
       - 无需手动管理分布式锁
    
    Args:
        product_id: 产品 UUID
    """
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.services.translation import translation_service
    import json
    
    # 🚦 慢车道：启动随机延迟（更大的延迟，避免瞬间冲高 QPS）
    startup_delay = random.uniform(0.2, 1.0)
    logger.info(f"[翻译任务] 🐢 慢车道启动，延迟 {startup_delay:.2f}s")
    time.sleep(startup_delay)
    
    logger.info(f"[流式翻译] 开始处理产品 {product_id}")
    
    db = get_sync_db()
    product_asin = None  # 用于 finally 中释放锁
    
    try:
        # 1. 获取产品信息
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[流式翻译] 产品 {product_id} 不存在")
            return {"success": False, "error": "Product not found"}
        
        product_asin = product.asin  # 保存 asin 用于释放锁
        
        # 2. 翻译产品标题（如果未翻译）
        if product.title and not product.title_translated:
            try:
                product.title_translated = translation_service.translate_product_title(product.title)
                logger.info(f"[流式翻译] 标题翻译完成: {product.title_translated[:30]}...")
            except Exception as e:
                logger.warning(f"[流式翻译] 标题翻译失败: {e}")
        
        # 3. 翻译五点描述（如果未翻译）
        if product.bullet_points and not product.bullet_points_translated:
            try:
                # Parse bullet points from JSON, PostgreSQL array, or Python list
                bullet_points = []
                if isinstance(product.bullet_points, list):
                    bullet_points = product.bullet_points
                elif isinstance(product.bullet_points, str):
                    bp_str = product.bullet_points.strip()
                    # 尝试 JSON 格式 [...]
                    if bp_str.startswith('['):
                        bullet_points = json.loads(bp_str)
                    # 处理 PostgreSQL 数组格式 {...}
                    elif bp_str.startswith('{') and bp_str.endswith('}'):
                        import re
                        content = bp_str[1:-1]  # 移除 { }
                        matches = re.findall(r'"([^"]*)"', content)
                        if matches:
                            bullet_points = matches
                        else:
                            bullet_points = [s.strip() for s in content.split(',') if s.strip()]
                    else:
                        try:
                            bullet_points = json.loads(bp_str)
                        except:
                            bullet_points = [bp_str] if bp_str else []
                    
                if bullet_points and len(bullet_points) > 0:
                    translated_bullets = translation_service.translate_bullet_points(bullet_points)
                    # 统一保存为 JSON 字符串格式
                    product.bullet_points_translated = json.dumps(translated_bullets, ensure_ascii=False)
                    logger.info(f"[流式翻译] 五点翻译完成: {len(translated_bullets)} 条")
            except Exception as e:
                logger.warning(f"[流式翻译] 五点翻译失败: {e}")
        
        db.commit()
        
        # =========================================================================
        # 4. 🎯 智能批量翻译（差异化处理：VIP单独/标准5条/短评20条）
        # =========================================================================
        # 
        # 策略：
        # - VIP 评论（>200字或极端星级>100字）：单独翻译，保证质量
        # - 标准评论（50-200字）：5 条一批
        # - 短评论（≤50字）：20 条一批，最大化效率
        #
        # 优势：
        # - 质量保证：重要评论不降低翻译质量
        # - 效率最大化：短评论 QPS 消耗降低 20 倍
        # - 灵活平衡：中等评论兼顾质量和效率
        #
        translated_count = 0
        failed_count = 0
        
        # 统计不同类别的处理情况
        category_stats = {
            'vip': {'total': 0, 'success': 0},
            'standard': {'total': 0, 'success': 0},
            'short': {'total': 0, 'success': 0}
        }
        
        # 每次获取更多评论，按分类处理
        MAX_FETCH_SIZE = 100  # 每次最多获取 100 条待翻译评论
        
        while True:
            # 🔒 获取待翻译评论（使用 PostgreSQL 行级锁）
            # [FIXED] 只处理 pending 状态，不再自动重试 failed（避免内容审查失败无限循环）
            pending_result = db.execute(
                select(Review)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.PENDING.value,
                        Review.is_deleted == False
                    )
                )
                .order_by(Review.created_at.desc())
                .limit(MAX_FETCH_SIZE)
                .with_for_update(skip_locked=True)
            )
            pending_reviews = pending_result.scalars().all()
            
            if not pending_reviews:
                logger.info(f"[智能翻译] 没有更多待翻译的评论")
                break
            
            # 🎯 按长度和质量分类
            grouped_reviews = ReviewClassifier.group_reviews(pending_reviews)
            
            logger.info(
                f"[智能翻译] 📊 评论分类: "
                f"VIP={len(grouped_reviews['vip'])} | "
                f"标准={len(grouped_reviews['standard'])} | "
                f"短评={len(grouped_reviews['short'])}"
            )
            
            # 处理顺序：短评 → 标准 → VIP（优先快速处理大量短评）
            for category in ['short', 'standard', 'vip']:
                reviews = grouped_reviews[category]
                if not reviews:
                    continue
                
                batch_size = ReviewClassifier.get_batch_size(category)
                category_stats[category]['total'] += len(reviews)
                
                logger.info(f"[智能翻译] 🚀 处理 {category} 类评论: {len(reviews)} 条，批量大小={batch_size}")
                
                # 按批量大小分批处理
                for i in range(0, len(reviews), batch_size):
                    batch = reviews[i:i+batch_size]
                    
                    # 标记为处理中
                    for review in batch:
                        review.translation_status = TranslationStatus.PROCESSING.value
                    db.commit()
                    
                    # 构建批量翻译请求
                    batch_input = []
                    for review in batch:
                        text = review.body_original or ""
                        if text.strip():
                            batch_input.append({
                                "id": str(review.id),
                                "text": text
                            })
                    
                    # 🔥 批量翻译（VIP=1条，标准=5条，短评=20条）
                    try:
                        if batch_size == 1:
                            # VIP 评论：单独翻译
                            review = batch[0]
                            translated = translation_service.translate_text(review.body_original)
                            batch_results = {str(review.id): translated}
                        else:
                            # 标准/短评：批量翻译
                            batch_results = translation_service.translate_batch_with_fallback(batch_input)
                        
                        logger.info(f"[智能翻译] {category} 批次翻译完成: {len(batch_results)}/{len(batch)} 条")
                    except Exception as e:
                        logger.error(f"[智能翻译] {category} 批次翻译失败: {e}")
                        batch_results = {}
                    
                    # 批量更新数据库
                    for review in batch:
                        review_id_str = str(review.id)
                        
                        if review_id_str in batch_results and batch_results[review_id_str]:
                            # 翻译成功
                            review.body_translated = batch_results[review_id_str]
                            
                            # 标题单独翻译
                            if review.title_original and not review.title_translated:
                                try:
                                    review.title_translated = translation_service.translate_text(review.title_original)
                                except:
                                    pass
                            
                            # 情感分析
                            try:
                                sentiment = translation_service.analyze_sentiment(review.body_translated)
                                review.sentiment = sentiment.value
                            except:
                                review.sentiment = "neutral"
                            
                            review.translation_status = TranslationStatus.COMPLETED.value
                            translated_count += 1
                            category_stats[category]['success'] += 1
                        else:
                            # 翻译失败
                            review.translation_status = TranslationStatus.FAILED.value
                            failed_count += 1
                    
                    # 提交本批更新
                    db.commit()
                    
                    # 短暂延迟，避免 QPS 冲高
                    time.sleep(0.3 if batch_size == 1 else 0.5)
            
            # 如果获取的评论少于 MAX_FETCH_SIZE，说明没有更多了
            if len(pending_reviews) < MAX_FETCH_SIZE:
                break
        
        # 输出统计信息
        logger.info(
            f"[智能翻译] ✅ 完成: 总计 {translated_count} 条成功, {failed_count} 条失败\n"
            f"  📊 VIP 评论: {category_stats['vip']['success']}/{category_stats['vip']['total']} 条\n"
            f"  📊 标准评论: {category_stats['standard']['success']}/{category_stats['standard']['total']} 条\n"
            f"  📊 短评论: {category_stats['short']['success']}/{category_stats['short']['total']} 条"
        )
        
        logger.info(f"[流式翻译] 完成: 翻译 {translated_count} 条, 失败 {failed_count} 条")
        
        # 🚀 缓存失效 - 翻译完成后清除产品相关缓存
        if translated_count > 0:
            try:
                from app.core.cache import get_cache_service_sync
                cache = get_cache_service_sync()
                cache.invalidate_all_for_product(product.asin)
                logger.info(f"[Cache] Invalidated caches for product {product.asin} after translation")
            except Exception as cache_error:
                logger.warning(f"[Cache] Failed to invalidate cache: {cache_error}")
        
        return {
            "success": True,
            "product_id": product_id,
            "translated_count": translated_count,
            "failed_count": failed_count
        }
        
    except Exception as e:
        logger.error(f"[流式翻译] 产品 {product_id} 处理失败: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()
        # 🔒 PostgreSQL 行级锁会在事务结束时自动释放
        
        # 🔓 释放 Redis 翻译任务锁，允许后续新评论触发翻译
        if product_asin:
            try:
                from app.core.redis import get_sync_redis
                redis_client = get_sync_redis()
                redis_client.delete(f"lock:translation:{product_asin}")
                logger.debug(f"[流式翻译] 已释放产品 {product_asin} 的翻译锁")
            except Exception as e:
                logger.warning(f"[流式翻译] 释放翻译锁失败: {e}")


# ============== [NEW] 任务6: 科学学习与全量回填 ==============

@celery_app.task(bind=True, max_retries=1, default_retry_delay=60)
def task_scientific_learning_and_analysis(self, product_id: str):
    """
    科学学习与全量回填任务 (Scientific Learning & Backfill)
    
    用户点击"开始分析"或采集完成后触发。
    利用英文原文进行 Schema 学习，然后回填所有数据。
    
    流程：
    1. 科学采样（基于英文原文，不等待翻译）
    2. 跨语言零样本学习（维度 + 5W标签）
    3. 全量洞察回填（对已翻译的评论提取洞察）
    4. 全量主题回填（对已翻译的评论提取5W主题）
    
    Args:
        product_id: 产品 UUID
    """
    from app.models.product import Product
    from app.models.product_dimension import ProductDimension
    from app.models.product_context_label import ProductContextLabel
    from app.services.translation import translation_service
    import json as json_lib
    import asyncio
    
    logger.info(f"[科学学习] 开始处理产品 {product_id}")
    
    db = get_sync_db()
    
    try:
        # === Step 0: 获取产品信息 ===
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[科学学习] 产品 {product_id} 不存在")
            return {"success": False, "error": "Product not found"}
        
        # 解析产品信息
        product_title = product.title or ""
        bullet_points = []
        if product.bullet_points:
            try:
                bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
            except:
                bullet_points = []
        
        # === Step 1: 科学采样（基于英文原文）===
        logger.info(f"[科学学习] Step 1: 科学采样中...")
        
        # 需要同步方式执行异步方法
        from app.services.review_service import ReviewService
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from app.core.config import settings
        from app.models.review import Review
        
        # 使用同步查询获取科学采样
        sample_stmt = (
            select(Review.body_original)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.body_original != "",
                    Review.is_deleted == False
                )
            )
            .order_by(Review.helpful_votes.desc(), func.length(Review.body_original).desc())
            .limit(50)
        )
        sample_result = db.execute(sample_stmt)
        raw_samples = [r[0] for r in sample_result.all() if r[0] and r[0].strip()]
        
        # [UPDATED 2026-01-19] 移除最低样本数限制，只要有评论就进行学习
        if len(raw_samples) < 1:
            logger.warning(f"[科学学习] 没有可用样本，跳过学习")
            return {"success": False, "error": "没有可用评论样本"}
        
        logger.info(f"[科学学习] 样本数量: {len(raw_samples)} 条英文评论")
        
        logger.info(f"[科学学习] 采样完成: {len(raw_samples)} 条高质量英文评论")
        
        # === Step 2: 跨语言零样本学习 ===
        logger.info(f"[科学学习] Step 2: 跨语言零样本学习中...")
        
        # 2.1 学习维度（如果不存在）
        # [UPDATED 2026-01-16] 支持3类维度体系
        dim_count_result = db.execute(
            select(func.count(ProductDimension.id))
            .where(ProductDimension.product_id == product_id)
        )
        dim_count = dim_count_result.scalar() or 0
        
        dimensions_learned = 0
        if dim_count == 0:
            logger.info(f"[科学学习] 学习3类产品维度中...")
            
            # [FIX 2026-01-19] 增加重试机制，最多重试3次
            dims_result = None
            max_retries = 3
            for attempt in range(max_retries):
                dims_result = translation_service.learn_dimensions_from_raw(
                    raw_reviews=raw_samples,
                    product_title=product_title,
                    bullet_points="\n".join(bullet_points) if bullet_points else ""
                )
                if dims_result and isinstance(dims_result, dict):
                    break  # 学习成功
                logger.warning(f"[科学学习] 维度学习第 {attempt + 1} 次失败，"
                              f"{'重试中...' if attempt < max_retries - 1 else '已达最大重试次数'}")
                if attempt < max_retries - 1:
                    time.sleep(2)  # 等待 2 秒后重试
            
            # [UPDATED 2026-01-16] 解析3类维度并保存
            if dims_result and isinstance(dims_result, dict):
                # 新格式：3类维度
                for dim_type in ["product", "scenario", "emotion"]:
                    type_dims = dims_result.get(dim_type, [])
                    for dim in type_dims:
                        if isinstance(dim, dict) and dim.get("name"):
                            dimension = ProductDimension(
                                product_id=product_id,
                                name=dim["name"].strip(),
                                description=dim.get("description", "").strip() or None,
                                dimension_type=dim_type,  # [NEW] 设置维度类型
                                is_ai_generated=True
                            )
                            db.add(dimension)
                            dimensions_learned += 1
                db.commit()
                logger.info(f"[科学学习] 3类维度学习完成: {dimensions_learned} 个 "
                           f"(产品:{len(dims_result.get('product', []))}, "
                           f"场景:{len(dims_result.get('scenario', []))}, "
                           f"情绪:{len(dims_result.get('emotion', []))})")
            elif dims_result and isinstance(dims_result, list):
                # 向后兼容：旧格式（单一列表）
                for dim in dims_result:
                    dimension = ProductDimension(
                        product_id=product_id,
                        name=dim["name"],
                        description=dim.get("description", ""),
                        dimension_type="product",  # 默认为产品维度
                        is_ai_generated=True
                    )
                    db.add(dimension)
                    dimensions_learned += 1
                db.commit()
                logger.info(f"[科学学习] 维度学习完成(旧格式): {dimensions_learned} 个")
            else:
                # [FIX 2026-01-19] 维度学习失败，阻断流程
                logger.error(f"[科学学习] ❌ 维度学习失败（重试 {max_retries} 次后仍然失败），阻断后续流程")
                raise ValueError(f"维度学习失败，无法继续分析流程。请检查 AI 服务或重试。")
        else:
            logger.info(f"[科学学习] 产品已有 {dim_count} 个维度，跳过学习")
        
        # 2.2 学习5W标签（如果不存在）
        label_count_result = db.execute(
            select(func.count(ProductContextLabel.id))
            .where(ProductContextLabel.product_id == product_id)
        )
        label_count = label_count_result.scalar() or 0
        
        labels_learned = 0
        if label_count == 0:
            logger.info(f"[科学学习] 学习5W标签库中...")
            labels = translation_service.learn_context_labels_from_raw(
                raw_reviews=raw_samples,
                product_title=product_title,
                bullet_points=bullet_points
            )
            
            if labels:
                # [UPDATED 2026-01-14] 支持 buyer/user 拆分
                for context_type in ["buyer", "user", "who", "where", "when", "why", "what"]:
                    type_labels = labels.get(context_type, [])
                    for item in type_labels:
                        if isinstance(item, dict) and item.get("name"):
                            label = ProductContextLabel(
                                product_id=product_id,
                                type=context_type,
                                name=item["name"].strip(),
                                description=item.get("description", "").strip() or None,
                                count=0,
                                is_ai_generated=True
                            )
                            db.add(label)
                            labels_learned += 1
                db.commit()
                logger.info(f"[科学学习] 5W标签学习完成: {labels_learned} 个")
        else:
            logger.info(f"[科学学习] 产品已有 {label_count} 个5W标签，跳过学习")
        
        # === Step 3: 触发全量洞察回填 ===
        logger.info(f"[科学学习] Step 3: 触发全量洞察回填...")
        task_extract_insights.delay(product_id)
        
        # === Step 4: 触发全量主题回填 ===
        logger.info(f"[科学学习] Step 4: 触发全量主题回填...")
        task_extract_themes.delay(product_id)
        
        logger.info(f"[科学学习] 完成: 维度 +{dimensions_learned}, 标签 +{labels_learned}")
        
        return {
            "success": True,
            "product_id": product_id,
            "samples_used": len(raw_samples),
            "dimensions_learned": dimensions_learned,
            "labels_learned": labels_learned,
            "backfill_triggered": True
        }
        
    except Exception as e:
        logger.error(f"[科学学习] 产品 {product_id} 处理失败: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 任务7: 全自动分析（采集完成后触发）==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=120)
def task_full_auto_analysis(self, product_id: str, task_id: str):
    """
    🚀 全自动分析任务 (Full Auto Analysis Pipeline) - 流式并行优化版
    
    采集完成后自动触发，执行完整的分析流水线。
    
    ⭐ 核心优化：翻译在 ingest 时就已开始（流式上传边存边译）
    
    流式并行流程：
    
    [数据采集阶段 - 在此任务触发之前]
    ─────────────────────────────────────────────────────────────
    插入数据 → 立即触发翻译（task_ingest_translation_only）
    插入数据 → 立即触发翻译
    ...（持续进行中）
    
    [采集完成后触发此任务]
    ─────────────────────────────────────────────────────────────
    Step 1: 学习维度+5W标签（基于英文原文，不等翻译）
                              ↓
    Step 2: 触发洞察+主题提取（翻译此时已在进行中！）
                              ↓
    Step 3: 等待三任务并行完成
            ├─ 翻译（已在进行，会先完成）
            ├─ 洞察提取（边翻译边提取）
            └─ 主题提取（边翻译边提取）
                              ↓
    Step 4: 生成综合战略版报告
    
    时间优化：
    - 翻译在采集时就开始 → 不等待
    - 学习基于英文原文 → 不依赖翻译
    - 三任务并行执行 → 大幅减少等待时间
    - 预计节省 50%+ 的总时间
    
    Args:
        product_id: 产品 UUID
        task_id: AUTO_ANALYSIS 任务 UUID（用于更新进度）
    """
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    from app.models.task import Task, TaskStatus, TaskType
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.report import ProductReport, ReportType, ReportStatus
    from app.services.translation import translation_service
    from datetime import datetime, timezone
    import json as json_lib
    
    # 🚦 VIP 快车道：启动随机延迟（避免 Worker 重启时瞬间冲高 QPS）
    startup_delay = random.uniform(0.1, 0.5)
    logger.info(f"[全自动分析] 🌟 VIP 快车道启动，延迟 {startup_delay:.2f}s（防止 QPS 冲高）")
    time.sleep(startup_delay)
    
    logger.info(f"[全自动分析] 🚀 开始处理产品 {product_id}，任务 {task_id}")
    
    db = get_sync_db()
    
    def update_task_progress(step: int, status: str = TaskStatus.PROCESSING.value, error: str = None):
        """更新任务进度"""
        try:
            task_update = {
                "processed_items": step,
                "status": status,
                "last_heartbeat": datetime.now(timezone.utc)
            }
            if error:
                task_update["error_message"] = error
            db.execute(
                update(Task)
                .where(Task.id == task_id)
                .values(**task_update)
            )
            db.commit()
        except Exception as e:
            logger.error(f"[全自动分析] 更新任务进度失败: {e}")
    
    try:
        # ==========================================
        # Step 0: 等待入库队列清空（确保所有评论都已入库）
        # ==========================================
        # 🛡️ 防护机制：避免因时序竞态导致评论遗漏
        from app.core.redis import ReviewIngestionQueueSync, get_sync_redis
        redis_cli = get_sync_redis()
        queue = ReviewIngestionQueueSync(redis_cli)
        
        max_wait = 60  # 最多等待 60 秒
        waited = 0
        while waited < max_wait:
            queue_len = queue.length()
            if queue_len == 0:
                logger.info("[全自动分析] ✅ 入库队列已清空，所有评论已入库")
                break
            logger.info(f"[全自动分析] ⏳ 等待入库队列清空... 剩余 {queue_len} 条")
            time.sleep(5)
            waited += 5
        
        # 额外等待 5 秒，确保数据库事务完全提交
        if waited > 0:
            logger.info("[全自动分析] ⏳ 等待事务提交...")
            time.sleep(5)
        
        # 获取产品信息
        product_result = db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            logger.error(f"[全自动分析] 产品 {product_id} 不存在")
            update_task_progress(0, TaskStatus.FAILED.value, "产品不存在")
            return {"success": False, "error": "Product not found"}
        
        # ==========================================
        # Step 1: 科学学习（基于英文原文，不依赖翻译！）
        # ==========================================
        update_task_progress(1, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 1/3: 科学学习（基于英文原文）...")
        
        # 直接调用科学学习任务的逻辑（同步执行）
        from app.models.product_dimension import ProductDimension
        from app.models.product_context_label import ProductContextLabel
        
        # 解析产品信息
        product_title = product.title or ""
        bullet_points = []
        if product.bullet_points:
            try:
                bullet_points = json_lib.loads(product.bullet_points) if isinstance(product.bullet_points, str) else product.bullet_points
            except:
                bullet_points = []
        
        # 科学采样（基于英文原文）
        sample_stmt = (
            select(Review.body_original)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.body_original.isnot(None),
                    Review.body_original != "",
                    Review.is_deleted == False
                )
            )
            .order_by(Review.helpful_votes.desc(), func.length(Review.body_original).desc())
            .limit(50)
        )
        sample_result = db.execute(sample_stmt)
        raw_samples = [r[0] for r in sample_result.all() if r[0] and r[0].strip()]
        
        # [UPDATED 2026-01-19] 移除最低样本数限制，只要有评论就进行学习
        if len(raw_samples) >= 1:
            logger.info(f"[全自动分析] 样本数量: {len(raw_samples)} 条英文评论")
            # 学习维度
            dim_count_result = db.execute(
                select(func.count(ProductDimension.id))
                .where(ProductDimension.product_id == product_id)
            )
            dim_count = dim_count_result.scalar() or 0
            
            if dim_count == 0:
                logger.info(f"[全自动分析] 学习3类产品维度中...")
                
                # [FIX 2026-01-19] 增加重试机制，最多重试3次
                dims_result = None
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        dims_result = translation_service.learn_dimensions_from_raw(
                            raw_reviews=raw_samples,
                            product_title=product_title,
                            bullet_points="\n".join(bullet_points) if bullet_points else ""
                        )
                        if dims_result and isinstance(dims_result, dict):
                            break  # 学习成功
                        logger.warning(f"[全自动分析] 维度学习第 {attempt + 1} 次失败，"
                                      f"{'重试中...' if attempt < max_retries - 1 else '已达最大重试次数'}")
                    except Exception as e:
                        logger.error(f"[全自动分析] 维度学习第 {attempt + 1} 次异常: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(2)  # 等待 2 秒后重试
                
                # [UPDATED 2026-01-16] 支持3类维度体系
                dimensions_learned = 0
                if dims_result and isinstance(dims_result, dict):
                    # 新格式：3类维度
                    for dim_type in ["product", "scenario", "emotion"]:
                        type_dims = dims_result.get(dim_type, [])
                        for dim in type_dims:
                            if isinstance(dim, dict) and dim.get("name"):
                                dimension = ProductDimension(
                                    product_id=product_id,
                                    name=dim["name"].strip(),
                                    description=dim.get("description", "").strip() or None,
                                    dimension_type=dim_type,
                                    is_ai_generated=True
                                )
                                db.add(dimension)
                                dimensions_learned += 1
                    db.commit()
                    logger.info(f"[全自动分析] 3类维度学习完成: {dimensions_learned} 个 "
                               f"(产品:{len(dims_result.get('product', []))}, "
                               f"场景:{len(dims_result.get('scenario', []))}, "
                               f"情绪:{len(dims_result.get('emotion', []))})")
                elif dims_result and isinstance(dims_result, list):
                    # 向后兼容：旧格式
                    for dim in dims_result:
                        dimension = ProductDimension(
                            product_id=product_id,
                            name=dim["name"],
                            description=dim.get("description", ""),
                            dimension_type="product",
                            is_ai_generated=True
                        )
                        db.add(dimension)
                        dimensions_learned += 1
                    db.commit()
                    logger.info(f"[全自动分析] 维度学习完成(旧格式): {dimensions_learned} 个")
                else:
                    # [FIX 2026-01-19] 维度学习失败，阻断流程
                    logger.error(f"[全自动分析] ❌ 维度学习失败（重试 {max_retries} 次后仍然失败），阻断后续流程")
                    raise ValueError(f"维度学习失败，无法继续分析流程。请检查 AI 服务或重试。")
            
            # 学习5W标签
            label_count_result = db.execute(
                select(func.count(ProductContextLabel.id))
                .where(ProductContextLabel.product_id == product_id)
            )
            label_count = label_count_result.scalar() or 0
            
            if label_count == 0:
                logger.info(f"[全自动分析] 学习5W标签库中...")
                try:
                    labels = translation_service.learn_context_labels_from_raw(
                        raw_reviews=raw_samples,
                        product_title=product_title,
                        bullet_points=bullet_points
                    )
                    if labels:
                        labels_saved = 0
                        # [UPDATED 2026-01-14] 支持 buyer/user 拆分
                        for context_type in ["buyer", "user", "who", "where", "when", "why", "what"]:
                            type_labels = labels.get(context_type, [])
                            for item in type_labels:
                                if isinstance(item, dict) and item.get("name"):
                                    label = ProductContextLabel(
                                        product_id=product_id,
                                        type=context_type,
                                        name=item["name"].strip(),
                                        description=item.get("description", "").strip() or None,
                                        count=0,
                                        is_ai_generated=True
                                    )
                                    db.add(label)
                                    labels_saved += 1
                        db.commit()
                        logger.info(f"[全自动分析] 5W标签学习完成: {labels_saved} 个")
                except Exception as e:
                    logger.error(f"[全自动分析] 5W标签学习失败: {e}")
        else:
            logger.warning(f"[全自动分析] 没有可用样本，跳过学习")
        
        # ==========================================
        # Step 2: 触发洞察+主题提取
        # 注意：翻译任务在 ingest 时就已经启动了！不需要在这里触发
        # ==========================================
        update_task_progress(2, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 2/4: 触发洞察+主题提取...")
        
        # 检查当前翻译进度（翻译在 ingest 时就已经开始了）
        pending_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status.in_([
                        TranslationStatus.PENDING.value,
                        TranslationStatus.PROCESSING.value
                    ]),
                    Review.is_deleted == False
                )
            )
        )
        pending_translation = pending_result.scalar() or 0
        
        translated_result = db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        translated_count = translated_result.scalar() or 0
        
        logger.info(f"[全自动分析] 📊 当前翻译状态: 已翻译 {translated_count} 条, 待翻译 {pending_translation} 条")
        logger.info(f"[全自动分析] 💡 翻译任务在 ingest 时就已启动，现在触发洞察+主题提取")
        
        # 触发洞察和主题提取（它们会处理已翻译的评论，边翻译边提取）
        task_extract_insights.delay(product_id)
        task_extract_themes.delay(product_id)
        
        # ==========================================
        # Step 3: 等待三任务并行完成（翻译 + 洞察 + 主题）
        # ==========================================
        update_task_progress(3, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 3/4: 等待三任务并行完成（翻译+洞察+主题）...")
        
        # 并行等待所有任务完成（最多等 30 分钟，从 15 分钟提升）
        max_wait_seconds = 1800  # 🔥 从 900 秒（15 分钟）提升到 1800 秒（30 分钟）
        wait_interval = 15
        waited = 0
        last_log_time = 0
        
        while waited < max_wait_seconds:
            time.sleep(wait_interval)
            waited += wait_interval
            
            # 检查翻译进度
            pending_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status.in_([
                            TranslationStatus.PENDING.value,
                            TranslationStatus.PROCESSING.value
                        ]),
                        Review.is_deleted == False
                    )
                )
            )
            pending_translation = pending_result.scalar() or 0
            
            # 检查已翻译的评论数
            translated_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False
                    )
                )
            )
            translated_count = translated_result.scalar() or 0
            
            # 检查洞察提取进度（已翻译但未提取洞察的评论）
            no_insight_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewInsight.review_id).where(ReviewInsight.review_id == Review.id)
                        )
                    )
                )
            )
            pending_insights = no_insight_result.scalar() or 0
            
            # 检查主题提取进度（已翻译但未提取主题的评论）
            no_theme_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.translation_status == TranslationStatus.COMPLETED.value,
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewThemeHighlight.review_id).where(ReviewThemeHighlight.review_id == Review.id)
                        )
                    )
                )
            )
            pending_themes = no_theme_result.scalar() or 0
            
            # 每30秒打印一次进度
            if waited - last_log_time >= 30:
                logger.info(f"[全自动分析] 📊 并行进度 - 待翻译:{pending_translation} | 待洞察:{pending_insights} | 待主题:{pending_themes}")
                last_log_time = waited
            
            # 检查是否达到90%完成度，可以提前触发报告生成
            insights_completion = (translated_count - pending_insights) / translated_count if translated_count > 0 else 0
            themes_completion = (translated_count - pending_themes) / translated_count if translated_count > 0 else 0
            
            # 🚀 优化：90%完成度即可触发报告生成
            if insights_completion >= 0.90 and themes_completion >= 0.90:
                logger.info(f"[全自动分析] ✅ 达到90%完成度，触发报告生成！洞察:{insights_completion:.0%}, 主题:{themes_completion:.0%}")
                break
            
            # 检查是否全部完成（100%）
            if pending_translation == 0 and pending_insights == 0 and pending_themes == 0:
                logger.info(f"[全自动分析] ✅ 并行处理全部完成！已翻译:{translated_count}条")
                break
            
            # [OPTIMIZED] 每 120 秒检查一次，只在进度停滞时重新触发
            # 避免频繁触发导致任务堆积，影响其他用户
            if waited % 120 == 0 and waited > 0:
                # 翻译任务：只在有大量待翻译时触发
                if pending_translation > 10:
                    logger.info(f"[全自动分析] 🔄 重新触发翻译任务（还有{pending_translation}条待处理）")
                    task_ingest_translation_only.delay(product_id)
                # 洞察/主题：只触发一个，避免占用太多资源
                if pending_insights > 10:
                    logger.info(f"[全自动分析] 重新触发洞察提取（还有{pending_insights}条待处理）")
                    task_extract_insights.delay(product_id)
                elif pending_themes > 10:  # 用 elif 避免同时触发
                    logger.info(f"[全自动分析] 重新触发主题提取（还有{pending_themes}条待处理）")
                    task_extract_themes.delay(product_id)
            
            # 更新心跳
            update_task_progress(3, TaskStatus.PROCESSING.value)
        
        if waited >= max_wait_seconds:
            # 🔥 优化：放宽完成度要求，从 95% 降到 80%
            # 理由：80% 已足够生成高质量报告，剩余任务可异步继续
            insights_completion = (translated_count - pending_insights) / translated_count if translated_count > 0 else 0
            themes_completion = (translated_count - pending_themes) / translated_count if translated_count > 0 else 0
            
            if insights_completion < 0.80 or themes_completion < 0.80:
                logger.error(f"[全自动分析] ⚠️ 等待超时且完成度 <80%（洞察:{insights_completion:.0%}, 主题:{themes_completion:.0%}）")
                update_task_progress(3, TaskStatus.FAILED.value, f"处理超时，洞察完成度:{insights_completion:.0%}，主题完成度:{themes_completion:.0%}")
                return {
                    "success": False,
                    "product_id": product_id,
                    "task_id": task_id,
                    "error": f"并行处理超时且完成度不足80%，请稍后重试。洞察:{insights_completion:.0%}，主题:{themes_completion:.0%}"
                }
            else:
                logger.warning(f"[全自动分析] 并行处理等待超时，但完成度达到80%以上，继续生成报告（洞察:{insights_completion:.0%}, 主题:{themes_completion:.0%}）")
        
        # ==========================================
        # Step 4: 生成综合战略版报告
        # ==========================================
        update_task_progress(4, TaskStatus.PROCESSING.value)
        logger.info(f"[全自动分析] Step 4/4: 生成综合报告...")
        
        try:
            # 使用同步方式调用报告生成
            # 由于 SummaryService 是异步的，需要使用 asyncio
            import asyncio
            from app.services.summary_service import SummaryService
            
            async def generate_report_async():
                # 使用正确的导入：engine 和 async_session_maker
                from app.db.session import async_session_maker
                
                async with async_session_maker() as async_db:
                    summary_service = SummaryService(async_db)
                    result = await summary_service.generate_report(
                        product_id=product_id,
                        report_type="comprehensive",  # 综合战略版
                        min_reviews=30,  # [UPDATED 2026-01-19] 报告需要至少30条评论
                        save_to_db=True,
                        force_regenerate=False,  # [NEW] 不强制重新生成，检查去重
                        require_full_completion=False  # [优化] 允许90%完成度生成报告
                    )
                    await async_db.commit()  # 确保提交
                    return result
            
            # 运行异步函数 - 修复事件循环问题
            try:
                report_result = asyncio.run(generate_report_async())
            except RuntimeError:
                # 如果已有事件循环，使用备用方案
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    report_result = loop.run_until_complete(generate_report_async())
                finally:
                    pending = asyncio.all_tasks(loop)
                    for task in pending:
                        task.cancel()
                    if pending:
                        loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                    loop.close()
            
            if report_result.get("success"):
                report_id = report_result.get("report_id")
                logger.info(f"[全自动分析] 综合报告生成成功，报告ID: {report_id}")
                
                # 更新任务记录，保存报告 ID
                try:
                    db.execute(
                        update(Task)
                        .where(Task.id == task_id)
                        .values(error_message=f"report_id:{report_id}")  # 临时存储报告ID
                    )
                    db.commit()
                except Exception as save_err:
                    logger.warning(f"[全自动分析] 保存报告ID失败: {save_err}")
            else:
                logger.warning(f"[全自动分析] 综合报告生成失败: {report_result.get('error')}")
                
        except Exception as e:
            logger.error(f"[全自动分析] 报告生成失败: {e}")
            # 不因报告生成失败而中断整个任务
        
        # ==========================================
        # 完成
        # ==========================================
        update_task_progress(4, TaskStatus.COMPLETED.value)
        logger.info(f"[全自动分析] ✅ 产品 {product_id} 全自动分析完成！（流式并行优化版）")
        
        # 清理相关分享链接的缓存（使分享页面获取最新数据）
        try:
            from app.models.share_link import ShareLink
            from app.core.redis import get_redis
            share_links = db.query(ShareLink).filter(
                ShareLink.product_id == product_id,
                ShareLink.is_active == True
            ).all()
            if share_links:
                redis = get_redis()
                for link in share_links:
                    cache_key = f"cache:share:data:{link.token}"
                    redis.delete(cache_key)
                    logger.info(f"[全自动分析] 已清理分享缓存: {cache_key}")
        except Exception as cache_err:
            logger.warning(f"[全自动分析] 清理分享缓存失败: {cache_err}")
        
        return {
            "success": True,
            "product_id": product_id,
            "task_id": task_id,
            "message": "全自动分析完成（并行优化）"
        }
        
    except Exception as e:
        logger.error(f"[全自动分析] 产品 {product_id} 处理失败: {e}")
        update_task_progress(0, TaskStatus.FAILED.value, str(e))
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 任务8: 定时检查待翻译任务 ==============

@celery_app.task(bind=True, max_retries=0)
def task_check_pending_translations(self):
    """
    🔄 定时检查待翻译任务 (Periodic Translation Check)
    
    每 15 秒由 Celery Beat 触发，检查是否有待翻译的产品。
    如果有，为每个产品触发 3 个并行翻译任务，充分利用多 Worker 并发。
    
    设计理念：
    - 翻译任务使用行级锁（SKIP LOCKED），多任务可以安全并发
    - 触发多个任务让 6 个 Worker 线程都有活干
    - 避免翻译因行级锁竞争而提前结束
    """
    from app.models.product import Product
    from app.models.review import Review, TranslationStatus
    
    db = get_sync_db()
    
    try:
        # 查找有待翻译评论的产品（最多处理 5 个产品）
        # [FIXED] 只检查 pending 状态，不再自动重试 failed 状态（避免无限循环）
        products_with_pending = db.execute(
            select(Product.id, func.count(Review.id).label("pending_count"))
            .join(Review, Review.product_id == Product.id)
            .where(
                and_(
                    Review.translation_status == TranslationStatus.PENDING.value,
                    Review.is_deleted == False
                )
            )
            .group_by(Product.id)
            .having(func.count(Review.id) > 0)
            .order_by(func.count(Review.id).desc())
            .limit(5)
        )
        
        pending_products = products_with_pending.all()
        
        if not pending_products:
            return {"triggered": 0, "message": "No pending translations"}
        
        triggered = 0
        for product_id, pending_count in pending_products:
            # 🔥 为每个产品触发多个翻译任务（充分利用并发）
            # 根据待翻译数量决定触发几个任务
            num_tasks = min(3, max(1, pending_count // 20))  # 每 20 条触发 1 个任务，最多 3 个
            
            for _ in range(num_tasks):
                task_ingest_translation_only.delay(str(product_id))
                triggered += 1
            
            logger.info(f"[翻译调度] 产品 {product_id} 待翻译 {pending_count} 条，触发 {num_tasks} 个翻译任务")
        
        return {
            "triggered": triggered,
            "products": len(pending_products),
            "message": f"Triggered {triggered} translation tasks for {len(pending_products)} products"
        }
        
    except Exception as e:
        logger.error(f"[翻译调度] 检查失败: {e}")
        return {"triggered": 0, "error": str(e)}
        
    finally:
        db.close()


# ============== [NEW] 任务9: 异步报告生成 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def task_generate_report(self, product_id: str, report_type: str = "comprehensive"):
    """
    🚀 异步报告生成任务 (Async Report Generation)
    
    后台生成 AI 分析报告，用户可以离开页面，任务继续运行。
    
    参数：
        product_id: 产品 UUID
        report_type: 报告类型 (comprehensive/operations/product/supply_chain)
    
    返回：
        生成结果，包含报告 ID
    """
    import asyncio
    from app.services.summary_service import SummaryService
    from app.models.task import Task, TaskType, TaskStatus
    
    logger.info(f"[报告生成] 开始为产品 {product_id} 生成 {report_type} 报告")
    
    # 报告进度 - 准备中
    self.update_state(state='PROGRESS', meta={
        'progress': 5,
        'current_step': '准备中...'
    })
    
    db = get_sync_db()
    
    try:
        # 创建/更新任务记录
        task_record = get_or_create_task(
            db=db,
            product_id=product_id,
            task_type="report_generation",
            total_items=1,
            celery_task_id=self.request.id
        )
        task_record.status = TaskStatus.PROCESSING.value
        db.commit()
        
        # 报告进度 - 开始生成
        self.update_state(state='PROGRESS', meta={
            'progress': 15,
            'current_step': '正在收集评论数据...'
        })
        
        # 异步生成报告 - 修复事件循环问题
        # 在函数内部创建新的数据库引擎，避免使用全局的 async_session_maker
        # 这样可以确保在正确的事件循环中创建连接
        async def generate_report_async():
            from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
            from app.core.config import settings
            
            # 在函数内部创建新的引擎和会话，避免事件循环冲突
            engine = create_async_engine(
                settings.DATABASE_URL,
                echo=False,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
            )
            async_session_maker = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            
            try:
                async with async_session_maker() as async_db:
                    summary_service = SummaryService(async_db)
                    # 报告进度 - 调用 AI
                    self.update_state(state='PROGRESS', meta={
                        'progress': 30,
                        'current_step': 'AI 正在分析评论数据...'
                    })
                    result = await summary_service.generate_report(
                        product_id=product_id,
                        report_type=report_type,
                        min_reviews=30,  # [UPDATED 2026-01-19] 报告需要至少30条评论
                        save_to_db=True
                    )
                    return result
            finally:
                # 关闭引擎，释放连接
                await engine.dispose()
        
        # 运行异步任务
        # 在 Celery worker 的 ForkPoolWorker 中，每个任务在独立进程中运行
        # 应该没有事件循环，可以安全使用 asyncio.run()
        try:
            report_result = asyncio.run(generate_report_async())
        except RuntimeError as e:
            # 如果已有事件循环（理论上不应该发生），记录错误并重试
            logger.error(f"[报告生成] 事件循环错误: {e}")
            # 尝试创建新的事件循环
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                report_result = loop.run_until_complete(generate_report_async())
            finally:
                try:
                    loop.close()
                except:
                    pass
        
        # 报告进度 - 保存结果
        self.update_state(state='PROGRESS', meta={
            'progress': 90,
            'current_step': '正在保存报告...'
        })
        
        # 更新任务状态
        if report_result.get("success"):
            task_record.status = TaskStatus.COMPLETED.value
            task_record.processed_items = 1
            report_data = report_result.get("report", {})
            report_id = report_data.get("id") if isinstance(report_data, dict) else None
            logger.info(f"[报告生成] 成功生成报告 {report_id}")
        else:
            task_record.status = TaskStatus.FAILED.value
            task_record.error_message = report_result.get("error", "未知错误")
            logger.error(f"[报告生成] 失败: {report_result.get('error')}")
        
        db.commit()
        
        return {
            "success": report_result.get("success", False),
            "product_id": product_id,
            "report_type": report_type,
            "report_id": report_data.get("id") if report_result.get("success") and isinstance(report_data, dict) else None,
            "error": report_result.get("error") if not report_result.get("success") else None
        }
        
    except Exception as e:
        logger.error(f"[报告生成] 异常: {e}")
        # 更新任务状态为失败
        try:
            if task_record:
                task_record.status = TaskStatus.FAILED.value
                task_record.error_message = str(e)
                db.commit()
        except:
            pass
        raise self.retry(exc=e)
    finally:
        db.close()


# ============== [NEW] 任务10: 队列消费入库 ==============

@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def task_process_ingestion_queue(self):
    """
    🚀 队列消费入库任务 (Ingestion Queue Consumer)
    
    从 Redis 队列批量消费评论数据，入库到 PostgreSQL。
    
    设计特点：
    1. 高并发写入优化：API 层只写 Redis，本任务批量入库
    2. 三层去重：Redis Set → 内存 Set → DB ON CONFLICT
    3. 按 ASIN 分组处理，减少数据库查询
    4. 入库成功后触发翻译任务
    
    调度方式：
    - Celery Beat 每 5 秒触发一次
    - 每次最多处理 100 条队列数据
    
    Returns:
        处理结果统计
    """
    from app.core.redis import ReviewIngestionQueueSync, get_sync_redis
    from app.services.ingestion_service import IngestionService
    
    logger.debug("[Ingestion] 开始消费队列...")
    
    redis_cli = get_sync_redis()
    queue = ReviewIngestionQueueSync(redis_cli)
    
    # Step 1: 从队列批量取出数据
    items = queue.pop_batch(count=100)
    
    if not items:
        logger.debug("[Ingestion] 队列为空，跳过")
        return {"processed": 0, "items": 0}
    
    logger.info(f"[Ingestion] 从队列取出 {len(items)} 条数据")
    
    db = get_sync_db()
    
    try:
        # Step 2: 调用入库服务处理
        service = IngestionService(db, redis_cli)
        results = service.process_queue_items(items)
        
        # Step 3: 统计结果
        total_inserted = sum(r.get("inserted", 0) for r in results.values())
        total_skipped = sum(r.get("skipped", 0) for r in results.values())
        
        logger.info(
            f"[Ingestion] 处理完成: {len(results)} 个产品, "
            f"新增 {total_inserted} 条, 跳过 {total_skipped} 条"
        )
        
        # Step 4: 为有新数据的产品触发翻译（使用 Redis 锁防止重复触发）
        from app.core.redis import get_sync_redis
        redis_client = get_sync_redis()
        
        for asin, result in results.items():
            if result.get("inserted", 0) > 0:
                # 使用 Redis SETNX 实现分布式锁，防止同一产品重复触发翻译任务
                # 锁有效期 5 分钟（翻译任务通常在几分钟内完成）
                lock_key = f"lock:translation:{asin}"
                lock_acquired = redis_client.set(lock_key, "1", nx=True, ex=300)
                
                if not lock_acquired:
                    logger.debug(f"[Ingestion] 产品 {asin} 翻译任务已在运行中，跳过触发")
                    continue
                
                # 获取 product_id
                from app.models.product import Product
                product_result = db.execute(
                    select(Product).where(Product.asin == asin)
                )
                product = product_result.scalar_one_or_none()
                
                if product:
                    # 触发流式翻译
                    task_ingest_translation_only.delay(str(product.id))
                    logger.info(f"[Ingestion] 产品 {asin} 已触发翻译任务")
        
        return {
            "processed": len(items),
            "products": len(results),
            "inserted": total_inserted,
            "skipped": total_skipped,
            "details": results
        }
        
    except Exception as e:
        logger.error(f"[Ingestion] 处理失败: {e}")
        db.rollback()
        raise self.retry(exc=e)
        
    finally:
        db.close()


# ============== [NEW] 辅助函数：同步已有 review_id 到 Redis ==============

@celery_app.task
def task_sync_product_reviews_to_redis(asin: str):
    """
    将产品的已有 review_id 同步到 Redis
    
    用于：
    1. Redis 重启后恢复去重数据
    2. 手动触发同步
    
    Args:
        asin: 产品 ASIN
    """
    from app.services.ingestion_service import IngestionService
    
    db = get_sync_db()
    
    try:
        service = IngestionService(db)
        service.sync_redis_from_db(asin)
        logger.info(f"[Sync] 产品 {asin} 的 review_id 已同步到 Redis")
        return {"success": True, "asin": asin}
    except Exception as e:
        logger.error(f"[Sync] 同步失败: {e}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


# ============== [NEW] 定时任务：分析补全巡检 ==============

@celery_app.task(bind=True)
def task_analysis_completion_patrol(self):
    """
    🛡️ 分析补全巡检任务 (Analysis Completion Patrol)
    
    定期检查所有产品，找出有遗漏洞察/主题的评论，触发补全处理。
    
    这是"三层防护机制"的最后一道防线：
    1. 第一层：入库队列等待（task_full_auto_analysis）
    2. 第二层：任务末尾补全检查（task_extract_insights/themes）
    3. 第三层：本任务 - 定时全局巡检
    
    运行频率：每 5 分钟
    
    检查逻辑：
    1. 找出最近 24 小时内有评论的产品
    2. 对每个产品检查是否有遗漏的洞察/主题
    3. 如果有遗漏且没有正在运行的任务，触发补全
    
    设计原则：
    - 轻量级：只检查活跃产品，不全表扫描
    - 非侵入：只在确实需要时才触发补全
    - 防重复：检查任务状态，避免重复触发
    """
    from app.models.product import Product
    from app.models.review import Review
    from app.models.insight import ReviewInsight
    from app.models.theme_highlight import ReviewThemeHighlight
    from app.models.task import Task, TaskType, TaskStatus
    from datetime import datetime, timezone, timedelta
    
    logger.info("[巡检] 🔍 开始分析补全巡检...")
    
    db = get_sync_db()
    
    try:
        # 找出最近 24 小时内有评论的产品
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
        
        active_products_result = db.execute(
            select(Product.id, Product.asin)
            .where(
                Product.id.in_(
                    select(Review.product_id)
                    .where(Review.created_at >= cutoff_time)
                    .distinct()
                )
            )
        )
        active_products = active_products_result.all()
        
        if not active_products:
            logger.info("[巡检] ✅ 无活跃产品，跳过")
            return {"checked": 0, "triggered": 0}
        
        logger.info(f"[巡检] 发现 {len(active_products)} 个活跃产品")
        
        triggered_insights = 0
        triggered_themes = 0
        
        for product_id, asin in active_products:
            product_id_str = str(product_id)
            
            # 检查是否有正在运行的分析任务
            running_task_result = db.execute(
                select(Task.id)
                .where(
                    and_(
                        Task.product_id == product_id,
                        Task.status.in_([TaskStatus.PENDING.value, TaskStatus.PROCESSING.value]),
                        Task.task_type.in_([
                            TaskType.INSIGHTS.value,
                            TaskType.THEMES.value,
                            TaskType.AUTO_ANALYSIS.value
                        ])
                    )
                )
                .limit(1)
            )
            if running_task_result.scalar_one_or_none():
                logger.debug(f"[巡检] 产品 {asin} 有正在运行的任务，跳过")
                continue
            
            # 🔧 [FIX] 先检查是否有维度和标签（科学学习的前置条件）
            from app.models.product_dimension import ProductDimension
            from app.models.product_context_label import ProductContextLabel
            
            dim_count_result = db.execute(
                select(func.count(ProductDimension.id))
                .where(ProductDimension.product_id == product_id)
            )
            has_dimensions = (dim_count_result.scalar() or 0) > 0
            
            label_count_result = db.execute(
                select(func.count(ProductContextLabel.id))
                .where(ProductContextLabel.product_id == product_id)
            )
            has_labels = (label_count_result.scalar() or 0) > 0
            
            # 检查遗漏的洞察
            missing_insights_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.body_original.isnot(None),
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewInsight.review_id).distinct()
                        )
                    )
                )
            )
            missing_insights = missing_insights_result.scalar() or 0
            
            # 检查遗漏的主题
            missing_themes_result = db.execute(
                select(func.count(Review.id))
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.body_original.isnot(None),
                        Review.is_deleted == False,
                        ~Review.id.in_(
                            select(ReviewThemeHighlight.review_id).distinct()
                        )
                    )
                )
            )
            missing_themes = missing_themes_result.scalar() or 0
            
            # 🔧 [FIX] 智能触发策略：
            # 1. 如果没有维度或标签，触发完整流程（包含科学学习）
            # 2. 如果已有维度和标签，只触发补全任务
            if missing_insights > 0 or missing_themes > 0:
                if not has_dimensions or not has_labels:
                    # 没有维度或标签，触发完整流程（包含科学学习）
                    logger.warning(f"[巡检] ⚠️ 产品 {asin} 缺少科学学习（维度:{has_dimensions}, 标签:{has_labels}），触发完整分析流程")
                    # 创建任务记录
                    from app.models.task import Task
                    import uuid
                    new_task_id = str(uuid.uuid4())
                    new_task = Task(
                        id=new_task_id,
                        product_id=product_id,
                        task_type=TaskType.AUTO_ANALYSIS.value,
                        status=TaskStatus.PENDING.value,
                        total_items=4  # 4个步骤
                    )
                    db.add(new_task)
                    db.commit()
                    
                    # 触发完整分析（包含科学学习）
                    task_full_auto_analysis.apply_async(
                        args=[product_id_str, new_task_id],
                        countdown=5
                    )
                    triggered_insights += 1
                    triggered_themes += 1
                else:
                    # 已有维度和标签，只触发补全任务
                    if missing_insights > 0:
                        logger.warning(f"[巡检] ⚠️ 产品 {asin} 发现 {missing_insights} 条遗漏洞察，触发补全")
                        task_extract_insights.apply_async(
                            args=[product_id_str],
                            countdown=5  # 5秒后执行
                        )
                        triggered_insights += 1
                    
                    if missing_themes > 0:
                        logger.warning(f"[巡检] ⚠️ 产品 {asin} 发现 {missing_themes} 条遗漏主题，触发补全")
                        task_extract_themes.apply_async(
                            args=[product_id_str],
                            countdown=10  # 10秒后执行，错开洞察任务
                        )
                        triggered_themes += 1
        
        result = {
            "checked": len(active_products),
            "triggered_insights": triggered_insights,
            "triggered_themes": triggered_themes
        }
        
        if triggered_insights > 0 or triggered_themes > 0:
            logger.info(f"[巡检] 🔄 巡检完成，触发 {triggered_insights} 个洞察补全 + {triggered_themes} 个主题补全")
        else:
            logger.info(f"[巡检] ✅ 巡检完成，所有产品分析完整")
        
        return result
        
    except Exception as e:
        logger.error(f"[巡检] ❌ 巡检失败: {e}")
        return {"error": str(e)}
    finally:
        db.close()


# ============== [NEW 2026-01-22] 任务: 维度总结生成 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def task_generate_dimension_summaries(self, product_id: str):
    """
    生成产品维度总结（中观层AI分析）
    
    打通微观(单条评论洞察)到宏观(项目报告)的桥梁，包括：
    - 5W主题总结 (buyer/user/where/when/why/what)
    - 产品维度总结 (各评价维度的优劣势总结)
    - 情感维度总结
    - 场景维度总结
    - 消费者原型 (3-5个典型用户画像)
    - 整体数据总结
    
    触发条件：主题提取任务完成后自动触发
    
    Args:
        product_id: UUID of the product
    """
    import asyncio
    from app.services.dimension_summary_service import DimensionSummaryService
    
    logger.info(f"[维度总结] 开始生成产品维度总结: {product_id}")
    
    # 获取异步数据库会话
    async def run_async():
        from app.db.session import async_session_maker
        async with async_session_maker() as session:
            service = DimensionSummaryService(session)
            return await service.generate_all_summaries(product_id)
    
    try:
        # 在 worker 线程中创建新的事件循环
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_async())
        finally:
            loop.close()
        
        summary_counts = {
            "themes": len(result.get("theme_summaries", [])),
            "dimensions": len(result.get("dimension_summaries", [])),
            "emotions": len(result.get("emotion_summaries", [])),
            "scenarios": len(result.get("scenario_summaries", [])),
            "personas": len(result.get("consumer_personas", [])),
            "overall": 1 if result.get("overall_summary") else 0,
        }
        
        logger.info(f"[维度总结] ✅ 生成完成: {product_id}, 统计: {summary_counts}")
        
        return {
            "product_id": product_id,
            "success": True,
            "summary_counts": summary_counts
        }
        
    except Exception as e:
        logger.error(f"[维度总结] ❌ 生成失败: {product_id}, 错误: {e}")
        raise self.retry(exc=e)


# ============== [NEW 2026-01-24] 任务: 数据透视AI洞察生成 ==============

@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def task_generate_pivot_insights(self, product_id: str):
    """
    生成产品数据透视AI洞察
    
    包括：
    - 人群洞察 (audience): 决策链路、人群-卖点匹配
    - 需求洞察 (demand): 需求满足度矩阵
    - 产品洞察 (product): 致命缺陷、优劣势对比、改进优先级
    - 迁移 dimension_summaries 到新表
    
    Args:
        product_id: UUID of the product
    """
    from app.services.pivot_insight_service import PivotInsightService
    
    logger.info(f"[数据透视洞察] 开始生成: {product_id}")
    
    db = get_sync_db()
    
    try:
        service = PivotInsightService(db)
        result = service.generate_all_insights(UUID(product_id))
        
        if result.get("success"):
            logger.info(f"[数据透视洞察] ✅ 生成完成: {product_id}, 生成数量: {result.get('total_generated', 0)}")
            return {
                "product_id": product_id,
                "success": True,
                "total_generated": result.get("total_generated", 0),
                "insights": result.get("generated_insights", [])
            }
        else:
            error = result.get("error", "未知错误")
            logger.error(f"[数据透视洞察] ❌ 生成失败: {product_id}, 错误: {error}")
            raise Exception(error)
        
    except Exception as e:
        logger.error(f"[数据透视洞察] ❌ 任务异常: {product_id}, 错误: {e}")
        raise self.retry(exc=e)
    finally:
        db.close()


# ============================================================================
# 🚀 对比分析任务 (Comparison Analysis Task)
# ============================================================================

@celery_app.task(bind=True, max_retries=2, default_retry_delay=60, time_limit=600, soft_time_limit=540)
def task_run_comparison_analysis(self, project_id: str):
    """
    🚀 对比分析异步任务 (Async Comparison Analysis)
    
    在 Celery Worker 中执行对比分析，支持：
    1. 进度实时追踪（通过 Redis）
    2. 失败自动重试
    3. 超时保护（10分钟）
    
    参数：
        project_id: 分析项目 UUID
    
    返回：
        {
            "project_id": "...",
            "success": True/False,
            "status": "completed/failed",
            "message": "..."
        }
    """
    import asyncio
    from app.core.redis import get_sync_redis, AnalysisProgressTrackerSync
    from app.models.analysis import AnalysisProject, AnalysisStatus
    
    logger.info(f"[对比分析] 🚀 开始执行: {project_id}")
    
    # 初始化进度追踪
    redis_client = get_sync_redis()
    progress_tracker = AnalysisProgressTrackerSync(redis_client)
    progress_tracker.init_progress(project_id, total_steps=5)
    
    db = get_sync_db()
    
    try:
        # 获取项目
        from app.models.analysis import AnalysisProject
        project = db.query(AnalysisProject).filter(AnalysisProject.id == project_id).first()
        
        if not project:
            progress_tracker.complete(project_id, success=False, error_message="项目不存在")
            return {"project_id": project_id, "success": False, "message": "项目不存在"}
        
        # 更新状态为处理中
        project.status = AnalysisStatus.PROCESSING.value
        db.commit()
        
        progress_tracker.update_progress(project_id, 1, "数据收集", 10, "正在收集产品数据...")
        
        # 异步执行分析（在同步上下文中运行异步代码）
        async def run_async_analysis():
            from app.db.session import async_session_maker
            from app.services.analysis_service import AnalysisService
            
            async def sync_progress_callback(step: int, step_name: str, percent: int, message: str = ""):
                """同步进度回调包装器"""
                progress_tracker.update_progress(project_id, step, step_name, percent, message)
            
            async with async_session_maker() as async_db:
                service = AnalysisService(async_db)
                result = await service.run_analysis(project_id, progress_callback=sync_progress_callback)
                await async_db.commit()
                return result
        
        # 运行异步分析
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_async_analysis())
        finally:
            loop.close()
        
        # 标记完成
        progress_tracker.complete(project_id, success=True)
        
        logger.info(f"[对比分析] ✅ 完成: {project_id}")
        return {
            "project_id": project_id,
            "success": True,
            "status": "completed",
            "message": "分析完成"
        }
        
    except Exception as e:
        logger.error(f"[对比分析] ❌ 失败: {project_id}, 错误: {e}")
        progress_tracker.complete(project_id, success=False, error_message=str(e))
        
        # 更新项目状态
        try:
            project = db.query(AnalysisProject).filter(AnalysisProject.id == project_id).first()
            if project:
                project.status = AnalysisStatus.FAILED.value
                project.error_message = str(e)
                db.commit()
        except Exception as update_error:
            logger.error(f"[对比分析] 更新状态失败: {update_error}")
        
        raise self.retry(exc=e)
