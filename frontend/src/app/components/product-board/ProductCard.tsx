import { useState } from 'react';
import { useDrag } from 'react-dnd';
import { ExternalLink, Star, Edit2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';

export interface Product {
  id: string;
  asin: string;
  title: string;
  imageUrl: string;
  productUrl: string;
  price: string;
  rating: number;
  reviewCount: number;
  salesCount: number;  // 初步估算销量
  salesVolumeManual?: number;  // 补充数据的销售量（月销量）
  year: number;
  brand: string;
  majorCategoryRank?: number;  // 大类BSR
  minorCategoryRank?: number;  // 小类BSR
  majorCategoryName?: string;  // 大类目
  minorCategoryName?: string;  // 小类目
}

interface ProductCardProps {
  product: Product;
  isBatchMode?: boolean;
  isSelected?: boolean;
  onSelect?: (productId: string) => void;
  isReadOnly?: boolean;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
  backgroundColor?: string;
  getColor?: (product: Product) => string | undefined;
}

export function ProductCard({ 
  product, 
  isBatchMode = false, 
  isSelected = false, 
  onSelect, 
  isReadOnly = false, 
  onEdit, 
  onDelete, 
  backgroundColor, 
  getColor 
}: ProductCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'PRODUCT',
    item: product,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
    canDrag: !isBatchMode && !isReadOnly,
  }));

  const handleCardClick = () => {
    if (isBatchMode && onSelect) {
      onSelect(product.id);
    }
  };

  // 获取产品背景色，优先使用getColor函数
  const productColor = getColor ? getColor(product) : backgroundColor;

  return (
    <div
      ref={!isBatchMode && !isReadOnly ? drag : null}
      className={`bg-white rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all cursor-move select-none relative overflow-hidden ${
        isDragging ? 'opacity-50' : ''
      } ${isBatchMode ? 'cursor-default' : ''} ${isReadOnly ? 'cursor-default' : ''}`}
    >
      {/* 颜色透视背景层 */}
      {productColor && (
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none" 
          style={{ backgroundColor: productColor }}
        />
      )}

      {/* 批量模式复选框 */}
      {isBatchMode && onSelect && (
        <div className="mb-1.5 flex justify-center relative z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(product.id)}
            className="w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: '#FF1B82' }}
          />
        </div>
      )}

      {/* 产品图片 */}
      <div className="relative mb-1.5 mx-auto group max-w-[140px] z-10">
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-full aspect-square object-cover rounded-md bg-gray-100"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/140?text=No+Image';
          }}
        />
        
        {/* 右上角：链接按钮 */}
        <a
          href={product.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm hover:bg-white transition-all opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3 text-gray-600" />
        </a>
        
        {/* 左上角：编辑和删除按钮 */}
        {!isBatchMode && (onEdit || onDelete) && (
          <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm hover:bg-white transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(product);
                }}
                title="编辑"
              >
                <Edit2 className="w-3 h-3 text-gray-600" />
              </button>
            )}
            {onDelete && (
              <button
                className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm hover:bg-white transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                title="删除"
              >
                <Trash2 className="w-3 h-3" style={{ color: '#FF1B82' }} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ASIN */}
      <div className="text-[10px] text-gray-400 mb-1 relative z-10">ASIN: {product.asin}</div>

      {/* 价格 */}
      <div className="text-base font-bold mb-1.5 relative z-10" style={{ color: '#FF1B82' }}>
        {product.price}
      </div>

      {/* 评分和评论数 */}
      <div className="flex items-center gap-1.5 mb-1 relative z-10">
        <div className="flex items-center gap-0.5">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          <span className="text-xs text-gray-700">{product.rating.toFixed(1)}</span>
        </div>
        <span className="text-[10px] text-gray-400">
          ({product.reviewCount.toLocaleString()})
        </span>
      </div>

      {/* 销量 */}
      <div className="space-y-0.5 relative z-10 mb-1.5">
        {/* 优先显示第三方预估销量（如果有） */}
        {product.salesVolumeManual && product.salesVolumeManual > 0 ? (
          <>
            <div className="text-[10px] text-gray-700 font-medium">
              第三方预估销量: {product.salesVolumeManual.toLocaleString()}
            </div>
            {/* 同时显示亚马逊预估销量 */}
            {product.salesCount > 0 && (
              <div className="text-[10px] text-gray-500">
                亚马逊预估销量: {product.salesCount.toLocaleString()}
              </div>
            )}
          </>
        ) : (
          /* 没有第三方预估销量时，显示亚马逊预估销量 */
          product.salesCount > 0 && (
            <div className="text-[10px] text-gray-500">
              亚马逊预估销量: {product.salesCount.toLocaleString()}
            </div>
          )
        )}
      </div>

      {/* 额外信息：年份、品牌、排名 */}
      <div className="flex flex-wrap gap-1 relative z-10">
        {/* 上架年份 */}
        {product.year && product.year > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
            {product.year}年
          </span>
        )}
        
        {/* 品牌 */}
        {product.brand && product.brand.trim() !== '' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
            {product.brand}
          </span>
        )}
        
        {/* 大类排名 */}
        {product.majorCategoryRank && product.majorCategoryRank > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-200" title={product.majorCategoryName ? `大类：${product.majorCategoryName}` : '大类BSR'}>
            大类#{product.majorCategoryRank}
          </span>
        )}
        
        {/* 小类排名 */}
        {product.minorCategoryRank && product.minorCategoryRank > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 border border-orange-200" title={product.minorCategoryName ? `小类：${product.minorCategoryName}` : '小类BSR'}>
            小类#{product.minorCategoryRank}
          </span>
        )}
      </div>
      
      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="删除产品"
          message="确定要删除这个产品吗？删除后无法恢复。"
          confirmText="删除"
          cancelText="取消"
          confirmVariant="destructive"
          onConfirm={() => {
            if (onDelete) {
              onDelete(product.id);
            }
            setShowDeleteConfirm(false);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
