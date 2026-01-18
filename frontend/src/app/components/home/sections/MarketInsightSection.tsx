/**
 * 市场洞察页面 - 专门用于市场洞察分析
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TrendingUp, Package, Clock, ArrowRight, Trash2, Loader2, Plus } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { AnalysisModal, AnalysisType } from '../../AnalysisModal';
import { ProductSelectDialog } from '../dialogs/ProductSelectDialog';
import { useHome } from '../HomeContext';
import apiService from '../../../../api/service';

interface AnalysisProjectItem {
  id: string;
  product_id: string;
  role_label?: string;
  product?: {
    id: string;
    asin: string;
    title: string;
    image_url?: string;
  };
}

interface AnalysisProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
  analysis_type?: string;
  items: AnalysisProjectItem[];
}

export function MarketInsightSection() {
  const navigate = useNavigate();
  const { setShowProductSelectDialog, setCompareProducts } = useHome();
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [loading, setLoading] = useState(true);

  // 分析弹窗状态
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // 加载市场洞察项目列表（只显示 market_insight 类型的项目）
  useEffect(() => {
    loadProjects();
  }, []);

  // 打开产品选择弹窗
  const handleOpenProductSelect = () => {
    setCompareProducts([]);  // 清空之前的选择
    setShowProductSelectDialog(true);
  };

  // [NEW] 检查中状态
  const [, setCheckingStatus] = useState(false);
  const [, setIncompleteProducts] = useState<any[]>([]);

  // 产品选择确认回调
  const handleProductSelectConfirm = async (asins: string[], projects: any[]) => {
    if (asins.length < 2) {
      toast.error('至少需要选择 2 个产品');
      return;
    }
    if (asins.length > 10) {
      toast.error('市场洞察最多支持 10 个产品');
      return;
    }
    
    // 从 projects 中获取 product_id
    const productIds = projects.map(p => p.product_id || p.id);
    
    // [NEW] 检查产品分析状态
    setCheckingStatus(true);
    try {
      const statusResult = await apiService.checkProductsAnalysisStatus(productIds);
      
      if (!statusResult.all_ready) {
        // 有产品未完成分析
        const incompleteList = statusResult.products.filter(p => !p.is_ready);
        setIncompleteProducts(incompleteList);
        
        toast.error('部分产品尚未完成分析', {
          description: `${incompleteList.length} 个产品需要先完成单产品分析才能创建市场洞察`,
          duration: 5000
        });
        return;
      }
      
      // 全部产品已完成分析，可以继续
      setSelectedProductIds(productIds);
      setIncompleteProducts([]);
      setShowAnalysisModal(true);
      
    } catch (error) {
      console.error('检查产品分析状态失败:', error);
      toast.error('检查产品状态失败，请重试');
    } finally {
      setCheckingStatus(false);
    }
  };

  // 创建市场洞察项目（固定使用 market_insight 类型）
  const handleCreateAnalysis = async (title: string, description?: string, _analysisType?: AnalysisType) => {
    try {
      // 强制使用 market_insight 类型
      const productsList = selectedProductIds.map((productId, index) => ({
        product_id: productId,
        role_label: index === 0 ? 'target' : 'competitor',
      }));

      const result = await apiService.createAnalysisProject({
        title,
        description,
        products: productsList,
        auto_run: true,
        analysis_type: 'market_insight', // 固定为市场洞察
      });

      if (result.success && result.project) {
        const projectId = result.project.id;
        toast.success('市场洞察已启动', {
          description: '分析预计需要 1-2 分钟，点击查看进度',
          duration: 8000,
          action: {
            label: '查看进度',
            onClick: () => navigate(`/analysis/${projectId}`),
          },
        });
        
        setShowAnalysisModal(false);
        setSelectedProductIds([]);
        setCompareProducts([]);
        
        // 刷新项目列表
        loadProjects();
      } else {
        throw new Error(result.error || '创建失败');
      }
    } catch (error) {
      console.error('创建市场洞察项目失败:', error);
      toast.error(error instanceof Error ? error.message : '创建市场洞察项目失败');
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      // 只获取当前用户创建的市场洞察项目
      const response = await apiService.getAnalysisProjects({ my_only: true });
      // 只显示市场洞察类型的项目
      const marketInsightProjects = (response.projects || []).filter(
        (p: AnalysisProject) => p.analysis_type === 'market_insight'
      );
      setProjects(marketInsightProjects);
    } catch (err: any) {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除项目
  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个市场洞察项目吗？')) return;
    
    try {
      await apiService.deleteAnalysisProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      toast.success('已删除');
    } catch (err: any) {
      toast.error('删除失败');
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200">已完成</Badge>;
      case 'processing':
        return <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200">分析中</Badge>;
      case 'failed':
        return <Badge className="bg-red-50 text-red-700 border-red-200">失败</Badge>;
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200">待处理</Badge>;
    }
  };

  return (
    <div>
      {/* 标题 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-5 pt-6">
        <div className="flex items-center justify-between mb-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              市场洞察分析
            </h3>
            <p className="text-sm text-slate-600">聚合多产品数据，分析市场共性、趋势和机会</p>
          </div>
          <Button 
            onClick={handleOpenProductSelect}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建市场洞察
          </Button>
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* 空状态 */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20">
          <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">还没有创建任何市场洞察项目</p>
          <p className="text-sm text-slate-400 mb-6">选择 2-10 个产品，聚合分析市场共性、趋势和机会</p>
          <Button 
            onClick={handleOpenProductSelect}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
          >
            创建第一个市场洞察项目
          </Button>
        </div>
      )}

      {/* 项目列表 */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card 
              key={project.id}
              className="border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group bg-white"
              onClick={() => navigate(`/analysis/${project.id}`)}
            >
              <CardContent className="p-5">
                {/* 头部：标题和状态 */}
                <div className="flex items-start justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 flex-1 text-base line-clamp-1">
                    {project.title}
                  </h4>
                  {getStatusBadge(project.status)}
                </div>

                {/* 产品信息 */}
                <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    {project.items?.length || 0} 款产品
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatTime(project.created_at)}
                  </span>
                </div>

                {/* 产品头像 */}
                <div className="flex -space-x-2 mb-4">
                  {project.items?.slice(0, 5).map((item) => (
                    <div 
                      key={item.id}
                      className="w-10 h-10 rounded-lg border-2 border-white shadow-sm overflow-hidden bg-slate-100"
                    >
                      <ImageWithFallback
                        src={item.product?.image_url || ''}
                        alt={item.product?.title || 'Product'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {(project.items?.length || 0) > 5 && (
                    <div className="w-10 h-10 rounded-lg border-2 border-white shadow-sm bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                      +{(project.items?.length || 0) - 5}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/analysis/${project.id}`);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    查看洞察
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(project.id, e)}
                    className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 使用通用产品选择弹窗 */}
      <ProductSelectDialog onConfirm={handleProductSelectConfirm} />

      {/* 分析项目创建弹窗 - 默认选择市场洞察类型 */}
      <AnalysisModal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        onSubmit={handleCreateAnalysis}
        count={selectedProductIds.length}
        defaultAnalysisType="market_insight"
      />
    </div>
  );
}
