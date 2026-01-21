/**
 * 单品毛利计算器组件
 */
import { useState, useEffect } from 'react';
import { Calculator, Save, RotateCcw, TrendingUp, TrendingDown, Ship, Plane, Anchor } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { CalculationResult } from './useProfitCalculator';

interface ProfitCalculatorProps {
  categories: string[];
  onCalculate: (data: any) => Promise<CalculationResult>;
  onSave: (data: any) => void;
}

const defaultFormData = {
  name: '',
  length_cm: '',
  width_cm: '',
  height_cm: '',
  weight_g: '',
  selling_price_usd: '',
  total_cost_cny: '',
  category: '__default__',
};

export function ProfitCalculator({ categories, onCalculate, onSave }: ProfitCalculatorProps) {
  const [formData, setFormData] = useState(defaultFormData);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // 表单变化时自动计算
  useEffect(() => {
    const timer = setTimeout(() => {
      handleCalculate();
    }, 500);
    return () => clearTimeout(timer);
  }, [formData]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCalculate = async () => {
    // 验证必填字段
    if (!formData.length_cm || !formData.width_cm || !formData.height_cm ||
        !formData.weight_g || !formData.selling_price_usd || !formData.total_cost_cny) {
      return;
    }

    setCalculating(true);
    try {
      const data = {
        name: formData.name || '未命名产品',
        length_cm: parseFloat(formData.length_cm),
        width_cm: parseFloat(formData.width_cm),
        height_cm: parseFloat(formData.height_cm),
        weight_g: parseFloat(formData.weight_g),
        selling_price_usd: parseFloat(formData.selling_price_usd),
        total_cost_cny: parseFloat(formData.total_cost_cny),
        category: formData.category && formData.category !== '__default__' ? formData.category : undefined,
      };
      const calcResult = await onCalculate(data);
      setResult(calcResult);
    } catch (error) {
      console.error('Calculate error:', error);
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = () => {
    if (!formData.name) {
      alert('请输入产品名称');
      return;
    }
    onSave({
      name: formData.name,
      length_cm: parseFloat(formData.length_cm),
      width_cm: parseFloat(formData.width_cm),
      height_cm: parseFloat(formData.height_cm),
      weight_g: parseFloat(formData.weight_g),
      selling_price_usd: parseFloat(formData.selling_price_usd),
      total_cost_cny: parseFloat(formData.total_cost_cny),
      category: formData.category || undefined,
    });
  };

  const handleReset = () => {
    setFormData(defaultFormData);
    setResult(null);
  };

  const getProfitColor = (margin: number) => {
    if (margin >= 20) return 'text-green-600';
    if (margin >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="w-5 h-5 text-rose-500" />
          快速计算
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 产品名称 */}
        <div>
          <Label htmlFor="name">产品名称</Label>
          <Input
            id="name"
            placeholder="输入产品名称"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
          />
        </div>

        {/* 尺寸 */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="length">长(cm)</Label>
            <Input
              id="length"
              type="number"
              placeholder="长"
              value={formData.length_cm}
              onChange={(e) => handleInputChange('length_cm', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="width">宽(cm)</Label>
            <Input
              id="width"
              type="number"
              placeholder="宽"
              value={formData.width_cm}
              onChange={(e) => handleInputChange('width_cm', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="height">高(cm)</Label>
            <Input
              id="height"
              type="number"
              placeholder="高"
              value={formData.height_cm}
              onChange={(e) => handleInputChange('height_cm', e.target.value)}
            />
          </div>
        </div>

        {/* 重量 */}
        <div>
          <Label htmlFor="weight">重量(克)</Label>
          <Input
            id="weight"
            type="number"
            placeholder="产品重量（克）"
            value={formData.weight_g}
            onChange={(e) => handleInputChange('weight_g', e.target.value)}
          />
        </div>

        {/* 售价和成本 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="price">售价(USD)</Label>
            <Input
              id="price"
              type="number"
              placeholder="售价"
              value={formData.selling_price_usd}
              onChange={(e) => handleInputChange('selling_price_usd', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cost">成本(CNY)</Label>
            <Input
              id="cost"
              type="number"
              placeholder="成本"
              value={formData.total_cost_cny}
              onChange={(e) => handleInputChange('total_cost_cny', e.target.value)}
            />
          </div>
        </div>

        {/* 类目 */}
        <div>
          <Label htmlFor="category">产品类目</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => handleInputChange('category', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择类目（影响佣金比例）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">默认 (15%)</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 计算结果 */}
        {result && (
          <div className="mt-4 space-y-3 pt-4 border-t">
            {/* 尺寸分段和基本信息 */}
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">尺寸分段:</span>
                <span className="font-medium">{result.size_tier}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-600">计费重量:</span>
                <span className="font-medium">{result.billable_weight_oz.toFixed(1)} oz</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-600">FBA费用:</span>
                <span className="font-medium">${result.fba_fee_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-600">佣金({result.referral_percentage}%):</span>
                <span className="font-medium">${result.referral_fee_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-600">汇率:</span>
                <span className="font-medium">{result.exchange_rate.toFixed(2)}</span>
              </div>
            </div>

            {/* 各渠道利润对比 */}
            <div className="space-y-2">
              {/* 普海 */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Anchor className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">普海</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">
                    运费 ¥{result.sea_standard_shipping_cny.toFixed(2)}
                  </div>
                  <div className={`font-semibold flex items-center gap-1 ${getProfitColor(result.sea_standard_profit_margin)}`}>
                    {result.sea_standard_profit_margin >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    ${result.sea_standard_profit_usd.toFixed(2)} ({result.sea_standard_profit_margin.toFixed(1)}%)
                  </div>
                </div>
              </div>

              {/* 美森 */}
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Ship className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium">美森</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">
                    运费 ¥{result.sea_express_shipping_cny.toFixed(2)}
                  </div>
                  <div className={`font-semibold flex items-center gap-1 ${getProfitColor(result.sea_express_profit_margin)}`}>
                    {result.sea_express_profit_margin >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    ${result.sea_express_profit_usd.toFixed(2)} ({result.sea_express_profit_margin.toFixed(1)}%)
                  </div>
                </div>
              </div>

              {/* 空运 */}
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium">空运</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">
                    运费 ¥{result.air_shipping_cny.toFixed(2)}
                  </div>
                  <div className={`font-semibold flex items-center gap-1 ${getProfitColor(result.air_profit_margin)}`}>
                    {result.air_profit_margin >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    ${result.air_profit_usd.toFixed(2)} ({result.air_profit_margin.toFixed(1)}%)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            重置
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!result || !formData.name}
            className="flex-1 bg-rose-500 hover:bg-rose-600"
          >
            <Save className="w-4 h-4 mr-1" />
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
