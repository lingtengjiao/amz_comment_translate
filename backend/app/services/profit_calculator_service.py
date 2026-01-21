"""
Profit Calculator Service - 毛利计算服务
核心计算逻辑和规则管理
"""
import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profit_calculator import (
    ProfitProduct,
    FBAFeeRule,
    ReferralFeeRule,
    ShippingFeeRule,
    ExchangeRate,
    OtherCostRule
)

logger = logging.getLogger(__name__)


@dataclass
class ProductInput:
    """产品输入参数"""
    name: str
    length_cm: float
    width_cm: float
    height_cm: float
    weight_g: float
    selling_price_usd: float
    total_cost_cny: float
    category: Optional[str] = None


@dataclass
class ProfitCalculationResult:
    """毛利计算结果"""
    # 产品信息
    name: str
    length_cm: float
    width_cm: float
    height_cm: float
    weight_g: float
    selling_price_usd: float
    total_cost_cny: float
    category: Optional[str]
    
    # 计算中间值
    volume_cbm: float          # 体积（立方米）
    volume_weight_oz: float    # 体积重（盎司）
    actual_weight_oz: float    # 实际重量（盎司）
    billable_weight_oz: float  # 计费重量（盎司）
    size_tier: str             # 尺寸分段
    
    # FBA费用
    fba_fee_usd: float
    
    # 佣金
    referral_fee_usd: float
    referral_percentage: float
    
    # 头程运费（人民币）
    sea_standard_shipping_cny: float   # 普海运费
    sea_express_shipping_cny: float    # 美森运费
    air_shipping_cny: float            # 空运运费
    
    # 其他费用
    handling_fee_usd: float    # 配置金
    tariff_usd: float          # 关税
    
    # 汇率
    exchange_rate: float
    
    # 成本（美元）
    total_cost_usd: float
    
    # 各渠道利润（美元）
    sea_standard_profit_usd: float
    sea_express_profit_usd: float
    air_profit_usd: float
    
    # 各渠道利润率（百分比）
    sea_standard_profit_margin: float
    sea_express_profit_margin: float
    air_profit_margin: float
    
    # 投入产出比
    sea_standard_roi: float
    sea_express_roi: float
    air_roi: float
    
    def to_dict(self) -> dict:
        return {
            # 产品信息
            "name": self.name,
            "length_cm": self.length_cm,
            "width_cm": self.width_cm,
            "height_cm": self.height_cm,
            "weight_g": self.weight_g,
            "selling_price_usd": self.selling_price_usd,
            "total_cost_cny": self.total_cost_cny,
            "category": self.category,
            # 计算中间值
            "volume_cbm": round(self.volume_cbm, 6),
            "volume_weight_oz": round(self.volume_weight_oz, 2),
            "actual_weight_oz": round(self.actual_weight_oz, 2),
            "billable_weight_oz": round(self.billable_weight_oz, 2),
            "size_tier": self.size_tier,
            # FBA费用
            "fba_fee_usd": round(self.fba_fee_usd, 2),
            # 佣金
            "referral_fee_usd": round(self.referral_fee_usd, 2),
            "referral_percentage": round(self.referral_percentage, 2),
            # 头程运费
            "sea_standard_shipping_cny": round(self.sea_standard_shipping_cny, 2),
            "sea_express_shipping_cny": round(self.sea_express_shipping_cny, 2),
            "air_shipping_cny": round(self.air_shipping_cny, 2),
            # 其他费用
            "handling_fee_usd": round(self.handling_fee_usd, 2),
            "tariff_usd": round(self.tariff_usd, 2),
            # 汇率
            "exchange_rate": round(self.exchange_rate, 4),
            # 成本
            "total_cost_usd": round(self.total_cost_usd, 2),
            # 各渠道利润
            "sea_standard_profit_usd": round(self.sea_standard_profit_usd, 2),
            "sea_express_profit_usd": round(self.sea_express_profit_usd, 2),
            "air_profit_usd": round(self.air_profit_usd, 2),
            # 各渠道利润率
            "sea_standard_profit_margin": round(self.sea_standard_profit_margin, 2),
            "sea_express_profit_margin": round(self.sea_express_profit_margin, 2),
            "air_profit_margin": round(self.air_profit_margin, 2),
            # 投入产出比
            "sea_standard_roi": round(self.sea_standard_roi, 2),
            "sea_express_roi": round(self.sea_express_roi, 2),
            "air_roi": round(self.air_roi, 2),
        }


