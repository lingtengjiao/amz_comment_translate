/**
 * QCChecklist - 出货前 QC 检查清单组件
 */
import { memo } from 'react';
import { Shield } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { QCChecklistItem } from '../types';

interface QCChecklistProps {
  data: QCChecklistItem[];
}

export const QCChecklist = memo(function QCChecklist({ data }: QCChecklistProps) {
  if (!data || data.length === 0) return null;

  return (
    <Card title="✅ 出货前 QC 检查清单" icon={Shield} variant="info">
      <div className="space-y-3">
        {data.map((item, i) => (
          <div 
            key={i} 
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-start gap-2 mb-2">
              <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.issue}
                  </span>
                  <ConfidenceBadge confidence={item.confidence} />
                </div>
                
                {item.suggestion && (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                    <span className="font-medium">建议:</span> {item.suggestion}
                  </p>
                )}
              </div>
            </div>
            
            <EvidenceInline evidence={item.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
