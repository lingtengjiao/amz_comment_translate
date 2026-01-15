/**
 * OperationsReportPage - 运营市场报告独立页面
 * 
 * 运营和市场团队视角的策略分析报告
 */
import { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  AlertCircle, Users, ThumbsUp, AlertTriangle, Edit3,
  Tag, MessageSquare, Lightbulb, Megaphone, TrendingUp, Target
} from 'lucide-react';
import type { ReportStats } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { StatsDashboard } from '../../StatsDashboard';
import { Card, ConfidenceBadge, EvidenceInline, TocContext } from '../shared';

interface OperationsReportPageProps {
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

export const OperationsReportPage = memo(function OperationsReportPage({
  content,
  analysisData,
  onSectionsChange,
  asin,
  onViewReviews
}: OperationsReportPageProps) {
  const data = useMemo(() => safeParseJson(content), [content]);
  const config = REPORT_TYPE_CONFIG['operations'];

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
      item.point || item.insight || item.element || item.tag || item.content || 
      item.value || item.hook || item.risk || item.warning || item.description || ''
    );
    const confidence = String(item.confidence || '');
    const evidence = item.evidence || [];
    
    // 额外信息
    const extraInfo = item.impact || item.recommendation || '';
    
    return (
      <li key={i} className={`p-3 ${bgClass} rounded`}>
        <div className="flex items-start gap-2">
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{text}</span>
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
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
        <span className="text-2xl">{config?.icon || '📈'}</span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{config?.label || '运营市场版'}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{config?.description || '运营视角 - 市场策略'}</p>
        </div>
      </div>

      {/* 用户画像 */}
      {data.user_profile && Array.isArray(data.user_profile) && data.user_profile.length > 0 && (
        <Card title="👥 用户画像分析" icon={Users} variant="info">
          <div className="space-y-3">
            {data.user_profile.map((item: any, i: number) => {
              // 支持多种字段名：insight, buyer, user, scenario, motivation, what, where, when, why, aspect, description, point
              const insightText = item.insight || item.buyer || item.user || item.scenario || item.motivation || 
                                  item.what || item.where || item.when || item.why || item.aspect || 
                                  item.description || item.point || '';
              
              // 获取标签类型
              const labelType = item.buyer ? '购买者' : 
                               item.user ? '使用者' : 
                               item.scenario ? '使用场景' : 
                               item.motivation ? '购买动机' :
                               item.what ? '用户任务' :
                               item.where ? '使用地点' :
                               item.when ? '使用时机' :
                               item.why ? '购买原因' :
                               item.aspect || '';
              
              if (!insightText) return null;
              
              return (
                <div key={i} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-start gap-2 mb-2 flex-wrap">
                    {labelType && (
                      <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                        {labelType}
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

      {/* 卖点提炼 */}
      {data.selling_points && Array.isArray(data.selling_points) && data.selling_points.length > 0 && (
        <Card title="✨ 卖点提炼" icon={ThumbsUp} variant="success">
          <ul className="space-y-2">
            {data.selling_points.map((item: any, i: number) => renderListItem(item, i, 'bg-emerald-50 dark:bg-emerald-900/20'))}
          </ul>
        </Card>
      )}

      {/* 风险预警 / 营销风险 (marketing_risks) */}
      {(data.risk_warnings || data.marketing_risks) && Array.isArray(data.risk_warnings || data.marketing_risks) && (data.risk_warnings || data.marketing_risks).length > 0 && (
        <Card title="⚠️ 风险预警" icon={AlertTriangle} variant="danger">
          <ul className="space-y-2">
            {(data.risk_warnings || data.marketing_risks).map((item: any, i: number) => renderListItem(item, i, 'bg-red-50 dark:bg-red-900/20'))}
          </ul>
        </Card>
      )}

      {/* 广告投放建议 (target_audience) */}
      {data.target_audience && (
        <Card title="🎯 广告投放建议" icon={Target} variant="info">
          {typeof data.target_audience === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.target_audience}</p>
          ) : typeof data.target_audience === 'object' && (
            <div className="space-y-3">
              {data.target_audience.primary && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">核心受众</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{String(data.target_audience.primary)}</p>
                </div>
              )}
              {data.target_audience.secondary && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">潜在受众</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{String(data.target_audience.secondary)}</p>
                </div>
              )}
              {data.target_audience.keywords && Array.isArray(data.target_audience.keywords) && (
                <div className="flex flex-wrap gap-2">
                  {data.target_audience.keywords.map((kw: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              {data.target_audience.recommendation && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{String(data.target_audience.recommendation)}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 竞品分析 (competitor_analysis) */}
      {data.competitor_analysis && (
        <Card title="📊 竞品分析" icon={TrendingUp}>
          {typeof data.competitor_analysis === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.competitor_analysis}</p>
          ) : Array.isArray(data.competitor_analysis) && (
            <ul className="space-y-2">
              {data.competitor_analysis.map((item: any, i: number) => renderListItem(item, i))}
            </ul>
          )}
        </Card>
      )}

      {/* Listing 优化建议 */}
      {data.listing_optimization && Array.isArray(data.listing_optimization) && data.listing_optimization.length > 0 && (
        <Card title="📝 Listing 优化建议" icon={Edit3}>
          <div className="space-y-3">
            {data.listing_optimization.map((item: any, i: number) => {
              const element = String(item.element || item.tag || '');
              const suggestion = String(item.suggestion || item.optimization || item.content || '');
              const confidence = String(item.confidence || '');
              const evidence = item.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    {element && (
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                        {element}
                      </span>
                    )}
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

      {/* A+页面元素 */}
      {data.aplus_elements && Array.isArray(data.aplus_elements) && data.aplus_elements.length > 0 && (
        <Card title="🎨 A+ 页面元素建议" icon={Tag}>
          <ul className="space-y-2">
            {data.aplus_elements.map((item: any, i: number) => renderListItem(item, i))}
          </ul>
        </Card>
      )}

      {/* 问答素材 */}
      {data.qa_material && Array.isArray(data.qa_material) && data.qa_material.length > 0 && (
        <Card title="💬 问答素材" icon={MessageSquare}>
          <div className="space-y-4">
            {data.qa_material.map((qa: any, i: number) => {
              const question = String(qa.question || qa.q || '');
              const answer = String(qa.answer || qa.a || '');
              const confidence = String(qa.confidence || '');
              const evidence = qa.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-purple-500 font-medium">Q:</span>
                    <span className="flex-1 font-medium text-gray-900 dark:text-white">{question}</span>
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  <div className="flex items-start gap-2 ml-4">
                    <span className="text-emerald-500 font-medium">A:</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{answer}</span>
                  </div>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 营销创意 */}
      {data.marketing_ideas && Array.isArray(data.marketing_ideas) && data.marketing_ideas.length > 0 && (
        <Card title="💡 营销创意" icon={Lightbulb} variant="info">
          <ul className="space-y-2">
            {data.marketing_ideas.map((item: any, i: number) => renderListItem(item, i, 'bg-blue-50 dark:bg-blue-900/20'))}
          </ul>
        </Card>
      )}

      {/* 客服话术 */}
      {data.customer_service_scripts && Array.isArray(data.customer_service_scripts) && data.customer_service_scripts.length > 0 && (
        <Card title="🗣️ 客服话术" icon={Megaphone}>
          <div className="space-y-3">
            {data.customer_service_scripts.map((script: any, i: number) => {
              const scenario = String(script.scenario || script.situation || '');
              const response = String(script.response || script.script || script.content || '');
              const confidence = String(script.confidence || '');
              const evidence = script.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {scenario && (
                      <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs font-medium">
                        场景: {scenario}
                      </span>
                    )}
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{response}"</p>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 差评回复模板 (review_response_templates) */}
      {data.review_response_templates && Array.isArray(data.review_response_templates) && data.review_response_templates.length > 0 && (
        <Card title="💬 差评回复模板" icon={MessageSquare} variant="warning">
          <div className="space-y-4">
            {data.review_response_templates.map((template: any, i: number) => {
              const issue = String(template.issue || template.problem || template.scenario || '');
              const response = String(template.response || template.template || template.reply || template.content || '');
              const confidence = String(template.confidence || '');
              const evidence = template.evidence || [];
              
              return (
                <div key={i} className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  {issue && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                        问题: {issue}
                      </span>
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                  )}
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                    "{response}"
                  </p>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 执行摘要 / 要点 */}
      {data.executive_summary && typeof data.executive_summary === 'string' && (
        <Card title="📋 执行摘要" icon={Megaphone}>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.executive_summary}</p>
        </Card>
      )}
    </div>
    </TocContext.Provider>
  );
});

export default OperationsReportPage;
