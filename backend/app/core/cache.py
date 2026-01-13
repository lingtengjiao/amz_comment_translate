"""
Redis 缓存服务层

提供统一的缓存接口，用于：
1. 产品详情缓存
2. 评论列表缓存
3. 用户项目列表缓存
4. 统计数据缓存

特性：
- 自动序列化/反序列化
- 可配置的 TTL
- 缓存失效机制
- 异步和同步两种模式
"""
import json
import logging
from typing import Optional, Any, List
from datetime import timedelta

from redis import asyncio as aioredis
import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# ==========================================
# 缓存 Key 前缀
# ==========================================
CACHE_PREFIX = "cache:"
KEY_PRODUCT = f"{CACHE_PREFIX}product:"           # 产品详情
KEY_REVIEWS = f"{CACHE_PREFIX}reviews:"           # 评论列表
KEY_USER_PROJECTS = f"{CACHE_PREFIX}user_projects:"  # 用户项目列表
KEY_PRODUCT_STATS = f"{CACHE_PREFIX}stats:"       # 产品统计

# ==========================================
# 缓存 TTL (秒)
# ==========================================
TTL_PRODUCT = 300         # 产品详情 5 分钟
TTL_REVIEWS = 300         # 评论列表 5 分钟
TTL_USER_PROJECTS = 60    # 用户项目 1 分钟
TTL_PRODUCT_STATS = 600   # 统计数据 10 分钟


class CacheService:
    """
    异步缓存服务（用于 FastAPI）
    """
    
    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client
    
    # ==========================================
    # 通用方法
    # ==========================================
    
    async def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        try:
            value = await self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")
            return None
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """设置缓存值"""
        try:
            await self.redis.setex(key, ttl, json.dumps(value, default=str, ensure_ascii=False))
            return True
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """删除单个缓存"""
        try:
            await self.redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete error for key {key}: {e}")
            return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """删除匹配模式的所有缓存"""
        try:
            keys = []
            async for key in self.redis.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                await self.redis.delete(*keys)
                logger.info(f"Deleted {len(keys)} cache keys matching pattern: {pattern}")
            return len(keys)
        except Exception as e:
            logger.warning(f"Cache delete_pattern error for {pattern}: {e}")
            return 0
    
    # ==========================================
    # 产品相关缓存
    # ==========================================
    
    def _product_key(self, asin: str) -> str:
        return f"{KEY_PRODUCT}{asin}"
    
    async def get_product(self, asin: str) -> Optional[dict]:
        """获取产品详情缓存"""
        return await self.get(self._product_key(asin))
    
    async def set_product(self, asin: str, data: dict) -> bool:
        """设置产品详情缓存"""
        return await self.set(self._product_key(asin), data, TTL_PRODUCT)
    
    async def invalidate_product(self, asin: str) -> bool:
        """失效产品详情缓存"""
        return await self.delete(self._product_key(asin))
    
    # ==========================================
    # 评论列表缓存
    # ==========================================
    
    def _reviews_key(self, asin: str, page: int = 1, page_size: int = 20, 
                     rating: Optional[int] = None, sentiment: Optional[str] = None) -> str:
        """生成评论列表缓存 Key"""
        key = f"{KEY_REVIEWS}{asin}:p{page}:s{page_size}"
        if rating:
            key += f":r{rating}"
        if sentiment:
            key += f":st_{sentiment}"
        return key
    
    async def get_reviews(self, asin: str, page: int = 1, page_size: int = 20,
                          rating: Optional[int] = None, sentiment: Optional[str] = None) -> Optional[dict]:
        """获取评论列表缓存"""
        key = self._reviews_key(asin, page, page_size, rating, sentiment)
        return await self.get(key)
    
    async def set_reviews(self, asin: str, data: dict, page: int = 1, page_size: int = 20,
                          rating: Optional[int] = None, sentiment: Optional[str] = None) -> bool:
        """设置评论列表缓存"""
        key = self._reviews_key(asin, page, page_size, rating, sentiment)
        return await self.set(key, data, TTL_REVIEWS)
    
    async def invalidate_reviews(self, asin: str) -> int:
        """失效产品的所有评论缓存"""
        pattern = f"{KEY_REVIEWS}{asin}:*"
        return await self.delete_pattern(pattern)
    
    # ==========================================
    # 用户项目列表缓存
    # ==========================================
    
    def _user_projects_key(self, user_id: str, page: int = 1, page_size: int = 20) -> str:
        return f"{KEY_USER_PROJECTS}{user_id}:p{page}:s{page_size}"
    
    async def get_user_projects(self, user_id: str, page: int = 1, page_size: int = 20) -> Optional[dict]:
        """获取用户项目列表缓存"""
        return await self.get(self._user_projects_key(user_id, page, page_size))
    
    async def set_user_projects(self, user_id: str, data: dict, page: int = 1, page_size: int = 20) -> bool:
        """设置用户项目列表缓存"""
        return await self.set(self._user_projects_key(user_id, page, page_size), data, TTL_USER_PROJECTS)
    
    async def invalidate_user_projects(self, user_id: str) -> int:
        """失效用户的所有项目列表缓存"""
        pattern = f"{KEY_USER_PROJECTS}{user_id}:*"
        return await self.delete_pattern(pattern)
    
    # ==========================================
    # 产品统计缓存
    # ==========================================
    
    def _stats_key(self, asin: str, stat_type: str = "overview") -> str:
        return f"{KEY_PRODUCT_STATS}{asin}:{stat_type}"
    
    async def get_product_stats(self, asin: str, stat_type: str = "overview") -> Optional[dict]:
        """获取产品统计缓存"""
        return await self.get(self._stats_key(asin, stat_type))
    
    async def set_product_stats(self, asin: str, data: dict, stat_type: str = "overview") -> bool:
        """设置产品统计缓存"""
        return await self.set(self._stats_key(asin, stat_type), data, TTL_PRODUCT_STATS)
    
    async def invalidate_product_stats(self, asin: str) -> int:
        """失效产品的所有统计缓存"""
        pattern = f"{KEY_PRODUCT_STATS}{asin}:*"
        return await self.delete_pattern(pattern)
    
    # ==========================================
    # 批量失效
    # ==========================================
    
    async def invalidate_all_for_product(self, asin: str) -> dict:
        """
        失效产品相关的所有缓存
        
        在以下场景调用：
        - 新评论入库
        - 翻译完成
        - 洞察/主题提取完成
        """
        results = {
            "product": await self.invalidate_product(asin),
            "reviews": await self.invalidate_reviews(asin),
            "stats": await self.invalidate_product_stats(asin)
        }
        logger.info(f"Invalidated all caches for product {asin}: {results}")
        return results


