/**
 * JsonReportRenderer - JSON 结构化报告渲染组件
 * 
 * 支持四种报告类型的渲染：
 * 1. comprehensive: CEO/综合战略版
 * 2. operations: CMO/运营市场版
 * 3. product: CPO/产品研发版
 * 4. supply_chain: 供应链/质检版
 * 
 * 支持证据溯源 (Traceability):
 * - 点击带 source_tag 的观点，可查看原始评论证据
 */
import { memo, useMemo, useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import {
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Users,
  Megaphone,
  Wrench,
  Package,
  AlertCircle,
  ChevronRight,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Zap,
  Shield,
  Clock,
  FileText,
  Search,
  Copy,
  Check
} from 'lucide-react';
import type { 
  ReportType,
  ComprehensiveReportContent,
  OperationsReportContent,
  ProductReportContent,
  SupplyChainReportContent,
  ReportStats,
  ChartDataItem,
  EvidenceSample
} from '@/api/types';
import { REPORT_TYPE_CONFIG, getStatsItems } from '@/api/types';
import { EvidenceDrawer } from './EvidenceDrawer';
import { StatsDashboard } from './StatsDashboard';

// 证据上下文 - 用于在子组件中访问 analysisData
interface EvidenceContextType {
  analysisData: ReportStats | null;
  asin?: string;
  openEvidence: (title: string, sourceTag: string, sourceType: 'context' | 'insight', category: string) => void;
}

const EvidenceContext = createContext<EvidenceContextType>({
  analysisData: null,
  openEvidence: () => {}
});

// 大纲上下文 - 用于收集所有板块标题
interface TocContextType {
  registerSection: (id: string, title: string, level?: number) => void;
}

export const TocContext = createContext<TocContextType>({
  registerSection: () => {}
});

interface JsonReportRendererProps {
  content: string;
  reportType: ReportType;
  analysisData?: ReportStats | null;  // 原始统计数据，用于溯源
  asin?: string;  // 产品 ASIN，用于跳转
  onSectionsChange?: (sections: Array<{ id: string; title: string; level?: number }>) => void;  // 大纲变化回调
  onDrawerStateChange?: (isOpen: boolean) => void;  // 证据抽屉状态变化回调
}

// 安全解析 JSON
function safeParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// 安全渲染值 - 确保对象不会被直接渲染
function safeRender(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    // 如果是对象，尝试提取常见字段
    const obj = value as Record<string, unknown>;
    if (obj.point) return String(obj.point);
    if (obj.risk) return String(obj.risk);
    if (obj.title) return String(obj.title);
    if (obj.issue) return String(obj.issue);
    if (obj.feature) return String(obj.feature);
    if (obj.part) return String(obj.part);
    if (obj.item) return String(obj.item);
    // 否则返回 JSON 字符串
    return JSON.stringify(value);
  }
  return String(value);
}

