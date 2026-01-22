/**
 * SharedReportPage - 报告详情页只读版本
 * 
 * 用于分享链接查看，复用现有报告渲染组件
 */
import { useState, lazy, Suspense, useCallback } from 'react';
import { 
  FileText, 
  Loader2,
  Package,
  Calendar
} from 'lucide-react';
import { TableOfContents } from '../TableOfContents';
import { CompareReviewSidebar } from '../CompareReviewSidebar';

// 懒加载报告组件
const SupplyChainReportPage = lazy(() => import('../reports/supply-chain/SupplyChainReportPage'));
const ComprehensiveReportPage = lazy(() => import('../reports/comprehensive/ComprehensiveReportPage'));
const OperationsReportPage = lazy(() => import('../reports/operations/OperationsReportPage'));
const ProductReportPage = lazy(() => import('../reports/product/ProductReportPage'));

interface SharedReportPageProps {
  data: {
    report?: {
      id: string;
      product_id: string;
      title: string | null;
      content: string;
      analysis_data: any;
      report_type: string;
      status: string;
      created_at: string | null;
    };
    product?: {
      asin: string | null;
      title: string | null;
      image_url: string | null;
    } | null;
  };
  title: string | null;
}

// 报告类型配置
const REPORT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  comprehensive: { label: '全维度战略分析', color: 'bg-purple-100 text-purple-700' },
  operations: { label: '运营与市场策略', color: 'bg-blue-100 text-blue-700' },
  product: { label: '产品迭代建议', color: 'bg-green-100 text-green-700' },
  supply_chain: { label: '供应链质量整改', color: 'bg-orange-100 text-orange-700' },
};

export function SharedReportPage({ data, title }: SharedReportPageProps) {
  const { report, product } = data;
  const [reportSections, setReportSections] = useState<Array<{ id: string; title: string; level?: number }>>([]);
  const [reviewSidebar, setReviewSidebar] = useState<{
    isOpen: boolean;
    dimensionKey: string;
    dimensionLabel: string;
    tagLabel: string;
    totalCount: number;
  }>({
    isOpen: false,
    dimensionKey: '',
    dimensionLabel: '',
    tagLabel: '',
    totalCount: 0
  });

  // 处理数据概览点击（打开评论侧边栏）
  const handleViewReviews = useCallback((dimensionKey: string, dimensionLabel: string, tagLabel: string, totalCount: number) => {
    setReviewSidebar({
      isOpen: true,
      dimensionKey,
      dimensionLabel,
      tagLabel,
      totalCount
    });
  }, []);

  // 关闭评论侧边栏
  const closeReviewSidebar = useCallback(() => {
    setReviewSidebar(prev => ({ ...prev, isOpen: false }));
  }, []);

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">报告不存在或已被删除</p>
        </div>
      </div>
    );
  }

  // 确保 content 是字符串格式（报告组件会在内部解析）
  const reportContent = typeof report.content === 'string' 
    ? report.content 
    : JSON.stringify(report.content);

  const typeConfig = REPORT_TYPE_CONFIG[report.report_type] || { 
    label: '分析报告', 
    color: 'bg-slate-100 text-slate-700' 
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 报告头部信息 */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-start gap-6">
            {/* 产品图片 */}
            {product?.image_url ? (
              <img
                src={product.image_url}
                alt={product.title || '产品图片'}
                className="w-20 h-20 object-contain rounded-lg bg-white border"
              />
            ) : (
              <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center">
                <Package className="h-8 w-8 text-slate-400" />
              </div>
            )}

            <div className="flex-1">
              {/* 报告标题 */}
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                {report.title || title || '产品分析报告'}
              </h1>

              {/* 产品信息 */}
              {product?.title && (
                <p className="text-slate-600 mb-3 line-clamp-1">
                  {product.title}
                </p>
              )}

              {/* 标签 */}
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeConfig.color}`}>
                  {typeConfig.label}
                </span>
                {product?.asin && (
                  <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">
                    {product.asin}
                  </span>
                )}
                {report.created_at && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(report.created_at).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 报告内容 */}
      <div className="max-w-6xl mx-auto xl:ml-[220px] xl:mr-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          }
        >
          {report.report_type === 'supply_chain' && reportContent && (
            <SupplyChainReportPage 
              content={reportContent} 
              analysisData={report.analysis_data}
              onSectionsChange={setReportSections}
              asin={product?.asin || undefined}
              onViewReviews={handleViewReviews}
            />
          )}
          {report.report_type === 'comprehensive' && reportContent && (
            <ComprehensiveReportPage 
              content={reportContent} 
              analysisData={report.analysis_data}
              onSectionsChange={setReportSections}
              asin={product?.asin || undefined}
              onViewReviews={handleViewReviews}
            />
          )}
          {report.report_type === 'operations' && reportContent && (
            <OperationsReportPage 
              content={reportContent} 
              analysisData={report.analysis_data}
              onSectionsChange={setReportSections}
              asin={product?.asin || undefined}
              onViewReviews={handleViewReviews}
            />
          )}
          {report.report_type === 'product' && reportContent && (
            <ProductReportPage 
              content={reportContent} 
              analysisData={report.analysis_data}
              onSectionsChange={setReportSections}
              asin={product?.asin || undefined}
              onViewReviews={handleViewReviews}
            />
          )}
          {!reportContent && (
            <div className="bg-white rounded-xl shadow-sm border m-6 p-12 text-center">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">报告内容解析失败</p>
            </div>
          )}
        </Suspense>
      </div>

      {/* 左侧固定大纲（仅大屏显示） */}
      {reportSections.length > 0 && (
        <TableOfContents 
          sections={reportSections} 
          className="print:hidden"
          isDrawerOpen={reviewSidebar.isOpen}
        />
      )}

      {/* 评论侧边栏 - 显示完整评论（包含原文和译文） */}
      {product?.asin && (
        <CompareReviewSidebar
          isOpen={reviewSidebar.isOpen}
          onClose={closeReviewSidebar}
          productAsin={product.asin}
          dimension={reviewSidebar.dimensionLabel}
          dimensionKey={reviewSidebar.dimensionKey}
          tagLabel={reviewSidebar.tagLabel}
          totalCount={reviewSidebar.totalCount}
        />
      )}
    </div>
  );
}

export default SharedReportPage;
