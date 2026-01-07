/**
 * StatsDashboard - 数据概览看板
 * 
 * 在 AI 智能分析之前展示，让阅读者对产品现状有定量的、宏观的认知。
 * 
 * 功能：
 * 1. 展示 5W 用户画像 Top 10
 * 2. 展示 5类 Insight Top 10
 * 3. 带百分比进度条
 * 4. 支持点击查看证据
 */
import { memo, useState, useContext, useEffect, useRef } from 'react';
import {
  Users,
  MapPin,
  Clock,
  HelpCircle,
  Target,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Theater,
  Heart,
  ChevronDown,
  ChevronUp,
  BarChart3
} from 'lucide-react';
import type { ReportStats, ChartDataItem, StatsCategoryData, EvidenceSample } from '@/api/types';
import { isStatsCategoryData, getStatsItems, getStatsTotalCount } from '@/api/types';
import { TocContext } from './JsonReportRenderer';

interface StatsDashboardProps {
  analysisData: ReportStats;
  onViewEvidence?: (title: string, evidence: EvidenceSample[], totalCount: number) => void;
}

// 进度条组件
const ProgressBar = memo(function ProgressBar({
  item,
  maxPercent,
  colorClass,
  onClick
}: {
  item: ChartDataItem;
  maxPercent: number;
  colorClass: string;
  onClick?: () => void;
}) {
  // 相对宽度（相对于该类别中的最大值）
  const relativeWidth = maxPercent > 0 ? (item.percent || 0) / maxPercent * 100 : 0;
  
  return (
    <button
      onClick={onClick}
      className="w-full group text-left"
      title={onClick ? "点击查看证据" : undefined}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1 pr-2 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
          {item.name}
        </span>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          <span>{item.value}次</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{item.percent?.toFixed(1) || 0}%</span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass} ${onClick ? 'group-hover:opacity-80' : ''}`}
          style={{ width: `${Math.max(relativeWidth, 2)}%` }}
        />
      </div>
    </button>
  );
});

// 统计卡片组件
const StatsCard = memo(function StatsCard({
  title,
  icon: Icon,
  iconColor,
  data,
  colorClass,
  onViewEvidence,
  defaultExpanded = false
}: {
  title: string;
  icon: typeof Users;
  iconColor: string;
  data: ChartDataItem[] | StatsCategoryData | undefined;
  colorClass: string;
  onViewEvidence?: (title: string, evidence: EvidenceSample[], totalCount: number) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const items = getStatsItems(data);
  const totalCount = getStatsTotalCount(data);
  
  if (!items || items.length === 0) {
    return null;
  }
  
  // 获取最大占比（用于相对宽度计算）
  const maxPercent = Math.max(...items.map(item => item.percent || 0));
  
  // 显示的条目数（折叠时显示3条，展开时显示全部）
  const displayItems = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 card print:border-gray-300 print:p-3 print:mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${iconColor}`} />
          <h4 className="font-medium text-gray-900 dark:text-white text-sm">{title}</h4>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
          共 {totalCount} 条
        </span>
      </div>
      
      <div className="space-y-3">
        {displayItems.map((item, index) => (
          <ProgressBar
            key={index}
            item={item}
            maxPercent={maxPercent}
            colorClass={colorClass}
            onClick={onViewEvidence && item.evidence && item.evidence.length > 0 
              ? () => onViewEvidence(`${title} - ${item.name}`, item.evidence!, item.value)
              : undefined
            }
          />
        ))}
      </div>
      
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              展开更多 ({items.length - 3})
            </>
          )}
        </button>
      )}
    </div>
  );
});

