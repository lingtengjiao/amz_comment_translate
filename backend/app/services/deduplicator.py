"""
评论去重服务 (Review Deduplicator)

使用 Redis Set 存储已入库的 review_id，实现高效预过滤。

设计理念：三层去重
1. 第一层：Redis Set 预过滤（极快，拦截 90%+ 重复）
2. 第二层：内存 Set（批次内去重）
3. 第三层：PostgreSQL ON CONFLICT（最终防线）

空间估算：
- 每个 review_id 约 20 字节
- 1 个产品 10,000 条评论 ≈ 200KB
- 10,000 个产品 ≈ 2GB Redis 内存
"""
import logging
from typing import List, Tuple, Optional, Set
import redis

from app.core.redis import KEY_PREFIX_SEEN_REVIEWS

logger = logging.getLogger(__name__)


class ReviewDeduplicator:
    """
    基于 Redis Set 的评论去重器（异步版本）
    """
    
    KEY_PREFIX = KEY_PREFIX_SEEN_REVIEWS
    EXPIRE_DAYS = 90  # 90 天后自动清理冷数据
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def filter_new_reviews(
        self, 
        asin: str, 
        reviews: List[dict]
    ) -> Tuple[List[dict], int, List[str]]:
        """
        过滤出新评论（Redis 中没见过的）
        
        Args:
            asin: 产品 ASIN
            reviews: 评论列表
            
        Returns:
            (new_reviews, skipped_count, new_ids)
            - new_reviews: 新评论列表
            - skipped_count: 跳过的数量
            - new_ids: 新评论的 review_id 列表
        """
        if not reviews:
            return [], 0, []
        
        key = f"{self.KEY_PREFIX}{asin}"
        
        # 提取所有 review_id
        review_id_map = {}  # review_id -> review
        for r in reviews:
            rid = r.get("review_id")
            if rid:
                review_id_map[rid] = r
        
        if not review_id_map:
            return reviews, 0, []
        
        review_ids = list(review_id_map.keys())
        
        # 批量检查哪些已存在
        try:
            # SMISMEMBER 需要 Redis 6.6.0+
            exists_flags = await self.redis.smismember(key, review_ids)
        except Exception:
            # 兼容旧版本 Redis，使用 pipeline
            pipe = self.redis.pipeline()
            for rid in review_ids:
                pipe.sismember(key, rid)
            exists_flags = await pipe.execute()
        
        # 过滤出新的
        new_reviews = []
        new_ids = []
        skipped = 0
        
        for rid, exists in zip(review_ids, exists_flags):
            if exists:
                skipped += 1
            else:
                new_reviews.append(review_id_map[rid])
                new_ids.append(rid)
        
        logger.debug(f"[{asin}] 预过滤: 收到 {len(reviews)}, 跳过 {skipped}, 待入库 {len(new_reviews)}")
        
        return new_reviews, skipped, new_ids
    
    async def mark_as_seen(self, asin: str, review_ids: List[str]):
        """
        入库成功后，标记这些 review_id 为已见
        
        Args:
            asin: 产品 ASIN
            review_ids: review_id 列表
        """
        if not review_ids:
            return
        
        key = f"{self.KEY_PREFIX}{asin}"
        try:
            await self.redis.sadd(key, *review_ids)
            await self.redis.expire(key, self.EXPIRE_DAYS * 24 * 3600)
        except Exception as e:
            logger.error(f"Failed to mark reviews as seen: {e}")
    
    async def sync_from_db(self, asin: str, review_ids: List[str]):
        """
        从数据库同步 review_id 到 Redis
        用于冷启动或 Redis 重启后恢复
        
        Args:
            asin: 产品 ASIN
            review_ids: 数据库中已有的 review_id 列表
        """
        if not review_ids:
            return
        
        key = f"{self.KEY_PREFIX}{asin}"
        try:
            # 批量添加
            await self.redis.sadd(key, *review_ids)
            await self.redis.expire(key, self.EXPIRE_DAYS * 24 * 3600)
            logger.info(f"[{asin}] 同步 {len(review_ids)} 条 review_id 到 Redis")
        except Exception as e:
            logger.error(f"Failed to sync review_ids to Redis: {e}")
    
    async def get_count(self, asin: str) -> int:
        """获取已见评论数量"""
        key = f"{self.KEY_PREFIX}{asin}"
        try:
            return await self.redis.scard(key)
        except Exception:
            return 0


