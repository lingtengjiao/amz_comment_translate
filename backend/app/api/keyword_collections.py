"""
关键词产品库 API (Keyword Collections API)

用于管理用户保存的搜索结果快照（产品分析库）
"""
import logging
from typing import Optional, List
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.user import User
from app.models.keyword_collection import KeywordCollection
from app.models.collection_product import CollectionProduct
from app.services.auth_service import get_current_user_required

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/keyword-collections", tags=["Keyword Collections"])


# ==========================================
# 请求/响应模型
# ==========================================

class ProductItem(BaseModel):
    """产品项（用于创建请求）"""
    asin: str = Field(..., min_length=1, max_length=20)  # ASIN 通常是 10 位，但也可能有变体
    title: Optional[str] = None
    image_url: str = Field(..., min_length=1)
    product_url: str = Field(..., min_length=1)
    price: Optional[float] = None  # 前端传递的是数字
    rating: Optional[float] = None
    review_count: Optional[int] = None
    sales_volume: Optional[int] = None
    sales_volume_text: Optional[str] = None
    is_sponsored: bool = False
    position: Optional[int] = None


class CreateCollectionRequest(BaseModel):
    """创建产品库请求"""
    keyword: str = Field(..., min_length=1, max_length=500)
    marketplace: str = Field(default="US", max_length=20)
    products: List[ProductItem] = Field(..., min_items=1)
    description: Optional[str] = None


class ProductItemResponse(BaseModel):
    """产品项响应"""
    id: str
    asin: str
    title: Optional[str]
    image_url: str
    product_url: str
    price: Optional[str]
    rating: Optional[float]
    review_count: Optional[int]
    sales_volume: Optional[int]  # 初步估算销售量
    sales_volume_manual: Optional[int]  # 补充数据的销售量
    sales_volume_text: Optional[str]
    is_sponsored: bool
    position: Optional[int]  # 页面位置（不是排名）
    major_category_rank: Optional[int]  # 大类排名
    minor_category_rank: Optional[int]  # 小类排名
    major_category_name: Optional[str]  # 大类名称
    minor_category_name: Optional[str]  # 小类名称
    year: Optional[int]
    listing_date: Optional[str] = None  # 上架具体日期 YYYY-MM-DD，有值时视图仍按年分组
    brand: Optional[str]
    monthly_sales: Optional[dict] = {}  # 月度销量数据
    custom_tags: Optional[dict] = {}  # 自定义标签数据
    created_at: Optional[str]


class UpdateProductRequest(BaseModel):
    """更新产品请求"""
    asin: Optional[str] = None
    title: Optional[str] = None
    image_url: Optional[str] = None
    product_url: Optional[str] = None
    price: Optional[str] = None  # 字符串格式，如 "$29.99"
    rating: Optional[float] = None
    review_count: Optional[int] = None
    sales_volume: Optional[int] = None  # 初步估算销售量
    sales_volume_manual: Optional[int] = None  # 补充数据的销售量
    sales_volume_text: Optional[str] = None
    is_sponsored: Optional[bool] = None
    position: Optional[int] = None  # 页面位置（不是排名）
    major_category_rank: Optional[int] = None  # 大类排名
    minor_category_rank: Optional[int] = None  # 小类排名
    major_category_name: Optional[str] = None  # 大类名称
    minor_category_name: Optional[str] = None  # 小类名称
    year: Optional[int] = None
    listing_date: Optional[str] = None  # 上架具体日期 YYYY-MM-DD
    brand: Optional[str] = None
    monthly_sales: Optional[dict] = None  # 月度销量数据
    custom_tags: Optional[dict] = None  # 自定义标签数据


class BatchUpdateProductRequest(BaseModel):
    """批量更新产品请求（通过 CSV/Excel 导入）"""
    products: List[dict] = Field(..., description="产品更新列表，每项包含 asin 和要更新的字段")


class CollectionResponse(BaseModel):
    """产品库响应"""
    id: str
    keyword: str
    marketplace: str
    product_count: int
    description: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


class CollectionDetailResponse(BaseModel):
    """产品库详情响应（含产品列表）"""
    id: str
    keyword: str
    marketplace: str
    product_count: int
    description: Optional[str]
    board_config: Optional[dict] = None
    view_config: Optional[dict] = None  # 视图配置
    custom_fields: Optional[List[dict]] = []  # 自定义字段定义
    created_at: Optional[str]
    updated_at: Optional[str]
    products: List[ProductItemResponse]


