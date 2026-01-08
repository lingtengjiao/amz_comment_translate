/**
 * CompareDimensionRow - 维度对比行
 * 
 * 功能：展示单个维度下各产品的标签数据，支持占比统计
 */
import { memo } from 'react';
import { LucideIcon, MessageSquare, Sparkles } from 'lucide-react';
import type { LabelDescItem } from '@/api/types';

interface ProductData {
  id: number;
  tags: LabelDescItem[];
}

interface CompareDimensionRowProps {
  dimension: string;
  dimensionKey: string;
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  products: ProductData[];
  onReviewClick?: (productId: number, tag: LabelDescItem) => void;
}

export const CompareDimensionRow = memo(({ 
  dimension, 
  dimensionKey,
  icon: Icon, 
  iconColor, 
  bgColor, 
  products,
  onReviewClick 
}: CompareDimensionRowProps) => {
  return (
    <div 
      className="grid gap-3" 
      style={{ gridTemplateColumns: `180px repeat(${products.length}, 1fr)` }}
    >
      {/* 维度标签 */}
      <div className={`rounded-xl p-3 flex flex-col justify-center shadow-sm border ${bgColor}`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center flex-shrink-0">
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <h3 className={`font-bold ${iconColor} text-sm leading-tight`}>{dimension}</h3>
        </div>
      </div>

      {/* 产品标签列表 */}
      {products.map((product) => {
        // 计算总数用于百分比
        const totalCount = product.tags.reduce((sum, tag) => sum + (tag.count || 0), 0);
        
        return (
          <div 
            key={product.id}
            className="bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border-2 border-gray-200 dark:border-gray-700"
          >
            <div className="space-y-2.5">
              {product.tags.map((tag, index) => {
                const percentage = totalCount > 0 ? Math.round(((tag.count || 0) / totalCount) * 100) : 0;
                const isTopThree = index < 3;
                
                return (
                  <div 
                    key={index}
                    className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                      isTopThree 
                        ? 'bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/30' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {/* 排名徽章 */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
                      isTopThree 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      <span className="text-[10px] font-bold">{index + 1}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {/* 标题和评论数按钮 */}
                      <div className="flex items-center justify-between gap-2 mb-1 h-6">
                        <h4 className={`text-sm leading-tight flex-1 truncate ${
                          isTopThree 
                            ? 'font-bold text-gray-900 dark:text-gray-100' 
                            : 'font-semibold text-gray-900 dark:text-gray-100'
                        }`}>
                          {tag.label}
                        </h4>
                        {tag.is_inferred ? (
                          // 智能推断标签 - 不可点击
                          <span
                            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md"
                            title="此条目由AI根据其他维度智能推断生成，无原始评论关联"
                          >
                            <Sparkles className="w-3 h-3 text-white" />
                            <span className="text-xs font-bold text-white">智能推断</span>
                          </span>
                        ) : tag.count !== undefined && tag.count > 0 && onReviewClick ? (
                          // 有评论数据 - 可点击查看
                          <button
                            onClick={() => onReviewClick(product.id, tag)}
                            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded-md transition-colors group cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3 text-white" />
                            <span className="text-xs font-bold text-white">{tag.count}</span>
                          </button>
                        ) : null}
                      </div>
                      
                      {/* 描述 */}
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-2 line-clamp-2 h-8">
                        {tag.desc}
                      </p>
                      
                      {/* 占比进度条 */}
                      {totalCount > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gray-300 dark:bg-gray-600 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">
                            {percentage}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {/* 无数据提示 */}
              {product.tags.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  暂无数据
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

CompareDimensionRow.displayName = 'CompareDimensionRow';

