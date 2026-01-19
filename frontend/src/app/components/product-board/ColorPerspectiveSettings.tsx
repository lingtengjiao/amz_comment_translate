import { useState, useEffect } from 'react';
import { X, Palette, Plus, Trash2 } from 'lucide-react';

export type ColorConditionField = 'year' | 'sales' | 'rating' | 'price' | 'reviewCount';
export type ColorConditionOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';

export interface ColorCondition {
  id: string;
  field: ColorConditionField;
  operator: ColorConditionOperator;
  value: number;
}

export interface ColorRule {
  id: string;
  name: string;
  color: string;
  conditions: ColorCondition[];
  matchAll: boolean;
}

interface ColorPerspectiveSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  colorRules: ColorRule[];
  onSave: (rules: ColorRule[]) => void;
}

const fieldLabels: Record<ColorConditionField, string> = {
  year: '年份',
  sales: '销量',
  rating: '评分',
  price: '价格',
  reviewCount: '评论数',
};

const operatorLabels: Record<ColorConditionOperator, string> = {
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
  eq: '等于',
};

const presetColors = [
  { name: '绿色 - 优秀', value: '#10b981', bg: 'bg-green-500' },
  { name: '蓝色 - 良好', value: '#3b82f6', bg: 'bg-blue-500' },
  { name: '黄色 - 警告', value: '#f59e0b', bg: 'bg-amber-500' },
  { name: '红色 - 风险', value: '#ef4444', bg: 'bg-red-500' },
  { name: '灰色 - 待优化', value: '#9ca3af', bg: 'bg-gray-400' },
  { name: '紫色 - 特殊', value: '#a855f7', bg: 'bg-purple-500' },
  { name: '粉色 - 潜力', value: '#ec4899', bg: 'bg-pink-500' },
];

const presetRuleTemplates = [
  {
    name: '新品爆款',
    color: '#10b981',
    conditions: [
      { field: 'year' as ColorConditionField, operator: 'gte' as ColorConditionOperator, value: 2024 },
      { field: 'sales' as ColorConditionField, operator: 'gt' as ColorConditionOperator, value: 5000 },
    ],
    matchAll: true,
  },
  {
    name: '新品待观察',
    color: '#f59e0b',
    conditions: [
      { field: 'year' as ColorConditionField, operator: 'gte' as ColorConditionOperator, value: 2024 },
      { field: 'sales' as ColorConditionField, operator: 'lt' as ColorConditionOperator, value: 1000 },
    ],
    matchAll: true,
  },
  {
    name: '长青产品',
    color: '#3b82f6',
    conditions: [
      { field: 'year' as ColorConditionField, operator: 'lte' as ColorConditionOperator, value: 2022 },
      { field: 'sales' as ColorConditionField, operator: 'gt' as ColorConditionOperator, value: 5000 },
    ],
    matchAll: true,
  },
  {
    name: '待淘汰产品',
    color: '#9ca3af',
    conditions: [
      { field: 'year' as ColorConditionField, operator: 'lte' as ColorConditionOperator, value: 2021 },
      { field: 'sales' as ColorConditionField, operator: 'lt' as ColorConditionOperator, value: 1000 },
    ],
    matchAll: true,
  },
];