// 可溯源标签组件 - 点击可查看证据
const TraceableTag = memo(function TraceableTag({
  sourceTag,
  sourceType,
  category,
  children,
  variant = 'default'
}: {
  sourceTag?: string;
  sourceType: 'context' | 'insight';
  category: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const { analysisData, openEvidence } = useContext(EvidenceContext);
  
  // 检查是否有证据可溯源
  const hasEvidence = sourceTag && analysisData;
  
  if (!hasEvidence) {
    return <>{children}</>;
  }
  
  const variantStyles = {
    default: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
    danger: 'hover:bg-red-100 dark:hover:bg-red-900/30',
    warning: 'hover:bg-amber-100 dark:hover:bg-amber-900/30',
    success: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
  };
  
  return (
    <button
      onClick={() => openEvidence(`关于"${sourceTag}"的反馈`, sourceTag, sourceType, category)}
      className={`inline-flex items-center gap-1 cursor-pointer transition-colors rounded px-1 -mx-1 ${variantStyles[variant]}`}
      title="点击查看证据"
    >
      {children}
      <Search className="size-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
    </button>
  );
});

// 通用卡片组件
const Card = memo(function Card({ 
  title, 
  icon: Icon, 
  children, 
  className = '',
  variant = 'default',
  id,
  level = 0
}: { 
  title: string; 
  icon?: typeof Target; 
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  id?: string;
  level?: number;
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { registerSection } = useContext(TocContext);

  const variantStyles = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
  };

  // 移除 title 中的 emoji，只保留文字
  const cleanTitle = title.replace(/^[\u{1F300}-\u{1F9FF}]+\s*/u, '').trim() || title;
  
  // 生成 ID（如果没有提供）
  const cardId = useMemo(() => {
    if (id) return id;
    const baseId = cleanTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    // 确保 ID 不为空且有效
    return baseId ? `section-${baseId}` : `section-${Math.random().toString(36).substr(2, 9)}`;
  }, [id, cleanTitle]);
  
  // 注册到大纲（延迟注册，确保 DOM 已渲染）
  useEffect(() => {
    if (registerSection && cardRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已渲染
      const timer = requestAnimationFrame(() => {
        registerSection(cardId, cleanTitle, level);
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [cardId, cleanTitle, level, registerSection]);

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return;
    
    // 获取卡片的文本内容
    const textContent = cardRef.current.innerText || '';
    
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  return (
    <div 
      id={cardId}
      ref={cardRef} 
      className={`rounded-lg border p-4 ${variantStyles[variant]} ${className} relative scroll-mt-24`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-5 text-gray-600 dark:text-gray-400" />}
          <h3 className="font-semibold text-gray-900 dark:text-white">{cleanTitle}</h3>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="复制内容"
        >
          {copied ? (
            <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      {children}
    </div>
  );
});

// 列表项组件
const ListItem = memo(function ListItem({ 
  children, 
  icon: Icon,
  variant = 'default'
}: { 
  children: React.ReactNode; 
  icon?: typeof ChevronRight;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const iconColors = {
    default: 'text-gray-400',
    success: 'text-emerald-500',
    danger: 'text-red-500',
    warning: 'text-amber-500'
  };

  return (
    <li className="flex items-start gap-2 py-1">
      {Icon ? (
        <Icon className={`size-4 mt-0.5 flex-shrink-0 ${iconColors[variant]}`} />
      ) : (
        <ChevronRight className={`size-4 mt-0.5 flex-shrink-0 ${iconColors[variant]}`} />
      )}
      <span className="text-sm text-gray-700 dark:text-gray-300">{children}</span>
    </li>
  );
});

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

// 严重程度徽章
const SeverityBadge = memo(function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    High: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    Medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
    Low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' }
  };
  const c = config[severity] || config.Medium;
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {severity}
    </span>
  );
});

// ========== 用户画像卡片组件 (共用) ==========
const UserProfileCard = memo(function UserProfileCard({ 
  profile,
  variant = 'comprehensive'
}: { 
  profile: Record<string, unknown>;
  variant?: 'comprehensive' | 'operations' | 'product' | 'supply_chain';
}) {
  if (!profile) return null;
  
  // 根据不同报告类型，字段名可能不同
  const coreUsers = profile.core_users || profile.primary_audience || profile.target_users || profile.user_groups;
  const scenarios = profile.usage_scenarios || profile.usage_context || profile.real_usage_environments || profile.usage_environments;
  const motivation = profile.purchase_motivation || profile.buying_triggers;
  const jtbd = profile.jobs_to_be_done || profile.use_cases || profile.user_goals;
  const summary = profile.persona_insight || profile.unmet_expectations || profile.environmental_requirements;
  
  return (
    <Card title="👤 用户画像5w概况" icon={Users} variant="info">
      <div className="space-y-4">
        {/* 核心用户 */}
        {coreUsers && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Who - 核心用户群体</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(coreUsers) ? coreUsers.map(safeRender).join('、') : safeRender(coreUsers)}
            </p>
          </div>
        )}
        
        {/* 用户特征标签 */}
        {profile.user_characteristics && Array.isArray(profile.user_characteristics) && (
          <div className="flex flex-wrap gap-2">
            {(profile.user_characteristics as string[]).map((tag, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs">
                {safeRender(tag)}
              </span>
            ))}
          </div>
        )}
        
        {/* 使用场景 */}
        {scenarios && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1">Where/When - 使用场景</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(scenarios) ? scenarios.map(safeRender).join('、') : safeRender(scenarios)}
            </p>
          </div>
        )}
        
        {/* 购买动机 */}
        {motivation && (
          <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
            <div className="text-xs font-semibold text-pink-700 dark:text-pink-400 mb-1">Why - 购买动机</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(motivation) ? motivation.map(safeRender).join('、') : safeRender(motivation)}
            </p>
          </div>
        )}
        
        {/* 用户任务/JTBD */}
        {jtbd && (
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">What - 用户任务 (JTBD)</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(jtbd) ? jtbd.map(safeRender).join('、') : safeRender(jtbd)}
            </p>
          </div>
        )}
        
        {/* 广告关键词 (运营版) */}
        {profile.ad_targeting_keywords && Array.isArray(profile.ad_targeting_keywords) && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">广告投放关键词</div>
            <div className="flex flex-wrap gap-2">
              {(profile.ad_targeting_keywords as string[]).map((kw, i) => (
                <span key={i} className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs font-medium">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* 用户痛点分类 (产品版) */}
        {profile.user_pain_points && Array.isArray(profile.user_pain_points) && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">按用户分类的痛点</div>
            <ul className="space-y-1">
              {(profile.user_pain_points as string[]).map((pain, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  {pain}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* 耐久性关注点 (供应链版) */}
        {profile.durability_focus && Array.isArray(profile.durability_focus) && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">重点耐久性关注</div>
            <div className="flex flex-wrap gap-2">
              {(profile.durability_focus as string[]).map((item, i) => (
                <span key={i} className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* 总结洞察 */}
        {summary && (
          <div className="p-3 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">💡 画像洞察</div>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{summary as string}</p>
          </div>
        )}
      </div>
    </Card>
  );
});

// ========== 综合战略版渲染器 ==========
const ComprehensiveRenderer = memo(function ComprehensiveRenderer({ 
  data 
}: { 
  data: ComprehensiveReportContent 
}) {
  return (
    <div className="space-y-6">
      {/* 用户画像分析 - 放在最前面 */}
      {data.user_profile && (
        <UserProfileCard profile={data.user_profile as unknown as Record<string, unknown>} variant="comprehensive" />
      )}
      
      {/* 战略定调 */}
      <Card title="🎯 战略定调" icon={Target} variant="info">
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {data.strategic_verdict}
        </p>
        {data.risk_level && (
          <div className="mt-3">
            <RiskBadge level={data.risk_level} />
          </div>
        )}
      </Card>

      {/* 市场匹配度分析 */}
      <Card title="📊 市场匹配度分析" icon={TrendingUp}>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {data.market_fit_analysis}
        </p>
      </Card>

      {/* SWOT 分析 */}
      {data.core_swot && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="优势 (Strengths)" icon={ThumbsUp} variant="success">
            <ul className="space-y-1">
              {data.core_swot.strengths?.map((s, i) => (
                <ListItem key={i} variant="success">
                  {typeof s === 'object' && s !== null ? (s as { point?: string }).point || JSON.stringify(s) : String(s)}
                </ListItem>
              ))}
            </ul>
          </Card>
          <Card title="劣势 (Weaknesses)" icon={ThumbsDown} variant="danger">
            <ul className="space-y-1">
              {data.core_swot.weaknesses?.map((w, i) => (
                <ListItem key={i} variant="danger">
                  {typeof w === 'object' && w !== null ? (w as { point?: string }).point || JSON.stringify(w) : String(w)}
                </ListItem>
              ))}
            </ul>
          </Card>
          <Card title="机会 (Opportunities)" icon={Lightbulb} variant="info">
            <ul className="space-y-1">
              {data.core_swot.opportunities?.map((o, i) => (
                <ListItem key={i}>
                  {typeof o === 'object' && o !== null ? (o as { point?: string }).point || JSON.stringify(o) : String(o)}
                </ListItem>
              ))}
            </ul>
          </Card>
          <Card title="威胁 (Threats)" icon={AlertTriangle} variant="warning">
            <ul className="space-y-1">
              {data.core_swot.threats?.map((t, i) => (
                <ListItem key={i} variant="warning">
                  {typeof t === 'object' && t !== null ? (t as { point?: string }).point || JSON.stringify(t) : String(t)}
                </ListItem>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* 部门指令 */}
      {data.department_directives && (
        <Card title="📋 各部门指令" icon={Users}>
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-medium mb-1">
                <Megaphone className="size-4" />
                To 市场营销
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_marketing}</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-medium mb-1">
                <Wrench className="size-4" />
                To 产品研发
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_product}</p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm font-medium mb-1">
                <Package className="size-4" />
                To 供应链
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{data.department_directives.to_supply_chain}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 优先行动项 */}
      {data.priority_actions && data.priority_actions.length > 0 && (
        <Card title="⚡ 优先行动项" icon={Zap}>
          <div className="space-y-3">
            {data.priority_actions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{action.action}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>负责人: {action.owner}</span>
                    <span>截止: {action.deadline}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
});

// ========== 运营市场版渲染器 ==========
const OperationsRenderer = memo(function OperationsRenderer({ 
  data 
}: { 
  data: OperationsReportContent 
}) {
  return (
    <div className="space-y-6">
      {/* 用户画像与市场定位 - 放在最前面 */}
      {data.user_profile && (
        <UserProfileCard profile={data.user_profile as unknown as Record<string, unknown>} variant="operations" />
      )}
      
      {/* 执行摘要 */}
      <Card title="📢 市场现状" icon={Megaphone} variant="info">
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {data.executive_summary}
        </p>
      </Card>

      {/* 核心卖点 */}
      {data.selling_points && data.selling_points.length > 0 && (
        <Card title="💎 核心卖点" icon={Star} variant="success">
          <div className="space-y-4">
            {data.selling_points.map((sp, i) => {
              // 处理对象或字符串两种格式
              if (typeof sp === 'object' && sp !== null) {
                const spObj = sp as { title?: string; copywriting?: string; source_strength?: string; source_tag?: string };
                return (
                  <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">✨</span>
                      <h4 className="font-semibold text-gray-900 dark:text-white">{safeRender(spObj.title)}</h4>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 italic">
                      "{safeRender(spObj.copywriting)}"
                    </p>
                    <p className="text-xs text-gray-500">来源: {safeRender(spObj.source_strength || spObj.source_tag)}</p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(sp)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 营销风险 */}
      {data.marketing_risks && data.marketing_risks.length > 0 && (
        <Card title="⚠️ 客服预警 (需准备话术)" icon={AlertCircle} variant="danger">
          <div className="space-y-3">
            {data.marketing_risks.map((risk, i) => {
              // 处理对象或字符串两种格式
              if (typeof risk === 'object' && risk !== null) {
                const riskObj = risk as { risk?: string; talking_points?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="size-4 text-red-500" />
                      <span className="font-medium text-gray-900 dark:text-white">{riskObj.risk || JSON.stringify(risk)}</span>
                    </div>
                    {riskObj.talking_points && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">
                        <span className="font-medium">应对话术:</span> {riskObj.talking_points}
                      </p>
                    )}
                  </div>
                );
              }
              return <ListItem key={i} icon={AlertTriangle} variant="danger">{String(risk)}</ListItem>;
            })}
          </div>
        </Card>
      )}

      {/* 目标受众 */}
      {data.target_audience && (
        <Card title="🎯 广告投放建议" icon={Target}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">目标人群</h4>
              <div className="flex flex-wrap gap-2">
                {data.target_audience.who?.map((w, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">投放场景</h4>
              <div className="flex flex-wrap gap-2">
                {data.target_audience.scenario?.map((s, i) => (
                  <span key={i} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {data.target_audience.strategy && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">投放策略</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{data.target_audience.strategy}</p>
            </div>
          )}
        </Card>
      )}

      {/* 竞品分析 */}
      <Card title="🔍 竞品分析" icon={TrendingUp}>
        <p className="text-gray-700 dark:text-gray-300">
          {data.competitor_analysis || '暂无'}
        </p>
      </Card>

      {/* Listing 优化建议 */}
      {data.listing_optimization && data.listing_optimization.length > 0 && (
        <Card title="📝 Listing 优化建议" icon={FileText}>
          <div className="space-y-3">
            {data.listing_optimization.map((opt, i) => {
              if (typeof opt === 'object' && opt !== null) {
                const optObj = opt as { element?: string; suggestion?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium mb-2">
                      {safeRender(optObj.element)}
                    </span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(optObj.suggestion)}</p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(opt)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 差评回复模板 */}
      {data.review_response_templates && data.review_response_templates.length > 0 && (
        <Card title="💬 差评回复模板" icon={MessageSquare}>
          <div className="space-y-3">
            {data.review_response_templates.map((tpl, i) => {
              if (typeof tpl === 'object' && tpl !== null) {
                const tplObj = tpl as { pain_point?: string; response?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">
                      痛点: {safeRender(tplObj.pain_point)}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                      "{safeRender(tplObj.response)}"
                    </p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(tpl)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
});

// ========== 产品研发版渲染器 ==========
const ProductRenderer = memo(function ProductRenderer({ 
  data 
}: { 
  data: ProductReportContent 
}) {
  return (
    <div className="space-y-6">
      {/* 用户与场景分析 - 放在最前面 */}
      {data.user_research && (
        <UserProfileCard profile={data.user_research as unknown as Record<string, unknown>} variant="product" />
      )}
      
      {/* 质量评分 */}
      <Card title="📊 产品质量评分" icon={TrendingUp} variant="info">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {data.quality_score}
          </div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  data.quality_score >= 80 ? 'bg-emerald-500' :
                  data.quality_score >= 60 ? 'bg-yellow-500' :
                  data.quality_score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${data.quality_score}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {data.quality_score >= 80 ? '优秀' :
               data.quality_score >= 60 ? '良好' :
               data.quality_score >= 40 ? '需改进' : '严重问题'}
            </p>
          </div>
        </div>
      </Card>

      {/* 致命缺陷 */}
      {data.critical_bugs && data.critical_bugs.length > 0 && (
        <Card title="🐛 致命缺陷" icon={AlertTriangle} variant="danger">
          <div className="space-y-4">
            {data.critical_bugs.map((bug, i) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{bug.issue}</h4>
                  <SeverityBadge severity={bug.severity} />
                </div>
                {bug.root_cause_guess && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span className="font-medium">可能原因:</span> {bug.root_cause_guess}
                  </p>
                )}
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="font-medium">建议:</span> {bug.suggestion}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 未满足需求 */}
      {data.unmet_needs && data.unmet_needs.length > 0 && (
        <Card title="💡 用户期望功能 (Feature Requests)" icon={Lightbulb} variant="warning">
          <div className="space-y-3">
            {data.unmet_needs.map((need, i) => {
              // 处理对象或字符串两种格式
              if (typeof need === 'object' && need !== null) {
                const needObj = need as { feature?: string; reason?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="size-4 text-amber-500" />
                      <span className="font-medium text-gray-900 dark:text-white">{needObj.feature || JSON.stringify(need)}</span>
                    </div>
                    {needObj.reason && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">{needObj.reason}</p>
                    )}
                  </div>
                );
              }
              return <ListItem key={i} icon={Star} variant="warning">{String(need)}</ListItem>;
            })}
          </div>
        </Card>
      )}

      {/* 场景差异 */}
      <Card title="🔍 使用场景差异分析" icon={Target}>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {data.usage_context_gap}
        </p>
      </Card>

      {/* 迭代建议 */}
      <Card title="🚀 下版本升级方向" icon={TrendingUp} variant="success">
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
          {data.roadmap_suggestion}
        </p>
      </Card>

      {/* 易用性问题 */}
      {data.usability_issues && data.usability_issues.length > 0 && (
        <Card title="👤 易用性问题" icon={Users}>
          <div className="space-y-3">
            {data.usability_issues.map((issue, i) => {
              if (typeof issue === 'object' && issue !== null) {
                const issueObj = issue as { issue?: string; user_group?: string; suggestion?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <p className="font-medium text-gray-900 dark:text-white mb-1">{safeRender(issueObj.issue)}</p>
                    <p className="text-xs text-gray-500 mb-2">影响人群: {safeRender(issueObj.user_group)}</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">建议: {safeRender(issueObj.suggestion)}</p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(issue)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 设计建议 */}
      {data.design_recommendations && data.design_recommendations.length > 0 && (
        <Card title="🎨 设计改进建议" icon={Wrench}>
          <div className="space-y-3">
            {data.design_recommendations.map((rec, i) => {
              if (typeof rec === 'object' && rec !== null) {
                const recObj = rec as { area?: string; current_state?: string; recommendation?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">{safeRender(recObj.area)}</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">现状:</span>
                        <p className="text-gray-700 dark:text-gray-300">{safeRender(recObj.current_state)}</p>
                      </div>
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400">建议:</span>
                        <p className="text-gray-700 dark:text-gray-300">{safeRender(recObj.recommendation)}</p>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(rec)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
});

// ========== 供应链版渲染器 ==========
const SupplyChainRenderer = memo(function SupplyChainRenderer({ 
  data 
}: { 
  data: SupplyChainReportContent 
}) {
  return (
    <div className="space-y-6">
      {/* 使用场景与质量需求 - 放在最前面 */}
      {data.usage_context_analysis && (
        <UserProfileCard profile={data.usage_context_analysis as unknown as Record<string, unknown>} variant="supply_chain" />
      )}
      
      {/* 材质缺陷 */}
      {data.material_defects && data.material_defects.length > 0 && (
        <Card title="🔧 材质做工问题" icon={Wrench} variant="danger">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">部件</th>
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">问题</th>
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">频率</th>
                </tr>
              </thead>
              <tbody>
                {data.material_defects.map((defect, i) => {
                  if (typeof defect === 'object' && defect !== null) {
                    const defectObj = defect as { part?: string; problem?: string; frequency?: string; source_tag?: string };
                    const frequency = safeRender(defectObj.frequency);
                    return (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 font-medium text-gray-900 dark:text-white">{safeRender(defectObj.part)}</td>
                        <td className="py-2 text-gray-700 dark:text-gray-300">{safeRender(defectObj.problem)}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            frequency === 'High' 
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : frequency === 'Medium'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          }`}>
                            {frequency}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      <td colSpan={3} className="py-2 text-gray-700 dark:text-gray-300">{safeRender(defect)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 包装问题 */}
      {data.packaging_issues && (
        <Card 
          title="📦 包装与物流" 
          icon={Package} 
          variant={data.packaging_issues.is_damaged ? 'danger' : 'success'}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {data.packaging_issues.is_damaged ? (
                <AlertCircle className="size-5 text-red-500" />
              ) : (
                <CheckCircle2 className="size-5 text-emerald-500" />
              )}
              <span className={data.packaging_issues.is_damaged ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                {data.packaging_issues.is_damaged ? '存在包装破损问题' : '包装状况良好'}
              </span>
            </div>
            {data.packaging_issues.details && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">详情:</span> {data.packaging_issues.details}
              </p>
            )}
            {data.packaging_issues.improvement && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                <span className="font-medium">改进建议:</span> {data.packaging_issues.improvement}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* 漏发配件 */}
      {data.missing_parts && data.missing_parts.length > 0 && (
        <Card title="📋 常见漏发配件" icon={AlertCircle} variant="warning">
          <ul className="space-y-2">
            {data.missing_parts.map((part, i) => {
              // 处理对象或字符串两种格式
              const partText = typeof part === 'object' && part !== null 
                ? (part as { part?: string }).part || JSON.stringify(part)
                : String(part);
              return <ListItem key={i} variant="warning">{partText}</ListItem>;
            })}
          </ul>
        </Card>
      )}

      {/* QC 检查清单 */}
      {data.qc_checklist && data.qc_checklist.length > 0 && (
        <Card title="✅ 出货前 QC 检查清单" icon={Shield} variant="info">
          <ul className="space-y-2">
            {data.qc_checklist.map((item, i) => {
              // 处理对象或字符串两种格式
              let itemText = '';
              let priority = '';
              if (typeof item === 'object' && item !== null) {
                const itemObj = item as { item?: string; priority?: string; source_tag?: string };
                itemText = itemObj.item || JSON.stringify(item);
                priority = itemObj.priority || '';
              } else {
                itemText = String(item);
              }
              return (
                <li key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{itemText}</span>
                  {priority && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      priority === 'High' 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : priority === 'Medium'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}>
                      {priority}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 供应商问题 */}
      {data.supplier_issues && data.supplier_issues.length > 0 && (
        <Card title="🏭 供应商问题" icon={Package}>
          <div className="space-y-3">
            {data.supplier_issues.map((issue, i) => {
              if (typeof issue === 'object' && issue !== null) {
                const issueObj = issue as { component?: string; issue?: string; action?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{safeRender(issueObj.component)}</span>
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-400 mb-1">问题: {safeRender(issueObj.issue)}</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">措施: {safeRender(issueObj.action)}</p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(issue)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 退货原因 */}
      {data.return_rate_factors && data.return_rate_factors.length > 0 && (
        <Card title="📉 主要退货原因" icon={TrendingDown}>
          <div className="space-y-3">
            {data.return_rate_factors.map((factor, i) => {
              if (typeof factor === 'object' && factor !== null) {
                const factorObj = factor as { reason?: string; percentage?: string; solution?: string; source_tag?: string };
                return (
                  <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{safeRender(factorObj.reason)}</span>
                      {factorObj.percentage && (
                        <span className="text-sm text-gray-500">{safeRender(factorObj.percentage)}</span>
                      )}
                    </div>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">解决方案: {safeRender(factorObj.solution)}</p>
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(factor)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 组装缺陷 */}
      {data.assembly_defects && data.assembly_defects.length > 0 && (
        <Card title="🔩 组装问题" icon={Wrench}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">缺陷</th>
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">频率</th>
                  <th className="text-left py-2 text-gray-600 dark:text-gray-400">工位</th>
                </tr>
              </thead>
              <tbody>
                {data.assembly_defects.map((defect, i) => {
                  if (typeof defect === 'object' && defect !== null) {
                    const defectObj = defect as { defect?: string; frequency?: string; station?: string; source_tag?: string };
                    return (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 text-gray-900 dark:text-white">{safeRender(defectObj.defect)}</td>
                        <td className="py-2 text-gray-700 dark:text-gray-300">{safeRender(defectObj.frequency)}</td>
                        <td className="py-2 text-gray-700 dark:text-gray-300">{safeRender(defectObj.station)}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      <td colSpan={3} className="py-2 text-gray-700 dark:text-gray-300">{safeRender(defect)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
});

// ========== 主渲染器 ==========
export const JsonReportRenderer = memo(function JsonReportRenderer({
  content,
  reportType,
  analysisData,
  asin,
  onSectionsChange,
  onDrawerStateChange
}: JsonReportRendererProps) {
  const parsedContent = useMemo(() => safeParseJson(content), [content]);
  const config = REPORT_TYPE_CONFIG[reportType];
  
  // 收集所有板块标题
  const [sections, setSections] = useState<Array<{ id: string; title: string; level: number }>>([]);
  
  // 注册板块的函数（使用 ref 避免重复注册）
  const sectionsRef = useRef<Map<string, { id: string; title: string; level: number }>>(new Map());
  const updateTimerRef = useRef<number | null>(null);
  
  const registerSection = useCallback((id: string, title: string, level: number = 0) => {
    const existing = sectionsRef.current.get(id);
    // 如果内容相同，不更新
    if (existing && existing.title === title && existing.level === level) {
      return;
    }
    
    sectionsRef.current.set(id, { id, title, level });
    
    // 防抖更新，避免频繁渲染
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }
    
    updateTimerRef.current = window.setTimeout(() => {
      setSections(Array.from(sectionsRef.current.values()));
      updateTimerRef.current = null;
    }, 100);
  }, []);
  
  // 当内容变化时，清空 sections
  useEffect(() => {
    sectionsRef.current.clear();
    setSections([]);
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
  }, [content]);
  
  // 当 sections 变化时，通知父组件
  useEffect(() => {
    if (onSectionsChange && sections.length > 0) {
      onSectionsChange(sections);
    }
  }, [sections, onSectionsChange]);
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);
  
  // 证据抽屉状态
  const [evidenceDrawer, setEvidenceDrawer] = useState<{
    isOpen: boolean;
    title: string;
    evidence: EvidenceSample[];
    totalCount: number;
    sourceType: 'context' | 'insight';
    category: string;
  }>({
    isOpen: false,
    title: '',
    evidence: [],
    totalCount: 0,
    sourceType: 'insight',
    category: ''
  });
  
  // 打开证据抽屉的函数
  const openEvidence = useCallback((title: string, sourceTag: string, sourceType: 'context' | 'insight', category: string) => {
    if (!analysisData) return;
    
    // 根据 sourceType 和 category 查找对应的数据
    let dataArray: ChartDataItem[] = [];
    
    if (sourceType === 'context' && analysisData.context) {
      dataArray = (analysisData.context as unknown as Record<string, ChartDataItem[]>)[category] || [];
    } else if (sourceType === 'insight' && analysisData.insight) {
      dataArray = (analysisData.insight as unknown as Record<string, ChartDataItem[]>)[category] || [];
    }
    
    // 查找匹配 sourceTag 的数据项
    const matchedItem = dataArray.find(item => item.name === sourceTag);
    
    if (matchedItem) {
      setEvidenceDrawer({
        isOpen: true,
        title,
        evidence: matchedItem.evidence || [],
        totalCount: matchedItem.value,
        sourceType,
        category
      });
    }
  }, [analysisData]);
  
  // 关闭证据抽屉
  const closeEvidence = useCallback(() => {
    setEvidenceDrawer(prev => ({ ...prev, isOpen: false }));
  }, []);
  
  // 当抽屉状态变化时，通知父组件
  useEffect(() => {
    if (onDrawerStateChange) {
      onDrawerStateChange(evidenceDrawer.isOpen);
    }
  }, [evidenceDrawer.isOpen, onDrawerStateChange]);

  if (!parsedContent) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
          <AlertCircle className="size-5" />
          <span className="font-medium">报告解析失败</span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          无法解析报告内容，显示原始文本:
        </p>
        <pre className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-96">
          {content}
        </pre>
      </div>
    );
  }

  // 处理从 StatsDashboard 查看证据
  const handleViewEvidenceFromDashboard = useCallback((title: string, evidence: EvidenceSample[], totalCount: number) => {
    setEvidenceDrawer({
      isOpen: true,
      title,
      evidence,
      totalCount,
      sourceType: 'insight',
      category: ''
    });
  }, []);

  return (
    <TocContext.Provider value={{ registerSection }}>
      <EvidenceContext.Provider value={{ analysisData: analysisData || null, asin, openEvidence }}>
        <div>
        {/* 基础统计看板（硬数据）- 在 AI 分析之前展示 */}
        {analysisData && (
          <StatsDashboard 
            analysisData={analysisData}
            onViewEvidence={handleViewEvidenceFromDashboard}
          />
        )}
        
        {/* 报告类型标题 */}
        <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{config.icon}</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{config.label}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{config.description}</p>
            </div>
          </div>
          {analysisData && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
              <Search className="size-3" />
              点击带有 🔍 的观点可查看原始评论证据
            </p>
          )}
        </div>

        {/* 根据类型渲染不同内容 */}
        {reportType === 'comprehensive' && (
          <ComprehensiveRenderer data={parsedContent as ComprehensiveReportContent} />
        )}
        {reportType === 'operations' && (
          <OperationsRenderer data={parsedContent as OperationsReportContent} />
        )}
        {reportType === 'product' && (
          <ProductRenderer data={parsedContent as ProductReportContent} />
        )}
        {reportType === 'supply_chain' && (
          <SupplyChainRenderer data={parsedContent as SupplyChainReportContent} />
        )}
      </div>
      
      {/* 证据溯源抽屉 */}
      <EvidenceDrawer
        isOpen={evidenceDrawer.isOpen}
        onClose={closeEvidence}
        title={evidenceDrawer.title}
        totalCount={evidenceDrawer.totalCount}
        evidence={evidenceDrawer.evidence}
        sourceType={evidenceDrawer.sourceType}
        sourceCategory={evidenceDrawer.category}
        asin={asin}
      />
      </EvidenceContext.Provider>
    </TocContext.Provider>
  );
});

export default JsonReportRenderer;

