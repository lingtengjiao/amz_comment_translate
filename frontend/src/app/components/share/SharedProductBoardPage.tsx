/**
 * SharedProductBoardPage - 产品画板（市场格局分析）只读版本
 * 
 * 1:1 复原原始 ProductBoardSection 的 UI，仅支持查看和排序，不支持编辑操作。
 */
import { useMemo, useState } from 'react';
import { 
  Package, 
  Star, 
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  DollarSign,
  TrendingUp,
  Calendar,
  Tag,
  Trophy,
  ArrowUpDown
} from 'lucide-react';

// 视图模式类型
type ViewMode = 'custom' | 'price' | 'sales' | 'year' | 'brand' | 'ranking';

// 画板排序类型
type BoardSortOption = 'custom' | 'name-asc' | 'name-desc' | 'count-asc' | 'count-desc' | 'avgPrice-asc' | 'avgPrice-desc';

// 默认价格段配置
const defaultPriceRanges = [
  { id: 'price-0-10', name: '$0-10', min: 0, max: 10 },
  { id: 'price-10-20', name: '$10-20', min: 10, max: 20 },
  { id: 'price-20-30', name: '$20-30', min: 20, max: 30 },
  { id: 'price-30-50', name: '$30-50', min: 30, max: 50 },
  { id: 'price-50-plus', name: '$50+', min: 50, max: Infinity },
];

// 默认销量段配置
const defaultSalesRanges = [
  { id: 'sales-0-1000', name: '<1000', min: 0, max: 1000 },
  { id: 'sales-1000-5000', name: '1000-5000', min: 1000, max: 5000 },
  { id: 'sales-5000-10000', name: '5000-10000', min: 5000, max: 10000 },
  { id: 'sales-10000-plus', name: '>10000', min: 10000, max: Infinity },
];

// 默认排名段配置
const defaultRankingRanges = [
  { id: 'rank-1-100', name: '1～100', min: 1, max: 100 },
  { id: 'rank-100-500', name: '100～500', min: 100, max: 500 },
  { id: 'rank-500-1000', name: '500～1000', min: 500, max: 1000 },
  { id: 'rank-1000-5000', name: '1000～5000', min: 1000, max: 5000 },
  { id: 'rank-5000-plus', name: '5000+', min: 5000, max: Infinity },
];

// 产品数据类型
interface ProductData {
  id: string;
  product_id: string | null;
  asin: string;
  title: string | null;
  image_url: string | null;
  price: number | null;
  average_rating: number | null;
  review_count: number | null;
  marketplace: string | null;
  brand: string | null;
  year?: number | null;
  sales_volume?: number | null;
  sales_volume_manual?: number | null;
  major_category_rank?: number | null;
  minor_category_rank?: number | null;
  major_category_name?: string | null;
  minor_category_name?: string | null;
}

interface SharedProductBoardPageProps {
  data: {
    collection?: {
      id: string;
      keyword: string;
      marketplace: string | null;
      description: string | null;
      product_count: number;
      created_at: string | null;
      board_config: any;
      view_config: any;
    };
    products?: ProductData[];
  };
  title: string | null;
}

// ==================== 产品卡片组件 ====================
interface ProductCardProps {
  product: ProductData;
  marketplace?: string | null;
}