class ProfitCalculatorService:
    """毛利计算服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ============================================================
    # 核心计算逻辑
    # ============================================================
    
    async def calculate_profit(
        self,
        product: ProductInput,
        user_id: Optional[uuid.UUID] = None
    ) -> ProfitCalculationResult:
        """
        计算产品毛利
        
        Args:
            product: 产品输入参数
            user_id: 用户ID（用于获取用户自定义规则，如果没有则使用系统默认规则）
        
        Returns:
            ProfitCalculationResult: 毛利计算结果
        """
        # 获取规则
        fba_rules = await self._get_fba_rules(user_id)
        referral_rules = await self._get_referral_rules(user_id)
        shipping_rules = await self._get_shipping_rules(user_id)
        exchange_rate = await self._get_exchange_rate(user_id)
        other_rules = await self._get_other_cost_rules(user_id)
        
        # 1. 计算体积和重量
        length_cm = product.length_cm
        width_cm = product.width_cm
        height_cm = product.height_cm
        weight_g = product.weight_g
        
        # 体积（立方米）
        volume_cbm = (length_cm * width_cm * height_cm) / 1000000
        
        # 将尺寸转换为英寸用于FBA计算
        length_in = length_cm / 2.54
        width_in = width_cm / 2.54
        height_in = height_cm / 2.54
        
        # 体积重计算（盎司）：使用亚马逊标准公式
        # 体积重(oz) = (长*宽*高 英寸) / 139
        volume_weight_oz = (length_in * width_in * height_in) / 139
        
        # 实际重量（盎司）：1克 = 0.035274盎司
        actual_weight_oz = weight_g * 0.035274
        
        # 计费重量取较大值
        billable_weight_oz = max(volume_weight_oz, actual_weight_oz)
        
        # 2. 确定尺寸分段
        size_tier = self._determine_size_tier(length_in, width_in, height_in, actual_weight_oz)
        
        # 3. 计算FBA费用
        fba_fee_usd = self._calculate_fba_fee(fba_rules, size_tier, billable_weight_oz)
        
        # 4. 计算佣金
        referral_percentage, referral_fee_usd = self._calculate_referral_fee(
            referral_rules, 
            product.category,
            product.selling_price_usd
        )
        
        # 5. 计算头程运费（人民币）
        weight_kg = weight_g / 1000
        sea_standard_shipping_cny = self._calculate_shipping(shipping_rules, 'sea_standard', volume_cbm, weight_kg)
        sea_express_shipping_cny = self._calculate_shipping(shipping_rules, 'sea_express', volume_cbm, weight_kg)
        air_shipping_cny = self._calculate_shipping(shipping_rules, 'air', volume_cbm, weight_kg)
        
        # 6. 计算其他费用
        handling_fee_usd = self._get_other_cost(other_rules, 'handling_fee', product.total_cost_cny, exchange_rate)
        tariff_usd = self._get_other_cost(other_rules, 'tariff', product.total_cost_cny, exchange_rate)
        
        # 7. 计算成本（美元）
        total_cost_usd = product.total_cost_cny / exchange_rate
        
        # 8. 计算各渠道净利润
        # 净利润 = 售价 - FBA费用 - 佣金 - 配置金 - 关税 - 成本 - 头程运费/汇率
        base_cost_usd = fba_fee_usd + referral_fee_usd + handling_fee_usd + tariff_usd + total_cost_usd
        
        sea_standard_profit_usd = product.selling_price_usd - base_cost_usd - (sea_standard_shipping_cny / exchange_rate)
        sea_express_profit_usd = product.selling_price_usd - base_cost_usd - (sea_express_shipping_cny / exchange_rate)
        air_profit_usd = product.selling_price_usd - base_cost_usd - (air_shipping_cny / exchange_rate)
        
        # 9. 计算利润率（百分比）
        selling_price = product.selling_price_usd
        sea_standard_profit_margin = (sea_standard_profit_usd / selling_price * 100) if selling_price > 0 else 0
        sea_express_profit_margin = (sea_express_profit_usd / selling_price * 100) if selling_price > 0 else 0
        air_profit_margin = (air_profit_usd / selling_price * 100) if selling_price > 0 else 0
        
        # 10. 计算投入产出比（ROI）
        sea_standard_total_cost = total_cost_usd + (sea_standard_shipping_cny / exchange_rate)
        sea_express_total_cost = total_cost_usd + (sea_express_shipping_cny / exchange_rate)
        air_total_cost = total_cost_usd + (air_shipping_cny / exchange_rate)
        
        sea_standard_roi = (sea_standard_profit_usd / sea_standard_total_cost * 100) if sea_standard_total_cost > 0 else 0
        sea_express_roi = (sea_express_profit_usd / sea_express_total_cost * 100) if sea_express_total_cost > 0 else 0
        air_roi = (air_profit_usd / air_total_cost * 100) if air_total_cost > 0 else 0
        
        return ProfitCalculationResult(
            name=product.name,
            length_cm=length_cm,
            width_cm=width_cm,
            height_cm=height_cm,
            weight_g=weight_g,
            selling_price_usd=product.selling_price_usd,
            total_cost_cny=product.total_cost_cny,
            category=product.category,
            volume_cbm=volume_cbm,
            volume_weight_oz=volume_weight_oz,
            actual_weight_oz=actual_weight_oz,
            billable_weight_oz=billable_weight_oz,
            size_tier=size_tier,
            fba_fee_usd=fba_fee_usd,
            referral_fee_usd=referral_fee_usd,
            referral_percentage=referral_percentage,
            sea_standard_shipping_cny=sea_standard_shipping_cny,
            sea_express_shipping_cny=sea_express_shipping_cny,
            air_shipping_cny=air_shipping_cny,
            handling_fee_usd=handling_fee_usd,
            tariff_usd=tariff_usd,
            exchange_rate=exchange_rate,
            total_cost_usd=total_cost_usd,
            sea_standard_profit_usd=sea_standard_profit_usd,
            sea_express_profit_usd=sea_express_profit_usd,
            air_profit_usd=air_profit_usd,
            sea_standard_profit_margin=sea_standard_profit_margin,
            sea_express_profit_margin=sea_express_profit_margin,
            air_profit_margin=air_profit_margin,
            sea_standard_roi=sea_standard_roi,
            sea_express_roi=sea_express_roi,
            air_roi=air_roi
        )
    
    def _determine_size_tier(
        self, 
        length_in: float, 
        width_in: float, 
        height_in: float, 
        weight_oz: float
    ) -> str:
        """
        根据亚马逊规则确定尺寸分段
        
        参考：https://sellercentral.amazon.com/help/hub/reference/external/G201411300
        """
        # 计算尺寸（按最长边排序）
        dims = sorted([length_in, width_in, height_in], reverse=True)
        longest = dims[0]
        median = dims[1]
        shortest = dims[2]
        
        # 计算长度+围长
        girth = 2 * (median + shortest)
        length_plus_girth = longest + girth
        
        # Small Standard Size: 
        # - 重量 <= 16 oz (1 lb)
        # - 最长边 <= 15 in
        # - 次长边 <= 12 in
        # - 最短边 <= 0.75 in
        if (weight_oz <= 16 and 
            longest <= 15 and 
            median <= 12 and 
            shortest <= 0.75):
            return "Small Standard"
        
        # Large Standard Size:
        # - 重量 <= 320 oz (20 lbs)
        # - 最长边 <= 18 in
        # - 次长边 <= 14 in
        # - 最短边 <= 8 in
        if (weight_oz <= 320 and 
            longest <= 18 and 
            median <= 14 and 
            shortest <= 8):
            return "Large Standard"
        
        # Large Bulky:
        # - 重量 <= 1120 oz (70 lbs) 或更重
        # - 或者尺寸超过Large Standard限制
        if (weight_oz <= 1120 and 
            longest <= 59 and 
            median <= 33 and 
            length_plus_girth <= 130):
            return "Large Bulky"
        
        # Extra Large (超大件)
        return "Extra Large"
    
    def _calculate_fba_fee(
        self,
        rules: List[FBAFeeRule],
        size_tier: str,
        weight_oz: float
    ) -> float:
        """根据尺寸分段和重量计算FBA费用"""
        # 找到匹配的规则
        for rule in rules:
            if rule.size_tier == size_tier:
                min_weight = float(rule.weight_min_oz) if rule.weight_min_oz else 0
                max_weight = float(rule.weight_max_oz) if rule.weight_max_oz else float('inf')
                if min_weight <= weight_oz < max_weight:
                    return float(rule.fee_usd)
        
        # 如果没有找到匹配的规则，返回默认值
        logger.warning(f"No FBA rule found for size_tier={size_tier}, weight_oz={weight_oz}")
        return 5.0  # 默认FBA费用
    
    def _calculate_referral_fee(
        self,
        rules: List[ReferralFeeRule],
        category: Optional[str],
        selling_price: float
    ) -> tuple[float, float]:
        """计算佣金"""
        # 首先尝试匹配具体类目
        percentage = 15.0  # 默认15%
        min_fee = 0.30  # 默认最低佣金
        
        if category:
            for rule in rules:
                if rule.category == category:
                    percentage = float(rule.fee_percentage)
                    min_fee = float(rule.min_fee_usd)
                    break
        else:
            # 使用默认类目规则
            for rule in rules:
                if rule.category == "默认":
                    percentage = float(rule.fee_percentage)
                    min_fee = float(rule.min_fee_usd)
                    break
        
        # 计算佣金
        calculated_fee = selling_price * (percentage / 100)
        referral_fee = max(calculated_fee, min_fee)
        
        return percentage, referral_fee
    
    def _calculate_shipping(
        self,
        rules: List[ShippingFeeRule],
        shipping_type: str,
        volume_cbm: float,
        weight_kg: float
    ) -> float:
        """计算头程运费"""
        for rule in rules:
            if rule.shipping_type == shipping_type:
                rate = float(rule.rate_per_unit)
                if rule.unit_type == 'cbm':
                    return volume_cbm * rate
                elif rule.unit_type == 'kg':
                    return weight_kg * rate
        
        # 默认运费
        if shipping_type == 'air':
            return weight_kg * 50  # 空运默认50元/公斤
        else:
            return volume_cbm * 1500  # 海运默认1500元/立方米
    
    def _get_other_cost(
        self,
        rules: List[OtherCostRule],
        rule_name: str,
        cost_cny: float,
        exchange_rate: float
    ) -> float:
        """获取其他费用"""
        for rule in rules:
            if rule.rule_name == rule_name:
                if rule.rule_type == 'fixed':
                    return float(rule.value)
                elif rule.rule_type == 'percentage':
                    # 基于成本计算
                    cost_usd = cost_cny / exchange_rate
                    return cost_usd * (float(rule.value) / 100)
        return 0.0
    
    # ============================================================
    # 规则获取
    # ============================================================
    
    async def _get_fba_rules(self, user_id: Optional[uuid.UUID]) -> List[FBAFeeRule]:
        """获取FBA费率规则（用户自定义优先，否则使用系统默认）"""
        query = select(FBAFeeRule).where(
            FBAFeeRule.is_active == True,
            or_(FBAFeeRule.user_id == user_id, FBAFeeRule.user_id == None)
        ).order_by(FBAFeeRule.user_id.desc().nullslast())  # 用户规则优先
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _get_referral_rules(self, user_id: Optional[uuid.UUID]) -> List[ReferralFeeRule]:
        """获取佣金规则"""
        query = select(ReferralFeeRule).where(
            ReferralFeeRule.is_active == True,
            or_(ReferralFeeRule.user_id == user_id, ReferralFeeRule.user_id == None)
        ).order_by(ReferralFeeRule.user_id.desc().nullslast())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _get_shipping_rules(self, user_id: Optional[uuid.UUID]) -> List[ShippingFeeRule]:
        """获取运费规则"""
        query = select(ShippingFeeRule).where(
            ShippingFeeRule.is_active == True,
            or_(ShippingFeeRule.user_id == user_id, ShippingFeeRule.user_id == None)
        ).order_by(ShippingFeeRule.user_id.desc().nullslast())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _get_exchange_rate(self, user_id: Optional[uuid.UUID]) -> float:
        """获取汇率"""
        query = select(ExchangeRate).where(
            ExchangeRate.is_active == True,
            ExchangeRate.currency_pair == 'USD_CNY',
            or_(ExchangeRate.user_id == user_id, ExchangeRate.user_id == None)
        ).order_by(ExchangeRate.user_id.desc().nullslast()).limit(1)
        
        result = await self.db.execute(query)
        rate = result.scalar_one_or_none()
        
        if rate:
            return float(rate.rate)
        return 7.20  # 默认汇率
    
    async def _get_other_cost_rules(self, user_id: Optional[uuid.UUID]) -> List[OtherCostRule]:
        """获取其他费用规则"""
        query = select(OtherCostRule).where(
            OtherCostRule.is_active == True,
            or_(OtherCostRule.user_id == user_id, OtherCostRule.user_id == None)
        ).order_by(OtherCostRule.user_id.desc().nullslast())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    # ============================================================
    # 产品 CRUD
    # ============================================================
    
    async def create_product(
        self,
        user_id: uuid.UUID,
        data: Dict[str, Any]
    ) -> ProfitProduct:
        """创建产品"""
        product = ProfitProduct(
            user_id=user_id,
            name=data['name'],
            length_cm=Decimal(str(data['length_cm'])),
            width_cm=Decimal(str(data['width_cm'])),
            height_cm=Decimal(str(data['height_cm'])),
            weight_g=Decimal(str(data['weight_g'])),
            selling_price_usd=Decimal(str(data['selling_price_usd'])),
            total_cost_cny=Decimal(str(data['total_cost_cny'])),
            category=data.get('category'),
            notes=data.get('notes')
        )
        
        self.db.add(product)
        await self.db.commit()
        await self.db.refresh(product)
        
        return product
    
    async def get_products(self, user_id: uuid.UUID) -> List[ProfitProduct]:
        """获取用户的所有产品"""
        query = select(ProfitProduct).where(
            ProfitProduct.user_id == user_id
        ).order_by(ProfitProduct.created_at.desc())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_product(self, product_id: uuid.UUID, user_id: uuid.UUID) -> Optional[ProfitProduct]:
        """获取单个产品"""
        query = select(ProfitProduct).where(
            ProfitProduct.id == product_id,
            ProfitProduct.user_id == user_id
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_product(
        self,
        product_id: uuid.UUID,
        user_id: uuid.UUID,
        data: Dict[str, Any]
    ) -> Optional[ProfitProduct]:
        """更新产品"""
        product = await self.get_product(product_id, user_id)
        if not product:
            return None
        
        for key, value in data.items():
            if hasattr(product, key) and value is not None:
                if key in ['length_cm', 'width_cm', 'height_cm', 'weight_g', 
                          'selling_price_usd', 'total_cost_cny']:
                    setattr(product, key, Decimal(str(value)))
                else:
                    setattr(product, key, value)
        
        await self.db.commit()
        await self.db.refresh(product)
        
        return product
    
    async def delete_product(self, product_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """删除产品"""
        product = await self.get_product(product_id, user_id)
        if not product:
            return False
        
        await self.db.delete(product)
        await self.db.commit()
        
        return True
    
    # ============================================================
    # 规则管理
    # ============================================================
    
    async def get_all_rules(self, user_id: Optional[uuid.UUID] = None) -> Dict[str, List[Dict]]:
        """获取所有规则"""
        fba_rules = await self._get_fba_rules(user_id)
        referral_rules = await self._get_referral_rules(user_id)
        shipping_rules = await self._get_shipping_rules(user_id)
        exchange_rate = await self._get_exchange_rate(user_id)
        other_rules = await self._get_other_cost_rules(user_id)
        
        # 获取完整的汇率记录
        exchange_query = select(ExchangeRate).where(
            ExchangeRate.is_active == True,
            or_(ExchangeRate.user_id == user_id, ExchangeRate.user_id == None)
        ).order_by(ExchangeRate.user_id.desc().nullslast())
        exchange_result = await self.db.execute(exchange_query)
        exchange_rates = list(exchange_result.scalars().all())
        
        return {
            "fba_fee_rules": [r.to_dict() for r in fba_rules],
            "referral_fee_rules": [r.to_dict() for r in referral_rules],
            "shipping_fee_rules": [r.to_dict() for r in shipping_rules],
            "exchange_rates": [r.to_dict() for r in exchange_rates],
            "other_cost_rules": [r.to_dict() for r in other_rules]
        }
    
    async def update_exchange_rate(
        self,
        user_id: uuid.UUID,
        rate: float
    ) -> ExchangeRate:
        """更新或创建用户汇率"""
        # 查找用户现有汇率
        query = select(ExchangeRate).where(
            ExchangeRate.user_id == user_id,
            ExchangeRate.currency_pair == 'USD_CNY'
        )
        result = await self.db.execute(query)
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.rate = Decimal(str(rate))
            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            new_rate = ExchangeRate(
                user_id=user_id,
                currency_pair='USD_CNY',
                rate=Decimal(str(rate))
            )
            self.db.add(new_rate)
            await self.db.commit()
            await self.db.refresh(new_rate)
            return new_rate
    
    async def update_shipping_rule(
        self,
        user_id: uuid.UUID,
        shipping_type: str,
        rate_per_unit: float,
        unit_type: str = None,
        description: str = None
    ) -> ShippingFeeRule:
        """更新或创建用户运费规则"""
        query = select(ShippingFeeRule).where(
            ShippingFeeRule.user_id == user_id,
            ShippingFeeRule.shipping_type == shipping_type
        )
        result = await self.db.execute(query)
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.rate_per_unit = Decimal(str(rate_per_unit))
            if unit_type:
                existing.unit_type = unit_type
            if description:
                existing.description = description
            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            # 确定默认unit_type
            if not unit_type:
                unit_type = 'kg' if shipping_type == 'air' else 'cbm'
            
            new_rule = ShippingFeeRule(
                user_id=user_id,
                shipping_type=shipping_type,
                rate_per_unit=Decimal(str(rate_per_unit)),
                unit_type=unit_type,
                description=description
            )
            self.db.add(new_rule)
            await self.db.commit()
            await self.db.refresh(new_rule)
            return new_rule
    
    async def update_other_cost_rule(
        self,
        user_id: uuid.UUID,
        rule_name: str,
        value: float,
        rule_type: str = None,
        base_field: str = None,
        description: str = None
    ) -> OtherCostRule:
        """更新或创建其他费用规则"""
        query = select(OtherCostRule).where(
            OtherCostRule.user_id == user_id,
            OtherCostRule.rule_name == rule_name
        )
        result = await self.db.execute(query)
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.value = Decimal(str(value))
            if rule_type:
                existing.rule_type = rule_type
            if base_field is not None:
                existing.base_field = base_field
            if description:
                existing.description = description
            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            if not rule_type:
                rule_type = 'fixed' if rule_name == 'handling_fee' else 'percentage'
            
            new_rule = OtherCostRule(
                user_id=user_id,
                rule_name=rule_name,
                rule_type=rule_type,
                value=Decimal(str(value)),
                base_field=base_field,
                description=description
            )
            self.db.add(new_rule)
            await self.db.commit()
            await self.db.refresh(new_rule)
            return new_rule
