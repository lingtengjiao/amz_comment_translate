/**
 * RatingView - 评分维度视角
 * 现代评分卡片设计
 */
import { useState, useMemo } from 'react';
import { Star } from 'lucide-react';

interface RatingViewProps {
  data: {
    reviews?: Array<{
      id: string;
      title: string;
      content: string;
      author: string;
      rating: number;
      date: string | null;
      verified: boolean;
    }>;
    stats?: {
      rating_distribution?: { 5: number; 4: number; 3: number; 2: number; 1: number };
    };
  };
}

export function RatingView({ data }: RatingViewProps) {
  const [selectedRating, setSelectedRating] = useState<number | 'all'>('all');

  const reviews = data.reviews || [];
  const distribution = data.stats?.rating_distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const filteredReviews = useMemo(() => {
    return selectedRating === 'all' ? reviews : reviews.filter(r => r.rating === selectedRating);
  }, [reviews, selectedRating]);

  const total = reviews.length;
  const maxCount = Math.max(...Object.values(distribution), 1);

  const ratingColors = {
    5: 'from-emerald-400 to-green-500',
    4: 'from-blue-400 to-indigo-500',
    3: 'from-amber-400 to-yellow-500',
    2: 'from-orange-400 to-red-400',
    1: 'from-red-500 to-rose-600',
  };

  return (
    <div className="p-6 md:p-10">
      {/* 评分分布卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-10">
        {[5, 4, 3, 2, 1].map(rating => {
          const count = distribution[rating as keyof typeof distribution];
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const barHeight = (count / maxCount) * 100;
          const isSelected = selectedRating === rating;
          const gradient = ratingColors[rating as keyof typeof ratingColors];

          return (
            <button
              key={rating}
              onClick={() => setSelectedRating(isSelected ? 'all' : rating)}
              className={`relative p-4 rounded-2xl transition-all duration-300 ${
                isSelected
                  ? 'bg-white shadow-xl scale-105'
                  : 'bg-white/60 hover:bg-white hover:shadow-lg'
              }`}
            >
              {/* 星星 */}
              <div className="flex justify-center mb-3">
                {[...Array(rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* 进度条 */}
              <div className="h-24 bg-slate-100 rounded-full overflow-hidden flex flex-col-reverse mx-auto w-8 mb-3">
                <div
                  className={`w-full bg-gradient-to-t ${gradient} transition-all duration-500 rounded-full`}
                  style={{ height: `${barHeight}%` }}
                />
              </div>

              {/* 数量和百分比 */}
              <div className="text-center">
                <div className="text-xl font-bold text-slate-900">{count}</div>
                <div className="text-xs text-slate-400">{percentage.toFixed(0)}%</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 评论列表 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-slate-900">
          {selectedRating === 'all' ? '全部评论' : `${selectedRating} 星评论`}
        </h3>
        <span className="text-sm text-slate-400">{filteredReviews.length} 条</span>
      </div>

      {filteredReviews.length > 0 ? (
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {filteredReviews.map(review => (
            <div
              key={review.id}
              className="bg-white rounded-xl p-5 border border-slate-100 hover:shadow-lg transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                      />
                    ))}
                  </div>
                  {review.verified && (
                    <span className="px-2 py-0.5 bg-green-50 text-green-600 text-xs rounded-full">
                      已验证
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}
                </span>
              </div>
              {review.title && (
                <p className="font-medium text-slate-900 mb-2">{review.title}</p>
              )}
              <p className="text-sm text-slate-600 line-clamp-3 mb-2">{review.content}</p>
              <div className="text-xs text-slate-400">{review.author}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-50 rounded-2xl">
          <Star className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">暂无评论</p>
        </div>
      )}
    </div>
  );
}
