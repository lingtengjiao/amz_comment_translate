"""
毛利计算 API (Profit Calculator API)

提供产品毛利计算、产品管理、规则管理等接口
"""
import logging
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_current_user_required
from app.services.profit_calculator_service import (
    ProfitCalculatorService,
    ProductInput
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profit", tags=["Profit Calculator"])


# ==========================================
# 请求/响应模型
# ==========================================

class ProductCalculateRequest(BaseModel):
    """计算请求"""
    name: str = Field(..., description="产品名称")
    length_cm: float = Field(..., gt=0, description="长度（厘米）")
    width_cm: float = Field(..., gt=0, description="宽度（厘米）")
    height_cm: float = Field(..., gt=0, description="高度（厘米）")
    weight_g: float = Field(..., gt=0, description="重量（克）")
    selling_price_usd: float = Field(..., gt=0, description="预期售价（美元）")
    total_cost_cny: float = Field(..., gt=0, description="总成本（人民币）")
    category: Optional[str] = Field(None, description="产品类目")


class ProductCreateRequest(BaseModel):
    """创建产品请求"""
    name: str = Field(..., description="产品名称")
    length_cm: float = Field(..., gt=0, description="长度（厘米）")
    width_cm: float = Field(..., gt=0, description="宽度（厘米）")
    height_cm: float = Field(..., gt=0, description="高度（厘米）")
    weight_g: float = Field(..., gt=0, description="重量（克）")
    selling_price_usd: float = Field(..., gt=0, description="预期售价（美元）")
    total_cost_cny: float = Field(..., gt=0, description="总成本（人民币）")
    category: Optional[str] = Field(None, description="产品类目")
    notes: Optional[str] = Field(None, description="备注")


class ProductUpdateRequest(BaseModel):
    """更新产品请求"""
    name: Optional[str] = None
    length_cm: Optional[float] = Field(None, gt=0)
    width_cm: Optional[float] = Field(None, gt=0)
    height_cm: Optional[float] = Field(None, gt=0)
    weight_g: Optional[float] = Field(None, gt=0)
    selling_price_usd: Optional[float] = Field(None, gt=0)
    total_cost_cny: Optional[float] = Field(None, gt=0)
    category: Optional[str] = None
    notes: Optional[str] = None


class ExchangeRateUpdateRequest(BaseModel):
    """汇率更新请求"""
    rate: float = Field(..., gt=0, description="汇率")


class ShippingRuleUpdateRequest(BaseModel):
    """运费规则更新请求"""
    shipping_type: str = Field(..., description="运输方式：sea_standard, sea_express, air")
    rate_per_unit: float = Field(..., gt=0, description="单位费率")
    unit_type: Optional[str] = Field(None, description="计费单位：cbm, kg")
    description: Optional[str] = Field(None, description="描述")


class OtherCostRuleUpdateRequest(BaseModel):
    """其他费用规则更新请求"""
    rule_name: str = Field(..., description="规则名称：tariff, handling_fee")
    value: float = Field(..., ge=0, description="值")
    rule_type: Optional[str] = Field(None, description="规则类型：percentage, fixed")
    base_field: Optional[str] = Field(None, description="基准字段")
    description: Optional[str] = Field(None, description="描述")


class BatchCalculateRequest(BaseModel):
    """批量计算请求"""
    products: List[ProductCalculateRequest]


# ==========================================
# 计算接口
# ==========================================

@router.post("/calculate")
async def calculate_profit(
    request: ProductCalculateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    计算单个产品的毛利
    
    即时计算，不保存产品
    """
    service = ProfitCalculatorService(db)
    
    product_input = ProductInput(
        name=request.name,
        length_cm=request.length_cm,
        width_cm=request.width_cm,
        height_cm=request.height_cm,
        weight_g=request.weight_g,
        selling_price_usd=request.selling_price_usd,
        total_cost_cny=request.total_cost_cny,
        category=request.category
    )
    
    result = await service.calculate_profit(product_input, user.id)
    
    return {
        "success": True,
        "data": result.to_dict()
    }


@router.post("/calculate/batch")
async def calculate_profit_batch(
    request: BatchCalculateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    批量计算多个产品的毛利
    """
    service = ProfitCalculatorService(db)
    
    results = []
    for item in request.products:
        product_input = ProductInput(
            name=item.name,
            length_cm=item.length_cm,
            width_cm=item.width_cm,
            height_cm=item.height_cm,
            weight_g=item.weight_g,
            selling_price_usd=item.selling_price_usd,
            total_cost_cny=item.total_cost_cny,
            category=item.category
        )
        result = await service.calculate_profit(product_input, user.id)
        results.append(result.to_dict())
    
    return {
        "success": True,
        "data": results
    }


# ==========================================
# 产品 CRUD 接口
# ==========================================

@router.get("/products")
async def list_products(
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户的所有产品列表
    """
    service = ProfitCalculatorService(db)
    products = await service.get_products(user.id)
    
    # 为每个产品计算毛利
    results = []
    for product in products:
        product_input = ProductInput(
            name=product.name,
            length_cm=float(product.length_cm),
            width_cm=float(product.width_cm),
            height_cm=float(product.height_cm),
            weight_g=float(product.weight_g),
            selling_price_usd=float(product.selling_price_usd),
            total_cost_cny=float(product.total_cost_cny),
            category=product.category
        )
        calculation = await service.calculate_profit(product_input, user.id)
        
        results.append({
            **product.to_dict(),
            "calculation": calculation.to_dict()
        })
    
    return {
        "success": True,
        "data": results
    }


@router.post("/products")
async def create_product(
    request: ProductCreateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    创建新产品
    """
    service = ProfitCalculatorService(db)
    
    product = await service.create_product(
        user_id=user.id,
        data=request.model_dump()
    )
    
    # 计算毛利
    product_input = ProductInput(
        name=product.name,
        length_cm=float(product.length_cm),
        width_cm=float(product.width_cm),
        height_cm=float(product.height_cm),
        weight_g=float(product.weight_g),
        selling_price_usd=float(product.selling_price_usd),
        total_cost_cny=float(product.total_cost_cny),
        category=product.category
    )
    calculation = await service.calculate_profit(product_input, user.id)
    
    return {
        "success": True,
        "data": {
            **product.to_dict(),
            "calculation": calculation.to_dict()
        }
    }


@router.get("/products/{product_id}")
async def get_product(
    product_id: uuid.UUID,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个产品详情
    """
    service = ProfitCalculatorService(db)
    product = await service.get_product(product_id, user.id)
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    # 计算毛利
    product_input = ProductInput(
        name=product.name,
        length_cm=float(product.length_cm),
        width_cm=float(product.width_cm),
        height_cm=float(product.height_cm),
        weight_g=float(product.weight_g),
        selling_price_usd=float(product.selling_price_usd),
        total_cost_cny=float(product.total_cost_cny),
        category=product.category
    )
    calculation = await service.calculate_profit(product_input, user.id)
    
    return {
        "success": True,
        "data": {
            **product.to_dict(),
            "calculation": calculation.to_dict()
        }
    }


@router.put("/products/{product_id}")
async def update_product(
    product_id: uuid.UUID,
    request: ProductUpdateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新产品
    """
    service = ProfitCalculatorService(db)
    
    product = await service.update_product(
        product_id=product_id,
        user_id=user.id,
        data=request.model_dump(exclude_unset=True)
    )
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    # 计算毛利
    product_input = ProductInput(
        name=product.name,
        length_cm=float(product.length_cm),
        width_cm=float(product.width_cm),
        height_cm=float(product.height_cm),
        weight_g=float(product.weight_g),
        selling_price_usd=float(product.selling_price_usd),
        total_cost_cny=float(product.total_cost_cny),
        category=product.category
    )
    calculation = await service.calculate_profit(product_input, user.id)
    
    return {
        "success": True,
        "data": {
            **product.to_dict(),
            "calculation": calculation.to_dict()
        }
    }


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: uuid.UUID,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除产品
    """
    service = ProfitCalculatorService(db)
    
    success = await service.delete_product(product_id, user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="产品不存在"
        )
    
    return {
        "success": True,
        "message": "产品已删除"
    }


# ==========================================
# 规则管理接口
# ==========================================

@router.get("/rules")
async def get_rules(
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有规则配置
    
    返回用户自定义规则和系统默认规则
    """
    service = ProfitCalculatorService(db)
    rules = await service.get_all_rules(user.id)
    
    return {
        "success": True,
        "data": rules
    }


@router.put("/rules/exchange-rate")
async def update_exchange_rate(
    request: ExchangeRateUpdateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新汇率
    """
    service = ProfitCalculatorService(db)
    rate = await service.update_exchange_rate(user.id, request.rate)
    
    return {
        "success": True,
        "data": rate.to_dict()
    }


@router.put("/rules/shipping")
async def update_shipping_rule(
    request: ShippingRuleUpdateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新运费规则
    """
    if request.shipping_type not in ['sea_standard', 'sea_express', 'air']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的运输方式，请使用 sea_standard, sea_express 或 air"
        )
    
    service = ProfitCalculatorService(db)
    rule = await service.update_shipping_rule(
        user_id=user.id,
        shipping_type=request.shipping_type,
        rate_per_unit=request.rate_per_unit,
        unit_type=request.unit_type,
        description=request.description
    )
    
    return {
        "success": True,
        "data": rule.to_dict()
    }


@router.put("/rules/other-cost")
async def update_other_cost_rule(
    request: OtherCostRuleUpdateRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新其他费用规则
    """
    service = ProfitCalculatorService(db)
    rule = await service.update_other_cost_rule(
        user_id=user.id,
        rule_name=request.rule_name,
        value=request.value,
        rule_type=request.rule_type,
        base_field=request.base_field,
        description=request.description
    )
    
    return {
        "success": True,
        "data": rule.to_dict()
    }


# ==========================================
# 辅助接口
# ==========================================

@router.get("/categories")
async def get_categories(
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取可用的产品类目列表
    """
    service = ProfitCalculatorService(db)
    referral_rules = await service._get_referral_rules(user.id)
    
    categories = list(set(rule.category for rule in referral_rules if rule.category != "默认"))
    categories.sort()
    
    return {
        "success": True,
        "data": categories
    }


@router.get("/size-tiers")
async def get_size_tiers(
    user: User = Depends(get_current_user_required)
):
    """
    获取FBA尺寸分段说明
    """
    size_tiers = [
        {
            "name": "Small Standard",
            "description": "小号标准",
            "max_weight_oz": 16,
            "max_dimensions": "15 x 12 x 0.75 英寸"
        },
        {
            "name": "Large Standard",
            "description": "大号标准",
            "max_weight_oz": 320,
            "max_dimensions": "18 x 14 x 8 英寸"
        },
        {
            "name": "Large Bulky",
            "description": "大件",
            "max_weight_oz": 1120,
            "max_dimensions": "59 x 33 英寸，长度+围长 <= 130 英寸"
        },
        {
            "name": "Extra Large",
            "description": "超大件",
            "max_weight_oz": None,
            "max_dimensions": "超过大件限制"
        }
    ]
    
    return {
        "success": True,
        "data": size_tiers
    }
