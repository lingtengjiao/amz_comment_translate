/**
 * ComprehensiveReportPage - 综合战略报告独立页面
 * 
 * CEO/战略视角的全局分析报告
 */
import { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  AlertCircle, Search, Target, TrendingUp, Users, Lightbulb, 
  AlertTriangle, Megaphone, Wrench, Package, Zap, ThumbsUp, ThumbsDown 
} from 'lucide-react';
import type { ReportStats } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { StatsDashboard } from '../../StatsDashboard';
import { Card, ConfidenceBadge, EvidenceInline, TocContext } from '../shared';

interface ComprehensiveReportPageProps {
  content: string;
  analysisData?: ReportStats | null;
  onSectionsChange?: (sections: Array<{ id: string; title: string; level?: number }>) => void;
  asin?: string;
  onViewReviews?: (dimensionKey: string, dimensionLabel: string, tagLabel: string, totalCount: number) => void;
}

function safeParseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// 风险等级徽章
const RiskBadge = memo(function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: '低风险' },
    medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: '中等风险' },
    high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: '高风险' },
    critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '严重风险' }
  };
  const c = config[level] || config.medium;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <AlertTriangle className="size-3 mr-1" />
      {c.label}
    </span>
  );
});

export const ComprehensiveReportPage = memo(function ComprehensiveReportPage({
  content,
  analysisData,
  onSectionsChange,
  asin,
  onViewReviews
}: ComprehensiveReportPageProps) {
  const data = useMemo(() => safeParseJson(content), [content]);
  const config = REPORT_TYPE_CONFIG['comprehensive'];

  // 大纲收集机制
  const sectionsRef = useRef<Map<string, { id: string; title: string; level: number }>>(new Map());
  const updateTimerRef = useRef<number | null>(null);

  const registerSection = useCallback((id: string, title: string, level: number = 0) => {
    const existing = sectionsRef.current.get(id);
    if (existing && existing.title === title && existing.level === level) {
      return;
    }
    sectionsRef.current.set(id, { id, title, level });
    
    if (updateTimerRef.current) {
      cancelAnimationFrame(updateTimerRef.current);
    }
    updateTimerRef.current = requestAnimationFrame(() => {
      if (onSectionsChange) {
        const sections = Array.from(sectionsRef.current.values());
        onSectionsChange(sections);
      }
    });
  }, [onSectionsChange]);

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        cancelAnimationFrame(updateTimerRef.current);
      }
    };
  }, []);

  if (!data) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="size-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">报告内容解析失败</h3>
      </div>
    );
  }

  // 渲染数组项
  const renderArrayItems = (items: any[], renderItem: (item: any, i: number) => React.ReactNode) => {
    if (!Array.isArray(items)) return null;
    return items.map((item, i) => renderItem(item, i));
  };

  // SWOT 项渲染
  const renderSwotItem = (item: any, variant: 'success' | 'danger' | 'info' | 'warning', icon: string, key: number) => {
    const bgColors = {
      success: 'bg-emerald-50 dark:bg-emerald-900/20',
      danger: 'bg-red-50 dark:bg-red-900/20',
      info: 'bg-blue-50 dark:bg-blue-900/20',
      warning: 'bg-amber-50 dark:bg-amber-900/20'
    };
    
    if (typeof item === 'object' && item !== null) {
      const text = String(item.point || item['描述'] || item.description || '');
      const confidence = String(item.confidence || item['置信度'] || '');
      const evidence = (item.evidence || item['证据'] || []) as any[];
      
      return (
        <li key={key} className={`p-2 ${bgColors[variant]} rounded`}>
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <span className="flex-1 text-sm">{text}</span>
            {confidence && <ConfidenceBadge confidence={confidence} />}
          </div>
          {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
        </li>
      );
    }
    return <li key={key} className="p-2 text-sm">{String(item)}</li>;
  };

  // 获取 SWOT 数据
  const swot = data.core_swot || {};
  const strengths = (swot.strengths || swot['优势'] || []) as any[];
  const weaknesses = (swot.weaknesses || swot['劣势'] || []) as any[];
  const opportunities = (swot.opportunities || swot['机会'] || []) as any[];
  const threats = (swot.threats || swot['威胁'] || []) as any[];

  return (
    <TocContext.Provider value={{ registerSection }}>
    <div className="space-y-6 json-report-container">
      {/* 📊 数据概览 */}
      {analysisData && (
        <StatsDashboard 
          analysisData={analysisData} 
          onViewReviews={asin ? onViewReviews : undefined}
        />
      )}

      {/* AI 智能分析标题 */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <span className="text-2xl">{config?.icon || '📊'}</span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{config?.label || '综合战略版'}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{config?.description || 'CEO视角 - 全局战略分析'}</p>
        </div>
      </div>

      {/* 用户画像分析 */}
      {data.user_profile && Array.isArray(data.user_profile) && data.user_profile.length > 0 && (
        <Card title="👥 用户画像分析" icon={Users} variant="info">
          <div className="space-y-4">
            {data.user_profile.map((item: any, i: number) => {
              // 支持多种字段名：buyer, user, scenario, motivation, what, where, when, why, aspect, insight, description
              const insightText = item.insight || item.buyer || item.user || item.scenario || item.motivation || 
                                  item.what || item.where || item.when || item.why || item.aspect || 
                                  item.description || item.point || '';
              
              // 获取标签类型（用于显示分类）
              const labelType = item.buyer ? '购买者' : 
                               item.user ? '使用者' : 
                               item.scenario ? '使用场景' : 
                               item.motivation ? '购买动机' :
                               item.what ? '用户任务' :
                               item.where ? '使用地点' :
                               item.when ? '使用时机' :
                               item.why ? '购买原因' :
                               item.aspect || '';
              
              return (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    {labelType && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                        {labelType}
                      </span>
                    )}
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {insightText && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{String(insightText)}</p>
                  )}
                  {item.evidence && <EvidenceInline evidence={item.evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 战略定调 */}
      <Card title="🎯 战略定调" icon={Target} variant="info">
        {typeof data.strategic_verdict === 'string' ? (
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.strategic_verdict}</p>
        ) : Array.isArray(data.strategic_verdict) ? (
          <div className="space-y-3">
            {data.strategic_verdict.map((item: any, i: number) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-gray-700 dark:text-gray-300">{String(item.verdict || item.insight || '')}</p>
                  {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                </div>
                {item.evidence && <EvidenceInline evidence={item.evidence} />}
              </div>
            ))}
          </div>
        ) : null}
        {data.risk_level && <div className="mt-3"><RiskBadge level={data.risk_level} /></div>}
      </Card>

      {/* 市场匹配度分析 */}
      {data.market_fit_analysis && (
        <Card title="📊 市场匹配度分析" icon={TrendingUp}>
          {typeof data.market_fit_analysis === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300">{data.market_fit_analysis}</p>
          ) : Array.isArray(data.market_fit_analysis) ? (
            <div className="space-y-4">
              {data.market_fit_analysis.map((item: any, i: number) => (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start gap-2 mb-2">
                    <p className="flex-1 font-medium text-gray-900 dark:text-white">{String(item.insight || '')}</p>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {item.analysis && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{String(item.analysis)}</p>}
                  {item.evidence && <EvidenceInline evidence={item.evidence} />}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      {/* SWOT 分析 */}
      {data.core_swot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="优势 (Strengths)" icon={ThumbsUp} variant="success">
            <ul className="space-y-2">
              {strengths.map((s, i) => renderSwotItem(s, 'success', '✓', i))}
              {strengths.length === 0 && <li className="text-sm text-gray-500">暂无数据</li>}
            </ul>
          </Card>
          <Card title="劣势 (Weaknesses)" icon={ThumbsDown} variant="danger">
            <ul className="space-y-2">
              {weaknesses.map((w, i) => renderSwotItem(w, 'danger', '✗', i))}
              {weaknesses.length === 0 && <li className="text-sm text-gray-500">暂无数据</li>}
            </ul>
          </Card>
          <Card title="机会 (Opportunities)" icon={Lightbulb} variant="info">
            <ul className="space-y-2">
              {opportunities.map((o, i) => renderSwotItem(o, 'info', '💡', i))}
              {opportunities.length === 0 && <li className="text-sm text-gray-500">暂无数据</li>}
            </ul>
          </Card>
          <Card title="威胁 (Threats)" icon={AlertTriangle} variant="warning">
            <ul className="space-y-2">
              {threats.map((t, i) => renderSwotItem(t, 'warning', '⚠', i))}
              {threats.length === 0 && <li className="text-sm text-gray-500">暂无数据</li>}
            </ul>
          </Card>
        </div>
      )}

      {/* 部门指令 */}
      {data.department_directives && (
        <Card title="📋 各部门指令" icon={Users}>
          {Array.isArray(data.department_directives) ? (
            <div className="space-y-3">
              {data.department_directives.map((item: any, i: number) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {String(item.department || item.to || `指令 ${i + 1}`)}
                    </span>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{String(item.directive || item.action || '')}</p>
                  {item.evidence && <EvidenceInline evidence={item.evidence} />}
                </div>
              ))}
            </div>
          ) : typeof data.department_directives === 'object' ? (
            <div className="space-y-3">
              {data.department_directives.to_marketing && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-medium mb-1">
                    <Megaphone className="size-4" /> To 市场营销
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_marketing}</p>
                </div>
              )}
              {data.department_directives.to_product && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-medium mb-1">
                    <Wrench className="size-4" /> To 产品研发
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_product}</p>
                </div>
              )}
              {data.department_directives.to_supply_chain && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm font-medium mb-1">
                    <Package className="size-4" /> To 供应链
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_supply_chain}</p>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* 优先行动项 */}
      {data.priority_actions && data.priority_actions.length > 0 && (
        <Card title="⚡ 优先行动项" icon={Zap}>
          <div className="space-y-3">
            {data.priority_actions.map((action: any, i: number) => {
              const actionText = action.action || action.task || JSON.stringify(action);
              const owner = action.owner || '';
              const deadline = action.deadline || '';
              const priority = action.priority || '';
              const confidence = action.confidence || '';
              
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                    priority === 'P0' ? 'bg-red-500' : priority === 'P1' ? 'bg-orange-500' : 'bg-emerald-500'
                  }`}>
                    {priority || (i + 1)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">{actionText}</p>
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    {(owner || deadline) && (
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        {owner && <span>负责人: {owner}</span>}
                        {deadline && <span>截止: {deadline}</span>}
                      </div>
                    )}
                    {action.evidence && <EvidenceInline evidence={action.evidence} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
    </TocContext.Provider>
  );
});

export default ComprehensiveReportPage;
