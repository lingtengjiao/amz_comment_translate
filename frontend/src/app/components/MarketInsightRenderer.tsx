/**
 * MarketInsightRenderer - 细分市场洞察分析渲染器
 * 
 * 设计原则（2026-01-17 重构）：
 * 
 * 第一部分：数据统计（纯数据展示，可点击查看原文）
 * - 5W 用户画像数据统计：buyer, user, where, when, why, what
 * - 洞察数据统计：strength, weakness, suggestion, scenario, emotion
 * - 点击标签/维度弹出侧边栏，显示所有产品的相关评论
 * 
 * 第二部分：基于数据的推理（AI 分析观点）
 * - 市场概览：市场成熟度、竞争激烈度
 * - 市场用户画像：购买者、使用者、使用场景
 * - 市场机会挖掘：未被满足的需求、差异化机会
 * - 市场趋势分析：新兴趋势、衰退趋势
 */
import { memo, useState, useCallback } from 'react';
import { 
  TrendingUp, Users, Target, Lightbulb, MapPin, 
  BarChart3, AlertTriangle, Sparkles, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, ShoppingCart, Zap, Package,
  ArrowUpRight, ArrowDownRight, Activity, UserCircle, MapPinned, 
  Calendar, HelpCircle, Wrench, Heart, MessageSquare, Eye,
  Shield, CheckCircle, AlertCircle, Briefcase, Settings, Star
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { MarketInsightSidebar } from './MarketInsightSidebar';

// 类型定义
interface MarketOverview {
  summary?: string;
  market_size_indicator?: string;
  maturity_level?: string;
  competition_intensity?: string;
  // 嵌套的共性需求和痛点
  common_needs?: CommonNeeds;
  common_pain_points?: CommonPainPoints;
}

// 数据支撑类型
interface DataSupport {
  cited_statistics?: string[];
  evidence_count?: number;
  sample_reviews?: string[];
}

interface CommonNeeds {
  description?: string;
  top_needs?: Array<{ need: string; frequency?: string; importance?: string; count?: number }>;
  confidence?: string;
  data_support?: DataSupport;
}

interface CommonPainPoints {
  description?: string;
  top_pain_points?: Array<{ pain_point: string; severity?: string; count?: number }>;
  confidence?: string;
  data_support?: DataSupport;
}

interface MarketPersona {
  market_persona?: {
    primary_buyers?: { description?: string; segments?: Array<any>; confidence?: string; data_support?: DataSupport };
    primary_users?: { description?: string; segments?: Array<any>; confidence?: string; data_support?: DataSupport };
    usage_scenarios?: { description?: string; top_scenarios?: Array<any>; confidence?: string; data_support?: DataSupport };
    purchase_motivations?: { description?: string; top_motivations?: Array<any>; confidence?: string; data_support?: DataSupport };
    jobs_to_be_done?: { description?: string; primary_jtbd?: string; secondary_jtbd?: string[]; data_support?: DataSupport };
  };
  typical_user_story?: string;
}

interface MarketOpportunities {
  unmet_needs?: { description?: string; opportunities?: Array<any>; confidence?: string; data_support?: DataSupport };
  white_space_opportunities?: { description?: string; opportunities?: Array<any>; data_support?: DataSupport };
  differentiation_opportunities?: { description?: string; opportunities?: Array<any>; data_support?: DataSupport };
  product_positioning_map?: { 
    description?: string; 
    positions?: Array<{ product: number; positioning?: string; strengths?: string[]; gaps?: string[] }>;
    market_leader?: number;
    positioning_advice?: string;
  };
}

interface MarketTrends {
  emerging_needs?: { description?: string; trends?: Array<any>; confidence?: string; data_support?: DataSupport };
  declining_patterns?: { description?: string; patterns?: Array<any>; confidence?: string; data_support?: DataSupport };
  market_dynamics?: { growth_drivers?: string[]; inhibitors?: string[]; disruption_risks?: string[] };
  future_outlook?: { short_term?: string; medium_term?: string; strategic_recommendation?: string; key_actions?: string[]; data_support?: DataSupport };
}

interface StrategicPositioning {
  strategic_positioning?: {
    market_positioning?: { description?: string; positioning_map?: Array<any>; confidence?: string; data_support?: DataSupport };
    swot_matrix?: {
      strengths?: Array<{ item: string; evidence_count?: number; confidence?: string }>;
      weaknesses?: Array<{ item: string; evidence_count?: number; confidence?: string }>;
      opportunities?: Array<{ item: string; source?: string; confidence?: string }>;
      threats?: Array<{ item: string; risk_level?: string; confidence?: string }>;
      data_support?: DataSupport;
    };
    competitive_advantage?: { description?: string; leader_products?: number[]; differentiators?: string[]; confidence?: string; data_support?: DataSupport };
  };
}

interface UsageContextAnalysis {
  usage_context_analysis?: {
    scene_mapping?: { description?: string; primary_scenes?: Array<any>; confidence?: string; data_support?: DataSupport };
    pain_point_by_scene?: { description?: string; scene_issues?: Array<any>; confidence?: string; data_support?: DataSupport };
    user_journey_gaps?: { description?: string; gaps?: Array<any>; data_support?: DataSupport };
  };
}

interface QualityRoadmap {
  quality_roadmap?: {
    quality_benchmark?: { description?: string; quality_leaders?: Array<any>; quality_laggards?: Array<any>; benchmarks?: Array<any>; confidence?: string; data_support?: DataSupport };
    critical_issues?: { description?: string; issues?: Array<any>; confidence?: string; data_support?: DataSupport };
    product_roadmap?: { description?: string; short_term_actions?: Array<any>; mid_term_features?: Array<any>; data_support?: DataSupport };
    design_recommendations?: { description?: string; usability_improvements?: string[]; feature_requests?: string[] };
  };
}

interface ActionPriorities {
  action_priorities?: {
    supply_chain_risks?: { description?: string; quality_risks?: Array<any>; packaging_issues?: Array<any>; estimated_return_factors?: string[]; confidence?: string; data_support?: DataSupport };
    department_directives?: {
      product_team?: { priority_actions?: string[]; focus_areas?: string[] };
      marketing_team?: { key_messages?: string[]; target_segments?: string[]; avoid_claims?: string[] };
      customer_service?: { expected_issues?: string[]; response_templates?: string[] };
      supply_chain?: { qc_focus?: string[]; supplier_feedback?: string[] };
    };
    priority_action_list?: { description?: string; p0_critical?: Array<any>; p1_high?: Array<any>; p2_medium?: Array<any> };
    risk_level_summary?: { overall_risk?: string; main_concerns?: string[]; positive_signals?: string[]; total_issues?: number; summary?: string; data_support?: DataSupport };
  };
}

interface ProductProfile {
  product_index: number;
  product_name: string;
  asin: string;
  image_url?: string;
  review_count?: number;
  five_w?: any;
  dimensions?: any;
}

// 数据统计类型
interface StatItem {
  label: string;
  count: number;
  percentage: string;
}

interface DataStatistics {
  five_w: {
    buyer?: StatItem[];
    user?: StatItem[];
    where?: StatItem[];
    when?: StatItem[];
    why?: StatItem[];
    what?: StatItem[];
  };
  insights: {
    strength?: StatItem[];
    weakness?: StatItem[];
    suggestion?: StatItem[];
    scenario?: StatItem[];
    emotion?: StatItem[];
  };
  total_products?: number;
  total_labels?: number;
}

interface MarketInsightData {
  analysis_type: 'market_insight';
  market_name: string;
  product_count: number;
  total_reviews: number;
  // 第一部分：数据统计
  data_statistics?: DataStatistics;
  // 第二部分：基于数据的推理（8模块完整版）
  market_analysis?: {
    // 板块A: 市场格局
    market_overview?: MarketOverview & CommonNeeds & CommonPainPoints & { market_concentration?: any };
    strategic_positioning?: StrategicPositioning;
    // 板块B: 用户洞察
    market_persona?: MarketPersona;
    usage_context_analysis?: UsageContextAnalysis;
    // 板块C: 产品策略
    market_opportunities?: MarketOpportunities;
    quality_roadmap?: QualityRoadmap;
    // 板块D: 运营行动
    market_trends?: MarketTrends;
    action_priorities?: ActionPriorities;
  };
  // 向后兼容字段
  market_overview?: MarketOverview & CommonNeeds & CommonPainPoints & { market_concentration?: any };
  market_persona?: MarketPersona;
  market_opportunities?: MarketOpportunities;
  market_trends?: MarketTrends;
  strategic_positioning?: StrategicPositioning;
  usage_context_analysis?: UsageContextAnalysis;
  quality_roadmap?: QualityRoadmap;
  action_priorities?: ActionPriorities;
  aggregated_data?: any;
  product_profiles?: ProductProfile[];
}

interface MarketInsightRendererProps {
  data: MarketInsightData;
  items?: any[];
  projectId?: string;  // 项目 ID，用于查询评论
  readOnly?: boolean;  // 只读模式（分享页使用）
}

// 侧边栏状态类型
interface SidebarState {
  isOpen: boolean;
  queryType: 'label' | 'dimension';
  dimensionKey: string;
  labelOrDimensionName: string;
  totalCount?: number;
}

// 可折叠卡片组件
const CollapsibleCard = memo(({ 
  title, 
  icon: Icon, 
  iconColor, 
  bgColor, 
  children, 
  defaultOpen = true 
}: {
  title: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  bgColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className={`rounded-xl border ${bgColor} overflow-hidden`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/50 dark:hover:bg-black/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`size-5 ${iconColor}`} />
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        {isOpen ? <ChevronUp className="size-5 text-gray-400" /> : <ChevronDown className="size-5 text-gray-400" />}
      </button>
      {isOpen && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
});

// 统计标签组件
const StatBadge = memo(({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${color}`}>
    <span className="text-sm font-medium">{label}</span>
    <span className="text-xs opacity-75">{value}</span>
  </div>
));

// 置信度徽章组件
const ConfidenceBadge = memo(({ confidence }: { confidence?: string }) => {
  if (!confidence) return null;
  
  const config: Record<string, { bg: string; text: string; label: string; icon: string }> = {
    high: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: '高置信', icon: '✓' },
    medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: '中置信', icon: '~' },
    low: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', label: '低置信', icon: '?' }
  };
  const c = config[confidence.toLowerCase()] || config.medium;
  
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`} title={`置信度: ${c.label}`}>
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
});

// 数据支撑组件 - 显示 cited_statistics 证据引用
const DataSupportBlock = memo(({ dataSupport, className = '' }: { 
  dataSupport?: { cited_statistics?: string[] };
  className?: string;
}) => {
  if (!dataSupport?.cited_statistics?.length) return null;
  
  return (
    <div className={`mt-3 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800/50 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">
        <BarChart3 className="size-3" />
        📊 数据支撑
      </div>
      <ul className="space-y-1.5">
        {dataSupport.cited_statistics.slice(0, 4).map((stat, idx) => (
          <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
            <span>{stat}</span>
          </li>
        ))}
        {dataSupport.cited_statistics.length > 4 && (
          <li className="text-xs text-gray-400 dark:text-gray-500 italic pl-4">
            还有 {dataSupport.cited_statistics.length - 4} 条数据...
          </li>
        )}
      </ul>
    </div>
  );
});

// 洞察项组件 - 带证据支撑
const InsightItem = memo(({ 
  title, 
  description, 
  confidence,
  dataSupport,
  variant = 'default',
  icon: Icon
}: {
  title: string;
  description?: string;
  confidence?: string;
  dataSupport?: { cited_statistics?: string[] };
  variant?: 'default' | 'success' | 'danger' | 'warning';
  icon?: React.ComponentType<any>;
}) => {
  const variantStyles = {
    default: 'border-l-gray-400',
    success: 'border-l-emerald-500',
    danger: 'border-l-red-500',
    warning: 'border-l-amber-500'
  };
  
  return (
    <div className={`p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-gray-500 flex-shrink-0" />}
          <h5 className="font-medium text-gray-900 dark:text-white text-sm">{title}</h5>
        </div>
        <ConfidenceBadge confidence={confidence} />
      </div>
      {description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>
      )}
      <DataSupportBlock dataSupport={dataSupport} />
    </div>
  );
});

// 进度条组件
const ProgressBar = memo(({ value, max, color }: { value: number; max: number; color: string }) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }} />
    </div>
  );
});

