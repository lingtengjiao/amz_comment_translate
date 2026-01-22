/**
 * PersonaView - 用户画像视角
 * 现代卡片式设计
 */
import { useState } from 'react';
import { ShoppingBag, User, ChevronDown } from 'lucide-react';

interface PersonaViewProps {
  data: {
    aggregated_themes?: {
      buyer?: Array<{
        label: string;
        count: number;
        review_ids: string[];
      }>;
      user?: Array<{
        label: string;
        count: number;
        review_ids: string[];
      }>;
    };
    reviews?: Array<{
      id: string;
      title: string;
      content: string;
      author: string;
      rating: number;
      date: string | null;
    }>;
  };
}

export function PersonaView({ data }: PersonaViewProps) {
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'buyer' | 'user'>('buyer');

  const toggleExpand = (label: string) => {
    const key = `${activeTab}-${label}`;
    const newSet = new Set(expandedLabels);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedLabels(newSet);
  };

  const themes = data.aggregated_themes || {};
  const buyerThemes = themes.buyer || [];
  const userThemes = themes.user || [];

  const tabs = [
    { id: 'buyer' as const, label: '购买者', subtitle: 'Buyers', icon: ShoppingBag, items: buyerThemes, color: 'blue' },
    { id: 'user' as const, label: '使用者', subtitle: 'Users', icon: User, items: userThemes, color: 'indigo' },
  ];

  const currentTab = tabs.find(t => t.id === activeTab)!;

  const getReviewById = (reviewId: string) => {
    return data.reviews?.find(r => r.id === reviewId);
  };

  return (
    <div className="p-6 md:p-10">
      {/* 标签切换 */}
      <div className="flex gap-4 mb-8">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 max-w-xs p-4 rounded-2xl border-2 transition-all duration-200 ${
                isActive
                  ? `border-${tab.color}-500 bg-${tab.color}-50`
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isActive ? `bg-${tab.color}-500 text-white` : 'bg-slate-100 text-slate-400'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className={`font-semibold ${isActive ? `text-${tab.color}-900` : 'text-slate-900'}`}>
                    {tab.label}
                  </div>
                  <div className="text-xs text-slate-400">{tab.items.length} 个画像</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 画像标签云 */}
      {currentTab.items.length > 0 ? (
        <div className="space-y-4">
          {currentTab.items.map((theme, idx) => {
            const key = `${activeTab}-${theme.label}`;
            const isExpanded = expandedLabels.has(key);
            const reviews = theme.review_ids
              .map(id => getReviewById(id))
              .filter(Boolean) as typeof data.reviews;

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:shadow-slate-100 transition-all duration-300"
              >
                <button
                  onClick={() => toggleExpand(theme.label)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`px-4 py-2 rounded-full font-semibold bg-gradient-to-r from-${currentTab.color}-500 to-${currentTab.color}-600 text-white`}>
                        {theme.label}
                      </span>
                      <span className="text-slate-500">
                        {theme.count} 条评论提及
                      </span>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && reviews && reviews.length > 0 && (
                  <div className="px-5 pb-5 space-y-3">
                    {reviews.slice(0, 3).map(review => (
                      <div
                        key={review.id}
                        className="p-4 bg-slate-50 rounded-xl"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-900">{review.author}</span>
                          <span className="text-xs text-slate-400">
                            {review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">{review.content}</p>
                      </div>
                    ))}
                    {reviews.length > 3 && (
                      <p className="text-center text-sm text-slate-400">
                        还有 {reviews.length - 3} 条相关评论
                      </p>
                    )}
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
          <p className="text-slate-400">暂无{currentTab.label}画像数据</p>
        </div>
      )}
    </div>
  );
}
