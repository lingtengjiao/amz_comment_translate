/**
 * CompareDimensionInsight - 维度洞察卡片
 * 
 * 功能：展示单个维度的共性特征、差异特点、定位洞察
 */
import { memo } from 'react';
import { TrendingUp, Users, Zap, Target } from 'lucide-react';
import type { DimensionInsight } from '@/api/types';

interface CompareDimensionInsightProps {
  dimension: string;
  insight: DimensionInsight;
  color: string;
}

export const CompareDimensionInsight = memo(({ dimension, insight, color }: CompareDimensionInsightProps) => {
  if (!insight) return null;
  
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border-2 border-gray-200 dark:border-gray-700">
      {/* 标题 */}
      <div className="flex items-start gap-3 mb-5">
        <div className="flex-shrink-0">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ backgroundColor: `${color}15` }}
          >
            <TrendingUp className="w-5 h-5" style={{ color }} />
          </div>
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base">
            {dimension} - 维度洞察
          </h4>
        </div>
      </div>

      <div className="space-y-5">
        {/* 共性特征 */}
        {insight.commonality && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide">
                共性特征
              </h5>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {insight.commonality}
            </p>
          </div>
        )}

        {/* 分隔线 */}
        {insight.differences && insight.differences.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700" />
        )}

        {/* 差异特点 */}
        {insight.differences && insight.differences.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <h5 className="text-xs font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wide">
                差异特点
              </h5>
            </div>
            <div className="flex flex-wrap gap-2">
              {insight.differences.map((diff, index) => (
                <div 
                  key={index}
                  className="inline-flex items-start gap-2 px-3 py-2 rounded-lg text-sm leading-relaxed bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 border border-gray-200 dark:border-gray-700"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs font-bold mt-0.5">
                    {diff.product}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">{diff.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 分隔线 */}
        {insight.positioning && insight.positioning.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700" />
        )}

        {/* 定位洞察 */}
        {insight.positioning && insight.positioning.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <h5 className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wide">
                定位洞察
              </h5>
            </div>
            <div className="flex flex-wrap gap-2">
              {insight.positioning.map((pos, index) => (
                <div 
                  key={index}
                  className="inline-flex items-start gap-2 px-3 py-2 rounded-lg text-sm leading-relaxed bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded bg-purple-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">
                    {pos.product}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200 font-medium">{pos.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CompareDimensionInsight.displayName = 'CompareDimensionInsight';

