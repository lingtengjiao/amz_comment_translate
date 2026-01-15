/**
 * MissingParts - 常见漏发配件组件
 */
import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { MissingPartItem } from '../types';

interface MissingPartsProps {
  data: MissingPartItem[];
}

export const MissingParts = memo(function MissingParts({ data }: MissingPartsProps) {
  // 支持数组或单对象格式
  const dataAny = data as any;
  const isArray = Array.isArray(data);
  const hasDirectPart = !isArray && dataAny?.part;
  
  if (!isArray && !hasDirectPart) return null;
  if (isArray && data.length === 0) return null;
  
  const items = isArray ? data : [dataAny];

  return (
    <Card title="📋 常见漏发配件" icon={AlertCircle} variant="warning">
      <div className="space-y-3">
        {items.map((part: any, i: number) => (
          <div 
            key={i} 
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* 🔧 [FIX] 支持多种字段名 */}
              <span className="font-medium text-gray-900 dark:text-white">
                {part.part || part.issue || part.insight || part.description || part.point || ''}
              </span>
              <ConfidenceBadge confidence={part.confidence} />
            </div>
            
            {part.impact_analysis && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span className="font-medium">影响分析:</span> {part.impact_analysis}
              </p>
            )}
            
            <EvidenceInline evidence={part.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