class CollectionListResponse(BaseModel):
    """产品库列表响应"""
    total: int
    collections: List[CollectionResponse]


class GroupedCollectionResponse(BaseModel):
    """按关键词分组的产品库响应"""
    keyword: str
    marketplace: Optional[str]
    total_snapshots: int
    total_products: int
    first_snapshot: Optional[str]
    latest_snapshot: Optional[str]
    snapshots: List[CollectionResponse]


class GroupedCollectionListResponse(BaseModel):
    """按关键词分组的产品库列表响应"""
    total_keywords: int
    total_collections: int
    groups: List[GroupedCollectionResponse]


# ==========================================
# 接口
# ==========================================

@router.post("", response_model=CollectionResponse)
async def create_collection(
    request: CreateCollectionRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    创建产品库（保存搜索结果快照）
    
    每次保存都是一个独立的快照，同一关键词可以多次保存。
    """
    # 创建产品库
    collection = KeywordCollection(
        user_id=user.id,
        keyword=request.keyword.strip(),
        marketplace=request.marketplace.upper(),
        product_count=len(request.products),
        description=request.description
    )
    
    db.add(collection)
    await db.flush()  # 获取 ID
    
    # 创建产品明细
    for idx, product in enumerate(request.products):
        # 将 price 从数字转换为字符串（数据库存储格式）
        price_str = f"${product.price:.2f}" if product.price is not None else None
        
        # 截断过长的字段，防止数据库错误
        title = product.title[:500] if product.title and len(product.title) > 500 else product.title
        sales_volume_text = product.sales_volume_text[:200] if product.sales_volume_text and len(product.sales_volume_text) > 200 else product.sales_volume_text
        
        collection_product = CollectionProduct(
            collection_id=collection.id,
            asin=product.asin,
            title=title,
            image_url=product.image_url,
            product_url=product.product_url,
            price=price_str,
            rating=product.rating,
            review_count=product.review_count,
            sales_volume=product.sales_volume,
            sales_volume_text=sales_volume_text,
            is_sponsored=product.is_sponsored,
            position=product.position if product.position is not None else idx + 1
        )
        db.add(collection_product)
    
    try:
        await db.commit()
        await db.refresh(collection)
    except ProgrammingError as e:
        await db.rollback()
        err_msg = str(e.orig) if getattr(e, "orig", None) else str(e)
        if "listing_date" in err_msg or "column" in err_msg.lower():
            logger.warning(f"创建产品库失败（疑似未执行迁移）: {err_msg}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="数据库结构需要更新，请先执行迁移脚本: db/migrate_listing_date.sql"
            )
        raise

    logger.info(f"用户 {user.email} 创建产品库: keyword={request.keyword}, products={len(request.products)}")
    
    return CollectionResponse(
        id=str(collection.id),
        keyword=collection.keyword,
        marketplace=collection.marketplace,
        product_count=collection.product_count,
        description=collection.description,
        created_at=collection.created_at.isoformat() if collection.created_at else None,
        updated_at=collection.updated_at.isoformat() if collection.updated_at else None
    )


@router.get("", response_model=CollectionListResponse)
async def get_my_collections(
    keyword: Optional[str] = Query(None, description="按关键词筛选"),
    marketplace: Optional[str] = Query(None, description="按站点筛选"),
    limit: int = Query(50, ge=1, le=200, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的产品库列表
    """
    # 构建查询
    query = select(KeywordCollection).where(
        KeywordCollection.user_id == user.id
    )
    
    if keyword:
        query = query.where(KeywordCollection.keyword.ilike(f"%{keyword}%"))
    
    if marketplace:
        query = query.where(KeywordCollection.marketplace == marketplace.upper())
    
    # 计算总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 获取分页数据
    query = query.order_by(KeywordCollection.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    collections = result.scalars().all()
    
    return CollectionListResponse(
        total=total,
        collections=[
            CollectionResponse(
                id=str(c.id),
                keyword=c.keyword,
                marketplace=c.marketplace,
                product_count=c.product_count,
                description=c.description,
                created_at=c.created_at.isoformat() if c.created_at else None,
                updated_at=c.updated_at.isoformat() if c.updated_at else None
            )
            for c in collections
        ]
    )


@router.get("/grouped", response_model=GroupedCollectionListResponse)
async def get_collections_grouped_by_keyword(
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    按关键词分组获取产品库列表
    
    用于前端展示时，将同一关键词的多个快照归为一组。
    """
    # 获取所有产品库
    query = select(KeywordCollection).where(
        KeywordCollection.user_id == user.id
    ).order_by(KeywordCollection.keyword, KeywordCollection.created_at.desc())
    
    result = await db.execute(query)
    collections = result.scalars().all()
    
    # 按关键词分组
    groups_dict = {}
    for c in collections:
        key = (c.keyword, c.marketplace)
        if key not in groups_dict:
            groups_dict[key] = {
                "keyword": c.keyword,
                "marketplace": c.marketplace,
                "snapshots": [],
                "total_products": 0,
                "first_snapshot": None,
                "latest_snapshot": None,
            }
        
        snapshot_time = c.created_at.isoformat() if c.created_at else None
        
        # 更新时间范围
        if snapshot_time:
            if groups_dict[key]["first_snapshot"] is None or snapshot_time < groups_dict[key]["first_snapshot"]:
                groups_dict[key]["first_snapshot"] = snapshot_time
            if groups_dict[key]["latest_snapshot"] is None or snapshot_time > groups_dict[key]["latest_snapshot"]:
                groups_dict[key]["latest_snapshot"] = snapshot_time
        
        # 累计产品数量
        groups_dict[key]["total_products"] += c.product_count
        
        groups_dict[key]["snapshots"].append(
            CollectionResponse(
                id=str(c.id),
                keyword=c.keyword,
                marketplace=c.marketplace,
                product_count=c.product_count,
                description=c.description,
                created_at=snapshot_time,
                updated_at=c.updated_at.isoformat() if c.updated_at else None
            )
        )
    
    groups = [
        GroupedCollectionResponse(
            keyword=g["keyword"],
            marketplace=g["marketplace"],
            total_snapshots=len(g["snapshots"]),
            total_products=g["total_products"],
            first_snapshot=g["first_snapshot"],
            latest_snapshot=g["latest_snapshot"],
            snapshots=g["snapshots"]
        )
        for g in groups_dict.values()
    ]
    
    # 按最新快照时间排序
    groups.sort(key=lambda g: g.latest_snapshot or "", reverse=True)
    
    return GroupedCollectionListResponse(
        total_keywords=len(groups),
        total_collections=len(collections),
        groups=groups
    )


@router.get("/{collection_id}", response_model=CollectionDetailResponse)
async def get_collection_detail(
    collection_id: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取产品库详情（含产品列表）
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    ).options(selectinload(KeywordCollection.products))
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 按位置排序
    products = sorted(collection.products, key=lambda p: p.position or 999)
    
    return CollectionDetailResponse(
        id=str(collection.id),
        keyword=collection.keyword,
        marketplace=collection.marketplace,
        product_count=collection.product_count,
        description=collection.description,
        board_config=collection.board_config,
        view_config=collection.view_config,
        custom_fields=collection.custom_fields or [],
        created_at=collection.created_at.isoformat() if collection.created_at else None,
        updated_at=collection.updated_at.isoformat() if collection.updated_at else None,
        products=[
            ProductItemResponse(
                id=str(p.id),
                asin=p.asin,
                title=p.title,
                image_url=p.image_url,
                product_url=p.product_url,
                price=p.price,
                rating=float(p.rating) if p.rating else None,
                review_count=p.review_count,
                sales_volume=p.sales_volume,
                sales_volume_manual=p.sales_volume_manual,
                sales_volume_text=p.sales_volume_text,
                is_sponsored=p.is_sponsored,
                position=p.position,
                major_category_rank=p.major_category_rank,
                minor_category_rank=p.minor_category_rank,
                major_category_name=p.major_category_name,
                minor_category_name=p.minor_category_name,
                year=p.year if p.year is not None else (p.listing_date.year if p.listing_date else None),
                listing_date=p.listing_date.isoformat() if p.listing_date else None,
                brand=p.brand,
                monthly_sales=p.monthly_sales or {},
                custom_tags=p.custom_tags or {},
                created_at=p.created_at.isoformat() if p.created_at else None
            )
            for p in products
        ]
    )


@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除产品库
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    keyword = collection.keyword
    await db.delete(collection)
    await db.commit()
    
    logger.info(f"用户 {user.email} 删除产品库: id={collection_id}, keyword={keyword}")
    
    return {
        "success": True,
        "message": f"产品库 '{keyword}' 已删除"
    }


@router.put("/{collection_id}")
async def update_collection(
    collection_id: str,
    description: Optional[str] = None,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新产品库信息（目前只支持更新描述）
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    if description is not None:
        collection.description = description
    
    await db.commit()
    
    return {
        "success": True,
        "message": "产品库信息已更新"
    }


# ==========================================
# 画板配置接口
# ==========================================

class BoardConfigRequest(BaseModel):
    """画板配置请求"""
    boards: List[dict] = Field(..., description="画板列表，每项包含 id 和 name")
    productBoards: dict = Field(..., description="产品画板映射，key 为产品 ID，value 为画板 ID")


class ViewConfigRequest(BaseModel):
    """视图配置请求"""
    viewMode: Optional[str] = Field(default="custom", description="当前视图模式：custom, price, sales, year, brand, ranking")
    colorRules: Optional[List[dict]] = Field(default=[], description="颜色规则列表")
    yearRanges: Optional[List[dict]] = Field(default=[], description="年份区间配置列表")
    rankingRanges: Optional[List[dict]] = Field(default=[], description="排名区间配置列表")
    rankingMetric: Optional[str] = Field(default="major", description="排名指标：major（大类BSR）或 minor（小类BSR）")
    priceRanges: Optional[List[dict]] = Field(default=[], description="价格区间配置列表")
    salesRanges: Optional[List[dict]] = Field(default=[], description="销量区间配置列表")
    brandRanges: Optional[List[dict]] = Field(default=[], description="品牌区间配置列表")


@router.put("/{collection_id}/board-config")
async def save_board_config(
    collection_id: str,
    request: BoardConfigRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    保存画板配置
    
    用于持久化保存用户自定义的画板和产品分配
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 保存画板配置（只包含画板列表和产品映射）
    collection.board_config = {
        "boards": request.boards,
        "productBoards": request.productBoards
    }
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 保存画板配置: collection={collection_id}, boards={len(request.boards)}")
    
    return {
        "success": True,
        "message": "画板配置已保存",
        "board_count": len(request.boards)
    }


@router.put("/{collection_id}/view-config")
async def save_view_config(
    collection_id: str,
    request: ViewConfigRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    保存视图配置
    
    用于持久化保存视图相关的配置（颜色规则、年份区间、排名区间等）
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 保存视图配置
    collection.view_config = {
        "viewMode": request.viewMode or "custom",
        "colorRules": request.colorRules or [],
        "yearRanges": request.yearRanges or [],
        "rankingRanges": request.rankingRanges or [],
        "rankingMetric": request.rankingMetric or "major",
        "priceRanges": request.priceRanges or [],
        "salesRanges": request.salesRanges or [],
        "brandRanges": request.brandRanges or []
    }
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 保存视图配置: collection={collection_id}")
    
    return {
        "success": True,
        "message": "视图配置已保存"
    }


# ==========================================
# 产品管理接口（用于产品画板功能）
# ==========================================

@router.put("/{collection_id}/products/{product_id}")
async def update_product(
    collection_id: str,
    product_id: str,
    request: UpdateProductRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新单个产品信息
    
    用于产品画板中编辑产品数据
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 查找产品
    product_query = select(CollectionProduct).where(
        and_(
            CollectionProduct.id == product_id,
            CollectionProduct.collection_id == collection_id
        )
    )
    product_result = await db.execute(product_query)
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    # 更新字段
    update_data = request.model_dump(exclude_unset=True)
    if "listing_date" in update_data:
        ld = update_data.pop("listing_date")
        if ld:
            try:
                product.listing_date = date.fromisoformat(ld)
                product.year = product.listing_date.year
            except (ValueError, TypeError):
                pass
        else:
            product.listing_date = None
    for field, value in update_data.items():
        if hasattr(product, field):
            setattr(product, field, value)
    
    await db.commit()
    await db.refresh(product)
    
    logger.info(f"用户 {user.email} 更新产品: id={product_id}, asin={product.asin}")
    
    return ProductItemResponse(
        id=str(product.id),
        asin=product.asin,
        title=product.title,
        image_url=product.image_url,
        product_url=product.product_url,
        price=product.price,
        rating=float(product.rating) if product.rating else None,
        review_count=product.review_count,
        sales_volume=product.sales_volume,
        sales_volume_manual=product.sales_volume_manual,
        sales_volume_text=product.sales_volume_text,
        is_sponsored=product.is_sponsored,
        position=product.position,
        major_category_rank=product.major_category_rank,
        minor_category_rank=product.minor_category_rank,
        major_category_name=product.major_category_name,
        minor_category_name=product.minor_category_name,
        year=product.year if product.year is not None else (product.listing_date.year if product.listing_date else None),
        listing_date=product.listing_date.isoformat() if product.listing_date else None,
        brand=product.brand,
        monthly_sales=product.monthly_sales or {},
        custom_tags=product.custom_tags or {},
        created_at=product.created_at.isoformat() if product.created_at else None
    )


@router.delete("/{collection_id}/products/{product_id}")
async def delete_product(
    collection_id: str,
    product_id: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除单个产品
    
    用于产品画板中删除产品
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 查找产品
    product_query = select(CollectionProduct).where(
        and_(
            CollectionProduct.id == product_id,
            CollectionProduct.collection_id == collection_id
        )
    )
    product_result = await db.execute(product_query)
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    asin = product.asin
    await db.delete(product)
    
    # 更新产品数量
    collection.product_count = max(0, collection.product_count - 1)
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 删除产品: id={product_id}, asin={asin}")
    
    return {
        "success": True,
        "message": f"产品 {asin} 已删除"
    }


@router.post("/{collection_id}/products/batch-update")
async def batch_update_products(
    collection_id: str,
    request: BatchUpdateProductRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    批量更新产品数据（通过 CSV/Excel 导入）
    
    根据 ASIN 匹配产品并更新指定字段（year, brand, sales_volume 等）
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    ).options(selectinload(KeywordCollection.products))
    
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 构建 ASIN -> 产品 的映射
    asin_to_product = {p.asin: p for p in collection.products}
    
    updated_count = 0
    not_found_asins = []
    
    for item in request.products:
        asin = item.get("asin")
        if not asin:
            continue
        
        product = asin_to_product.get(asin)
        if not product:
            not_found_asins.append(asin)
            continue
        
        # 更新允许的字段（包含新增的排名和分类字段）
        allowed_fields = [
            "year", "brand", "sales_volume", "sales_volume_manual", 
            "price", "rating", "review_count",
            "major_category_rank", "minor_category_rank",
            "major_category_name", "minor_category_name"
        ]
        for field in allowed_fields:
            if field in item and item[field] is not None:
                setattr(product, field, item[field])
        
        # 处理上架具体日期（存 listing_date，并同步 year 便于按年分组）
        if "listing_date" in item:
            ld = item["listing_date"]
            if ld:
                try:
                    if isinstance(ld, str):
                        product.listing_date = date.fromisoformat(ld)
                    else:
                        product.listing_date = ld
                    product.year = product.listing_date.year
                except (ValueError, TypeError):
                    pass
            else:
                product.listing_date = None
        
        # 处理月度销量数据（合并更新）
        if "monthly_sales" in item and item["monthly_sales"]:
            base_sales = dict(product.monthly_sales or {})
            base_sales.update(item["monthly_sales"])
            product.monthly_sales = base_sales
        
        # 处理自定义标签数据（合并更新，赋新 dict 以便 SQLAlchemy 检测 JSONB 变更）
        if "custom_tags" in item and item["custom_tags"]:
            base_tags = dict(product.custom_tags or {})
            base_tags.update(item["custom_tags"])
            product.custom_tags = base_tags
        
        updated_count += 1
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 批量更新产品: collection={collection_id}, updated={updated_count}")
    
    return {
        "success": True,
        "message": f"成功更新 {updated_count} 个产品",
        "updated_count": updated_count,
        "not_found_count": len(not_found_asins),
        "not_found_asins": not_found_asins[:10]  # 只返回前 10 个未找到的 ASIN
    }


# ==========================================
# 自定义字段管理接口
# ==========================================

class CustomFieldDefinition(BaseModel):
    """自定义字段定义"""
    id: str = Field(..., description="字段唯一标识")
    name: str = Field(..., description="字段显示名称")
    type: str = Field(..., description="字段类型：text, number, select")
    options: Optional[List[str]] = Field(default=[], description="下拉选项（仅 select 类型）")


class CustomFieldsRequest(BaseModel):
    """自定义字段配置请求"""
    custom_fields: List[CustomFieldDefinition] = Field(..., description="自定义字段定义列表")


@router.put("/{collection_id}/custom-fields")
async def save_custom_fields(
    collection_id: str,
    request: CustomFieldsRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    保存自定义字段定义
    
    用于管理产品库的自定义字段（列）定义
    """
    # 查找产品库
    query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 保存自定义字段定义
    collection.custom_fields = [f.model_dump() for f in request.custom_fields]
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 保存自定义字段: collection={collection_id}, fields={len(request.custom_fields)}")
    
    return {
        "success": True,
        "message": f"成功保存 {len(request.custom_fields)} 个自定义字段",
        "custom_fields": collection.custom_fields
    }


class UpdateProductTagsRequest(BaseModel):
    """更新产品标签请求"""
    custom_tags: dict = Field(..., description="自定义标签数据")


@router.put("/{collection_id}/products/{product_id}/tags")
async def update_product_tags(
    collection_id: str,
    product_id: str,
    request: UpdateProductTagsRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新单个产品的自定义标签
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 查找产品
    product_query = select(CollectionProduct).where(
        and_(
            CollectionProduct.id == product_id,
            CollectionProduct.collection_id == collection_id
        )
    )
    product_result = await db.execute(product_query)
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    # 合并更新标签（赋新 dict 以便 SQLAlchemy 检测 JSONB 变更）
    base = dict(product.custom_tags or {})
    base.update(request.custom_tags)
    product.custom_tags = base
    
    await db.commit()
    await db.refresh(product)
    
    return {
        "success": True,
        "custom_tags": product.custom_tags
    }


class UpdateProductMonthlySalesRequest(BaseModel):
    """更新产品月度销量请求"""
    monthly_sales: dict = Field(..., description="月度销量数据")


@router.put("/{collection_id}/products/{product_id}/monthly-sales")
async def update_product_monthly_sales(
    collection_id: str,
    product_id: str,
    request: UpdateProductMonthlySalesRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新单个产品的月度销量数据
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    )
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 查找产品
    product_query = select(CollectionProduct).where(
        and_(
            CollectionProduct.id == product_id,
            CollectionProduct.collection_id == collection_id
        )
    )
    product_result = await db.execute(product_query)
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    # 合并更新月度销量
    existing_sales = product.monthly_sales or {}
    existing_sales.update(request.monthly_sales)
    product.monthly_sales = existing_sales
    
    await db.commit()
    await db.refresh(product)
    
    return {
        "success": True,
        "monthly_sales": product.monthly_sales
    }


class BatchUpdateTagsRequest(BaseModel):
    """批量更新标签请求"""
    updates: List[dict] = Field(..., description="更新列表，每项包含 product_id 和 custom_tags")


@router.post("/{collection_id}/products/batch-update-tags")
async def batch_update_product_tags(
    collection_id: str,
    request: BatchUpdateTagsRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    批量更新产品标签
    
    用于表格视图中批量编辑标签
    """
    # 验证产品库归属
    collection_query = select(KeywordCollection).where(
        and_(
            KeywordCollection.id == collection_id,
            KeywordCollection.user_id == user.id
        )
    ).options(selectinload(KeywordCollection.products))
    
    collection_result = await db.execute(collection_query)
    collection = collection_result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品库不存在或无权访问"
        )
    
    # 构建 ID -> 产品 的映射
    id_to_product = {str(p.id): p for p in collection.products}
    
    updated_count = 0
    
    for item in request.updates:
        product_id = item.get("product_id")
        custom_tags = item.get("custom_tags", {})
        
        if not product_id:
            continue
        
        product = id_to_product.get(product_id)
        if not product:
            continue
        
        # 合并更新标签（赋新 dict 以便 SQLAlchemy 检测 JSONB 变更）
        base = dict(product.custom_tags or {})
        base.update(custom_tags)
        product.custom_tags = base
        
        updated_count += 1
    
    await db.commit()
    
    logger.info(f"用户 {user.email} 批量更新标签: collection={collection_id}, updated={updated_count}")
    
    return {
        "success": True,
        "message": f"成功更新 {updated_count} 个产品的标签",
        "updated_count": updated_count
    }
