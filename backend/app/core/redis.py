"""
Redis Client 封装

提供同步和异步两种 Redis 客户端，用于：
1. 评论入库队列（高并发写入缓冲）
2. 评论去重（Redis Set）
3. 批次状态跟踪
4. 分布式锁（可选）
"""
import logging
from typing import Optional, List, Any
import json

import redis
from redis import asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

# ==========================================
# 队列名称常量
# ==========================================
QUEUE_REVIEW_INGESTION = "review_ingestion_queue"  # 评论入库队列
KEY_PREFIX_SEEN_REVIEWS = "reviews:seen:"          # 已见评论 Set 前缀
KEY_PREFIX_BATCH_STATUS = "batch:"                 # 批次状态前缀

# ==========================================
# 同步 Redis 客户端（用于 Celery Worker）
# ==========================================
_sync_redis_client: Optional[redis.Redis] = None


def get_sync_redis() -> redis.Redis:
    """
    获取同步 Redis 客户端（单例）
    用于 Celery Worker 等同步场景
    """
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )
    return _sync_redis_client


# ==========================================
# 异步 Redis 客户端（用于 FastAPI）
# ==========================================
_async_redis_client: Optional[aioredis.Redis] = None


async def get_async_redis() -> aioredis.Redis:
    """
    获取异步 Redis 客户端（单例）
    用于 FastAPI 等异步场景
    """
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )
    return _async_redis_client


async def close_async_redis():
    """关闭异步 Redis 连接"""
    global _async_redis_client
    if _async_redis_client is not None:
        await _async_redis_client.close()
        _async_redis_client = None


# ==========================================
# 队列操作封装
# ==========================================

