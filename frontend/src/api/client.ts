/**
 * API 客户端 - 简化版（向后兼容）
 * 完整功能请使用 api.service.ts
 */

import apiService from './service';

// 重新导出服务层的兼容接口
export const getProducts = apiService.getProducts;
export const getProductStats = apiService.getProductStats;
export const triggerTranslation = apiService.triggerTranslation;
export const getReviews = apiService.getReviews;
export const exportReviews = apiService.exportReviewsByAsin;
export const getTaskStatus = apiService.getTaskStatus;

// 导出 api 对象以兼容旧代码
export const api = {
  products: {
    list: apiService.getProducts,
    stats: apiService.getProductStats,
    translate: apiService.triggerTranslation,
  },
  reviews: {
    list: apiService.getReviews,
    export: apiService.exportReviewsByAsin,
  },
  tasks: {
    status: apiService.getTaskStatus,
  },
};

export default api;
