/**
 * AssemblyDefects - 组装问题板块
 */
import { memo } from 'react';
import { Wrench } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';

interface AssemblyDefectItem {
  issue?: string;
  defect?: string;
  description?: string;
  content?: string;
  severity?: string;
  confidence?: string;
  evidence?: Array<{ review_id?: string; quote?: string }>;
}

interface AssemblyDefectsProps {
  data: AssemblyDefectItem[] | { issues?: AssemblyDefectItem[] } | null | undefined;
}

export const AssemblyDefects = memo(function AssemblyDefects({ data }: AssemblyDefectsProps) {
  if (!data) return null;

  // 处理可能的数据格式
  let items: AssemblyDefectItem[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data.issues && Array.isArray(data.issues)) {
    items = data.issues;
  }

  if (items.length === 0) return null;

  return (
    <Card title="🔧 组装问题" icon={Wrench} variant="danger">
      <ul className="space-y-3">
        {items.map((item, i) => {
          const text = String(item.issue || item.defect || item.description || item.content || '');
          const severity = item.severity || '';
          const confidence = item.confidence || '';
          const evidence = item.evidence || [];

          return (
            <li key={i} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{text}</span>
                {severity && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    severity === 'high' || severity === 'critical' 
                      ? 'bg-red-200 dark:bg-red-800/50 text-red-700 dark:text-red-300'
                      : severity === 'medium'
                      ? 'bg-amber-200 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {severity === 'high' || severity === 'critical' ? '严重' : severity === 'medium' ? '中等' : '轻微'}
                  </span>
                )}
                {confidence && <ConfidenceBadge confidence={confidence} />}
              </div>
              {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
});
