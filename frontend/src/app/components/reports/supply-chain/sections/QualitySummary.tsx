/**
 * QualitySummary - 质量评估概况组件
 */
import { memo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { QualitySummary as QualitySummaryType } from '../types';

interface QualitySummaryProps {
  data: QualitySummaryType;
}

export const QualitySummary = memo(function QualitySummary({ data }: QualitySummaryProps) {
  if (!data) return null;

  // 检查是否有评分数据
  const hasScoreData = data.overall_quality_score !== undefined || data.estimated_return_rate !== undefined;

  return (
    <Card title="📊 质量评估概况" icon={TrendingUp} variant="info">
      {/* 评分卡片 - 仅在数据存在时显示 */}
      {hasScoreData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {data.overall_quality_score !== undefined && (
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">
                {data.overall_quality_score}
              </div>
              <div className="text-xs text-gray-500">质量评分</div>
            </div>
          )}
          {data.estimated_return_rate !== undefined && (
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {data.estimated_return_rate}
              </div>
              <div className="text-xs text-gray-500">预估退货率</div>
            </div>
          )}
        </div>
      )}

      {/* 摘要文本 - 支持 summary 或 issue 字段 */}
      {(data.summary || (data as any).issue) && (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-gray-900 dark:text-white">质量总结</span>
            <ConfidenceBadge confidence={data.confidence} />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{data.summary || (data as any).issue}</p>
        </div>
      )}

      {/* 主要质量问题 */}
      {data.top_quality_issues && data.top_quality_issues.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">主要质量问题:</div>
          <div className="flex flex-wrap gap-2">
            {data.top_quality_issues.map((issue, i) => (
              <span 
                key={i} 
                className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs"
              >
                {issue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 优先改进方向 */}
      {data.improvement_priority && (
        <div className="mt-3 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded text-sm text-emerald-700 dark:text-emerald-400">
          💡 优先改进方向: {data.improvement_priority}
        </div>
      )}

      {/* 证据 */}
      {data.evidence && <EvidenceInline evidence={data.evidence} />}
    </Card>
  );
});
