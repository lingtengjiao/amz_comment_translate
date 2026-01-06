/**
 * API 类型定义 - 完整版
 * 基于 API_INTERFACES.md 规范
 */

// ============== 基础类型 ==============

/** 任务状态 */
export type TaskStatus = 'translating' | 'completed' | 'failed';

/** 情感类型 */
export type Sentiment = 'positive' | 'negative' | 'neutral';

/** 筛选评分 */
export type FilterRating = 'all' | '5' | '4' | '3' | '2' | '1';

/** 筛选情感 */
export type FilterSentiment = 'all' | 'positive' | 'negative' | 'neutral';

/** 排序选项 */
export type SortOption = 'date-desc' | 'date-asc' | 'rating-desc' | 'rating-asc' | 'helpful-desc';

// ============== 评论相关 ==============

/** 评论深度解读 */
export interface ReviewInsight {
  type: 'strength' | 'weakness' | 'suggestion' | 'scenario' | 'emotion';
  quote: string;           // 原文引用的片段（英文）
  quoteTranslated?: string; // 原文引用的片段（中文翻译）
  analysis: string;        // 深度解读
  dimension?: string;      // 产品维度：如"音质"、"价格"、"易用性"等
}

/** 主题内容项 */
export interface ThemeItem {
  content: string;                     // 中文内容（关键词/短语/句子）
  content_original?: string;           // 原始英文内容（可选）
  content_translated?: string;          // 翻译（可选）
  explanation?: string;                // 解释说明（可选）
}

/** 评论主题高亮 */
export interface ReviewThemeHighlight {
  themeType: ThemeTypeId;              // 主题类型
  items: ThemeItem[];                  // 该主题识别到的内容项列表
  keywords?: string[];                 // 已废弃：向后兼容字段
}

/** 评论对象 */
export interface Review {
  id: string;                          // 评论唯一ID
  author: string;                      // 作者名称
  rating: number;                      // 评分 1-5
  date: string;                        // 日期 YYYY-MM-DD
  originalText: string;                // 原文内容
  translatedText: string;              // 译文内容
  originalTitle?: string;              // 原文标题（可选）
  translatedTitle?: string;            // 译文标题（可选）
  helpfulCount?: number;               // 有用数量
  sentiment: Sentiment;                // 情感分析结果
  verified: boolean;                   // 是否已验证购买
  images?: string[];                   // 评论图片URL列表
  videos?: string[];                   // 评论视频URL列表
  insights?: ReviewInsight[];          // AI深度解读
  themeHighlights?: ReviewThemeHighlight[];  // 主题高亮关键词
  isPinned?: boolean;                  // 是否置顶
  isHidden?: boolean;                  // 是否隐藏
  tags?: string[];                     // 用户自定义标签
}

// ============== 任务/产品相关 ==============

/** 任务/产品对象 */
export interface Task {
  id: string;                          // 任务唯一ID
  asin: string;                        // 亚马逊商品ASIN
  title: string;                       // 产品标题（中文优先，显示用）
  titleOriginal?: string;              // 产品标题（英文原文）
  titleTranslated?: string;            // 产品标题（中文翻译）
  imageUrl: string;                    // 产品主图URL
  price?: string;                      // 价格（可选）
  bulletPoints?: string[];             // 五点描述（原文）
  bulletPointsTranslated?: string[];   // 五点描述（译文）
  status: TaskStatus;                  // 翻译任务状态
  reviewCount: number;                 // 评论总数
  translatedCount: number;             // 已翻译数量
  createdAt: string;                   // 任务创建时间 YYYY-MM-DD
  reviews: Review[];                   // 评论列表
}

// ============== 统计数据 ==============

/** 评分分布 */
export interface RatingDistribution {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

/** 情感分布 */
export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
}

/** 媒体统计 */
export interface MediaStats {
  totalImages: number;        // 总图片数
  totalVideos: number;        // 总视频数
  reviewsWithMedia: number;   // 包含媒体的评论数
}

/** 统计数据 */
export interface StatsData {
  averageRating: string;                    // 平均评分（保留1位小数）
  totalReviews: number;                     // 总评论数
  translatedReviews: number;                // 已翻译评论数
  ratingDistribution: RatingDistribution;   // 评分分布
  sentimentDistribution: SentimentDistribution; // 情感分布
  mediaStats: MediaStats;                   // 媒体统计
}

// ============== 主题标签 ==============

/** 主题标签 */
export interface ThemeTag {
  id: string;                    // 标签ID
  label: string;                 // 标签显示名称
  keywords: string[];            // 关键词列表
  color: string;                 // 文字颜色类名
  bgColor: string;               // 背景颜色类名
  borderColor: string;           // 边框颜色类名
  underlineColor: string;        // 下划线颜色（用于英文）
  isCustom?: boolean;            // 是否为用户自定义
  isProcessing?: boolean;        // 是否正在AI分析中
}

// ============== 媒体内容 ==============

/** 媒体项 */
export interface MediaItem {
  type: 'image' | 'video';
  url: string;                  // 媒体URL
  reviewId: string;             // 所属评论ID
  author: string;               // 评论作者
  rating: number;               // 评论评分
  date: string;                 // 评论日期
  reviewText: string;           // 评论文本（可用于悬停显示）
}

// ============== API 响应通用结构 ==============

/** 通用响应包装 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  error?: string;
}

// ============== 请求参数类型 ==============

/** 筛选评论参数 */
export interface FilterReviewsParams {
  taskId: string;
  rating?: FilterRating;
  sentiment?: FilterSentiment;
  search?: string;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
  includeHidden?: boolean;
}

