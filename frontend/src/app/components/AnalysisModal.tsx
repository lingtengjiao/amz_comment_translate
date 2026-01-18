import React, { useState, useEffect } from 'react';
import { X, Loader2, Sparkles, BarChart3, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export type AnalysisType = 'comparison' | 'market_insight';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description?: string, analysisType?: AnalysisType) => Promise<void>;
  count: number;
  defaultAnalysisType?: AnalysisType; // 默认分析类型
}

const analysisTypeOptions = [
  {
    value: 'comparison' as AnalysisType,
    label: '对比分析',
    description: '多产品横向对比，突出差异和竞争定位',
    icon: BarChart3,
    color: 'rose',
  },
  {
    value: 'market_insight' as AnalysisType,
    label: '市场洞察',
    description: '聚合多产品数据，分析市场共性、趋势和机会',
    icon: TrendingUp,
    color: 'blue',
  },
];

export const AnalysisModal: React.FC<AnalysisModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  count,
  defaultAnalysisType = 'comparison',
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [analysisType, setAnalysisType] = useState<AnalysisType>(defaultAnalysisType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 当 modal 打开时，重置为默认类型
  useEffect(() => {
    if (isOpen) {
      setAnalysisType(defaultAnalysisType);
    }
  }, [isOpen, defaultAnalysisType]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(title, description.trim() || undefined, analysisType);
      setTitle('');
      setDescription('');
      setAnalysisType(defaultAnalysisType);
    } catch (error) {
      console.error('提交失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setTitle('');
      setDescription('');
      setAnalysisType(defaultAnalysisType);
      onClose();
    }
  };

  const selectedOption = analysisTypeOptions.find(opt => opt.value === analysisType);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <Sparkles className="h-5 w-5" />
            <span>发起智能分析</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            您已选择 <span className="font-bold text-gray-900">{count}</span> 款产品。
            请选择分析类型和项目名称。
          </p>

          {/* 分析类型选择 */}
          <div className="space-y-2">
            <Label>分析类型</Label>
            <div className="grid grid-cols-2 gap-3">
              {analysisTypeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = analysisType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAnalysisType(option.value)}
                    disabled={isSubmitting}
                    className={`
                      relative flex flex-col items-start p-3 rounded-lg border-2 transition-all
                      ${isSelected 
                        ? option.color === 'rose' 
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20' 
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${
                        isSelected 
                          ? option.color === 'rose' ? 'text-rose-600' : 'text-blue-600'
                          : 'text-gray-400'
                      }`} />
                      <span className={`text-sm font-medium ${
                        isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                      }`}>
                        {option.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 text-left">
                      {option.description}
                    </p>
                    {isSelected && (
                      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                        option.color === 'rose' ? 'bg-rose-500' : 'bg-blue-500'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">项目名称 *</Label>
            <Input
              id="title"
              autoFocus
              placeholder={analysisType === 'market_insight' 
                ? "例如：减压玩具市场洞察分析" 
                : "例如：2024夏季新品竞品对比"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim() && !isSubmitting) {
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">项目描述（可选）</Label>
            <textarea
              id="description"
              className="w-full min-h-[80px] rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              placeholder={analysisType === 'market_insight' 
                ? "描述这个细分市场的分析目的..." 
                : "描述这次对比的目的或背景..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className={analysisType === 'market_insight' 
              ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
              : "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {analysisType === 'market_insight' ? '开始市场洞察' : '开始对比分析'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
