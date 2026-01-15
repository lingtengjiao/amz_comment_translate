/**
 * MaterialDefects - 材质做工问题组件
 */
import { memo } from 'react';
import { Wrench } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { MaterialDefects as MaterialDefectsType } from '../types';

interface MaterialDefectsProps {
  data: MaterialDefectsType;
}

export const MaterialDefects = memo(function MaterialDefects({ data }: MaterialDefectsProps) {
  // 支持两种格式：{ issues: [...] } 或直接 { issue: "...", evidence: [...] }
  const dataAny = data as any;
  const hasIssuesArray = data?.issues && Array.isArray(data.issues) && data.issues.length > 0;
  const hasDirectIssue = dataAny?.issue;
  
  if (!hasIssuesArray && !hasDirectIssue) return null;

  // 如果是直接对象格式，转换为数组
  const issues = hasIssuesArray ? data.issues : [dataAny];

  return (
    <Card title="🔧 材质做工问题" icon={Wrench} variant="danger">
      <div className="space-y-4">
        {issues.map((defect: any, i: number) => (
          <div 
            key={i} 
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <ConfidenceBadge confidence={defect.confidence} />
              </div>
            </div>
            
            {/* 🔧 [FIX] 支持多种字段名：issue, insight, description, defect */}
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {defect.issue || defect.insight || defect.description || defect.defect || ''}
            </p>
            
            {defect.impact && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span className="font-medium">影响分析:</span> {defect.impact}
              </p>
            )}
            
            <EvidenceInline evidence={defect.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
