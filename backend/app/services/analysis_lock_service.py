"""
分析锁服务 (Analysis Lock Service)

实现 Check-Lock-Serve 模式：
1. Check: 检查是否有有效的缓存报告
2. Lock: 获取分析锁，防止重复分析
3. Serve: 分析完成后更新锁状态，广播结果

功能：
- 防止多用户同时触发同一产品的分析任务
- 支持增量分析判断
- 缓存有效期管理
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import uuid

from sqlalchemy import select, update, and_, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.models.analysis_lock import ProductAnalysisLock, LockStatus
from app.models.report import ProductReport
from app.models.review import Review

logger = logging.getLogger(__name__)

# 配置
CACHE_VALID_DAYS = 7  # 缓存有效期 7 天
INCREMENTAL_THRESHOLD = 50  # 新增评论超过 50 条触发增量分析


class AnalysisLockService:
    """分析锁服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def check_and_lock(
        self,
        product_id: uuid.UUID,
        analysis_type: str,
        user_id: Optional[uuid.UUID] = None,
        force: bool = False
    ) -> Tuple[str, Optional[dict]]:
        """
        检查并尝试获取分析锁
        
        Check-Lock 模式的核心方法：
        1. 如果有有效缓存 → 返回 "cached"
        2. 如果有进行中的分析 → 返回 "processing" 
        3. 如果成功获取锁 → 返回 "locked"
        4. 如果锁竞争失败 → 返回 "processing"
        
        Args:
            product_id: 产品 ID
            analysis_type: 分析类型
            user_id: 触发者用户 ID
            force: 是否强制重新分析
            
        Returns:
            (status, data) - status 为状态字符串，data 为相关数据
        """
        # Step 1: 检查缓存（除非 force=True）
        if not force:
            cached = await self._check_cache(product_id, analysis_type)
            if cached:
                logger.info(f"[分析锁] 产品 {product_id} 命中缓存")
                return "cached", cached
        
        # Step 2: 检查是否需要增量分析
        should_incremental, current_count, last_count = await self._should_incremental_analysis(
            product_id, analysis_type
        )
        
        # Step 3: 尝试获取锁
        lock_result = await self._try_acquire_lock(
            product_id=product_id,
            analysis_type=analysis_type,
            user_id=user_id,
            review_count=current_count
        )
        
        if lock_result is None:
            # 锁已存在，有其他任务正在处理
            processing_lock = await self._get_processing_lock(product_id, analysis_type)
            if processing_lock:
                logger.info(f"[分析锁] 产品 {product_id} 有进行中的分析任务")
                return "processing", {
                    "lock_id": str(processing_lock.id),
                    "created_at": processing_lock.created_at.isoformat() if processing_lock.created_at else None,
                    "triggered_by": str(processing_lock.triggered_by) if processing_lock.triggered_by else None
                }
            else:
                # 异常情况：锁失败但也没有 processing 锁
                return "error", {"message": "获取锁失败"}
        
        logger.info(f"[分析锁] 产品 {product_id} 成功获取锁, lock_id={lock_result.id}")
        
        return "locked", {
            "lock_id": str(lock_result.id),
            "should_incremental": should_incremental,
            "current_count": current_count,
            "last_count": last_count,
            "new_reviews": current_count - (last_count or 0) if last_count else current_count
        }
    
    async def _check_cache(
        self,
        product_id: uuid.UUID,
        analysis_type: str
    ) -> Optional[dict]:
        """
        检查是否有有效的缓存报告
        """
        # 查找最新的已完成锁
        result = await self.db.execute(
            select(ProductAnalysisLock)
            .where(
                and_(
                    ProductAnalysisLock.product_id == product_id,
                    ProductAnalysisLock.analysis_type == analysis_type,
                    ProductAnalysisLock.status == LockStatus.COMPLETED.value
                )
            )
            .order_by(ProductAnalysisLock.completed_at.desc())
            .limit(1)
        )
        lock = result.scalar_one_or_none()
        
        if not lock:
            return None
        
        # 检查是否过期
        if lock.result_valid_until:
            if datetime.now(timezone.utc) > lock.result_valid_until:
                return None
        
        # 检查是否有新评论需要增量分析
        current_count = await self._get_review_count(product_id)
        if lock.last_review_count and current_count > lock.last_review_count + INCREMENTAL_THRESHOLD:
            # 新增评论超过阈值，需要增量分析
            return None
        
        # 返回缓存信息
        return {
            "lock_id": str(lock.id),
            "report_id": str(lock.report_id) if lock.report_id else None,
            "completed_at": lock.completed_at.isoformat() if lock.completed_at else None,
            "review_count": lock.last_review_count
        }
    
    async def _should_incremental_analysis(
        self,
        product_id: uuid.UUID,
        analysis_type: str
    ) -> Tuple[bool, int, Optional[int]]:
        """
        判断是否应该进行增量分析
        
        Returns:
            (should_incremental, current_count, last_count)
        """
        current_count = await self._get_review_count(product_id)
        
        # 查找上次分析时的评论数
        result = await self.db.execute(
            select(ProductAnalysisLock.last_review_count)
            .where(
                and_(
                    ProductAnalysisLock.product_id == product_id,
                    ProductAnalysisLock.analysis_type == analysis_type,
                    ProductAnalysisLock.status == LockStatus.COMPLETED.value
                )
            )
            .order_by(ProductAnalysisLock.completed_at.desc())
            .limit(1)
        )
        last_count = result.scalar_one_or_none()
        
        if last_count is None:
            # 首次分析，全量
            return False, current_count, None
        
        new_reviews = current_count - last_count
        
        # 新增评论少于阈值，且占比小于 20%，使用增量
        if 0 < new_reviews <= INCREMENTAL_THRESHOLD and new_reviews < last_count * 0.2:
            return True, current_count, last_count
        
        return False, current_count, last_count
    
    async def _try_acquire_lock(
        self,
        product_id: uuid.UUID,
        analysis_type: str,
        user_id: Optional[uuid.UUID],
        review_count: int
    ) -> Optional[ProductAnalysisLock]:
        """
        尝试获取分析锁
        
        使用 PostgreSQL 的 ON CONFLICT 实现原子性获取
        
        Returns:
            成功返回锁对象，失败返回 None
        """
        lock = ProductAnalysisLock(
            product_id=product_id,
            analysis_type=analysis_type,
            status=LockStatus.PROCESSING.value,
            triggered_by=user_id,
            last_review_count=review_count,
            result_valid_until=datetime.now(timezone.utc) + timedelta(days=CACHE_VALID_DAYS)
        )
        
        try:
            self.db.add(lock)
            await self.db.flush()
            return lock
        except IntegrityError:
            # 唯一约束冲突，说明已有 processing 状态的锁
            await self.db.rollback()
            return None
    
    async def _get_processing_lock(
        self,
        product_id: uuid.UUID,
        analysis_type: str
    ) -> Optional[ProductAnalysisLock]:
        """获取当前正在处理的锁"""
        result = await self.db.execute(
            select(ProductAnalysisLock)
            .where(
                and_(
                    ProductAnalysisLock.product_id == product_id,
                    ProductAnalysisLock.analysis_type == analysis_type,
                    ProductAnalysisLock.status == LockStatus.PROCESSING.value
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def _get_review_count(self, product_id: uuid.UUID) -> int:
        """获取产品的评论数量"""
        result = await self.db.execute(
            select(func.count(Review.id))
            .where(
                and_(
                    Review.product_id == product_id,
                    Review.is_deleted == False
                )
            )
        )
        return result.scalar() or 0
    
    async def complete_lock(
        self,
        lock_id: uuid.UUID,
        report_id: Optional[uuid.UUID] = None,
        success: bool = True
    ):
        """
        完成分析锁
        
        Args:
            lock_id: 锁 ID
            report_id: 生成的报告 ID
            success: 是否成功
        """
        status = LockStatus.COMPLETED.value if success else LockStatus.FAILED.value
        
        await self.db.execute(
            update(ProductAnalysisLock)
            .where(ProductAnalysisLock.id == lock_id)
            .values(
                status=status,
                report_id=report_id,
                completed_at=datetime.now(timezone.utc)
            )
        )
        await self.db.commit()
        
        logger.info(f"[分析锁] 锁 {lock_id} 已完成, status={status}, report_id={report_id}")
    
    async def release_lock(self, lock_id: uuid.UUID):
        """
        释放锁（失败或取消时）
        """
        await self.db.execute(
            update(ProductAnalysisLock)
            .where(ProductAnalysisLock.id == lock_id)
            .values(
                status=LockStatus.FAILED.value,
                completed_at=datetime.now(timezone.utc)
            )
        )
        await self.db.commit()
        
        logger.info(f"[分析锁] 锁 {lock_id} 已释放")
    
    async def cleanup_expired_locks(self, timeout_minutes: int = 30):
        """
        清理超时的锁
        
        用于定期清理卡住的 processing 状态锁
        """
        timeout = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)
        
        result = await self.db.execute(
            update(ProductAnalysisLock)
            .where(
                and_(
                    ProductAnalysisLock.status == LockStatus.PROCESSING.value,
                    ProductAnalysisLock.created_at < timeout
                )
            )
            .values(
                status=LockStatus.EXPIRED.value,
                completed_at=datetime.now(timezone.utc)
            )
        )
        await self.db.commit()
        
        if result.rowcount > 0:
            logger.warning(f"[分析锁] 清理了 {result.rowcount} 个超时的锁")
        
        return result.rowcount
