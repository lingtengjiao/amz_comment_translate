import { Star, MessageSquare, ArrowRight, Loader2, Check } from 'lucide-react';
import { Card } from './ui/card';
import { memo, useMemo } from 'react';
import type { ApiProduct } from '@/api/types';

interface UnifiedProductCardProps {
  product: ApiProduct;
  // 模式：'view' 表示点击查看详情，'select' 表示选择对比
  mode?: 'view' | 'select';
  // view 模式下的回调
  onClick?: () => void;
  isLoading?: boolean;
  // select 模式下的回调
  isSelected?: boolean;
  onToggle?: (id: string) => void;
}

export const UnifiedProductCard = memo(function UnifiedProductCard({
  product,
  mode = 'view',
  onClick,
  isLoading,
  isSelected = false,
  onToggle,
}: UnifiedProductCardProps) {
  const avgRating = useMemo(() => {
    if (product.average_rating !== undefined && product.average_rating > 0) {
      return product.average_rating.toFixed(1);
    }
    return 'N/A';
  }, [product.average_rating]);

  const displayTitle = product.title_translated || product.title || product.asin;
  const displayImage = product.image_url || '';

  const handleClick = () => {
    if (isLoading) return;
    if (mode === 'view' && onClick) {
      onClick();
    } else if (mode === 'select' && onToggle) {
      onToggle(product.id);
    }
  };

  // 根据模式决定样式
  const cardClassName =
    mode === 'select'
      ? `group relative overflow-hidden bg-white border transition-all duration-300 cursor-pointer ${
          isSelected
            ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-md'
            : 'border-gray-100 hover:border-indigo-300 hover:shadow-lg'
        }`
      : 'group overflow-hidden bg-white border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 cursor-pointer';

  return (
    <Card className={cardClassName} onClick={handleClick}>
      <div className="p-4 relative">
        {/* 选择模式的复选框 */}
        {mode === 'select' && (
          <div
            className={`
              absolute top-4 right-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-all
              ${
                isSelected
                  ? 'bg-indigo-600 border-indigo-600 scale-110'
                  : 'bg-white border-gray-300 group-hover:border-indigo-400'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              if (onToggle) onToggle(product.id);
            }}
          >
            {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </div>
        )}
        
        <div className="flex gap-4">

          {/* Product Image - Square */}
          <div className="relative overflow-hidden rounded-lg bg-gray-100 flex-shrink-0">
            {displayImage ? (
              <img
                src={displayImage}
                alt={displayTitle}
                className="w-24 h-24 object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-24 h-24 flex items-center justify-center text-gray-400 text-xs">
                无图片
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* ASIN */}
            <p className="text-xs text-gray-400 mb-2 font-mono tracking-wider">
              {product.asin}
            </p>

            {/* Title */}
            <h3
              className={`mb-3 line-clamp-2 leading-snug transition-colors ${
                mode === 'select' && isSelected
                  ? 'text-indigo-900 font-semibold'
                  : 'text-gray-900 group-hover:text-blue-600'
              }`}
            >
              {displayTitle}
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
                  <span className="text-sm">{product.total_reviews || 0} 条</span>
                </div>
              </div>

              {/* View Detail Indicator (只在 view 模式显示) */}
              {mode === 'view' && (
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
              )}

              {/* Price (如果有) */}
              {product.price && mode === 'select' && (
                <div className="text-sm font-bold text-gray-900">{product.price}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});

