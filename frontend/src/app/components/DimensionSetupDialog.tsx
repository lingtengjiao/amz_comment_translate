/**
 * 智能分析框架生成对话框
 * 首次进入产品详情前，需要先生成分析维度
 */
import { useState, useEffect } from 'react';
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
import type { ProductDimension } from '@/api/types';
import { toast } from 'sonner';

interface DimensionSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asin: string;
  productTitle: string;
  reviewCount: number;
  onComplete: () => void;
}

type SetupState = 'intro' | 'generating' | 'completed' | 'error';

export function DimensionSetupDialog({
  open,
  onOpenChange,
  asin,
  productTitle,
  reviewCount,
  onComplete,
}: DimensionSetupDialogProps) {
  const [state, setState] = useState<SetupState>('intro');
  const [progress, setProgress] = useState(0);
  const [dimensions, setDimensions] = useState<ProductDimension[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 重置状态当对话框打开时
  useEffect(() => {
    if (open) {
      setState('intro');
      setProgress(0);
      setDimensions([]);
      setError(null);
    }
  }, [open]);

  // 模拟进度动画
  useEffect(() => {
    if (state === 'generating') {
      const interval = setInterval(() => {
        setProgress((prev) => {
          // 在到达 90% 前逐步增加，等待实际完成
          if (prev < 90) {
            return prev + Math.random() * 10;
          }
          return prev;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [state]);

  const handleGenerate = async () => {
    setState('generating');
    setProgress(5);
    setError(null);

    try {
      const response = await apiService.generateDimensions(asin);
      
      if (response.success) {
        setProgress(100);
        setDimensions(response.dimensions);
        setState('completed');
        toast.success('分析框架生成成功！');
      } else {
        throw new Error(response.message || '生成失败');
      }
    } catch (err) {
      console.error('Failed to generate dimensions:', err);
      const message = err instanceof Error ? err.message : '生成分析框架失败';
      setError(message);
      setState('error');
      toast.error(message);
    }
  };

  const handleEnterProduct = () => {
    onOpenChange(false);
    onComplete();
  };

  const handleRetry = () => {
    setState('intro');
    setProgress(0);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            智能分析框架
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {productTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* 介绍状态 */}
          {state === 'intro' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">📊 首次分析需要建立分析框架</h4>
                <p className="text-sm text-blue-800 mb-3">
                  AI 会从 <span className="font-semibold">{reviewCount}</span> 条评论中学习，自动生成该产品的专属评价维度（如：外观设计、材质手感、性价比等）。
                </p>
                <p className="text-sm text-blue-700">
                  这些维度将用于后续的评论洞察分析，让分析结果更加精准有针对性。
                </p>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>⏱️</span>
                <span>预计耗时：30-60秒</span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  稍后再说
                </Button>
                <Button onClick={handleGenerate} className="bg-blue-600 hover:bg-blue-700">
                  🚀 开始生成
                </Button>
              </div>
            </div>
          )}

          {/* 生成中状态 */}
          {state === 'generating' && (
            <div className="space-y-6 py-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <span className="text-3xl animate-pulse">🤖</span>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">AI 正在分析评论...</h4>
                <p className="text-sm text-gray-500">正在从评论中提炼产品的核心评价维度</p>
              </div>
              
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-gray-400 text-center">
                  {progress < 30 && '正在读取评论样本...'}
                  {progress >= 30 && progress < 60 && '正在分析用户关注点...'}
                  {progress >= 60 && progress < 90 && '正在生成维度定义...'}
                  {progress >= 90 && '即将完成...'}
                </p>
              </div>
            </div>
          )}

          {/* 完成状态 */}
          {state === 'completed' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <span className="text-3xl">✅</span>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">分析框架生成完成！</h4>
                <p className="text-sm text-gray-500">
                  已为该产品生成 <span className="font-semibold text-green-600">{dimensions.length}</span> 个评价维度
                </p>
              </div>

              {/* 显示生成的维度 */}
              <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {dimensions.map((dim, index) => (
                    <div
                      key={dim.id}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-md border border-gray-200"
                    >
                      <span className="text-blue-500 font-medium text-sm">{index + 1}.</span>
                      <span className="text-sm text-gray-700 truncate">{dim.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleEnterProduct} className="bg-green-600 hover:bg-green-700">
                  进入产品分析 →
                </Button>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <span className="text-3xl">❌</span>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">生成失败</h4>
                <p className="text-sm text-red-600">{error}</p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button onClick={handleRetry} className="bg-blue-600 hover:bg-blue-700">
                  重试
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

