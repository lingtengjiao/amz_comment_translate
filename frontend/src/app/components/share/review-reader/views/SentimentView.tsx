/**
 * SentimentView - 情感对比视角
 * 现代双栏对比设计
 */
import { useMemo } from 'react';
import { ThumbsUp, ThumbsDown, Minus, Star } from 'lucide-react';

interface SentimentViewProps {
  data: {
    reviews?: Array<{
      id: string;
      title: string;
      content: string;
      author: string;
      rating: number;
      date: string | null;
      sentiment: string | null;
    }>;
    stats?: {
      sentiment_distribution?: {
        positive: number;
        neutral: number;
        negative: number;
      };
    };
  };
}

export function SentimentView({ data }: SentimentViewProps) {
  const reviews = data.reviews || [];
  const stats = data.stats?.sentiment_distribution || { positive: 0, neutral: 0, negative: 0 };

  const { positiveReviews, negativeReviews } = useMemo(() => {
    const positive = reviews.filter(r => r.sentiment === 'positive');
    const negative = reviews.filter(r => r.sentiment === 'negative');
    return { positiveReviews: positive, negativeReviews: negative };
  }, [reviews]);

  const total = reviews.length;
  const positivePercent = total > 0 ? (stats.positive / total) * 100 : 0;
  const negativePercent = total > 0 ? (stats.negative / total) * 100 : 0;

  const ReviewCard = ({ review, type }: { review: typeof reviews[0]; type: 'positive' | 'negative' }) => (
    <div className="bg-white rounded-xl p-5 border border-slate-100 hover:shadow-lg hover:shadow-slate-100/50 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(star => (
              <Star
                key={star}
                className={`h-3.5 w-3.5 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
              />
            ))}
          </div>
        </div>
        <span className="text-xs text-slate-400">
          {review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}
        </span>
      </div>
      {review.title && (
        <p className="font-medium text-slate-900 mb-2 line-clamp-1">{review.title}</p>
      )}
      <p className="text-sm text-slate-600 line-clamp-3 mb-3">{review.content}</p>
      <div className="text-xs text-slate-400">{review.author}</div>
    </div>
  );

  return (
    <div className="p-6 md:p-10">
      {/* 统计概览 */}
      <div className="flex items-center justify-center gap-8 mb-10">
        {/* 正面 */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-green-200">
            <ThumbsUp className="h-8 w-8 text-white" />
          </div>
          <div className="text-3xl font-bold text-green-600 mb-1">{positivePercent.toFixed(0)}%</div>
          <div className="text-sm text-slate-500">{stats.positive} 条正面</div>
        </div>

        {/* VS */}
        <div className="text-4xl font-light text-slate-300">VS</div>

        {/* 负面 */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-red-200">
            <ThumbsDown className="h-8 w-8 text-white" />
          </div>
          <div className="text-3xl font-bold text-red-600 mb-1">{negativePercent.toFixed(0)}%</div>
          <div className="text-sm text-slate-500">{stats.negative} 条负面</div>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-10">
        <div
          className="bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
          style={{ width: `${positivePercent}%` }}
        />
        <div
          className="bg-gradient-to-r from-red-400 to-rose-500 transition-all"
          style={{ width: `${negativePercent}%` }}
        />
      </div>

      {/* 双栏对比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 正面评论 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <ThumbsUp className="h-4 w-4 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-900">正面评论</h3>
            <span className="text-sm text-slate-400">({positiveReviews.length})</span>
          </div>
          {positiveReviews.length > 0 ? (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {positiveReviews.slice(0, 8).map(review => (
                <ReviewCard key={review.id} review={review} type="positive" />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl">
              暂无正面评论
            </div>
          )}
        </div>

        {/* 负面评论 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <ThumbsDown className="h-4 w-4 text-red-600" />
            </div>
            <h3 className="font-semibold text-slate-900">负面评论</h3>
            <span className="text-sm text-slate-400">({negativeReviews.length})</span>
          </div>
          {negativeReviews.length > 0 ? (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {negativeReviews.slice(0, 8).map(review => (
                <ReviewCard key={review.id} review={review} type="negative" />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl">
              暂无负面评论
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
