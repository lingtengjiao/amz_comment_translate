/**
 * 下钻弹窗组件
 * 展示选中单元格对应的评论列表
 */
import { useState } from 'react';
import { X, ArrowUpDown } from 'lucide-react';
import { DrillDownData } from './types';

interface DrillDownModalProps {
  data: DrillDownData | null;
  reviews: Array<any>;
  onClose: () => void;
}

type SortBy = 'rating' | 'date' | 'default';

export function DrillDownModal({ data, reviews, onClose }: DrillDownModalProps) {
  const [sortBy, setSortBy] = useState<SortBy>('default');
  
  if (!data) return null;
  
  // 获取对应的评论
  const cellReviews = reviews.filter(r => data.reviewIds.includes(r.id));
  
  // 排序
  const sortedReviews = [...cellReviews].sort((a, b) => {
    if (sortBy === 'rating') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (sortBy === 'date') {
      const dateA = a.review_date || a.date || '';
      const dateB = b.review_date || b.date || '';
      return dateB.localeCompare(dateA);
    }
    return 0;
  });
  
  // 复用ReviewCard组件（从SharedReviewReader导入样式）
  const ReviewCard = ({ review }: { review: any }) => {
    const [expanded, setExpanded] = useState(false);
    const themes = review.theme_highlights || [];
    const insights = review.insights || [];
    const tags = [
      ...themes
        .filter((t: any) => ['buyer', 'user', 'where', 'when', 'why', 'what'].includes(t.theme_type))
        .map((t: any) => t.label_name),
      ...insights.map((i: any) => i.dimension)
    ].filter(Boolean);
    
    const content = review.content || review.body_translated || '';
    const needsExpand = content.length > 150;
    
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md hover:border-gray-300 transition-all">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <span
                key={i}
                className={`text-xs ${i <= (review.rating || 0) ? 'text-amber-400' : 'text-gray-200'}`}
              >
                ★
              </span>
            ))}
          </div>
          {review.verified_purchase && (
            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
              已验证
            </span>
          )}
        </div>
        {review.title && (
          <h4 className="text-xs font-bold text-gray-900 mb-1 line-clamp-1">
            {review.title_translated || review.title}
          </h4>
        )}
        <div className="relative">
          <p
            className={`text-xs text-gray-600 leading-relaxed ${
              !expanded && needsExpand ? 'line-clamp-3' : ''
            }`}
          >
            {content}
          </p>
          {needsExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-[10px] text-blue-600 hover:text-blue-700 mt-1 font-medium"
            >
              {expanded ? '收起' : '展开全部'}
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {[...new Set(tags)].slice(0, 3).map((t: string, i: number) => (
              <span
                key={i}
                className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100 text-[10px] text-gray-400">
          <span>{review.author || review.reviewer_name || '匿名用户'}</span>
          <span>
            {review.review_date || review.date
              ? new Date(review.review_date || review.date).toLocaleDateString('zh-CN')
              : ''}
          </span>
        </div>
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
              {data.rowLabel} × {data.colLabel}
            </h3>
            <p className="text-xs sm:text-sm text-gray-500">
              共 {data.count} 条相关评论
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 排序选择 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="default">默认排序</option>
              <option value="rating">按评分</option>
              <option value="date">按时间</option>
            </select>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl transition-colors"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* 评论列表 */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {sortedReviews.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              暂无相关评论
            </div>
          ) : (
            <div className="space-y-3">
              {sortedReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
