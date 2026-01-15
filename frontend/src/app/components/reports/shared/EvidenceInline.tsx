/**
 * EvidenceInline - 简化版证据显示组件
 */
import { memo } from 'react';
import { Search } from 'lucide-react';

interface EvidenceItem {
  review_id?: string | null;
  quote?: string;
}

interface ParsedEvidence {
  count?: number;
  percentage?: string;
  quotes?: string[];
}

// 解析 evidence 为统一格式
function parseEvidence(evidence: unknown): ParsedEvidence | null {
  if (!evidence) return null;
  
  // 如果是数组格式（新格式）
  if (Array.isArray(evidence)) {
    const quotes = evidence
      .filter((e): e is EvidenceItem => typeof e === 'object' && e !== null)
      .map(e => e.quote || '')
      .filter(q => q.length > 0);
    return {
      count: evidence.length,
      quotes
    };
  }
  
  // 如果是对象格式
  if (typeof evidence === 'object' && evidence !== null) {
    const obj = evidence as Record<string, unknown>;
    return {
      count: typeof obj.count === 'number' ? obj.count : undefined,
      percentage: typeof obj.percentage === 'string' ? obj.percentage : undefined,
      quotes: Array.isArray(obj.sample_quotes) ? obj.sample_quotes as string[] : undefined
    };
  }
  
  // 如果是字符串，尝试解析
  if (typeof evidence === 'string') {
    const result: ParsedEvidence = {};
    const countMatch = evidence.match(/count:\s*(\d+)/);
    if (countMatch) result.count = parseInt(countMatch[1]);
    const percentMatch = evidence.match(/percentage:\s*([\d.]+%)/);
    if (percentMatch) result.percentage = percentMatch[1];
    return result;
  }
  
  return null;
}

interface EvidenceInlineProps {
  evidence?: unknown;
}

export const EvidenceInline = memo(function EvidenceInline({ evidence }: EvidenceInlineProps) {
  const parsed = parseEvidence(evidence);
  
  if (!parsed || (!parsed.count && !parsed.quotes?.length)) return null;
  
  return (
    <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
      <div className="flex items-center gap-1 mb-1">
        <Search className="size-3" />
        <span className="font-medium">
          📊 {parsed.count || parsed.quotes?.length || 0}条证据 
          {parsed.percentage && `(${parsed.percentage})`}
        </span>
      </div>
      {parsed.quotes && parsed.quotes.length > 0 && (
        <div className="space-y-1">
          {parsed.quotes.slice(0, 2).map((quote, i) => (
            <div key={i} className="text-gray-600 dark:text-gray-400 italic pl-2 border-l-2 border-blue-200 dark:border-blue-700">
              💬 "{quote.length > 60 ? quote.slice(0, 60) + '...' : quote}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
