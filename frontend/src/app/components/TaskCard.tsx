import { Star, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { Card } from './ui/card';
import type { Task } from '../data/mockData';
import { memo, useMemo } from 'react';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isLoading?: boolean;
}

export const TaskCard = memo(function TaskCard({ task, onClick, isLoading }: TaskCardProps) {
  // Calculate average rating
  const avgRating = useMemo(() => {
    if (task.reviews.length === 0) return '4.5';
    return (task.reviews.reduce((acc, review) => acc + review.rating, 0) / task.reviews.length).toFixed(1);
  }, [task.reviews]);

  const handleClick = () => {
    // 如果正在加载，不响应点击
    if (isLoading) return;
    onClick();
  };

  return (
    <Card 
      className="group overflow-hidden bg-white border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={handleClick}
    >
      <div className="p-4">
        <div className="flex gap-4">
          {/* Product Image - Square */}
          <div className="relative overflow-hidden rounded-lg bg-gray-100 flex-shrink-0">
            <img
              src={task.imageUrl}
              alt={task.title}
              className="w-24 h-24 object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* ASIN */}
            <p className="text-xs text-gray-400 mb-2 font-mono tracking-wider">
              {task.asin}
            </p>

            {/* Title */}
            <h3 className="text-gray-900 mb-3 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
              {task.title}
            </h3>

            {/* Bottom Section - Rating and Reviews */}
            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-3">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  <Star className="size-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm text-gray-900 font-medium">{avgRating}</span>
                </div>
                {/* Reviews Count */}
                <div className="flex items-center gap-1 text-gray-500">
                  <MessageSquare className="size-4" />
                  <span className="text-sm">{task.reviewCount} 条</span>
                </div>
              </div>
              
              {/* View Detail Indicator */}
              <div className="flex items-center gap-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                {isLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>检查中...</span>
                  </>
                ) : (
                  <>
                    <span>查看</span>
                    <ArrowRight className="size-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});