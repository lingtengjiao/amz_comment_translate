/**
 * VocComparisonRenderer - VOC 产品对比分析渲染器
 * 
 * 设计原则：
 * 1. 维度优先布局：同一维度横向对比多产品
 * 2. 占比统计：标签显示产品内部占比
 * 3. 维度洞察：每个维度后展示共性/差异/定位
 * 4. 吸顶产品头部：滚动时始终可见产品信息
 * 5. 策略总结：底部展示市场定位、场景深耕、增长机会
 */
import { memo, useState, useCallback, useEffect } from 'react';
import { 
  Users, Clock, MapPin, ShoppingCart, Target, 
  ThumbsUp, AlertTriangle, Sparkles,
  Lightbulb, Play, Heart
} from 'lucide-react';
import { ProductCompareHeader } from './ProductCompareHeader';
import { CompareDimensionRow } from './CompareDimensionRow';
import { CompareDimensionInsight } from './CompareDimensionInsight';
import { CompareReviewSidebar } from './CompareReviewSidebar';
import type { 
  StructuredResultContent, 
  LabelDescItem,
  DimensionInsights,
  AnalysisItem
} from '@/api/types';

// 11个维度配置（6W用户画像 + 5类口碑洞察）
const DIMENSION_CONFIG = [
  // 6W 用户画像 (who 拆分为 buyer + user)
  {
    key: 'buyer',
    name: '购买者',
    icon: Users,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    color: '#3B82F6',
    category: 'five_w',
  },
  {
    key: 'user',
    name: '使用者',
    icon: Users,
    iconColor: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800',
    color: '#06B6D4',
    category: 'five_w',
  },
  {
    key: 'when',
    name: '何时使用',
    icon: Clock,
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    color: '#8B5CF6',
    category: 'five_w',
  },
  {
    key: 'where',
    name: '在哪里用',
    icon: MapPin,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    color: '#10B981',
    category: 'five_w',
  },
  {
    key: 'why',
    name: '购买动机',
    icon: ShoppingCart,
    iconColor: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    color: '#F59E0B',
    category: 'five_w',
  },
  {
    key: 'what',
    name: '具体用途',
    icon: Target,
    iconColor: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    color: '#EC4899',
    category: 'five_w',
  },
  // 5类口碑洞察
  {
    key: 'pros',
    name: '用户好评点',
    icon: ThumbsUp,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    color: '#10B981',
    category: 'dimensions',
  },
  {
    key: 'cons',
    name: '用户痛点',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    color: '#EF4444',
    category: 'dimensions',
  },
  {
    key: 'suggestion',
    name: '用户建议',
    icon: Lightbulb,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    color: '#F59E0B',
    category: 'dimensions',
  },
  {
    key: 'scenario',
    name: '使用场景',
    icon: Play,
    iconColor: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800',
    color: '#06B6D4',
    category: 'dimensions',
  },
  {
    key: 'emotion',
    name: '情绪反馈',
    icon: Heart,
    iconColor: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
    color: '#F43F5E',
    category: 'dimensions',
  },
];

interface VocComparisonRendererProps {
  data: StructuredResultContent;
  items?: AnalysisItem[];
  /** 只读模式（分享页使用） */
  readOnly?: boolean;
}

