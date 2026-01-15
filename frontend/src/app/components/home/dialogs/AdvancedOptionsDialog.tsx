/**
 * 高级选项对话框 - 爬取配置 - 1:1 复刻原始设计
 */
import { Check, Settings, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { useHome } from '../HomeContext';

// 从 localStorage 获取/设置插件 ID
const getExtensionId = (): string => {
  return localStorage.getItem('voc_extension_id') || '';
};

const setExtensionId = (id: string) => {
  localStorage.setItem('voc_extension_id', id);
};

export function AdvancedOptionsDialog() {
  const {
    showAdvancedOptionsDialog,
    setShowAdvancedOptionsDialog,
    crawlMode,
    setCrawlMode,
    crawlPages,
    setCrawlPages,
    crawlRating,
    setCrawlRating,
  } = useHome();

  const [extensionId, setExtensionIdState] = useState('');

  // 加载保存的插件 ID
  useEffect(() => {
    setExtensionIdState(getExtensionId());
  }, [showAdvancedOptionsDialog]);

  // 恢复默认值
  const resetToDefaults = () => {
    setCrawlMode("stable");
    setCrawlPages(5);
    setCrawlRating([1, 2, 3, 4, 5]);
  };

  // 保存设置
  const handleConfirm = () => {
    // 保存插件 ID
    setExtensionId(extensionId.trim());
    setShowAdvancedOptionsDialog(false);
  };

  return (
    <Dialog open={showAdvancedOptionsDialog} onOpenChange={setShowAdvancedOptionsDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            高级选项
          </DialogTitle>
          <DialogDescription>
            自定义数据采集的参数，优化分析结果
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Extension ID Configuration */}
          <div>
            <label className="text-sm font-medium text-slate-900 mb-3 block">
              Chrome 扩展 ID <span className="text-rose-600">*</span>
            </label>
            <Input
              type="text"
              value={extensionId}
              onChange={(e) => setExtensionIdState(e.target.value)}
              placeholder="请输入 Chrome 扩展的 ID（例如：abcdefghijklmnopqrstuvwxyz123456）"
              className="w-full"
            />
            <div className="mt-2 text-xs text-slate-500 px-1">
              <p className="mb-1">💡 如何获取扩展 ID：</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>打开 Chrome，输入 <code className="bg-slate-100 px-1 py-0.5 rounded">chrome://extensions</code></li>
                <li>启用右上角的"开发者模式"</li>
                <li>找到"洞察大王采集助手"扩展，复制其 ID</li>
              </ol>
            </div>
          </div>

          {/* Crawl Mode */}
          <div>
            <label className="text-sm font-medium text-slate-900 mb-3 block">采集模式</label>
            <div className="flex gap-3">
              <button
                onClick={() => setCrawlMode("fast")}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                  crawlMode === "fast"
                    ? "bg-rose-50 border-rose-500 text-rose-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold mb-1">⚡ 快速模式</div>
                <div className="text-xs text-slate-500">爬取速度快</div>
              </button>
              <button
                onClick={() => setCrawlMode("stable")}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                  crawlMode === "stable"
                    ? "bg-rose-50 border-rose-500 text-rose-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold mb-1">🎯 稳定模式</div>
                <div className="text-xs text-slate-500">爬取更加安全</div>
              </button>
            </div>
          </div>

          {/* Pages Per Rating */}
          <div>
            <label className="text-sm font-medium text-slate-900 mb-3 block">每星级采集页数</label>
            <div className="flex gap-3">
              {[
                { value: 3, label: '3 页', desc: '快速分析' },
                { value: 5, label: '5 页', desc: '推荐' },
                { value: 10, label: '10 页', desc: '深度分析' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setCrawlPages(option.value as 3 | 5 | 10)}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                    crawlPages === option.value
                      ? "bg-rose-50 border-rose-500 text-rose-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold mb-1">{option.label}</div>
                  <div className="text-xs text-slate-500">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Rating Filter - 紧凑横向样式 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-900">星级筛选</label>
              <button
                onClick={() => {
                  if (crawlRating.length === 5) {
                    setCrawlRating([]);
                  } else {
                    setCrawlRating([1, 2, 3, 4, 5]);
                  }
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium"
              >
                {crawlRating.length === 5 ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="flex gap-2">
              {[5, 4, 3, 2, 1].map((star) => (
                <button
                  key={star}
                  onClick={() => {
                    if (crawlRating.includes(star)) {
                      setCrawlRating(crawlRating.filter(r => r !== star));
                    } else {
                      setCrawlRating([...crawlRating, star].sort((a, b) => b - a));
                    }
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border-2 flex flex-col items-center gap-1 ${
                    crawlRating.includes(star)
                      ? "bg-amber-50 border-amber-400 text-amber-700"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center">
                    <Star className={`w-4 h-4 ${crawlRating.includes(star) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  </div>
                  <span className="text-xs">{star}星</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="flex-1"
          >
            恢复默认
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

