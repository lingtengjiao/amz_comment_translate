/**
 * ReturnRateFactors - 主要退货原因组件
 */
import { memo } from 'react';
import { TrendingDown } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { ReturnRateFactorItem } from '../types';

interface ReturnRateFactorsProps {
  data: ReturnRateFactorItem[];
}

export const ReturnRateFactors = memo(function ReturnRateFactors({ data }: ReturnRateFactorsProps) {
  // 支持数组或单对象格式
  const dataAny = data as any;
  const isArray = Array.isArray(data);
  const hasDirectFactor = !isArray && dataAny?.factor;
  
  if (!isArray && !hasDirectFactor) return null;
  if (isArray && data.length === 0) return null;
  
  const items = isArray ? data : [dataAny];

  return (
    <Card title="📉 主要退货原因" icon={TrendingDown}>
      <div className="space-y-3">
        {items.map((factor: any, i: number) => (
          <div 
            key={i} 
            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ConfidenceBadge confidence={factor.confidence} />
            </div>
            
            {/* 🔧 [FIX] 支持多种字段名作为主要内容 */}
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium">
              {factor.factor || factor.insight || factor.issue || factor.description || factor.point || ''}
            </p>
            
            {/* 次要描述信息 */}
            {factor.impact_analysis && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {factor.impact_analysis}
              </p>
            )}
            
            {factor.recommendation && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                <span className="font-medium">建议:</span> {factor.recommendation}
              </p>
            )}
            
            <EvidenceInline evidence={factor.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
