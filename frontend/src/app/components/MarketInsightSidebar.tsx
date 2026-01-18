/**
 * MarketInsightSidebar - 市场洞察评论侧边栏
 * 
 * 功能：点击数据统计中的标签/维度时，右侧滑出显示所有产品的相关评论
 * - 支持 5W 标签查询（buyer/user/where/when/why/what）
 * - 支持洞察维度查询（strength/weakness/suggestion/scenario/emotion）
 * - 按产品分组展示评论
 * - 显示项目级标签/维度名称和产品级标签/维度名称
 */
import { memo, useEffect, useState } from 'react';
import { X, Star, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, HelpCircle, Package } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

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
  confidence?: 'high' | 'medium' | 'low';
  explanation?: string;
}

interface ProductReviewGroup {
  product_id: string;
  asin: string;
  title: string;
  image_url?: string;
  product_label?: string;  // 产品级标签名称（5W）
  product_dimension?: string;  // 产品级维度名称（洞察）
  review_count: number;
  reviews: Review[];
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

/** 5W 维度名称映射 */
const FIVE_W_NAMES: Record<string, string> = {
  buyer: '购买者',
  user: '使用者',
  where: '使用场景',
  when: '使用时机',
  why: '购买动机',
  what: '使用用途',
};

/** 洞察维度名称映射 */
const INSIGHT_NAMES: Record<string, string> = {
  strength: '优势',
  weakness: '痛点',
  suggestion: '建议',
  scenario: '场景洞察',
  emotion: '情绪洞察',
};

export interface MarketInsightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  queryType: 'label' | 'dimension';  // 查询类型：标签或维度
  dimensionKey: string;  // buyer/user/where/when/why/what 或 strength/weakness/suggestion/scenario/emotion
  labelOrDimensionName: string;  // 项目级标签或维度名称
  totalCount?: number;  // 总数量
}

export const MarketInsightSidebar = memo(({ 
  isOpen, 
  onClose, 
  projectId,
  queryType,
  dimensionKey,
  labelOrDimensionName,
  totalCount
}: MarketInsightSidebarProps) => {
  const [products, setProducts] = useState<ProductReviewGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [totalReviews, setTotalReviews] = useState(0);

  // 获取维度显示名称
  const dimensionDisplayName = queryType === 'label' 
    ? FIVE_W_NAMES[dimensionKey] || dimensionKey
    : INSIGHT_NAMES[dimensionKey] || dimensionKey;

  // 获取评论数据
  useEffect(() => {
    if (!isOpen || !projectId || !dimensionKey || !labelOrDimensionName) {
      return;
    }

    const fetchReviews = async () => {
      setLoading(true);
      try {
        let url: string;
        if (queryType === 'label') {
          const params = new URLSearchParams({
            dimension: dimensionKey,
            label: labelOrDimensionName,
            limit: '100',
          });
          url = `/api/v1/analysis/projects/${projectId}/reviews-by-label?${params}`;
        } else {
          const params = new URLSearchParams({
            dimension_type: dimensionKey,
            dimension: labelOrDimensionName,
            limit: '100',
          });
          url = `/api/v1/analysis/projects/${projectId}/reviews-by-dimension?${params}`;
        }
        
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          setProducts(data.products || []);
          setTotalReviews(data.total_reviews || 0);
          // 默认展开所有产品
          setExpandedProducts(new Set((data.products || []).map((p: ProductReviewGroup) => p.product_id)));
        } else {
          console.error('获取评论失败:', response.statusText);
          setProducts([]);
          setTotalReviews(0);
        }
      } catch (error) {
        console.error('获取评论失败:', error);
        setProducts([]);
        setTotalReviews(0);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [isOpen, projectId, queryType, dimensionKey, labelOrDimensionName]);

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

  // 切换评论原文展开/收起
  const toggleReviewExpand = (id: string) => {
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

  // 切换产品展开/收起
  const toggleProductExpand = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
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
      <div className="fixed right-0 top-0 bottom-0 w-[700px] max-w-full bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-300 dark:border-gray-700">
        {/* 头部 */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                  {dimensionDisplayName}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {labelOrDimensionName}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {loading ? '加载中...' : (
                  <>
                    共 {products.length} 个产品，{totalReviews} 条相关评论
                    {totalCount !== undefined && totalCount !== totalReviews && (
                      <span className="text-gray-400"> (统计数: {totalCount})</span>
                    )}
                  </>
                )}
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
        
        {/* 产品列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                加载中...
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="size-12 mx-auto mb-3 text-gray-300" />
                <p>暂无相关评论</p>
                <p className="text-xs mt-1">该标签可能没有映射到产品级数据</p>
              </div>
            ) : (
              products.map((product) => {
                const isProductExpanded = expandedProducts.has(product.product_id);
                const productLabelOrDim = product.product_label || product.product_dimension;
                
                return (
                  <div 
                    key={product.product_id}
                    className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    {/* 产品头部 */}
                    <button
                      onClick={() => toggleProductExpand(product.product_id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <ImageWithFallback
                        src={product.image_url || ''}
                        alt={product.title}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        fallbackText={product.asin}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                            {product.asin}
                          </span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            {product.review_count} 条评论
                          </span>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                          {product.title}
                        </h4>
                        {productLabelOrDim && productLabelOrDim !== labelOrDimensionName && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            产品级{queryType === 'label' ? '标签' : '维度'}: {productLabelOrDim}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {isProductExpanded ? (
                          <ChevronUp className="size-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="size-5 text-gray-400" />
                        )}
                      </div>
                    </button>
                    
                    {/* 评论列表 */}
                    {isProductExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                        {product.reviews.map((review) => {
                          const isExpanded = expandedReviews.has(review.id);
                          const hasOriginal = review.body_original && review.body_original !== review.body_translated;
                          
                          return (
                            <div 
                              key={review.id}
                              className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-600"
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
                                    AI 分析
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
                                    onClick={() => toggleReviewExpand(review.id)}
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
                        })}
                      </div>
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

MarketInsightSidebar.displayName = 'MarketInsightSidebar';

export default MarketInsightSidebar;
