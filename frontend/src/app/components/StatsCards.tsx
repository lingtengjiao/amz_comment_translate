import { Star, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { Card } from './ui/card';
import { memo } from 'react';

interface StatsCardsProps {
  ratingStats: {
    totalReviews: number;
    ratingDistribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };
}

export const StatsCards = memo(function StatsCards({ ratingStats }: StatsCardsProps) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Rating Distribution Card - Compact */}
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Star className="size-4 text-yellow-500" />
            <h3 className="text-sm text-gray-900 dark:text-white">已下载的评分分布</h3>
          </div>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingStats.ratingDistribution[rating as keyof typeof ratingStats.ratingDistribution];
              const percentage = ratingStats.totalReviews > 0 
                ? (count / ratingStats.totalReviews) * 100 
                : 0;
              
              // Color based on rating
              let barColor = 'bg-gray-400 dark:bg-gray-600';
              if (rating === 5) barColor = 'bg-emerald-500 dark:bg-emerald-500';
              else if (rating === 4) barColor = 'bg-blue-500 dark:bg-blue-500';
              else if (rating === 3) barColor = 'bg-yellow-500 dark:bg-yellow-500';
              else if (rating === 2) barColor = 'bg-orange-500 dark:bg-orange-500';
              else if (rating === 1) barColor = 'bg-red-500 dark:bg-red-500';

              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400 w-7">{rating}星</span>
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-700 dark:text-gray-300 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sentiment Distribution Card - Compact */}
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="size-4 text-green-500" />
            <h3 className="text-sm text-gray-900 dark:text-white">已下载的情感分布</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Positive */}
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <div className="size-12 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                  <ThumbsUp className="size-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="text-xl text-gray-900 dark:text-white font-medium mb-0.5">
                {ratingStats.totalReviews > 0 
                  ? `${((ratingStats.sentimentDistribution.positive / ratingStats.totalReviews) * 100).toFixed(0)}%`
                  : '0%'
                }
              </div>
              <div className="text-[10px] text-green-600 dark:text-green-400 mb-0.5">正面</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {ratingStats.sentimentDistribution.positive} 条
              </div>
            </div>

            {/* Neutral */}
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <div className="size-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <Minus className="size-5 text-gray-600 dark:text-gray-400" />
                </div>
              </div>
              <div className="text-xl text-gray-900 dark:text-white font-medium mb-0.5">
                {ratingStats.totalReviews > 0 
                  ? `${((ratingStats.sentimentDistribution.neutral / ratingStats.totalReviews) * 100).toFixed(0)}%`
                  : '0%'
                }
              </div>
              <div className="text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">中性</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {ratingStats.sentimentDistribution.neutral} 条
              </div>
            </div>

            {/* Negative */}
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <div className="size-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                  <ThumbsDown className="size-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="text-xl text-gray-900 dark:text-white font-medium mb-0.5">
                {ratingStats.totalReviews > 0 
                  ? `${((ratingStats.sentimentDistribution.negative / ratingStats.totalReviews) * 100).toFixed(0)}%`
                  : '0%'
                }
              </div>
              <div className="text-[10px] text-red-600 dark:text-red-400 mb-0.5">负面</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {ratingStats.sentimentDistribution.negative} 条
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
});