/**
 * ShareButton - 分享按钮组件
 * 
 * 功能：
 * - 点击弹出分享设置对话框
 * - 支持设置过期时间
 * - 生成链接后一键复制
 * - 显示已有分享链接
 */
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Share2, 
  Copy, 
  Check, 
  Link2, 
  Clock, 
  Eye,
  Trash2,
  Loader2,
  X
} from 'lucide-react';
import { Button } from '../ui/button';
import { 
  createShareLink, 
  getMyShareLinks, 
  revokeShareLink,
  type ShareResourceType, 
  type ShareLink 
} from '../../../api/service';
import { toast } from '../../utils/toast';

interface ShareButtonProps {
  /** 资源类型 */
  resourceType: ShareResourceType;
  /** 资源 ID（报告/分析项目 UUID） */
  resourceId?: string;
  /** ASIN 或 session_id */
  asin?: string;
  /** 自定义标题 */
  title?: string;
  /** 按钮变体 */
  variant?: 'default' | 'outline' | 'ghost';
  /** 按钮大小 */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** 额外的 className */
  className?: string;
}

// 过期时间选项
const EXPIRE_OPTIONS = [
  { value: 0, label: '永久有效' },
  { value: 1, label: '1 天' },
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
];

export function ShareButton({
  resourceType,
  resourceId,
  asin,
  title,
  variant = 'outline',
  size = 'default',
  className = '',
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expireDays, setExpireDays] = useState(0);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [existingLinks, setExistingLinks] = useState<ShareLink[]>([]);
  const [copied, setCopied] = useState(false);

  // 获取已有分享链接
  const fetchExistingLinks = useCallback(async () => {
    try {
      const response = await getMyShareLinks(resourceType);
      // 过滤出当前资源的分享链接
      const links = response.share_links.filter(link => {
        if (resourceId) {
          return link.resource_id === resourceId;
        }
        if (asin) {
          return link.asin === asin;
        }
        return false;
      });
      setExistingLinks(links);
    } catch (err) {
      console.error('Failed to fetch existing links:', err);
    }
  }, [resourceType, resourceId, asin]);

  // 打开对话框
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setShareLink(null);
    setCopied(false);
    await fetchExistingLinks();
  }, [fetchExistingLinks]);

  // 创建分享链接
  const handleCreateLink = async () => {
    setIsLoading(true);
    try {
      const response = await createShareLink({
        resource_type: resourceType,
        resource_id: resourceId,
        asin: asin,
        title: title,
        expires_in_days: expireDays || undefined,
      });
      setShareLink(response.share_link);
      toast.success('分享链接已创建');
      
      // 刷新已有链接列表
      await fetchExistingLinks();
    } catch (err: any) {
      console.error('Failed to create share link:', err);
      toast.error('创建分享链接失败', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 复制链接
  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('链接已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('复制失败');
    }
  };

  // 撤销分享链接
  const handleRevoke = async (token: string) => {
    try {
      await revokeShareLink(token);
      toast.success('分享链接已撤销');
      await fetchExistingLinks();
      if (shareLink?.token === token) {
        setShareLink(null);
      }
    } catch (err: any) {
      console.error('Failed to revoke link:', err);
      toast.error('撤销失败', err.message);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '永久有效';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleOpen}
        className={className}
      >
        <Share2 className="h-4 w-4 mr-2" />
        分享
      </Button>

      {/* 分享对话框 - 使用 Portal 渲染到 body，确保居中不受父容器影响 */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* 遮罩层 */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 对话框内容 */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-slate-900">分享链接</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* 内容区域 */}
            <div className="px-6 py-4 space-y-4">
              {/* 已有分享链接 */}
              {existingLinks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">已有分享链接</p>
                  <div className="space-y-2">
                    {existingLinks.map(link => (
                      <div
                        key={link.token}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            <span className="text-sm text-slate-900 font-mono truncate">
                              /share/{link.token}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {link.view_count} 次查看
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(link.expires_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleCopy(link.token)}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                            title="复制链接"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-600" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRevoke(link.token)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            title="撤销链接"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 新建分享链接成功 */}
              {shareLink && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800 mb-2">分享链接已创建</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/share/${shareLink.token}`}
                      className="flex-1 px-3 py-2 bg-white border border-green-300 rounded-lg text-sm font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleCopy(shareLink.token)}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          复制
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* 创建新链接区域 */}
              {!shareLink && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      链接有效期
                    </label>
                    <select
                      value={expireDays}
                      onChange={(e) => setExpireDays(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {EXPIRE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-sm text-slate-500">
                    <p>分享后，任何拥有链接的人都可以查看此内容（只读）。</p>
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                关闭
              </Button>
              {!shareLink && (
                <Button
                  onClick={handleCreateLink}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      创建分享链接
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default ShareButton;
