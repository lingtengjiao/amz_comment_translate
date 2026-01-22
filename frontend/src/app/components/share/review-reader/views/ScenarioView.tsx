/**
 * ScenarioView - 使用场景视角
 * 现代标签云设计
 */
import { useState } from 'react';
import { MapPin, Clock, Target, ChevronDown } from 'lucide-react';

interface ScenarioViewProps {
  data: {
    aggregated_themes?: {
      where?: Array<{ label: string; count: number; review_ids: string[] }>;
      when?: Array<{ label: string; count: number; review_ids: string[] }>;
      what?: Array<{ label: string; count: number; review_ids: string[] }>;
    };
    reviews?: Array<{
      id: string;
      title: string;
      content: string;
      author: string;
      date: string | null;
    }>;
  };
}

export function ScenarioView({ data }: ScenarioViewProps) {
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'where' | 'when' | 'what'>('where');

  const toggleExpand = (label: string) => {
    const key = `${activeTab}-${label}`;
    const newSet = new Set(expandedLabels);
    newSet.has(key) ? newSet.delete(key) : newSet.add(key);
    setExpandedLabels(newSet);
  };

  const themes = data.aggregated_themes || {};

  const tabs = [
    { id: 'where' as const, label: '使用地点', subtitle: 'Where', icon: MapPin, items: themes.where || [], gradient: 'from-purple-500 to-pink-500' },
    { id: 'when' as const, label: '使用时机', subtitle: 'When', icon: Clock, items: themes.when || [], gradient: 'from-green-500 to-emerald-500' },
    { id: 'what' as const, label: '待办任务', subtitle: 'What', icon: Target, items: themes.what || [], gradient: 'from-orange-500 to-red-500' },
  ];

  const currentTab = tabs.find(t => t.id === activeTab)!;
  const getReviewById = (id: string) => data.reviews?.find(r => r.id === id);

  return (
    <div className="p-6 md:p-10">
      {/* 三维度切换 */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative p-5 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-white shadow-xl shadow-slate-200/50 scale-105'
                  : 'bg-white/50 hover:bg-white hover:shadow-lg'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tab.gradient} flex items-center justify-center mb-3 ${
                isActive ? '' : 'opacity-60'
              }`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="text-left">
                <div className={`font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                  {tab.label}
                </div>
                <div className="text-sm text-slate-400">{tab.items.length} 个场景</div>
              </div>
              {isActive && (
                <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-gradient-to-r ${tab.gradient}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* 标签云 */}
      {currentTab.items.length > 0 ? (
        <div className="space-y-4">
          {currentTab.items.map((theme, idx) => {
            const key = `${activeTab}-${theme.label}`;
            const isExpanded = expandedLabels.has(key);
            const reviews = theme.review_ids.map(id => getReviewById(id)).filter(Boolean);

            return (
              <div key={idx} className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all">
                <button onClick={() => toggleExpand(theme.label)} className="w-full p-5 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`px-4 py-2 rounded-full font-medium text-white bg-gradient-to-r ${currentTab.gradient}`}>
                        {theme.label}
                      </span>
                      <span className="text-slate-500">{theme.count} 条评论</span>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && reviews.length > 0 && (
                  <div className="px-5 pb-5 space-y-3">
                    {reviews.slice(0, 3).map((review: any) => (
                      <div key={review.id} className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex justify-between mb-2">
                          <span className="font-medium text-slate-900">{review.author}</span>
                          <span className="text-xs text-slate-400">
                            {review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">{review.content}</p>
                      </div>
                    ))}
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
