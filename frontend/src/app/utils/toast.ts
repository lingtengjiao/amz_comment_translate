/**
 * 统一的 Toast 通知工具
 * 使用 sonner 库提供一致的通知体验
 */
import { toast as sonnerToast } from 'sonner';

export const toast = {
  /**
   * 成功提示
   */
  success: (message: string, description?: string) => {
    return sonnerToast.success(message, {
      description,
      duration: 3000,
    });
  },

  /**
   * 错误提示
   */
  error: (message: string, description?: string) => {
    return sonnerToast.error(message, {
      description,
      duration: 4000,
    });
  },

  /**
   * 信息提示
   */
  info: (message: string, description?: string) => {
    return sonnerToast.info(message, {
      description,
      duration: 3000,
    });
  },

  /**
   * 警告提示
   */
  warning: (message: string, description?: string) => {
    return sonnerToast.warning(message, {
      description,
      duration: 3000,
    });
  },

  /**
   * 加载提示（返回一个函数用于关闭）
   */
  loading: (message: string) => {
    return sonnerToast.loading(message);
  },

  /**
   * Promise 提示（自动处理成功/失败状态）
   */
  promise: <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    });
  },
};

