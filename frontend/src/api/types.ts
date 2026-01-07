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

/** 
 * [UPDATED] 主题内容项 - 带证据的可解释结构
 */
export interface ThemeItem {
  content: string;                     // 标签名称（如：老年人、卧室）
  content_original?: string;           // 原文证据（英文）
  quote_translated?: string;           // [NEW] 原文证据翻译（中文）
  content_translated?: string;          // 翻译（可选，向后兼容）
  explanation?: string;                // 归类理由
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
  averageRating?: number;              // 产品平均评分（来自产品页面的真实评分）
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
  content: string;                     // 标签名称
  content_original?: string | null;    // 原文证据（英文）
  quote_translated?: string | null;    // [NEW] 原文证据翻译（中文）
  content_translated?: string | null;  // 翻译（可选，向后兼容）
  explanation?: string | null;         // 归类理由
}

/** 
 * [UPDATED] 后端主题高亮响应 - 5W 模型 + 带证据的可解释结构
 * 新结构：一条记录 = 一个标签
 */
export interface ApiThemeHighlight {
  theme_type: string;                 // who/where/when/why/what
  label_name?: string | null;         // [NEW] 标签名称（如：老年人、卧室）
  quote?: string | null;              // [NEW] 原文证据（英文）
  quote_translated?: string | null;   // [NEW] 原文证据翻译（中文）
  explanation?: string | null;        // [NEW] 归类理由
  context_label_id?: string | null;   // [NEW] 关联的标签库ID
  items?: ApiThemeItem[] | null;      // [DEPRECATED] 旧版内容项列表，向后兼容
  keywords?: string[] | null;         // [DEPRECATED] 已废弃
}

/** 
 * [UPDATED] 5W 营销模型主题类型枚举
 * - who: 使用者/人群
 * - where: 使用地点/场景  
 * - when: 使用时刻/时机
 * - why: 购买动机 (Purchase Driver)
 * - what: 待办任务 (Jobs to be Done)
 */
export type ThemeTypeId = 'who' | 'where' | 'when' | 'why' | 'what';

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

// ============== 报告生成相关类型 ==============

/** 报告类型枚举 - 四位一体决策中台 */
export type ReportType = 'comprehensive' | 'operations' | 'product' | 'supply_chain';

/** 报告类型配置 */
export const REPORT_TYPE_CONFIG: Record<ReportType, { label: string; description: string; icon: string }> = {
  comprehensive: { label: '综合战略版', description: 'CEO视角 - 全局战略分析', icon: '🎯' },
  operations: { label: '运营市场版', description: 'CMO视角 - 卖点与广告定位', icon: '📢' },
  product: { label: '产品研发版', description: 'CPO视角 - 缺陷与迭代建议', icon: '🔧' },
  supply_chain: { label: '供应链版', description: '供应链视角 - 质量整改', icon: '📦' }
};

/** 证据样本 (用于溯源) */
export interface EvidenceSample {
  review_id: string;
  quote: string;
  rating?: number;
  date?: string;
  analysis?: string;
  sentiment?: string;
}

/** ECharts 数据格式 (带证据溯源) */
export interface ChartDataItem {
  name: string;
  value: number;
  evidence?: EvidenceSample[];  // 证据锚点
}

/** 5类洞察数据 (ECharts 格式) */
export interface InsightChartData {
  strength: ChartDataItem[];
  weakness: ChartDataItem[];
  suggestion: ChartDataItem[];
  scenario: ChartDataItem[];
  emotion: ChartDataItem[];
}

/** 5W Context 数据 (ECharts 格式) */
export interface ContextChartData {
  who: ChartDataItem[];
  where: ChartDataItem[];
  when: ChartDataItem[];
  why: ChartDataItem[];
  what: ChartDataItem[];
}

/** 报告统计数据 */
export interface ReportStats {
  total_reviews: number;
  
  // ECharts 格式数据 (新版)
  context?: ContextChartData;
  insight?: InsightChartData;
  
  // 字符串格式 (兼容旧版)
  context_stats?: {
    who: string;
    scene: string;
    why: string;
    what: string;
  };
  insight_stats?: {
    weakness: string;
    strength: string;
    suggestion?: string;
    scenario?: string;
    emotion?: string;
  };
  
  // 结构化列表数据（用于前端卡片展示）
  // 5W Context
  top_who?: Array<{ name: string; count: number }>;
  top_where?: Array<{ name: string; count: number }>;
  top_when?: Array<{ name: string; count: number }>;
  top_why?: Array<{ name: string; count: number }>;
  top_what?: Array<{ name: string; count: number }>;
  // 5类 Insight
  top_strengths?: Array<{ dimension: string; count: number; quotes: string[] }>;
  top_weaknesses?: Array<{ dimension: string; count: number; quotes: string[] }>;
  top_suggestions?: Array<{ dimension: string; count: number; quotes: string[] }>;
  top_scenarios?: Array<{ dimension: string; count: number; quotes: string[] }>;
  top_emotions?: Array<{ dimension: string; count: number; quotes: string[] }>;
}

