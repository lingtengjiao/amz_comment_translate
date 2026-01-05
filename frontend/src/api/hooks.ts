/**
 * API React Hooks 封装
 * 提供便捷的数据获取和状态管理
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import apiService from './service';
import type {
  Task,
  Review,
  ThemeTagsData,
  MediaPageData,
  ApiProductStatsResponse,
  ApiReviewListResponse,
} from './types';
import { transformStatsToTask, transformReviews } from './transforms';

// ============== 通用 Hook 状态类型 ==============

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============== 任务详情 Hook ==============

export function useTaskDetail(taskId: string | undefined): UseApiState<Task> {
  const [data, setData] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!taskId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.getTaskDetail(taskId);
      if (response.code === 200) {
        setData(response.data);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取任务详情失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============== 产品统计 Hook（兼容现有后端） ==============

export function useProductStats(asin: string | undefined): UseApiState<ApiProductStatsResponse> {
  const [data, setData] = useState<ApiProductStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!asin) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.getProductStats(asin);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [asin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============== 评论列表 Hook（兼容现有后端） ==============

interface UseReviewsOptions {
  asin: string | undefined;
  page?: number;
  pageSize?: number;
  rating?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export function useReviews(options: UseReviewsOptions): UseApiState<ApiReviewListResponse> & {
  reviews: Review[];
  total: number;
} {
  const [data, setData] = useState<ApiReviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!options.asin) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.getReviews({
        asin: options.asin,
        page: options.page,
        pageSize: options.pageSize,
        rating: options.rating,
        sentiment: options.sentiment,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取评论列表失败');
    } finally {
      setLoading(false);
    }
  }, [options.asin, options.page, options.pageSize, options.rating, options.sentiment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 转换评论数据
  const reviews = data ? transformReviews(data.reviews) : [];
  const total = data?.total || 0;

  return { data, loading, error, refetch: fetchData, reviews, total };
}

// ============== 完整任务数据 Hook（包含评论） ==============

export function useTaskWithReviews(asin: string | undefined): UseApiState<Task> & {
  task: Task | null;
  stats: ApiProductStatsResponse | null;
} {
  const [task, setTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<ApiProductStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = 1;
  const pageSize = 50;

  const fetchData = useCallback(async () => {
    if (!asin) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 并行获取产品统计和评论
      const [statsResponse, reviewsResponse] = await Promise.all([
        apiService.getProductStats(asin),
        apiService.getReviews({ asin, page, pageSize }),
      ]);
      
      setStats(statsResponse);
      
      const reviews = transformReviews(reviewsResponse.reviews);
      const taskData = transformStatsToTask(statsResponse, reviews);
      
      setTask(taskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [asin, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data: task, 
    loading, 
    error, 
    refetch: fetchData, 
    task, 
    stats 
  };
}

// ============== 翻译进度 Hook ==============

interface UseTranslationProgress {
  isTranslating: boolean;
  progress: number;
  startTranslation: () => Promise<void>;
  stopPolling: () => void;
}

export function useTranslationProgress(asin: string | undefined): UseTranslationProgress {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTranslating(false);
  }, []);

  const startTranslation = useCallback(async () => {
    if (!asin) return;
    
    try {
      await apiService.triggerTranslation(asin);
      setIsTranslating(true);
      setProgress(0);
      
      // 开始轮询进度
      intervalRef.current = window.setInterval(async () => {
        try {
          const stats = await apiService.getProductStats(asin);
          const total = stats.product.total_reviews;
          const translated = stats.product.translated_reviews;
          const currentProgress = total > 0 ? Math.round((translated / total) * 100) : 0;
          
          setProgress(currentProgress);
          
          if (stats.product.translation_status === 'completed' || currentProgress >= 100) {
            stopPolling();
          }
        } catch (err) {
          console.error('Failed to check translation progress:', err);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to start translation:', err);
      throw err;
    }
  }, [asin, stopPolling]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isTranslating,
    progress,
    startTranslation,
    stopPolling,
  };
}

// ============== 主题标签 Hook ==============

export function useThemeTags(taskId: string | undefined): UseApiState<ThemeTagsData> {
  const [data, setData] = useState<ThemeTagsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!taskId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.getThemeTags(taskId);
      if (response.code === 200) {
        setData(response.data);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取主题标签失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============== 媒体内容 Hook ==============

export function useMedia(
  taskId: string | undefined,
  type?: 'image' | 'video'
): UseApiState<MediaPageData> {
  const [data, setData] = useState<MediaPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!taskId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.getMedia({ taskId, type, pageSize: 100 });
      if (response.code === 200) {
        setData(response.data);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取媒体内容失败');
    } finally {
      setLoading(false);
    }
  }, [taskId, type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============== 导出工具 Hook ==============

interface UseExport {
  exportCSV: () => Promise<void>;
  exportXLSX: () => Promise<void>;
  exporting: boolean;
}

export function useExport(asin: string | undefined): UseExport {
  const [exporting, setExporting] = useState(false);

  const exportCSV = useCallback(async () => {
    // CSV export is no longer supported
    throw new Error('CSV export is no longer supported. Please use XLSX export.');
  }, []);

  const exportXLSX = useCallback(async () => {
    if (!asin) return;
    
    setExporting(true);
    try {
      const blob = await apiService.exportReviewsByAsin(asin);
      const filename = `reviews_${asin}_${new Date().toISOString().split('T')[0]}.xlsx`;
      apiService.downloadFile(blob, filename);
    } catch (err) {
      console.error('Export XLSX failed:', err);
      throw err;
    } finally {
      setExporting(false);
    }
  }, [asin]);

  return { exportCSV, exportXLSX, exporting };
}