function SharedProductCard({ product, marketplace }: ProductCardProps) {
  const amazonUrl = marketplace 
    ? `https://www.amazon.${marketplace.toLowerCase()}/dp/${product.asin}`
    : `https://www.amazon.com/dp/${product.asin}`;

  const priceStr = product.price ? `$${product.price.toFixed(2)}` : '';

  return (
    <div className="bg-white rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all select-none relative overflow-hidden">
      {/* 产品图片 */}
      <div className="relative mb-1.5 mx-auto group max-w-[140px]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title || product.asin}
            className="w-full aspect-square object-cover rounded-md bg-gray-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/140?text=No+Image';
            }}
          />
        ) : (
          <div className="w-full aspect-square bg-gray-100 rounded-md flex items-center justify-center">
            <Package className="w-12 h-12 text-gray-300" />
          </div>
        )}
        
        {/* 右上角：链接按钮 */}
        <a
          href={amazonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm hover:bg-white transition-all opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3 text-gray-600" />
        </a>
      </div>

      {/* ASIN */}
      <div className="text-[10px] text-gray-400 mb-1">ASIN: {product.asin}</div>

      {/* 价格 */}
      {priceStr && (
        <div className="text-base font-bold mb-1.5" style={{ color: '#FF1B82' }}>
          {priceStr}
        </div>
      )}

      {/* 评分和评论数 */}
      <div className="flex items-center gap-1.5 mb-1">
        {product.average_rating && (
          <div className="flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs text-gray-700">{product.average_rating.toFixed(1)}</span>
          </div>
        )}
        {product.review_count !== null && product.review_count !== undefined && (
          <span className="text-[10px] text-gray-400">
            ({product.review_count.toLocaleString()})
          </span>
        )}
      </div>

      {/* 销量 */}
      <div className="space-y-0.5 mb-1.5">
        {/* 优先显示第三方预估销量（如果有） */}
        {product.sales_volume_manual && product.sales_volume_manual > 0 ? (
          <>
            <div className="text-[10px] text-gray-700 font-medium">
              第三方预估销量: {product.sales_volume_manual.toLocaleString()}
            </div>
            {/* 同时显示亚马逊预估销量 */}
            {product.sales_volume && product.sales_volume > 0 && (
              <div className="text-[10px] text-gray-500">
                亚马逊预估销量: {product.sales_volume.toLocaleString()}
              </div>
            )}
          </>
        ) : (
          /* 没有第三方预估销量时，显示亚马逊预估销量 */
          product.sales_volume && product.sales_volume > 0 && (
            <div className="text-[10px] text-gray-500">
              亚马逊预估销量: {product.sales_volume.toLocaleString()}
            </div>
          )
        )}
      </div>

      {/* 额外信息：年份、品牌、排名 */}
      <div className="flex flex-wrap gap-1">
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
        {product.major_category_rank && product.major_category_rank > 0 && (
          <span 
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-200" 
            title={product.major_category_name ? `大类：${product.major_category_name}` : '大类BSR'}
          >
            大类#{product.major_category_rank}
          </span>
        )}
        
        {/* 小类排名 */}
        {product.minor_category_rank && product.minor_category_rank > 0 && (
          <span 
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 border border-orange-200" 
            title={product.minor_category_name ? `小类：${product.minor_category_name}` : '小类BSR'}
          >
            小类#{product.minor_category_rank}
          </span>
        )}
      </div>
    </div>
  );
}

// ==================== 品牌画板组件 ====================
type SortOption = 'default' | 'sales' | 'rating' | 'price';
type SortOrder = 'asc' | 'desc';

interface BrandBoardProps {
  name: string;
  products: ProductData[];
  marketplace?: string | null;
}