class ReviewIngestionQueue:
    """
    评论入库队列操作封装
    
    使用 Redis List 作为消息队列：
    - LPUSH: 生产者推入数据
    - RPOP/BRPOP: 消费者取出数据
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.queue_name = QUEUE_REVIEW_INGESTION
    
    async def push(self, payload: dict) -> bool:
        """
        推入一条数据到队列
        
        Args:
            payload: 包含 asin, reviews 等信息的字典
            
        Returns:
            是否成功
        """
        try:
            await self.redis.lpush(self.queue_name, json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Failed to push to ingestion queue: {e}")
            return False
    
    async def push_batch(self, payloads: List[dict]) -> int:
        """
        批量推入数据
        
        Returns:
            成功推入的数量
        """
        try:
            pipe = self.redis.pipeline()
            for payload in payloads:
                pipe.lpush(self.queue_name, json.dumps(payload))
            await pipe.execute()
            return len(payloads)
        except Exception as e:
            logger.error(f"Failed to push batch to ingestion queue: {e}")
            return 0
    
    def pop_batch_sync(self, count: int = 100) -> List[dict]:
        """
        同步批量取出数据（用于 Worker）
        
        Args:
            count: 最多取出的数量
            
        Returns:
            数据列表
        """
        items = []
        try:
            for _ in range(count):
                item = self.redis.rpop(self.queue_name)
                if item is None:
                    break
                try:
                    items.append(json.loads(item))
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in queue: {item[:100]}")
        except Exception as e:
            logger.error(f"Failed to pop from ingestion queue: {e}")
        return items
    
    async def length(self) -> int:
        """获取队列长度"""
        try:
            return await self.redis.llen(self.queue_name)
        except Exception:
            return 0


class ReviewIngestionQueueSync:
    """同步版本的队列操作（用于 Worker）"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.queue_name = QUEUE_REVIEW_INGESTION
    
    def push(self, payload: dict) -> bool:
        """推入一条数据"""
        try:
            self.redis.lpush(self.queue_name, json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Failed to push to ingestion queue: {e}")
            return False
    
    def pop_batch(self, count: int = 100) -> List[dict]:
        """批量取出数据"""
        items = []
        try:
            for _ in range(count):
                item = self.redis.rpop(self.queue_name)
                if item is None:
                    break
                try:
                    items.append(json.loads(item))
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in queue: {item[:100]}")
        except Exception as e:
            logger.error(f"Failed to pop from ingestion queue: {e}")
        return items
    
    def length(self) -> int:
        """获取队列长度"""
        try:
            return self.redis.llen(self.queue_name)
        except Exception:
            return 0


# ==========================================
# 批次状态跟踪
# ==========================================

class BatchStatusTracker:
    """
    批次状态跟踪
    
    用于跟踪每个上传批次的处理状态，供前端轮询
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.prefix = KEY_PREFIX_BATCH_STATUS
        self.expire_seconds = 3600  # 1 小时过期
    
    async def create(self, batch_id: str, total: int, user_id: str = None) -> bool:
        """创建批次状态"""
        try:
            key = f"{self.prefix}{batch_id}"
            await self.redis.hset(key, mapping={
                "status": "queued",
                "total": str(total),
                "inserted": "0",
                "skipped": "0",
                "user_id": user_id or ""
            })
            await self.redis.expire(key, self.expire_seconds)
            return True
        except Exception as e:
            logger.error(f"Failed to create batch status: {e}")
            return False
    
    async def update(self, batch_id: str, status: str, inserted: int, skipped: int):
        """更新批次状态"""
        try:
            key = f"{self.prefix}{batch_id}"
            await self.redis.hset(key, mapping={
                "status": status,
                "inserted": str(inserted),
                "skipped": str(skipped)
            })
        except Exception as e:
            logger.error(f"Failed to update batch status: {e}")
    
    async def get(self, batch_id: str) -> Optional[dict]:
        """获取批次状态"""
        try:
            key = f"{self.prefix}{batch_id}"
            result = await self.redis.hgetall(key)
            if not result:
                return None
            return {
                "status": result.get("status", "unknown"),
                "total": int(result.get("total", 0)),
                "inserted": int(result.get("inserted", 0)),
                "skipped": int(result.get("skipped", 0)),
                "user_id": result.get("user_id") or None
            }
        except Exception as e:
            logger.error(f"Failed to get batch status: {e}")
            return None


class BatchStatusTrackerSync:
    """同步版本（用于 Worker）"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.prefix = KEY_PREFIX_BATCH_STATUS
        self.expire_seconds = 3600
    
    def update(self, batch_id: str, status: str, inserted: int, skipped: int):
        """更新批次状态"""
        try:
            key = f"{self.prefix}{batch_id}"
            self.redis.hset(key, mapping={
                "status": status,
                "inserted": str(inserted),
                "skipped": str(skipped)
            })
        except Exception as e:
            logger.error(f"Failed to update batch status: {e}")


# ==========================================
# 分析任务进度追踪 (Analysis Progress)
# ==========================================

KEY_PREFIX_ANALYSIS_PROGRESS = "analysis:progress:"


class AnalysisProgressTracker:
    """
    分析任务进度追踪器
    
    用于 SSE 流式输出，实时向前端推送分析进度
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.prefix = KEY_PREFIX_ANALYSIS_PROGRESS
        self.expire_seconds = 1800  # 30 分钟过期
    
    async def init_progress(self, project_id: str, total_steps: int = 5) -> bool:
        """初始化进度"""
        try:
            key = f"{self.prefix}{project_id}"
            await self.redis.hset(key, mapping={
                "status": "started",
                "current_step": "0",
                "total_steps": str(total_steps),
                "step_name": "初始化",
                "percent": "0",
                "message": "分析任务已启动",
                "started_at": str(int(__import__('time').time()))
            })
            await self.redis.expire(key, self.expire_seconds)
            return True
        except Exception as e:
            logger.error(f"Failed to init analysis progress: {e}")
            return False
    
    async def update_progress(
        self, 
        project_id: str, 
        step: int, 
        step_name: str, 
        percent: int,
        message: str = "",
        extra_data: dict = None
    ):
        """更新进度"""
        try:
            key = f"{self.prefix}{project_id}"
            mapping = {
                "status": "processing",
                "current_step": str(step),
                "step_name": step_name,
                "percent": str(percent),
                "message": message,
                "updated_at": str(int(__import__('time').time()))
            }
            if extra_data:
                mapping["extra_data"] = json.dumps(extra_data, ensure_ascii=False)
            await self.redis.hset(key, mapping=mapping)
        except Exception as e:
            logger.error(f"Failed to update analysis progress: {e}")
    
    async def complete(self, project_id: str, success: bool = True, error_message: str = None):
        """标记完成"""
        try:
            key = f"{self.prefix}{project_id}"
            mapping = {
                "status": "completed" if success else "failed",
                "percent": "100" if success else "-1",
                "step_name": "完成" if success else "失败",
                "message": "分析完成" if success else (error_message or "分析失败"),
                "completed_at": str(int(__import__('time').time()))
            }
            await self.redis.hset(key, mapping=mapping)
        except Exception as e:
            logger.error(f"Failed to complete analysis progress: {e}")
    
    async def get_progress(self, project_id: str) -> Optional[dict]:
        """获取进度"""
        try:
            key = f"{self.prefix}{project_id}"
            result = await self.redis.hgetall(key)
            if not result:
                return None
            return {
                "status": result.get("status", "unknown"),
                "current_step": int(result.get("current_step", 0)),
                "total_steps": int(result.get("total_steps", 5)),
                "step_name": result.get("step_name", ""),
                "percent": int(result.get("percent", 0)),
                "message": result.get("message", ""),
                "extra_data": json.loads(result.get("extra_data", "{}")) if result.get("extra_data") else {}
            }
        except Exception as e:
            logger.error(f"Failed to get analysis progress: {e}")
            return None


class AnalysisProgressTrackerSync:
    """同步版本（用于 Celery Worker）"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.prefix = KEY_PREFIX_ANALYSIS_PROGRESS
        self.expire_seconds = 1800
    
    def init_progress(self, project_id: str, total_steps: int = 5) -> bool:
        """初始化进度"""
        try:
            key = f"{self.prefix}{project_id}"
            self.redis.hset(key, mapping={
                "status": "started",
                "current_step": "0",
                "total_steps": str(total_steps),
                "step_name": "初始化",
                "percent": "0",
                "message": "分析任务已启动",
                "started_at": str(int(__import__('time').time()))
            })
            self.redis.expire(key, self.expire_seconds)
            return True
        except Exception as e:
            logger.error(f"Failed to init analysis progress: {e}")
            return False
    
    def update_progress(
        self, 
        project_id: str, 
        step: int, 
        step_name: str, 
        percent: int,
        message: str = "",
        extra_data: dict = None
    ):
        """更新进度"""
        try:
            key = f"{self.prefix}{project_id}"
            mapping = {
                "status": "processing",
                "current_step": str(step),
                "step_name": step_name,
                "percent": str(percent),
                "message": message,
                "updated_at": str(int(__import__('time').time()))
            }
            if extra_data:
                mapping["extra_data"] = json.dumps(extra_data, ensure_ascii=False)
            self.redis.hset(key, mapping=mapping)
        except Exception as e:
            logger.error(f"Failed to update analysis progress: {e}")
    
    def complete(self, project_id: str, success: bool = True, error_message: str = None):
        """标记完成"""
        try:
            key = f"{self.prefix}{project_id}"
            mapping = {
                "status": "completed" if success else "failed",
                "percent": "100" if success else "-1",
                "step_name": "完成" if success else "失败",
                "message": "分析完成" if success else (error_message or "分析失败"),
                "completed_at": str(int(__import__('time').time()))
            }
            self.redis.hset(key, mapping=mapping)
        except Exception as e:
            logger.error(f"Failed to complete analysis progress: {e}")
