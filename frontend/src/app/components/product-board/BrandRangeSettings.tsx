import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export interface BrandRange {
  id: string;
  name: string;
  brands: string[];
}

interface BrandRangeSettingsProps {
  isOpen: boolean;
  brandRanges: BrandRange[];
  onSave: (ranges: BrandRange[]) => void;
  onClose: () => void;
}

export function BrandRangeSettings({ isOpen, brandRanges, onSave, onClose }: BrandRangeSettingsProps) {
  const [ranges, setRanges] = useState<BrandRange[]>([...brandRanges]);

  // 当 brandRanges prop 变化时，同步到内部状态
  useEffect(() => {
    setRanges([...brandRanges]);
  }, [brandRanges]);

  if (!isOpen) return null;

  const handleAddRange = () => {
    const newRange: BrandRange = {
      id: `brand-${Date.now()}`,
      name: '新品牌分组',
      brands: [],
    };
    setRanges([...ranges, newRange]);
  };

  const handleUpdateRange = (id: string, updates: Partial<BrandRange>) => {
    setRanges(ranges.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleDeleteRange = (id: string) => {
    if (ranges.length <= 1) {
      alert('至少需要保留一个品牌分组');
      return;
    }
    setRanges(ranges.filter(r => r.id !== id));
  };

  const handleSave = async () => {
    for (const range of ranges) {
      if (!range.name.trim()) {
        alert('请填写所有品牌分组的名称');
        return;
      }
    }
    try {
      await onSave(ranges);
    } catch (error) {
      console.error('保存失败:', error);
      // 不关闭弹窗，让用户看到错误
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">自定义品牌分组</h3>
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
                      <label className="text-xs text-gray-500 mb-1 block">分组名称</label>
                      <input
                        type="text"
                        value={range.name}
                        onChange={(e) => handleUpdateRange(range.id, { name: e.target.value })}
                        className="w-full border border-gray-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                        placeholder="例如：苹果"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">品牌列表（逗号分隔）</label>
                      <input
                        type="text"
                        value={range.brands.join(', ')}
                        onChange={(e) => handleUpdateRange(range.id, { 
                          brands: e.target.value.split(',').map(b => b.trim()).filter(b => b)
                        })}
                        className="w-full border border-gray-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                        placeholder="例如：Apple, iPhone, MacBook"
                      />
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
            <span className="text-sm font-medium">添加品牌分组</span>
          </button>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              💡 提示：在品牌列表中输入要归入该分组的品牌名称，用逗号分隔。系统会将匹配的产品自动归类。
            </p>
          </div>
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
