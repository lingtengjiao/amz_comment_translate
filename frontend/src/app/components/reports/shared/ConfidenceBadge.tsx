/**
 * ConfidenceBadge - 置信度徽章组件
 */
import { memo } from 'react';

interface ConfidenceBadgeProps {
  confidence?: string;
  showLabel?: boolean;
}

const config: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  high: { 
    bg: 'bg-emerald-100 dark:bg-emerald-900/30', 
    text: 'text-emerald-700 dark:text-emerald-400', 
    label: '高置信',
    icon: '✓'
  },
  medium: { 
    bg: 'bg-amber-100 dark:bg-amber-900/30', 
    text: 'text-amber-700 dark:text-amber-400', 
    label: '中置信',
    icon: '~'
  },
  low: { 
    bg: 'bg-gray-100 dark:bg-gray-700', 
    text: 'text-gray-600 dark:text-gray-400', 
    label: '低置信',
    icon: '?'
  }
};

export const ConfidenceBadge = memo(function ConfidenceBadge({ 
  confidence,
  showLabel = true 
}: ConfidenceBadgeProps) {
  if (!confidence) return null;
  
  const c = config[confidence.toLowerCase()] || config.medium;
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}
      title={`置信度: ${c.label}`}
    >
      <span>{c.icon}</span>
      {showLabel && <span>{c.label}</span>}
    </span>
  );
});
