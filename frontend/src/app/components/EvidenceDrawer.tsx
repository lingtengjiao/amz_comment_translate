/**
 * EvidenceDrawer - 证据溯源抽屉组件
 * 
 * 用于展示报告中某个观点的原始评论证据
 * 支持：
 * 1. 显示证据样本列表
 * 2. 跳转查看完整评论
 * 3. 显示评论评分和日期
 */
import { memo } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Star,
  Calendar,
  ExternalLink,
  MessageSquare,
  Quote,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Button } from './ui/button';
import type { EvidenceSample } from '@/api/types';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  totalCount: number;
  evidence: EvidenceSample[];
  sourceType: 'context' | 'insight';
  sourceCategory?: string;  // e.g., "who", "weakness"
  asin?: string;  // 用于跳转到评论列表
}

// 评分星星组件
const RatingStars = memo(function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-3 ${
            star <= rating
              ? 'fill-yellow-400 text-yellow-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700'
          }`}
        />
      ))}
    </div>
  );
});

// 情感标签
const SentimentBadge = memo(function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    positive: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: '正面' },
    negative: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '负面' },
    neutral: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-400', label: '中性' }
  };
  const c = config[sentiment] || config.neutral;
  
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
});

export const EvidenceDrawer = memo(function EvidenceDrawer({
  isOpen,
  onClose,
  title,
  totalCount,
  evidence,
  sourceType,
  sourceCategory,
  asin
}: EvidenceDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col animate-slide-in-right">
        {/* 头部 */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Quote className="size-5 text-emerald-500" />
                {title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                共 {totalCount} 条相关反馈，展示 {evidence.length} 条证据样本
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="size-5 text-gray-500" />
            </button>
          </div>
        </div>
        
        {/* 证据列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {evidence.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <AlertCircle className="size-12 mb-4" />
              <p>暂无证据样本</p>
            </div>
          ) : (
            <div className="space-y-4">
              {evidence.map((item, index) => (
                <div
                  key={item.review_id || index}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  {/* 头部信息 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {item.rating && <RatingStars rating={item.rating} />}
                      {item.sentiment && <SentimentBadge sentiment={item.sentiment} />}
                    </div>
                    {item.date && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Calendar className="size-3" />
                        {item.date}
                      </span>
                    )}
                  </div>
                  
                  {/* 引用内容 */}
                  <blockquote className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-l-3 border-emerald-500 pl-3 italic">
                    "{item.quote}"
                  </blockquote>
                  
                  {/* AI 分析 */}
                  {item.analysis && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-400">
                      <span className="font-medium">AI 分析: </span>
                      {item.analysis}
                    </div>
                  )}
                  
                  {/* 查看完整评论按钮 */}
                  {asin && item.review_id && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <Link
                        to={`/reader/${asin}?review=${item.review_id}`}
                        className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1"
                      >
                        <MessageSquare className="size-3" />
                        查看完整评论
                        <ChevronRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 底部操作栏 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {asin && totalCount > evidence.length && (
            <Link
              to={`/reader/${asin}?filter=${sourceCategory || ''}`}
              className="block"
            >
              <Button variant="outline" className="w-full gap-2">
                <ExternalLink className="size-4" />
                查看全部 {totalCount} 条相关评论
              </Button>
            </Link>
          )}
          {(!asin || totalCount <= evidence.length) && (
            <Button variant="outline" className="w-full" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
      
      {/* 动画样式 */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
});

export default EvidenceDrawer;