export const StatsDashboard = memo(function StatsDashboard({
  analysisData,
  onViewEvidence
}: StatsDashboardProps) {
  const { context, insight, total_reviews, meta } = analysisData;
  const dashboardRef = useRef<HTMLDivElement>(null);
  
  // 从 TocContext 获取 registerSection 函数
  const tocContext = useContext(TocContext);
  const registerSection = tocContext?.registerSection;
  
  // 注册"数据概览"到大纲（作为第一项）- 立即注册，不等待 DOM
  useEffect(() => {
    if (registerSection) {
      // 立即注册，确保它是第一个
      registerSection('data-overview', '数据概览', 0);
    }
  }, [registerSection]);
  
  // 兼容新旧格式：优先使用顶层的 total_reviews，否则从 meta 中读取
  const totalReviews = total_reviews || (meta as any)?.total_reviews || 0;
  
  // 检查是否有数据
  const hasContextData = context && (
    getStatsItems(context.who).length > 0 ||
    getStatsItems(context.where).length > 0 ||
    getStatsItems(context.when).length > 0 ||
    getStatsItems(context.why).length > 0 ||
    getStatsItems(context.what).length > 0
  );
  
  const hasInsightData = insight && (
    getStatsItems(insight.strength).length > 0 ||
    getStatsItems(insight.weakness).length > 0 ||
    getStatsItems(insight.suggestion).length > 0 ||
    getStatsItems(insight.scenario).length > 0 ||
    getStatsItems(insight.emotion).length > 0
  );
  
  if (!hasContextData && !hasInsightData) {
    return null;
  }
  
  return (
    <div id="data-overview" ref={dashboardRef} className="mb-8 space-y-6 stats-dashboard print:mb-6">
      {/* 标题区 */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 print:bg-white print:border-gray-300 print:p-3">
        <BarChart3 className="size-6 text-slate-600 dark:text-slate-400" />
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">📊 数据概览</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            基于 {totalReviews} 条评论的统计分析 · Top 10 展示
          </p>
        </div>
      </div>
      
      {/* 5W 用户画像 */}
      {hasContextData && (
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="size-5 text-blue-500" />
            5W 用户画像
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatsCard
              title="Who 人群"
              icon={Users}
              iconColor="text-blue-500"
              data={context?.who}
              colorClass="bg-blue-500"
              onViewEvidence={onViewEvidence}
              defaultExpanded
            />
            <StatsCard
              title="Where 场景"
              icon={MapPin}
              iconColor="text-purple-500"
              data={context?.where}
              colorClass="bg-purple-500"
              onViewEvidence={onViewEvidence}
            />
            <StatsCard
              title="When 时机"
              icon={Clock}
              iconColor="text-orange-500"
              data={context?.when}
              colorClass="bg-orange-500"
              onViewEvidence={onViewEvidence}
            />
            <StatsCard
              title="Why 动机"
              icon={HelpCircle}
              iconColor="text-pink-500"
              data={context?.why}
              colorClass="bg-pink-500"
              onViewEvidence={onViewEvidence}
            />
            <StatsCard
              title="What 任务"
              icon={Target}
              iconColor="text-cyan-500"
              data={context?.what}
              colorClass="bg-cyan-500"
              onViewEvidence={onViewEvidence}
            />
          </div>
        </div>
      )}
      
      {/* 5类 Insight */}
      {hasInsightData && (
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lightbulb className="size-5 text-amber-500" />
            5类口碑洞察
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatsCard
              title="优势/卖点"
              icon={ThumbsUp}
              iconColor="text-emerald-500"
              data={insight?.strength}
              colorClass="bg-emerald-500"
              onViewEvidence={onViewEvidence}
              defaultExpanded
            />
            <StatsCard
              title="痛点/问题"
              icon={ThumbsDown}
              iconColor="text-red-500"
              data={insight?.weakness}
              colorClass="bg-red-500"
              onViewEvidence={onViewEvidence}
              defaultExpanded
            />
            <StatsCard
              title="用户建议"
              icon={Lightbulb}
              iconColor="text-amber-500"
              data={insight?.suggestion}
              colorClass="bg-amber-500"
              onViewEvidence={onViewEvidence}
            />
            <StatsCard
              title="使用场景"
              icon={Theater}
              iconColor="text-indigo-500"
              data={insight?.scenario}
              colorClass="bg-indigo-500"
              onViewEvidence={onViewEvidence}
            />
            <StatsCard
              title="情绪反馈"
              icon={Heart}
              iconColor="text-rose-500"
              data={insight?.emotion}
              colorClass="bg-rose-500"
              onViewEvidence={onViewEvidence}
            />
          </div>
        </div>
      )}
      
      {/* 分隔线 */}
      <div className="flex items-center gap-4 pt-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">⬇️ AI 智能分析</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
      </div>
    </div>
  );
});

export default StatsDashboard;

