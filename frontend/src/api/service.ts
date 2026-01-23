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
  AnalysisProject,
} from './types';

// API 基础配置
const API_BASE = '/api/v1';
const WS_BASE = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_URL || 'ws://localhost:8000/ws';

// ============== 通用请求封装 ==============

// Token 存储 key（与 AuthContext 保持一致）
const TOKEN_KEY = 'voc_auth_token';

// 获取认证头
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

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
      ...getAuthHeaders(),
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
 * @param myOnly 只显示我的项目
 */
export async function getProducts(myOnly = false, adminOnly = false): Promise<ApiProductListResponse> {
  const params = new URLSearchParams();
  if (myOnly) {
    params.set('my_only', 'true');
  }
  if (adminOnly) {
    params.set('admin_only', 'true');
  }
  const url = `${API_BASE}/products${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
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
 * @deprecated 已废弃 - 请使用 startDeepAnalysis() 替代
 * 
 * 原因：单独触发洞察提取会绕过"科学学习"步骤，导致AI使用降级模式（自由判断维度），
 * 数据质量差，难以聚合统计。
 * 
 * 正确流程：startDeepAnalysis() → 自动执行学习 → 自动提取洞察+主题 → 自动生成报告
 * 
 * 此函数仅保留用于后端自动恢复机制，不应由前端UI直接调用。
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
 * @deprecated 已废弃 - 请使用 startDeepAnalysis() 替代
 * 
 * 原因：单独触发主题提取会绕过"科学学习"步骤，导致AI使用降级模式（自由判断5W标签），
 * 数据质量差，难以聚合统计。
 * 
 * 正确流程：startDeepAnalysis() → 自动执行学习 → 自动提取洞察+主题 → 自动生成报告
 * 
 * 此函数仅保留用于后端自动恢复机制，不应由前端UI直接调用。
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
 * 🚀 一键深度分析（模式B：只翻译 → 后洞察）
 * 
 * 调用此接口启动完整的AI分析流水线：
 * 1. 科学学习（维度 + 5W标签）
 * 2. 洞察 + 主题提取（并行）
 * 3. 自动生成报告
 * 
 * 注意：这是推荐的分析触发方式，包含必要的学习步骤
 */
export async function startDeepAnalysis(asin: string): Promise<{
  success: boolean;
  status: 'started' | 'already_running';
  message: string;
  task_id?: string;
  product_id: string;
  asin: string;
  review_count: number;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/start-analysis`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.detail || response.statusText);
  }
  return response.json();
}

/**
 * 停止产品的所有分析任务
 */
