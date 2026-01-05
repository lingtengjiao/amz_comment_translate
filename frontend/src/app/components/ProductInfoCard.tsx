import { Star, Copy, Check } from 'lucide-react';
import { useState, memo } from 'react';
import { Card } from './ui/card';
import type { Task } from '../data/mockData';

interface ProductInfoCardProps {
  task: Task;
  ratingStats: {
    averageRating: string;
    totalReviews: number;
    translatedReviews: number;
    reviewsWithInsights: number;
    reviewsWithThemes: number;
  };
}

export const ProductInfoCard = memo(function ProductInfoCard({ task, ratingStats }: ProductInfoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAsin = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(task.asin);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = task.asin;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        } catch (err) {
          console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy ASIN:', err);
    }
  };

  return (
    <Card className="mb-6 overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Side: Product Image + Stats */}
          <div className="flex-shrink-0 space-y-4">
            {/* Product Image */}
            <img 
              src={task.imageUrl} 
              alt={task.title}
              className="w-full lg:w-48 h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
            />
            
            {/* Stats Below Image - Separated */}
            <div className="w-full lg:w-48 space-y-3">
              {/* Link Rating - Standalone - More Prominent */}
              <div className="p-5 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border-2 border-yellow-300 dark:border-yellow-700 shadow-sm">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">链接评分</div>
                <div className="flex items-center gap-2.5">
                  <Star className="size-6 fill-yellow-400 text-yellow-400" />
                  <span className="text-3xl text-gray-900 dark:text-white font-bold">{ratingStats.averageRating}</span>
                </div>
              </div>

              {/* Review Stats - Compact and Subtle */}
              <div className="px-3 py-2.5 bg-gray-100/50 dark:bg-gray-700/20 rounded text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-500">下载评论数</span>
                  <span className="text-gray-700 dark:text-gray-300">{ratingStats.totalReviews} 条</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-500">已翻译</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {ratingStats.translatedReviews} 条
                    <span className="text-gray-500 dark:text-gray-400 ml-1">
                      ({ratingStats.totalReviews > 0 
                        ? `${((ratingStats.translatedReviews / ratingStats.totalReviews) * 100).toFixed(0)}%`
                        : '0%'
                      })
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-500">已做洞察</span>
                  <span className="text-purple-600 dark:text-purple-400">
                    {ratingStats.reviewsWithInsights} 条
                    <span className="text-gray-500 dark:text-gray-400 ml-1">
                      ({ratingStats.translatedReviews > 0 
                        ? `${((ratingStats.reviewsWithInsights / ratingStats.translatedReviews) * 100).toFixed(0)}%`
                        : '0%'
                      })
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-500">已提取主题</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {ratingStats.reviewsWithThemes} 条
                    <span className="text-gray-500 dark:text-gray-400 ml-1">
                      ({ratingStats.translatedReviews > 0 
                        ? `${((ratingStats.reviewsWithThemes / ratingStats.translatedReviews) * 100).toFixed(0)}%`
                        : '0%'
                      })
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Product Details */}
          <div className="flex-1 min-w-0">
            {/* ASIN Badge with Copy */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-400">ASIN:</span>
              <span className="text-xs text-gray-900 dark:text-white font-mono">{task.asin}</span>
              <button
                onClick={handleCopyAsin}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="复制ASIN"
              >
                {copied ? (
                  <Check className="size-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="size-4 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            </div>

            {/* Product Title - Bilingual Display */}
            <div className="mb-4 space-y-2">
              {/* Chinese Title (Primary) */}
              {task.titleTranslated && (
                <h2 className="text-emerald-700 dark:text-emerald-400 font-bold leading-snug">
                  {task.titleTranslated}
                </h2>
              )}
              {/* English Title (Original) */}
              {task.titleOriginal && (
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {task.titleOriginal}
                </p>
              )}
              {/* Fallback if no translations */}
              {!task.titleTranslated && !task.titleOriginal && (
                <h2 className="text-gray-900 dark:text-white font-bold leading-snug">{task.title}</h2>
              )}
              {/* Price */}
              {task.price && (
                <p className="text-blue-600 dark:text-blue-400 font-bold">{task.price}</p>
              )}
            </div>

            {/* Bullet Points - Side by Side */}
            {task.bulletPoints && task.bulletPoints.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* English Bullet Points */}
                <div className="p-4 bg-blue-50/50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20">
                  <h3 className="text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 font-semibold mb-3 flex items-center gap-2">
                    <div className="size-2 rounded-full bg-blue-500" />
                    Product Features
                  </h3>
                  <ul className="space-y-2">
                    {task.bulletPoints.map((point, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-700 dark:text-gray-300 leading-relaxed">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Chinese Bullet Points */}
                {task.bulletPointsTranslated && task.bulletPointsTranslated.length > 0 && (
                  <div className="p-4 bg-emerald-50/50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                    <h3 className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold mb-3 flex items-center gap-2">
                      <div className="size-2 rounded-full bg-emerald-500" />
                      产品特点
                    </h3>
                    <ul className="space-y-2">
                      {task.bulletPointsTranslated.map((point, index) => (
                        <li key={index} className="flex items-start gap-2 text-gray-900 dark:text-gray-100 leading-relaxed font-medium">
                          <span className="text-emerald-500 mt-1">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});