class CacheServiceSync:
    """
    同步缓存服务（用于 Celery Worker）
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        try:
            value = self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """设置缓存值"""
        try:
            self.redis.setex(key, ttl, json.dumps(value, default=str, ensure_ascii=False))
            return True
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """删除单个缓存"""
        try:
            self.redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete error for key {key}: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """删除匹配模式的所有缓存"""
        try:
            keys = list(self.redis.scan_iter(match=pattern))
            if keys:
                self.redis.delete(*keys)
                logger.info(f"Deleted {len(keys)} cache keys matching pattern: {pattern}")
            return len(keys)
        except Exception as e:
            logger.warning(f"Cache delete_pattern error for {pattern}: {e}")
            return 0
    
    def invalidate_all_for_product(self, asin: str) -> dict:
        """失效产品相关的所有缓存"""
        results = {
            "product": self.delete(f"{KEY_PRODUCT}{asin}"),
            "reviews": self.delete_pattern(f"{KEY_REVIEWS}{asin}:*"),
            "stats": self.delete_pattern(f"{KEY_PRODUCT_STATS}{asin}:*")
        }
        logger.info(f"Invalidated all caches for product {asin}: {results}")
        return results


# ==========================================
# 获取缓存服务实例
# ==========================================

_cache_service: Optional[CacheService] = None


async def get_cache_service() -> CacheService:
    """获取异步缓存服务实例"""
    global _cache_service
    if _cache_service is None:
        from app.core.redis import get_async_redis
        redis_client = await get_async_redis()
        _cache_service = CacheService(redis_client)
    return _cache_service


def get_cache_service_sync() -> CacheServiceSync:
    """获取同步缓存服务实例"""
    from app.core.redis import get_sync_redis
    redis_client = get_sync_redis()
    return CacheServiceSync(redis_client)
