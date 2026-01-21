/**
 * 毛利计算模块主容器
 */
import { useState, useEffect } from 'react';
import { Calculator, Settings2, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { ProfitCalculator } from '../../profit-calculator/ProfitCalculator';
import { ProductTable } from '../../profit-calculator/ProductTable';
import { RulesPanel } from '../../profit-calculator/RulesPanel';
import { ProductFormModal } from '../../profit-calculator/ProductFormModal';
import { useProfitCalculator } from '../../profit-calculator/useProfitCalculator';
import { useAuth } from '../../../contexts/AuthContext';

export function ProfitCalculatorSection() {
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const { isAuthenticated } = useAuth();
  
  const {
    products,
    rules,
    categories,
    loading,
    refreshProducts,
    refreshRules,
    createProduct,
    updateProduct,
    deleteProduct,
    calculateProfit,
    updateExchangeRate,
    updateShippingRule,
    updateOtherCostRule,
  } = useProfitCalculator();

  // 初始加载
  useEffect(() => {
    refreshProducts();
    refreshRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 处理创建/更新产品
  const handleSaveProduct = async (data: any) => {
    if (!isAuthenticated) {
      toast.error('请先登录后再保存产品');
      return;
    }
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, data);
        toast.success('产品更新成功');
      } else {
        await createProduct(data);
        toast.success('产品创建成功');
      }
      setShowProductModal(false);
      setEditingProduct(null);
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Token') || errorMessage.includes('认证') || errorMessage.includes('登录')) {
        toast.error('登录已过期，请重新登录');
      } else {
        toast.error('保存失败：' + errorMessage);
      }
    }
  };

  // 处理编辑产品
  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  // 处理删除产品
  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteProduct(productId);
      toast.success('产品已删除');
    } catch (error) {
      toast.error('删除失败：' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 未登录提示 */}
      {!isAuthenticated && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              需要登录才能保存设置和产品
            </p>
            <p className="text-xs text-amber-700 mt-1">
              您可以先使用快速计算器进行试算，但保存功能需要登录后使用
            </p>
          </div>
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-rose-500" />
            毛利计算
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            计算亚马逊FBA产品毛利，支持多种运输方式对比
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRulesPanel(!showRulesPanel)}
            className="gap-1"
          >
            <Settings2 className="w-4 h-4" />
            费率设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshProducts();
              refreshRules();
            }}
            className="gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingProduct(null);
              setShowProductModal(true);
            }}
            className="gap-1 bg-rose-500 hover:bg-rose-600"
          >
            <Plus className="w-4 h-4" />
            添加产品
          </Button>
        </div>
      </div>

      {/* 费率设置面板 */}
      {showRulesPanel && (
        <RulesPanel
          rules={rules}
          onUpdateExchangeRate={updateExchangeRate}
          onUpdateShippingRule={updateShippingRule}
          onUpdateOtherCostRule={updateOtherCostRule}
          onClose={() => setShowRulesPanel(false)}
        />
      )}

      {/* 主内容区 - 双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：快速计算器 */}
        <div className="lg:col-span-1">
          <ProfitCalculator
            categories={categories}
            onCalculate={calculateProfit}
            onSave={(data) => {
              setEditingProduct(null);
              handleSaveProduct(data);
            }}
          />
        </div>

        {/* 右侧：产品列表 */}
        <div className="lg:col-span-2">
          <ProductTable
            products={products}
            loading={loading}
            onEdit={handleEditProduct}
            onDelete={handleDeleteProduct}
          />
        </div>
      </div>

      {/* 产品表单弹窗 */}
      <ProductFormModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
        }}
        onSave={handleSaveProduct}
        product={editingProduct}
        categories={categories}
      />
    </div>
  );
}
