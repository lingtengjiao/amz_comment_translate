/**
 * ListView - 原始列表视角
 * 现代筛选列表设计
 */
import { useState, useMemo } from 'react';
import { Search, Star, ShieldCheck, ThumbsUp, Calendar } from 'lucide-react';

interface ListViewProps {
  data: {
    reviews?: Array<{
      id: string;
      title: string;
      content: string;
      rating: number;
      author: string;
      date: string | null;
      sentiment: string | null;
      verified: boolean;
      helpful_votes: number;
    }>;
    stats?: {
      rating_distribution?: { 5: number; 4: number; 3: number; 2: number; 1: number };
    };
  };
}

const sentimentConfig = {
  positive: { label: '正面', bg: 'bg-green-50', text: 'text-green-600' },
  negative: { label: '负面', bg: 'bg-red-50', text: 'text-red-600' },
  neutral: { label: '中性', bg: 'bg-slate-50', text: 'text-slate-600' },
};

export function ListView({ data }: ListViewProps) {
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const reviews = data.reviews || [];

  const filteredReviews = useMemo(() => {
    return reviews.filter(review => {
      if (ratingFilter !== 'all' && review.rating !== ratingFilter) return false;
      if (sentimentFilter !== 'all' && review.sentiment !== sentimentFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          review.title.toLowerCase().includes(query) ||
          review.content.toLowerCase().includes(query) ||
          review.author.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [reviews, ratingFilter, sentimentFilter, searchQuery]);

  return (
    <div className="p-6 md:p-10">
      {/* 搜索和筛选 */}
      <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* 搜索框 */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索评论内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 星级筛选 */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-4 py-3 bg-slate-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部星级</option>
            {[5, 4, 3, 2, 1].map(r => (
              <option key={r} value={r}>{r} 星</option>
            ))}
          </select>

          {/* 情感筛选 */}
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部情感</option>
            <option value="positive">正面</option>
            <option value="neutral">中性</option>
            <option value="negative">负面</option>
          </select>

          <span className="text-sm text-slate-400">
            {filteredReviews.length} / {reviews.length} 条
          </span>
        </div>
      </div>

      {/* 评论列表 */}
      {filteredReviews.length > 0 ? (
        <div className="space-y-4">
          {filteredReviews.map(review => {
            const sentiment = review.sentiment && sentimentConfig[review.sentiment as keyof typeof sentimentConfig];

            return (
              <div
                key={review.id}
                className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-xl hover:shadow-slate-100/50 transition-all duration-300"
              >
                {/* 头部信息 */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {/* 星级 */}
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                      />
                    ))}
                  </div>

                  {/* 已验证 */}
                  {review.verified && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 text-xs rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      已验证
                    </span>
                  )}

                  {/* 情感标签 */}
                  {sentiment && (
                    <span className={`px-2 py-1 text-xs rounded-full ${sentiment.bg} ${sentiment.text}`}>
                      {sentiment.label}
                    </span>
                  )}

                  {/* 有帮助 */}
                  {review.helpful_votes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                      <ThumbsUp className="h-3 w-3" />
                      {review.helpful_votes}
                    </span>
                  )}
                </div>

                {/* 标题 */}
                {review.title && (
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {review.title}
                  </h3>
                )}

                {/* 内容 */}
                <p className="text-slate-600 leading-relaxed mb-4">
                  {review.content}
                </p>

                {/* 底部信息 */}
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span>{review.author}</span>
                  {review.date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(review.date).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl">
          <Search className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">没有找到匹配的评论</p>
        </div>
      )}
    </div>
  );
}
