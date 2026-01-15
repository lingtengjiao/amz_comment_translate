/**
 * PrintHeader - PDF导出时的头部组件
 * 
 * 包含：Logo、网站名称、报告标题、产品信息
 * 默认隐藏，仅在打印模式（?print=true）时显示
 */
import { memo } from 'react';
import type { ApiProduct, ProductReport } from '@/api/types';

interface PrintHeaderProps {
  product?: ApiProduct | null;
  report?: ProductReport | null;
  asin?: string;
}

export const PrintHeader = memo(function PrintHeader({
  product,
  report,
  asin
}: PrintHeaderProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '未知时间';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="print-header mb-8">
      {/* Logo 和网站名称 */}
      <div className="flex items-center justify-between border-b-2 border-rose-500 pb-4 mb-6">
        <div className="flex items-center gap-3">
          {/* Logo - 使用 emoji + 文字作为品牌标识 */}
          <div className="flex items-center gap-2">
            <span className="text-3xl">🎯</span>
            <div>
              <h1 className="text-2xl font-bold text-rose-600">洞察大王</h1>
              <p className="text-xs text-gray-500">AI驱动的产品评论深度分析平台</p>
            </div>
          </div>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>产品分析报告</div>
          <div>{formatDate(report?.created_at || null)}</div>
        </div>
      </div>

      {/* 产品信息卡片 */}
      {product && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
          <div className="flex items-start gap-4">
            {/* 产品图片 */}
            {product.image_url && (
              <img
                src={product.image_url}
                alt={product.title_translated || product.title || '产品图片'}
                className="w-20 h-20 object-contain rounded border border-gray-200 flex-shrink-0"
              />
            )}
            {/* 产品信息 */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                {product.title_translated || product.title || '产品标题'}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-medium">
                  ASIN: {product.asin || asin}
                </span>
                {product.average_rating > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-500">★</span>
                    {product.average_rating.toFixed(1)} 分
                  </span>
                )}
                {product.total_reviews > 0 && (
                  <span>{product.total_reviews.toLocaleString()} 条评论</span>
                )}
                {product.price && (
                  <span className="font-medium">{product.price}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 报告标题 */}
      {report && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {report.title || '产品深度洞察报告'}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              综合战略版
            </span>
            <span>生成时间: {formatDate(report.created_at)}</span>
            {(report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews) && (
              <span>基于 {report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews} 条评论分析</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default PrintHeader;
