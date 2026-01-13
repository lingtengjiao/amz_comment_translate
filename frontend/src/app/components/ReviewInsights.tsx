import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { Review } from '../data/mockData';

interface ReviewInsightsProps {
  review: Review;
  expanded?: boolean; // 全局控制的展开状态
}

const insightTypeLabels = {
  strength: '产品优势',
  weakness: '改进空间',
  suggestion: '用户建议',
  scenario: '使用场景',
  emotion: '情感洞察'
} as const;

export function ReviewInsights({ review, expanded = true }: ReviewInsightsProps) {
  // 本地展开状态，默认跟随全局设置
  const [isExpanded, setIsExpanded] = useState(expanded);

  // 当全局展开状态变化时，同步本地状态
  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded]);

  if (!review.insights || review.insights.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 mb-4 group hover:opacity-70 transition-opacity"
      >
        {isExpanded ? (
          <ChevronDown className="size-4 text-gray-400" />
        ) : (
          <ChevronRight className="size-4 text-gray-400" />
        )}
        <Sparkles className="size-4 text-amber-500" />
        <h4 className="text-gray-700 dark:text-gray-300 font-medium">深度解读</h4>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ({review.insights.length} 条洞察)
        </span>
      </button>

      {/* Insights List - Two Column Layout */}
      {isExpanded && (
        <div className="space-y-4 p-4 bg-rose-50/50 dark:bg-rose-900/10 rounded-lg border border-rose-100 dark:border-rose-800/30">
          {review.insights.map((insight, index) => (
            <div key={index}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Original Quote - Bilingual */}
                <div className="text-right space-y-1">
                  {/* Dimension Tag */}
                  {insight.dimension && (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 mb-1">
                      {insight.dimension}
                    </span>
                  )}
                  {/* Chinese Translation (if available) */}
                  {insight.quoteTranslated && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      "{insight.quoteTranslated}"
                    </p>
                  )}
                  {/* English Original */}
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic leading-relaxed">
                    "{insight.quote}"
                  </p>
                </div>

                {/* Right: Analysis (left-aligned towards center) */}
                <div>
                  <p className="text-gray-900 dark:text-gray-100 leading-relaxed">
                    {insight.analysis}
                  </p>
                </div>
              </div>
              
              {/* Divider between insights */}
              {index < review.insights.length - 1 && (
                <div className="h-px bg-rose-200/50 dark:bg-rose-700/30 mt-4" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
