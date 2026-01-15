"""
Keepa API Router - Endpoints for fetching and managing product time series data
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.product import Product
from app.services.keepa_service import KeepaService, KeepaDataService
from app.services.auth_service import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/keepa", tags=["Keepa"])


@router.post("/products/{asin}/sync")
async def sync_product_time_series(
    asin: str,
    domain: str = Query("US", description="Amazon marketplace domain"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    同步产品的 Keepa 时序数据
    
    从 Keepa API 获取产品的最新时序数据并存储到数据库
    """
    try:
        # 查找产品
        stmt = select(Product).where(Product.asin == asin)
        result = await db.execute(stmt)
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product with ASIN {asin} not found"
            )
        
        # 查询 Keepa API
        keepa_service = KeepaService()
        keepa_data = keepa_service.query_product(asin, domain)
        
        if not keepa_data:
            raise HTTPException(
                status_code=404,
                detail=f"No Keepa data found for ASIN {asin}"
            )
        
        # 保存到数据库
        data_service = KeepaDataService(db)
        time_series = await data_service.update_time_series(
            product.id,
            keepa_data
        )
        
        return {
            "success": True,
            "product_id": str(product.id),
            "asin": asin,
            "last_updated": time_series.last_updated.isoformat()
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error syncing Keepa data for ASIN {asin}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/products/{asin}/time-series")
async def get_product_time_series(
    asin: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取产品的时序数据
    
    返回价格历史、销售排名历史、评分历史等
    """
    # 查找产品
    stmt = select(Product).where(Product.asin == asin)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=404,
            detail=f"Product with ASIN {asin} not found"
        )
    
    # 获取时序数据
    data_service = KeepaDataService(db)
    time_series = await data_service.get_time_series(product.id)
    
    if not time_series or not time_series.keepa_data:
        raise HTTPException(
            status_code=404,
            detail=f"No time series data found for ASIN {asin}. Please sync first."
        )
    
    # 解析数据
    keepa_service = KeepaService()
    keepa_data = time_series.keepa_data
    
    price_history_new = keepa_service.get_price_history(keepa_data, "NEW")
    price_history_used = keepa_service.get_price_history(keepa_data, "USED")
    sales_rank_history = keepa_service.get_sales_rank_history(keepa_data)
    rating_history = keepa_service.get_rating_history(keepa_data)
    
    return {
        "asin": asin,
        "product_id": str(product.id),
        "last_updated": time_series.last_updated.isoformat(),
        "price_history": {
            "new": [{"timestamp": ts.isoformat(), "price": price} for ts, price in price_history_new],
            "used": [{"timestamp": ts.isoformat(), "price": price} for ts, price in price_history_used]
        },
        "sales_rank_history": [
            {"timestamp": ts.isoformat(), "rank": rank}
            for ts, rank in sales_rank_history
        ],
        "rating_history": [
            {
                "timestamp": ts.isoformat(),
                "rating": rating,
                "review_count": count
            }
            for ts, rating, count in rating_history
        ]
    }
