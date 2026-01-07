/**
 * API 服务层 - 完整版
 * 包含所有 18 个接口调用函数
 */

import type {
  ApiResponse,
  Task,
  Review,
  StatsData,
  ReviewsPageData,
  FilterReviewsParams,
  StartTranslationParams,
  StartTranslationData,
  TranslationProgressData,
  ExportParams,
  ThemeTagsData,
  AddCustomTagParams,
  AddCustomTagData,
  GetMediaParams,
  MediaPageData,
  Sentiment,
  WebSocketMessage,
} from './types';

// API 基础配置
const API_BASE = '/api/v1';
const WS_BASE = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_URL || 'ws://localhost:8000/ws';

// ============== 通用请求封装 ==============

class ApiError extends Error {
  constructor(public code: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }

  const data = await response.json();
  
  // 适配后端直接返回数据的情况（非标准包装）
  if (data.code === undefined) {
    return {
      code: 200,
      message: '成功',
      data: data as T,
    };
  }
  
  return data as ApiResponse<T>;
}

async function requestBlob(
  endpoint: string,
  options?: RequestInit
): Promise<Blob> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return response.blob();
}

// ============== 核心接口 ==============

/**
 * 1. 获取任务详情及评论列表
 */
export async function getTaskDetail(taskId: string): Promise<ApiResponse<Task>> {
  return request<Task>(`/tasks/${taskId}`);
}

/**
 * 2. 获取评论统计数据
 */
export async function getTaskStats(taskId: string): Promise<ApiResponse<StatsData>> {
  return request<StatsData>(`/tasks/${taskId}/stats`);
}

/**
 * 3. 筛选和排序评论
 */
export async function filterReviews(
  params: FilterReviewsParams
): Promise<ApiResponse<ReviewsPageData>> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== 'all') {
      searchParams.set(key, String(value));
    }
  });
  
  const query = searchParams.toString();
  return request<ReviewsPageData>(`/tasks/${taskId}/reviews${query ? `?${query}` : ''}`);
}

// ============== 评论操作 ==============

/**
 * 4. 置顶评论
 */
export async function pinReview(
  reviewId: string,
  isPinned: boolean
): Promise<ApiResponse<{ reviewId: string; isPinned: boolean }>> {
  return request(`/reviews/${reviewId}/pin`, {
    method: 'PUT',
    body: JSON.stringify({ isPinned }),
  });
}

/**
 * 5. 隐藏/显示评论
 */
