import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCompare, X, LayoutGrid, Loader2 } from 'lucide-react';
import { UnifiedProductCard } from './UnifiedProductCard';
import { AnalysisModal } from './AnalysisModal';
import { apiService } from '@/api';
import type { ApiProduct } from '@/api/types';
import { toast } from 'sonner';

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // 调试：监听模态框状态变化
  React.useEffect(() => {
    console.log('模态框状态变化:', isModalOpen);
  }, [isModalOpen]);

  // 获取产品列表
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.getProducts();
      setProducts(response.products || []);
    } catch (error) {
      console.error('获取产品列表失败:', error);
      toast.error('获取产品列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // 处理选中逻辑
  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 处理提交分析
  const handleStartAnalysis = async (title: string, description?: string) => {
    if (selectedIds.length < 2) {
      toast.error('至少需要选择 2 个产品');
      return;
    }

    setIsCreating(true);
    try {
      // 构建产品列表，第一个默认为 target，其余为 competitor
      const productsList = selectedIds.map((id, index) => ({
        product_id: id,
        role_label: index === 0 ? 'target' : 'competitor',
      }));

      const result = await apiService.createAnalysisProject({
        title,
        description,
        products: productsList,
        auto_run: true, // 自动触发分析
      });

      if (result.success && result.project) {
        toast.success('对比分析项目已创建，正在后台分析...');
        setIsModalOpen(false);
        setSelectedIds([]);
        
        // 跳转到项目详情页（会自动轮询直到分析完成）
        navigate(`/analysis/${result.project.id}`);
      } else {
        throw new Error(result.error || '创建失败');
      }
    } catch (error) {
      console.error('创建分析项目失败:', error);
      const errorMessage = error instanceof Error ? error.message : '创建分析项目失败';
      console.error('详细错误信息:', {
        error,
        selectedIds,
        productsList,
      });
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white transition-colors">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-gray-900">对比分析</h1>
              <p className="text-gray-500 mt-1">选择多个产品进行深度对比分析。至少选择 2 个产品。</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              返回产品列表
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Product Grid */}
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-gray-900 mb-2">暂无产品</h3>
            <p className="text-gray-500">您还没有添加任何产品</p>
            <p className="text-gray-400 text-sm mt-2">
              使用 Chrome 扩展抓取亚马逊评论后，产品将显示在这里
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <UnifiedProductCard
                key={product.id}
                product={product}
                mode="select"
                isSelected={selectedIds.includes(product.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </main>

      {/* 🌟 核心交互：悬浮操作栏 (Floating Action Bar) */}
      <div
        className={`
        fixed bottom-10 left-1/2 z-40 -translate-x-1/2 transform transition-all duration-300 ease-out
        ${
          selectedIds.length > 0
            ? 'translate-y-0 opacity-100'
            : 'translate-y-24 opacity-0 pointer-events-none'
        }
      `}
      >
        <div className="flex items-center gap-4 rounded-full border border-gray-200 bg-white p-2 pl-6 shadow-2xl ring-1 ring-black/5">
          {/* 左侧：信息展示 */}
          <div className="flex items-center gap-3 border-r border-gray-200 pr-6">
            <div className="flex -space-x-2">
              {/* 选中的产品头像（最多显示 5 个） */}
              {selectedIds.slice(0, 5).map((id) => {
                const product = products.find((p) => p.id === id);
                const imageUrl = product?.image_url;
                const displayTitle = product?.title_translated || product?.title || product?.asin || '';
                return (
                  <div
                    key={id}
                    className="h-10 w-10 rounded-full border-2 border-white bg-gray-100 overflow-hidden flex-shrink-0 shadow-sm"
                    title={displayTitle}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={displayTitle}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // 图片加载失败时显示占位符
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.parentElement) {
                            target.parentElement.innerHTML = `
                              <div class="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">
                                ${(product?.asin || id).slice(-2)}
                              </div>
                            `;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">
                        {(product?.asin || id).slice(-2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="text-sm font-medium text-gray-700">
              已选 <span className="font-bold text-indigo-600">{selectedIds.length}</span> 项
            </span>
          </div>

          {/* 中间：核心按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔵 对比分析按钮被点击', { 
                  selectedIds: selectedIds.length, 
                  isCreating,
                  selectedIdsList: selectedIds,
                  canClick: selectedIds.length >= 2 && !isCreating
                });
                
                if (selectedIds.length >= 2 && !isCreating) {
                  console.log('✅ 条件满足，打开模态框');
                  setIsModalOpen(true);
                  console.log('✅ 模态框状态已设置为 true');
                } else {
                  console.log('❌ 按钮被禁用或条件不满足', { 
                    selectedIds: selectedIds.length, 
                    isCreating,
                    reason: selectedIds.length < 2 ? '选择数量不足' : '正在创建中'
                  });
                  if (selectedIds.length < 2) {
                    toast.warning(`至少需要选择 2 个产品，当前已选择 ${selectedIds.length} 个`);
                  }
                }
              }}
              disabled={selectedIds.length < 2 || isCreating}
              style={{ pointerEvents: selectedIds.length >= 2 && !isCreating ? 'auto' : 'none' }}
              className={`
                flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all
                ${
                  selectedIds.length >= 2 && !isCreating
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <GitCompare className="h-4 w-4" />
                  对比分析
                </>
              )}
            </button>

            <button
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-all"
              onClick={() => {
                toast.info('创建分组功能开发中...');
              }}
            >
              <LayoutGrid className="h-4 w-4" />
              创建分组
            </button>
          </div>

          {/* 右侧：取消按钮 */}
          <button
            onClick={() => setSelectedIds([])}
            className="ml-2 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 提示气泡：如果只选了1个，提示还需要选几个 */}
        {selectedIds.length === 1 && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-3 py-1.5 text-xs text-white shadow-lg animate-bounce">
            再选 1 个即可发起对比
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
          </div>
        )}
      </div>

      {/* 弹窗组件 */}
      <AnalysisModal
        isOpen={isModalOpen}
        onClose={() => {
          console.log('关闭模态框');
          setIsModalOpen(false);
        }}
        onSubmit={handleStartAnalysis}
        count={selectedIds.length}
      />
    </div>
  );
}

