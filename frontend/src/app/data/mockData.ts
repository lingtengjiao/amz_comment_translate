/**
 * 前端数据类型定义
 * 从 API 类型模块重新导出以保持向后兼容
 */

// 重新导出类型
export type { 
  TaskStatus, 
  Sentiment,
  ReviewInsight, 
  Review, 
  Task,
  FilterRating,
  FilterSentiment,
  SortOption,
} from '@/api/types';

// 保留空的 mockTasks 以兼容旧代码
import type { Task } from '@/api/types';
export const mockTasks: Task[] = [];
