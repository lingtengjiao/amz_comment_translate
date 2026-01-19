import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export interface YearRange {
  id: string;
  name: string;
  min: number;
  max: number;
}

interface YearRangeSettingsProps {
  isOpen: boolean;
  yearRanges: YearRange[];
  onSave: (ranges: YearRange[]) => void;
  onClose: () => void;
}

export function YearRangeSettings({ isOpen, yearRanges, onSave, onClose }: YearRangeSettingsProps) {
  const [ranges, setRanges] = useState<YearRange[]>([...yearRanges]);

  // 当 yearRanges prop 变化时，同步到内部状态
  useEffect(() => {
    setRanges([...yearRanges]);
  }, [yearRanges]);

  if (!isOpen) return null;

  const handleAddRange = () => {
    const currentYear = new Date().getFullYear();
    const newRange: YearRange = {
      id: `year-${Date.now()}`,
      name: '新年份区间',
      min: currentYear - 1,
      max: currentYear,
    };
    setRanges([...ranges, newRange]);
  };

  const handleUpdateRange = (id: string, updates: Partial<YearRange>) => {
    setRanges(ranges.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleDeleteRange = (id: string) => {
    if (ranges.length <= 1) {
      alert('至少需要保留一个年份区间');
      return;
    }
    setRanges(ranges.filter(r => r.id !== id));
  };

  const handleSave = async () => {
    for (const range of ranges) {
      if (!range.name.trim()) {
        alert('请填写所有年份区间的名称');
        return;
      }
      if (range.max !== Infinity && range.max < range.min) {
        alert('最大年份必须大于等于最小年份');
        return;
      }
    }
    const sortedRanges = [...ranges].sort((a, b) => a.min - b.min);
    try {
      await onSave(sortedRanges);
    } catch (error) {
      console.error('保存失败:', error);
      // 不关闭弹窗，让用户看到错误
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">自定义年份区间</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {ranges.map((range) => (
              <div key={range.id} className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100 hover:border-gray-200 transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">区间名称</label>
                      <input
                        type="text"
                        value={range.name}
                        onChange={(e) => handleUpdateRange(range.id, { name: e.target.value })}
                        className="w-full border border-gray-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                        placeholder="例如：2023-2024"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">起始年份</label>
                        <input
                          type="text"
                          value={range.min}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '' || /^\d+$/.test(value)) {
                              handleUpdateRange(range.id, { min: value === '' ? 2000 : Number(value) });
                            }
                          }}
                          className="w-full border border-gray-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                          placeholder="2000"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">结束年份</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={range.max === Infinity ? '' : range.max}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              if (value === '' || /^\d+$/.test(value)) {
                                handleUpdateRange(range.id, { 
                                  max: value === '' ? Infinity : Number(value) 
                                });
                              }
                            }}
                            className="flex-1 border border-gray-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                            placeholder="无上限"
                          />
                          {range.max === Infinity && (
                            <span className="text-xs text-gray-400 flex-shrink-0">∞</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRange(range.id)}
                    className="p-2 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 mt-6"
                    disabled={ranges.length <= 1}
                  >
                    <Trash2 className={`w-4 h-4 ${ranges.length <= 1 ? 'text-gray-300' : 'text-red-500'}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddRange}
            className="w-full mt-4 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-gray-600"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">添加年份区间</span>
          </button>
        </div>

        <div className="flex gap-3 justify-end p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 text-white rounded-full shadow-md hover:shadow-lg transition-all"
            style={{ backgroundColor: '#FF1B82' }}
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
