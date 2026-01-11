/**
 * 数据准备对话框
 * 显示翻译和AI洞察进度，等待条件满足后允许进入
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { apiService } from '@/api';
import { toast } from 'sonner';

interface DimensionSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asin: string;
  productTitle: string;
  reviewCount: number;
  onComplete: () => void;
}

export function DimensionSetupDialog({
  open,
  onOpenChange,
  asin,
  productTitle,
  reviewCount,
  onComplete,
}: DimensionSetupDialogProps) {
  // 进度状态
  const [translationProgress, setTranslationProgress] = useState(0);
  const [insightsProgress, setInsightsProgress] = useState(0);
  const [themesProgress, setThemesProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 轮询定时器
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 计算 AI 洞察进度（取洞察和主题的最小值）
  const aiInsightProgress = Math.min(insightsProgress, themesProgress);
  
  // 判断是否可以进入（翻译完成 + AI洞察>=70%）
  const canEnter = translationProgress >= 100 && insightsProgress >= 70 && themesProgress >= 70;
  
  // 计算预估剩余时间
  const getEstimatedTime = () => {
    const transProgress = translationProgress || 0;
    const aiProgress = aiInsightProgress || 0;
    
    // 如果翻译未完成
    if (transProgress < 100) {
      const remainingReviews = Math.ceil(reviewCount * (100 - transProgress) / 100);
      const seconds = remainingReviews * 1; // 每条评论约1秒
      return formatTime(seconds);
    }
    
    // 翻译已完成，检查AI洞察
    if (aiProgress === 0) {
      // AI任务还未开始，预估需要较长时间
      const seconds = Math.ceil(reviewCount * 2); // 每条评论约2秒
      return formatTime(seconds);
    } else if (aiProgress < 70) {
      // AI任务进行中但未达标
      const remainingReviews = Math.ceil(reviewCount * (70 - aiProgress) / 100);
      const seconds = remainingReviews * 2;
      return formatTime(seconds);
    } else {
      return '即将完成';
    }
  };
  
  // 格式化时间显示
  const formatTime = (seconds: number) => {
    if (seconds <= 10) return '即将完成';
    if (seconds <= 30) return '约 30 秒';
    if (seconds <= 60) return '约 1 分钟';
    if (seconds <= 120) return '约 1-2 分钟';
    if (seconds <= 180) return '约 2-3 分钟';
    if (seconds <= 300) return '约 3-5 分钟';
    const minutes = Math.ceil(seconds / 60);
    return `约 ${minutes} 分钟`;
  };
  
  // 获取进度数据
  const fetchProgress = useCallback(async () => {
    try {
      const response = await apiService.getProductStats(asin);
      
      if (response.active_tasks) {
        const { translation_progress, insights_progress, themes_progress } = response.active_tasks;
        
        setTranslationProgress(translation_progress || 0);
        setInsightsProgress(insights_progress || 0);
        setThemesProgress(themes_progress || 0);
        
        // 检查是否满足条件（翻译完成 + AI洞察>=70%）
        const ready = (
          (translation_progress || 0) >= 100 &&
          (insights_progress || 0) >= 70 &&
          (themes_progress || 0) >= 70
        );
        
        if (ready) {
          setIsReady(true);
          // 停止轮询
          if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
      setError('获取进度失败，请稍后重试');
    }
  }, [asin]);
  
  // 开始轮询
  useEffect(() => {
    if (open && !isReady) {
      // 立即获取一次
      fetchProgress();
      
      // 每 3 秒轮询一次
      const startPolling = () => {
        pollingRef.current = setTimeout(async () => {
          await fetchProgress();
          if (!isReady) {
            startPolling();
          }
        }, 3000);
      };
      
      startPolling();
      
      return () => {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [open, isReady, fetchProgress]);
  
  // 重置状态当对话框关闭时
  useEffect(() => {
    if (!open) {
      // 关闭时清理轮询
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [open]);
  
  // 进入产品详情
  const handleEnter = () => {
    onOpenChange(false);
    onComplete();
  };
  
  // 获取进度状态文案
  const getStatusText = () => {
    if (translationProgress < 100) {
      return '正在翻译评论数据...';
    } else if (aiInsightProgress < 80) {
      return '正在进行AI洞察分析...';
    } else {
      return '数据准备完成！';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{isReady ? '✅' : '⏳'}</span>
            {isReady ? '准备完成' : '数据准备中'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 line-clamp-2">
            {productTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {error ? (
            // 错误状态
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-3">
                <span className="text-2xl">❌</span>
              </div>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : (
            // 始终显示进度条
            <div className="space-y-6">
              {/* 状态提示 */}
              <div className="text-center mb-2">
                <p className="text-sm text-gray-600">
                  {isReady ? `${reviewCount} 条评论已分析完成` : getStatusText()}
                </p>
              </div>
              
              {/* 翻译进度 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span>📝</span>
                    <span>翻译中</span>
                    {translationProgress >= 100 && <span className="text-green-500">✓</span>}
                  </span>
                  <span className="text-gray-500 font-medium">{Math.round(translationProgress)}%</span>
                </div>
                <Progress value={translationProgress} className="h-2" />
              </div>
              
              {/* AI洞察进度 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span>🔍</span>
                    <span>AI洞察中</span>
                    {aiInsightProgress >= 70 && <span className="text-green-500">✓</span>}
                  </span>
                  <span className="text-gray-500 font-medium">{Math.round(aiInsightProgress)}%</span>
                </div>
                <Progress value={aiInsightProgress} className="h-2" />
              </div>
              
              {/* 提示文案 - 仅在未完成时显示预估时间 */}
              {!isReady && (
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-2">
                  <span>⏱️</span>
                  <span>预计还需 {getEstimatedTime()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            稍后再看
          </Button>
          {isReady && (
            <Button onClick={handleEnter} className="bg-green-600 hover:bg-green-700">
              进入查看 →
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