export async function stopAnalysisTasks(asin: string): Promise<{
  success: boolean;
  message: string;
  product_id: string;
  asin: string;
  revoked_count: number;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/stop-analysis`, {
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
/**
 * 异步生成报告（推荐使用）
 * 触发后台任务，立即返回任务 ID，用户可以离开页面
 */
export async function generateReportAsync(
  asin: string, 
  reportType: string = 'comprehensive'
): Promise<{
  success: boolean;
  status: string;
  message: string;
  task_id: string;
  product_id: string;
  asin: string;
  report_type: string;
  report_type_config?: { label: string; description: string; icon: string };
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/report/generate-async?report_type=${reportType}`, {
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
 * 查询异步报告生成任务的状态
 */
export async function getReportTaskStatus(
  asin: string,
  taskId: string
): Promise<{
  task_id: string;
  asin: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
  report_id?: string;
  success?: boolean;
  error?: string;
  progress?: number;
  current_step?: string;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/report/task/${taskId}`);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 同步生成报告（保留向后兼容，会阻塞直到完成）
 * 注意：此方法需要 30-60 秒，用户不能离开页面
 * 推荐使用 generateReportAsync
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
 * 获取本周生成的报告数量统计
 * 
 * @returns 本周报告数量
 */
export async function getWeeklyReportCount(): Promise<{ success: boolean; count: number; week_start: string }> {
  const response = await fetch(`${API_BASE}/products/reports/stats/weekly`);
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
 * 获取所有产品的报告列表（用于报告库页面）
 * 按创建时间倒序排列
 * 
 * @param limit - 返回数量限制，默认100
 * @param reportType - 可选，按报告类型筛选
 */
export async function getAllReports(
  limit: number = 100,
  reportType?: string,
  myOnly: boolean = false
): Promise<ApiReportListResponse> {
  let url = `${API_BASE}/products/reports/all?limit=${limit}`;
  if (reportType) {
    url += `&report_type=${reportType}`;
  }
  if (myOnly) {
    url += `&my_only=true`;
  }
  const response = await fetch(url, { headers: getAuthHeaders() });
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
 * 创建分析项目（支持对比分析和市场洞察）
 */
export async function createAnalysisProject(params: {
  title: string;
  description?: string;
  products: Array<{ product_id: string; role_label?: string }>;
  auto_run?: boolean;
  analysis_type?: 'comparison' | 'market_insight';
}): Promise<{
  success: boolean;
  message: string;
  project?: {
    id: string;
    title: string;
    status: string;
    analysis_type?: string;
    created_at: string;
  };
  error?: string;
}> {
  const { auto_run = true, ...body } = params;
  const url = `${API_BASE}/analysis/projects${auto_run ? '?auto_run=true' : '?auto_run=false'}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
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
 * @param params.admin_only 只显示包含管理员关注产品的项目（用于市场洞察广场）
 * @param params.my_only 只显示当前用户创建的项目
 */
export async function getAnalysisProjects(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  admin_only?: boolean;
  my_only?: boolean;
}): Promise<{
  success: boolean;
  total: number;
  projects: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    analysis_type?: string;
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
  if (params?.admin_only) searchParams.set('admin_only', 'true');
  if (params?.my_only) searchParams.set('my_only', 'true');
  
  const query = searchParams.toString();
  const url = `${API_BASE}/analysis/projects${query ? `?${query}` : ''}`;
  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 获取分析项目详情
 * @param projectId 项目ID
 * @param statusOnly 🚀 轮询模式：只返回状态字段，不返回完整结果（减少网络传输）
 */
export async function getAnalysisProject(projectId: string, statusOnly = false): Promise<AnalysisProject> {
  const params = new URLSearchParams();
  if (statusOnly) {
    params.append('status_only', 'true');
  }
  const url = `${API_BASE}/analysis/projects/${projectId}${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  const data = await response.json();
  // API 返回的 status 是 string，需要类型断言
  return data as AnalysisProject;
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
    headers: getAuthHeaders(),
    body: JSON.stringify({ product_ids: productIds }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

// ============== [NEW] 全自动分析 API ==============

/**
 * 触发采集完成后的全自动分析
 * @param asin 产品 ASIN
 * @returns 任务信息，包含 task_id 用于轮询状态
 */
export async function triggerAutoAnalysis(asin: string): Promise<{
  success: boolean;
  status: 'started' | 'already_running';
  message: string;
  task_id: string;
  product_id: string;
  asin: string;
  review_count: number;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/collection-complete`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.detail || response.statusText);
  }
  return response.json();
}

/**
 * 获取全自动分析状态
 * @param asin 产品 ASIN
 * @returns 分析进度信息
 */
export async function getAutoAnalysisStatus(asin: string): Promise<{
  success: boolean;
  status: 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';
  current_step?: string;
  progress?: number;
  processed_items?: number;
  total_items?: number;
  task_id?: string;
  product_id: string;
  asin: string;
  message?: string;
  error_message?: string;
  report_id?: string;
}> {
  const response = await fetch(`${API_BASE}/products/${asin}/auto-analysis-status`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.detail || response.statusText);
  }
  return response.json();
}

/**
 * [NEW] 检查多个产品的分析完成状态
 * 用于市场洞察功能：需要所有产品都已完成单产品分析
 */
export interface ProductAnalysisStatusItem {
  product_id: string;
  asin: string;
  title: string;
  has_dimensions: boolean;
  has_labels: boolean;
  is_ready: boolean;
}

export interface ProductAnalysisStatusResponse {
  success: boolean;
  all_ready: boolean;
  products: ProductAnalysisStatusItem[];
  incomplete_count: number;
  message?: string;
}

