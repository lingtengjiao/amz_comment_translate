/**
 * 数据转换层 - 将后端 API 数据转换为前端组件格式
 */

import type { 
  ApiProduct, 
  ApiReview, 
  ApiProductStatsResponse,
  Task, 
  Review, 
  TaskStatus 
} from './types';

/**
 * 将后端翻译状态转换为前端任务状态
 */
export function mapTranslationStatus(status: string): TaskStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'processing':
      return 'translating';
    case 'failed':
      return 'failed';
    case 'pending':
    default:
      return 'translating'; // pending 也显示为翻译中
  }
}

/**
 * 将后端评论数据转换为前端格式
 */
export function transformReview(apiReview: ApiReview): Review {
  // 转换 insights 数据，过滤掉 _empty 标记（表示已处理但无洞察）
  const insights = apiReview.insights
    ?.filter(insight => insight.type !== '_empty')
    .map(insight => ({
      type: insight.type as 'strength' | 'weakness' | 'suggestion' | 'scenario' | 'emotion',
      quote: insight.quote,
      quoteTranslated: insight.quote_translated || undefined,
      analysis: insight.analysis,
      dimension: insight.dimension || undefined,
    }));
  
  return {
    id: apiReview.id,
    author: apiReview.author || '匿名用户',
    rating: apiReview.rating,
    date: apiReview.review_date || '',
    originalText: apiReview.body_original,
    // 没有翻译时不显示英文，保持为 undefined
    translatedText: apiReview.body_translated || undefined,
    originalTitle: apiReview.title_original || undefined,
    // 没有翻译时不显示英文，保持为 undefined
    translatedTitle: apiReview.title_translated || undefined,
    helpfulCount: apiReview.helpful_votes,
    sentiment: apiReview.sentiment,
    verified: apiReview.verified_purchase,
    images: apiReview.image_urls || undefined,
    videos: apiReview.video_url ? [apiReview.video_url] : undefined,
    // AI 深度解读
    insights: insights && insights.length > 0 ? insights : undefined,
    // [UPDATED] 主题高亮内容 - 支持 5W 模型 + 带证据的可解释结构
    // 后端现在是一条记录=一个标签，需要按 theme_type 聚合
    themeHighlights: (() => {
      const highlights = apiReview.theme_highlights?.filter(th => th.theme_type !== '_empty');
      if (!highlights || highlights.length === 0) return undefined;
      
      // 按 theme_type 聚合
      const groupedByType = new Map<string, Array<{ content: string; content_original?: string; quote_translated?: string; content_translated?: string; explanation?: string }>>();
      
      highlights.forEach(th => {
        const themeType = th.theme_type;
        if (!groupedByType.has(themeType)) {
          groupedByType.set(themeType, []);
        }
        
        // 新结构：一条记录=一个标签，直接使用顶层字段
        if (th.label_name) {
          groupedByType.get(themeType)!.push({
            content: th.label_name,
            content_original: th.quote || undefined,
            quote_translated: th.quote_translated || undefined,
            explanation: th.explanation || undefined,
          });
        }
        // 向后兼容：旧的 items 格式
        else if (th.items && Array.isArray(th.items) && th.items.length > 0) {
          th.items.forEach(item => {
            groupedByType.get(themeType)!.push({
              content: item.content,
              content_original: item.content_original || undefined,
              quote_translated: item.quote_translated || undefined,
              content_translated: item.content_translated || undefined,
              explanation: item.explanation || undefined,
            });
          });
        }
      });
      
      // 转换为前端格式
      const result: Review['themeHighlights'] = [];
      groupedByType.forEach((items, themeType) => {
        if (items.length > 0) {
          result.push({
            themeType: themeType as Review['themeHighlights'][0]['themeType'],
            items,
          });
        }
      });
      
      return result.length > 0 ? result : undefined;
    })(),
    isPinned: apiReview.is_pinned || false,
    isHidden: apiReview.is_hidden || false,
    tags: undefined,
  };
}

/**
 * 将后端产品数据转换为前端任务格式
 */
export function transformProductToTask(apiProduct: ApiProduct, reviews: Review[] = []): Task {
  return {
    id: apiProduct.id,
    asin: apiProduct.asin,
    title: apiProduct.title_translated || apiProduct.title || apiProduct.asin,
    titleOriginal: apiProduct.title || undefined,
    titleTranslated: apiProduct.title_translated || undefined,
    imageUrl: apiProduct.image_url || 'https://via.placeholder.com/400x400?text=No+Image',
    price: apiProduct.price || undefined,
    bulletPoints: apiProduct.bullet_points || undefined,
    bulletPointsTranslated: apiProduct.bullet_points_translated || undefined,
    status: mapTranslationStatus(apiProduct.translation_status),
    reviewCount: apiProduct.total_reviews,
    translatedCount: apiProduct.translated_reviews,
    createdAt: new Date(apiProduct.created_at).toISOString().split('T')[0],
    reviews,
  };
}

/**
 * 从产品统计信息创建完整任务对象
 */
export function transformStatsToTask(
  stats: ApiProductStatsResponse, 
  reviews: Review[] = []
): Task {
  const product = stats.product;
  return {
    id: product.id,
    asin: product.asin,
    title: product.title_translated || product.title || product.asin,
    titleOriginal: product.title || undefined,
    titleTranslated: product.title_translated || undefined,
    imageUrl: product.image_url || 'https://via.placeholder.com/400x400?text=No+Image',
    price: product.price || undefined,
    bulletPoints: product.bullet_points || undefined,
    bulletPointsTranslated: product.bullet_points_translated || undefined,
    status: mapTranslationStatus(product.translation_status),
    reviewCount: product.total_reviews,
    translatedCount: product.translated_reviews,
    createdAt: new Date(product.created_at).toISOString().split('T')[0],
    reviews,
  };
}

/**
 * 批量转换评论
 */
export function transformReviews(apiReviews: ApiReview[]): Review[] {
  return apiReviews.map(transformReview);
}

/**
 * 批量转换产品到任务列表
 */
export function transformProductsToTasks(apiProducts: ApiProduct[]): Task[] {
  return apiProducts.map(p => transformProductToTask(p, []));
}

/**
 * 将后端评分分布转换为前端格式
 */
export function transformRatingDistribution(apiDist: {
  star_1: number;
  star_2: number;
  star_3: number;
  star_4: number;
  star_5: number;
}): { 5: number; 4: number; 3: number; 2: number; 1: number } {
  return {
    5: apiDist.star_5,
    4: apiDist.star_4,
    3: apiDist.star_3,
    2: apiDist.star_2,
    1: apiDist.star_1,
  };
}
