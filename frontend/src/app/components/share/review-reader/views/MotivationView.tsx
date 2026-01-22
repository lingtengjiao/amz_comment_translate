/**
 * MotivationView - 购买动机视角
 * 现代进度条设计
 */
import { useState } from 'react';
import { Target, ChevronDown } from 'lucide-react';

interface MotivationViewProps {
  data: {
    aggregated_themes?: {
      why?: Array<{ label: string; count: number; review_ids: string[] }>;
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

export function MotivationView({ data }: MotivationViewProps) {
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());

  const toggleExpand = (label: string) => {
    const newSet = new Set(expandedLabels);
    newSet.has(label) ? newSet.delete(label) : newSet.add(label);
    setExpandedLabels(newSet);
  };

  const whyThemes = data.aggregated_themes?.why || [];
  const totalCount = whyThemes.reduce((sum, theme) => sum + theme.count, 0);
  const maxCount = Math.max(...whyThemes.map(t => t.count), 1);

  const getReviewById = (id: string) => data.reviews?.find(r => r.id === id);

  const gradients = [
    'from-rose-500 to-pink-500',
    'from-violet-500 to-purple-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-green-500',
    'from-amber-500 to-orange-500',
  ];

  return (
    <div className="p-6 md:p-10">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">{whyThemes.length}</div>
          <div className="text-rose-100 text-sm">动机类型</div>
        </div>
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">{totalCount}</div>
          <div className="text-violet-100 text-sm">相关评论</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl p-6 text-white">
          <div className="text-3xl font-bold mb-1 truncate">{whyThemes[0]?.label || '-'}</div>
          <div className="text-blue-100 text-sm">主要动机</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">
            {totalCount > 0 ? ((whyThemes[0]?.count / totalCount) * 100).toFixed(0) : 0}%
          </div>
          <div className="text-emerald-100 text-sm">最高占比</div>
        </div>
      </div>

      {/* 动机列表 */}
      {whyThemes.length > 0 ? (
        <div className="space-y-4">
          {whyThemes.map((theme, idx) => {
            const isExpanded = expandedLabels.has(theme.label);
            const reviews = theme.review_ids.map(id => getReviewById(id)).filter(Boolean);
            const percentage = (theme.count / maxCount) * 100;
            const gradient = gradients[idx % gradients.length];

            return (
              <div key={idx} className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all">
                <button onClick={() => toggleExpand(theme.label)} className="w-full p-5 text-left">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-4 py-2 rounded-full font-medium text-white bg-gradient-to-r ${gradient}`}>
                        {theme.label}
                      </span>
                      <span className="text-slate-500">{theme.count} 条</span>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                  {/* 进度条 */}
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
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
            <Target className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-slate-400">暂无购买动机数据</p>
        </div>
      )}
    </div>
  );
}
