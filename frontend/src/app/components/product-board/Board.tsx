import { useDrop } from 'react-dnd';
import { Trash2, Edit2, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';
import { Product, ProductCard } from './ProductCard';
import { useState, useMemo } from 'react';

interface BoardProps {
  id: string;
  name: string;
  products: Product[];
  onDrop: (product: Product, boardId: string) => void;
  onDelete: (boardId: string) => void;
  onRename: (boardId: string, newName: string) => void;
  isDefault?: boolean;
  isBatchMode?: boolean;
  selectedProducts?: Set<string>;
  onProductSelect?: (productId: string) => void;
  isReadOnly?: boolean;
  onProductEdit?: (product: Product) => void;
  onProductDelete?: (productId: string) => void;
  getProductColor?: (product: Product) => string | undefined;
  dragHandleRef?: React.RefObject<HTMLDivElement>;
}

type SortOption = 'default' | 'sales' | 'rating' | 'price';
type SortOrder = 'asc' | 'desc';

export function Board({
  id,
  name,
  products,
  onDrop,
  onDelete,
  onRename,
  isDefault = false,
  isBatchMode = false,
  selectedProducts = new Set(),
  onProductSelect,
  isReadOnly = false,
  onProductEdit,
  onProductDelete,
  getProductColor,
  dragHandleRef,
}: BoardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'PRODUCT',
    drop: (item: Product) => onDrop(item, id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  const handleRename = () => {
    setIsEditing(true);
    setEditName(name);
  };

  const handleSaveRename = () => {
    if (editName.trim() && editName.trim() !== name) {
      onRename(id, editName.trim());
    } else {
      setEditName(name);
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setEditName(name);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const sortedProducts = useMemo(() => {
    if (sortBy === 'default') {
      return products;
    }
    return [...products].sort((a, b) => {
      let compareValue = 0;
      
      if (sortBy === 'sales') {
        compareValue = sortOrder === 'asc' 
          ? a.salesCount - b.salesCount 
          : b.salesCount - a.salesCount;
      } else if (sortBy === 'rating') {
        compareValue = sortOrder === 'asc' 
          ? a.rating - b.rating 
          : b.rating - a.rating;
      } else if (sortBy === 'price') {
        const priceA = parseFloat(a.price.replace(/[^0-9.]/g, ''));
        const priceB = parseFloat(b.price.replace(/[^0-9.]/g, ''));
        compareValue = sortOrder === 'asc' 
          ? priceA - priceB 
          : priceB - priceA;
      }
      
      return compareValue;
    });
  }, [products, sortBy, sortOrder]);

  // 计算指标数据
  const metrics = useMemo(() => {
    const productCount = products.length;
    const totalSales = products.reduce((sum, p) => sum + p.salesCount, 0);
    const avgPrice = productCount > 0
      ? products.reduce((sum, p) => sum + parseFloat(p.price.replace(/[^0-9.]/g, '')), 0) / productCount
      : 0;
    const avgRating = productCount > 0
      ? products.reduce((sum, p) => sum + p.rating, 0) / productCount
      : 0;

    return {
      productCount,
      totalSales,
      avgPrice,
      avgRating,
    };
  }, [products]);

  // 格式化大数字
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const handleSortChange = (newSortBy: SortOption) => {
    if (newSortBy === sortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  return (
    <div
      className="flex-shrink-0 flex flex-col transition-all"
      style={{ 
        width: isExpanded ? '570px' : '190px',
      }}
    >
      {/* 画板标题栏 - 独立卡片，吸顶 */}
      <div 
        ref={dragHandleRef}
        className="sticky z-30 flex-shrink-0 cursor-grab active:cursor-grabbing" 
        style={{ 
          top: '0px',
          backgroundColor: '#F5F6FA',
          paddingBottom: '8px',
        }}
      >
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="flex items-center justify-between p-3 pb-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isEditing ? (
                <div className="flex items-center gap-1.5 w-full">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onBlur={handleCancelRename}
                    className="text-sm font-semibold text-gray-900 border-b-2 px-1 focus:outline-none flex-1 min-w-0"
                    style={{ borderColor: '#FF1B82' }}
                    autoFocus
                  />
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSaveRename();
                      }}
                      className="p-0.5 rounded hover:bg-green-100 transition-colors"
                      title="保存"
                    >
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </button>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCancelRename();
                      }}
                      className="p-0.5 rounded hover:bg-red-100 transition-colors"
                      title="取消"
                    >
                      <X className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-gray-900 truncate">{name}</h2>
                  <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full flex-shrink-0">
                    {products.length}
                  </span>
                </>
              )}
            </div>
            {!isEditing && (
              <div className="flex gap-1 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  title={isExpanded ? "折叠" : "展开"}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {isExpanded ? (
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      onClick={handleRename}
                      className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                      title="重命名"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => onDelete(id)}
                        className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                        title="删除画板"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#FF1B82' }} />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* 排序控件 */}
          <div className="px-3 pb-3 pt-0 flex gap-1.5 flex-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleSortChange('default')}
              className={`text-xs px-2.5 py-1 rounded-full transition-all ${
                sortBy === 'default'
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
              style={sortBy === 'default' ? { backgroundColor: '#FF1B82' } : {}}
            >
              默认
            </button>
            <button
              onClick={() => handleSortChange('sales')}
              className={`text-xs px-2.5 py-1 rounded-full transition-all flex items-center gap-1 ${
                sortBy === 'sales'
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
              style={sortBy === 'sales' ? { backgroundColor: '#FF1B82' } : {}}
            >
              销量
              {sortBy === 'sales' && (
                <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
            <button
              onClick={() => handleSortChange('rating')}
              className={`text-xs px-2.5 py-1 rounded-full transition-all flex items-center gap-1 ${
                sortBy === 'rating'
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
              style={sortBy === 'rating' ? { backgroundColor: '#FF1B82' } : {}}
            >
              评分
              {sortBy === 'rating' && (
                <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
            <button
              onClick={() => handleSortChange('price')}
              className={`text-xs px-2.5 py-1 rounded-full transition-all flex items-center gap-1 ${
                sortBy === 'price'
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
              style={sortBy === 'price' ? { backgroundColor: '#FF1B82' } : {}}
            >
              价格
              {sortBy === 'price' && (
                <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          </div>
          
          {/* 指标卡 */}
          <div className="px-3 pb-3">
            <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl p-2.5 border border-pink-100">
              <div className="grid grid-cols-2 gap-2">
                {/* 产品数量 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-1.5">
                  <div className="text-[10px] text-gray-500 mb-0.5 leading-tight">产品数量</div>
                  <div className="text-base font-bold leading-none" style={{ color: '#FF1B82' }}>
                    {metrics.productCount}
                  </div>
                </div>
                
                {/* 总销量 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-1.5">
                  <div className="text-[10px] text-gray-500 mb-0.5 leading-tight">总销量</div>
                  <div className="text-base font-bold text-gray-900 leading-none truncate">
                    {formatNumber(metrics.totalSales)}
                  </div>
                </div>
                
                {/* 平均客单价 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-1.5">
                  <div className="text-[10px] text-gray-500 mb-0.5 leading-tight">平均客单价</div>
                  <div className="text-base font-bold text-gray-900 leading-none truncate">
                    ${metrics.avgPrice.toFixed(0)}
                  </div>
                </div>
                
                {/* 平均评分 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-1.5">
                  <div className="text-[10px] text-gray-500 mb-0.5 leading-tight">平均评分</div>
                  <div className="text-base font-bold text-amber-500 flex items-center gap-0.5 leading-none">
                    {metrics.avgRating.toFixed(1)}
                    <span className="text-[10px]">★</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 产品列表 - 独立卡片，高度自动 */}
      <div
        ref={drop}
        className={`bg-white rounded-2xl shadow-sm transition-all overflow-hidden ${
          isOver ? 'shadow-lg' : ''
        }`}
        style={{ 
          ...(isOver ? { boxShadow: '0 0 0 2px #FF1B82' } : {})
        }}
      >
        <div className="p-3">
          <div className={`grid gap-2.5 ${isExpanded ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {sortedProducts.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                isBatchMode={isBatchMode}
                isSelected={selectedProducts.has(product.id)}
                onSelect={onProductSelect}
                isReadOnly={isReadOnly}
                onEdit={onProductEdit}
                onDelete={onProductDelete}
                getColor={getProductColor}
              />
            ))}
          </div>
          {products.length === 0 && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-center px-4 text-sm">
              <p>拖拽产品到此画板</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