export async function toggleReviewVisibility(
  reviewId: string,
  isHidden: boolean
): Promise<ApiResponse<{ reviewId: string; isHidden: boolean }>> {
  return request(`/reviews/${reviewId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ isHidden }),
  });
}

/**
 * 6. 添加/编辑评论标签
 */
export async function updateReviewTags(
  reviewId: string,
  tags: string[]
): Promise<ApiResponse<{ reviewId: string; tags: string[] }>> {
  return request(`/reviews/${reviewId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

/**
 * 7. 编辑评论内容
 */
export async function updateReview(
  reviewId: string,
  updates: {
    originalTitle?: string;
    translatedTitle?: string;
    originalText?: string;
    translatedText?: string;
    sentiment?: Sentiment;
  }
): Promise<ApiResponse<Review>> {
  return request(`/reviews/${reviewId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * 8. 删除评论
 */
export async function deleteReview(
  reviewId: string
): Promise<ApiResponse<{ reviewId: string; deleted: boolean }>> {
  return request(`/reviews/${reviewId}`, {
    method: 'DELETE',
  });
}

/**
 * 9. 获取隐藏的评论列表
 */
export async function getHiddenReviews(
  taskId: string
): Promise<ApiResponse<Review[]>> {
  return request<Review[]>(`/tasks/${taskId}/reviews/hidden`);
}

// ============== 数据导出 ==============

/**
 * 10. 导出CSV
 */
export async function exportCSV(params: ExportParams): Promise<Blob> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== 'all') {
      searchParams.set(key, String(value));
    }
  });
  
  const query = searchParams.toString();
  return requestBlob(`/tasks/${taskId}/export/csv${query ? `?${query}` : ''}`);
}

/**
 * 11. 导出Excel (XLSX)
 */
export async function exportXLSX(params: ExportParams): Promise<Blob> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== 'all') {
      searchParams.set(key, String(value));
    }
  });
  
  const query = searchParams.toString();
  return requestBlob(`/tasks/${taskId}/export/xlsx${query ? `?${query}` : ''}`);
}

// ============== 翻译相关 ==============

/**
 * 12. 开始翻译任务
 */
export async function startTranslation(
  params: StartTranslationParams
): Promise<ApiResponse<StartTranslationData>> {
  const { taskId, reviewIds } = params;
  return request(`/tasks/${taskId}/translate`, {
    method: 'POST',
    body: reviewIds ? JSON.stringify({ reviewIds }) : undefined,
  });
}

/**
 * 13. 获取翻译进度
 */
export async function getTranslationProgress(
  taskId: string
): Promise<ApiResponse<TranslationProgressData>> {
  return request<TranslationProgressData>(`/tasks/${taskId}/translate/progress`);
}

// ============== 主题标签 ==============

/**
 * 14. 获取主题标签高亮数据
 */
export async function getThemeTags(
  taskId: string
): Promise<ApiResponse<ThemeTagsData>> {
  return request<ThemeTagsData>(`/tasks/${taskId}/theme-tags`);
}

/**
 * 15. 添加自定义主题标签
 */
export async function addCustomThemeTag(
  params: AddCustomTagParams
): Promise<ApiResponse<AddCustomTagData>> {
  const { taskId, ...body } = params;
  return request(`/tasks/${taskId}/theme-tags`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 16. 删除自定义主题标签
 */
export async function deleteThemeTag(
  taskId: string,
  tagId: string
): Promise<ApiResponse<{ tagId: string; deleted: boolean }>> {
  return request(`/tasks/${taskId}/theme-tags/${tagId}`, {
    method: 'DELETE',
  });
}

// ============== 媒体内容 ==============

/**
 * 17. 获取买家秀（图片和视频）
 */
export async function getMedia(
  params: GetMediaParams
): Promise<ApiResponse<MediaPageData>> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  
  const query = searchParams.toString();
  return request<MediaPageData>(`/tasks/${taskId}/media${query ? `?${query}` : ''}`);
}

// ============== WebSocket 工具 ==============

/**
 * 18. 创建 WebSocket 连接用于实时翻译进度
 */
export function createWebSocketConnection(
  taskId: string,
  onMessage: (message: WebSocketMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/tasks/${taskId}`);
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      onMessage(message);
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  };
  
  ws.onerror = (event) => {
    console.error('WebSocket error:', event);
    onError?.(event);
  };
  
  ws.onclose = () => {
    onClose?.();
  };
  
  return ws;
}

// ============== 文件下载工具 ==============

/**
 * 下载文件
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============== 兼容现有后端的接口 ==============

import type {
  ApiProductListResponse,
  ApiProductStatsResponse,
  ApiReviewListResponse,
  ApiIngestResponse,
  ApiTask,
  ApiDimensionListResponse,
  ApiDimensionGenerateResponse,
  ApiReportGenerateResponse,
  ApiReportPreviewResponse,
} from './types';

/**
 * 获取产品列表（兼容现有后端）
 */
export async function getProducts(): Promise<ApiProductListResponse> {
  const response = await fetch(`${API_BASE}/products`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 获取产品统计（兼容现有后端）
 */
export async function getProductStats(asin: string): Promise<ApiProductStatsResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/stats`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 触发翻译（兼容现有后端）
 * 会自动先翻译五点描述，再翻译评论
 */
export async function triggerTranslation(asin: string): Promise<ApiIngestResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/translate`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 单独触发五点翻译（产品标题和五点描述）
 */
export async function triggerBulletPointsTranslation(asin: string): Promise<{
  success: boolean;
  message: string;
  product_id: string;
  asin: string;
  items_to_translate?: string[];
  already_translated?: boolean;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/translate-bullet-points`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 触发洞察提取（为已翻译的评论提取 AI 深度解读）
 */
export async function triggerInsightExtraction(asin: string): Promise<{
  success: boolean;
  message: string;
  product_id: string;
  asin: string;
  reviews_to_process: number;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/extract-insights`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 触发主题高亮提取（为已翻译的评论提取8个主题的关键词）
 */
export async function triggerThemeExtraction(asin: string): Promise<{
  success: boolean;
  message: string;
  product_id: string;
  asin: string;
  reviews_to_process: number;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/extract-themes`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

// ============== 产品维度相关 ==============

/**
 * 获取产品的维度列表
 */
export async function getDimensions(asin: string): Promise<ApiDimensionListResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/dimensions`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 触发维度生成（AI 从评论中学习产品专属维度）
 */
export async function generateDimensions(asin: string): Promise<ApiDimensionGenerateResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/dimensions/generate`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

// ============== 报告生成相关 ==============

import type { 
  ApiReportCreateResponse, 
  ApiReportListResponse, 
  ProductReport 
} from './types';

/**
 * 生成产品分析报告（AI 深度分析，自动持久化）
 * 需要 30-60 秒，因为需要调用 AI 进行深度分析
 * 报告会自动存入数据库，支持历史回溯
 * 
 * @param asin - 产品 ASIN
 * @param reportType - 报告类型: comprehensive(综合版), operations(运营版), product(产品版), supply_chain(供应链版)
 */
export async function generateReport(
  asin: string, 
  reportType: string = 'comprehensive'
): Promise<ApiReportCreateResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/report/generate?report_type=${reportType}`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 获取报告预览数据（不调用 AI，仅返回统计数据）
 * 用于前端展示进度和数据预览
 * 同时返回是否存在历史报告
 */
export async function getReportPreview(asin: string): Promise<ApiReportPreviewResponse> {
  const response = await fetch(`${API_BASE}/products/${asin}/report/preview`);
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 获取产品的历史报告列表
 * 按创建时间倒序排列
 * 
 * @param asin - 产品 ASIN
 * @param limit - 返回数量限制
 * @param reportType - 可选，按报告类型筛选
 */
export async function getReportHistory(
  asin: string, 
  limit: number = 10,
  reportType?: string
): Promise<ApiReportListResponse> {
  let url = `${API_BASE}/products/${asin}/reports?limit=${limit}`;
  if (reportType) {
    url += `&report_type=${reportType}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 获取产品最新的报告（秒开）
 * 如果没有历史报告，返回 404
 */
export async function getLatestReport(asin: string): Promise<ProductReport> {
  const response = await fetch(`${API_BASE}/products/${asin}/reports/latest`);
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 根据 ID 获取特定报告
 */
export async function getReportById(asin: string, reportId: string): Promise<ProductReport> {
  const response = await fetch(`${API_BASE}/products/${asin}/reports/${reportId}`);
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 删除指定报告
 */
export async function deleteReport(asin: string, reportId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/products/${asin}/reports/${reportId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 获取评论列表（兼容现有后端）
 */
export async function getReviews(params: {
  asin: string;
  page?: number;
  pageSize?: number;
  rating?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}): Promise<ApiReviewListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.rating) searchParams.set('rating', params.rating.toString());
  if (params.sentiment) searchParams.set('sentiment', params.sentiment);
  if (params.status) searchParams.set('status', params.status);
  
  const queryString = searchParams.toString();
  const endpoint = `/reviews/${params.asin}${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 导出评论（兼容现有后端）
 */
export async function exportReviewsByAsin(
  asin: string
): Promise<Blob> {
  const url = `${API_BASE}/reviews/${asin}/export`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}

/**
 * 获取任务状态（兼容现有后端）
 */
export async function getTaskStatus(taskId: string): Promise<ApiTask> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 任务健康检查响应类型
 */
export interface TaskHealthResponse {
  product_id: string;
  asin: string;
  tasks: Array<{
    id: string;
    task_type: string;
    status: string;
    total_items: number;
    processed_items: number;
    progress_percentage: number;
    last_heartbeat: string | null;
    heartbeat_timeout_seconds: number;
    is_timeout: boolean;
    error_message: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  has_timeout: boolean;
  timeout_count: number;
  recovered_tasks: Array<{
    task_type: string;
    action: string;
    error?: string;
  }>;
}

/**
 * 检查产品任务健康状态
 * 
 * 功能：
 * 1. 返回所有任务的状态和心跳信息
 * 2. 检测心跳超时的任务
 * 3. 自动触发超时任务的恢复（可选）
 * 
 * @param asin 产品 ASIN
 * @param autoRecover 是否自动恢复超时任务（默认 true）
 */
export async function checkTasksHealth(
  asin: string,
  autoRecover: boolean = true
): Promise<TaskHealthResponse> {
  const url = `${API_BASE}/products/${asin}/tasks/health?auto_recover=${autoRecover}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

// ============== 对比分析相关 ==============

/**
 * 创建对比分析项目
 */
export async function createAnalysisProject(params: {
  title: string;
  description?: string;
  products: Array<{ product_id: string; role_label?: string }>;
  auto_run?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  project?: {
    id: string;
    title: string;
    status: string;
    created_at: string;
  };
  error?: string;
}> {
  const { auto_run = true, ...body } = params;
  const url = `${API_BASE}/analysis/projects${auto_run ? '?auto_run=true' : '?auto_run=false'}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || message;
    } catch {
      message = errorText || message;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

/**
 * 获取分析项目列表
 */
export async function getAnalysisProjects(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{
  success: boolean;
  total: number;
  projects: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    items: Array<{
      id: string;
      product_id: string;
      role_label?: string;
      product?: {
        id: string;
        asin: string;
        title: string;
        image_url?: string;
      };
    }>;
  }>;
}> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.status) searchParams.set('status', params.status);
  
  const query = searchParams.toString();
  const url = `${API_BASE}/analysis/projects${query ? `?${query}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 获取分析项目详情
 */
export async function getAnalysisProject(projectId: string): Promise<{
  id: string;
  title: string;
  description?: string;
  analysis_type: string;
  status: string;
  result_content?: any;
  raw_data_snapshot?: any;
  error_message?: string;
  created_at: string;
  updated_at?: string;
  items: Array<{
    id: string;
    product_id: string;
    role_label?: string;
    product?: {
      id: string;
      asin: string;
      title: string;
      image_url?: string;
    };
  }>;
}> {
  const response = await fetch(`${API_BASE}/analysis/projects/${projectId}`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 触发分析任务
 */
export async function triggerAnalysis(projectId: string): Promise<{
  success: boolean;
  message: string;
  project_id: string;
  status: string;
}> {
  const response = await fetch(`${API_BASE}/analysis/projects/${projectId}/run`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 删除分析项目
 */
export async function deleteAnalysisProject(projectId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/analysis/projects/${projectId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 获取对比预览数据
 */
export async function getComparisonPreview(productIds: string[]): Promise<{
  success: boolean;
  products: Record<string, {
    product: {
      id: string;
      asin: string;
      title: string;
      image_url?: string;
    };
    total_reviews: number;
    context: any;
    insight: any;
  }>;
  can_compare: boolean;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/analysis/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_ids: productIds }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

// ============== 导出服务对象 ==============

const apiService = {
  // 核心接口
  getTaskDetail,
  getTaskStats,
  filterReviews,
  
  // 评论操作
  pinReview,
  toggleReviewVisibility,
  updateReviewTags,
  updateReview,
  deleteReview,
  getHiddenReviews,
  
  // 数据导出
  exportCSV,
  exportXLSX,
  downloadFile,
  
  // 翻译相关
  startTranslation,
  getTranslationProgress,
  
  // 主题标签
  getThemeTags,
  addCustomThemeTag,
  deleteThemeTag,
  
  // 媒体内容
  getMedia,
  
  // WebSocket
  createWebSocketConnection,
  
  // 兼容现有后端
  getProducts,
  getProductStats,
  triggerTranslation,
  getReviews,
  exportReviewsByAsin,
  getTaskStatus,
  
  // 洞察提取
  triggerInsightExtraction,
  
  // 主题高亮提取
  triggerThemeExtraction,
  
  // 产品维度
  getDimensions,
  generateDimensions,
  
  // 报告生成（支持持久化）
  generateReport,
  getReportPreview,
  getReportHistory,
  getLatestReport,
  getReportById,
  deleteReport,
  
  // 对比分析
  createAnalysisProject,
  getAnalysisProjects,
  getAnalysisProject,
  triggerAnalysis,
  deleteAnalysisProject,
  getComparisonPreview,
};

export default apiService;

