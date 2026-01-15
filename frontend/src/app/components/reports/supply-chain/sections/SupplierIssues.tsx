/**
 * SupplierIssues - 供应商问题组件
 */
import { memo } from 'react';
import { Package } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { SupplierIssueItem } from '../types';

interface SupplierIssuesProps {
  data: SupplierIssueItem[];
}

export const SupplierIssues = memo(function SupplierIssues({ data }: SupplierIssuesProps) {
  // 支持数组或单对象格式
  const dataAny = data as any;
  const isArray = Array.isArray(data);
  const hasDirectIssue = !isArray && dataAny?.issue;
  
  if (!isArray && !hasDirectIssue) return null;
  if (isArray && data.length === 0) return null;
  
  const items = isArray ? data : [dataAny];

  return (
    <Card title="🏭 供应商问题" icon={Package}>
      <div className="space-y-3">
        {items.map((issue: any, i: number) => (
          <div 
            key={i} 
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ConfidenceBadge confidence={issue.confidence} />
            </div>
            
            {/* 🔧 [FIX] 支持多种字段名作为主要内容 */}
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium">
              {issue.issue || issue.insight || issue.description || issue.point || ''}
            </p>
            
            {/* 次要描述信息 */}
            {issue.impact_analysis && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {issue.impact_analysis}
              </p>
            )}
            
            {issue.recommendation && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                <span className="font-medium">建议:</span> {issue.recommendation}
              </p>
            )}
            
            <EvidenceInline evidence={issue.evidence} />
          </div>
        ))}
      </div>
    </Card>
  );
});