/** 分页评论响应 */
export interface ReviewsPageData {
  reviews: Review[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 开始翻译参数 */
export interface StartTranslationParams {
  taskId: string;
  reviewIds?: string[];    // 可选：指定要翻译的评论ID列表
}

/** 开始翻译响应数据 */
export interface StartTranslationData {
  taskId: string;
  totalReviews: number;
  estimatedTime: number;    // 预计耗时（秒）
}

/** 翻译进度数据 */
export interface TranslationProgressData {
  taskId: string;
  status: TaskStatus;
  progress: number;                 // 进度百分比 0-100
  translatedCount: number;
  totalCount: number;
  currentReviewId?: string;         // 当前正在翻译的评论ID
}

/** 导出参数 */
export interface ExportParams {
  taskId: string;
  rating?: FilterRating;
  sentiment?: FilterSentiment;
  search?: string;
  includeHidden?: boolean;
}

/** 获取媒体参数 */
export interface GetMediaParams {
  taskId: string;
  type?: 'image' | 'video';
  page?: number;
  pageSize?: number;
}

/** 分页媒体响应 */
export interface MediaPageData {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 添加自定义标签参数 */
export interface AddCustomTagParams {
  taskId: string;
  label: string;
  keywords: string[];
}

/** 添加自定义标签响应 */
export interface AddCustomTagData {
  tag: ThemeTag;
  isProcessing: boolean;
}

/** 主题标签数据 */
export interface ThemeTagsData {
  presetTags: ThemeTag[];
  reviewMatches?: {
    [reviewId: string]: {
      [tagId: string]: {
        text: string;
        positions: number[];
      }[];
    };
  };
}

// ============== WebSocket 消息类型 ==============

/** WebSocket 消息 */
export interface WebSocketMessage {
  type: 'translation_progress' | 'error' | 'connected';
  data: TranslationProgressData | { message: string };
}

// ============== 后端 API 响应类型（兼容现有后端） ==============

/** 后端评论响应 */
/** 后端 Insight 响应 */
export interface ApiInsight {
  type: string;
  quote: string;
  quote_translated: string | null;
  analysis: string;
  dimension: string | null;
}

/** 后端主题内容项响应 */
export interface ApiThemeItem {
  content: string;                     // 中文内容
  content_original?: string | null;    // 原始英文内容（可选）
  content_translated?: string | null;  // 翻译（可选）
  explanation?: string | null;        // 解释说明（可选）
}

/** 后端主题高亮响应 */
export interface ApiThemeHighlight {
  theme_type: string;                 // who/where/when/unmet_needs/pain_points/benefits/features/comparison
  items: ApiThemeItem[];               // 该主题识别到的内容项列表
  keywords?: string[] | null;          // 已废弃：向后兼容字段
}

/** 主题类型枚举 */
export type ThemeTypeId = 'who' | 'where' | 'when' | 'unmet_needs' | 'pain_points' | 'benefits' | 'features' | 'comparison';

export interface ApiReview {
  id: string;
  review_id: string;
  author: string | null;
  rating: number;
  title_original: string | null;
  title_translated: string | null;
  body_original: string;
  body_translated: string | null;
  review_date: string | null;
  verified_purchase: boolean;
  helpful_votes: number;
  has_video: boolean;
  has_images: boolean;
  image_urls: string[] | null;
  video_url: string | null;
  sentiment: Sentiment;
  translation_status: string;
  is_pinned: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  insights: ApiInsight[] | null;  // AI 深度解读
  theme_highlights: ApiThemeHighlight[] | null;  // 主题高亮关键词
  created_at: string;
}

/** 后端评论列表响应 */
export interface ApiReviewListResponse {
  total: number;
  page: number;
  page_size: number;
  reviews: ApiReview[];
}

/** 后端产品响应 */
export interface ApiProduct {
  id: string;
  asin: string;
  title: string | null;
  title_translated: string | null;
  image_url: string | null;
  marketplace: string;
  price: string | null;
  bullet_points: string[] | null;
  bullet_points_translated: string[] | null;
  total_reviews: number;
  translated_reviews: number;
  reviews_with_insights: number;
  reviews_with_themes: number;
  average_rating: number;
  translation_status: string;
  created_at: string;
  updated_at: string;
}

/** 后端产品列表响应 */
export interface ApiProductListResponse {
  total: number;
  products: ApiProduct[];
}

/** 后端评分分布 */
export interface ApiRatingDistribution {
  star_1: number;
  star_2: number;
  star_3: number;
  star_4: number;
  star_5: number;
}

/** 后端情感分布 */
export interface ApiSentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
}

/** 后端产品统计响应 */
export interface ApiProductStatsResponse {
  product: ApiProduct;
  rating_distribution: ApiRatingDistribution;
  sentiment_distribution: ApiSentimentDistribution;
}

/** 后端 Ingest 响应 */
export interface ApiIngestResponse {
  success: boolean;
  message: string;
  product_id: string;
  task_id: string | null;
  reviews_received: number;
  dashboard_url: string;
}

/** 后端任务响应 */
export interface ApiTask {
  id: string;
  product_id: string;
  task_type: string;
  status: string;
  total_items: number;
  processed_items: number;
  progress_percentage: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ============== 产品维度相关类型 ==============

/** 产品维度 */
export interface ProductDimension {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  is_ai_generated: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** 维度列表响应 */
export interface ApiDimensionListResponse {
  total: number;
  dimensions: ProductDimension[];
}

/** 维度生成响应 */
export interface ApiDimensionGenerateResponse {
  success: boolean;
  message: string;
  product_id: string;
  dimensions: ProductDimension[];
}
