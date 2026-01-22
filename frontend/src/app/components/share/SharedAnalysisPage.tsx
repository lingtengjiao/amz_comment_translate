/**
 * SharedAnalysisPage - 分析项目详情页只读版本
 * 
 * 用于分享链接查看，支持：
 * - 竞品对比分析 (comparison)
 * - 市场品类分析 (market_insight)
 */
import { useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp,
  Package,
  AlertCircle
} from 'lucide-react';
import { VocComparisonRenderer } from '../VocComparisonRenderer';
import { ComparisonRenderer } from '../ComparisonRenderer';
import { MarketInsightRenderer } from '../MarketInsightRenderer';
import { isStructuredResult, isComparisonResult } from '../../../api/types';

interface SharedAnalysisPageProps {
  data: {
    project?: {
      id: string;
      title: string;
      description: string | null;
      analysis_type: string;
      status: string;
      result_content: any;
      raw_data_snapshot: any;
      created_at: string | null;
    };
    items?: Array<{
      id: string;
      role_label: string | null;
      display_order: number;
      product: {
        id: string | null;
        asin: string | null;
        title: string | null;
        image_url: string | null;
      } | null;
    }>;
  };
  title: string | null;
}

// 检查是否是市场洞察结果
const isMarketInsightResult = (data: any): boolean => {
  return data?.analysis_type === 'market_insight' || 
    (data?.market_overview && data?.market_persona) ||
    (data?.market_opportunities && data?.product_profiles);
};

export function SharedAnalysisPage({ data, title }: SharedAnalysisPageProps) {
  const { project, items = [] } = data;

  // 分析结果内容
  const resultContent = useMemo(() => {
    if (!project?.result_content) return null;
    return project.result_content;
  }, [project]);

  // 判断分析类型
  const isMarketInsight = project?.analysis_type === 'market_insight' || 
    (resultContent && isMarketInsightResult(resultContent));

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">分析项目不存在或已被删除</p>
        </div>
      </div>
    );
  }

  // 状态检查
  if (project.status === 'pending' || project.status === 'processing') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">分析进行中</h2>
          <p className="text-slate-600">该分析项目正在处理中，请稍后再访问此分享链接。</p>
        </div>
      </div>
    );
  }

  if (project.status === 'failed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">分析失败</h2>
          <p className="text-slate-600">该分析项目执行失败，无法查看结果。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 项目头部信息 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl ${isMarketInsight ? 'bg-purple-100' : 'bg-blue-100'}`}>
              {isMarketInsight ? (
                <TrendingUp className="h-6 w-6 text-purple-600" />
              ) : (
                <BarChart3 className="h-6 w-6 text-blue-600" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {project.title || title || '分析报告'}
              </h1>
              <p className="text-sm text-slate-600">
                {isMarketInsight ? '市场品类分析' : '竞品对比分析'}
                {project.created_at && (
                  <span className="ml-2 text-slate-400">
                    · {new Date(project.created_at).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* 产品列表预览 */}
          {items.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border"
                >
                  {item.product?.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt={item.product.title || ''}
                      className="w-8 h-8 object-contain rounded"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center">
                      <Package className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                      {item.product?.title || item.product?.asin || `产品 ${index + 1}`}
                    </p>
                    {item.role_label && (
                      <span className="text-xs text-slate-500">{item.role_label}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 分析结果内容 */}
      {resultContent ? (
        <>
          {isMarketInsight ? (
            <div className="max-w-7xl mx-auto px-4 py-6">
              <MarketInsightRenderer data={resultContent} readOnly={true} />
            </div>
          ) : isStructuredResult(resultContent) ? (
            // VocComparisonRenderer 需要全宽展示以支持吸顶效果
            <VocComparisonRenderer data={resultContent} items={items} readOnly={true} />
          ) : isComparisonResult(resultContent) ? (
            <div className="max-w-7xl mx-auto px-4 py-6">
              <ComparisonRenderer data={resultContent} readOnly={true} />
            </div>
          ) : (
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap overflow-auto">
                  {JSON.stringify(resultContent, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <BarChart3 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">暂无分析结果</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SharedAnalysisPage;
