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

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-slate-600">加载分享内容...</p>
        </div>
      </div>
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

  const config = RESOURCE_TYPE_CONFIG[resourceData.resource_type];
  const Icon = config?.icon || Share2;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 分享页面顶部提示栏 - 固定在顶部 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-3">
              <Share2 className="h-4 w-4" />
              <div className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{config?.label || '分享内容'}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-blue-100">
              <div className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                <span>{resourceData.view_count} 次查看</span>
              </div>
              {meta.created_at && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>分享于 {new Date(meta.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              )}
              {/* 复制链接按钮 - 供二次分享 */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
                title="复制链接分享给他人"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>复制链接</span>
                  </>
                )}
              </button>
              <Link
                to="/login"
                className="flex items-center gap-1 px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>登录使用完整功能</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1">
        {resourceData.resource_type === 'review_reader' && (
          <SharedReviewReader data={resourceData.data} title={resourceData.title} token={token!} onDataRefresh={() => {
            // 刷新数据
            const visitedKey = `share_visited_${token}`;
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
          <SharedProductBoardPage data={resourceData.data} title={resourceData.title} />
        )}
      </div>
    </div>
  );
}
