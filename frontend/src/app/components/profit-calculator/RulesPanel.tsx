/**
 * 规则管理面板组件
 */
import { useState } from 'react';
import { X, DollarSign, Truck, Percent, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import type { Rules } from './useProfitCalculator';

interface RulesPanelProps {
  rules: Rules;
  onUpdateExchangeRate: (rate: number) => Promise<void>;
  onUpdateShippingRule: (type: string, rate: number, unitType?: string) => Promise<void>;
  onUpdateOtherCostRule: (name: string, value: number, ruleType?: string) => Promise<void>;
  onClose: () => void;
}

export function RulesPanel({
  rules,
  onUpdateExchangeRate,
  onUpdateShippingRule,
  onUpdateOtherCostRule,
  onClose,
}: RulesPanelProps) {
  // 汇率
  const currentExchangeRate = rules.exchange_rates.find(r => r.currency_pair === 'USD_CNY')?.rate || 7.2;
  const [exchangeRate, setExchangeRate] = useState(currentExchangeRate.toString());

  // 运费
  const getShippingRate = (type: string) => {
    const rule = rules.shipping_fee_rules.find(r => r.shipping_type === type);
    return rule?.rate_per_unit || 0;
  };
  const [seaStandardRate, setSeaStandardRate] = useState(getShippingRate('sea_standard').toString());
  const [seaExpressRate, setSeaExpressRate] = useState(getShippingRate('sea_express').toString());
  const [airRate, setAirRate] = useState(getShippingRate('air').toString());

  // 其他费用
  const getOtherCostValue = (name: string) => {
    const rule = rules.other_cost_rules.find(r => r.rule_name === name);
    return rule?.value || 0;
  };
  const [handlingFee, setHandlingFee] = useState(getOtherCostValue('handling_fee').toString());
  const [tariffRate, setTariffRate] = useState(getOtherCostValue('tariff').toString());

  const [saving, setSaving] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 更新汇率
      if (parseFloat(exchangeRate) !== currentExchangeRate) {
        await onUpdateExchangeRate(parseFloat(exchangeRate));
      }

      // 更新运费规则
      if (parseFloat(seaStandardRate) !== getShippingRate('sea_standard')) {
        await onUpdateShippingRule('sea_standard', parseFloat(seaStandardRate), 'cbm');
      }
      if (parseFloat(seaExpressRate) !== getShippingRate('sea_express')) {
        await onUpdateShippingRule('sea_express', parseFloat(seaExpressRate), 'cbm');
      }
      if (parseFloat(airRate) !== getShippingRate('air')) {
        await onUpdateShippingRule('air', parseFloat(airRate), 'kg');
      }

      // 更新其他费用规则
      if (parseFloat(handlingFee) !== getOtherCostValue('handling_fee')) {
        await onUpdateOtherCostRule('handling_fee', parseFloat(handlingFee), 'fixed');
      }
      if (parseFloat(tariffRate) !== getOtherCostValue('tariff')) {
        await onUpdateOtherCostRule('tariff', parseFloat(tariffRate), 'percentage');
      }

      toast.success('规则保存成功');
      onClose();
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Token') || errorMessage.includes('认证') || errorMessage.includes('登录')) {
        toast.error('登录已过期，请重新登录后再保存设置');
      } else {
        toast.error('保存失败：' + errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-rose-200 bg-rose-50/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">费率设置</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 汇率设置 */}
          <div className="space-y-3">
            <h3 className="font-medium text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              汇率设置
            </h3>
            <div>
              <Label htmlFor="exchangeRate">USD/CNY 汇率</Label>
              <Input
                id="exchangeRate"
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder="7.20"
              />
              <p className="text-xs text-slate-500 mt-1">当前汇率用于人民币与美元转换</p>
            </div>
          </div>

          {/* 头程运费设置 */}
          <div className="space-y-3">
            <h3 className="font-medium text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              头程运费设置
            </h3>
            <div className="space-y-2">
              <div>
                <Label htmlFor="seaStandard">普海运费 (元/立方米)</Label>
                <Input
                  id="seaStandard"
                  type="number"
                  value={seaStandardRate}
                  onChange={(e) => setSeaStandardRate(e.target.value)}
                  placeholder="1200"
                />
              </div>
              <div>
                <Label htmlFor="seaExpress">美森运费 (元/立方米)</Label>
                <Input
                  id="seaExpress"
                  type="number"
                  value={seaExpressRate}
                  onChange={(e) => setSeaExpressRate(e.target.value)}
                  placeholder="2000"
                />
              </div>
              <div>
                <Label htmlFor="air">空运运费 (元/公斤)</Label>
                <Input
                  id="air"
                  type="number"
                  value={airRate}
                  onChange={(e) => setAirRate(e.target.value)}
                  placeholder="50"
                />
              </div>
            </div>
          </div>

          {/* 其他费用设置 */}
          <div className="space-y-3">
            <h3 className="font-medium text-slate-900 flex items-center gap-2">
              <Percent className="w-4 h-4 text-orange-600" />
              其他费用设置
            </h3>
            <div className="space-y-2">
              <div>
                <Label htmlFor="handlingFee">配置金 (美元/件)</Label>
                <Input
                  id="handlingFee"
                  type="number"
                  step="0.01"
                  value={handlingFee}
                  onChange={(e) => setHandlingFee(e.target.value)}
                  placeholder="0.36"
                />
              </div>
              <div>
                <Label htmlFor="tariff">关税比例 (%)</Label>
                <Input
                  id="tariff"
                  type="number"
                  step="0.1"
                  value={tariffRate}
                  onChange={(e) => setTariffRate(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-slate-500 mt-1">基于成本计算的关税比例</p>
              </div>
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end mt-6 pt-4 border-t">
          <Button
            onClick={handleSaveAll}
            disabled={saving}
            className="gap-2 bg-rose-500 hover:bg-rose-600"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