/** 持久化报告对象 */
export interface ProductReport {
  id: string;
  product_id: string;
  title: string | null;
  content: string;
  analysis_data: ReportStats | null;
  report_type: string;
  status: string;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** 报告生成响应（旧版，向后兼容） */
export interface ApiReportGenerateResponse {
  success: boolean;
  report: string | null;
  stats: ReportStats | null;
  error: string | null;
}

/** 报告生成响应（新版，持久化） */
export interface ApiReportCreateResponse {
  success: boolean;
  report: ProductReport | null;
  stats: ReportStats | null;
  error: string | null;
}

/** 报告预览响应 */
export interface ApiReportPreviewResponse {
  success: boolean;
  product?: {
    id: string;
    asin: string;
    title: string;
  };
  stats: ReportStats | null;
  has_existing_report?: boolean;
  latest_report_id?: string | null;
  latest_report_date?: string | null;
  latest_report_type?: ReportType | null;
  report_counts?: Record<ReportType, number>;
  error: string | null;
}

// ============== JSON 报告内容类型定义 ==============

/** 用户画像分析 (综合版) */
export interface UserProfileComprehensive {
  core_users: string;
  user_characteristics?: string[];
  usage_scenarios: string;
  purchase_motivation: string;
  jobs_to_be_done: string;
  persona_insight: string;
}

/** 用户画像分析 (运营版) */
export interface UserProfileOperations {
  primary_audience: string;
  secondary_audience?: string;
  usage_context: string;
  buying_triggers: string[];
  use_cases: string[];
  ad_targeting_keywords?: string[];
}

/** 用户研究洞察 (产品版) */
export interface UserResearchProduct {
  target_users: string;
  user_pain_points?: string[];
  real_usage_environments: string[];
  design_for_context: string;
  user_goals: string[];
  unmet_expectations: string;
}

/** 使用环境分析 (供应链版) */
export interface UsageContextSupplyChain {
  user_groups: string;
  usage_environments: string[];
  environmental_requirements: string;
  usage_intensity: string;
  durability_focus?: string[];
}

/** 综合战略版报告内容 */
export interface ComprehensiveReportContent {
  user_profile?: UserProfileComprehensive;
  strategic_verdict: string;
  market_fit_analysis: string;
  core_swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  department_directives: {
    to_marketing: string;
    to_product: string;
    to_supply_chain: string;
  };
  priority_actions?: Array<{ action: string; owner: string; deadline: string }>;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
}

/** 运营市场版报告内容 */
export interface OperationsReportContent {
  user_profile?: UserProfileOperations;
  executive_summary: string;
  selling_points: Array<{ title: string; copywriting: string; source_strength: string }>;
  marketing_risks: string[];
  target_audience: {
    who: string[];
    scenario: string[];
    strategy: string;
  };
  competitor_analysis: string;
  listing_optimization?: Array<{ element: string; suggestion: string }>;
  review_response_templates?: Array<{ pain_point: string; response: string }>;
}

/** 产品研发版报告内容 */
export interface ProductReportContent {
  user_research?: UserResearchProduct;
  quality_score: number;
  critical_bugs: Array<{ issue: string; severity: string; root_cause_guess?: string; suggestion: string }>;
  unmet_needs: string[];
  usage_context_gap: string;
  roadmap_suggestion: string;
  usability_issues?: Array<{ issue: string; user_group: string; suggestion: string }>;
  design_recommendations?: Array<{ area: string; current_state: string; recommendation: string }>;
}

/** 供应链版报告内容 */
export interface SupplyChainReportContent {
  usage_context_analysis?: UsageContextSupplyChain;
  material_defects: Array<{ part: string; problem: string; frequency: string }>;
  packaging_issues: {
    is_damaged: boolean;
    details: string;
    improvement: string;
  };
  missing_parts: string[];
  qc_checklist: string[];
  supplier_issues?: Array<{ component: string; issue: string; action: string }>;
  return_rate_factors?: Array<{ reason: string; percentage: string; solution: string }>;
  assembly_defects?: Array<{ defect: string; frequency: string; station: string }>;
}

/** 报告内容联合类型 */
export type ReportContent = 
  | ComprehensiveReportContent 
  | OperationsReportContent 
  | ProductReportContent 
  | SupplyChainReportContent;

/** 报告列表响应 */
export interface ApiReportListResponse {
  success: boolean;
  reports: ProductReport[];
  total: number;
}
