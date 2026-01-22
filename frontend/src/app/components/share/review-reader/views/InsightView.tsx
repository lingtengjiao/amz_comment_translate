/**
 * InsightView - 产品洞察视角
 * 现代卡片式设计，轻盈通透
 */
import { useState } from 'react';
import { TrendingUp, TrendingDown, Lightbulb, ChevronDown, Quote } from 'lucide-react';

interface InsightViewProps {
  data: {
    aggregated_insights?: {
      strengths?: Array<{
        review_id: string;
        quote: string;
        quote_translated?: string;
        analysis: string;
        dimension?: string;
      }>;
      weaknesses?: Array<{
        review_id: string;
        quote: string;
        quote_translated?: string;
        analysis: string;
        dimension?: string;
      }>;
      suggestions?: Array<{
        review_id: string;
        quote: string;
        quote_translated?: string;
        analysis: string;
        dimension?: string;
      }>;
    };
    reviews?: Array<{
      id: string;
      author: string;
      rating: number;
    }>;
  };
}

export function InsightView({ data }: InsightViewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'strengths' | 'weaknesses' | 'suggestions'>('strengths');

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedItems(newSet);
  };

  const insights = data.aggregated_insights || {};
  const strengths = insights.strengths || [];
  const weaknesses = insights.weaknesses || [];
  const suggestions = insights.suggestions || [];

  const tabs = [
    { id: 'strengths' as const, label: '产品优势', count: strengths.length, icon: TrendingUp, color: 'emerald', items: strengths },
    { id: 'weaknesses' as const, label: '改进空间', count: weaknesses.length, icon: TrendingDown, color: 'orange', items: weaknesses },
    { id: 'suggestions' as const, label: '用户建议', count: suggestions.length, icon: Lightbulb, color: 'blue', items: suggestions },
  ];

  const currentTab = tabs.find(t => t.id === activeTab)!;

  return (
    <div className="p-6 md:p-10">
      {/* 标签切换 */}
      <div className="flex flex-wrap gap-3 mb-8">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-200 ${
                isActive
                  ? `bg-${tab.color}-500 text-white shadow-lg shadow-${tab.color}-200`
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                isActive ? 'bg-white/20' : 'bg-slate-100'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 洞察卡片列表 */}
      {currentTab.items.length > 0 ? (
        <div className="space-y-4">
          {currentTab.items.map((insight, idx) => {
            const id = `${activeTab}-${idx}`;
            const isExpanded = expandedItems.has(id);

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:shadow-slate-100 transition-all duration-300"
              >
                <button
                  onClick={() => toggleExpand(id)}
                  className="w-full p-6 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {insight.dimension && (
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 bg-${currentTab.color}-50 text-${currentTab.color}-600`}>
                          {insight.dimension}
                        </span>
                      )}
                      <p className="text-slate-900 leading-relaxed">
                        {insight.analysis}
                      </p>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                      <Quote className="h-5 w-5 text-slate-300 flex-shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        {insight.quote_translated && (
                          <p className="text-slate-700 italic">
                            "{insight.quote_translated}"
                          </p>
                        )}
                        <p className="text-slate-400 text-sm italic">
                          "{insight.quote}"
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <currentTab.icon className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-slate-400">暂无{currentTab.label}数据</p>
        </div>
      )}
    </div>
  );
}
