/**
 * ProductCompareHeader - 对比分析产品头部（吸顶）
 * 
 * 功能：吸顶显示所有对比产品的基本信息
 */
import { memo } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Product {
  id: number;
  asin: string;
  name: string;
  imageUrl?: string;
}

interface ProductCompareHeaderProps {
  products: Product[];
  totalReviews?: number;
}

export const ProductCompareHeader = memo(({ products, totalReviews = 0 }: ProductCompareHeaderProps) => {
  // 定义每个产品的渐变色（支持最多5个产品）
  const productColors = [
    'from-blue-500 to-blue-600',      // #1 蓝色
    'from-purple-500 to-purple-600',  // #2 紫色
    'from-emerald-500 to-emerald-600', // #3 绿色
    'from-orange-500 to-orange-600',  // #4 橙色
    'from-yellow-500 to-yellow-600',  // #5 黄色
  ];

  return (
    <div 
      className="grid gap-4" 
      style={{ gridTemplateColumns: `180px repeat(${products.length}, 1fr)` }}
    >
        {/* 维度标签列头 */}
        <div className="flex flex-col justify-center px-4 py-3 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2.5">
            对比维度
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
              对比 <span className="font-bold text-gray-900 dark:text-gray-100">{products.length}</span> 个产品
            </div>
            {totalReviews > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"></div>
                反馈 <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">{totalReviews.toLocaleString()}</span> 条
              </div>
            )}
          </div>
        </div>
        
        {/* 产品头部 */}
        {products.map((product, idx) => (
          <div 
            key={product.id}
            className="relative group"
          >
            {/* 产品卡片背景 - 带渐变和悬停效果 */}
            <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity rounded-xl blur-xl -z-10"
                 style={{ 
                   backgroundImage: `linear-gradient(135deg, ${
                     idx === 0 ? '#3B82F6' : 
                     idx === 1 ? '#8B5CF6' : 
                     idx === 2 ? '#10B981' : 
                     idx === 3 ? '#F59E0B' : 
                     '#EAB308'
                   }20, ${
                     idx === 0 ? '#3B82F6' : 
                     idx === 1 ? '#8B5CF6' : 
                     idx === 2 ? '#10B981' : 
                     idx === 3 ? '#F59E0B' : 
                     '#EAB308'
                   }10)` 
                 }}>
            </div>
            
            <div className="relative bg-white dark:bg-gray-900 rounded-xl p-3.5 border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300">
              <div className="flex items-center gap-3">
                {/* 产品序号 - 渐变背景 */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${productColors[idx]} flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-900`}>
                  <span className="text-white font-bold text-xs">#{product.id}</span>
                </div>
                
                {/* 产品图片 - 增强边框 */}
                <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow-sm group-hover:scale-105 transition-transform duration-300">
                  {product.imageUrl ? (
                    <ImageWithFallback
                      src={product.imageUrl}
                      alt={`Product ${product.asin}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">
                        {product.asin.slice(-4)}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* ASIN - 优化排版 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                    ASIN
                  </div>
                  <div className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 truncate bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                    {product.asin}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
  );
});

ProductCompareHeader.displayName = 'ProductCompareHeader';