class ReviewDeduplicatorSync:
    """
    同步版本的去重器（用于 Celery Worker）
    """
    
    KEY_PREFIX = KEY_PREFIX_SEEN_REVIEWS
    EXPIRE_DAYS = 90
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    def filter_new_reviews(
        self, 
        asin: str, 
        reviews: List[dict]
    ) -> Tuple[List[dict], int, List[str]]:
        """
        过滤出新评论（同步版本）
        
        Returns:
            (new_reviews, skipped_count, new_ids)
        """
        if not reviews:
            return [], 0, []
        
        key = f"{self.KEY_PREFIX}{asin}"
        
        # 提取所有 review_id
        review_id_map = {}
        for r in reviews:
            rid = r.get("review_id")
            if rid:
                review_id_map[rid] = r
        
        if not review_id_map:
            return reviews, 0, []
        
        review_ids = list(review_id_map.keys())
        
        # 批量检查
        try:
            # 尝试使用 SMISMEMBER（Redis 6.6+）
            exists_flags = self.redis.smismember(key, review_ids)
        except Exception:
            # 兼容旧版本
            pipe = self.redis.pipeline()
            for rid in review_ids:
                pipe.sismember(key, rid)
            exists_flags = pipe.execute()
        
        # 过滤
        new_reviews = []
        new_ids = []
        skipped = 0
        
        for rid, exists in zip(review_ids, exists_flags):
            if exists:
                skipped += 1
            else:
                new_reviews.append(review_id_map[rid])
                new_ids.append(rid)
        
        logger.debug(f"[{asin}] 预过滤: 收到 {len(reviews)}, 跳过 {skipped}, 待入库 {len(new_reviews)}")
        
        return new_reviews, skipped, new_ids
    
    def mark_as_seen(self, asin: str, review_ids: List[str]):
        """入库成功后标记为已见"""
        if not review_ids:
            return
        
        key = f"{self.KEY_PREFIX}{asin}"
        try:
            self.redis.sadd(key, *review_ids)
            self.redis.expire(key, self.EXPIRE_DAYS * 24 * 3600)
        except Exception as e:
            logger.error(f"Failed to mark reviews as seen: {e}")
    
    def sync_from_db(self, asin: str, review_ids: List[str]):
        """从数据库同步 review_id 到 Redis"""
        if not review_ids:
            return
        
        key = f"{self.KEY_PREFIX}{asin}"
        try:
            self.redis.sadd(key, *review_ids)
            self.redis.expire(key, self.EXPIRE_DAYS * 24 * 3600)
            logger.info(f"[{asin}] 同步 {len(review_ids)} 条 review_id 到 Redis")
        except Exception as e:
            logger.error(f"Failed to sync review_ids to Redis: {e}")


def deduplicate_in_memory(reviews: List[dict]) -> List[dict]:
    """
    内存中去重（批次内去重）
    
    用于同一批次中可能包含重复评论的情况
    
    Args:
        reviews: 评论列表
        
    Returns:
        去重后的评论列表
    """
    seen: Set[str] = set()
    unique = []
    
    for r in reviews:
        rid = r.get("review_id")
        if rid and rid not in seen:
            seen.add(rid)
            unique.append(r)
        elif not rid:
            # 没有 review_id 的保留（可能是无效数据，由后续逻辑处理）
            unique.append(r)
    
    return unique
