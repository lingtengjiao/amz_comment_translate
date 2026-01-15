"""
评论入库服务 (Ingestion Service)

处理从 Redis 队列消费的评论数据，批量入库到 PostgreSQL。

设计特点：
1. 按 ASIN 分组处理，减少数据库查询
2. 三层去重：Redis Set → 内存 Set → DB ON CONFLICT
3. 入库成功后更新 Redis Set 和批次状态
"""
import logging
from collections import defaultdict
from typing import List, Dict, Tuple
from datetime import datetime
import json

from sqlalchemy import select, and_, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.review import Review, TranslationStatus
from app.services.deduplicator import ReviewDeduplicatorSync, deduplicate_in_memory
from app.core.redis import BatchStatusTrackerSync, get_sync_redis

logger = logging.getLogger(__name__)


class IngestionService:
    """
    评论入库服务（同步版本，用于 Celery Worker）
    """
    
    def __init__(self, db: Session, redis_client=None):
        self.db = db
        self.redis = redis_client or get_sync_redis()
        self.deduplicator = ReviewDeduplicatorSync(self.redis)
        self.batch_tracker = BatchStatusTrackerSync(self.redis)
    
    def process_queue_items(self, items: List[dict]) -> Dict[str, dict]:
        """
        处理从队列中取出的数据
        
        Args:
            items: 从 Redis 队列取出的原始数据列表
            
        Returns:
            处理结果统计 {asin: {inserted: N, skipped: N}}
        """
        if not items:
            return {}
        
        # Step 1: 按 ASIN 分组
        grouped = defaultdict(list)
        product_info_map = {}
        batch_ids = set()
        user_id_map = {}  # [NEW] ASIN -> user_id 映射
        
        for item in items:
            asin = item.get("asin")
            if not asin:
                logger.warning("Item without ASIN, skipping")
                continue
            
            grouped[asin].append(item)
            
            # 保存产品信息（取第一个有效的）
            if asin not in product_info_map:
                product_info_map[asin] = {
                    "title": item.get("title"),
                    "image_url": item.get("image_url"),
                    "marketplace": item.get("marketplace", "US"),
                    "average_rating": item.get("average_rating"),
                    "price": item.get("price"),
                    "bullet_points": item.get("bullet_points"),
                    "categories": item.get("categories")  # [NEW] 产品类目
                }
            
            # [NEW] 收集 user_id（取第一个非空的）
            if asin not in user_id_map and item.get("user_id"):
                user_id_map[asin] = item["user_id"]
            
            # 收集批次 ID
            if item.get("batch_id"):
                batch_ids.add(item["batch_id"])
        
        # Step 2: 逐 ASIN 处理
        results = {}
        
        for asin, asin_items in grouped.items():
            try:
                inserted, skipped = self._process_asin(
                    asin=asin,
                    items=asin_items,
                    product_info=product_info_map.get(asin, {}),
                    user_id=user_id_map.get(asin)  # [NEW] 传递 user_id
                )
                results[asin] = {"inserted": inserted, "skipped": skipped}
                
            except Exception as e:
                logger.error(f"Error processing ASIN {asin}: {e}")
                self.db.rollback()
                results[asin] = {"inserted": 0, "skipped": 0, "error": str(e)}
        
        # Step 3: 更新批次状态
        for batch_id in batch_ids:
            # 汇总该批次的结果
            total_inserted = sum(r.get("inserted", 0) for r in results.values())
            total_skipped = sum(r.get("skipped", 0) for r in results.values())
            self.batch_tracker.update(batch_id, "completed", total_inserted, total_skipped)
        
        # Step 4: 🚀 缓存失效 - 清除有新数据入库的产品缓存
        from app.core.cache import get_cache_service_sync
        cache = get_cache_service_sync()
        
        for asin, result in results.items():
            if result.get("inserted", 0) > 0:
                cache.invalidate_all_for_product(asin)
                logger.info(f"[Cache] Invalidated caches for product {asin}")
        
        # 清除相关用户的项目列表缓存
        for user_id in set(user_id_map.values()):
            if user_id:
                cache.delete_pattern(f"cache:user_projects:{user_id}:*")
                logger.info(f"[Cache] Invalidated user projects cache for user {user_id}")
        
        return results
    
    def _process_asin(
        self,
        asin: str,
        items: List[dict],
        product_info: dict,
        user_id: str = None  # [NEW] 用户 ID（可选）
    ) -> Tuple[int, int]:
        """
        处理单个 ASIN 的数据
        
        Returns:
            (inserted_count, skipped_count)
        """
        # 合并所有评论
        all_reviews = []
        for item in items:
            reviews = item.get("reviews", [])
            all_reviews.extend(reviews)
        
        if not all_reviews:
            return 0, 0
        
        # Step 1: Redis 预过滤
        filtered_reviews, skipped_redis, new_ids = self.deduplicator.filter_new_reviews(
            asin, all_reviews
        )
        
        if not filtered_reviews:
            logger.info(f"[{asin}] 全部 {len(all_reviews)} 条评论已存在，跳过")
            
            # [FIXED] 即使没有新评论，也要创建 UserProject 关联
            # 这样用户采集已有产品时，也能在"我的项目"中看到
            if user_id:
                # 需要先获取产品 ID
                product = self._get_or_create_product(asin, product_info)
                self._create_or_update_user_project(user_id, product.id, 0)
            
            return 0, skipped_redis
        
        # Step 2: 内存去重
        unique_reviews = deduplicate_in_memory(filtered_reviews)
        skipped_memory = len(filtered_reviews) - len(unique_reviews)
        
        # Step 3: 获取或创建产品
        product = self._get_or_create_product(asin, product_info)
        
        # Step 4: 批量入库
        inserted, skipped_db = self._bulk_insert_reviews(product.id, unique_reviews)
        
        # Step 5: 更新 Redis Set（只标记真正入库的）
        if inserted > 0:
            # 获取实际入库的 review_id
            inserted_ids = [r.get("review_id") for r in unique_reviews[:inserted] if r.get("review_id")]
            self.deduplicator.mark_as_seen(asin, inserted_ids)
        
        # [FIXED] Step 6: 创建用户项目关联
        # 无论是否有新评论入库，只要用户采集了产品，就创建关联
        # 这样用户 B 采集已有产品时，也能在"我的项目"中看到
        if user_id:
            self._create_or_update_user_project(user_id, product.id, inserted)
        
        total_skipped = skipped_redis + skipped_memory + skipped_db
        
        logger.info(
            f"[{asin}] 处理完成: 收到 {len(all_reviews)}, "
            f"Redis过滤 {skipped_redis}, 内存去重 {skipped_memory}, "
            f"DB去重 {skipped_db}, 入库 {inserted}"
        )
        
        return inserted, total_skipped
    
    def _get_or_create_product(self, asin: str, info: dict) -> Product:
        """获取或创建产品"""
        result = self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if product:
            # 🔧 [FIX] 智能更新字段：允许用更完整的数据覆盖占位数据
            # 更新 title：如果新数据更长（说明更完整），就更新
            if info.get("title"):
                if not product.title or len(info["title"]) > len(product.title):
                    product.title = info["title"]
                    product.title_translated = None  # 清空翻译
            if info.get("image_url") and not product.image_url:
                product.image_url = info["image_url"]
            if info.get("average_rating") is not None:
                product.average_rating = str(info["average_rating"])
            if info.get("price") and not product.price:
                product.price = info["price"]
            # 🔧 [FIX] 智能更新 bullet_points：
            # 1. 如果没有旧数据，直接使用新数据
            # 2. 如果旧数据是占位数据（总字符数<100），用新数据覆盖
            # 3. 如果新数据比旧数据内容更丰富（总字符数多2倍以上），用新数据覆盖
            if info.get("bullet_points"):
                bp = info["bullet_points"]
                new_bp_json = None
                
                # 统一转换为 JSON 字符串格式
                if isinstance(bp, list):
                    new_bp_json = json.dumps(bp, ensure_ascii=False)
                elif isinstance(bp, str):
                    try:
                        parsed = json.loads(bp)
                        if isinstance(parsed, list):
                            new_bp_json = bp
                        else:
                            new_bp_json = json.dumps([bp], ensure_ascii=False)
                    except json.JSONDecodeError:
                        new_bp_json = json.dumps([bp], ensure_ascii=False) if bp else None
                
                if new_bp_json:
                    should_update = False
                    
                    if not product.bullet_points:
                        # 没有旧数据，直接使用新数据
                        should_update = True
                    else:
                        # 判断旧数据是否是占位数据
                        old_len = len(product.bullet_points)
                        new_len = len(new_bp_json)
                        
                        # 占位数据判断：旧数据总长度 < 100 字符（如 '["Feature 1","Feature 2"]'）
                        if old_len < 100:
                            should_update = True
                        # 新数据明显更丰富：是旧数据的 2 倍以上
                        elif new_len > old_len * 2:
                            should_update = True
                    
                    if should_update:
                        product.bullet_points = new_bp_json
                        # 清空翻译，等待重新翻译
                        product.bullet_points_translated = None
            # 🔧 [FIX] 智能更新类目信息：允许用更完整的数据覆盖
            if info.get("categories"):
                cats = info["categories"]
                new_cats_json = None
                
                # 确保 categories 是 JSON 字符串格式
                if isinstance(cats, list):
                    new_cats_json = json.dumps(cats, ensure_ascii=False)
                elif isinstance(cats, str):
                    try:
                        json.loads(cats)
                        new_cats_json = cats
                    except json.JSONDecodeError:
                        pass
                
                if new_cats_json:
                    # 如果没有旧数据，或新数据更丰富，就更新
                    if not product.categories or len(new_cats_json) > len(product.categories):
                        product.categories = new_cats_json
            self.db.flush()
            return product
        
        # 创建新产品
        bullet_points = info.get("bullet_points")
        # 统一存储为 JSON 字符串格式
        if isinstance(bullet_points, list):
            bullet_points = json.dumps(bullet_points, ensure_ascii=False)
        elif isinstance(bullet_points, str):
            # 验证是否为有效 JSON 数组
            try:
                parsed = json.loads(bullet_points)
                if not isinstance(parsed, list):
                    bullet_points = json.dumps([bullet_points], ensure_ascii=False)
            except json.JSONDecodeError:
                bullet_points = json.dumps([bullet_points], ensure_ascii=False) if bullet_points else None
        else:
            bullet_points = None
        
        # [NEW] 处理类目信息
        categories = info.get("categories")
        if isinstance(categories, list):
            categories = json.dumps(categories, ensure_ascii=False)
        elif isinstance(categories, str):
            try:
                # 验证是否为有效 JSON
                json.loads(categories)
            except json.JSONDecodeError:
                categories = None
        else:
            categories = None
        
        product = Product(
            asin=asin,
            title=info.get("title"),
            image_url=info.get("image_url"),
            marketplace=info.get("marketplace", "US"),
            average_rating=str(info["average_rating"]) if info.get("average_rating") else None,
            price=info.get("price"),
            bullet_points=bullet_points,
            categories=categories
        )
        self.db.add(product)
        self.db.flush()
        
        logger.info(f"Created new product: {asin}")
        return product
    
    def _bulk_insert_reviews(
        self,
        product_id,
        reviews: List[dict]
    ) -> Tuple[int, int]:
        """
        批量插入评论
        
        Returns:
            (inserted_count, skipped_count)
        """
        if not reviews:
            return 0, 0
        
        # 准备记录
        records = []
        skipped_invalid = 0
        
        for r in reviews:
            review_id = r.get("review_id")
            if not review_id:
                skipped_invalid += 1
                continue
            
            body = r.get("body", "")
            if not body and r.get("rating", 0) == 0:
                skipped_invalid += 1
                continue
            
            # 解析日期
            review_date = None
            date_str = r.get("review_date")
            if date_str:
                for fmt in ["%B %d, %Y", "%Y-%m-%d", "%d %B %Y", "%b %d, %Y", "%d/%m/%Y"]:
                    try:
                        review_date = datetime.strptime(date_str, fmt).date()
                        break
                    except ValueError:
                        continue
            
            # 处理图片
            image_urls = r.get("image_urls")
            image_urls_json = None
            if image_urls and isinstance(image_urls, list):
                image_urls_json = json.dumps(image_urls)
            
            # 截断过长字段
            author = r.get("author")
            if author and len(author) > 500:
                author = author[:497] + "..."
            
            video_url = r.get("video_url")
            if video_url and len(video_url) > 500:
                video_url = video_url[:500]
            
            review_url = r.get("review_url")
            if review_url and len(review_url) > 500:
                review_url = review_url[:500]
            if not review_url and review_id.startswith('R'):
                review_url = f"https://www.amazon.com/gp/customer-reviews/{review_id}"
            
            import uuid
            records.append({
                "id": uuid.uuid4(),
                "product_id": product_id,
                "review_id": review_id,
                "author": author,
                "rating": r.get("rating", 0),
                "title_original": r.get("title"),
                "body_original": body,
                "review_date": review_date,
                "verified_purchase": r.get("verified_purchase", False),
                "helpful_votes": r.get("helpful_votes", 0),
                "has_video": r.get("has_video", False),
                "has_images": r.get("has_images", False),
                "image_urls": image_urls_json,
                "video_url": video_url,
                "review_url": review_url,
                "sentiment": "neutral",
                "translation_status": TranslationStatus.PENDING.value
            })
        
        if not records:
            return 0, skipped_invalid
        
        # 检查已存在的 review_id
        review_ids = [r["review_id"] for r in records]
        existing_result = self.db.execute(
            select(Review.review_id).where(
                and_(
                    Review.product_id == product_id,
                    Review.review_id.in_(review_ids)
                )
            )
        )
        existing_ids = set(existing_result.scalars().all())
        skipped_existing = len(existing_ids)
        
        # 使用 ON CONFLICT DO NOTHING
        stmt = insert(Review).values(records)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=['product_id', 'review_id']
        )
        
        self.db.execute(stmt)
        self.db.commit()
        
        inserted = len(records) - skipped_existing
        
        return inserted, skipped_invalid + skipped_existing
    
    def _create_or_update_user_project(self, user_id: str, product_id, reviews_count: int):
        """
        创建或更新用户项目关联
        
        [FIXED] 无论 reviews_count 是否 > 0，都会创建/更新关联
        这样用户采集已有产品时，也能在"我的项目"中看到
        
        Args:
            user_id: 用户 UUID（字符串）
            product_id: 产品 UUID
            reviews_count: 本次贡献的评论数（可能为 0）
        """
        from app.models.user_project import UserProject
        from uuid import UUID
        from datetime import datetime
        
        try:
            # 转换 user_id 为 UUID
            user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            
            # 查找现有关联
            result = self.db.execute(
                select(UserProject).where(
                    and_(
                        UserProject.user_id == user_uuid,
                        UserProject.product_id == product_id
                    )
                )
            )
            user_project = result.scalar_one_or_none()
            
            if user_project:
                # 已存在：更新贡献数和访问时间
                if reviews_count > 0:
                    user_project.reviews_contributed = (user_project.reviews_contributed or 0) + reviews_count
                    logger.info(f"[UserProject] 更新用户 {user_id} 的项目关联，新增贡献 {reviews_count} 条")
                else:
                    # 即使没有新评论，也更新访问时间
                    logger.info(f"[UserProject] 用户 {user_id} 重新采集产品，评论全部已存在，更新访问时间")
                user_project.last_viewed_at = datetime.now()
            else:
                # 不存在：创建新关联
                user_project = UserProject(
                    user_id=user_uuid,
                    product_id=product_id,
                    reviews_contributed=reviews_count  # 可能为 0
                )
                self.db.add(user_project)
                if reviews_count > 0:
                    logger.info(f"[UserProject] 创建用户 {user_id} 的项目关联，贡献 {reviews_count} 条")
                else:
                    logger.info(f"[UserProject] 创建用户 {user_id} 的项目关联（产品已有历史数据）")
            
            self.db.commit()
            
        except Exception as e:
            logger.error(f"[UserProject] 创建/更新失败: {e}")
            self.db.rollback()
    
    def sync_redis_from_db(self, asin: str):
        """
        从数据库同步 review_id 到 Redis
        用于冷启动或 Redis 重启后恢复
        """
        result = self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if not product:
            return
        
        # 获取所有 review_id
        review_result = self.db.execute(
            select(Review.review_id).where(Review.product_id == product.id)
        )
        review_ids = [r[0] for r in review_result.all()]
        
        if review_ids:
            self.deduplicator.sync_from_db(asin, review_ids)