function SharedBrandBoard({ name, products, marketplace }: BrandBoardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 排序产品
  const sortedProducts = useMemo(() => {
    if (sortBy === 'default') {
      return products;
    }
    return [...products].sort((a, b) => {
      let compareValue = 0;
      
      if (sortBy === 'sales') {
        const salesA = a.sales_volume_manual || a.sales_volume || 0;
        const salesB = b.sales_volume_manual || b.sales_volume || 0;
        compareValue = sortOrder === 'asc' ? salesA - salesB : salesB - salesA;
      } else if (sortBy === 'rating') {
        const ratingA = a.average_rating || 0;
        const ratingB = b.average_rating || 0;
        compareValue = sortOrder === 'asc' ? ratingA - ratingB : ratingB - ratingA;
      } else if (sortBy === 'price') {
        const priceA = a.price || 0;
        const priceB = b.price || 0;
        compareValue = sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
      }
      
      return compareValue;
    });
  }, [products, sortBy, sortOrder]);

  // 计算指标数据
  const metrics = useMemo(() => {
    const productCount = products.length;
    const totalSales = products.reduce((sum, p) => sum + (p.sales_volume_manual || p.sales_volume || 0), 0);
    const avgPrice = productCount > 0
      ? products.reduce((sum, p) => sum + (p.price || 0), 0) / productCount
      : 0;
    const validRatingProducts = products.filter(p => p.average_rating && p.average_rating > 0);
    const avgRating = validRatingProducts.length > 0
      ? validRatingProducts.reduce((sum, p) => sum + (p.average_rating || 0), 0) / validRatingProducts.length
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
      {/* 画板标题栏 */}
      <div className="flex-shrink-0 mb-2">
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="flex items-center justify-between p-3 pb-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900 truncate">{name}</h2>
              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full flex-shrink-0">
                {products.length}
              </span>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                title={isExpanded ? "折叠" : "展开"}
              >
                {isExpanded ? (
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                )}
              </button>
            </div>
          </div>
          
          {/* 排序控件 */}
          <div className="px-3 pb-3 pt-0 flex gap-1.5 flex-wrap">
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

      {/* 产品列表 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-3">
          <div className={`grid gap-2.5 ${isExpanded ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {sortedProducts.map((product) => (
              <SharedProductCard 
                key={product.id} 
                product={product}
                marketplace={marketplace}
              />
            ))}
          </div>
          {products.length === 0 && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-center px-4 text-sm">
              <p>暂无产品</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 主组件 ====================
export function SharedProductBoardPage({ data, title }: SharedProductBoardPageProps) {
  const { collection, products = [] } = data;
  
  // 视图模式状态 - 默认使用品牌视图，因为自定义配置可能不完整
  const [viewMode, setViewMode] = useState<ViewMode>('brand');
  const [boardSortBy, setBoardSortBy] = useState<BoardSortOption>('custom');
  
  // 从 board_config 中获取自定义画板配置
  const customBoards = useMemo(() => {
    const boardConfig = collection?.board_config;
    if (!boardConfig?.boards || !boardConfig?.productBoards) {
      // 没有自定义配置，使用默认画板（所有产品）
      return [{ id: 'default', name: '默认画板', products: products }];
    }
    
    const boards = boardConfig.boards as Array<{ id: string; name: string }>;
    const productBoards = boardConfig.productBoards as Record<string, string>;
    
    // 尝试匹配产品到画板
    const result = boards.map(board => ({
      id: board.id,
      name: board.name,
      products: products.filter(p => productBoards[p.id] === board.id)
    })).filter(b => b.products.length > 0);
    
    // 如果没有匹配到任何产品，回退到默认画板
    if (result.length === 0) {
      return [{ id: 'default', name: '默认画板', products: products }];
    }
    
    return result;
  }, [collection?.board_config, products]);

  // 检查数据可用性
  const hasBrandData = products.some((p) => p.brand && p.brand.trim() !== '');
  const hasYearData = products.some((p) => p.year && p.year > 0);
  const hasSalesData = products.some((p) => (p.sales_volume_manual || p.sales_volume || 0) > 0);
  const hasRankingData = products.some((p) => {
    const hasMajorRank = p.major_category_rank && p.major_category_rank > 0;
    const hasMinorRank = p.minor_category_rank && p.minor_category_rank > 0;
    return hasMajorRank || hasMinorRank;
  });

  // 按品牌分组
  const productsByBrand = useMemo(() => {
    const grouped: Record<string, ProductData[]> = {};
    products.forEach(product => {
      const brand = product.brand || '其他品牌';
      if (!grouped[brand]) {
        grouped[brand] = [];
      }
      grouped[brand].push(product);
    });
    // 按品牌产品数量排序，"其他品牌"放最后
    return Object.entries(grouped)
      .sort((a, b) => {
        if (a[0] === '其他品牌') return 1;
        if (b[0] === '其他品牌') return -1;
        return b[1].length - a[1].length;
      });
  }, [products]);

  // 按价格分组
  const productsByPrice = useMemo(() => {
    return defaultPriceRanges.map(range => ({
      name: range.name,
      products: products.filter(p => {
        const price = p.price || 0;
        return price >= range.min && price < range.max;
      })
    })).filter(g => g.products.length > 0);
  }, [products]);

  // 按销量分组
  const productsBySales = useMemo(() => {
    return defaultSalesRanges.map(range => ({
      name: range.name,
      products: products.filter(p => {
        const sales = p.sales_volume_manual || p.sales_volume || 0;
        return sales >= range.min && sales < range.max;
      })
    })).filter(g => g.products.length > 0);
  }, [products]);

  // 按年份分组
  const productsByYear = useMemo(() => {
    const grouped: Record<string, ProductData[]> = {};
    products.forEach(product => {
      if (product.year && product.year > 0) {
        const yearKey = `${product.year}年`;
        if (!grouped[yearKey]) {
          grouped[yearKey] = [];
        }
        grouped[yearKey].push(product);
      }
    });
    return Object.entries(grouped)
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [products]);

  // 按排名分组
  const productsByRanking = useMemo(() => {
    return defaultRankingRanges.map(range => ({
      name: range.name,
      products: products.filter(p => {
        const rank = p.major_category_rank || p.minor_category_rank || 0;
        if (rank <= 0) return false;
        return rank >= range.min && rank < range.max;
      })
    })).filter(g => g.products.length > 0);
  }, [products]);

  // 获取当前视图的画板数据
  const currentBoards = useMemo(() => {
    switch (viewMode) {
      case 'custom':
        return customBoards.map(b => ({ name: b.name, products: b.products }));
      case 'price':
        return productsByPrice.map(g => ({ name: g.name, products: g.products }));
      case 'sales':
        return productsBySales.map(g => ({ name: g.name, products: g.products }));
      case 'year':
        return productsByYear.map(([name, prods]) => ({ name, products: prods }));
      case 'ranking':
        return productsByRanking.map(g => ({ name: g.name, products: g.products }));
      case 'brand':
      default:
        return productsByBrand.map(([name, prods]) => ({ name, products: prods }));
    }
  }, [viewMode, customBoards, productsByBrand, productsByPrice, productsBySales, productsByYear, productsByRanking]);

  // 画板排序
  const sortedBoards = useMemo(() => {
    if (boardSortBy === 'custom') {
      return currentBoards;
    }

    return [...currentBoards].sort((a, b) => {
      if (boardSortBy === 'name-asc') {
        return a.name.localeCompare(b.name, 'zh-CN');
      } else if (boardSortBy === 'name-desc') {
        return b.name.localeCompare(a.name, 'zh-CN');
      } else if (boardSortBy === 'count-asc') {
        return a.products.length - b.products.length;
      } else if (boardSortBy === 'count-desc') {
        return b.products.length - a.products.length;
      } else if (boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc') {
        const avgPriceA = a.products.length > 0
          ? a.products.reduce((sum, p) => sum + (p.price || 0), 0) / a.products.length
          : 0;
        const avgPriceB = b.products.length > 0
          ? b.products.reduce((sum, p) => sum + (p.price || 0), 0) / b.products.length
          : 0;
        return boardSortBy === 'avgPrice-asc' 
          ? avgPriceA - avgPriceB 
          : avgPriceB - avgPriceA;
      }
      return 0;
    });
  }, [currentBoards, boardSortBy]);

  if (!collection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">产品画板不存在或已被删除</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F5F6FA' }}>
      {/* 顶部工具栏 */}
      <div className="bg-white shadow-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">
                {collection.keyword}
              </span>
              {collection.marketplace && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-500">
                  {collection.marketplace}
                </span>
              )}
            </div>
          </div>
          
          {/* 视图模式切换器 */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex border-2 border-gray-200 rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('custom')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                  viewMode === 'custom' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={viewMode === 'custom' ? { backgroundColor: '#FF1B82' } : {}}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                自定义
              </button>
              <button
                onClick={() => setViewMode('price')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                  viewMode === 'price' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={viewMode === 'price' ? { backgroundColor: '#FF1B82' } : {}}
              >
                <DollarSign className="w-3.5 h-3.5" />
                价格
              </button>
              {hasSalesData && (
                <button
                  onClick={() => setViewMode('sales')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'sales' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'sales' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  销量
                </button>
              )}
              {hasYearData && (
                <button
                  onClick={() => setViewMode('year')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'year' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'year' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  年份
                </button>
              )}
              {hasBrandData && (
                <button
                  onClick={() => setViewMode('brand')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'brand' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'brand' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <Tag className="w-3.5 h-3.5" />
                  品牌
                </button>
              )}
              {hasRankingData && (
                <button
                  onClick={() => setViewMode('ranking')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'ranking' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'ranking' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  排名
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 画板排序控件 */}
      <div className="px-6 py-3 flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ArrowUpDown className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 font-medium whitespace-nowrap">画板排序：</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setBoardSortBy('custom')}
            className={`text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
              boardSortBy === 'custom' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
            }`}
            style={boardSortBy === 'custom' ? { backgroundColor: '#FF1B82' } : {}}
          >
            默认顺序
          </button>
          <button
            onClick={() => setBoardSortBy(boardSortBy === 'name-asc' ? 'name-desc' : 'name-asc')}
            className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
              boardSortBy === 'name-asc' || boardSortBy === 'name-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
            }`}
            style={boardSortBy === 'name-asc' || boardSortBy === 'name-desc' ? { backgroundColor: '#FF1B82' } : {}}
          >
            名称
            {(boardSortBy === 'name-asc' || boardSortBy === 'name-desc') && (
              <span className="text-[10px]">{boardSortBy === 'name-asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <button
            onClick={() => setBoardSortBy(boardSortBy === 'count-asc' ? 'count-desc' : 'count-asc')}
            className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
              boardSortBy === 'count-asc' || boardSortBy === 'count-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
            }`}
            style={boardSortBy === 'count-asc' || boardSortBy === 'count-desc' ? { backgroundColor: '#FF1B82' } : {}}
          >
            产品数量
            {(boardSortBy === 'count-asc' || boardSortBy === 'count-desc') && (
              <span className="text-[10px]">{boardSortBy === 'count-asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <button
            onClick={() => setBoardSortBy(boardSortBy === 'avgPrice-asc' ? 'avgPrice-desc' : 'avgPrice-asc')}
            className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
              boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
            }`}
            style={boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc' ? { backgroundColor: '#FF1B82' } : {}}
          >
            平均价格
            {(boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc') && (
              <span className="text-[10px]">{boardSortBy === 'avgPrice-asc' ? '↑' : '↓'}</span>
            )}
          </button>
        </div>
      </div>

      {/* 画板容器 - 横向滚动 */}
      <div className="flex-1 px-6">
        <div className="overflow-x-auto">
          <div className="flex gap-4 items-start pb-4">
            {sortedBoards.map((board) => (
              <SharedBrandBoard
                key={board.name}
                name={board.name}
                products={board.products}
                marketplace={collection.marketplace}
              />
            ))}
          </div>
        </div>

        {products.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">暂无产品数据</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SharedProductBoardPage;
