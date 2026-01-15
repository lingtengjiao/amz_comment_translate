/**
 * PackagingIssues - 包装与物流问题组件
 */
import { memo } from 'react';
import { Package } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { PackagingIssues as PackagingIssuesType } from '../types';

interface PackagingIssuesProps {
  data: PackagingIssuesType;
}

export const PackagingIssues = memo(function PackagingIssues({ data }: PackagingIssuesProps) {
  // 支持两种格式：{ issues: [...] } 或直接 { issue: "...", evidence: [...] }
  const dataAny = data as any;
  const hasIssuesArray = data?.issues && Array.isArray(data.issues) && data.issues.length > 0;
  const hasDirectIssue = dataAny?.issue;
  
  if (!hasIssuesArray && !hasDirectIssue) return null;

  const issues = hasIssuesArray ? data.issues : [dataAny];

  return (
    <Card title="📦 包装与物流" icon={Package} variant="warning">
      <div className="space-y-3">
        {issues.map((issue: any, i: number) => (
          <div 
            key={i} 
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ConfidenceBadge confidence={issue.confidence} />
            </div>
            
            {/* 🔧 [FIX] 支持多种字段名 */}
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {issue.issue || issue.insight || issue.description || issue.point || ''}
            </p>
            
            {issue.impact && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span className="font-medium">影响分析:</span> {issue.impact}
              </p>
            )}
            
            <EvidenceInline evidence={issue.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
