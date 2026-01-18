/**
 * 产品选择对话框 - 通用组件
 * [UPDATED 2026-01-17] 添加产品分析状态显示
 */
import { useState, useEffect } from 'react';
import { Check, Heart, MessageSquare, Package, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { useHome } from '../HomeContext';
import apiService, { ProductAnalysisStatusItem } from '../../../../api/service';

interface UserProject {
  id: string;
  product_id?: string;
  asin: string;
  title: string | null;
  image_url: string | null;
  is_favorite: boolean;
  total_reviews: number;
  created_at: string | null;
}

interface ProductSelectDialogProps {
  /** 确认选择后的回调，返回选中的产品 ASIN 列表和产品详情 */
  onConfirm?: (asins: string[], projects: UserProject[]) => void;
  /** [NEW] 是否为市场洞察模式，显示分析状态 */
  showAnalysisStatus?: boolean;
}

export function ProductSelectDialog({ onConfirm, showAnalysisStatus = true }: ProductSelectDialogProps) {
  const {
    showProductSelectDialog,
    setShowProductSelectDialog,
    productSelectDialogTab,
    setProductSelectDialogTab,
    compareProducts,
    setCompareProducts,
  } = useHome();

  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(false);
  
  // [NEW] 产品分析状态
  const [analysisStatusMap, setAnalysisStatusMap] = useState<Record<string, ProductAnalysisStatusItem>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  // 加载产品列表
  useEffect(() => {
    if (showProductSelectDialog) {
      loadProjects();
    }
  }, [showProductSelectDialog]);
  
  // [NEW] 加载分析状态
  useEffect(() => {
    if (showProductSelectDialog && showAnalysisStatus && projects.length > 0) {
      loadAnalysisStatus();
    }
  }, [showProductSelectDialog, projects, showAnalysisStatus]);
  
  // [NEW] 加载产品分析状态
  const loadAnalysisStatus = async () => {
    const productIds = projects
      .map(p => p.product_id || p.id)
      .filter(id => id);
    
    if (productIds.length === 0) return;
    
    setLoadingStatus(true);
    try {
      const result = await apiService.checkProductsAnalysisStatus(productIds);
      const statusMap: Record<string, ProductAnalysisStatusItem> = {};
      result.products.forEach(item => {
        statusMap[item.product_id] = item;
      });
      setAnalysisStatusMap(statusMap);
    } catch (err) {
      console.error('Failed to load analysis status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      const favoritesOnly = productSelectDialogTab === 'favorites';
      const response = await apiService.getMyProjects(favoritesOnly);
      setProjects(response.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  // 切换标签页时重新加载
  useEffect(() => {
    if (showProductSelectDialog) {
      loadProjects();
    }
  }, [productSelectDialogTab]);

  // 切换选择
  const toggleSelection = (asin: string) => {
    if (compareProducts.includes(asin)) {
      setCompareProducts(compareProducts.filter(id => id !== asin));
    } else if (compareProducts.length < 5) {
      setCompareProducts([...compareProducts, asin]);
    }
  };

  // 确认选择
  const handleConfirm = () => {
    if (onConfirm) {
      // 获取选中的产品详情
      const selectedProjects = projects.filter(p => compareProducts.includes(p.asin));
      onConfirm(compareProducts, selectedProjects);
    }
    setShowProductSelectDialog(false);
  };

  return (
    <Dialog open={showProductSelectDialog} onOpenChange={setShowProductSelectDialog}>
      <DialogContent className="max-w-[95vw] sm:max-w-7xl max-h-[85vh]">
        <DialogHeader className="hidden">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            选择对比产品
          </DialogTitle>
          <DialogDescription>
            从我的洞察中选择2-5个产品进行竞品对比分析
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {/* Tabs */}
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200">
            <button
              onClick={() => setProductSelectDialogTab("all")}
              className={`px-4 py-2.5 text-sm font-medium transition-all relative ${
                productSelectDialogTab === "all"
                  ? "text-rose-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              我的洞察
              {productSelectDialogTab === "all" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600"></div>
              )}
            </button>
            <button
              onClick={() => setProductSelectDialogTab("favorites")}
              className={`px-4 py-2.5 text-sm font-medium transition-all relative ${
                productSelectDialogTab === "favorites"
                  ? "text-rose-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              我的收藏
              {productSelectDialogTab === "favorites" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600"></div>
              )}
            </button>
          </div>

          {/* Selected Count */}
          <div className="mb-4 flex items-center justify-between px-1">
            <div className="text-sm text-slate-600">
              已选择 <span className="font-semibold text-rose-600">{compareProducts.length}</span> 个产品
            </div>
            <div className="text-xs text-slate-500">
              {compareProducts.length < 2 && "至少需要2个产品"}
              {compareProducts.length >= 2 && compareProducts.length < 5 && "可继续选择"}
              {compareProducts.length >= 5 && "已达上限"}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
            </div>
          )}

          {/* Product Grid */}
          {!loading && (
            <div className="max-h-[450px] overflow-y-auto -mx-2 px-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map((project) => {
                  const isChecked = compareProducts.includes(project.asin);
                  const isDisabled = !isChecked && compareProducts.length >= 5;
                  
                  // [NEW] 获取分析状态
                  const productId = project.product_id || project.id;
                  const analysisStatus = analysisStatusMap[productId];
                  const isAnalysisReady = analysisStatus?.is_ready ?? true; // 默认认为已完成（向后兼容）
                  
                  return (
                    <div
                      key={project.id}
                      className={`border rounded-xl overflow-hidden transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-rose-50 border-rose-300 shadow-md' 
                          : isDisabled
                          ? 'opacity-50 cursor-not-allowed border-slate-200'
                          : 'hover:border-slate-300 hover:shadow-md border-slate-200 bg-white'
                      }`}
                      onClick={() => {
                        if (!isDisabled) {
                          toggleSelection(project.asin);
                        }
                      }}
                    >
                      <div className="p-4">
                        {/* Header Row: ASIN, Status and Favorite */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded">
                              {project.asin}
                            </div>
                            {/* [NEW] 分析状态标识 */}
                            {showAnalysisStatus && (
                              loadingStatus ? (
                                <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                </div>
                              ) : analysisStatus ? (
                                isAnalysisReady ? (
                                  <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>已分析</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>未分析</span>
                                  </div>
                                )
                              ) : null
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Heart 
                              className={`w-4 h-4 transition-all ${
                                project.is_favorite 
                                  ? "fill-rose-500 text-rose-500" 
                                  : "text-slate-300"
                              }`}
                            />
                            {isChecked && (
                              <div className="w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Product Info */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-16 h-16 flex-shrink-0 overflow-hidden bg-slate-100 rounded-lg">
                            <ImageWithFallback 
                              src={project.image_url || ''}
                              alt={project.title || 'Product'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
                              {project.title || project.asin}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <MessageSquare className="w-3 h-3" />
                                <span>{project.total_reviews} 条</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Date */}
                        <div className="text-xs text-slate-400">
                          {project.created_at ? new Date(project.created_at).toLocaleDateString('zh-CN') : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Empty State */}
              {projects.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {productSelectDialogTab === "favorites" ? "还没有收藏的产品" : "还没有添加任何产品"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={() => setCompareProducts([])}
            className="flex-1"
            disabled={compareProducts.length === 0}
          >
            清空选择
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
            disabled={compareProducts.length < 2}
          >
            <Check className="w-4 h-4 mr-2" />
            确认选择（{compareProducts.length}/5）
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
