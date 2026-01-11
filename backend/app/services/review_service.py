"""
Review Service - Database operations for reviews
"""
import logging
import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from uuid import UUID

from sqlalchemy import select, func, and_, update, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.review import Review, TranslationStatus
from app.models.task import Task, TaskStatus, TaskType
from app.models.insight import ReviewInsight

logger = logging.getLogger(__name__)


class ReviewService:
    """Service for managing reviews in the database."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_scientific_samples(
        self,
        product_id: UUID,
        limit_total: int = 50
    ) -> List[str]:
        """
        科学采样算法：从数据库中提取"高质量、无偏差"的样本，用于 AI 学习。
        
        采样策略：
        1. 分层抽样 (Stratified): 覆盖 1-5 星，每种星级取 limit_total / 5 条
        2. 质量排序 (Quality): 优先取 helpful_votes 高、字数多的评论
        3. 兼容原文: 返回英文原文 (body_original)，用于跨语言零样本学习
        
        这允许系统在翻译尚未完成时就开始学习维度和标签。
        
        Args:
            product_id: 产品 UUID
            limit_total: 总采样数量，默认 50
            
        Returns:
            英文原文评论列表 (body_original)
        """
        from sqlalchemy import desc
        
        samples = []
        limit_per_star = max(1, limit_total // 5)  # 每个星级至少取 1 条
        
        for star in range(1, 6):
            stmt = (
                select(Review.body_original)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.rating == star,
                        Review.body_original.isnot(None),
                        Review.body_original != "",
                        Review.is_deleted == False
                    )
                )
                .order_by(
                    desc(Review.helpful_votes),             # 权重1: 有用票数高
                    desc(func.length(Review.body_original)) # 权重2: 评论长度长
                )
                .limit(limit_per_star)
            )
            result = await self.db.execute(stmt)
            star_samples = [r[0] for r in result.all() if r[0] and r[0].strip()]
            samples.extend(star_samples)
            logger.debug(f"科学采样: {star}星取到 {len(star_samples)} 条")
        
        # 如果样本不够（比如某些星级没有评论），从全量中补充
        if len(samples) < limit_total:
            needed = limit_total - len(samples)
            existing_set = set(samples)
            
            supplement_stmt = (
                select(Review.body_original)
                .where(
                    and_(
                        Review.product_id == product_id,
                        Review.body_original.isnot(None),
                        Review.body_original != "",
                        Review.is_deleted == False,
                        ~Review.body_original.in_(list(existing_set)) if existing_set else True
                    )
                )
                .order_by(
                    desc(Review.helpful_votes),
                    desc(func.length(Review.body_original))
                )
                .limit(needed)
            )
            result = await self.db.execute(supplement_stmt)
            supplement_samples = [r[0] for r in result.all() if r[0] and r[0].strip() and r[0] not in existing_set]
            samples.extend(supplement_samples)
            logger.debug(f"科学采样: 补充了 {len(supplement_samples)} 条")
        
        logger.info(f"科学采样完成: 产品 {product_id} 共采样 {len(samples)} 条高质量英文评论")
        return samples
    
    async def count_reviews(self, product_id: UUID) -> int:
        """
        统计产品的评论数量（排除已删除）。
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            评论数量
        """
        result = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product_id,
                    Review.is_deleted == False
                )
            )
        )
        return result.scalar() or 0
    
    async def get_or_create_product(
        self,
        asin: str,
        title: Optional[str] = None,
        image_url: Optional[str] = None,
        marketplace: str = "US",
        average_rating: Optional[float] = None,
        price: Optional[str] = None,
        bullet_points: Optional[str] = None
    ) -> Product:
        """
        Get existing product by ASIN or create a new one.
        
        Args:
            asin: Amazon ASIN
            title: Product title
            image_url: Product image URL
            marketplace: Amazon marketplace
            average_rating: Average rating from product page
            price: Product price with currency
            bullet_points: Product bullet points as JSON string
            
        Returns:
            Product instance
        """
        # Try to find existing product
        result = await self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = result.scalar_one_or_none()
        
        if product:
            # Update if new info provided
            if title and not product.title:
                product.title = title
            if image_url and not product.image_url:
                product.image_url = image_url
            # Always update average_rating if provided (it's the real rating from product page)
            if average_rating is not None:
                product.average_rating = str(average_rating)
            # Update price if provided and not already set
            if price and not product.price:
                product.price = price
            # Update bullet_points if provided and not already set
            if bullet_points and not product.bullet_points:
                product.bullet_points = bullet_points
            await self.db.flush()
            return product
        
        # Create new product
        product = Product(
            asin=asin,
            title=title,
            image_url=image_url,
            marketplace=marketplace,
            average_rating=str(average_rating) if average_rating is not None else None,
            price=price,
            bullet_points=bullet_points
        )
        self.db.add(product)
        await self.db.flush()
        logger.info(f"Created new product: {asin}")
        return product
    
    async def get_or_create_task(
        self,
        product_id: UUID,
        task_type: TaskType = TaskType.TRANSLATION,
        total_items: int = 0
    ) -> Task:
        """
        Get existing task or create a new one for a product.
        Each product should have only one task per task_type.
        
        Args:
            product_id: Product UUID
            task_type: Type of task
            total_items: Total items to process (only used when creating new task)
            
        Returns:
            Task instance
        """
        # Try to find existing task
        result = await self.db.execute(
            select(Task).where(
                and_(
                    Task.product_id == product_id,
                    Task.task_type == task_type.value
                )
            )
        )
        task = result.scalar_one_or_none()
        
        if task:
            # Update total_items if provided and task is not processing/completed
            if total_items > 0 and task.status in [TaskStatus.PENDING.value, TaskStatus.FAILED.value]:
                task.total_items = total_items
                task.processed_items = 0  # Reset processed count
                task.error_message = None  # Clear error message
            await self.db.flush()
            return task
        
        # Create new task
        task = Task(
            product_id=product_id,
            task_type=task_type.value,
            status=TaskStatus.PENDING.value,
            total_items=total_items
        )
        self.db.add(task)
        await self.db.flush()
        logger.info(f"Created task {task.id} for product {product_id}, type {task_type.value}")
        return task
    
    async def bulk_insert_reviews(
        self,
        product_id: UUID,
        reviews_data: List[dict]
    ) -> Tuple[int, int]:
        """
        Bulk insert reviews, skipping duplicates using PostgreSQL ON CONFLICT.
        
        Args:
            product_id: Product UUID
            reviews_data: List of review data dicts
            
        Returns:
            Tuple of (inserted_count, skipped_count)
        """
        if not reviews_data:
            return 0, 0
        
        # Prepare review records
        review_records = []
        skipped_no_id = 0
        skipped_no_content = 0
        for review_data in reviews_data:
            review_id = review_data.get("review_id")
            if not review_id:
                skipped_no_id += 1
                logger.warning(f"Skipping review with no review_id: {review_data}")
                continue
            
            # Check if we have at least body or rating
            body = review_data.get("body", "")
            rating = review_data.get("rating", 0)
            if not body and rating == 0:
                skipped_no_content += 1
                logger.warning(f"Skipping review {review_id} with no body and no rating")
                continue
            
            # Parse date if provided
            review_date = None
            date_str = review_data.get("review_date")
            if date_str:
                try:
                    # Try common date formats
                    for fmt in ["%B %d, %Y", "%Y-%m-%d", "%d %B %Y", "%b %d, %Y", "%d/%m/%Y"]:
                        try:
                            review_date = datetime.strptime(date_str, fmt).date()
                            break
                        except ValueError:
                            continue
                except Exception:
                    pass
            
            # Process image_urls - convert list to JSON string
            image_urls = review_data.get("image_urls")
            image_urls_json = None
            if image_urls and isinstance(image_urls, list) and len(image_urls) > 0:
                import json
                image_urls_json = json.dumps(image_urls)
            
            # 防御性截断：确保字段不超过数据库列长度限制
            author = review_data.get("author")
            if author and len(author) > 500:
                author = author[:497] + "..."
            
            video_url = review_data.get("video_url")
            if video_url and len(video_url) > 500:
                video_url = video_url[:500]
            
            # 处理 review_url - 如果没有则根据 review_id 生成
            review_url = review_data.get("review_url")
            if review_url and len(review_url) > 500:
                review_url = review_url[:500]
            # 如果没有 review_url，根据 review_id 生成默认链接
            if not review_url and review_id.startswith('R'):
                review_url = f"https://www.amazon.com/gp/customer-reviews/{review_id}"
            
            review_records.append({
                "id": uuid.uuid4(),
                "product_id": product_id,
                "review_id": review_id,
                "author": author,
                "rating": review_data.get("rating", 0),
                "title_original": review_data.get("title"),  # TEXT 类型，无需截断
                "body_original": review_data.get("body", ""),  # TEXT 类型，无需截断
                "review_date": review_date,
                "verified_purchase": review_data.get("verified_purchase", False),
                "helpful_votes": review_data.get("helpful_votes", 0),
                # Media fields
                "has_video": review_data.get("has_video", False),
                "has_images": review_data.get("has_images", False),
                "image_urls": image_urls_json,
                "video_url": video_url,
                # Review link
                "review_url": review_url,
                "sentiment": "neutral",
                "translation_status": TranslationStatus.PENDING.value
            })
        
        if not review_records:
            return 0, 0
        
        total_count = len(review_records)
        
        # 🔥 [FIX] 在 INSERT 之前检查已存在的 review_id
        review_ids = [r["review_id"] for r in review_records]
        existing_reviews_result = await self.db.execute(
            select(Review.review_id).where(
                and_(
                    Review.product_id == product_id,
                    Review.review_id.in_(review_ids)
                )
            )
        )
        existing_review_ids = set(existing_reviews_result.scalars().all())
        skipped_duplicates = len(existing_review_ids)
        
        # Use PostgreSQL ON CONFLICT to handle duplicates atomically
        stmt = insert(Review).values(review_records)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=['product_id', 'review_id']
        )
        
        result = await self.db.execute(stmt)
        await self.db.flush()
        
        # 🔥 [FIX] 正确计算插入数量：总数 - 之前已存在的数量
        inserted = total_count - skipped_duplicates
        
        logger.info(
            f"Bulk insert summary: "
            f"{inserted} inserted, "
            f"{skipped_duplicates} duplicates skipped, "
            f"{skipped_no_id} no review_id, "
            f"{skipped_no_content} no content, "
            f"total received: {len(reviews_data)}, "
            f"total processed: {total_count}"
        )
        return inserted, skipped_duplicates
    
    async def get_pending_reviews(
        self,
        product_id: UUID,
        limit: int = 1000  # ✅ 将默认限制从 50 提升到 1000，避免翻译时遗漏评论
    ) -> List[Review]:
        """
        Get reviews pending translation.
        
        Args:
            product_id: Product UUID
            limit: Max number of reviews to return (default: 1000)
            
        Returns:
            List of Review instances
        """
        result = await self.db.execute(
            select(Review)
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.translation_status == TranslationStatus.PENDING.value
                )
            )
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def update_review_translation(
        self,
        review_id: UUID,
        title_translated: Optional[str],
        body_translated: str,
        sentiment: str,
        status: TranslationStatus = TranslationStatus.COMPLETED
    ):
        """
        Update a review with translation results.
        
        Args:
            review_id: Review UUID
            title_translated: Translated title
            body_translated: Translated body
            sentiment: Sentiment analysis result
            status: Translation status
        """
        await self.db.execute(
            update(Review)
            .where(Review.id == review_id)
            .values(
                title_translated=title_translated,
                body_translated=body_translated,
                sentiment=sentiment,
                translation_status=status.value,
                updated_at=datetime.utcnow()
            )
        )
        await self.db.flush()
    
    async def get_product_reviews(
        self,
        asin: str,
        page: int = 1,
        page_size: int = 20,
        rating_filter: Optional[int] = None,
        sentiment_filter: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> Tuple[List[Review], int]:
        """
        Get paginated reviews for a product with optional filters.
        
        Args:
            asin: Product ASIN
            page: Page number (1-indexed)
            page_size: Items per page
            rating_filter: Filter by star rating
            sentiment_filter: Filter by sentiment
            status_filter: Filter by translation status
            
        Returns:
            Tuple of (reviews list, total count)
        """
        # Get product
        product_result = await self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            return [], 0
        
        # Build query with eager loading for insights and theme_highlights
        # Filter out deleted reviews (logical delete)
        query = select(Review).where(
            and_(
                Review.product_id == product.id,
                Review.is_deleted == False  # Only show non-deleted reviews
            )
        ).options(
            selectinload(Review.insights),          # Eager load insights
            selectinload(Review.theme_highlights)   # Eager load theme highlights
        )
        count_query = select(func.count(Review.id)).where(
            and_(
                Review.product_id == product.id,
                Review.is_deleted == False  # Only count non-deleted reviews
            )
        )
        
        # Apply filters
        if rating_filter:
            query = query.where(Review.rating == rating_filter)
            count_query = count_query.where(Review.rating == rating_filter)
        
        if sentiment_filter:
            query = query.where(Review.sentiment == sentiment_filter)
            count_query = count_query.where(Review.sentiment == sentiment_filter)
        
        if status_filter:
            query = query.where(Review.translation_status == status_filter)
            count_query = count_query.where(Review.translation_status == status_filter)
        
        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar()
        
        # Apply pagination
        offset = (page - 1) * page_size
        # 默认按评论日期降序排序（与前端显示顺序一致）
        query = query.order_by(Review.review_date.desc().nullslast(), Review.created_at.desc()).offset(offset).limit(page_size)
        
        result = await self.db.execute(query)
        reviews = list(result.scalars().all())
        
        return reviews, total
    
    async def get_all_products(self) -> List[dict]:
        """
        Get all products with their review statistics.
        
        Returns:
            List of product dicts with statistics
        """
        # Get all products
        products_result = await self.db.execute(
            select(Product).order_by(Product.updated_at.desc())
        )
        products = products_result.scalars().all()
        
        result = []
        for product in products:
            # Get review counts
            total_result = await self.db.execute(
                select(func.count(Review.id)).where(Review.product_id == product.id)
            )
            total_reviews = total_result.scalar() or 0
            
            translated_result = await self.db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.translation_status == TranslationStatus.COMPLETED.value
                    )
                )
            )
            translated_reviews = translated_result.scalar() or 0
            
            # Use real average rating from product page, fallback to calculated if not available
            if product.average_rating:
                avg_rating = float(product.average_rating)
            else:
                # Fallback: calculate from collected reviews (for backward compatibility)
                avg_result = await self.db.execute(
                    select(func.avg(Review.rating)).where(Review.product_id == product.id)
                )
                avg_rating = avg_result.scalar() or 0.0
            
            # Determine overall status
            if total_reviews == 0:
                status = TranslationStatus.PENDING
            elif translated_reviews == total_reviews:
                status = TranslationStatus.COMPLETED
            elif translated_reviews > 0:
                status = TranslationStatus.PROCESSING
            else:
                status = TranslationStatus.PENDING
            
            result.append({
                "id": product.id,
                "asin": product.asin,
                "title": product.title,
                "image_url": product.image_url,
                "marketplace": product.marketplace,
                "total_reviews": total_reviews,
                "translated_reviews": translated_reviews,
                "average_rating": round(float(avg_rating), 2),
                "translation_status": status,
                "created_at": product.created_at,
                "updated_at": product.updated_at
            })
        
        return result
    
    async def get_products_by_ids(self, product_ids: List) -> List[dict]:
        """
        Get products by their IDs with review statistics.
        
        Args:
            product_ids: List of product UUIDs
            
        Returns:
            List of product dicts with statistics
        """
        if not product_ids:
            return []
        
        # Get products by IDs
        products_result = await self.db.execute(
            select(Product)
            .where(Product.id.in_(product_ids))
            .order_by(Product.updated_at.desc())
        )
        products = products_result.scalars().all()
        
        result = []
        for product in products:
            # Get review counts
            total_result = await self.db.execute(
                select(func.count(Review.id)).where(Review.product_id == product.id)
            )
            total_reviews = total_result.scalar() or 0
            
            translated_result = await self.db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.translation_status == TranslationStatus.COMPLETED.value
                    )
                )
            )
            translated_reviews = translated_result.scalar() or 0
            
            # Use real average rating from product page
            if product.average_rating:
                avg_rating = float(product.average_rating)
            else:
                avg_result = await self.db.execute(
                    select(func.avg(Review.rating)).where(Review.product_id == product.id)
                )
                avg_rating = avg_result.scalar() or 0.0
            
            # Determine overall status
            if total_reviews == 0:
                status = TranslationStatus.PENDING
            elif translated_reviews == total_reviews:
                status = TranslationStatus.COMPLETED
            elif translated_reviews > 0:
                status = TranslationStatus.PROCESSING
            else:
                status = TranslationStatus.PENDING
            
            result.append({
                "id": product.id,
                "asin": product.asin,
                "title": product.title,
                "image_url": product.image_url,
                "marketplace": product.marketplace,
                "total_reviews": total_reviews,
                "translated_reviews": translated_reviews,
                "average_rating": round(float(avg_rating), 2),
                "translation_status": status,
                "created_at": product.created_at,
                "updated_at": product.updated_at
            })
        
        return result
    
    async def get_product_stats(self, asin: str) -> Optional[dict]:
        """
        Get detailed statistics for a product.
        
        Args:
            asin: Product ASIN
            
        Returns:
            Dict with product info and statistics
        """
        # Get product
        product_result = await self.db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            return None
        
        # Rating distribution (exclude deleted reviews)
        rating_dist = {}
        for star in range(1, 6):
            count_result = await self.db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.rating == star,
                        Review.is_deleted == False
                    )
                )
            )
            rating_dist[f"star_{star}"] = count_result.scalar() or 0
        
        # Sentiment distribution (exclude deleted reviews)
        sentiment_dist = {}
        for sentiment in ["positive", "neutral", "negative"]:
            count_result = await self.db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.sentiment == sentiment,
                        Review.is_deleted == False
                    )
                )
            )
            sentiment_dist[sentiment] = count_result.scalar() or 0
        
        # Total and translated counts (exclude deleted reviews)
        total_result = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.is_deleted == False
                )
            )
        )
        total_reviews = total_result.scalar() or 0
        
        translated_result = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.translation_status == TranslationStatus.COMPLETED.value,
                    Review.is_deleted == False
                )
            )
        )
        translated_reviews = translated_result.scalar() or 0
        
        # Count reviews with insights (exclude deleted reviews)
        insights_result = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.product_id == product.id,
                    Review.is_deleted == False,
                    exists(
                        select(1).where(ReviewInsight.review_id == Review.id)
                    )
                )
            )
        )
        reviews_with_insights = insights_result.scalar() or 0
        
        # Count reviews with theme highlights (exclude deleted reviews)
        from app.models.theme_highlight import ReviewThemeHighlight
        themes_result = await self.db.execute(
            select(func.count(Review.id.distinct())).where(
                and_(
                    Review.product_id == product.id,
                    Review.is_deleted == False,
                    exists(
                        select(1).where(ReviewThemeHighlight.review_id == Review.id)
                    )
                )
            )
        )
        reviews_with_themes = themes_result.scalar() or 0
        
        # Use real average rating from product page, fallback to calculated if not available
        if product.average_rating:
            avg_rating = float(product.average_rating)
        else:
            # Fallback: calculate from collected reviews (exclude deleted)
            avg_result = await self.db.execute(
                select(func.avg(Review.rating)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.is_deleted == False
                    )
                )
            )
            avg_rating = avg_result.scalar() or 0.0
        
        # Determine overall status
        if total_reviews == 0:
            status = TranslationStatus.PENDING
        elif translated_reviews == total_reviews:
            status = TranslationStatus.COMPLETED
        elif translated_reviews > 0:
            status = TranslationStatus.PROCESSING
        else:
            status = TranslationStatus.PENDING
        
        # Parse bullet_points - handle both PostgreSQL text[] array and JSON string
        import json
        bullet_points = None
        bullet_points_translated = None
        
        if product.bullet_points:
            # PostgreSQL text[] array returns as Python list directly
            if isinstance(product.bullet_points, list):
                bullet_points = product.bullet_points
            elif isinstance(product.bullet_points, str):
                try:
                    bullet_points = json.loads(product.bullet_points)
                except (json.JSONDecodeError, TypeError):
                    bullet_points = [product.bullet_points] if product.bullet_points else None
            else:
                bullet_points = None
        
        if product.bullet_points_translated:
            # PostgreSQL text[] array returns as Python list directly
            if isinstance(product.bullet_points_translated, list):
                bullet_points_translated = product.bullet_points_translated
            elif isinstance(product.bullet_points_translated, str):
                try:
                    bullet_points_translated = json.loads(product.bullet_points_translated)
                except (json.JSONDecodeError, TypeError):
                    bullet_points_translated = [product.bullet_points_translated] if product.bullet_points_translated else None
            else:
                bullet_points_translated = None
        
        return {
            "product": {
                "id": product.id,
                "asin": product.asin,
                "title": product.title,
                "title_translated": product.title_translated,
                "image_url": product.image_url,
                "marketplace": product.marketplace,
                "price": product.price,
                "bullet_points": bullet_points,
                "bullet_points_translated": bullet_points_translated,
                "total_reviews": total_reviews,
                "translated_reviews": translated_reviews,
                "reviews_with_insights": reviews_with_insights,
                "reviews_with_themes": reviews_with_themes,
                "average_rating": round(float(avg_rating), 2),
                "translation_status": status,
                "created_at": product.created_at,
                "updated_at": product.updated_at
            },
            "rating_distribution": rating_dist,
            "sentiment_distribution": sentiment_dist
        }

