import { Plus, Sparkles, X, Tag, Loader2 } from 'lucide-react';
import { type ThemeTag } from './ThemeHighlight';
import { memo } from 'react';

interface ThemeTagBarProps {
  allTags: ThemeTag[]; // 所有标签（预设 + 自定义）
  activeThemes: string[];
  onToggleTheme: (themeId: string) => void;
  onAddCustomTag: () => void;
}

export const ThemeTagBar = memo(function ThemeTagBar({ allTags, activeThemes, onToggleTheme, onAddCustomTag }: ThemeTagBarProps) {
  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">主题标签高亮</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            点击标签在评论中高亮对应内容
          </span>
        </div>
        
        {/* Add Custom Tag Button */}
        <button
          onClick={onAddCustomTag}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="size-4" />
          添加标签
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {allTags.map(tag => {
          const isActive = activeThemes.includes(tag.id);
          const isDisabled = tag.isProcessing;
          
          return (
            <button
              key={tag.id}
              onClick={() => !isDisabled && onToggleTheme(tag.id)}
              disabled={isDisabled}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                ${isDisabled 
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60' 
                  : isActive 
                    ? `${tag.bgColor} ${tag.color} ${tag.darkBgColor} ${tag.darkTextColor} ring-2 ring-offset-1 ring-current shadow-sm` 
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
              title={tag.isProcessing ? 'AI 正在分析中...' : tag.label}
            >
              <span className="flex items-center gap-1.5">
                {tag.isProcessing && (
                  <Loader2 className="size-3 animate-spin" />
                )}
                {tag.label}
                {isActive && !isDisabled && (
                  <span className="inline-block size-1.5 rounded-full bg-current animate-pulse" />
                )}
              </span>
            </button>
          );
        })}
      </div>
      
      {activeThemes.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            已激活 {activeThemes.length} 个主题标签
          </p>
          <button
            onClick={() => {
              activeThemes.forEach(id => onToggleTheme(id));
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            清除全部
          </button>
        </div>
      )}
    </div>
  );
});