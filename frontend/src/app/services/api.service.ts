/**
 * API 服务层
 * 封装所有后端接口调用
 */

import type {
  ApiResponse,
  Task,
  Review,
  StatsData,
  FilterReviewsParams,
  PaginatedReviewsResponse,
  StartTranslationParams,
  TranslationProgressResponse,
  ThemeTagsResponse,
  ThemeTag,
  AddCustomTagParams,
  UpdateReviewParams,
  ExportParams,
  GetMediaParams,
  PaginatedMediaResponse,
  Sentiment
} from '../types/api.types';

// 配置基础URL - 生产环境使用相对路径，开发环境使用本地代理
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 通用请求方法
 */
async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      // 如果需要认证，添加 token
      // 'Authorization': `Bearer ${getToken()}`
    },
    ...options
  };

  try {
    const response = await fetch(url, defaultOptions);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || '请求失败');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ============= 核心接口 =============

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
): Promise<ApiResponse<PaginatedReviewsResponse>> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const endpoint = `/tasks/${taskId}/reviews${queryString ? `?${queryString}` : ''}`;
  
  return request<PaginatedReviewsResponse>(endpoint);
}

// ============= 评论操作 =============

/**
 * 4. 置顶评论
 */
export async function pinReview(
  reviewId: string,
  isPinned: boolean
): Promise<ApiResponse<{ reviewId: string; isPinned: boolean }>> {
  return request(`/reviews/${reviewId}/pin`, {
    method: 'PUT',
    body: JSON.stringify({ isPinned })
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
    body: JSON.stringify({ isHidden })
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
    body: JSON.stringify({ tags })
  });
}

/**
 * 7. 编辑评论内容
 */
export async function updateReview(
  params: UpdateReviewParams
): Promise<ApiResponse<Review>> {
  const { reviewId, ...updateData } = params;
  
  return request<Review>(`/reviews/${reviewId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData)
  });
}

/**
 * 8. 删除评论
 */
export async function deleteReview(
  reviewId: string
): Promise<ApiResponse<{ reviewId: string; deleted: boolean }>> {
  return request(`/reviews/${reviewId}`, {
    method: 'DELETE'
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

// ============= 数据导出 =============

/**
 * 10. 导出CSV
 */
export async function exportCSV(params: ExportParams): Promise<Blob> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}/tasks/${taskId}/export/csv${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('导出CSV失败');
  }
  
  return response.blob();
}

/**
 * 11. 导出Excel
 */
export async function exportXLSX(params: ExportParams): Promise<Blob> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}/tasks/${taskId}/export/xlsx${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('导出Excel失败');
  }
  
  return response.blob();
}

// ============= 翻译相关 =============

/**
 * 12. 开始翻译任务
 */
export async function startTranslation(
  params: StartTranslationParams
): Promise<ApiResponse<{
  taskId: string;
  totalReviews: number;
  estimatedTime: number;
}>> {
  const { taskId, reviewIds } = params;
  
  return request(`/tasks/${taskId}/translate`, {
    method: 'POST',
    body: JSON.stringify({ reviewIds })
  });
}

/**
 * 13. 获取翻译进度
 */
export async function getTranslationProgress(
  taskId: string
): Promise<ApiResponse<TranslationProgressResponse>> {
  return request<TranslationProgressResponse>(`/tasks/${taskId}/translate/progress`);
}

// ============= 主题标签 =============

/**
 * 14. 获取主题标签高亮数据
 */
export async function getThemeTags(
  taskId: string
): Promise<ApiResponse<ThemeTagsResponse>> {
  return request<ThemeTagsResponse>(`/tasks/${taskId}/theme-tags`);
}

/**
 * 15. 添加自定义主题标签
 */
export async function addCustomThemeTag(
  params: AddCustomTagParams
): Promise<ApiResponse<{
  tag: ThemeTag;
  isProcessing: boolean;
}>> {
  const { taskId, label, keywords } = params;
  
  return request(`/tasks/${taskId}/theme-tags`, {
    method: 'POST',
    body: JSON.stringify({ label, keywords })
  });
}

/**
 * 16. 删除自定义主题标签
 */
export async function deleteCustomThemeTag(
  taskId: string,
  tagId: string
): Promise<ApiResponse<{
  tagId: string;
  deleted: boolean;
}>> {
  return request(`/tasks/${taskId}/theme-tags/${tagId}`, {
    method: 'DELETE'
  });
}

// ============= 媒体内容 =============

/**
 * 17. 获取买家秀（图片和视频）
 */
export async function getMedia(
  params: GetMediaParams
): Promise<ApiResponse<PaginatedMediaResponse>> {
  const { taskId, ...queryParams } = params;
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const endpoint = `/tasks/${taskId}/media${queryString ? `?${queryString}` : ''}`;
  
  return request<PaginatedMediaResponse>(endpoint);
}

// ============= 工具函数 =============

/**
 * 下载文件（用于导出）
 */
export function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * WebSocket 连接（用于实时翻译进度）
 */
export function createWebSocketConnection(
  taskId: string,
  onMessage: (data: any) => void,
  onError?: (error: Event) => void
): WebSocket {
  const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3000/ws';
  const ws = new WebSocket(`${wsUrl}/tasks/${taskId}`);

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      onMessage(message);
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onError?.(error);
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };

  return ws;
}

// ============= 导出所有方法 =============

export const apiService = {
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
  deleteCustomThemeTag,
  
  // 媒体内容
  getMedia,
  
  // WebSocket
  createWebSocketConnection
};

export default apiService;
