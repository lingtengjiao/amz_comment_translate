/**
 * 产品库详情弹窗 - 展示快照中的产品列表，支持多选和分析操作
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Check, 
  Star, 
  MessageSquare, 
  ExternalLink, 
  Loader2, 
  Package,
  BarChart3,
  GitCompare,
  TrendingUp,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import apiService, { type KeywordCollection, type CollectionProduct } from '../../../../api/service';

// 获取扩展ID
function getExtensionId(): string {
  return localStorage.getItem('voc_extension_id') || import.meta.env.VITE_EXTENSION_ID || '';
}

interface CollectionDetailDialogProps {
  open: boolean;
  onClose: () => void;
  collection: KeywordCollection | null;
  onRefresh?: () => void;
}

export function CollectionDetailDialog({ 
  open, 
  onClose, 
  collection,
  onRefresh 
}: CollectionDetailDialogProps) {
  const navigate = useNavigate();
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const products = collection?.products || [];

  // 切换选择
  const toggleSelection = (asin: string) => {
    const newSelected = new Set(selectedAsins);
    if (newSelected.has(asin)) {
      newSelected.delete(asin);
    } else {
      newSelected.add(asin);
    }
    setSelectedAsins(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedAsins.size === products.length) {
      setSelectedAsins(new Set());
    } else {
      setSelectedAsins(new Set(products.map(p => p.asin)));
    }
  };

  // 获取选中的产品
  const selectedProducts = useMemo(() => {
    return products.filter(p => selectedAsins.has(p.asin));
  }, [products, selectedAsins]);

  // 触发AI分析全流程
  const triggerAnalysisFlow = async (asins: string[]) => {
    const extensionId = getExtensionId();
    
    if (!extensionId) {
      toast.error('请先在设置中配置扩展ID，或安装并启用Chrome扩展');
      return false;
    }
    
    if (!window.chrome?.runtime?.sendMessage) {
      toast.error('请使用Chrome浏览器并安装扩展');
      return false;
    }
    
    try {
      // 发送消息到扩展，触发采集和分析流程
      const crawlConfig = {
        stars: [1, 2, 3, 4, 5],  // 采集所有星级
        pagesPerStar: 5,         // 每个星级采集5页
        speedMode: 'fast',       // 快速模式
        mediaType: 'all_formats',
        workflowMode: 'one_step_insight'  // 一步到位模式（采集+翻译+分析）
      };
      
      const result = await new Promise<any>((resolve, reject) => {
        window.chrome!.runtime!.sendMessage(
          extensionId,
          { 
            type: 'BATCH_START_EXTERNAL',
            asins: asins,
            config: crawlConfig
          },
          (response) => {
            if (window.chrome?.runtime?.lastError) {
              reject(window.chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      });
      
      if (result && result.success) {
        return true;
      } else {
        toast.error('启动分析失败：' + (result?.error || '未知错误'));
        return false;
      }
    } catch (error: any) {
      toast.error('与扩展通信失败：' + (error.message || '请确保扩展已安装并启用'));
      return false;
    }
  };

  // 单个洞察分析（1个产品）
  const handleSingleInsight = async () => {
    if (selectedProducts.length === 0) {
      toast.error('请先选择产品');
      return;
    }
    if (selectedProducts.length > 1) {
      toast.error('单个洞察只能选择 1 个产品');
      return;
    }
    
    setIsProcessing(true);
    const asins = selectedProducts.map(p => p.asin);
    
    const success = await triggerAnalysisFlow(asins);
    
    if (success) {
      toast.success(`已启动对 ${asins[0]} 的洞察分析`, {
        description: '扩展正在后台采集和分析数据，请稍后在「我的产品洞察」中查看结果',
        duration: 8000
      });
      onClose();
      navigate('/home/my-projects');
    }
    
    setIsProcessing(false);
  };

  // 批量洞察分析（每个产品单独分析）
  const handleBatchInsight = async () => {
    if (selectedProducts.length === 0) {
      toast.error('请先选择产品');
      return;
    }
    
    setIsProcessing(true);
    const asins = selectedProducts.map(p => p.asin);
    
    toast.info(`正在启动 ${asins.length} 个产品的批量洞察分析...`);
    
    const success = await triggerAnalysisFlow(asins);
    
    if (success) {
      toast.success(`已启动 ${asins.length} 个产品的批量洞察分析`, {
        description: '扩展正在后台采集和分析数据，请稍后在「我的产品洞察」中查看结果',
        duration: 8000
      });
      onClose();
      navigate('/home/my-projects');
    }
    
    setIsProcessing(false);
  };

  // 对比分析（2-5个）
  const handleComparison = async () => {
    if (selectedProducts.length < 2) {
      toast.error('对比分析需要至少选择 2 个产品');
      return;
    }
    if (selectedProducts.length > 5) {
      toast.error('对比分析最多选择 5 个产品');
      return;
    }
    
    toast.info('请先通过插件采集选中产品的评论，然后在「AI 竞品对比」中进行分析');
  };

  // 市场细分（2-10个）
  const handleMarketInsight = async () => {
    if (selectedProducts.length < 2) {
      toast.error('市场细分需要至少选择 2 个产品');
      return;
    }
    if (selectedProducts.length > 10) {
      toast.error('市场细分最多选择 10 个产品');
      return;
    }
    
    toast.info('请先通过插件采集选中产品的评论，然后在「市场洞察」中进行分析');
  };


  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 格式化价格
  const formatPrice = (price: string | number | null) => {
    if (price === null || price === undefined) return '-';
    // 如果已经是字符串格式（如 "$29.99"），直接返回
    if (typeof price === 'string') return price;
    // 如果是数字，格式化为美元
    return `$${price.toFixed(2)}`;
  };

  // 格式化销量
  const formatSales = (volume: number | null, text: string | null) => {
    if (text) return text;
    if (volume === null) return '-';
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M+`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K+`;
    return volume.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-lg">{collection?.keyword}</span>
              {collection?.marketplace && (
                <span className="ml-2 text-xs text-slate-500 font-normal bg-slate-100 px-2 py-0.5 rounded">
                  {collection.marketplace}
                </span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {collection && (
              <span>
                保存于 {formatDate(collection.created_at)} · 共 {products.length} 个产品
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 工具栏 */}
        <div className="flex items-center justify-between py-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
            >
              {selectedAsins.size === products.length ? '取消全选' : '全选'}
            </Button>
            <span className="text-sm text-slate-500">
              已选择 <span className="font-semibold text-purple-600">{selectedAsins.size}</span> 个产品
            </span>
          </div>
          
          {/* 分析操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedAsins.size !== 1 || isProcessing}
              onClick={handleSingleInsight}
              className="gap-1.5"
            >
              <BarChart3 className="w-4 h-4" />
              单个洞察
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedAsins.size === 0 || isProcessing}
              onClick={handleBatchInsight}
              className="gap-1.5"
            >
              <BarChart3 className="w-4 h-4" />
              批量洞察
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedAsins.size < 2 || selectedAsins.size > 5 || isProcessing}
              onClick={handleComparison}
              className="gap-1.5"
            >
              <GitCompare className="w-4 h-4" />
              对比分析
              <span className="text-xs text-slate-400">(2-5)</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedAsins.size < 2 || selectedAsins.size > 10 || isProcessing}
              onClick={handleMarketInsight}
              className="gap-1.5"
            >
              <TrendingUp className="w-4 h-4" />
              市场细分
              <span className="text-xs text-slate-400">(2-10)</span>
            </Button>
          </div>
        </div>

        {/* 产品列表 */}
        <div className="flex-1 overflow-y-auto py-4 -mx-2 px-2">
          {products.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无产品数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {products.map((product, index) => {
                const isChecked = selectedAsins.has(product.asin);
                
                return (
                  <div
                    key={product.id}
                    className={`border rounded-xl overflow-hidden transition-all cursor-pointer ${
                      isChecked 
                        ? 'bg-purple-50 border-purple-300 shadow-md' 
                        : 'hover:border-slate-300 hover:shadow-md border-slate-200 bg-white'
                    }`}
                    onClick={() => toggleSelection(product.asin)}
                  >
                    <div className="p-4">
                      {/* 头部：排名、ASIN、选中状态 */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {product.position && (
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
                              #{product.position}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded">
                            {product.asin}
                          </div>
                          {product.is_sponsored && (
                            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              <Tag className="w-3 h-3" />
                              <span>广告</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <a 
                            href={product.product_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 hover:bg-slate-100 rounded transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 text-slate-400 hover:text-blue-500" />
                          </a>
                          {isChecked && (
                            <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 产品信息 */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-20 h-20 flex-shrink-0 overflow-hidden bg-slate-100 rounded-lg">
                          <ImageWithFallback 
                            src={product.image_url}
                            alt={product.title || 'Product'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
                            {product.title || product.asin}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-xs">
                            {/* 价格 */}
                            {product.price !== null && (
                              <div className="flex items-center gap-1 text-green-600 font-semibold">
                                {formatPrice(product.price)}
                              </div>
                            )}
                            {/* 评分 */}
                            {product.rating !== null && product.rating !== undefined && (
                              <div className="flex items-center gap-1 text-amber-600">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>{Number(product.rating).toFixed(1)}</span>
                              </div>
                            )}
                            {/* 评论数 */}
                            {product.review_count !== null && product.review_count !== undefined && (
                              <div className="flex items-center gap-1 text-slate-500">
                                <MessageSquare className="w-3 h-3" />
                                <span>{Number(product.review_count).toLocaleString()}</span>
                              </div>
                            )}
                            {/* 销量 */}
                            {(product.sales_volume !== null || product.sales_volume_text) && (
                              <div className="flex items-center gap-1 text-blue-600">
                                <ShoppingCart className="w-3 h-3" />
                                <span>{formatSales(product.sales_volume, product.sales_volume_text)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-sm text-slate-500">
            提示：选择产品后可进行洞察分析操作
          </div>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
