/**
 * RufusResearchSection - Rufus 调研板块主页面
 * 
 * 功能：
 * - 三个 Tab 分组：首页调研 / 关键词调研 / 产品调研
 * - 按时间线展示对话会话
 * - 点击会话可进入详情页
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bot, 
  Home, 
  Search, 
  Package, 
  Clock, 
  MessageSquare,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Pencil,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { getRufusSessions, deleteRufusSession, updateRufusSession, type RufusSessionGroup, type RufusSessionSummary } from '../../../../api/service';
import { RufusEditDialog } from '../dialogs/RufusEditDialog';

// Tab 配置 - 顺序：产品调研 → 关键词调研 → 首页调研
const TABS = [
  { id: 'product_detail', label: '产品调研', icon: Package, color: 'rose' },
  { id: 'keyword_search', label: '关键词调研', icon: Search, color: 'purple' },
  { id: 'homepage', label: '首页调研', icon: Home, color: 'blue' },
];

export function RufusResearchSection() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('product_detail');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionGroups, setSessionGroups] = useState<RufusSessionGroup[]>([]);
  const [editingSession, setEditingSession] = useState<RufusSessionSummary | null>(null);

  // 获取会话列表
  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getRufusSessions();
      setSessionGroups(response.groups || []);
    } catch (err) {
      console.error('Failed to fetch Rufus sessions:', err);
      const errorMsg = err instanceof Error ? err.message : '加载会话列表失败';
      setError(`加载失败：${errorMsg}。请检查后端服务是否正常运行。`);
      // 设置空数组，确保组件能正常渲染
      setSessionGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // 获取当前 Tab 的会话列表
  const currentSessions = sessionGroups.find(g => g.page_type === activeTab)?.sessions || [];

  // 点击会话卡片
  const handleSessionClick = (session: RufusSessionSummary) => {
    navigate(`/rufus/session/${session.session_id}`);
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 删除会话
  const handleDelete = async (session: RufusSessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmMsg = activeTab === 'product_detail' 
      ? `确定要删除产品 ${session.asin} 的所有对话记录吗？`
      : activeTab === 'keyword_search'
      ? `确定要删除关键词「${session.keyword}」的所有对话记录吗？`
      : '确定要删除这个会话的所有对话记录吗？';
    
    if (!confirm(confirmMsg)) return;
    
    try {
      await deleteRufusSession(session.session_id);
      toast.success('删除成功');
      fetchSessions(); // 重新加载
    } catch (err: any) {
      toast.error('删除失败: ' + (err?.message || '未知错误'));
    }
  };

  // 编辑会话（打开编辑对话框）
  const handleEdit = (session: RufusSessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSession(session);
  };

  // 保存编辑
  const handleSaveEdit = async (sessionId: string, data: { product_title?: string; keyword?: string; product_image?: string }) => {
    await updateRufusSession(sessionId, data);
    fetchSessions(); // 重新加载
  };

  return (
    <div>
      {/* 标题 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-2 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Bot className="w-5 h-5 text-rose-500" />
              Rufus 调研
            </h3>
            <p className="text-sm text-slate-600">查看与 Amazon Rufus AI 的对话记录和分析</p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex items-center gap-2 mb-5 bg-slate-100 rounded-xl p-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {sessionGroups.find(g => g.page_type === tab.id)?.total ? (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {sessionGroups.find(g => g.page_type === tab.id)?.total || 0}
                </span>
              ) : null}
            </button>
          ))}
          
          {/* 刷新按钮 */}
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="ml-auto p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-white transition-all"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchSessions}
            className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
          >
            重试
          </button>
        </div>
      ) : currentSessions.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">暂无调研记录</h3>
          <p className="text-sm text-slate-500 mb-4">
            使用浏览器插件在亚马逊页面与 Rufus AI 对话，记录将自动同步到这里
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentSessions.map((session) => (
            <div
              key={session.session_id}
              onClick={() => handleSessionClick(session)}
              className="bg-white rounded-xl border border-slate-200 p-3 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4">
                {/* 产品图片 - 仅在产品调研时显示 */}
                {activeTab === 'product_detail' && session.product_image && (
                  <div className="flex-shrink-0">
                    <img
                      src={session.product_image}
                      alt={session.product_title || session.asin || 'Product'}
                      className="w-20 h-20 object-contain rounded-lg border border-slate-200 bg-slate-50"
                      onError={(e) => {
                        // 图片加载失败时隐藏
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  {/* 标题行 - 固定高度保持一致 */}
                  <div className="flex items-center gap-2 mb-1 h-6">
                    {activeTab === 'keyword_search' && session.keyword && (
                      <span className="h-5 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-sm font-medium truncate max-w-[200px] flex items-center">
                        🔍 {session.keyword}
                      </span>
                    )}
                    {activeTab === 'product_detail' && session.asin && (
                      <span className="h-5 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-sm font-mono flex items-center">
                        {session.asin}
                      </span>
                    )}
                    {activeTab === 'homepage' && (
                      <span className="h-5 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-sm flex items-center">
                        🏠 首页探索
                      </span>
                    )}
                    {session.has_summary && (
                      <span className="h-5 flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-xs">
                        <Sparkles className="w-3 h-3" />
                        已总结
                      </span>
                    )}
                  </div>
                  
                  {/* 产品标题 */}
                  {session.product_title && (
                    <p className="text-slate-700 text-sm mb-1.5 line-clamp-2 leading-tight">
                      {session.product_title}
                    </p>
                  )}
                  
                  {/* 元信息 */}
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {session.conversation_count} 条对话
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(session.last_message_at)}
                    </span>
                    <span className="text-slate-400">
                      {session.marketplace}
                    </span>
                  </div>
                </div>
                
                {/* 操作按钮 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => handleEdit(session, e)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100"
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(session, e)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-rose-500 group-hover:translate-x-1 transition-all ml-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑对话框 */}
      {editingSession && (
        <RufusEditDialog
          session={editingSession}
          pageType={activeTab}
          onClose={() => setEditingSession(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
