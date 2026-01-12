import { useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { UnifiedProductCard } from './UnifiedProductCard';
import { TaskListHeader } from './TaskListHeader';
import { DimensionSetupDialog } from './DimensionSetupDialog';
import { AnalysisProjectCard } from './AnalysisProjectCard';
import { apiService } from '@/api';
import type { ApiProduct, AnalysisProject } from '@/api/types';
import { toast } from 'sonner';
import { GitCompare } from 'lucide-react';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-6xl mb-4">📦</div>
      <h3 className="text-gray-900 mb-2">暂无任务</h3>
      <p className="text-gray-500">您还没有创建任何翻译任务</p>
      <p className="text-gray-400 text-sm mt-2">使用 Chrome 扩展抓取亚马逊评论后，任务将显示在这里</p>
    </div>
  );
}

// [OPTIMIZED] 骨架屏 - 比简单的"加载中"更好的用户体验
function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 animate-pulse">
      <div className="flex gap-4">
        {/* Image skeleton */}
        <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0" />
        {/* Content skeleton */}
        <div className="flex-1 space-y-3">
          <div className="h-3 bg-gray-200 rounded w-20" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="flex gap-4 mt-auto pt-2">
            <div className="h-4 bg-gray-200 rounded w-12" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-6xl mb-4">❌</div>
      <h3 className="text-gray-900 mb-2">加载失败</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        重试
      </button>
    </div>
  );
}

export function TaskList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 筛选：只显示我的项目
  const [myOnly, setMyOnly] = useState(false);
  
  // 对比分析项目
  const [analysisProjects, setAnalysisProjects] = useState<AnalysisProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  // 维度设置对话框状态
  const [dimensionDialogOpen, setDimensionDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);
  const [checkingDimensions, setCheckingDimensions] = useState(false);

  const fetchTasks = useCallback(async (filterMyOnly = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getProducts(filterMyOnly);
      setProducts(response.products || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError(err instanceof Error ? err.message : '获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalysisProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const response = await apiService.getAnalysisProjects({ limit: 6 });
      setAnalysisProjects(response.projects || []);
    } catch (err) {
      console.error('Failed to fetch analysis projects:', err);
      // 静默失败，不影响主流程
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(myOnly);
    fetchAnalysisProjects();
  }, [fetchTasks, fetchAnalysisProjects, myOnly]);

  // 检查任务进度，只有全部100%才直接进入，否则显示进度弹窗
  const handleViewReviews = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // 如果没有评论，直接进入
    if (product.total_reviews === 0) {
      navigate(`/reader/${product.asin}`);
      return;
    }
    
    setCheckingDimensions(true);
    
    try {
      // 获取产品统计信息，包含任务进度
      const statsResponse = await apiService.getProductStats(product.asin);
      
      const activeTasks = statsResponse.active_tasks;
      const translationProgress = activeTasks?.translation_progress || 0;
      const insightsProgress = activeTasks?.insights_progress || 0;
      const themesProgress = activeTasks?.themes_progress || 0;
      
      // 只有全部100%才直接进入
      const allComplete = translationProgress >= 100 && insightsProgress >= 100 && themesProgress >= 100;
      
      if (allComplete) {
        // 全部完成，直接进入
        navigate(`/reader/${product.asin}`);
      } else {
        // 其他情况都显示进度弹窗（包括满足70%条件的情况）
        // 弹窗内部会根据进度自动判断是否显示"进入查看"按钮
        setSelectedProduct(product);
        setDimensionDialogOpen(true);
      }
    } catch (err) {
      console.error('Failed to check progress:', err);
      // 检查失败时，仍然允许进入（兼容旧数据）
      toast.warning('无法检查数据准备状态，将直接进入');
      navigate(`/reader/${product.asin}`);
    } finally {
      setCheckingDimensions(false);
    }
  }, [navigate, products]);
  
  // 维度生成完成后进入产品详情
  const handleDimensionComplete = useCallback(() => {
    if (selectedProduct) {
      navigate(`/reader/${selectedProduct.asin}`);
    }
  }, [navigate, selectedProduct]);

  return (
    <div className="min-h-screen bg-white transition-colors">
      {/* Header */}
      <TaskListHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* 对比分析项目区域 */}
        {!loadingProjects && analysisProjects.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <GitCompare className="size-5 text-indigo-600" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  对比分析项目
                </h2>
              </div>
              <button
                onClick={() => navigate('/analysis')}
                className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
              >
                查看全部 →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analysisProjects.map(project => (
                <AnalysisProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        )}

        {/* 产品任务区域 */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              产品列表
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMyOnly(false)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !myOnly 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                全部产品
              </button>
              <button
                onClick={() => setMyOnly(true)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  myOnly 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ⭐ 我的项目
              </button>
            </div>
          </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={() => fetchTasks(myOnly)} />
          ) : products.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(product => (
                <UnifiedProductCard
                  key={product.id}
                  product={product}
                  mode="view"
                  onClick={() => handleViewReviews(product.id)}
                  isLoading={checkingDimensions && selectedProduct?.id === product.id}
              />
            ))}
          </div>
        )}
        </section>
      </main>
      
      {/* 维度设置对话框 */}
      {selectedProduct && (
        <DimensionSetupDialog
          open={dimensionDialogOpen}
          onOpenChange={setDimensionDialogOpen}
          asin={selectedProduct.asin}
          productTitle={selectedProduct.title_translated || selectedProduct.title || selectedProduct.asin}
          reviewCount={selectedProduct.total_reviews}
          onComplete={handleDimensionComplete}
        />
      )}
    </div>
  );
}
