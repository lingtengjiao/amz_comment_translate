/**
 * 板块数据缓存 Hook
 * 用于缓存各个板块的数据，避免切换时重复加载
 */
import { useState, useEffect, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  loading: boolean;
}

const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 全局缓存存储
const cacheStore = new Map<string, CacheEntry<any>>();

export function useSectionCache<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  options?: {
    ttl?: number; // 缓存过期时间（毫秒）
    enabled?: boolean; // 是否启用缓存
  }
) {
  const ttl = options?.ttl ?? CACHE_TTL;
  const enabled = options?.enabled ?? true;
  
  const [data, setData] = useState<T | null>(() => {
    // 初始化时从缓存读取
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  });
  
  const [loading, setLoading] = useState(() => {
    // 如果有缓存且未过期，初始不加载
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return false;
    }
    return true;
  });
  
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = async (force = false) => {
    // 防止重复请求
    if (fetchingRef.current) return;
    
    // 如果启用缓存且未过期，且不是强制刷新，则使用缓存
    if (enabled && !force) {
      const cached = cacheStore.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ttl) {
        setData(cached.data);
        setLoading(false);
        return;
      }
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      
      // 更新缓存
      if (enabled) {
        cacheStore.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          loading: false,
        });
      }
      
      setData(result);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '加载失败';
      setError(errorMsg);
      console.error(`[useSectionCache] ${cacheKey} 加载失败:`, err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  // 清除缓存
  const clearCache = () => {
    cacheStore.delete(cacheKey);
    setData(null);
  };

  // 初始化加载
  useEffect(() => {
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      // 有有效缓存，直接使用
      setData(cached.data);
      setLoading(false);
    } else {
      // 无缓存或已过期，重新加载
      fetchData();
    }
  }, [cacheKey]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(true), // 强制刷新
    clearCache,
  };
}

// 清除所有缓存
export function clearAllSectionCache() {
  cacheStore.clear();
}
