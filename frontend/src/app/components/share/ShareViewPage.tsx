/**
 * ShareViewPage - 分享链接查看页面
 * 
 * 路由: /share/:token
 * 
 * 功能：
 * - 无需登录即可查看分享的资源
 * - 根据资源类型渲染对应的只读视图
 * - 处理链接无效/过期的情况
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  Loader2, 
  AlertCircle, 
  Clock, 
  Eye, 
  ExternalLink,
  FileText,
  MessageSquare,
  BarChart3,
  TrendingUp,
  Share2,
  Copy,
  Check,
  LayoutGrid
} from 'lucide-react';
import { getSharedResource, getShareMeta, type SharedResourceData, type ShareResourceType } from '../../../api/service';
import { SharedReviewReader } from './review-reader/SharedReviewReader';
import { SharedReportPage } from './SharedReportPage';
import { SharedAnalysisPage } from './SharedAnalysisPage';
import { SharedRufusPage } from './SharedRufusPage';
import { SharedProductBoardPage } from './SharedProductBoardPage';

// 资源类型配置
const RESOURCE_TYPE_CONFIG: Record<ShareResourceType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  review_reader: { label: '评论详情', icon: MessageSquare, color: 'blue' },
  report: { label: '分析报告', icon: FileText, color: 'purple' },
  analysis_project: { label: '竞品分析', icon: BarChart3, color: 'rose' },
  rufus_session: { label: 'Rufus 调研', icon: TrendingUp, color: 'green' },
  keyword_collection: { label: '市场格局分析', icon: LayoutGrid, color: 'pink' },
};

// 报告类型配置
const REPORT_TYPE_CONFIG: Record<string, string> = {
  comprehensive: '全维度战略分析',
  operations: '运营与市场策略',
  product: '产品迭代建议',
  supply_chain: '供应链质量整改',
};

// 统一使用的logo图片URL
const LOGO_URL = 'https://98kamz.com/favicon.svg';

// 文本截断工具函数
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

// 生成meta标签标题和描述的函数
function generateMetaTags(
  resourceType: ShareResourceType,
  resourceData: SharedResourceData,
  meta: { title: string | null }
): { title: string; description: string } {
  const baseTitle = resourceData.title || meta.title || RESOURCE_TYPE_CONFIG[resourceType].label || '分享内容';
  
  switch (resourceType) {
    case 'review_reader': {
      // 评论详情：标题简洁，描述不重复标题信息
      const data = resourceData.data as any;
      const reviews = data?.reviews || [];
      // 优先使用stats中的总评论数（完整统计），而非预览评论数量
      const reviewCount = data?.stats?.total_reviews || reviews.length || 0;
      // 标题：产品标题截断到30字符（留出" - {数量}条评论分析 - 洞察大王"的空间）
      const truncatedForTitle = truncateText(baseTitle, 30);
      const title = `${truncatedForTitle} - ${reviewCount}条评论分析 - 洞察大王`;
      // 描述不包含标题，只提供有价值的信息
      const description = `深度分析${reviewCount}条用户评论，洞察产品优劣势和市场反馈 - 亚马逊产品洞察助手`;
      return { title, description };
    }
    
    case 'report': {
      // 分析报告：优先使用产品标题，如果没有则使用报告标题
      const data = resourceData.data as any;
      const fullProductTitle = data?.product?.title || baseTitle;
      const reportType = data?.report?.report_type || '';
      const reportTypeLabel = REPORT_TYPE_CONFIG[reportType] || '分析报告';
      // 获取评论数量或其他数据条数
      const analysisData = data?.report?.analysis_data || {};
      const reviewCount = analysisData?.review_count || analysisData?.stats?.total_reviews || analysisData?.total_reviews || 0;
      // 标题：产品标题截断到40字符（留出" - 洞察大王"的空间）
      const truncatedProductTitle = truncateText(fullProductTitle, 40);
      const title = `${truncatedProductTitle} - 洞察大王`;
      // 描述：明确报告类型，包含数据条数
      const description = reviewCount > 0 
        ? `${reportTypeLabel}，分析${reviewCount}条评论数据，全面洞察产品表现 - 亚马逊产品洞察助手`
        : `${reportTypeLabel}，全面分析产品数据和市场表现 - 亚马逊产品洞察助手`;
      return { title, description };
    }
    
    case 'analysis_project': {
      // 竞品分析：标题简洁，描述不重复标题信息
      const data = resourceData.data as any;
      const items = data?.items || [];
      const itemCount = items.length;
      const truncatedTitle = truncateText(baseTitle, 40); // 留出" - 洞察大王"的空间
      const title = `${truncatedTitle} - 洞察大王`;
      // 描述：包含产品数量
      const description = `多维度竞品对比分析${itemCount > 0 ? `，对比${itemCount}个产品` : ''}，发现市场机会和竞争优势 - 亚马逊产品洞察助手`;
      return { title, description };
    }
    
    case 'rufus_session': {
      // Rufus 调研：标题简洁，描述不重复标题信息
      const data = resourceData.data as any;
      const conversations = data?.conversations || [];
      const conversationCount = conversations.length;
      const truncatedTitle = truncateText(baseTitle, 40); // 留出" - 洞察大王"的空间
      const title = `${truncatedTitle} - 洞察大王`;
      // 描述：包含对话数量
      const description = `存储rufus对话市场数据${conversationCount}条，深度洞察市场趋势和用户需求 - 亚马逊产品洞察助手`;
      return { title, description };
    }
    
    case 'keyword_collection': {
      // 市场格局分析：标题简洁，描述不重复标题信息
      const data = resourceData.data as any;
      const products = data?.products || [];
      const productCount = products.length;
      const truncatedTitle = truncateText(baseTitle, 40); // 留出" - 洞察大王"的空间
      const title = `${truncatedTitle} - 洞察大王`;
      // 描述：包含产品数量
      const description = `市场整体细分需求分析${productCount > 0 ? `，分析${productCount}个产品` : ''}，洞察品类趋势和竞争格局 - 亚马逊产品洞察助手`;
      return { title, description };
    }
    
    default: {
      const truncatedTitle = truncateText(baseTitle, 40); // 留出" - 洞察大王"的空间
      const title = `${truncatedTitle} - 洞察大王`;
      // 描述不包含标题，只提供有价值的信息
      const description = '专业的亚马逊产品洞察和分析工具 - 亚马逊产品洞察助手';
      return { title, description };
    }
  }
}

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceData, setResourceData] = useState<SharedResourceData | null>(null);
  const [meta, setMeta] = useState<{
    token: string;
    resource_type: ShareResourceType;
    title: string | null;
    is_valid: boolean;
    is_expired: boolean;
    view_count: number;
    created_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // 检查是否已经访问过（使用 sessionStorage 跟踪）
        const visitedKey = `share_visited_${token}`;
        const hasVisited = sessionStorage.getItem(visitedKey) === 'true';
        
        // 先获取元信息
        const metaResponse = await getShareMeta(token);
        setMeta(metaResponse.meta);

        if (!metaResponse.meta.is_valid) {
          if (metaResponse.meta.is_expired) {
            setError('分享链接已过期');
          } else {
            setError('分享链接已被撤销');
          }
          setLoading(false);
          return;
        }

        // 获取资源数据（如果已经访问过，跳过计数增加）
        const dataResponse = await getSharedResource(token, hasVisited);
        setResourceData(dataResponse);
        
        // 标记为已访问
        if (!hasVisited) {
          sessionStorage.setItem(visitedKey, 'true');
        }
      } catch (err: any) {
        console.error('Failed to load shared resource:', err);
        if (err.code === 404) {
          setError('分享链接不存在');
        } else if (err.code === 410) {
          setError('分享链接已过期或已被撤销');
        } else {
          setError(err.message || '加载分享内容失败');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  // 复制链接状态 - hooks 必须在所有条件返回之前声明
  const [copied, setCopied] = useState(false);

  // 复制当前分享链接（供二次分享）
  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // 加载中 - 也设置默认 meta 标签
  if (loading) {
    const defaultTitle = truncateText(meta?.title || '分享内容', 50) + ' - 洞察大王';
    const defaultDescription = truncateText(`${meta?.title || '分享内容'} - 洞察大王`, 120);
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    return (
      <>
        <Helmet>
          <title>{defaultTitle}</title>
          <meta name="description" content={defaultDescription} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={shareUrl} />
          <meta property="og:title" content={defaultTitle} />
          <meta property="og:description" content={defaultDescription} />
          <meta property="og:image" content={LOGO_URL} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content={shareUrl} />
          <meta name="twitter:title" content={defaultTitle} />
          <meta name="twitter:description" content={defaultDescription} />
          <meta name="twitter:image" content={LOGO_URL} />
        </Helmet>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-slate-600">加载分享内容...</p>
          </div>
        </div>
      </>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">无法访问此链接</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            登录查看更多
          </Link>
        </div>
      </div>
    );
  }

  if (!resourceData || !meta) {
    return null;
  }

  const config = resourceData ? RESOURCE_TYPE_CONFIG[resourceData.resource_type] : null;
  const Icon = config?.icon || Share2;

  // 生成meta标签
  const { title: shareTitle, description: shareDescription } = generateMetaTags(
    resourceData.resource_type,
    resourceData,
    meta
  );
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <Helmet>
        <title>{shareTitle}</title>
        <meta name="description" content={shareDescription} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:title" content={shareTitle} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:image" content={LOGO_URL} />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={shareUrl} />
        <meta name="twitter:title" content={shareTitle} />
        <meta name="twitter:description" content={shareDescription} />
        <meta name="twitter:image" content={LOGO_URL} />
      </Helmet>
      
      <div className="min-h-screen bg-slate-50">
      {/* 分享页面顶部提示栏 - 固定在顶部 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 sm:py-0 sm:h-12 gap-2 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <div className="flex items-center gap-1 sm:gap-1.5">
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium">{config?.label || '分享内容'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-blue-100 flex-wrap">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{resourceData.view_count} 次</span>
              </div>
              {meta.created_at && (
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap hidden sm:inline">分享于 {new Date(meta.created_at).toLocaleDateString('zh-CN')}</span>
                  <span className="whitespace-nowrap sm:hidden">{new Date(meta.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
                </div>
              )}
              {/* 复制链接按钮 - 供二次分享 */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 bg-white/10 rounded hover:bg-white/20 transition-colors whitespace-nowrap"
                title="复制链接分享给他人"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">复制链接</span>
                  </>
                )}
              </button>
              <Link
                to="/login"
                className="flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-white/10 rounded hover:bg-white/20 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">登录使用完整功能</span>
                <span className="sm:hidden">登录</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1">
        {resourceData.resource_type === 'review_reader' && (
          <SharedReviewReader data={resourceData.data} title={resourceData.title} token={token!} onDataRefresh={() => {
            // 刷新数据（skipIncrement=true 跳过访问计数增加）
            getSharedResource(token!, true).then(res => setResourceData(res));
          }} />
        )}
        {resourceData.resource_type === 'report' && (
          <SharedReportPage data={resourceData.data} title={resourceData.title} />
        )}
        {resourceData.resource_type === 'analysis_project' && (
          <SharedAnalysisPage data={resourceData.data} title={resourceData.title} />
        )}
        {resourceData.resource_type === 'rufus_session' && (
          <SharedRufusPage data={resourceData.data} title={resourceData.title} />
        )}
        {resourceData.resource_type === 'keyword_collection' && (
          <SharedProductBoardPage data={resourceData.data as any} title={resourceData.title} />
        )}
      </div>
    </div>
    </>
  );
}
