import React from 'react';
import { Star, MessageSquare, Check } from 'lucide-react';
import type { ApiProduct } from '@/api/types';

interface ProductCardProps {
  product: ApiProduct;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, isSelected, onToggle }) => {
  const handleClick = () => {
    onToggle(product.id);
  };

  const displayTitle = product.title_translated || product.title || product.asin;
  const displayImage = product.image_url || '';

  return (
    <div
      onClick={handleClick}
      className={`
        group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ease-in-out
        hover:shadow-lg
        ${
          isSelected
            ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-md'
            : 'border-gray-200 bg-white hover:border-indigo-300'
        }
      `}
    >
      {/* 自定义复选框 UI */}
      <div
        className={`
        absolute top-4 right-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-all
        ${
          isSelected
            ? 'bg-indigo-600 border-indigo-600 scale-110'
            : 'bg-white border-gray-300 group-hover:border-indigo-400'
        }
      `}
      >
        {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </div>

      <div className="flex gap-4">
        {/* 产品图片 */}
        <div className="h-24 w-24 flex-shrink-0 rounded-lg bg-gray-100 overflow-hidden">
          {displayImage ? (
            <img
              src={displayImage}
              alt={displayTitle}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              无图片
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between py-1">
          <div>
            <h3
              className={`font-semibold leading-tight line-clamp-2 ${
                isSelected ? 'text-indigo-900' : 'text-gray-900'
              }`}
            >
              {displayTitle}
            </h3>
            <p className="mt-1 text-xs text-gray-500">ASIN: {product.asin}</p>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1 text-sm font-medium text-amber-500">
              <Star className="h-4 w-4 fill-current" />
              <span>{product.average_rating?.toFixed(1) || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{product.total_reviews?.toLocaleString() || 0}</span>
            </div>
            {product.price && (
              <div className="text-sm font-bold text-gray-900">{product.price}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

