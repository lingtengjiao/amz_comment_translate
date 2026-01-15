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
        data = keepa_data.get('data', {})
        price_key = condition  # NEW, USED, etc.
        time_key = f"{condition}_time"
        
        prices = data.get(price_key, [])
        times = data.get(time_key, [])
        
        if not prices or not times or len(prices) != len(times):
            return []
        
        # Keepa 时间戳是 Unix 时间戳（分钟）
        # 价格需要除以 100（以分为单位存储）
        history = []
        for i, (price, time_minutes) in enumerate(zip(prices, times)):
            if price is not None and time_minutes is not None:
                # 转换为 datetime
                timestamp = datetime.fromtimestamp(time_minutes * 60)
                # 价格从分转换为元
                price_value = price / 100.0 if price > 0 else None
                if price_value:
                    history.append((timestamp, price_value))
        
        return history
    
    def get_sales_rank_history(self, keepa_data: Dict[str, Any]) -> List[Tuple[datetime, int]]:
        """
        获取销售排名历史
        
        Args:
            keepa_data: Keepa API 返回的产品数据
            
        Returns:
            销售排名历史列表 [(timestamp, rank), ...]
        """
        data = keepa_data.get('data', {})
        ranks = data.get('SALES', [])
        times = data.get('SALES_time', [])
        
        if not ranks or not times or len(ranks) != len(times):
            return []
        
        history = []
        for rank, time_minutes in zip(ranks, times):
            if rank is not None and time_minutes is not None:
                timestamp = datetime.fromtimestamp(time_minutes * 60)
                history.append((timestamp, rank))
        
        return history
    
    def get_rating_history(self, keepa_data: Dict[str, Any]) -> List[Tuple[datetime, float, int]]:
        """
        获取评分和评论数量历史
        
        Args:
            keepa_data: Keepa API 返回的产品数据
            
        Returns:
            评分历史列表 [(timestamp, rating, review_count), ...]
        """
        data = keepa_data.get('data', {})
        ratings = data.get('RATING', [])
        review_counts = data.get('COUNT', [])
        times = data.get('RATING_time', [])
        
        if not ratings or not times:
            return []
        
        history = []
        for i, time_minutes in enumerate(times):
            if time_minutes is not None:
                timestamp = datetime.fromtimestamp(time_minutes * 60)
                rating = ratings[i] / 10.0 if i < len(ratings) and ratings[i] is not None else None
                review_count = review_counts[i] if i < len(review_counts) and review_counts[i] is not None else None
                if rating is not None:
                    history.append((timestamp, rating, review_count or 0))
        
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
