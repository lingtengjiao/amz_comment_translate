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
  // 转换 insights 数据
  const insights = apiReview.insights?.map(insight => ({
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
    // 主题高亮内容
    themeHighlights: apiReview.theme_highlights?.map(th => {
      // 使用新的 items 格式，如果不存在则从 keywords 向后兼容转换
      let items: Array<{ content: string; content_original?: string; content_translated?: string; explanation?: string }> = [];
      
      if (th.items && Array.isArray(th.items) && th.items.length > 0) {
        items = th.items.map(item => ({
          content: item.content,
          content_original: item.content_original || undefined,
          content_translated: item.content_translated || undefined,
          explanation: item.explanation || undefined,
        }));
      } else if (th.keywords && Array.isArray(th.keywords) && th.keywords.length > 0) {
        // 向后兼容：将旧的 keywords 格式转换为新的 items 格式
        items = th.keywords.map((kw: string) => ({
          content: kw,
          content_original: undefined,
          content_translated: undefined,
          explanation: undefined,
        }));
      }
      
      return {
        themeType: th.theme_type as Review['themeHighlights'][0]['themeType'],
        items,
        keywords: th.keywords || undefined, // 保留向后兼容
      };
    }) || undefined,
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