export function ColorPerspectiveSettings({ isOpen, onClose, colorRules, onSave }: ColorPerspectiveSettingsProps) {
  const [rules, setRules] = useState<ColorRule[]>(colorRules);

  // 当 colorRules prop 变化时，同步到内部状态
  useEffect(() => {
    setRules(colorRules);
  }, [colorRules]);

  if (!isOpen) return null;

  const handleAddRule = () => {
    const newRule: ColorRule = {
      id: `rule-${Date.now()}`,
      name: '新规则',
      color: '#10b981',
      conditions: [],
      matchAll: true,
    };
    setRules([...rules, newRule]);
  };

  const handleAddPresetRule = (template: typeof presetRuleTemplates[0]) => {
    const newRule: ColorRule = {
      id: `rule-${Date.now()}`,
      name: template.name,
      color: template.color,
      conditions: template.conditions.map((c, i) => ({
        id: `condition-${Date.now()}-${i}`,
        ...c,
      })),
      matchAll: template.matchAll,
    };
    setRules([...rules, newRule]);
  };

  const handleRemoveRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleUpdateRule = (ruleId: string, updates: Partial<ColorRule>) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  const handleAddCondition = (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    const newCondition: ColorCondition = {
      id: `condition-${Date.now()}`,
      field: 'sales',
      operator: 'gt',
      value: 1000,
    };

    handleUpdateRule(ruleId, {
      conditions: [...rule.conditions, newCondition],
    });
  };

  const handleRemoveCondition = (ruleId: string, conditionId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    handleUpdateRule(ruleId, {
      conditions: rule.conditions.filter(c => c.id !== conditionId),
    });
  };

  const handleUpdateCondition = (ruleId: string, conditionId: string, updates: Partial<ColorCondition>) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    handleUpdateRule(ruleId, {
      conditions: rule.conditions.map(c => c.id === conditionId ? { ...c, ...updates } : c),
    });
  };

  const handleSave = async () => {
    try {
      await onSave(rules);
    } catch (error) {
      console.error('保存失败:', error);
      // 不关闭弹窗，让用户看到错误
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">颜色透视设置</h2>
              <p className="text-sm text-gray-500">根据产品属性自动着色，快速识别产品状态</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Preset Templates */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">快速添加预设规则</h3>
            <div className="grid grid-cols-2 gap-2">
              {presetRuleTemplates.map((template, index) => (
                <button
                  key={index}
                  onClick={() => handleAddPresetRule(template)}
                  className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div 
                    className="w-6 h-6 rounded" 
                    style={{ backgroundColor: template.color }}
                  />
                  <span className="text-sm text-gray-700">{template.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">颜色规则列表</h3>
              <button
                onClick={handleAddRule}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FF1B82] text-white text-sm hover:bg-[#E01572] transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建规则
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Palette className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无颜色规则，点击上方按钮添加</p>
              </div>
            ) : (
              rules.map((rule) => (
                <div 
                  key={rule.id} 
                  className="border border-gray-200 rounded-xl p-4 space-y-3"
                >
                  {/* Rule Header */}
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-lg flex-shrink-0" 
                      style={{ backgroundColor: rule.color }}
                    />
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => handleUpdateRule(rule.id, { name: e.target.value })}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FF1B82]"
                      placeholder="规则名称"
                    />
                    <button
                      onClick={() => handleRemoveRule(rule.id)}
                      className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>

                  {/* Color Picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">颜色：</span>
                    <div className="flex gap-2">
                      {presetColors.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => handleUpdateRule(rule.id, { color: color.value })}
                          className={`w-6 h-6 rounded ${color.bg} ${
                            rule.color === color.value ? 'ring-2 ring-offset-2 ring-[#FF1B82]' : ''
                          }`}
                          title={color.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={rule.color}
                        onChange={(e) => handleUpdateRule(rule.id, { color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Match Type */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">匹配方式：</span>
                    <select
                      value={rule.matchAll ? 'all' : 'any'}
                      onChange={(e) => handleUpdateRule(rule.id, { matchAll: e.target.value === 'all' })}
                      className="px-3 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FF1B82]"
                    >
                      <option value="all">满足所有条件（AND）</option>
                      <option value="any">满足任一条件（OR）</option>
                    </select>
                  </div>

                  {/* Conditions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">条件：</span>
                      <button
                        onClick={() => handleAddCondition(rule.id)}
                        className="text-xs text-[#FF1B82] hover:underline"
                      >
                        + 添加条件
                      </button>
                    </div>

                    {rule.conditions.length === 0 ? (
                      <div className="text-sm text-gray-400 py-2">暂无条件</div>
                    ) : (
                      rule.conditions.map((condition) => (
                        <div key={condition.id} className="flex items-center gap-2">
                          <select
                            value={condition.field}
                            onChange={(e) => handleUpdateCondition(rule.id, condition.id, { field: e.target.value as ColorConditionField })}
                            className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#FF1B82]"
                          >
                            {Object.entries(fieldLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>

                          <select
                            value={condition.operator}
                            onChange={(e) => handleUpdateCondition(rule.id, condition.id, { operator: e.target.value as ColorConditionOperator })}
                            className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#FF1B82]"
                          >
                            {Object.entries(operatorLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>

                          <input
                            type="number"
                            value={condition.value}
                            onChange={(e) => handleUpdateCondition(rule.id, condition.id, { value: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#FF1B82]"
                          />

                          <button
                            onClick={() => handleRemoveCondition(rule.id, condition.id)}
                            className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <p className="text-sm text-gray-500">
            规则从上到下匹配，首个匹配的规则颜色会被应用
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-[#FF1B82] text-white hover:bg-[#E01572] transition-colors"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
