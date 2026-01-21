/**
 * 毛利计算 Hook - 管理状态和API调用
 */
import { useState, useCallback } from 'react';

const API_BASE = '/api/v1';
const TOKEN_KEY = 'voc_auth_token';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

export interface ProductData {
  id: string;
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_g: number;
  selling_price_usd: number;
  total_cost_cny: number;
  category?: string;
  notes?: string;
  calculation?: CalculationResult;
}

export interface CalculationResult {
  // 计算中间值
  volume_cbm: number;
  volume_weight_oz: number;
  actual_weight_oz: number;
  billable_weight_oz: number;
  size_tier: string;
  // FBA费用
  fba_fee_usd: number;
  // 佣金
  referral_fee_usd: number;
  referral_percentage: number;
  // 头程运费
  sea_standard_shipping_cny: number;
  sea_express_shipping_cny: number;
  air_shipping_cny: number;
  // 其他费用
  handling_fee_usd: number;
  tariff_usd: number;
  // 汇率
  exchange_rate: number;
  // 成本
  total_cost_usd: number;
  // 各渠道利润
  sea_standard_profit_usd: number;
  sea_express_profit_usd: number;
  air_profit_usd: number;
  // 各渠道利润率
  sea_standard_profit_margin: number;
  sea_express_profit_margin: number;
  air_profit_margin: number;
  // 投入产出比
  sea_standard_roi: number;
  sea_express_roi: number;
  air_roi: number;
}

export interface Rules {
  fba_fee_rules: any[];
  referral_fee_rules: any[];
  shipping_fee_rules: any[];
  exchange_rates: any[];
  other_cost_rules: any[];
}

export function useProfitCalculator() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [rules, setRules] = useState<Rules>({
    fba_fee_rules: [],
    referral_fee_rules: [],
    shipping_fee_rules: [],
    exchange_rates: [],
    other_cost_rules: [],
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取产品列表
  const refreshProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ success: boolean; data: ProductData[] }>('/profit/products');
      if (response.success) {
        setProducts(response.data || []);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      // 确保即使 API 失败也设置空数组，避免白屏
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取规则配置
  const refreshRules = useCallback(async () => {
    try {
      const [rulesResponse, categoriesResponse] = await Promise.all([
        apiRequest<{ success: boolean; data: Rules }>('/profit/rules').catch(() => ({ success: false, data: null })),
        apiRequest<{ success: boolean; data: string[] }>('/profit/categories').catch(() => ({ success: false, data: [] })),
      ]);
      
      if (rulesResponse.success && rulesResponse.data) {
        setRules(rulesResponse.data);
      } else {
        // 设置默认规则，确保组件能正常渲染
        setRules({
          fba_fee_rules: [],
          referral_fee_rules: [],
          shipping_fee_rules: [],
          exchange_rates: [],
          other_cost_rules: [],
        });
      }
      if (categoriesResponse.success && categoriesResponse.data) {
        setCategories(categoriesResponse.data);
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error('Failed to load rules:', error);
      // 设置默认值，确保组件能正常渲染
      setRules({
        fba_fee_rules: [],
        referral_fee_rules: [],
        shipping_fee_rules: [],
        exchange_rates: [],
        other_cost_rules: [],
      });
      setCategories([]);
    }
  }, []);

  // 创建产品
  const createProduct = useCallback(async (data: Omit<ProductData, 'id' | 'calculation'>) => {
    const response = await apiRequest<{ success: boolean; data: ProductData }>('/profit/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (response.success) {
      setProducts(prev => [response.data, ...prev]);
      return response.data;
    }
    throw new Error('创建失败');
  }, []);

  // 更新产品
  const updateProduct = useCallback(async (id: string, data: Partial<ProductData>) => {
    const response = await apiRequest<{ success: boolean; data: ProductData }>(`/profit/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    
    if (response.success) {
      setProducts(prev => prev.map(p => p.id === id ? response.data : p));
      return response.data;
    }
    throw new Error('更新失败');
  }, []);

  // 删除产品
  const deleteProduct = useCallback(async (id: string) => {
    const response = await apiRequest<{ success: boolean }>(`/profit/products/${id}`, {
      method: 'DELETE',
    });
    
    if (response.success) {
      setProducts(prev => prev.filter(p => p.id !== id));
    } else {
      throw new Error('删除失败');
    }
  }, []);

  // 即时计算（不保存）
  const calculateProfit = useCallback(async (data: {
    name: string;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_g: number;
    selling_price_usd: number;
    total_cost_cny: number;
    category?: string;
  }): Promise<CalculationResult> => {
    const response = await apiRequest<{ success: boolean; data: CalculationResult }>('/profit/calculate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (response.success) {
      return response.data;
    }
    throw new Error('计算失败');
  }, []);

  // 更新汇率
  const updateExchangeRate = useCallback(async (rate: number) => {
    const response = await apiRequest<{ success: boolean }>('/profit/rules/exchange-rate', {
      method: 'PUT',
      body: JSON.stringify({ rate }),
    });
    
    if (response.success) {
      await refreshRules();
      // 刷新产品列表以更新计算结果
      await refreshProducts();
    }
  }, [refreshRules, refreshProducts]);

  // 更新运费规则
  const updateShippingRule = useCallback(async (
    shippingType: string,
    ratePerUnit: number,
    unitType?: string,
    description?: string
  ) => {
    const response = await apiRequest<{ success: boolean }>('/profit/rules/shipping', {
      method: 'PUT',
      body: JSON.stringify({
        shipping_type: shippingType,
        rate_per_unit: ratePerUnit,
        unit_type: unitType,
        description,
      }),
    });
    
    if (response.success) {
      await refreshRules();
      await refreshProducts();
    }
  }, [refreshRules, refreshProducts]);

  // 更新其他费用规则
  const updateOtherCostRule = useCallback(async (
    ruleName: string,
    value: number,
    ruleType?: string,
    baseField?: string,
    description?: string
  ) => {
    const response = await apiRequest<{ success: boolean }>('/profit/rules/other-cost', {
      method: 'PUT',
      body: JSON.stringify({
        rule_name: ruleName,
        value,
        rule_type: ruleType,
        base_field: baseField,
        description,
      }),
    });
    
    if (response.success) {
      await refreshRules();
      await refreshProducts();
    }
  }, [refreshRules, refreshProducts]);

  return {
    products,
    rules,
    categories,
    loading,
    refreshProducts,
    refreshRules,
    createProduct,
    updateProduct,
    deleteProduct,
    calculateProfit,
    updateExchangeRate,
    updateShippingRule,
    updateOtherCostRule,
  };
}
