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
import { CompareReviewSidebar } from './CompareReviewSidebar';

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

// 置信度徽章组件
const ConfidenceBadge = memo(function ConfidenceBadge({ 
  confidence,
  showLabel = true 
}: { 
  confidence?: string;
  showLabel?: boolean;
}) {
  if (!confidence) return null;
  
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

// 解析 evidence 字符串为对象
function parseEvidenceString(evidence: unknown): { count?: number; percentage?: string; quotes?: string[] } | null {
  if (!evidence) return null;
  
  // 如果已经是对象
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
    const result: { count?: number; percentage?: string; quotes?: string[] } = {};
    
    // 提取 count
    const countMatch = evidence.match(/count:\s*(\d+)/);
    if (countMatch) result.count = parseInt(countMatch[1]);
    
    // 提取 percentage
    const percentMatch = evidence.match(/percentage:\s*([\d.]+%)/);
    if (percentMatch) result.percentage = percentMatch[1];
    
    // 提取 quotes
    const quotesMatch = evidence.match(/sample_quotes:\s*\[([^\]]+)\]/);
    if (quotesMatch) {
      const quotesStr = quotesMatch[1];
      result.quotes = quotesStr.split(/['"]\s*,\s*['"]/).map(q => q.replace(/^['"]|['"]$/g, '').trim()).filter(q => q.length > 0);
    }
    
    return result;
  }
  
  return null;
}

// 证据引用组件 - 显示证据计数和引用
const EvidenceBlock = memo(function EvidenceBlock({
  evidence,
  sourceTag
}: {
  evidence?: unknown;
  sourceTag?: string;
}) {
  const parsed = parseEvidenceString(evidence);
  
  if (!parsed || (!parsed.count && !parsed.quotes?.length)) {
    return null;
  }
  
  return (
    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
      <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-1">
        <Search className="size-3" />
        <span className="font-medium">
          📊 证据支持: {parsed.count || 0}条 
          {parsed.percentage && <span className="ml-1">({parsed.percentage})</span>}
        </span>
        {sourceTag && (
          <span className="text-gray-500 dark:text-gray-400">· 来源: {sourceTag}</span>
        )}
      </div>
      {parsed.quotes && parsed.quotes.length > 0 && (
        <div className="space-y-1 mt-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">💬 用户原话:</div>
          {parsed.quotes.slice(0, 2).map((quote, i) => (
            <div key={i} className="text-xs text-gray-600 dark:text-gray-400 italic pl-2 border-l-2 border-blue-200 dark:border-blue-700">
              "{quote.length > 60 ? quote.slice(0, 60) + '...' : quote}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// 简化版证据显示（用于表格等紧凑场景）
const EvidenceInline = memo(function EvidenceInline({ evidence }: { evidence?: unknown }) {
  const parsed = parseEvidenceString(evidence);
  
  if (!parsed || !parsed.count) return null;
  
  return (
    <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
      <div className="flex items-center gap-1 mb-1">
        <Search className="size-3" />
        <span className="font-medium">📊 {parsed.count}条证据 ({parsed.percentage || 'N/A'})</span>
      </div>
      {parsed.quotes && parsed.quotes.length > 0 && (
        <div className="text-gray-600 dark:text-gray-400 italic">
          💬 "{parsed.quotes[0].length > 50 ? parsed.quotes[0].slice(0, 50) + '...' : parsed.quotes[0]}"
        </div>
      )}
    </div>
  );
});

// 辅助函数：从新格式中提取描述（智能处理多种字段）
function extractDescription(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v : safeRender(v)).join('、');
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // 优先提取常见描述字段
    if (obj.description) return String(obj.description);
    if (obj.point) return String(obj.point);
    if (obj.summary) return String(obj.summary);
    if (obj.content) return String(obj.content);
    // 供应链版特殊字段
    if (obj.environments) {
      const parts: string[] = [];
      if (obj.environments) parts.push(`环境: ${Array.isArray(obj.environments) ? (obj.environments as string[]).join('、') : obj.environments}`);
      if (obj.environmental_stress_factors) parts.push(`压力因素: ${Array.isArray(obj.environmental_stress_factors) ? (obj.environmental_stress_factors as string[]).join('、') : obj.environmental_stress_factors}`);
      if (obj.quality_implications) parts.push(`质量要求: ${obj.quality_implications}`);
      return parts.join(' | ');
    }
    // 用户群体特殊字段
    if (obj.quality_expectations) {
      const parts: string[] = [];
      if (obj.description) parts.push(String(obj.description));
      if (obj.quality_expectations) parts.push(`质量期望: ${Array.isArray(obj.quality_expectations) ? (obj.quality_expectations as string[]).join('、') : obj.quality_expectations}`);
      return parts.join(' | ');
    }
    if (obj.special_requirements) {
      const parts: string[] = [];
      if (obj.description) parts.push(String(obj.description));
      if (obj.special_requirements) parts.push(`特殊需求: ${Array.isArray(obj.special_requirements) ? (obj.special_requirements as string[]).join('、') : obj.special_requirements}`);
      return parts.join(' | ');
    }
    // 使用强度
    if (obj.frequency) {
      const parts: string[] = [];
      if (obj.frequency) parts.push(`频率: ${obj.frequency}`);
      if (obj.duration) parts.push(`时长: ${obj.duration}`);
      if (obj.durability_requirements) parts.push(`耐久要求: ${Array.isArray(obj.durability_requirements) ? (obj.durability_requirements as string[]).join('、') : obj.durability_requirements}`);
      return parts.join(' | ');
    }
  }
  return safeRender(value);
}

// 辅助函数：从新格式中提取置信度
function extractConfidence(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  return obj.confidence ? String(obj.confidence) : undefined;
}

// 辅助函数：从新格式中提取证据
function extractEvidence(value: unknown): { count?: number; percentage?: string; sample_ids?: string[]; sample_quotes?: string[] } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (!obj.evidence) return undefined;
  return obj.evidence as { count?: number; percentage?: string; sample_ids?: string[]; sample_quotes?: string[] };
}

// ========== 用户画像卡片组件 (共用) ==========
const UserProfileCard = memo(function UserProfileCard({ 
  profile,
  variant = 'comprehensive'
}: { 
  profile: Record<string, unknown>;
  variant?: 'comprehensive' | 'operations' | 'product' | 'supply_chain';
}) {
  if (!profile) return null;
  
  // 根据不同报告类型，字段名可能不同（2026-01-14: 区分 buyer 和 user）
  const coreBuyers = profile.core_buyers || profile.primary_buyers || profile.target_buyers || profile.buyer_groups;
  const coreUsers = profile.core_users || profile.primary_users || profile.primary_audience || profile.target_users || profile.user_groups;
  const scenarios = profile.usage_scenarios || profile.usage_context || profile.real_usage_environments || profile.usage_environments;
  const motivation = profile.purchase_motivation || profile.buying_triggers;
  const jtbd = profile.jobs_to_be_done || profile.use_cases || profile.user_goals;
  const summary = profile.persona_insight || profile.unmet_expectations || profile.environmental_requirements;
  
  return (
    <Card title="👤 用户画像5w概况" icon={Users} variant="info">
      <div className="space-y-4">
        {/* 购买者 - 支持新格式（带置信度和证据） */}
        {coreBuyers && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Buyer - 购买者群体</span>
              <ConfidenceBadge confidence={extractConfidence(coreBuyers)} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(coreBuyers) ? coreBuyers.map(safeRender).join('、') : extractDescription(coreBuyers)}
            </p>
            <EvidenceBlock evidence={extractEvidence(coreBuyers)} />
          </div>
        )}
        
        {/* 使用者 - 支持新格式（带置信度和证据） */}
        {coreUsers && (
          <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">User - 使用者群体</span>
              <ConfidenceBadge confidence={extractConfidence(coreUsers)} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(coreUsers) ? coreUsers.map(safeRender).join('、') : extractDescription(coreUsers)}
            </p>
            <EvidenceBlock evidence={extractEvidence(coreUsers)} />
          </div>
        )}
        
        {/* 兼容旧数据：如果没有 buyer/user，显示旧的 who */}
        {!coreBuyers && !coreUsers && (profile.core_users || profile.primary_audience || profile.target_users || profile.user_groups) && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Who - 核心用户群体（旧数据）</div>
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
        
        {/* 使用场景 - 支持新格式 */}
        {scenarios && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-400">Where/When - 使用场景</span>
              <ConfidenceBadge confidence={extractConfidence(scenarios)} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(scenarios) ? scenarios.map(safeRender).join('、') : extractDescription(scenarios)}
            </p>
            <EvidenceBlock evidence={extractEvidence(scenarios)} />
          </div>
        )}
        
        {/* 购买动机 - 支持新格式 */}
        {motivation && (
          <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-pink-700 dark:text-pink-400">Why - 购买动机</span>
              <ConfidenceBadge confidence={extractConfidence(motivation)} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(motivation) ? motivation.map(safeRender).join('、') : extractDescription(motivation)}
            </p>
            <EvidenceBlock evidence={extractEvidence(motivation)} />
          </div>
        )}
        
        {/* 用户任务/JTBD - 支持新格式 */}
        {jtbd && (
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">What - 用户任务 (JTBD)</span>
              <ConfidenceBadge confidence={extractConfidence(jtbd)} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {Array.isArray(jtbd) ? jtbd.map(safeRender).join('、') : extractDescription(jtbd)}
            </p>
            <EvidenceBlock evidence={extractEvidence(jtbd)} />
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
  // 通用渲染数组项的辅助函数
  const renderArrayItems = (items: unknown[], renderItem: (item: Record<string, unknown>, i: number) => React.ReactNode) => {
    if (!Array.isArray(items)) return null;
    return items.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        return renderItem(item as Record<string, unknown>, i);
      }
      return <p key={i} className="text-gray-700 dark:text-gray-300">{String(item)}</p>;
    });
  };

  return (
    <div className="space-y-6">
      {/* 用户画像分析 - 新格式：数组 [{aspect, insight, evidence, confidence}] */}
      {data.user_profile && Array.isArray(data.user_profile) && data.user_profile.length > 0 && (
        <Card title="👥 用户画像分析" icon={Users} variant="info">
          <div className="space-y-4">
            {renderArrayItems(data.user_profile, (item, i) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  {item.aspect && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                      {String(item.aspect)}
                    </span>
                  )}
                  {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{String(item.insight || '')}</p>
                {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                  <EvidenceInline evidence={item.evidence} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* 旧格式兼容 */}
      {data.user_profile && !Array.isArray(data.user_profile) && typeof data.user_profile === 'object' && (
        <UserProfileCard profile={data.user_profile as unknown as Record<string, unknown>} variant="comprehensive" />
      )}
      
      {/* 战略定调 */}
      <Card title="🎯 战略定调" icon={Target} variant="info">
        {typeof data.strategic_verdict === 'string' ? (
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.strategic_verdict}</p>
        ) : Array.isArray(data.strategic_verdict) ? (
          <div className="space-y-3">
            {renderArrayItems(data.strategic_verdict, (item, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-gray-700 dark:text-gray-300">{String(item.verdict || item.insight || '')}</p>
                  {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                </div>
                {item.evidence && Array.isArray(item.evidence) && <EvidenceInline evidence={item.evidence} />}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-700 dark:text-gray-300">{JSON.stringify(data.strategic_verdict)}</p>
        )}
        {data.risk_level && (
          <div className="mt-3">
            <RiskBadge level={typeof data.risk_level === 'string' ? data.risk_level : 'medium'} />
          </div>
        )}
      </Card>

      {/* 市场匹配度分析 - 新格式：数组 [{insight, evidence, confidence, analysis}] */}
      {data.market_fit_analysis && (
        <Card title="📊 市场匹配度分析" icon={TrendingUp}>
          {typeof data.market_fit_analysis === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.market_fit_analysis}</p>
          ) : Array.isArray(data.market_fit_analysis) ? (
            <div className="space-y-4">
              {renderArrayItems(data.market_fit_analysis, (item, i) => (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start gap-2 mb-2">
                    <p className="flex-1 font-medium text-gray-900 dark:text-white">{String(item.insight || '')}</p>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {item.analysis && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{String(item.analysis)}</p>
                  )}
                  {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                    <EvidenceInline evidence={item.evidence} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">{JSON.stringify(data.market_fit_analysis)}</p>
          )}
        </Card>
      )}

      {/* SWOT 分析 - 兼容中英文键名 */}
      {data.core_swot && (() => {
        // 兼容中英文键名
        const swot = data.core_swot as Record<string, unknown>;
        const strengths = (swot.strengths || swot['优势'] || []) as unknown[];
        const weaknesses = (swot.weaknesses || swot['劣势'] || []) as unknown[];
        const opportunities = (swot.opportunities || swot['机会'] || []) as unknown[];
        const threats = (swot.threats || swot['威胁'] || []) as unknown[];
        
        // 渲染单个 SWOT 项
        const renderSwotItem = (item: unknown, variant: 'success' | 'danger' | 'info' | 'warning', icon: string, key: number) => {
          const bgColors = {
            success: 'bg-emerald-50 dark:bg-emerald-900/20',
            danger: 'bg-red-50 dark:bg-red-900/20',
            info: 'bg-blue-50 dark:bg-blue-900/20',
            warning: 'bg-amber-50 dark:bg-amber-900/20'
          };
          
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            // 🔧 [FIX] 兼容多种字段名：point, dimension, name, insight, description, item, 描述
            const text = String(
              obj.point || 
              obj.dimension || 
              obj.name || 
              obj.insight || 
              obj.description || 
              obj.item ||
              obj['描述'] || 
              obj['维度'] ||
              ''
            );
            const confidence = String(obj.confidence || obj['置信度'] || '');
            const evidence = (obj.evidence || obj['证据'] || []) as unknown[];
            
            return (
              <li key={key} className={`p-2 ${bgColors[variant]} rounded`}>
                <div className="flex items-center gap-2">
                  <span>{icon}</span>
                  <span className="flex-1 text-sm font-medium">{text}</span>
                  {confidence && <ConfidenceBadge confidence={confidence} />}
                </div>
                {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
              </li>
            );
          }
          return <li key={key} className="p-2 text-sm">{String(item)}</li>;
        };
        
        return (
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
        );
      })()}

      {/* 部门指令 - 新格式：可能是数组 */}
      {data.department_directives && (
        <Card title="📋 各部门指令" icon={Users}>
          {Array.isArray(data.department_directives) ? (
            <div className="space-y-3">
              {renderArrayItems(data.department_directives, (item, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {String(item.department || item.to || `指令 ${i + 1}`)}
                    </span>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{String(item.directive || item.action || '')}</p>
                  {item.evidence && Array.isArray(item.evidence) && <EvidenceInline evidence={item.evidence} />}
                </div>
              ))}
            </div>
          ) : typeof data.department_directives === 'object' ? (
            <div className="space-y-3">
              {(data.department_directives as { to_marketing?: string }).to_marketing && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-medium mb-1">
                    <Megaphone className="size-4" />
                    To 市场营销
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{(data.department_directives as { to_marketing?: string }).to_marketing}</p>
                </div>
              )}
              {(data.department_directives as { to_product?: string }).to_product && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-medium mb-1">
                    <Wrench className="size-4" />
                    To 产品研发
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{(data.department_directives as { to_product?: string }).to_product}</p>
                </div>
              )}
              {(data.department_directives as { to_supply_chain?: string }).to_supply_chain && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm font-medium mb-1">
                    <Package className="size-4" />
                    To 供应链
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{(data.department_directives as { to_supply_chain?: string }).to_supply_chain}</p>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* 优先行动项 - 新格式 */}
      {data.priority_actions && data.priority_actions.length > 0 && (
        <Card title="⚡ 优先行动项" icon={Zap}>
          <div className="space-y-3">
            {data.priority_actions.map((action, i) => {
              const actionText = typeof action === 'object' && action !== null
                ? (action as { action?: string }).action || (action as { task?: string }).task || JSON.stringify(action)
                : String(action);
              const owner = typeof action === 'object' ? (action as { owner?: string }).owner || '' : '';
              const deadline = typeof action === 'object' ? (action as { deadline?: string }).deadline || '' : '';
              const priority = typeof action === 'object' ? (action as { priority?: string }).priority || '' : '';
              const confidence = typeof action === 'object' ? (action as { confidence?: string }).confidence || '' : '';
              const evidence = typeof action === 'object' ? (action as { evidence?: unknown[] }).evidence || [] : [];
              
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
                    {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                  </div>
                </div>
              );
            })}
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
  // 通用渲染数组项的辅助函数
  const renderArrayItems = (items: unknown[], renderItem: (item: Record<string, unknown>, i: number) => React.ReactNode) => {
    if (!Array.isArray(items)) return null;
    return items.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        return renderItem(item as Record<string, unknown>, i);
      }
      return <p key={i} className="text-gray-700 dark:text-gray-300">{String(item)}</p>;
    });
  };

  return (
    <div className="space-y-6">
      {/* 用户画像 - 新格式：数组 [{tag, description, evidence, confidence}] */}
      {data.user_profile && Array.isArray(data.user_profile) && data.user_profile.length > 0 && (
        <Card title="👥 用户画像与市场定位" icon={Users} variant="info">
          <div className="space-y-4">
            {renderArrayItems(data.user_profile, (item, i) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{String(item.tag || '')}</h4>
                  {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{String(item.description || '')}</p>
                {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                  <EvidenceInline evidence={item.evidence} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* 旧格式兼容 */}
      {data.user_profile && !Array.isArray(data.user_profile) && typeof data.user_profile === 'object' && (
        <UserProfileCard profile={data.user_profile as unknown as Record<string, unknown>} variant="operations" />
      )}
      
      {/* 执行摘要 - 新格式：数组 [{insight, evidence, confidence}] */}
      {data.executive_summary && (
        <Card title="📢 市场现状" icon={Megaphone} variant="info">
          {typeof data.executive_summary === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{data.executive_summary}</p>
          ) : Array.isArray(data.executive_summary) ? (
            <div className="space-y-4">
              {renderArrayItems(data.executive_summary, (item, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-gray-700 dark:text-gray-300">{String(item.insight || item.summary || '')}</p>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                    <div className="mt-2"><EvidenceInline evidence={item.evidence} /></div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">{JSON.stringify(data.executive_summary)}</p>
          )}
        </Card>
      )}

      {/* 核心卖点 - 新格式：数组 [{point, evidence, confidence}] */}
      {data.selling_points && data.selling_points.length > 0 && (
        <Card title="💎 核心卖点" icon={Star} variant="success">
          <div className="space-y-4">
            {renderArrayItems(data.selling_points, (sp, i) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {String(sp.point || sp.title || sp.copywriting || '')}
                      </p>
                      {sp.confidence && <ConfidenceBadge confidence={String(sp.confidence)} />}
                    </div>
                  </div>
                </div>
                {sp.evidence && Array.isArray(sp.evidence) && sp.evidence.length > 0 && (
                  <EvidenceInline evidence={sp.evidence} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 营销风险 - 新格式 */}
      {data.marketing_risks && data.marketing_risks.length > 0 && (
        <Card title="⚠️ 客服预警 (需准备话术)" icon={AlertCircle} variant="danger">
          <div className="space-y-3">
            {renderArrayItems(data.marketing_risks, (risk, i) => (
              <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="size-4 text-red-500" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {String(risk.risk || risk.issue || '')}
                  </span>
                  {risk.confidence && <ConfidenceBadge confidence={String(risk.confidence)} />}
                </div>
                {risk.talking_points && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 ml-6 mb-2">
                    <span className="font-medium">应对话术:</span> {String(risk.talking_points)}
                  </p>
                )}
                {risk.evidence && Array.isArray(risk.evidence) && risk.evidence.length > 0 && (
                  <div className="ml-6"><EvidenceInline evidence={risk.evidence} /></div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 目标受众 - 新格式：可能是数组 */}
      {data.target_audience && (
        <Card title="🎯 广告投放建议" icon={Target}>
          {Array.isArray(data.target_audience) ? (
            <div className="space-y-3">
              {renderArrayItems(data.target_audience, (item, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {String(item.segment || item.audience || item.who || '')}
                    </p>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {item.strategy && <p className="text-sm text-gray-600 dark:text-gray-400">{String(item.strategy)}</p>}
                  {item.evidence && Array.isArray(item.evidence) && <EvidenceInline evidence={item.evidence} />}
                </div>
              ))}
            </div>
          ) : typeof data.target_audience === 'object' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">目标人群</h4>
                  <div className="flex flex-wrap gap-2">
                    {(data.target_audience as { who?: string[] }).who?.map((w: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">投放场景</h4>
                  <div className="flex flex-wrap gap-2">
                    {(data.target_audience as { scenario?: string[] }).scenario?.map((s: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {(data.target_audience as { strategy?: string }).strategy && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">投放策略</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{(data.target_audience as { strategy?: string }).strategy}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">{String(data.target_audience)}</p>
          )}
        </Card>
      )}

      {/* 竞品分析 - 新格式：可能是数组 */}
      {data.competitor_analysis && (
        <Card title="🔍 竞品分析" icon={TrendingUp}>
          {typeof data.competitor_analysis === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300">{data.competitor_analysis}</p>
          ) : Array.isArray(data.competitor_analysis) ? (
            <div className="space-y-3">
              {renderArrayItems(data.competitor_analysis, (item, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-gray-700 dark:text-gray-300">{String(item.analysis || item.insight || item.point || '')}</p>
                    {item.confidence && <ConfidenceBadge confidence={String(item.confidence)} />}
                  </div>
                  {item.evidence && Array.isArray(item.evidence) && <EvidenceInline evidence={item.evidence} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">{JSON.stringify(data.competitor_analysis)}</p>
          )}
        </Card>
      )}

      {/* Listing 优化建议 - 新格式 */}
      {data.listing_optimization && data.listing_optimization.length > 0 && (
        <Card title="📝 Listing 优化建议" icon={FileText}>
          <div className="space-y-3">
            {renderArrayItems(data.listing_optimization, (opt, i) => {
              // 兼容多种字段名
              const tag = String(opt.tag || opt.element || '');
              const content = String(opt.content || opt.suggestion || opt.optimization || '');
              const confidence = String(opt.confidence || '');
              const evidence = (opt.evidence || []) as unknown[];
              
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {tag && (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                        {tag}
                      </span>
                    )}
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{content}</p>
                  {evidence.length > 0 && <EvidenceInline evidence={evidence} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 差评回复模板 - 新格式 */}
      {data.review_response_templates && data.review_response_templates.length > 0 && (
        <Card title="💬 差评回复模板" icon={MessageSquare}>
          <div className="space-y-3">
            {renderArrayItems(data.review_response_templates, (tpl, i) => (
              <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                    痛点: {String(tpl.pain_point || tpl.issue || '')}
                  </span>
                  {tpl.confidence && <ConfidenceBadge confidence={String(tpl.confidence)} />}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic mb-2">
                  "{String(tpl.response || tpl.template || '')}"
                </p>
                {tpl.evidence && Array.isArray(tpl.evidence) && <EvidenceInline evidence={tpl.evidence} />}
              </div>
            ))}
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
  // 处理 quality_score - 可能是数字或对象
  const qualityScore = typeof data.quality_score === 'object' && data.quality_score !== null
    ? (data.quality_score as { score?: number }).score || 0
    : (typeof data.quality_score === 'number' ? data.quality_score : 0);
  
  // 转换为百分比（如果是10分制）
  const scorePercent = qualityScore <= 10 ? qualityScore * 10 : qualityScore;
  
  // 质量原因
  const qualityReasons = typeof data.quality_score === 'object' && data.quality_score !== null
    ? (data.quality_score as { reasons?: Array<{ issue?: string; evidence?: unknown[]; confidence?: string }> }).reasons || []
    : [];

  return (
    <div className="space-y-6">
      {/* 用户研究洞察 - 新格式：数组 */}
      {data.user_research && Array.isArray(data.user_research) && data.user_research.length > 0 && (
        <Card title="🔬 用户研究洞察" icon={Users} variant="info">
          <div className="space-y-4">
            {data.user_research.map((item: { insight?: string; evidence?: unknown[]; confidence?: string }, i: number) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {item.insight || ''}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {item.confidence && <ConfidenceBadge confidence={item.confidence} />}
                      {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                        <span className="text-xs text-gray-500">
                          📎 {item.evidence.length} 条证据
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* 旧格式兼容：user_research 为对象 */}
      {data.user_research && !Array.isArray(data.user_research) && typeof data.user_research === 'object' && (
        <UserProfileCard profile={data.user_research as unknown as Record<string, unknown>} variant="product" />
      )}
      
      {/* 质量评分 */}
      <Card title="📊 产品质量评分" icon={TrendingUp} variant="info">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {qualityScore.toFixed(1)}
          </div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  scorePercent >= 80 ? 'bg-emerald-500' :
                  scorePercent >= 60 ? 'bg-yellow-500' :
                  scorePercent >= 40 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {scorePercent >= 80 ? '优秀' :
               scorePercent >= 60 ? '良好' :
               scorePercent >= 40 ? '需改进' : '严重问题'}
            </p>
          </div>
        </div>
        {/* 质量问题原因 */}
        {qualityReasons.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <h5 className="text-sm font-medium text-gray-600 dark:text-gray-400">扣分原因：</h5>
            {qualityReasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-red-500">•</span>
                <div className="flex-1">
                  <span className="text-gray-700 dark:text-gray-300">{reason.issue || ''}</span>
                  {reason.confidence && <ConfidenceBadge confidence={reason.confidence} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 致命缺陷 - 新格式 */}
      {data.critical_bugs && data.critical_bugs.length > 0 && (
        <Card title="🐛 致命缺陷" icon={AlertTriangle} variant="danger">
          <div className="space-y-4">
            {data.critical_bugs.map((bug, i) => {
              // 兼容新旧格式
              const bugText = (bug as { bug?: string }).bug || (bug as { issue?: string }).issue || '';
              const impactText = (bug as { impact?: string }).impact || '';
              const relatedJtbd = (bug as { related_jtbd?: string }).related_jtbd || '';
              const userSegments = (bug as { user_segments?: string[] }).user_segments || [];
              const usageScenarios = (bug as { usage_scenarios?: string[] }).usage_scenarios || [];
              const evidence = (bug as { evidence?: unknown[] }).evidence || [];
              const confidence = (bug as { confidence?: string }).confidence || '';
              const severity = (bug as { severity?: string }).severity || '';
              const suggestion = (bug as { suggestion?: string }).suggestion || '';
              const rootCause = (bug as { root_cause_guess?: string }).root_cause_guess || '';
              
              return (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">{bugText}</h4>
                    <div className="flex items-center gap-2">
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                      {severity && <SeverityBadge severity={severity} />}
                    </div>
                  </div>
                  {impactText && (
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                      <span className="font-medium">影响:</span> {impactText}
                    </p>
                  )}
                  {relatedJtbd && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      <span className="font-medium">相关JTBD:</span> {relatedJtbd}
                    </p>
                  )}
                  {userSegments.length > 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      <span className="font-medium">影响人群:</span> {userSegments.join('、')}
                    </p>
                  )}
                  {usageScenarios.length > 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      <span className="font-medium">使用场景:</span> {usageScenarios.join('、')}
                    </p>
                  )}
                  {rootCause && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <span className="font-medium">可能原因:</span> {rootCause}
                    </p>
                  )}
                  {suggestion && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-2">
                      <span className="font-medium">建议:</span> {suggestion}
                    </p>
                  )}
                  {evidence.length > 0 && (
                    <EvidenceInline evidence={evidence} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 未满足需求 - 新格式 */}
      {data.unmet_needs && data.unmet_needs.length > 0 && (
        <Card title="💡 未满足需求与迭代方向" icon={Lightbulb} variant="warning">
          <div className="space-y-3">
            {data.unmet_needs.map((need, i) => {
              // 兼容新旧格式
              if (typeof need === 'object' && need !== null) {
                const needText = (need as { need?: string }).need || (need as { feature?: string }).feature || '';
                const reasonText = (need as { rationale?: string }).rationale || (need as { reason?: string }).reason || '';
                const evidence = (need as { evidence?: unknown[] }).evidence || [];
                const confidence = (need as { confidence?: string }).confidence || '';
                
                return (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="size-4 text-amber-500" />
                      <span className="font-medium text-gray-900 dark:text-white">{needText}</span>
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    {reasonText && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 ml-6 mb-2">{reasonText}</p>
                    )}
                    {evidence.length > 0 && (
                      <div className="ml-6">
                        <EvidenceInline evidence={evidence} />
                      </div>
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
      {data.usage_context_gap && (
        <Card title="🔍 使用场景差异分析" icon={Target}>
          {typeof data.usage_context_gap === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {data.usage_context_gap}
            </p>
          ) : Array.isArray(data.usage_context_gap) ? (
            <div className="space-y-3">
              {data.usage_context_gap.map((gap: { gap?: string; evidence?: unknown[]; confidence?: string }, i: number) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-gray-700 dark:text-gray-300">{gap.gap || JSON.stringify(gap)}</p>
                  {gap.confidence && <ConfidenceBadge confidence={gap.confidence} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {JSON.stringify(data.usage_context_gap)}
            </p>
          )}
        </Card>
      )}

      {/* 迭代建议 - 新格式为数组 */}
      {data.roadmap_suggestion && (
        <Card title="🚀 下版本升级方向" icon={TrendingUp} variant="success">
          {typeof data.roadmap_suggestion === 'string' ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
              {data.roadmap_suggestion}
            </p>
          ) : Array.isArray(data.roadmap_suggestion) ? (
            <div className="space-y-4">
              {data.roadmap_suggestion.map((item: { suggestion?: string; impact?: string; evidence?: unknown[]; confidence?: string; priority?: string }, i: number) => (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 dark:text-white">{item.suggestion || ''}</p>
                    <div className="flex items-center gap-2">
                      {item.priority && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          item.priority === 'P0' ? 'bg-red-100 text-red-800' :
                          item.priority === 'P1' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>{item.priority}</span>
                      )}
                      {item.confidence && <ConfidenceBadge confidence={item.confidence} />}
                    </div>
                  </div>
                  {item.impact && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-2">
                      <span className="font-medium">预期影响:</span> {item.impact}
                    </p>
                  )}
                  {item.evidence && Array.isArray(item.evidence) && item.evidence.length > 0 && (
                    <EvidenceInline evidence={item.evidence} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
              {JSON.stringify(data.roadmap_suggestion)}
            </p>
          )}
        </Card>
      )}

      {/* 易用性问题 - 新格式 */}
      {data.usability_issues && data.usability_issues.length > 0 && (
        <Card title="👤 易用性问题" icon={Users}>
          <div className="space-y-3">
            {data.usability_issues.map((issue, i) => {
              if (typeof issue === 'object' && issue !== null) {
                const issueText = (issue as { issue?: string }).issue || '';
                const userGroup = (issue as { user_group?: string }).user_group || '';
                const suggestion = (issue as { suggestion?: string }).suggestion || '';
                const evidence = (issue as { evidence?: unknown[] }).evidence || [];
                const confidence = (issue as { confidence?: string }).confidence || '';
                
                return (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900 dark:text-white">{issueText}</p>
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    {userGroup && (
                      <p className="text-xs text-gray-500 mb-2">影响人群: {userGroup}</p>
                    )}
                    {suggestion && (
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-2">建议: {suggestion}</p>
                    )}
                    {evidence.length > 0 && (
                      <EvidenceInline evidence={evidence} />
                    )}
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

      {/* 设计建议 - 新格式 */}
      {data.design_recommendations && data.design_recommendations.length > 0 && (
        <Card title="🎨 设计改进建议" icon={Wrench}>
          <div className="space-y-3">
            {data.design_recommendations.map((rec, i) => {
              // 兼容新格式
              const recText = (rec as { recommendation?: string }).recommendation || (rec as { area?: string }).area || '';
              const impact = (rec as { impact?: string }).impact || (rec as { suggestion?: string }).suggestion || '';
              const evidence = (rec as { evidence?: unknown[] }).evidence || [];
              const confidence = (rec as { confidence?: string }).confidence || '';
              
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 dark:text-white">{recText || JSON.stringify(rec)}</p>
                    {confidence && <ConfidenceBadge confidence={confidence} />}
                  </div>
                  {impact && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{impact}</p>
                  )}
                  {evidence.length > 0 && (
                    <EvidenceInline evidence={evidence} />
                  )}
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
      
      {/* 质量概况 - 新增 */}
      {(data as any).quality_summary && (
        <Card title="📊 质量评估概况" icon={TrendingUp} variant="info">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">{(data as any).quality_summary.overall_quality_score || 'N/A'}</div>
              <div className="text-xs text-gray-500">质量评分</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{(data as any).quality_summary.estimated_return_rate || 'N/A'}</div>
              <div className="text-xs text-gray-500">预估退货率</div>
            </div>
          </div>
          {(data as any).quality_summary.top_quality_issues && (
            <div className="mt-3">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">主要质量问题:</div>
              <div className="flex flex-wrap gap-2">
                {(data as any).quality_summary.top_quality_issues.map((issue: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(data as any).quality_summary.improvement_priority && (
            <div className="mt-3 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded text-sm text-emerald-700 dark:text-emerald-400">
              💡 优先改进方向: {(data as any).quality_summary.improvement_priority}
            </div>
          )}
        </Card>
      )}

      {/* 材质缺陷 - 增强版 */}
      {data.material_defects && (
        <Card title="🔧 材质做工问题" icon={Wrench} variant="danger">
          <div className="space-y-4">
            {(() => {
              // 支持两种格式：对象格式（包含issues数组）和数组格式
              const defects = (data.material_defects as any).issues || 
                            (Array.isArray(data.material_defects) ? data.material_defects : []);
              
              if (defects.length === 0) return null;
              
              return defects.map((defect: any, i: number) => {
                if (typeof defect === 'object' && defect !== null) {
                  const defectObj = defect as any;
                  // 支持新格式（issue/impact）和旧格式（part/problem）
                  const issue = defectObj.issue || defectObj.problem || '';
                  const impact = defectObj.impact || defectObj.root_cause_hypothesis || '';
                  const frequency = safeRender(defectObj.frequency);
                  
                  return (
                    <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-semibold text-gray-900 dark:text-white">{issue || safeRender(defectObj.part)}</span>
                          {frequency && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              frequency === 'High' 
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : frequency === 'Medium'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            }`}>
                              {frequency}
                            </span>
                          )}
                          <ConfidenceBadge confidence={defectObj.confidence} />
                        </div>
                      </div>
                      {impact && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <span className="font-medium">影响分析:</span> {impact}
                        </p>
                      )}
                      {defectObj.suggested_fix && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">
                          <span className="font-medium">建议修复:</span> {defectObj.suggested_fix}
                        </p>
                      )}
                      {defectObj.supplier_action && (
                        <p className="text-sm text-blue-600 dark:text-blue-400">
                          <span className="font-medium">供应商整改:</span> {defectObj.supplier_action}
                        </p>
                      )}
                      {defectObj.evidence && (
                        <div className="mt-2">
                          <EvidenceInline evidence={defectObj.evidence} />
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(defect)}</p>
                  </div>
                );
              });
            })()}
          </div>
        </Card>
      )}

      {/* 包装问题 - 兼容新旧格式 */}
      {data.packaging_issues && (
        <Card 
          title="📦 包装与物流" 
          icon={Package} 
          variant={(data.packaging_issues.is_damaged || (data.packaging_issues as any).has_damage_reports || ((data.packaging_issues as any).issues && (data.packaging_issues as any).issues.length > 0)) ? 'danger' : 'success'}
        >
          <div className="space-y-3">
            {/* 新格式：issues 数组 */}
            {((data.packaging_issues as any).issues && Array.isArray((data.packaging_issues as any).issues)) ? (
              <div className="space-y-3">
                {(data.packaging_issues as any).issues.map((issueItem: any, idx: number) => (
                  <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{issueItem.issue}</span>
                      <ConfidenceBadge confidence={issueItem.confidence} />
                    </div>
                    {issueItem.impact && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span className="font-medium">影响分析:</span> {issueItem.impact}
                      </p>
                    )}
                    {issueItem.evidence && (
                      <div className="mt-2">
                        <EvidenceInline evidence={issueItem.evidence} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* 旧格式：单个对象 */
              <>
                <div className="flex items-center gap-2">
                  {(data.packaging_issues.is_damaged || (data.packaging_issues as any).has_damage_reports) ? (
                    <AlertCircle className="size-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="size-5 text-emerald-500" />
                  )}
                  <span className={(data.packaging_issues.is_damaged || (data.packaging_issues as any).has_damage_reports) ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                    {(data.packaging_issues.is_damaged || (data.packaging_issues as any).has_damage_reports) ? '存在包装破损问题' : '包装状况良好'}
                  </span>
                  <ConfidenceBadge confidence={(data.packaging_issues as any).confidence} />
                </div>
                {/* 兼容新格式 damage_types */}
                {((data.packaging_issues as any).damage_types || data.packaging_issues.details) && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">详情:</span> {
                      Array.isArray((data.packaging_issues as any).damage_types) 
                        ? (data.packaging_issues as any).damage_types.join('、') 
                        : data.packaging_issues.details
                    }
                  </p>
                )}
                {/* 兼容新格式 improvement_suggestions */}
                {((data.packaging_issues as any).improvement_suggestions || data.packaging_issues.improvement) && (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    <span className="font-medium">改进建议:</span> {
                      Array.isArray((data.packaging_issues as any).improvement_suggestions) 
                        ? (data.packaging_issues as any).improvement_suggestions.join('、') 
                        : data.packaging_issues.improvement
                    }
                  </p>
                )}
                {/* 显示证据 */}
                {(data.packaging_issues as any).evidence && (
                  <EvidenceInline evidence={(data.packaging_issues as any).evidence} />
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {/* 漏发配件 */}
      {data.missing_parts && data.missing_parts.length > 0 && (
        <Card title="📋 常见漏发配件" icon={AlertCircle} variant="warning">
          <div className="space-y-3">
            {data.missing_parts.map((part, i) => {
              // 处理对象或字符串两种格式
              if (typeof part === 'object' && part !== null) {
                const partObj = part as any;
                const partText = partObj.part || JSON.stringify(part);
                return (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{partText}</span>
                      <ConfidenceBadge confidence={partObj.confidence} />
                    </div>
                    {partObj.impact_analysis && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span className="font-medium">影响分析:</span> {partObj.impact_analysis}
                      </p>
                    )}
                    {partObj.evidence && (
                      <div className="mt-2">
                        <EvidenceInline evidence={partObj.evidence} />
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={i} className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <ListItem variant="warning">{String(part)}</ListItem>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* QC 检查清单 - 增强版 */}
      {data.qc_checklist && data.qc_checklist.length > 0 && (
        <Card title="✅ 出货前 QC 检查清单" icon={Shield} variant="info">
          <div className="space-y-3">
            {data.qc_checklist.map((item, i) => {
              if (typeof item === 'object' && item !== null) {
                const itemObj = item as any;
                // 支持两种格式：新格式（issue/suggestion）和旧格式（item/check_method）
                const issue = itemObj.issue || itemObj.item || '';
                const suggestion = itemObj.suggestion || itemObj.acceptance_criteria || '';
                const priority = itemObj.priority || '';
                
                return (
                  <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2 flex-1">
                        <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-white">{issue}</span>
                            {priority && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                priority === 'Critical' || priority === 'High' 
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                  : priority === 'Medium'
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              }`}>
                                {priority}
                              </span>
                            )}
                            <ConfidenceBadge confidence={itemObj.confidence} />
                          </div>
                          {suggestion && (
                            <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                              <span className="font-medium">建议:</span> {suggestion}
                            </p>
                          )}
                          {itemObj.check_method && !suggestion && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              <span className="font-medium">检查方法:</span> {itemObj.check_method}
                            </p>
                          )}
                          {itemObj.related_complaints && (
                            <p className="text-xs text-gray-500 mt-1">
                              相关投诉: {itemObj.related_complaints}条
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 显示证据 */}
                    {itemObj.evidence && (
                      <div className="mt-2">
                        <EvidenceInline evidence={itemObj.evidence} />
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{safeRender(item)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 供应商问题 - 增强版 */}
      {data.supplier_issues && data.supplier_issues.length > 0 && (
        <Card title="🏭 供应商问题" icon={Package}>
          <div className="space-y-3">
            {data.supplier_issues.map((issue, i) => {
              if (typeof issue === 'object' && issue !== null) {
                const issueObj = issue as any;
                return (
                  <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {safeRender(issueObj.issue || issueObj.component)}
                        </span>
                        {issueObj.severity && (
                          <SeverityBadge severity={issueObj.severity} />
                        )}
                        <ConfidenceBadge confidence={issueObj.confidence} />
                      </div>
                    </div>
                    {issueObj.impact_analysis && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span className="font-medium">影响分析:</span> {issueObj.impact_analysis}
                      </p>
                    )}
                    {issueObj.action || issueObj.recommended_action ? (
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-1">
                        <span className="font-medium">建议措施:</span> {safeRender(issueObj.action || issueObj.recommended_action)}
                      </p>
                    ) : null}
                    {issueObj.timeline && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        <span className="font-medium">整改时间:</span> {issueObj.timeline}
                      </p>
                    )}
                    {issueObj.evidence && (
                      <div className="mt-2">
                        <EvidenceInline evidence={issueObj.evidence} />
                      </div>
                    )}
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

      {/* 退货原因 - 增强版 */}
      {data.return_rate_factors && data.return_rate_factors.length > 0 && (
        <Card title="📉 主要退货原因" icon={TrendingDown}>
          <div className="space-y-3">
            {data.return_rate_factors.map((factor, i) => {
              if (typeof factor === 'object' && factor !== null) {
                const factorObj = factor as any;
                // 支持新格式（factor/impact_analysis）和旧格式（reason/percentage）
                const reason = factorObj.factor || factorObj.reason || '';
                return (
                  <div key={i} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">{safeRender(reason)}</span>
                        <ConfidenceBadge confidence={factorObj.confidence} />
                      </div>
                      {(factorObj.percentage || factorObj.estimated_percentage) && (
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          {safeRender(factorObj.percentage || factorObj.estimated_percentage)}
                        </span>
                      )}
                    </div>
                    {factorObj.impact_analysis && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span className="font-medium">影响分析:</span> {factorObj.impact_analysis}
                      </p>
                    )}
                    {factorObj.preventable !== undefined && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        <span className="font-medium">可预防:</span> {factorObj.preventable ? '是' : '否'}
                      </p>
                    )}
                    {(factorObj.solution || factorObj.prevention_measure) && (
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-1">
                        <span className="font-medium">预防措施:</span> {safeRender(factorObj.solution || factorObj.prevention_measure)}
                      </p>
                    )}
                    {factorObj.cost_of_inaction && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        <span className="font-medium">不行动的成本:</span> {factorObj.cost_of_inaction}
                      </p>
                    )}
                    {factorObj.evidence && (
                      <div className="mt-2">
                        <EvidenceInline evidence={factorObj.evidence} />
                      </div>
                    )}
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
      const sectionsArray = Array.from(sectionsRef.current.values());
      // 确保"数据概览"始终排在第一位
      const dataOverview = sectionsArray.find(s => s.id === 'data-overview');
      const otherSections = sectionsArray.filter(s => s.id !== 'data-overview');
      // 如果存在"数据概览"，放在第一位；其他项保持原顺序
      const sortedSections = dataOverview 
        ? [dataOverview, ...otherSections]
        : sectionsArray;
      setSections(sortedSections);
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
  
  // 评论侧边栏状态
  const [reviewSidebar, setReviewSidebar] = useState<{
    isOpen: boolean;
    dimensionKey: string;
    dimensionLabel: string;
    tagLabel: string;
    totalCount: number;
  }>({
    isOpen: false,
    dimensionKey: '',
    dimensionLabel: '',
    tagLabel: '',
    totalCount: 0
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
  
  // 打开评论侧边栏
  const openReviewSidebar = useCallback((dimensionKey: string, dimensionLabel: string, tagLabel: string, totalCount: number) => {
    setReviewSidebar({
      isOpen: true,
      dimensionKey,
      dimensionLabel,
      tagLabel,
      totalCount
    });
  }, []);
  
  // 关闭评论侧边栏
  const closeReviewSidebar = useCallback(() => {
    setReviewSidebar(prev => ({ ...prev, isOpen: false }));
  }, []);
  
  // 当抽屉状态变化时，通知父组件
  useEffect(() => {
    if (onDrawerStateChange) {
      onDrawerStateChange(evidenceDrawer.isOpen || reviewSidebar.isOpen);
    }
  }, [evidenceDrawer.isOpen, reviewSidebar.isOpen, onDrawerStateChange]);

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
        <div className="json-report-container">
        {/* 基础统计看板（硬数据）- 在 AI 分析之前展示 */}
        {analysisData && (
          <StatsDashboard 
            analysisData={analysisData}
            onViewEvidence={handleViewEvidenceFromDashboard}
            onViewReviews={asin ? openReviewSidebar : undefined}
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
      
      {/* 评论侧边栏 - 显示完整评论（包含原文和译文） */}
      {asin && (
        <CompareReviewSidebar
          isOpen={reviewSidebar.isOpen}
          onClose={closeReviewSidebar}
          productAsin={asin}
          dimension={reviewSidebar.dimensionLabel}
          dimensionKey={reviewSidebar.dimensionKey}
          tagLabel={reviewSidebar.tagLabel}
          totalCount={reviewSidebar.totalCount}
        />
      )}
      </EvidenceContext.Provider>
    </TocContext.Provider>
  );
});

export default JsonReportRenderer;