// 5W 维度配置
const FIVE_W_CONFIG = {
  buyer: { label: '购买者', icon: ShoppingCart, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  user: { label: '使用者', icon: UserCircle, color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  where: { label: '使用场景', icon: MapPinned, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  when: { label: '使用时机', icon: Calendar, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  why: { label: '购买动机', icon: HelpCircle, color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
  what: { label: '使用用途', icon: Wrench, color: 'text-cyan-600', bgColor: 'bg-cyan-100 dark:bg-cyan-900/30' },
};

// 洞察维度配置
const INSIGHT_CONFIG = {
  strength: { label: '优势', icon: ThumbsUp, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  weakness: { label: '痛点', icon: ThumbsDown, color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  suggestion: { label: '建议', icon: MessageSquare, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  scenario: { label: '场景洞察', icon: MapPin, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  emotion: { label: '情绪洞察', icon: Heart, color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
};

// 汇总图表组件（水平条形图）
const SummaryBarChart = memo(({ 
  data, 
  colorClass 
}: { 
  data: { label: string; count: number }[];
  colorClass: string;
}) => {
  if (!data || data.length === 0) return null;
  
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const topItems = data.slice(0, 8);
  
  return (
    <div className="space-y-2">
      {topItems.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate text-right">
            {item.label}
          </span>
          <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div 
              className={`h-full ${colorClass} transition-all duration-500`}
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
});

// 5W 数据统计组件
const DataStatisticsSection = memo(({ 
  data, 
  onTagClick 
}: { 
  data: DataStatistics;
  onTagClick: (dimensionKey: string, label: string, count: number) => void;
}) => {
  const fiveW = data?.five_w || {};
  const [showChart, setShowChart] = useState(false);
  
  // 计算每个维度的最大值（用于进度条）
  const getMaxCount = (items: StatItem[] | undefined) => {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(i => i.count || 0), 1);
  };
  
  // 汇总所有5W数据用于图表
  const allFiveWData = Object.entries(FIVE_W_CONFIG).map(([key, config]) => {
    const items = fiveW[key as keyof typeof fiveW] || [];
    const total = items.reduce((sum, i) => sum + (i.count || 0), 0);
    return { label: config.label, count: total };
  }).filter(d => d.count > 0);
  
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-indigo-200 dark:border-indigo-800">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500 rounded-xl">
            <Users className="size-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">5W 用户画像数据统计</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">点击标签查看相关评论原文</p>
          </div>
        </div>
        <button
          onClick={() => setShowChart(!showChart)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-800/30 transition-colors"
        >
          <BarChart3 className="size-4" />
          {showChart ? '隐藏图表' : '显示汇总图表'}
        </button>
      </div>
      
      {/* 汇总图表 */}
      {showChart && allFiveWData.length > 0 && (
        <div className="mb-6 p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">各维度数据量分布</h4>
          <SummaryBarChart data={allFiveWData} colorClass="bg-indigo-500" />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(FIVE_W_CONFIG).map(([key, config]) => {
          const items = fiveW[key as keyof typeof fiveW] || [];
          const Icon = config.icon;
          const maxCount = getMaxCount(items);
          const totalCount = items.reduce((sum, i) => sum + (i.count || 0), 0);
          
          return (
            <div key={key} className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${config.color}`} />
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{config.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{items.length} 个标签</span>
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">/ {totalCount} 次</span>
                </div>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-4">暂无数据</div>
                ) : (
                  items.slice(0, 12).map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => onTagClick(key, item.label, item.count)}
                      className="w-full text-left group"
                      title={`点击查看"${item.label}"相关评论`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate flex-1 mr-2">
                          {idx + 1}. {item.label}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-gray-500 font-medium">{item.count}</span>
                          <span className="text-gray-400 text-[10px]">{item.percentage}</span>
                          <Eye className="size-3 text-gray-300 group-hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100" />
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-indigo-400 dark:bg-indigo-500 transition-all duration-300 group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400`}
                          style={{ width: `${(item.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </button>
                  ))
                )}
                {items.length > 12 && (
                  <div className="text-xs text-gray-400 text-center py-2">
                    还有 {items.length - 12} 个标签...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// 洞察数据统计组件
const InsightStatisticsSection = memo(({ 
  data, 
  onTagClick 
}: { 
  data: DataStatistics;
  onTagClick: (dimensionKey: string, label: string, count: number) => void;
}) => {
  const insights = data?.insights || {};
  const [showChart, setShowChart] = useState(false);
  
  // 计算每个维度的最大值（用于进度条）
  const getMaxCount = (items: StatItem[] | undefined) => {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(i => i.count || 0), 1);
  };
  
  // 汇总所有洞察数据用于图表
  const allInsightData = Object.entries(INSIGHT_CONFIG).map(([key, config]) => {
    const items = insights[key as keyof typeof insights] || [];
    const total = items.reduce((sum, i) => sum + (i.count || 0), 0);
    return { label: config.label, count: total };
  }).filter(d => d.count > 0);
  
  // 获取维度颜色样式
  const getBarColor = (key: string) => {
    switch (key) {
      case 'strength': return 'bg-green-500';
      case 'weakness': return 'bg-red-500';
      case 'suggestion': return 'bg-blue-500';
      case 'scenario': return 'bg-orange-500';
      case 'emotion': return 'bg-pink-500';
      default: return 'bg-amber-500';
    }
  };
  
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-6 border border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500 rounded-xl">
            <Lightbulb className="size-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">洞察数据统计</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">点击维度查看相关评论原文</p>
          </div>
        </div>
        <button
          onClick={() => setShowChart(!showChart)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800/30 transition-colors"
        >
          <BarChart3 className="size-4" />
          {showChart ? '隐藏图表' : '显示汇总图表'}
        </button>
      </div>
      
      {/* 汇总图表 */}
      {showChart && allInsightData.length > 0 && (
        <div className="mb-6 p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">各维度数据量分布</h4>
          <SummaryBarChart data={allInsightData} colorClass="bg-amber-500" />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(INSIGHT_CONFIG).map(([key, config]) => {
          const items = insights[key as keyof typeof insights] || [];
          const Icon = config.icon;
          const maxCount = getMaxCount(items);
          const totalCount = items.reduce((sum, i) => sum + (i.count || 0), 0);
          const barColor = getBarColor(key);
          
          return (
            <div key={key} className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${config.color}`} />
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{config.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{items.length} 个维度</span>
                  <span className={`text-xs font-medium ${config.color}`}>/ {totalCount} 次</span>
                </div>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-4">暂无数据</div>
                ) : (
                  items.slice(0, 12).map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => onTagClick(key, item.label, item.count)}
                      className="w-full text-left group"
                      title={`点击查看"${item.label}"相关评论`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-700 dark:text-gray-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate flex-1 mr-2">
                          {idx + 1}. {item.label}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-gray-500 font-medium">{item.count}</span>
                          <span className="text-gray-400 text-[10px]">{item.percentage}</span>
                          <Eye className="size-3 text-gray-300 group-hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100" />
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${barColor} transition-all duration-300 group-hover:opacity-80`}
                          style={{ width: `${(item.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </button>
                  ))
                )}
                {items.length > 12 && (
                  <div className="text-xs text-gray-400 text-center py-2">
                    还有 {items.length - 12} 个维度...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// 分隔线组件
const SectionDivider = memo(({ title }: { title: string }) => (
  <div className="flex items-center gap-4 my-8">
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600" />
    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 px-4">{title}</span>
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600" />
  </div>
));

// 市场概览组件
const MarketOverviewSection = memo(({ data }: { data: MarketInsightData }) => {
  const overview = data.market_overview || {};
  
  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-blue-500 rounded-xl">
          <TrendingUp className="size-6 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{data.market_name}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            {overview.summary || '正在分析市场数据...'}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 text-center">
          <Package className="size-5 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.product_count}</div>
          <div className="text-xs text-gray-500">产品数量</div>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 text-center">
          <BarChart3 className="size-5 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_reviews?.toLocaleString()}</div>
          <div className="text-xs text-gray-500">总评论数</div>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 text-center">
          <Activity className="size-5 text-orange-600 mx-auto mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">{overview.maturity_level || '-'}</div>
          <div className="text-xs text-gray-500">市场成熟度</div>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 text-center">
          <Zap className="size-5 text-red-600 mx-auto mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">{overview.competition_intensity || '-'}</div>
          <div className="text-xs text-gray-500">竞争激烈度</div>
        </div>
      </div>
    </div>
  );
});

// 共性需求组件
const CommonNeedsSection = memo(({ data }: { data: MarketInsightData }) => {
  const overview = data.market_overview || {};
  const commonNeeds = overview.common_needs || {};
  const commonPainPoints = overview.common_pain_points || {};
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 共性需求 */}
      <CollapsibleCard 
        title="市场共性需求" 
        icon={ThumbsUp} 
        iconColor="text-green-600"
        bgColor="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">
            {commonNeeds.description || '分析市场中用户的共同需求...'}
          </p>
          <ConfidenceBadge confidence={commonNeeds.confidence} />
        </div>
        <div className="space-y-3">
          {(commonNeeds.top_needs || []).slice(0, 5).map((need: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border-l-4 border-l-green-400">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-semibold text-sm">{idx + 1}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{need.need}</span>
              </div>
              <div className="flex items-center gap-2">
                {need.count && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">{need.count}次</span>}
                {need.importance && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    need.importance === 'high' ? 'bg-green-200 text-green-700' :
                    need.importance === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>{need.importance === 'high' ? '高频' : need.importance === 'medium' ? '中频' : '低频'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* 数据支撑 */}
        <DataSupportBlock dataSupport={commonNeeds.data_support} />
      </CollapsibleCard>

      {/* 共性痛点 */}
      <CollapsibleCard 
        title="市场共性痛点" 
        icon={AlertTriangle} 
        iconColor="text-red-600"
        bgColor="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">
            {commonPainPoints.description || '分析市场中用户的共同痛点...'}
          </p>
          <ConfidenceBadge confidence={commonPainPoints.confidence} />
        </div>
        <div className="space-y-3">
          {(commonPainPoints.top_pain_points || []).slice(0, 5).map((pain: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border-l-4 border-l-red-400">
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-semibold text-sm">{idx + 1}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{pain.pain_point}</span>
              </div>
              <div className="flex items-center gap-2">
                {pain.count && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">{pain.count}次</span>}
                {pain.severity && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    pain.severity === 'high' ? 'bg-red-200 text-red-700' :
                    pain.severity === 'medium' ? 'bg-orange-200 text-orange-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>{pain.severity === 'high' ? '严重' : pain.severity === 'medium' ? '中等' : '轻微'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* 数据支撑 */}
        <DataSupportBlock dataSupport={commonPainPoints.data_support} />
      </CollapsibleCard>
    </div>
  );
});

// 市场用户画像组件
const MarketPersonaSection = memo(({ data }: { data: MarketInsightData }) => {
  const persona = data.market_persona?.market_persona || {};
  const story = data.market_persona?.typical_user_story;
  
  return (
    <CollapsibleCard 
      title="市场用户画像" 
      icon={Users} 
      iconColor="text-purple-600"
      bgColor="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
    >
      {story && (
        <div className="mb-6 p-4 bg-purple-100/50 dark:bg-purple-800/20 rounded-xl border border-purple-200 dark:border-purple-700">
          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">💡 典型用户画像</h4>
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed italic">"{story}"</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {persona.primary_buyers?.description && (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-l-blue-400">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-white text-sm">Buyer 购买者</span>
              </div>
              <ConfidenceBadge confidence={persona.primary_buyers.confidence} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{persona.primary_buyers.description}</p>
            <DataSupportBlock dataSupport={persona.primary_buyers.data_support} />
          </div>
        )}
        
        {persona.primary_users?.description && (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-l-cyan-400">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-cyan-600" />
                <span className="font-medium text-gray-900 dark:text-white text-sm">User 使用者</span>
              </div>
              <ConfidenceBadge confidence={persona.primary_users.confidence} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{persona.primary_users.description}</p>
            <DataSupportBlock dataSupport={persona.primary_users.data_support} />
          </div>
        )}
        
        {persona.usage_scenarios?.description && (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-l-purple-400">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-white text-sm">Where/When 使用场景</span>
              </div>
              <ConfidenceBadge confidence={persona.usage_scenarios.confidence} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{persona.usage_scenarios.description}</p>
            <DataSupportBlock dataSupport={persona.usage_scenarios.data_support} />
          </div>
        )}
        
        {persona.purchase_motivations?.description && (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-l-pink-400">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-pink-600" />
                <span className="font-medium text-gray-900 dark:text-white text-sm">Why 购买动机</span>
              </div>
              <ConfidenceBadge confidence={persona.purchase_motivations.confidence} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{persona.purchase_motivations.description}</p>
            <DataSupportBlock dataSupport={persona.purchase_motivations.data_support} />
          </div>
        )}
      </div>
      
      {persona.jobs_to_be_done?.primary_jtbd && (
        <div className="mt-4 p-4 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-800/20 dark:to-pink-800/20 rounded-xl border border-purple-200 dark:border-purple-700">
          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">🎯 What 核心任务 (JTBD)</h4>
          <p className="text-sm text-gray-700 dark:text-gray-200">{persona.jobs_to_be_done.primary_jtbd}</p>
          {persona.jobs_to_be_done.secondary_jtbd && persona.jobs_to_be_done.secondary_jtbd.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {persona.jobs_to_be_done.secondary_jtbd.map((jtbd: string, idx: number) => (
                <span key={idx} className="text-xs px-2 py-1 bg-purple-200/50 dark:bg-purple-700/30 text-purple-700 dark:text-purple-300 rounded">
                  {jtbd}
                </span>
              ))}
            </div>
          )}
          <DataSupportBlock dataSupport={persona.jobs_to_be_done.data_support} />
        </div>
      )}
    </CollapsibleCard>
  );
});

// 市场机会组件
const MarketOpportunitiesSection = memo(({ data }: { data: MarketInsightData }) => {
  const opportunities = data.market_opportunities || {};
  
  return (
    <CollapsibleCard 
      title="市场机会挖掘" 
      icon={Lightbulb} 
      iconColor="text-amber-600"
      bgColor="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
    >
      <div className="space-y-6">
        {/* 未被满足的需求 */}
        {opportunities.unmet_needs?.opportunities && opportunities.unmet_needs.opportunities.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="size-4 text-amber-600" />
                未被满足的需求
              </h4>
              <ConfidenceBadge confidence={opportunities.unmet_needs.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{opportunities.unmet_needs.description}</p>
            <div className="space-y-3">
              {opportunities.unmet_needs.opportunities.map((opp: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-amber-500">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 dark:text-white text-sm">{opp.need}</h5>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{opp.gap_analysis}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {opp.evidence_count && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">{opp.evidence_count}次</span>
                      )}
                      {opp.market_potential && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          opp.market_potential === 'high' ? 'bg-green-200 text-green-700' :
                          opp.market_potential === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {opp.market_potential === 'high' ? '高潜力' : opp.market_potential === 'medium' ? '中潜力' : '低潜力'}
                        </span>
                      )}
                    </div>
                  </div>
                  {opp.recommendation && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        💡 <span className="font-medium">建议:</span> {opp.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={opportunities.unmet_needs.data_support} />
          </div>
        )}
        
        {/* 差异化机会 */}
        {opportunities.differentiation_opportunities?.opportunities && opportunities.differentiation_opportunities.opportunities.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-amber-600" />
              差异化机会
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{opportunities.differentiation_opportunities.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {opportunities.differentiation_opportunities.opportunities.map((opp: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-600 font-semibold text-sm">{idx + 1}</span>
                    <h5 className="font-medium text-gray-900 dark:text-white text-sm">{opp.dimension}</h5>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{opp.opportunity}</p>
                  {opp.implementation_difficulty && (
                    <div className="mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        opp.implementation_difficulty === 'low' ? 'bg-green-100 text-green-700' :
                        opp.implementation_difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        实施难度: {opp.implementation_difficulty === 'low' ? '低' : opp.implementation_difficulty === 'medium' ? '中' : '高'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={opportunities.differentiation_opportunities.data_support} />
          </div>
        )}
        
        {/* 产品定位建议 */}
        {opportunities.product_positioning_map?.positioning_advice && (
          <div className="p-4 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-800/20 dark:to-orange-800/20 rounded-xl border border-amber-300 dark:border-amber-700">
            <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">🎯 定位建议</h4>
            <p className="text-sm text-gray-700 dark:text-gray-200">{opportunities.product_positioning_map.positioning_advice}</p>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
});

// 市场趋势组件
const MarketTrendsSection = memo(({ data }: { data: MarketInsightData }) => {
  const trends = data.market_trends || {};
  
  return (
    <CollapsibleCard 
      title="市场趋势分析" 
      icon={TrendingUp} 
      iconColor="text-cyan-600"
      bgColor="bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 新兴趋势 */}
        {trends.emerging_needs?.trends && trends.emerging_needs.trends.length > 0 && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="size-4 text-green-600" />
                📈 新兴趋势
              </h4>
              <ConfidenceBadge confidence={trends.emerging_needs.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{trends.emerging_needs.description}</p>
            <div className="space-y-3">
              {trends.emerging_needs.trends.map((trend: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-green-500">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-700 dark:text-gray-200 flex-1">{trend.trend}</p>
                    {trend.momentum && (
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        trend.momentum === 'strong' ? 'bg-green-200 text-green-700' :
                        trend.momentum === 'moderate' ? 'bg-yellow-200 text-yellow-700' :
                        'bg-gray-200 text-gray-700'
                      }`}>
                        {trend.momentum === 'strong' ? '强势' : trend.momentum === 'moderate' ? '温和' : '弱势'}
                      </span>
                    )}
                  </div>
                  {trend.evidence_count && (
                    <div className="text-xs text-gray-500 mt-1">📊 {trend.evidence_count}条证据</div>
                  )}
                  {trend.recommendation && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                      <p className="text-xs text-green-700 dark:text-green-300">💡 {trend.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={trends.emerging_needs.data_support} />
          </div>
        )}
        
        {/* 衰退趋势 */}
        {trends.declining_patterns?.patterns && trends.declining_patterns.patterns.length > 0 && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowDownRight className="size-4 text-red-600" />
                📉 衰退趋势
              </h4>
              <ConfidenceBadge confidence={trends.declining_patterns.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{trends.declining_patterns.description}</p>
            <div className="space-y-3">
              {trends.declining_patterns.patterns.map((pattern: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-red-500">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-700 dark:text-gray-200 flex-1">{pattern.pattern}</p>
                    {pattern.severity && (
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        pattern.severity === 'high' ? 'bg-red-200 text-red-700' :
                        pattern.severity === 'medium' ? 'bg-orange-200 text-orange-700' :
                        'bg-gray-200 text-gray-700'
                      }`}>
                        {pattern.severity === 'high' ? '严重' : pattern.severity === 'medium' ? '中等' : '轻微'}
                      </span>
                    )}
                  </div>
                  {pattern.evidence_count && (
                    <div className="text-xs text-gray-500 mt-1">📊 {pattern.evidence_count}条证据</div>
                  )}
                  {pattern.recommendation && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <p className="text-xs text-red-700 dark:text-red-300">⚠️ {pattern.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={trends.declining_patterns.data_support} />
          </div>
        )}
      </div>
      
      {/* 未来展望 */}
      {trends.future_outlook?.strategic_recommendation && (
        <div className="mt-6 p-4 bg-gradient-to-r from-cyan-100 to-blue-100 dark:from-cyan-800/20 dark:to-blue-800/20 rounded-xl border border-cyan-300 dark:border-cyan-700">
          <h4 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 mb-2">🔮 战略建议</h4>
          <p className="text-sm text-gray-700 dark:text-gray-200">{trends.future_outlook.strategic_recommendation}</p>
          {trends.future_outlook.key_actions && trends.future_outlook.key_actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trends.future_outlook.key_actions.map((action: string, idx: number) => (
                <span key={idx} className="text-xs px-2 py-1 bg-cyan-200/50 dark:bg-cyan-700/30 text-cyan-700 dark:text-cyan-300 rounded">
                  {action}
                </span>
              ))}
            </div>
          )}
          <DataSupportBlock dataSupport={trends.future_outlook.data_support} />
        </div>
      )}
    </CollapsibleCard>
  );
});

// 战略定位与SWOT组件
const StrategicPositioningSection = memo(({ data }: { data: MarketInsightData }) => {
  const positioning = data.market_analysis?.strategic_positioning || data.strategic_positioning;
  const sp = positioning?.strategic_positioning;
  
  if (!sp) return null;
  
  return (
    <CollapsibleCard 
      title="战略定位与SWOT分析" 
      icon={Shield} 
      iconColor="text-indigo-600"
      bgColor="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
    >
      <div className="space-y-6">
        {/* SWOT矩阵 */}
        {sp.swot_matrix && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">📊 SWOT 分析矩阵</h4>
            <div className="grid grid-cols-2 gap-4">
              {/* 优势 */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="size-4 text-green-600" />
                  <h5 className="text-sm font-semibold text-green-700 dark:text-green-300">优势 Strengths</h5>
                </div>
                <div className="space-y-2">
                  {(sp.swot_matrix.strengths || []).slice(0, 4).map((s: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>
                      <div className="text-xs text-gray-700 dark:text-gray-200">
                        {typeof s === 'string' ? s : s.item}
                        {s.evidence_count && <span className="text-gray-400 ml-1">({s.evidence_count})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 劣势 */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="size-4 text-red-600" />
                  <h5 className="text-sm font-semibold text-red-700 dark:text-red-300">劣势 Weaknesses</h5>
                </div>
                <div className="space-y-2">
                  {(sp.swot_matrix.weaknesses || []).slice(0, 4).map((w: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                      <div className="text-xs text-gray-700 dark:text-gray-200">
                        {typeof w === 'string' ? w : w.item}
                        {w.evidence_count && <span className="text-gray-400 ml-1">({w.evidence_count})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 机会 */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="size-4 text-blue-600" />
                  <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-300">机会 Opportunities</h5>
                </div>
                <div className="space-y-2">
                  {(sp.swot_matrix.opportunities || []).slice(0, 4).map((o: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                      <div className="text-xs text-gray-700 dark:text-gray-200">
                        {typeof o === 'string' ? o : o.item}
                        {o.evidence_count && <span className="text-gray-400 ml-1">({o.evidence_count})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 威胁 */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="size-4 text-orange-600" />
                  <h5 className="text-sm font-semibold text-orange-700 dark:text-orange-300">威胁 Threats</h5>
                </div>
                <div className="space-y-2">
                  {(sp.swot_matrix.threats || []).slice(0, 4).map((t: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5 flex-shrink-0">•</span>
                      <div className="text-xs text-gray-700 dark:text-gray-200">
                        {typeof t === 'string' ? t : t.item}
                        {t.evidence_count && <span className="text-gray-400 ml-1">({t.evidence_count})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DataSupportBlock dataSupport={sp.swot_matrix.data_support} />
          </div>
        )}
        
        {/* 市场定位 */}
        {sp.market_positioning?.description && (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border-l-4 border-indigo-500">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">🎯 市场定位</h4>
              <ConfidenceBadge confidence={sp.market_positioning.confidence} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200">{sp.market_positioning.description}</p>
            <DataSupportBlock dataSupport={sp.market_positioning.data_support} />
          </div>
        )}
        
        {/* 竞争优势 */}
        {sp.competitive_advantage?.description && (
          <div className="p-4 bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-800/20 dark:to-purple-800/20 rounded-xl border border-indigo-200 dark:border-indigo-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">⚔️ 竞争优势</h4>
              <ConfidenceBadge confidence={sp.competitive_advantage.confidence} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200">{sp.competitive_advantage.description}</p>
            {sp.competitive_advantage.differentiators && sp.competitive_advantage.differentiators.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sp.competitive_advantage.differentiators.map((diff: string, idx: number) => (
                  <span key={idx} className="text-xs px-2 py-1 bg-indigo-200/50 dark:bg-indigo-700/30 text-indigo-700 dark:text-indigo-300 rounded">
                    {diff}
                  </span>
                ))}
              </div>
            )}
            <DataSupportBlock dataSupport={sp.competitive_advantage.data_support} />
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
});

// 使用场景与痛点分析组件
const UsageContextAnalysisSection = memo(({ data }: { data: MarketInsightData }) => {
  const context = data.market_analysis?.usage_context_analysis || data.usage_context_analysis;
  const uca = context?.usage_context_analysis;
  
  if (!uca) return null;
  
  return (
    <CollapsibleCard 
      title="使用场景与痛点分析" 
      icon={MapPinned} 
      iconColor="text-emerald-600"
      bgColor="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
    >
      <div className="space-y-6">
        {/* 场景映射 */}
        {uca.scene_mapping && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="size-4 text-emerald-600" />
                🗺️ 使用场景全景图
              </h4>
              <ConfidenceBadge confidence={uca.scene_mapping.confidence} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{uca.scene_mapping.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(uca.scene_mapping.primary_scenes || []).slice(0, 6).map((scene: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-emerald-500">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-gray-900 dark:text-white">{scene.scene}</div>
                    {scene.frequency && (
                      <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">
                        {scene.frequency}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    {scene.when && <span>🕐 {scene.when}</span>}
                    {scene.where && <span>📍 {scene.where}</span>}
                  </div>
                  {scene.user_type && (
                    <div className="text-xs text-emerald-600 mt-1">👤 {scene.user_type}</div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={uca.scene_mapping.data_support} />
          </div>
        )}
        
        {/* 场景化痛点 */}
        {uca.pain_point_by_scene?.scene_issues && uca.pain_point_by_scene.scene_issues.length > 0 && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="size-4 text-orange-600" />
                🎯 场景化痛点分析
              </h4>
              <ConfidenceBadge confidence={uca.pain_point_by_scene.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{uca.pain_point_by_scene.description}</p>
            <div className="space-y-3">
              {uca.pain_point_by_scene.scene_issues.slice(0, 4).map((issue: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/80 dark:bg-gray-800/80 rounded-xl border-l-4 border-orange-400">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{issue.scene}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {issue.occurrence_count && (
                        <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded">
                          {issue.occurrence_count}次
                        </span>
                      )}
                      {issue.severity && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          issue.severity === 'high' ? 'bg-red-200 text-red-700' :
                          issue.severity === 'medium' ? 'bg-orange-200 text-orange-700' :
                          'bg-gray-200 text-gray-700'
                        }`}>{issue.severity === 'high' ? '严重' : issue.severity === 'medium' ? '中等' : '轻微'}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{issue.pain_point}</p>
                  {issue.impact && (
                    <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                      <p className="text-xs text-orange-700 dark:text-orange-300">⚠️ 影响: {issue.impact}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={uca.pain_point_by_scene.data_support} />
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
});

// 质量标杆与迭代方向组件
const QualityRoadmapSection = memo(({ data }: { data: MarketInsightData }) => {
  const roadmap = data.market_analysis?.quality_roadmap || data.quality_roadmap;
  const qr = roadmap?.quality_roadmap;
  
  if (!qr) return null;
  
  return (
    <CollapsibleCard 
      title="质量标杆与产品迭代方向" 
      icon={CheckCircle} 
      iconColor="text-teal-600"
      bgColor="bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800"
    >
      <div className="space-y-6">
        {/* 致命缺陷 */}
        {qr.critical_issues?.issues && qr.critical_issues.issues.length > 0 && (
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="size-4" />
                🚨 致命缺陷与紧急修复项
              </h4>
              <ConfidenceBadge confidence={qr.critical_issues.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{qr.critical_issues.description}</p>
            <div className="space-y-3">
              {qr.critical_issues.issues.slice(0, 4).map((issue: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/80 dark:bg-gray-800/80 rounded-xl border-l-4 border-red-500">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{issue.issue}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {issue.occurrence_count && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                          {issue.occurrence_count}次
                        </span>
                      )}
                      {issue.severity && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          issue.severity === 'critical' ? 'bg-red-200 text-red-700' :
                          issue.severity === 'high' ? 'bg-orange-200 text-orange-700' :
                          'bg-yellow-200 text-yellow-700'
                        }`}>{issue.severity === 'critical' ? '致命' : issue.severity === 'high' ? '严重' : '中等'}</span>
                      )}
                    </div>
                  </div>
                  {issue.impact && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">⚠️ 影响: {issue.impact}</p>
                  )}
                  {issue.fix_recommendation && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                      <p className="text-xs text-green-700 dark:text-green-300">💡 修复建议: {issue.fix_recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={qr.critical_issues.data_support} />
          </div>
        )}
        
        {/* 质量标杆 */}
        {qr.quality_benchmark?.quality_leaders && qr.quality_benchmark.quality_leaders.length > 0 && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-2">
                <Star className="size-4" />
                ⭐ 质量标杆
              </h4>
              <ConfidenceBadge confidence={qr.quality_benchmark.confidence} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {qr.quality_benchmark.quality_leaders.slice(0, 4).map((leader: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-teal-400">
                  <div className="text-xs font-medium text-gray-900 dark:text-white mb-1">{leader.dimension || leader.product}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">{leader.benchmark || leader.strength}</div>
                  {leader.gap && (
                    <div className="text-xs text-orange-600 mt-1">差距: {leader.gap}</div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={qr.quality_benchmark.data_support} />
          </div>
        )}
        
        {/* 产品迭代方向 */}
        {qr.product_roadmap?.short_term_actions && qr.product_roadmap.short_term_actions.length > 0 && (
          <div className="p-4 bg-gradient-to-r from-teal-100/50 to-cyan-100/50 dark:from-teal-800/20 dark:to-cyan-800/20 rounded-xl border border-teal-200 dark:border-teal-700">
            <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-300 mb-3 flex items-center gap-2">
              <Settings className="size-4" />
              🛠️ 产品迭代路线图
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{qr.product_roadmap.description}</p>
            <div className="space-y-2">
              {qr.product_roadmap.short_term_actions.slice(0, 5).map((action: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      action.priority === 'P0' ? 'bg-red-200 text-red-700' :
                      action.priority === 'P1' ? 'bg-orange-200 text-orange-700' :
                      action.priority === 'P2' ? 'bg-yellow-200 text-yellow-700' :
                      'bg-gray-200 text-gray-700'
                    }`}>{action.priority || 'P2'}</span>
                    <div className="flex-1">
                      <span className="text-sm text-gray-900 dark:text-white">{action.action}</span>
                      {action.expected_impact && (
                        <div className="text-xs text-gray-500 mt-1">预期效果: {action.expected_impact}</div>
                      )}
                    </div>
                  </div>
                  {action.effort && (
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      action.effort === 'low' ? 'bg-green-100 text-green-700' :
                      action.effort === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {action.effort === 'low' ? '低成本' : action.effort === 'medium' ? '中成本' : '高成本'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={qr.product_roadmap.data_support} />
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
});

// 供应链风险与行动优先级组件
const ActionPrioritiesSection = memo(({ data }: { data: MarketInsightData }) => {
  const actions = data.market_analysis?.action_priorities || data.action_priorities;
  const ap = actions?.action_priorities;
  
  if (!ap) return null;
  
  return (
    <CollapsibleCard 
      title="供应链风险与行动优先级" 
      icon={Briefcase} 
      iconColor="text-violet-600"
      bgColor="bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800"
    >
      <div className="space-y-6">
        {/* 供应链风险 */}
        {ap.supply_chain_risks?.quality_risks && ap.supply_chain_risks.quality_risks.length > 0 && (
          <div className="p-4 bg-white/40 dark:bg-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <AlertTriangle className="size-4" />
                ⚠️ 供应链与质量风险预警
              </h4>
              <ConfidenceBadge confidence={ap.supply_chain_risks.confidence} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{ap.supply_chain_risks.description}</p>
            <div className="space-y-3">
              {ap.supply_chain_risks.quality_risks.slice(0, 4).map((risk: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-violet-500">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-900 dark:text-white flex-1">{risk.risk}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {risk.occurrence_count && (
                        <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded">
                          {risk.occurrence_count}次
                        </span>
                      )}
                      {risk.risk_level && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          risk.risk_level === 'high' ? 'bg-red-200 text-red-700' :
                          risk.risk_level === 'medium' ? 'bg-orange-200 text-orange-700' :
                          'bg-gray-200 text-gray-700'
                        }`}>{risk.risk_level === 'high' ? '高风险' : risk.risk_level === 'medium' ? '中风险' : '低风险'}</span>
                      )}
                    </div>
                  </div>
                  {risk.mitigation && (
                    <div className="mt-2 p-2 bg-violet-50 dark:bg-violet-900/20 rounded">
                      <p className="text-xs text-violet-700 dark:text-violet-300">🛡️ 缓解措施: {risk.mitigation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DataSupportBlock dataSupport={ap.supply_chain_risks.data_support} />
          </div>
        )}
        
        {/* 优先行动项 - P0 */}
        {ap.priority_action_list?.p0_critical && ap.priority_action_list.p0_critical.length > 0 && (
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
            <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
              <AlertCircle className="size-4" />
              🔴 P0 紧急行动项
            </h4>
            <div className="space-y-3">
              {ap.priority_action_list.p0_critical.slice(0, 3).map((action: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-red-500">
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{action.action}</span>
                    {action.owner && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded flex-shrink-0">
                        👤 {action.owner}
                      </span>
                    )}
                  </div>
                  {action.reason && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">原因: {action.reason}</p>
                  )}
                  {action.expected_outcome && (
                    <p className="text-xs text-green-600 mt-1">预期成效: {action.expected_outcome}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 优先行动项 - P1 */}
        {ap.priority_action_list?.p1_high && ap.priority_action_list.p1_high.length > 0 && (
          <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-xl border border-orange-200 dark:border-orange-800">
            <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
              🟠 P1 重要行动项
            </h4>
            <div className="space-y-2">
              {ap.priority_action_list.p1_high.slice(0, 3).map((action: any, idx: number) => (
                <div key={idx} className="p-3 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-orange-400">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-gray-900 dark:text-white flex-1">{action.action}</span>
                    {action.owner && (
                      <span className="text-xs text-gray-500 flex-shrink-0">👤 {action.owner}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 优先行动项 - P2 */}
        {ap.priority_action_list?.p2_medium && ap.priority_action_list.p2_medium.length > 0 && (
          <div className="p-4 bg-yellow-50/50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800">
            <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 mb-3 flex items-center gap-2">
              🟡 P2 常规行动项
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ap.priority_action_list.p2_medium.slice(0, 4).map((action: any, idx: number) => (
                <div key={idx} className="p-2 bg-white/80 dark:bg-gray-800/80 rounded-lg border-l-4 border-yellow-400">
                  <span className="text-xs text-gray-900 dark:text-white">{action.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 风险等级汇总 */}
        {ap.risk_level_summary && (
          <div className="p-4 bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-800/20 dark:to-purple-800/20 rounded-xl border border-violet-200 dark:border-violet-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">📊 整体风险等级:</span>
                <span className={`text-sm font-bold px-3 py-1 rounded ${
                  ap.risk_level_summary.overall_risk === 'critical' ? 'bg-red-200 text-red-700' :
                  ap.risk_level_summary.overall_risk === 'high' ? 'bg-orange-200 text-orange-700' :
                  ap.risk_level_summary.overall_risk === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                  'bg-green-200 text-green-700'
                }`}>
                  {ap.risk_level_summary.overall_risk === 'critical' ? '严重' :
                   ap.risk_level_summary.overall_risk === 'high' ? '高' :
                   ap.risk_level_summary.overall_risk === 'medium' ? '中等' : '低'}
                </span>
              </div>
              {ap.risk_level_summary.total_issues && (
                <span className="text-xs text-gray-500">共发现 {ap.risk_level_summary.total_issues} 个问题</span>
              )}
            </div>
            {ap.risk_level_summary.summary && (
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{ap.risk_level_summary.summary}</p>
            )}
            <DataSupportBlock dataSupport={ap.risk_level_summary.data_support} />
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
});

// 产品定位对比组件
const ProductPositioningSection = memo(({ data }: { data: MarketInsightData }) => {
  const profiles = data.product_profiles || [];
  const positioning = data.market_opportunities?.product_positioning_map;
  
  if (profiles.length === 0) return null;
  
  return (
    <CollapsibleCard 
      title="产品市场定位" 
      icon={Target} 
      iconColor="text-rose-600"
      bgColor="bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((profile, idx) => {
          const positionData = positioning?.positions?.find((p: any) => p.product === profile.product_index);
          const isLeader = positioning?.market_leader === profile.product_index;
          
          return (
            <div 
              key={idx} 
              className={`p-4 rounded-xl ${isLeader 
                ? 'bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-800/30 dark:to-pink-800/30 border-2 border-rose-300 dark:border-rose-600' 
                : 'bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <ImageWithFallback
                    src={profile.image_url || ''}
                    alt={profile.product_name || profile.asin}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  {isLeader && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">★</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {profile.product_name}
                  </h5>
                  <p className="text-xs text-gray-500">{profile.review_count || 0} 条评论</p>
                </div>
              </div>
              
              {positionData?.positioning && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">{positionData.positioning}</p>
              )}
              
              {positionData?.strengths && positionData.strengths.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {positionData.strengths.slice(0, 3).map((s: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-300 rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              
              {positionData?.gaps && positionData.gaps.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {positionData.gaps.slice(0, 2).map((g: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-300 rounded">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
});

// 主组件
export const MarketInsightRenderer = memo(({ data, items, projectId, readOnly = false }: MarketInsightRendererProps) => {
  // 侧边栏状态
  const [sidebarState, setSidebarState] = useState<SidebarState>({
    isOpen: false,
    queryType: 'label',
    dimensionKey: '',
    labelOrDimensionName: '',
    totalCount: undefined
  });
  
  // 处理 5W 标签点击
  const handleLabelClick = useCallback((dimensionKey: string, label: string, count: number) => {
    if (!projectId) {
      console.warn('Project ID is required to view reviews');
      return;
    }
    setSidebarState({
      isOpen: true,
      queryType: 'label',
      dimensionKey,
      labelOrDimensionName: label,
      totalCount: count
    });
  }, [projectId]);
  
  // 处理洞察维度点击
  const handleDimensionClick = useCallback((dimensionKey: string, label: string, count: number) => {
    if (!projectId) {
      console.warn('Project ID is required to view reviews');
      return;
    }
    setSidebarState({
      isOpen: true,
      queryType: 'dimension',
      dimensionKey,
      labelOrDimensionName: label,
      totalCount: count
    });
  }, [projectId]);
  
  // 关闭侧边栏
  const closeSidebar = useCallback(() => {
    setSidebarState(prev => ({ ...prev, isOpen: false }));
  }, []);
  
  if (!data) return null;
  
  // 获取数据统计（优先使用新结构，兼容旧结构）
  const dataStatistics: DataStatistics | undefined = data.data_statistics || (
    data.aggregated_data ? {
      five_w: {
        buyer: data.aggregated_data.five_w?.buyer || [],
        user: data.aggregated_data.five_w?.user || [],
        where: data.aggregated_data.five_w?.where || [],
        when: data.aggregated_data.five_w?.when || [],
        why: data.aggregated_data.five_w?.why || [],
        what: data.aggregated_data.five_w?.what || [],
      },
      insights: {
        strength: data.aggregated_data.dimensions?.pros || [],
        weakness: data.aggregated_data.dimensions?.cons || [],
        suggestion: data.aggregated_data.dimensions?.suggestion || [],
        scenario: data.aggregated_data.dimensions?.scenario || [],
        emotion: data.aggregated_data.dimensions?.emotion || [],
      }
    } : undefined
  );
  
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      {/* 市场概览 */}
      <MarketOverviewSection data={data} />
      
      {/* ===== 第一部分：数据统计（可点击查看原文）===== */}
      {dataStatistics && (
        <>
          <SectionDivider title="数据统计" />
          
          {/* 5W 用户画像数据统计 */}
          <DataStatisticsSection 
            data={dataStatistics} 
            onTagClick={handleLabelClick}
          />
          
          {/* 洞察数据统计 */}
          <InsightStatisticsSection 
            data={dataStatistics} 
            onTagClick={handleDimensionClick}
          />
        </>
      )}
      
      {/* ===== 第二部分：基于数据的推理（AI 分析观点，8模块完整版）===== */}
      <SectionDivider title="基于数据的 AI 分析" />
      
      {/* 市场格局分析 */}
      <CommonNeedsSection data={data} />
      <StrategicPositioningSection data={data} />
      
      {/* 用户洞察分析 */}
      <MarketPersonaSection data={data} />
      <UsageContextAnalysisSection data={data} />
      
      {/* 产品策略分析 */}
      <MarketOpportunitiesSection data={data} />
      <QualityRoadmapSection data={data} />
      
      {/* 运营行动分析 */}
      <MarketTrendsSection data={data} />
      <ActionPrioritiesSection data={data} />
      
      {/* 产品市场定位 */}
      <ProductPositioningSection data={data} />
      
      {/* 侧边栏 */}
      {projectId && (
        <MarketInsightSidebar
          isOpen={sidebarState.isOpen}
          onClose={closeSidebar}
          projectId={projectId}
          queryType={sidebarState.queryType}
          dimensionKey={sidebarState.dimensionKey}
          labelOrDimensionName={sidebarState.labelOrDimensionName}
          totalCount={sidebarState.totalCount}
        />
      )}
    </div>
  );
});

export default MarketInsightRenderer;
