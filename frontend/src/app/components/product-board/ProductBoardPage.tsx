/**
 * 产品分类画板页面 - 全屏详情页
 * 作为产品分析库的二级详情页，全屏显示，无侧边栏和顶部栏
 */
import { Toaster } from 'sonner';
import { ProductBoardSection } from './ProductBoardSection';

export default function ProductBoardPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Toaster position="top-center" richColors />
      <ProductBoardSection />
    </div>
  );
}
