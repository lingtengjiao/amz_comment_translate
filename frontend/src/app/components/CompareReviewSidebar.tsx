/**
 * CompareReviewSidebar - 评论侧边栏
 * 
 * 功能：点击标签评论数时，右侧滑出显示原始评论（包含原文和译文）
 */
import { memo, useEffect, useState } from 'react';
import { X, Star, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string | null;
  title_original?: string;
  title_translated?: string;
  body_original: string;
  body_translated?: string;
  verified_purchase: boolean;
  confidence?: 'high' | 'medium' | 'low';  // 置信度
  explanation?: string;  // 归类理由
}

/** 置信度配置 */
const CONFIDENCE_CONFIG = {
  high: {
    label: '高置信',
    description: '评论中有明确证据',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  medium: {
    label: '中置信',
    description: '基于上下文合理推断',
    icon: HelpCircle,
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  low: {
    label: '低置信',
    description: '证据较弱，仅供参考',
    icon: AlertCircle,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    iconClass: 'text-gray-500 dark:text-gray-400',
  },
} as const;

interface CompareReviewSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: number;  // 可选，仅在对比分析时使用
  productAsin: string;
  dimension: string;
  dimensionKey: string;  // who/when/where/why/what/strength/weakness/suggestion/scenario/emotion
  tagLabel: string;
  totalCount?: number;  // 可选，用于显示总数
}

export const CompareReviewSidebar = memo(({ 
  isOpen, 
  onClose, 
  productId, 
  productAsin, 
  dimension, 
  dimensionKey,
  tagLabel,
  totalCount
}: CompareReviewSidebarProps) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  // 获取评论数据
  useEffect(() => {
    if (!isOpen || !productAsin || !dimensionKey || !tagLabel) {
      return;
    }

    const fetchReviews = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          dimension: dimensionKey,
          label: tagLabel,
          limit: '50',
        });
        
        const response = await fetch(`/api/v1/analysis/products/${productAsin}/reviews-by-label?${params}`);
        
        if (response.ok) {
          const data = await response.json();
          setReviews(data.reviews || []);
        } else {
          console.error('获取评论失败:', response.statusText);
          setReviews([]);
        }
      } catch (error) {
        console.error('获取评论失败:', error);
        setReviews([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [isOpen, productAsin, dimensionKey, tagLabel]);

  // 锁定 body 滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // 切换展开/收起
  const toggleExpand = (id: string) => {
    setExpandedReviews(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/10 dark:bg-black/30 z-40 cursor-pointer"
        onClick={onClose}
      />
      
      {/* 侧边栏 */}
      <div className="fixed right-0 top-0 bottom-0 w-[600px] max-w-full bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-300 dark:border-gray-700">
        {/* 头部 */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {productId !== undefined && (
                  <div className="w-7 h-7 rounded-md bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
                    <span className="text-white dark:text-gray-900 font-bold text-xs">#{productId}</span>
                  </div>
                )}
                <span className="text-xs font-mono font-semibold text-gray-600 dark:text-gray-400">
                  {productAsin}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                {tagLabel}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {dimension} · {loading ? '加载中...' : `${totalCount !== undefined ? `共 ${totalCount} 条，展示 ` : ''}${reviews.length} 条原始评论`}
              </p>
            </div>
            
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            >
              <X className="size-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* 评论列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                加载中...
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                暂无相关评论
              </div>
            ) : (
              reviews.map((review) => {
                const isExpanded = expandedReviews.has(review.id);
                const hasOriginal = review.body_original && review.body_original !== review.body_translated;
                
                return (
                  <div 
                    key={review.id}
                    className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    {/* 作者、评分和置信度 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {review.author}
                        </span>
                        {review.verified_purchase && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            ✓ 已验证购买
                          </span>
                        )}
                        {/* 置信度标签 */}
                        {review.confidence && (
                          (() => {
                            const config = CONFIDENCE_CONFIG[review.confidence] || CONFIDENCE_CONFIG.high;
                            const Icon = config.icon;
                            return (
                              <span 
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${config.className}`}
                                title={config.description}
                              >
                                <Icon className={`size-3 ${config.iconClass}`} />
                                {config.label}
                              </span>
                            );
                          })()
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`size-3 ${
                              i < review.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* 日期 */}
                    {review.date && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        {new Date(review.date).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                    
                    {/* 标题 */}
                    {(review.title_translated || review.title_original) && (
                      <div className="mb-2">
                        {review.title_translated && (
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {review.title_translated}
                          </div>
                        )}
                        {review.title_original && review.title_original !== review.title_translated && isExpanded && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                            原文: {review.title_original}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 评论内容 - 译文 */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-2">
                      {review.body_translated || review.body_original}
                    </div>
                    
                    {/* AI 归类理由 */}
                    {review.explanation && (
                      <div className="mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                          🤖 AI 归类理由
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                          {review.explanation}
                        </div>
                      </div>
                    )}
                    
                    {/* 原文切换按钮 */}
                    {hasOriginal && (
                      <>
                        <button
                          onClick={() => toggleExpand(review.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="size-3" />
                              <span>收起原文</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3" />
                              <span>查看原文</span>
                            </>
                          )}
                        </button>
                        
                        {/* 原文内容 */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">
                              Original Text:
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap italic">
                              {review.body_original}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
});

CompareReviewSidebar.displayName = 'CompareReviewSidebar';
