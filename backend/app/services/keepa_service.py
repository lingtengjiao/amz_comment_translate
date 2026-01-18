"""
Keepa Service - Wrapper for Keepa API to fetch product time series data
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

import keepa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.product import Product
from app.models.product_time_series import ProductTimeSeries

logger = logging.getLogger(__name__)


class KeepaService:
    """Service for interacting with Keepa API"""
    
    def __init__(self):
        """Initialize Keepa API client"""
        if not settings.KEEPA_API_KEY:
            raise ValueError("KEEPA_API_KEY is not configured")
        self.api = keepa.Keepa(settings.KEEPA_API_KEY)
        logger.info("Keepa API client initialized")
    
    def query_product(self, asin: str, domain: str = "US") -> Optional[Dict[str, Any]]:
        """
        查询产品的时序数据
        
        Args:
            asin: Amazon ASIN
            domain: Amazon marketplace domain (US, UK, DE, etc.)
            
        Returns:
            Keepa 产品数据字典，如果产品不存在则返回 None
        """
        try:
            products = self.api.query(asin, domain=domain, history=True, rating=True)
            
            if not products or len(products) == 0:
                logger.warning(f"No data found for ASIN: {asin}")
                return None
            
            product = products[0]
            
            # 检查产品是否有数据
            if not product.get('data'):
                logger.warning(f"No time series data for ASIN: {asin}")
                return None
            
            return product
            
        except Exception as e:
            logger.error(f"Error querying Keepa API for ASIN {asin}: {str(e)}")
            raise
    
    def get_price_history(self, keepa_data: Dict[str, Any], condition: str = "NEW") -> List[Tuple[datetime, float]]:
        """
        从 Keepa 数据中提取价格历史
        
        Args:
            keepa_data: Keepa API 返回的产品数据
            condition: 价格条件 (NEW, USED, REFURBISHED, COLLECTIBLE, etc.)
            
        Returns:
            价格历史列表 [(timestamp, price), ...]
        """
        import numpy as np
        
        data = keepa_data.get('data', {})
        price_key = condition  # NEW, USED, etc.
        time_key = f"{condition}_time"
        
        prices = data.get(price_key)
        times = data.get(time_key)
        
        # 检查数据是否存在
        if prices is None or times is None:
            return []
        
        # 转换 numpy 数组长度检查
        try:
            if len(prices) != len(times) or len(prices) == 0:
                return []
        except:
            return []
        
        # Keepa Python 库已经将时间转换为 datetime 对象
        # 价格单位是美分，需要转换为美元
        history = []
        for price, timestamp in zip(prices, times):
            # 检查 nan 值（numpy 数组中的无效值）
            try:
                if np.isnan(price) if isinstance(price, (float, np.floating)) else False:
                    continue
                if price is None or timestamp is None:
                    continue
                if price <= 0:
                    continue
                    
                # Keepa 价格单位是美分，转换为美元
                price_value = float(price)
                history.append((timestamp, price_value))
            except (TypeError, ValueError):
                continue
        
        return history
    
    def get_sales_rank_history(self, keepa_data: Dict[str, Any]) -> List[Tuple[datetime, int]]:
        """
        获取销售排名历史
        
        Args:
            keepa_data: Keepa API 返回的产品数据
            
        Returns:
            销售排名历史列表 [(timestamp, rank), ...]
        """
        import numpy as np
        
        data = keepa_data.get('data', {})
        ranks = data.get('SALES')
        times = data.get('SALES_time')
        
        if ranks is None or times is None:
            return []
        
        try:
            if len(ranks) != len(times) or len(ranks) == 0:
                return []
        except:
            return []
        
        history = []
        for rank, timestamp in zip(ranks, times):
            try:
                # 跳过无效值（-1 或 nan）
                if rank is None or timestamp is None:
                    continue
                if isinstance(rank, (float, np.floating)) and np.isnan(rank):
                    continue
                rank_int = int(rank)
                if rank_int <= 0:  # -1 表示无数据
                    continue
                history.append((timestamp, rank_int))
            except (TypeError, ValueError):
                continue
        
        return history
    
    def get_rating_history(self, keepa_data: Dict[str, Any]) -> List[Tuple[datetime, float, int]]:
        """
        获取评分和评论数量历史
        
        Args:
            keepa_data: Keepa API 返回的产品数据
            
        Returns:
            评分历史列表 [(timestamp, rating, review_count), ...]
        """
        import numpy as np
        
        data = keepa_data.get('data', {})
        ratings = data.get('RATING')
        review_counts = data.get('COUNT_REVIEWS')  # Keepa 使用 COUNT_REVIEWS
        times = data.get('RATING_time')
        
        if ratings is None or times is None:
            return []
        
        try:
            if len(times) == 0:
                return []
        except:
            return []
        
        history = []
        for i, timestamp in enumerate(times):
            try:
                if timestamp is None:
                    continue
                    
                # 获取评分（Keepa Python 库已转换为正常值，如 4.5）
                rating = None
                if i < len(ratings) and ratings[i] is not None:
                    rating_val = ratings[i]
                    if not (isinstance(rating_val, (float, np.floating)) and np.isnan(rating_val)):
                        rating = float(rating_val)  # 无需除以 10
                
                # 获取评论数
                review_count = 0
                if review_counts is not None and i < len(review_counts) and review_counts[i] is not None:
                    count_val = review_counts[i]
                    if not (isinstance(count_val, (float, np.floating)) and np.isnan(count_val)):
                        review_count = int(count_val)
                
                if rating is not None and rating > 0:
                    history.append((timestamp, rating, review_count))
            except (TypeError, ValueError, IndexError):
                continue
        
        return history


class KeepaDataService:
    """Service for managing Keepa data in database"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_or_create_time_series(
        self,
        product_id
    ) -> ProductTimeSeries:
        """
        获取或创建产品的时序数据记录
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            ProductTimeSeries 实例
        """
        from uuid import UUID
        stmt = select(ProductTimeSeries).where(
            ProductTimeSeries.product_id == product_id
        )
        result = await self.db.execute(stmt)
        time_series = result.scalar_one_or_none()
        
        if not time_series:
            time_series = ProductTimeSeries(
                product_id=product_id,
                keepa_data={}
            )
            self.db.add(time_series)
            await self.db.flush()
        
        return time_series
    
    async def update_time_series(
        self,
        product_id,
        keepa_data: Dict[str, Any]
    ) -> ProductTimeSeries:
        """
        更新产品的时序数据
        
        Args:
            product_id: 产品 UUID
            keepa_data: Keepa API 返回的数据
            
        Returns:
            更新后的 ProductTimeSeries 实例
        """
        time_series = await self.get_or_create_time_series(product_id)
        time_series.keepa_data = keepa_data
        time_series.last_updated = datetime.now()
        
        await self.db.commit()
        await self.db.refresh(time_series)
        
        return time_series
    
    async def get_time_series(
        self,
        product_id
    ) -> Optional[ProductTimeSeries]:
        """
        获取产品的时序数据
        
        Args:
            product_id: 产品 UUID
            
        Returns:
            ProductTimeSeries 实例，如果不存在则返回 None
        """
        stmt = select(ProductTimeSeries).where(
            ProductTimeSeries.product_id == product_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
