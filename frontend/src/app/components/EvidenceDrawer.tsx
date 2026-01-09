/**
 * EvidenceDrawer - 证据溯源抽屉组件
 * 
 * 用于展示报告中某个观点的原始评论证据
 * 支持：
 * 1. 显示证据样本列表
 * 2. 跳转查看完整评论
 * 3. 显示评论评分和日期
 */
import { memo, useState } from 'react';
import {
  X,
  Star,
  Calendar,
  MessageSquare,
  Quote,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Languages,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Button } from './ui/button';
import type { EvidenceSample, ApiReview } from '@/api/types';
import { getReviews } from '@/api/service';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  totalCount: number;
  evidence: EvidenceSample[];
  sourceType: 'context' | 'insight';
  sourceCategory?: string;  // e.g., "who", "weakness"
  asin?: string;  // 用于跳转到评论列表
}

// 评分星星组件
const RatingStars = memo(function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-3 ${
            star <= rating
              ? 'fill-yellow-400 text-yellow-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700'
          }`}
        />
      ))}
    </div>
  );
});

// 情感标签
const SentimentBadge = memo(function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    positive: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: '正面' },
    negative: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '负面' },
    neutral: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-400', label: '中性' }
  };
  const c = config[sentiment] || config.neutral;
  
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
});

export const EvidenceDrawer = memo(function EvidenceDrawer({
  isOpen,
  onClose,
  title,
  totalCount,
  evidence,
  sourceType,
  sourceCategory,
  asin
}: EvidenceDrawerProps) {
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [allReviews, setAllReviews] = useState<ApiReview[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 加载所有相关评论
  const handleLoadAllReviews = async () => {
    if (showAllReviews) {
      setShowAllReviews(false);
      return;
    }

    if (allReviews.length > 0) {
      setShowAllReviews(true);
      return;
    }

    if (!asin) {
      setLoadError('缺少产品信息');
      return;
    }

    setIsLoadingAll(true);
    setLoadError(null);

    try {
      // 先收集已有证据中的所有 review_id
      const evidenceReviewIds = new Set(evidence.map(e => e.review_id).filter(Boolean));
      
      // 获取所有评论
      const response = await getReviews({
        asin,
        page: 1,
        pageSize: 1000, // 获取足够多的评论
      });

      let filteredReviews: ApiReview[] = [];
      
      // 尝试从 title 中提取 category 和 label 信息
      // 例如: "Why 动机 - 送礼" -> category: "why", label: "送礼"
      let extractedCategory = sourceCategory;
      let extractedLabel: string | null = null;
      
      const titleMatch = title.match(/(\w+)\s+.+?\s*-\s*(.+)$/);
      if (titleMatch) {
        const categoryMap: Record<string, string> = {
          'Who': 'who', 'Where': 'where', 'When': 'when', 'Why': 'why', 'What': 'what'
        };
        const categoryName = titleMatch[1];
        extractedCategory = categoryMap[categoryName] || extractedCategory;
        extractedLabel = titleMatch[2].trim();
      }
      
      // 如果有 sourceCategory 或提取到的 category，尝试智能过滤
      const categoryToUse = extractedCategory || sourceCategory;
      
      if (categoryToUse && sourceType) {
        if (sourceType === 'context') {
          // 对于 5W context，根据 theme_highlights 过滤
          filteredReviews = response.reviews.filter((review: ApiReview) => {
            if (!review.theme_highlights) return false;
            return review.theme_highlights.some((theme: any) => {
              if (theme.theme_type !== categoryToUse) return false;
              
              // 如果有提取到的标签名称，进行精确匹配
              if (extractedLabel) {
                if (theme.label_name === extractedLabel) return true;
                if (theme.items && Array.isArray(theme.items)) {
                  return theme.items.some((item: any) => {
                    const name = typeof item === 'string' ? item : (item.content || item.tag || '');
                    return name === extractedLabel;
                  });
                }
                return false; // 如果有标签但没匹配到，排除
              }
              
              // 如果没有具体标签，只要类型匹配就包含
              return true;
            });
          });
        } else if (sourceType === 'insight') {
          // 对于 insight，根据 insights 过滤
          filteredReviews = response.reviews.filter((review: ApiReview) => {
            if (!review.insights) return false;
            return review.insights.some((insight: any) => {
              // 根据 dimension 或 type 匹配
              return insight.dimension === categoryToUse || 
                     insight.type === categoryToUse;
            });
          });
        }
      }
      
      // 如果过滤后没有结果或结果太少，使用证据中的 review_id 来补充
      if (filteredReviews.length < totalCount && evidenceReviewIds.size > 0) {
        // 补充证据中已有的评论
        const evidenceReviews = response.reviews.filter((review: ApiReview) => 
          evidenceReviewIds.has(review.id) || evidenceReviewIds.has(review.review_id)
        );
        
        // 合并并去重
        const allFiltered = [...filteredReviews, ...evidenceReviews];
        const uniqueReviews = Array.from(
          new Map(allFiltered.map(r => [r.id, r])).values()
        );
        filteredReviews = uniqueReviews;
      }
      
      // 如果还是没有结果，至少显示证据中的评论
      if (filteredReviews.length === 0 && evidenceReviewIds.size > 0) {
        filteredReviews = response.reviews.filter((review: ApiReview) => 
          evidenceReviewIds.has(review.id) || evidenceReviewIds.has(review.review_id)
        );
      }

      // 限制数量
      filteredReviews = filteredReviews.slice(0, totalCount);
      setAllReviews(filteredReviews);
      setShowAllReviews(true);
    } catch (err) {
      console.error('加载全部评论失败:', err);
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoadingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 - 覆盖整个页面包括左侧大纲 */}
      <div 
        className="fixed inset-0 bg-black/50 z-[45] transition-opacity"
        onClick={onClose}
      />
      
      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl z-[50] flex flex-col animate-slide-in-right">
        {/* 头部 */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Quote className="size-5 text-emerald-500" />
                {title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                共 {totalCount} 条相关反馈，展示 {evidence.length} 条证据样本
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="size-5 text-gray-500" />
            </button>
          </div>
        </div>
        
        {/* 证据列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {evidence.length === 0 && !showAllReviews ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <AlertCircle className="size-12 mb-4" />
              <p>暂无证据样本</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 显示所有评论（如果已加载） */}
              {showAllReviews && allReviews.length > 0 && (
                <>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    全部 {allReviews.length} 条相关评论
                  </div>
                                  {allReviews.map((review, index) => (
                    <div
                      key={review.id || index}
                      className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <RatingStars rating={review.rating} />
                          {review.sentiment && <SentimentBadge sentiment={review.sentiment} />}
                        </div>
                        {review.review_date && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Calendar className="size-3" />
                            {review.review_date}
                          </span>
                        )}
                      </div>
                      <blockquote className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-l-3 border-emerald-500 pl-3 italic">
                        "{review.body_translated || review.body_original || '无内容'}"
                      </blockquote>
                      {review.body_translated && review.body_original && review.body_translated !== review.body_original && (
                        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <Languages className="size-3 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium text-gray-500 dark:text-gray-500">原文: </span>
                            <span className="italic">"{review.body_original}"</span>
                          </div>
                        </div>
                      )}
                      {/* 查看亚马逊原文链接 */}
                      {review.review_url && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <a
                            href={review.review_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                            title="在亚马逊查看原文"
                          >
                            <ExternalLink className="size-3" />
                            <span>在亚马逊查看原文</span>
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
              
              {/* 显示证据样本（如果未展开全部） */}
              {!showAllReviews && evidence.map((item, index) => (
                <div
                  key={item.review_id || index}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  {/* 头部信息 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {item.rating && <RatingStars rating={item.rating} />}
                      {item.sentiment && <SentimentBadge sentiment={item.sentiment} />}
                    </div>
                    {item.date && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Calendar className="size-3" />
                        {item.date}
                      </span>
                    )}
                  </div>
                  
                  {/* 引用内容 - 优先显示中文翻译，如果没有翻译则显示原文 */}
                  <blockquote className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-l-3 border-emerald-500 pl-3 italic">
                    "{item.quote || item.quote_original || '无内容'}"
                  </blockquote>
                  
                  {/* 原文（如果与翻译不同且存在） */}
                  {item.quote_original && item.quote_original !== item.quote && item.quote && (
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                      <Languages className="size-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-gray-500 dark:text-gray-500">原文: </span>
                        <span className="italic">"{item.quote_original}"</span>
                      </div>
                    </div>
                  )}
                  
                  {/* AI 分析 */}
                  {item.analysis && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-400">
                      <span className="font-medium">AI 分析: </span>
                      {item.analysis}
                    </div>
                  )}
                  
                  {/* 操作按钮 - 查看完整评论和查看原文链接 */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
                    {/* 查看亚马逊原文链接 */}
                    {item.review_url && (
                      <a
                        href={item.review_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                        title="在亚马逊查看原文"
                      >
                        <ExternalLink className="size-3" />
                        <span>亚马逊原文</span>
                      </a>
                    )}
                    {/* 查看完整评论按钮 - 在弹窗内展开 */}
                    {asin && item.review_id && (
                      <ReviewExpander
                        asin={asin}
                        reviewId={item.review_id}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 底部操作栏 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {asin && totalCount > evidence.length && (
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={handleLoadAllReviews}
              disabled={isLoadingAll}
            >
              {isLoadingAll ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  加载中...
                </>
              ) : showAllReviews ? (
                <>
                  <ChevronUp className="size-4" />
                  收起 ({allReviews.length} 条)
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" />
                  全部展开 ({totalCount} 条)
                </>
              )}
            </Button>
          )}
          {loadError && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 text-center">
              {loadError}
            </div>
          )}
          {(!asin || totalCount <= evidence.length) && (
            <Button variant="outline" className="w-full" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
      
      {/* 动画样式 */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
});

// 评论展开组件 - 在弹窗内加载完整评论
const ReviewExpander = memo(function ReviewExpander({ 
  asin, 
  reviewId 
}: { 
  asin: string; 
  reviewId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullReview, setFullReview] = useState<ApiReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExpand = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    if (fullReview) {
      setIsExpanded(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 获取评论列表，查找对应的评论
      const response = await getReviews({
        asin,
        page: 1,
        pageSize: 1000, // 获取足够多的评论以找到目标评论
      });

      const reviews = response.reviews || [];
      const foundReview = reviews.find((r: ApiReview) => r.id === reviewId || r.review_id === reviewId);
      
      if (foundReview) {
        setFullReview(foundReview);
        setIsExpanded(true);
      } else {
        setError('未找到完整评论内容');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={handleExpand}
        disabled={isLoading}
        className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1 disabled:opacity-50"
      >
        <MessageSquare className="size-3" />
        {isLoading ? '加载中...' : isExpanded ? '收起完整评论' : '查看完整评论'}
        {isExpanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
      </button>

      {error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isExpanded && fullReview && (
        <div className="mt-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            {/* 完整评论内容 - 优先显示翻译 */}
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">评论内容（中文）</div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {fullReview.body_translated || fullReview.body_original || '无内容'}
              </p>
            </div>

            {/* 原文（如果与翻译不同） */}
            {fullReview.body_translated && fullReview.body_original && fullReview.body_translated !== fullReview.body_original && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                  <Languages className="size-3" />
                  原文
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic">
                  {fullReview.body_original}
                </p>
              </div>
            )}

                            {/* 其他信息 */}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                              {fullReview.verified_purchase && (
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
                                  已验证购买
                                </span>
                              )}
                              {fullReview.helpful_votes > 0 && (
                                <span>有用 ({fullReview.helpful_votes})</span>
                              )}
                              {/* 查看亚马逊原文链接 */}
                              {fullReview.review_url && (
                                <a
                                  href={fullReview.review_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                                  title="在亚马逊查看原文"
                                >
                                  <ExternalLink className="size-3" />
                                  <span>亚马逊原文</span>
                                </a>
                              )}
                            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default EvidenceDrawer;

