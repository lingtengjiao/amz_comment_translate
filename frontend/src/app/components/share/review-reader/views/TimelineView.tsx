/**
 * TimelineView - 时间线视角
 * 现代时间轴设计
 */
import { useMemo, useState } from 'react';
import { Clock, ChevronDown, TrendingUp, TrendingDown, Star } from 'lucide-react';

interface TimelineViewProps {
  data: {
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

export function TimelineView({ data }: TimelineViewProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleExpand = (month: string) => {
    const newSet = new Set(expandedMonths);
    newSet.has(month) ? newSet.delete(month) : newSet.add(month);
    setExpandedMonths(newSet);
  };

  const timelineData = useMemo(() => {
    const reviews = data.reviews || [];
    const grouped: Record<string, typeof reviews> = {};

    reviews.forEach(review => {
      if (!review.date) return;
      const date = new Date(review.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(review);
    });

    return Object.entries(grouped)
      .map(([key, reviews]) => {
        const date = new Date(key + '-01');
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        return {
          key,
          label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
          shortLabel: `${date.getMonth() + 1}月`,
          year: date.getFullYear(),
          date,
          reviews: reviews.sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()),
          avgRating,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [data.reviews]);

  // 趋势计算
  const trend = useMemo(() => {
    if (timelineData.length < 2) return null;
    const recent = timelineData[0].reviews.length;
    const previous = timelineData[1].reviews.length;
    const change = recent - previous;
    return { change, isUp: change >= 0 };
  }, [timelineData]);

  return (
    <div className="p-6 md:p-10">
      {/* 趋势概览 */}
      {trend && (
        <div className="flex items-center gap-6 mb-10">
          <div className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl p-6 text-white">
            <div className="text-sm opacity-80 mb-1">最新月份</div>
            <div className="text-3xl font-bold">{timelineData[0]?.reviews.length || 0} 条评论</div>
          </div>
          <div className={`flex-1 rounded-2xl p-6 text-white ${
            trend.isUp ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'
          }`}>
            <div className="text-sm opacity-80 mb-1">环比变化</div>
            <div className="flex items-center gap-2">
              {trend.isUp ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
              <span className="text-3xl font-bold">{trend.isUp ? '+' : ''}{trend.change}</span>
            </div>
          </div>
        </div>
      )}

      {/* 时间轴 */}
      {timelineData.length > 0 ? (
        <div className="relative">
          {/* 时间轴线 */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-blue-500 to-purple-500" />

          <div className="space-y-6">
            {timelineData.map((month, idx) => {
              const isExpanded = expandedMonths.has(month.key);
              const isFirst = idx === 0;

              return (
                <div key={month.key} className="relative pl-16">
                  {/* 时间节点 */}
                  <div className={`absolute left-4 w-4 h-4 rounded-full border-4 ${
                    isFirst
                      ? 'bg-cyan-500 border-cyan-200'
                      : 'bg-white border-slate-300'
                  }`} />

                  {/* 月份卡片 */}
                  <button
                    onClick={() => toggleExpand(month.key)}
                    className={`w-full text-left p-5 rounded-2xl transition-all ${
                      isExpanded
                        ? 'bg-white shadow-xl'
                        : 'bg-white/60 hover:bg-white hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-slate-900">{month.label}</span>
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-600">
                          {month.reviews.length} 条评论
                        </span>
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span>平均 {month.avgRating.toFixed(1)}</span>
                        </div>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* 展开的评论列表 */}
                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {month.reviews.slice(0, 5).map(review => (
                        <div key={review.id} className="bg-white rounded-xl p-4 border border-slate-100 hover:shadow-lg transition-all">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star
                                  key={star}
                                  className={`h-3.5 w-3.5 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-slate-400">
                              {review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}
                            </span>
                          </div>
                          {review.title && (
                            <p className="font-medium text-slate-900 mb-1 line-clamp-1">{review.title}</p>
                          )}
                          <p className="text-sm text-slate-600 line-clamp-2">{review.content}</p>
                        </div>
                      ))}
                      {month.reviews.length > 5 && (
                        <p className="text-center text-sm text-slate-400 py-2">
                          还有 {month.reviews.length - 5} 条评论
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">暂无时间线数据</p>
        </div>
      )}
    </div>
  );
}
