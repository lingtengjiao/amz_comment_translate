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
  asin: string,
  format: 'xlsx' | 'csv' = 'xlsx'
): Promise<Blob> {
  const url = `${API_BASE}/reviews/${asin}/export?format=${format}`;
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
};

export default apiService;

