/**
 * UsageContextAnalysis - 使用场景与质量需求组件
 */
import { memo } from 'react';
import { Users } from 'lucide-react';
import { Card, ConfidenceBadge, EvidenceInline } from '../../shared';
import type { UsageContextItem } from '../types';

interface UsageContextAnalysisProps {
  data: UsageContextItem[];
}

// 获取标签类型和对应颜色
function getLabelConfig(item: any): { type: string; color: string } | null {
  if (item.who || item.buyer) return { type: '购买者 (Who)', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' };
  if (item.user) return { type: '使用者', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' };
  if (item.what) return { type: '用户任务 (What)', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' };
  if (item.where) return { type: '使用地点 (Where)', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' };
  if (item.when) return { type: '使用时机 (When)', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' };
  if (item.why || item.motivation) return { type: '购买原因 (Why)', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' };
  if (item.scenario) return { type: '使用场景', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
  if (item.aspect) return { type: item.aspect, color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' };
  return null;
}

export const UsageContextAnalysis = memo(function UsageContextAnalysis({ data }: UsageContextAnalysisProps) {
  if (!data || data.length === 0) return null;

  return (
    <Card title="👥 用户画像5W概况" icon={Users}>
      <div className="space-y-3">
        {data.map((item: any, i) => {
          // 支持多种字段名：issue, insight, description, who, what, where, when, why, buyer, user, scenario, motivation
          const insightText = item.issue || item.insight || item.description || item.who || item.buyer || 
                              item.user || item.what || item.where || item.when || 
                              item.why || item.scenario || item.motivation || item.point || '';
          
          const labelConfig = getLabelConfig(item);
          
          if (!insightText) return null;
          
          return (
            <div 
              key={i} 
              className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {labelConfig && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${labelConfig.color}`}>
                        {labelConfig.type}
                      </span>
                    )}
                    <ConfidenceBadge confidence={item.confidence} />
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {insightText}
                  </p>
                  {item.implication && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                      💡 {item.implication}
                    </p>
                  )}
                </div>
              </div>
              
              <EvidenceInline evidence={item.evidence} />
            </div>
          );
        })}
      </div>
    </Card>
  );
});
