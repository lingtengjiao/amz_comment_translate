/**
 * AIAnnotationsSidebar - 右侧AI洞察批注栏
 * 
 * 功能：
 * - 根据当前查看的section显示相关AI总结
 * - 标签页切换：5W主题 / 产品维度 / 情感场景
 * - 显示置信度和证据数量
 * - 可收起设计
 */
import { useState, useMemo } from 'react';
import { 
  Sparkles, ChevronRight, ChevronLeft, 
  ShoppingBag, User, MapPin, Clock, Target, Zap,
  TrendingUp, Smile, Play, AlertCircle
} from 'lucide-react';

interface DimensionSummary {
  id: string;
  summary_type: string;
  category?: string;
  title?: string;
  summary: string;
  key_points?: string[];
  evidence_count?: number;
  confidence?: number;
  sentiment_tendency?: string;
  persona_data?: Record<string, any>;
}

interface AIAnnotationsSidebarProps {
  dimensionSummaries: DimensionSummary[];
  activeSection: string;
  isVisible: boolean;
  onToggle: () => void;
}

const themeIcons: Record<string, any> = {
  buyer: ShoppingBag,
  user: User,
  where: MapPin,
  when: Clock,
  why: Target,
  what: Zap,
};

const themeColors: Record<string, string> = {
  buyer: '#3B82F6',
  user: '#06B6D4',
  where: '#8B5CF6',
  when: '#10B981',
  why: '#F43F5E',
  what: '#F59E0B',
};

const themeLabels: Record<string, string> = {
  buyer: 'Buyer 购买者',
  user: 'User 使用者',
  where: 'Where 地点',
  when: 'When 时机',
  why: 'Why 动机',
  what: 'What 用途',
};

type TabType = 'themes' | 'dimensions' | 'emotions';

export function AIAnnotationsSidebar({ 
  dimensionSummaries = [], 
  activeSection,
  isVisible,
  onToggle
}: AIAnnotationsSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('themes');

  // 按类型分组摘要
  const summaryGroups = useMemo(() => {
    const groups = {
      themes: dimensionSummaries.filter(s => s.summary_type?.startsWith('theme_')),
      dimensions: dimensionSummaries.filter(s => s.summary_type === 'dimension'),
      emotions: dimensionSummaries.filter(s => s.summary_type === 'emotion'),
      scenarios: dimensionSummaries.filter(s => s.summary_type === 'scenario'),
    };
    return groups;
  }, [dimensionSummaries]);

  // 根据当前活跃section确定显示的摘要
  const contextualSummary = useMemo(() => {
    if (activeSection.startsWith('theme-')) {
      const themeKey = activeSection.replace('theme-', '');
      return summaryGroups.themes.find(s => s.summary_type === `theme_${themeKey}`);
    }
    if (activeSection.startsWith('dim-')) {
      const dimName = activeSection.replace('dim-', '');
      return summaryGroups.dimensions.find(s => s.category === dimName);
    }
    return null;
  }, [activeSection, summaryGroups]);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'themes', label: '5W主题', count: summaryGroups.themes.length },
    { key: 'dimensions', label: '维度', count: summaryGroups.dimensions.length },
    { key: 'emotions', label: '情感/场景', count: summaryGroups.emotions.length + summaryGroups.scenarios.length },
  ];

  const renderSummaryCard = (summary: DimensionSummary, showIcon = true) => {
    const isTheme = summary.summary_type?.startsWith('theme_');
    const themeKey = isTheme ? summary.summary_type?.replace('theme_', '') : null;
    const Icon = themeKey ? themeIcons[themeKey] : (summary.summary_type === 'dimension' ? TrendingUp : Smile);
    const color = themeKey ? themeColors[themeKey] : '#6366F1';

    return (
      <div 
        key={summary.id} 
        className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
      >
        {/* 标题行 */}
        <div className="flex items-center gap-2 mb-2">
          {showIcon && (
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-800 truncate">
              {summary.title || summary.category || (themeKey ? themeLabels[themeKey] : '洞察')}
            </h4>
          </div>
        </div>

        {/* 摘要内容 */}
        <p className="text-sm text-gray-600 leading-relaxed mb-3">
          {summary.summary}
        </p>

        {/* 关键点 */}
        {summary.key_points && summary.key_points.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-500 mb-1.5">关键发现</div>
            <ul className="space-y-1">
              {summary.key_points.slice(0, 3).map((point: any, i: number) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{typeof point === 'object' ? (point.label || point.text || JSON.stringify(point)) : point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 置信度和证据数 */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          {summary.confidence !== undefined && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <div 
                className="w-1.5 h-1.5 rounded-full"
                style={{ 
                  backgroundColor: summary.confidence >= 0.8 ? '#10B981' : 
                    summary.confidence >= 0.6 ? '#F59E0B' : '#EF4444'
                }}
              />
              <span>置信度 {Math.round(summary.confidence * 100)}%</span>
            </div>
          )}
          {summary.evidence_count !== undefined && (
            <div className="text-xs text-gray-500">
              {summary.evidence_count} 条证据
            </div>
          )}
        </div>
      </div>
    );
  };

  // 收起状态下的简化显示
  if (!isVisible) {
    return (
      <div className="w-10 bg-white border-l border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          title="展开AI洞察"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span 
            className="text-xs text-gray-500 writing-vertical"
            style={{ writingMode: 'vertical-rl' }}
          >
            AI洞察
          </span>
        </div>
      </div>
    );
  }

  return (
    <aside 
      className="w-80 bg-gray-50 border-l border-gray-200 flex flex-col transition-all duration-300"
      style={{ height: 'calc(100vh - 110px)', position: 'sticky', top: '110px' }}
    >
      {/* 标题栏 */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">AI 智能洞察</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          title="收起"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 上下文相关摘要 */}
      {contextualSummary && (
        <div className="px-3 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
          <div className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            当前section相关洞察
          </div>
          {renderSummaryCard(contextualSummary, true)}
        </div>
      )}

      {/* 标签页 */}
      <div className="px-3 pt-3 border-b border-gray-200 bg-white">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-50 text-gray-900 border-b-2 border-indigo-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 text-gray-400">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'themes' && (
          summaryGroups.themes.length > 0 ? (
            summaryGroups.themes.map(summary => renderSummaryCard(summary))
          ) : (
            <EmptyState message="暂无5W主题AI总结" />
          )
        )}

        {activeTab === 'dimensions' && (
          summaryGroups.dimensions.length > 0 ? (
            summaryGroups.dimensions.map(summary => renderSummaryCard(summary))
          ) : (
            <EmptyState message="暂无产品维度AI总结" />
          )
        )}

        {activeTab === 'emotions' && (
          <>
            {summaryGroups.emotions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">情感维度</h4>
                <div className="space-y-3">
                  {summaryGroups.emotions.map(summary => renderSummaryCard(summary))}
                </div>
              </div>
            )}
            {summaryGroups.scenarios.length > 0 && (
              <div className={summaryGroups.emotions.length > 0 ? 'mt-4' : ''}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">场景维度</h4>
                <div className="space-y-3">
                  {summaryGroups.scenarios.map(summary => renderSummaryCard(summary))}
                </div>
              </div>
            )}
            {summaryGroups.emotions.length === 0 && summaryGroups.scenarios.length === 0 && (
              <EmptyState message="暂无情感/场景AI总结" />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="h-8 w-8 text-gray-300 mb-2" />
      <p className="text-sm text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 mt-1">点击"生成AI分析"按钮生成</p>
    </div>
  );
}
