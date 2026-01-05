import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

interface AddThemeTagModalProps {
  onClose: () => void;
  onConfirm: (label: string, question: string, color: string) => void;
}

const colorOptions = [
  { name: '蓝色', value: 'blue', bg: 'bg-blue-100/90', text: 'text-blue-900', darkBg: 'dark:bg-blue-500/30', darkText: 'dark:text-blue-200', preview: 'bg-blue-500' },
  { name: '紫色', value: 'purple', bg: 'bg-purple-100/90', text: 'text-purple-900', darkBg: 'dark:bg-purple-500/30', darkText: 'dark:text-purple-200', preview: 'bg-purple-500' },
  { name: '绿色', value: 'green', bg: 'bg-green-100/90', text: 'text-green-900', darkBg: 'dark:bg-green-500/30', darkText: 'dark:text-green-200', preview: 'bg-green-500' },
  { name: '红色', value: 'red', bg: 'bg-red-100/90', text: 'text-red-900', darkBg: 'dark:bg-red-500/30', darkText: 'dark:text-red-200', preview: 'bg-red-500' },
  { name: '橙色', value: 'orange', bg: 'bg-orange-100/90', text: 'text-orange-900', darkBg: 'dark:bg-orange-500/30', darkText: 'dark:text-orange-200', preview: 'bg-orange-500' },
  { name: '翠绿色', value: 'emerald', bg: 'bg-emerald-100/90', text: 'text-emerald-900', darkBg: 'dark:bg-emerald-500/30', darkText: 'dark:text-emerald-200', preview: 'bg-emerald-500' },
  { name: '琥珀色', value: 'amber', bg: 'bg-amber-100/90', text: 'text-amber-900', darkBg: 'dark:bg-amber-500/30', darkText: 'dark:text-amber-200', preview: 'bg-amber-500' },
  { name: '粉色', value: 'pink', bg: 'bg-pink-100/90', text: 'text-pink-900', darkBg: 'dark:bg-pink-500/30', darkText: 'dark:text-pink-200', preview: 'bg-pink-500' },
  { name: '靛蓝色', value: 'indigo', bg: 'bg-indigo-100/90', text: 'text-indigo-900', darkBg: 'dark:bg-indigo-500/30', darkText: 'dark:text-indigo-200', preview: 'bg-indigo-500' },
  { name: '青色', value: 'cyan', bg: 'bg-cyan-100/90', text: 'text-cyan-900', darkBg: 'dark:bg-cyan-500/30', darkText: 'dark:text-cyan-200', preview: 'bg-cyan-500' },
];

export function AddThemeTagModal({ onClose, onConfirm }: AddThemeTagModalProps) {
  const [label, setLabel] = useState('');
  const [question, setQuestion] = useState('');
  const [selectedColor, setSelectedColor] = useState(colorOptions[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim() && question.trim()) {
      onConfirm(label.trim(), question.trim(), selectedColor.value);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">添加自定义标签</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Label Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              标签名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：产品使用场景"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              required
            />
          </div>

          {/* Question/Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AI 提问（用于识别内容） <span className="text-red-500">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="例如：在评论中识别用户使用产品的具体场景，如家里、办公室、户外等"
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent resize-none"
              required
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              描述你希望 AI 在评论中识别和高亮的内容类型
            </p>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              标签颜色 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-5 gap-3">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`
                    relative h-12 rounded-lg border-2 transition-all
                    ${selectedColor.value === color.value
                      ? 'border-gray-900 dark:border-white scale-105 shadow-md'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }
                  `}
                  title={color.name}
                >
                  <div className={`h-full w-full rounded-md ${color.preview}`} />
                  {selectedColor.value === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="size-5 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
                        <div className="size-2 bg-gray-900 dark:bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {label && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                预览效果
              </label>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedColor.bg} ${selectedColor.text} ${selectedColor.darkBg} ${selectedColor.darkText}`}>
                  {label}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!label.trim() || !question.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              确认并运行 AI 分析
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