export async function checkProductsAnalysisStatus(
  productIds: string[]
): Promise<ProductAnalysisStatusResponse> {
  const response = await fetch(`${API_BASE}/analysis/products/analysis-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ product_ids: productIds }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.detail || response.statusText);
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
  
  // 🚀 一键深度分析（推荐）
  startDeepAnalysis,
  
  // [DEPRECATED] 洞察提取 - 请使用 startDeepAnalysis 替代
  triggerInsightExtraction,
  
  // [DEPRECATED] 主题高亮提取 - 请使用 startDeepAnalysis 替代
  triggerThemeExtraction,
  
  // 停止分析任务
  stopAnalysisTasks,
  
  // 产品维度
  getDimensions,
  generateDimensions,
  
  // 报告生成（支持持久化）
  generateReport,
  generateReportAsync,  // 🚀 异步生成（推荐）
  getReportTaskStatus,  // 查询任务状态
  getReportPreview,
  getReportHistory,
  getAllReports,
  getWeeklyReportCount,
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
  
  // [NEW] 全自动分析（采集完成后触发）
  triggerAutoAnalysis,
  getAutoAnalysisStatus,
  
  // [NEW] 市场洞察 - 产品分析状态检查
  checkProductsAnalysisStatus,
  
  // [NEW] 用户项目管理
  getMyProjects,
  addToMyProjects,
  removeFromMyProjects,
  getProjectStatus,
  toggleProjectFavorite,
  
  // [NEW] 关键词产品库
  getKeywordCollections,
  getKeywordCollectionsGrouped,
  getKeywordCollectionDetail,
  deleteKeywordCollection,
  updateKeywordCollectionDescription,
  
  // [NEW] 产品管理（产品画板功能）
  updateCollectionProduct,
  deleteCollectionProduct,
  batchUpdateCollectionProducts,
  saveBoardConfig,
  saveViewConfig,
  
  // [NEW] Rufus 调研
  getRufusSessions,
  getRufusSessionDetail,
  generateRufusSummary,
  deleteRufusSession,
  updateRufusSession,
};

// ============== 用户项目 API ==============

interface UserProject {
  id: string;
  asin: string;
  title: string | null;
  image_url: string | null;
  marketplace: string | null;
  custom_alias: string | null;
  notes: string | null;
  is_favorite: boolean;
  reviews_contributed: number;
  total_reviews: number;
  translated_reviews: number;
  created_at: string | null;
}

interface UserProjectsResponse {
  total: number;
  projects: UserProject[];
}

async function getMyProjects(favoritesOnly = false): Promise<UserProjectsResponse> {
  const params = new URLSearchParams();
  if (favoritesOnly) {
    params.set('favorites_only', 'true');
  }
  const result = await request<UserProjectsResponse>(`/user/projects?${params.toString()}`);
  return result.data;
}

async function addToMyProjects(asin: string): Promise<{ success: boolean; message: string; project_id?: string }> {
  const result = await request<{ success: boolean; message: string; project_id?: string }>(
    `/user/projects/${asin}`,
    { method: 'POST' }
  );
  return result.data;
}

async function removeFromMyProjects(asin: string): Promise<{ success: boolean; message: string }> {
  const result = await request<{ success: boolean; message: string }>(
    `/user/projects/${asin}`,
    { method: 'DELETE' }
  );
  return result.data;
}

async function getProjectStatus(asin: string): Promise<{ is_my_project: boolean; [key: string]: unknown }> {
  const result = await request<{ is_my_project: boolean; [key: string]: unknown }>(`/user/projects/${asin}`);
  return result.data;
}

async function toggleProjectFavorite(asin: string): Promise<{ success: boolean; is_favorite: boolean }> {
  const result = await request<{ success: boolean; is_favorite: boolean }>(
    `/user/projects/${asin}/favorite`,
    { method: 'POST' }
  );
  return result.data;
}

// ============== 关键词产品库 API ==============

export interface CollectionProduct {
  id: string;
  asin: string;
  title: string | null;
  image_url: string;
  product_url: string;
  price: string | null;  // 字符串格式，如 "$29.99"
  rating: number | null;
  review_count: number | null;
  sales_volume: number | null;  // 初步估算销售量
  sales_volume_manual: number | null;  // 补充数据的销售量
  sales_volume_text: string | null;
  is_sponsored: boolean;
  position: number | null;  // 页面位置（不是排名）
  major_category_rank: number | null;  // 大类排名
  minor_category_rank: number | null;  // 小类排名
  major_category_name: string | null;  // 大类名称
  minor_category_name: string | null;  // 小类名称
  year: number | null;      // 产品上架年份
  brand: string | null;     // 产品品牌
  created_at: string;
}

export interface UpdateProductParams {
  asin?: string;
  title?: string;
  image_url?: string;
  product_url?: string;
  price?: string;
  rating?: number;
  review_count?: number;
  sales_volume?: number;  // 初步估算销售量
  sales_volume_manual?: number;  // 补充数据的销售量
  sales_volume_text?: string;
  is_sponsored?: boolean;
  position?: number;  // 页面位置（不是排名）
  major_category_rank?: number;  // 大类排名
  minor_category_rank?: number;  // 小类排名
  major_category_name?: string;  // 大类名称
  minor_category_name?: string;  // 小类名称
  year?: number;
  brand?: string;
}

export interface BatchUpdateProductItem {
  asin: string;
  year?: number;
  brand?: string;
  sales_volume?: number;  // 初步估算销售量
  sales_volume_manual?: number;  // 补充数据的销售量（月销量）
  price?: string;
  rating?: number;
  review_count?: number;
  major_category_rank?: number;  // 大类BSR
  minor_category_rank?: number;  // 小类BSR
  major_category_name?: string;  // 大类目
  minor_category_name?: string;  // 小类目
}

export interface BoardConfig {
  boards: Array<{ id: string; name: string }>;
  productBoards: Record<string, string>;  // key: productId, value: boardId
}

export interface ViewConfig {
  viewMode?: 'custom' | 'price' | 'sales' | 'year' | 'brand' | 'ranking';  // 当前视图模式
  colorRules?: Array<{
    id: string;
    name: string;
    color: string;
    conditions: Array<{
      id: string;
      field: string;
      operator: string;
      value: number;
    }>;
    matchAll: boolean;
  }>;
  yearRanges?: Array<{
    id: string;
    name: string;
    min: number;
    max: number;
  }>;
  rankingRanges?: Array<{
    id: string;
    name: string;
    min: number;
    max: number;
  }>;
  rankingMetric?: 'major' | 'minor';
  priceRanges?: Array<{
    id: string;
    name: string;
    min: number;
    max: number;
  }>;
  salesRanges?: Array<{
    id: string;
    name: string;
    min: number;
    max: number;
  }>;
  brandRanges?: Array<{
    id: string;
    name: string;
    brands: string[];
  }>;
}

export interface KeywordCollection {
  id: string;
  keyword: string;
  marketplace: string | null;
  product_count: number;
  description: string | null;
  board_config: BoardConfig | null;  // 画板配置
  view_config: ViewConfig | null;  // 视图配置
  created_at: string;
  updated_at: string | null;
  products?: CollectionProduct[];
}

export interface GroupedCollection {
  keyword: string;
  marketplace: string | null;
  total_snapshots: number;
  total_products: number;
  first_snapshot: string;
  latest_snapshot: string;
  snapshots: KeywordCollection[];
}

interface KeywordCollectionsListResponse {
  total: number;
  collections: KeywordCollection[];
}

interface GroupedCollectionsResponse {
  total_keywords: number;
  total_collections: number;
  groups: GroupedCollection[];
}

async function getKeywordCollections(params?: {
  keyword?: string;
  marketplace?: string;
  limit?: number;
  offset?: number;
}): Promise<KeywordCollectionsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.keyword) searchParams.set('keyword', params.keyword);
  if (params?.marketplace) searchParams.set('marketplace', params.marketplace);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  
  const query = searchParams.toString();
  const result = await request<KeywordCollectionsListResponse>(`/keyword-collections${query ? `?${query}` : ''}`);
  return result.data;
}

async function getKeywordCollectionsGrouped(): Promise<GroupedCollectionsResponse> {
  const result = await request<GroupedCollectionsResponse>('/keyword-collections/grouped');
  return result.data;
}

async function getKeywordCollectionDetail(collectionId: string): Promise<KeywordCollection> {
  const result = await request<KeywordCollection>(`/keyword-collections/${collectionId}`);
  return result.data;
}

async function deleteKeywordCollection(collectionId: string): Promise<{ message: string }> {
  const result = await request<{ message: string }>(`/keyword-collections/${collectionId}`, {
    method: 'DELETE',
  });
  return result.data;
}

async function updateKeywordCollectionDescription(
  collectionId: string, 
  description: string
): Promise<KeywordCollection> {
  const result = await request<KeywordCollection>(`/keyword-collections/${collectionId}`, {
    method: 'PUT',
    body: JSON.stringify({ description }),
  });
  return result.data;
}

// ============== 产品管理 API（产品画板功能） ==============

async function updateCollectionProduct(
  collectionId: string,
  productId: string,
  data: UpdateProductParams
): Promise<CollectionProduct> {
  const result = await request<CollectionProduct>(
    `/keyword-collections/${collectionId}/products/${productId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
  return result.data;
}

async function deleteCollectionProduct(
  collectionId: string,
  productId: string
): Promise<{ success: boolean; message: string }> {
  const result = await request<{ success: boolean; message: string }>(
    `/keyword-collections/${collectionId}/products/${productId}`,
    { method: 'DELETE' }
  );
  return result.data;
}

async function batchUpdateCollectionProducts(
  collectionId: string,
  products: BatchUpdateProductItem[]
): Promise<{
  success: boolean;
  message: string;
  updated_count: number;
  not_found_count: number;
  not_found_asins: string[];
}> {
  const result = await request<{
    success: boolean;
    message: string;
    updated_count: number;
    not_found_count: number;
    not_found_asins: string[];
  }>(
    `/keyword-collections/${collectionId}/products/batch-update`,
    {
      method: 'POST',
      body: JSON.stringify({ products }),
    }
  );
  return result.data;
}

async function saveBoardConfig(
  collectionId: string,
  boards: Array<{ id: string; name: string }>,
  productBoards: Record<string, string>
): Promise<{ success: boolean; message: string; board_count: number }> {
  const result = await request<{ success: boolean; message: string; board_count: number }>(
    `/keyword-collections/${collectionId}/board-config`,
    {
      method: 'PUT',
      body: JSON.stringify({ 
        boards, 
        productBoards
      }),
    }
  );
  return result.data;
}

async function saveViewConfig(
  collectionId: string,
  viewConfig: ViewConfig
): Promise<{ success: boolean; message: string }> {
  const result = await request<{ success: boolean; message: string }>(
    `/keyword-collections/${collectionId}/view-config`,
    {
      method: 'PUT',
      body: JSON.stringify(viewConfig),
    }
  );
  return result.data;
}

// ============== Rufus 调研 API ==============

export interface RufusSessionSummary {
  session_id: string;
  page_type: string;
  asin: string | null;
  keyword: string | null;
  product_title: string | null;
  product_image: string | null;
  marketplace: string;
  conversation_count: number;
  has_summary: boolean;
  first_message_at: string;
  last_message_at: string;
}

export interface RufusSessionGroup {
  page_type: string;
  sessions: RufusSessionSummary[];
  total: number;
}

export interface RufusSessionListResponse {
  success: boolean;
  groups: RufusSessionGroup[];
  total_sessions: number;
}

export interface RufusConversationDetail {
  id: string;
  asin: string | null;
  marketplace: string;
  question: string;
  answer: string;
  question_type: string;
  question_index: number;
  conversation_id: string | null;
  created_at: string;
  user_id: string | null;
  page_type: string;
  keyword: string | null;
  product_title: string | null;
  bullet_points: string[] | null;
  product_image: string | null;
  session_id: string | null;
  ai_summary: string | null;
}

export interface RufusSessionDetailResponse {
  success: boolean;
  session_id: string;
  page_type: string;
  asin: string | null;
  keyword: string | null;
  product_title: string | null;
  product_image: string | null;
  marketplace: string;
  conversations: RufusConversationDetail[];
  ai_summary: string | null;
}

export interface RufusSummaryResponse {
  success: boolean;
  session_id: string;
  summary: string | null;
  message: string;
}

/**
 * 获取 Rufus 会话列表（按页面类型分组）
 */
export async function getRufusSessions(pageType?: string): Promise<RufusSessionListResponse> {
  const params = new URLSearchParams();
  if (pageType) {
    params.set('page_type', pageType);
  }
  const query = params.toString();
  const url = `${API_BASE}/rufus/sessions${query ? `?${query}` : ''}`;
  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 获取 Rufus 会话详情
 */
export async function getRufusSessionDetail(sessionId: string): Promise<RufusSessionDetailResponse> {
  const url = `${API_BASE}/rufus/session/${sessionId}`;
  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 生成 Rufus 会话 AI 总结
 */
export async function generateRufusSummary(
  sessionId: string, 
  forceRegenerate = false
): Promise<RufusSummaryResponse> {
  const url = `${API_BASE}/rufus/session/${sessionId}/summary`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ force_regenerate: forceRegenerate }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 删除 Rufus 会话
 */
export async function deleteRufusSession(sessionId: string): Promise<{ success: boolean; message: string; deleted_count: number }> {
  const url = `${API_BASE}/rufus/session/${sessionId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 更新 Rufus 会话元信息
 */
export async function updateRufusSession(
  sessionId: string,
  data: {
    product_title?: string;
    keyword?: string;
    product_image?: string;
  }
): Promise<RufusSessionDetailResponse> {
  const url = `${API_BASE}/rufus/session/${sessionId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 更新单个 Rufus 对话
 */
export async function updateRufusConversation(
  conversationId: string,
  data: {
    question?: string;
    answer?: string;
    question_type?: string;
  }
): Promise<RufusConversationDetail> {
  const url = `${API_BASE}/rufus/conversation/${conversationId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 删除单个 Rufus 对话
 */
export async function deleteRufusConversation(conversationId: string): Promise<{ success: boolean; message: string }> {
  const url = `${API_BASE}/rufus/conversation/${conversationId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}


// ============== 分享链接 API ==============

/**
 * 分享资源类型
 */
export type ShareResourceType = 'review_reader' | 'report' | 'analysis_project' | 'rufus_session' | 'keyword_collection';

/**
 * 分享链接信息
 */
export interface ShareLink {
  id: string;
  token: string;
  resource_type: ShareResourceType;
  resource_id: string | null;
  asin: string | null;
  title: string | null;
  expires_at: string | null;
  view_count: number;
  is_active: boolean;
  created_at: string | null;
  share_url: string;
}

/**
 * 创建分享链接参数
 */
export interface CreateShareLinkParams {
  resource_type: ShareResourceType;
  resource_id?: string;
  asin?: string;
  title?: string;
  expires_in_days?: number;
}

/**
 * 分享资源数据响应
 */
export interface SharedResourceData {
  success: boolean;
  resource_type: ShareResourceType;
  title: string | null;
  view_count: number;
  data: {
    product?: any;
    reviews?: any[];
    stats?: any;
    report?: any;
    project?: any;
    items?: any[];
    session?: any;
    conversations?: any[];
  };
}

/**
 * 创建分享链接
 * 
 * @param params 分享参数
 * @returns 创建的分享链接信息
 */
export async function createShareLink(params: CreateShareLinkParams): Promise<{
  success: boolean;
  share_link: ShareLink;
  share_url: string;
}> {
  const url = `${API_BASE}/share`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
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
 * 获取分享资源数据（公开 API，无需认证）
 * 
 * @param token 分享令牌
 * @param skipIncrement 是否跳过访问次数增加（用于刷新页面等场景）
 * @returns 分享资源数据
 */
export async function getSharedResource(token: string, skipIncrement: boolean = false): Promise<SharedResourceData> {
  const url = `${API_BASE}/share/${token}/data${skipIncrement ? '?skip_increment=true' : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
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
 * 获取分享链接元信息（公开 API，无需认证）
 * 
 * @param token 分享令牌
 * @returns 分享链接元信息
 */
export async function getShareMeta(token: string): Promise<{
  success: boolean;
  meta: {
    token: string;
    resource_type: ShareResourceType;
    title: string | null;
    is_valid: boolean;
    is_expired: boolean;
    expires_at: string | null;
    view_count: number;
    created_at: string | null;
  };
}> {
  const url = `${API_BASE}/share/${token}/meta`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
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
 * 获取我的分享链接列表
 * 
 * @param resourceType 可选，筛选特定资源类型
 * @param includeExpired 是否包含已过期/已撤销的链接
 * @returns 分享链接列表
 */
export async function getMyShareLinks(
  resourceType?: ShareResourceType,
  includeExpired = false
): Promise<{
  success: boolean;
  share_links: ShareLink[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (resourceType) {
    params.append('resource_type', resourceType);
  }
  if (includeExpired) {
    params.append('include_expired', 'true');
  }
  
  const url = `${API_BASE}/share/my?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.json();
}

/**
 * 撤销分享链接
 * 
 * @param token 分享令牌
 * @returns 操作结果
 */
export async function revokeShareLink(token: string): Promise<{
  success: boolean;
  message: string;
}> {
  const url = `${API_BASE}/share/${token}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
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

export default apiService;

