/**
 * 洞察广场页面 - 使用真实 API
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Star, Plus, Check, Loader2, Copy } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { useHome } from '../HomeContext';
import apiService from '../../../../api/service';
import type { ApiProduct } from '../../../../api/types';

export function ProductCenterSection() {
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery } = useHome();
  
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [myAsins, setMyAsins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addingAsin, setAddingAsin] = useState<string | null>(null);

  // 加载产品列表
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // 获取所有产品
      const productsRes = await apiService.getProducts(false);
      setProducts(productsRes.products || []);
      
      // 获取我的项目，用于判断哪些已添加
      const myProjectsRes = await apiService.getMyProjects(false);
      const asins = new Set((myProjectsRes.projects || []).map(p => p.asin));
      setMyAsins(asins);
    } catch (err: any) {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 复制 ASIN
  const handleCopyAsin = (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(asin);
    toast.success('ASIN 已复制');
  };

  // 添加到我的洞察
  const handleAddToMy = async (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingAsin(asin);
    try {
      await apiService.addToMyProjects(asin);
      setMyAsins(prev => new Set([...prev, asin]));
      toast.success('已添加到我的洞察');
    } catch (err: any) {
      toast.error('添加失败');
    } finally {
      setAddingAsin(null);
    }
  };

  // 检查产品是否满足展示条件：翻译>=90%，洞察>80%，主题>80%
  const isProductReady = (product: ApiProduct) => {
    const totalReviews = product.total_reviews || 0;
    const translatedReviews = product.translated_reviews || 0;
    const reviewsWithInsights = product.reviews_with_insights || 0;
    const reviewsWithThemes = product.reviews_with_themes || 0;
    
    if (totalReviews === 0) return false;
    
    const translationPercent = (translatedReviews / totalReviews) * 100;
    const insightsPercent = translatedReviews > 0 ? (reviewsWithInsights / translatedReviews) * 100 : 0;
    const themesPercent = translatedReviews > 0 ? (reviewsWithThemes / translatedReviews) * 100 : 0;
    
    return translationPercent >= 90 && insightsPercent > 80 && themesPercent > 80;
  };

  // 过滤产品：满足条件 + 搜索匹配
  const filteredProducts = products.filter(product => {
    // 先检查是否满足展示条件
    if (!isProductReady(product)) return false;
    
    // 再检查搜索匹配
    const searchLower = searchQuery.toLowerCase();
    return (
      product.asin.toLowerCase().includes(searchLower) ||
      (product.title && product.title.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div>
      {/* 标题 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-2 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">洞察广场</h3>
            <p className="text-sm text-slate-600">精选热门产品，一键添加到我的洞察</p>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索产品名称、ASIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      )}

      {/* 空状态 */}
      {!loading && filteredProducts.length === 0 && (
        <div className="text-center py-20">
          <p className="text-slate-500">
            {searchQuery ? '没有找到匹配的产品' : '暂无产品数据'}
          </p>
        </div>
      )}

      {/* 产品列表 */}
      {!loading && filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const isAdded = myAsins.has(product.asin);
            const isAdding = addingAsin === product.asin;
            
            return (
              <Card 
                key={product.id}
                className="border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group overflow-hidden bg-white"
                onClick={() => navigate(`/reader/${product.asin}`)}
              >
                <CardContent className="p-4">
                  {/* 头部：ASIN 和添加按钮 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium px-2 py-1 bg-slate-50 rounded max-w-[70%]">
                      <span className="truncate">{product.asin}</span>
                      <button
                        onClick={(e) => handleCopyAsin(product.asin, e)}
                        className="flex-shrink-0 p-0.5 hover:bg-slate-200 rounded transition-colors"
                        title="复制 ASIN"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {isAdded ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <Check className="w-3.5 h-3.5" />
                        已添加
                      </div>
                    ) : (
                      <button
                        onClick={(e) => handleAddToMy(product.asin, e)}
                        disabled={isAdding}
                        className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50"
                      >
                        {isAdding ? (
                          <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 text-rose-600" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* 产品图片 */}
                  <div className="mb-3 rounded-lg overflow-hidden bg-slate-50 h-40 flex items-center justify-center">
                    <ImageWithFallback 
                      src={product.image_url || ''}
                      alt={product.title || 'Product'}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>

                  {/* 产品名称 - 固定2行，超出截断 */}
                  <h4 className="font-semibold text-slate-900 mb-2 text-sm leading-tight overflow-hidden" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    lineHeight: '1.25rem',
                    maxHeight: '2.5rem'
                  }}>
                    {product.title || product.asin}
                  </h4>

                  {/* 统计信息 */}
                  <div className="flex items-center gap-2 text-xs mb-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-slate-900">{product.average_rating?.toFixed(1) || '-'}</span>
                    </div>
                    <span className="text-slate-500">({product.total_reviews} 条评论)</span>
                  </div>

                  {/* 价格 */}
                  {product.price && (
                    <div className="text-base font-bold text-rose-600">
                      {product.price}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