export const VocComparisonRenderer = memo(({ data, items, readOnly = false }: VocComparisonRendererProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{
    productId: number;
    productAsin: string;
    dimension: string;
    dimensionKey: string;
    tagLabel: string;
  } | null>(null);
  const [totalReviews, setTotalReviews] = useState<number>(0);

  // 获取产品真实评论数（从 reviews API）
  useEffect(() => {
    const fetchTotalReviews = async () => {
      if (!data?.product_profiles) return;
      
      try {
        // 通过 reviews API 获取每个产品的评论数
        const responses = await Promise.all(
          data.product_profiles.map(profile => 
            fetch(`/api/v1/reviews/${profile.asin}?page=1&page_size=1`)
              .then(res => res.ok ? res.json() : null)
              .catch(() => null)
          )
        );
        
        const total = responses.reduce((sum, res) => {
          return sum + (res?.total || 0);
        }, 0);
        
        setTotalReviews(total);
      } catch (error) {
        console.error('获取评论总数失败:', error);
      }
    };
    
    fetchTotalReviews();
  }, [data?.product_profiles]);

  // 处理评论点击
  const handleReviewClick = useCallback((productId: number, dimension: string, dimensionKey: string, tag: LabelDescItem) => {
    const profile = data.product_profiles[productId - 1];
    if (profile) {
      setSelectedReview({
        productId,
        productAsin: profile.asin,
        dimension,
        dimensionKey,
        tagLabel: tag.label,
      });
      setSidebarOpen(true);
    }
  }, [data.product_profiles]);

  // 关闭侧边栏
  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
    setTimeout(() => setSelectedReview(null), 300);
  }, []);

  if (!data || !data.product_profiles) {
    return (
      <div className="text-center py-12 text-gray-500">
        暂无分析数据
      </div>
    );
  }

  // 转换产品数据（优先从 items 获取 image_url，因为 product_profiles 可能没有）
  const products = data.product_profiles.map((profile, idx) => {
    // 从 items 中找到对应的产品信息
    const item = items?.find(i => i.product?.asin === profile.asin);
    return {
      id: idx + 1,
      asin: profile.asin,
      name: profile.product_name,
      imageUrl: profile.image_url || item?.product?.image_url,
    };
  });

  return (
    <>
      {/* 吸顶产品头部 - 背景铺满整个页面宽度，内容对齐 */}
      {/* 正常模式: top-16 = 64px，对应父组件 Header 的高度 h-16 */}
      {/* 只读模式: top-12 = 48px，对应分享页顶部蓝色条的高度 h-12 */}
      {/* z-[35] 确保在 Header (z-40) 下方但高于其他内容 */}
      <div className={`w-full sticky ${readOnly ? 'top-12' : 'top-16'} z-[35] bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-lg`}>
        <div className="max-w-[1800px] mx-auto px-6 py-5">
          <ProductCompareHeader products={products} totalReviews={totalReviews} />
        </div>
      </div>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* 维度对比 + 洞察 */}
        <div className="space-y-6">
          {DIMENSION_CONFIG.map((dim) => {
            // 获取每个产品在该维度的标签
            const productData = data.product_profiles.map((profile, idx) => {
              let tags: LabelDescItem[] = [];
              
              if (dim.category === 'five_w') {
                tags = profile.five_w[dim.key as keyof typeof profile.five_w] || [];
              } else if (dim.category === 'dimensions') {
                tags = profile.dimensions?.[dim.key as keyof typeof profile.dimensions] || [];
              }
              
              return {
                id: idx + 1,
                tags,
              };
            });

            // 获取维度洞察
            const insight = data.dimension_insights?.[dim.key as keyof DimensionInsights];

            return (
              <div key={dim.key} className="space-y-3">
                <CompareDimensionRow
                  dimension={dim.name}
                  dimensionKey={dim.key}
                  icon={dim.icon}
                  iconColor={dim.iconColor}
                  bgColor={dim.bgColor}
                  products={productData}
                  onReviewClick={(productId, tag) => handleReviewClick(productId, dim.name, dim.key, tag)}
                />
                {insight && (
                  <CompareDimensionInsight
                    dimension={dim.name}
                    insight={insight}
                    color={dim.color}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 策略总结 */}
        {data.strategy_summary && (
          <div className="mt-10 bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">竞品策略总结</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">基于10维分析的核心竞争洞察</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 市场定位策略 */}
              {data.strategy_summary.market_positioning && (
                <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <span className="text-base">{data.strategy_summary.market_positioning.emoji}</span>
                    </div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                      {data.strategy_summary.market_positioning.title}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {data.strategy_summary.market_positioning.content}
                  </div>
                </div>
              )}

              {/* 场景化深耕 */}
              {data.strategy_summary.scenario_deep_dive && (
                <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-xl border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <span className="text-base">{data.strategy_summary.scenario_deep_dive.emoji}</span>
                    </div>
                    <div className="font-semibold text-purple-900 dark:text-purple-100 text-sm">
                      {data.strategy_summary.scenario_deep_dive.title}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {data.strategy_summary.scenario_deep_dive.content}
                  </div>
                </div>
              )}

              {/* 增长机会点 */}
              {data.strategy_summary.growth_opportunities && (
                <div className="p-5 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <span className="text-base">{data.strategy_summary.growth_opportunities.emoji}</span>
                    </div>
                    <div className="font-semibold text-green-900 dark:text-green-100 text-sm">
                      {data.strategy_summary.growth_opportunities.title}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {data.strategy_summary.growth_opportunities.content}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 市场总结（兜底） */}
        {!data.strategy_summary && data.market_summary && (
          <div className="mt-10 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 p-6 rounded-xl border border-rose-100 dark:border-rose-800">
            <div className="flex items-start gap-4">
              <Sparkles className="size-8 text-rose-600 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-xl font-bold text-rose-900 dark:text-rose-100 mb-2">市场总结</h2>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                  {data.market_summary}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 评论侧边栏 */}
      {selectedReview && (
        <CompareReviewSidebar
          isOpen={sidebarOpen}
          onClose={handleCloseSidebar}
          productId={selectedReview.productId}
          productAsin={selectedReview.productAsin}
          dimension={selectedReview.dimension}
          dimensionKey={selectedReview.dimensionKey}
          tagLabel={selectedReview.tagLabel}
        />
      )}
      </div>
    </>
  );
});

VocComparisonRenderer.displayName = 'VocComparisonRenderer';

export default VocComparisonRenderer;

