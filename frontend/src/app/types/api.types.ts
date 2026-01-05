/**
 * API 接口类型定义
 * 用于前后端数据交互
 */

// ============= 基础类型 =============

export type TaskStatus = 'translating' | 'completed' | 'failed';
export type Sentiment = 'positive' | 'negative' | 'neutral';
export type FilterRating = 'all' | '5' | '4' | '3' | '2' | '1';
export type FilterSentiment = 'all' | 'positive' | 'negative' | 'neutral';
export type SortOption = 'date-desc' | 'date-asc' | 'rating-desc' | 'rating-asc' | 'helpful-desc';

// ============= 数据模型 =============

/**
 * 评论深度解读
 */
export interface ReviewInsight {
  type: 'strength' | 'weakness' | 'suggestion' | 'scenario' | 'emotion';
  quote: string;           // 原文引用的片段
  analysis: string;        // 深度解读
  dimension?: string;      // 产品维度：如"音质"、"价格"、"易用性"等
}

/**
 * 评论对象
 */
export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  originalText: string;
  translatedText: string;
  originalTitle?: string;
  translatedTitle?: string;
  helpfulCount?: number;
  sentiment: Sentiment;
  verified: boolean;
  images?: string[];
  videos?: string[];
  insights?: ReviewInsight[];
  isPinned?: boolean;
  isHidden?: boolean;
  tags?: string[];
}

/**
 * 任务/产品对象
 */
export interface Task {
  id: string;
  asin: string;
  title: string;
  imageUrl: string;
  price?: string;
  bulletPoints?: string[];
  bulletPointsTranslated?: string[];
  status: TaskStatus;
  reviewCount: number;
  translatedCount: number;
  createdAt: string;
  reviews: Review[];
}

/**
 * 主题标签
 */
export interface ThemeTag {
  id: string;
  label: string;
  keywords: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  underlineColor: string;
  darkBgColor?: string;
  darkTextColor?: string;
  isCustom?: boolean;
  isProcessing?: boolean;
}

/**
 * 媒体项
 */
export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  reviewId: string;
  author: string;
  rating: number;
  date: string;
  reviewText: string;
}

// ============= API 请求参数 =============

/**
 * 筛选评论参数
 */
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

/**
 * 导出参数
 */
export interface ExportParams {
  taskId: string;
  rating?: FilterRating;
  sentiment?: FilterSentiment;
  search?: string;
  includeHidden?: boolean;
}

/**
 * 开始翻译参数
 */
export interface StartTranslationParams {
  taskId: string;
  reviewIds?: string[];
}

/**
 * 添加自定义标签参数
 */
export interface AddCustomTagParams {
  taskId: string;
  label: string;
  keywords: string[];
}

/**
 * 更新评论参数
 */
export interface UpdateReviewParams {
  reviewId: string;
  originalTitle?: string;
  translatedTitle?: string;
  originalText?: string;
  translatedText?: string;
  sentiment?: Sentiment;
}

/**
 * 获取媒体参数
 */
export interface GetMediaParams {
  taskId: string;
  type?: 'image' | 'video';
  page?: number;
  pageSize?: number;
}

// ============= API 响应数据 =============

/**
 * 通用响应格式
 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  error?: string;
}

/**
 * 统计数据
 */
export interface StatsData {
  averageRating: string;
  totalReviews: number;
  translatedReviews: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  mediaStats: {
    totalImages: number;
    totalVideos: number;
    reviewsWithMedia: number;
  };
}

/**
 * 分页评论响应
 */
export interface PaginatedReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * 翻译进度响应
 */
export interface TranslationProgressResponse {
  taskId: string;
  status: TaskStatus;
  progress: number;
  translatedCount: number;
  totalCount: number;
  currentReviewId?: string;
}

/**
 * 主题标签响应
 */
export interface ThemeTagsResponse {
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

/**
 * 分页媒体响应
 */
export interface PaginatedMediaResponse {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * 操作结果响应
 */
export interface OperationResult {
  success: boolean;
  message?: string;
}

// ============= WebSocket 消息 =============

/**
 * WebSocket 消息类型
 */
export type WebSocketMessageType = 
  | 'translation_progress'
  | 'review_updated'
  | 'task_completed'
  | 'error';

/**
 * WebSocket 消息
 */
export interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  data: T;
  timestamp?: number;
}

/**
 * 翻译进度 WebSocket 消息
 */
export interface TranslationProgressMessage {
  progress: number;
  translatedCount: number;
  totalCount: number;
  currentReviewId?: string;
}
