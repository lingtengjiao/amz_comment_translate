/**
 * ProductReportPage - 产品研发报告独立页面
 * 
 * 产品和研发团队视角的功能改进报告
 */
import { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  AlertCircle, Users, ThumbsUp, Bug, Wrench, Lightbulb, 
  Target, Star, AlertTriangle, CheckCircle
} from 'lucide-react';
import type { ReportStats } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { StatsDashboard } from '../../StatsDashboard';
import { Card, ConfidenceBadge, EvidenceInline, TocContext } from '../shared';

interface ProductReportPageProps {
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

// 优先级/严重性徽章
const PriorityBadge = memo(function PriorityBadge({ priority }: { priority: string }) {
  const p = String(priority).toLowerCase();
  const config: Record<string, { bg: string; text: string; label: string }> = {
    p0: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'P0 紧急' },
    p1: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'P1 高' },
    p2: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'P2 中' },
    p3: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'P3 低' },
    high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '高优先' },
    medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: '中优先' },
    low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: '低优先' }
  };
  const c = config[p] || config.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
});

export const ProductReportPage = memo(function ProductReportPage({
  content,
  analysisData,
  onSectionsChange,
  asin,
  onViewReviews
}: ProductReportPageProps) {
  const data = useMemo(() => safeParseJson(content), [content]);
  const config = REPORT_TYPE_CONFIG['product'];

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

  // 渲染列表项 - 支持多种字段名称
  const renderListItem = (item: any, i: number, bgClass: string = 'bg-gray-50 dark:bg-gray-900/50') => {
    if (typeof item === 'string') {
      return <li key={i} className={`p-2 ${bgClass} rounded text-sm`}>{item}</li>;
    }
    // 支持多种可能的字段名称
    const text = String(
      item.point || item.insight || item.feature || item.issue || item.content || 
      item.description || item.recommendation || item.need || item.gap || item.suggestion || ''
    );
    const confidence = String(item.confidence || '');
    const evidence = item.evidence || [];
    const priority = item.priority || item.severity || '';
    
    // 额外的上下文信息
    const extraInfo = item.impact || item.pmf_implication || item.business_value || item.context_mismatch || '';
    
    return (
      <li key={i} className={`p-3 ${bgClass} rounded`}>
        <div className="flex items-start gap-2">
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{text}</span>
          {priority && <PriorityBadge priority={priority} />}
          {confidence && <ConfidenceBadge confidence={confidence} />}
        </div>
        {extraInfo && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{extraInfo}</p>
        )}
        {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
      </li>
    );
  };

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
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
        <span className="text-2xl">{config?.icon || '🛠'}</span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{config?.label || '产品研发版'}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{config?.description || '产品视角 - 功能改进'}</p>
        </div>
      </div>

      {/* 用户研究 */}
      {data.user_research && Array.isArray(data.user_research) && data.user_research.length > 0 && (
        <Card title="👥 用户研究" icon={Users} variant="info">
          <div className="space-y-3">
            {data.user_research.map((item: any, i: number) => {
              // 支持多种字段名：insight, finding, observation, buyer, user, scenario, motivation 等
              const insightText = item.insight || item.finding || item.observation || item.buyer || item.user || 
                                  item.scenario || item.motivation || item.what || item.where || item.when || 
                                  item.why || item.description || item.point || item.summary || '';
              
              // 获取标签类型
              const labelType = item.aspect || item.category || item.type ||
                               (item.buyer ? '购买者' : '') ||
                               (item.user ? '使用者' : '') ||
                               (item.scenario ? '使用场景' : '') ||
                               (item.motivation ? '购买动机' : '') ||
                               (item.what ? '用户任务' : '') ||
                               (item.where ? '使用地点' : '') ||
                               (item.when ? '使用时机' : '') ||
                               (item.why ? '购买原因' : '') || '';
              
              if (!insightText) return null;
              
              return (
                <div key={i} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-start gap-2 mb-2 flex-wrap">
                    {labelType && (
                      <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                        {String(labelType)}
                      </span>
                    )}
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{insightText}</p>
                  {item.implication && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                      💡 {item.implication}
                    </p>
                  )}
                  {item.evidence && <EvidenceInline evidence={item.evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 质量评分 */}
      {data.quality_score && (
        <Card title="⭐ 质量评分" icon={Star}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.quality_score.overall && (
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg text-center">
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {typeof data.quality_score.overall === 'object' 
                    ? String(data.quality_score.overall.score || data.quality_score.overall.value || 'N/A')
                    : String(data.quality_score.overall)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">综合评分</div>
                {typeof data.quality_score.overall === 'object' && data.quality_score.overall.confidence && (
                  <ConfidenceBadge confidence={data.quality_score.overall.confidence} />
                )}
              </div>
            )}
            {data.quality_score.design && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {typeof data.quality_score.design === 'object' 
                    ? String(data.quality_score.design.score || data.quality_score.design.value || 'N/A')
                    : String(data.quality_score.design)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">设计评分</div>
              </div>
            )}
            {data.quality_score.functionality && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {typeof data.quality_score.functionality === 'object' 
                    ? String(data.quality_score.functionality.score || data.quality_score.functionality.value || 'N/A')
                    : String(data.quality_score.functionality)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">功能评分</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 严重缺陷 / 关键 Bug */}
      {data.critical_bugs && Array.isArray(data.critical_bugs) && data.critical_bugs.length > 0 && (
        <Card title="🐛 严重缺陷" icon={Bug} variant="danger">
          <ul className="space-y-2">
            {data.critical_bugs.map((item: any, i: number) => renderListItem(item, i, 'bg-red-50 dark:bg-red-900/20'))}
          </ul>
        </Card>
      )}

      {/* 用户期望功能 (unmet_needs) */}
      {data.unmet_needs && Array.isArray(data.unmet_needs) && data.unmet_needs.length > 0 && (
        <Card title="💭 用户期望功能" icon={Lightbulb} variant="info">
          <ul className="space-y-2">
            {data.unmet_needs.map((item: any, i: number) => renderListItem(item, i, 'bg-blue-50 dark:bg-blue-900/20'))}
          </ul>
        </Card>
      )}

      {/* 易用性问题 (usability_issues) */}
      {data.usability_issues && Array.isArray(data.usability_issues) && data.usability_issues.length > 0 && (
        <Card title="🖱️ 易用性问题" icon={AlertTriangle} variant="warning">
          <ul className="space-y-2">
            {data.usability_issues.map((item: any, i: number) => renderListItem(item, i, 'bg-amber-50 dark:bg-amber-900/20'))}
          </ul>
        </Card>
      )}

      {/* 设计改进建议 (design_recommendations) */}
      {data.design_recommendations && Array.isArray(data.design_recommendations) && data.design_recommendations.length > 0 && (
        <Card title="🎨 设计改进建议" icon={Wrench} variant="info">
          <ul className="space-y-2">
            {data.design_recommendations.map((item: any, i: number) => renderListItem(item, i, 'bg-blue-50 dark:bg-blue-900/20'))}
          </ul>
        </Card>
      )}

      {/* 功能亮点 */}
      {data.feature_highlights && Array.isArray(data.feature_highlights) && data.feature_highlights.length > 0 && (
        <Card title="✨ 功能亮点" icon={ThumbsUp} variant="success">
          <ul className="space-y-2">
            {data.feature_highlights.map((item: any, i: number) => renderListItem(item, i, 'bg-emerald-50 dark:bg-emerald-900/20'))}
          </ul>
        </Card>
      )}

      {/* 功能缺失 */}
      {data.missing_features && Array.isArray(data.missing_features) && data.missing_features.length > 0 && (
        <Card title="❌ 功能缺失" icon={AlertTriangle} variant="warning">
          <ul className="space-y-2">
            {data.missing_features.map((item: any, i: number) => renderListItem(item, i, 'bg-amber-50 dark:bg-amber-900/20'))}
          </ul>
        </Card>
      )}

      {/* 改进建议 */}
      {data.improvement_suggestions && Array.isArray(data.improvement_suggestions) && data.improvement_suggestions.length > 0 && (
        <Card title="💡 改进建议" icon={Lightbulb} variant="info">
          <div className="space-y-3">
            {data.improvement_suggestions.map((item: any, i: number) => {
              const suggestion = String(item.suggestion || item.content || item.point || item.description || '');
              const category = String(item.category || item.area || '');
              const priority = item.priority || '';
              const confidence = String(item.confidence || '');
              const evidence = item.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2 mb-2">
                    {category && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                        {category}
                      </span>
                    )}
                    {priority && <PriorityBadge priority={priority} />}
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</p>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 技术债务 */}
      {data.technical_debt && Array.isArray(data.technical_debt) && data.technical_debt.length > 0 && (
        <Card title="🔧 技术债务" icon={Wrench}>
          <ul className="space-y-2">
            {data.technical_debt.map((item: any, i: number) => renderListItem(item, i))}
          </ul>
        </Card>
      )}

      {/* 竞品对比 */}
      {data.competitor_comparison && Array.isArray(data.competitor_comparison) && data.competitor_comparison.length > 0 && (
        <Card title="🎯 竞品对比" icon={Target}>
          <div className="space-y-3">
            {data.competitor_comparison.map((item: any, i: number) => {
              const competitor = String(item.competitor || item.name || '');
              const insight = String(item.insight || item.comparison || item.content || '');
              const advantage = String(item.our_advantage || item.advantage || '');
              const disadvantage = String(item.our_disadvantage || item.disadvantage || '');
              const confidence = String(item.confidence || '');
              const evidence = item.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {competitor && (
                      <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs font-medium">
                        vs {competitor}
                      </span>
                    )}
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  {insight && <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{insight}</p>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {advantage && (
                      <div className="flex items-start gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded">
                        <CheckCircle className="size-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{advantage}</span>
                      </div>
                    )}
                    {disadvantage && (
                      <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        <AlertTriangle className="size-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{disadvantage}</span>
                      </div>
                    )}
                  </div>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 使用场景差距分析 (usage_context_gap) - 支持字符串和数组 */}
      {data.usage_context_gap && (
        <Card title="📍 使用场景差距分析" icon={Target} variant="warning">
          {typeof data.usage_context_gap === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.usage_context_gap}</p>
          ) : Array.isArray(data.usage_context_gap) ? (
            <ul className="space-y-2">
              {data.usage_context_gap.map((item: any, i: number) => renderListItem(item, i, 'bg-amber-50 dark:bg-amber-900/20'))}
            </ul>
          ) : null}
        </Card>
      )}

      {/* 下版本升级方向 (roadmap_suggestion) - 支持字符串和数组 */}
      {data.roadmap_suggestion && (
        <Card title="🚀 下版本升级方向" icon={Target} variant="info">
          {typeof data.roadmap_suggestion === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.roadmap_suggestion}</p>
          ) : Array.isArray(data.roadmap_suggestion) ? (
            <ul className="space-y-2">
              {data.roadmap_suggestion.map((item: any, i: number) => renderListItem(item, i, 'bg-blue-50 dark:bg-blue-900/20'))}
            </ul>
          ) : null}
        </Card>
      )}

      {/* 产品路线图建议 (roadmap_suggestions - 数组) */}
      {data.roadmap_suggestions && Array.isArray(data.roadmap_suggestions) && data.roadmap_suggestions.length > 0 && (
        <Card title="🗺️ 产品路线图建议" icon={Target}>
          <div className="space-y-3">
            {data.roadmap_suggestions.map((item: any, i: number) => {
              const phase = String(item.phase || item.quarter || item.timeframe || `阶段 ${i + 1}`);
              const action = String(item.action || item.task || item.content || '');
              const priority = item.priority || '';
              const confidence = String(item.confidence || '');
              const evidence = item.evidence || [];
              
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">{phase}</span>
                      {priority && <PriorityBadge priority={priority} />}
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{action}</p>
                    {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
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

export default ProductReportPage;
