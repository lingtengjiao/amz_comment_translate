import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { Review } from '../data/mockData';

interface ReviewInsightsProps {
  review: Review;
}

const insightTypeLabels = {
  strength: '产品优势',
  weakness: '改进空间',
  suggestion: '用户建议',
  scenario: '使用场景',
  emotion: '情感洞察'
} as const;

export function ReviewInsights({ review }: ReviewInsightsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
        <Sparkles className="size-4 text-gray-400" />
        <h4 className="text-gray-700 dark:text-gray-300">深度解读</h4>
      </button>

      {/* Insights List - Two Column Layout */}
      {isExpanded && (
        <div className="space-y-4">
          {review.insights.map((insight, index) => (
            <div key={index}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Original Quote - Bilingual */}
                <div className="text-right space-y-1">
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
                <div className="h-px bg-gray-200 dark:bg-gray-700 mt-4" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}