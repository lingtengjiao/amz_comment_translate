/**
 * RufusDetailPage - Rufus 会话详情页
 * 
 * 功能：
 * - 左侧面板(60%)：原生对话流，按时间顺序展示问答对
 * - 右侧面板(40%)：AI总结区域，支持自动生成和重新生成
 */
import { useState, useEffect } from 'react';
import type React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bot, 
  User,
  Clock, 
  Loader2,
  Home,
  Search,
  Package,
  MessageSquare,
  Pencil,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  getRufusSessionDetail,
  deleteRufusConversation,
  type RufusSessionDetailResponse,
  type RufusConversationDetail
} from '../../../api/service';
import { ConversationEditDialog } from './dialogs/ConversationEditDialog';
import { ShareButton } from '../share/ShareButton';

// 页面类型配置
const PAGE_TYPE_CONFIG = {
  homepage: { label: '首页调研', icon: Home, color: 'blue' },
  keyword_search: { label: '关键词调研', icon: Search, color: 'purple' },
  product_detail: { label: '产品调研', icon: Package, color: 'rose' },
};

export function RufusDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<RufusSessionDetailResponse | null>(null);
  const [editingConversation, setEditingConversation] = useState<RufusConversationDetail | null>(null);

  // 获取会话详情
  const fetchSessionDetail = async () => {
    if (!sessionId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getRufusSessionDetail(sessionId);
      // 如果对话列表为空，自动返回列表页
      if (response.conversations && response.conversations.length === 0) {
        toast.info('该会话的所有对话已被删除');
        navigate('/home/rufus-research');
        return;
      }
      setSessionData(response);
    } catch (err: any) {
      console.error('Failed to fetch session detail:', err);
      // 如果是 404 错误（会话不存在或所有对话已删除），自动返回列表页
      const errorMessage = err?.message || err?.detail || String(err || '');
      if (err?.code === 404 || err?.status === 404 || errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found') || errorMessage.includes('不存在')) {
        toast.info('该会话不存在或所有对话已被删除');
        setTimeout(() => {
          navigate('/home/rufus-research');
        }, 1000);
        return;
      }
      setError('加载会话详情失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionDetail();
  }, [sessionId]);


  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 页面类型配置
  const pageTypeConfig = sessionData 
    ? PAGE_TYPE_CONFIG[sessionData.page_type as keyof typeof PAGE_TYPE_CONFIG] 
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error || '会话不存在'}</p>
        <button
          onClick={() => navigate('/home/rufus-research')}
          className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部导航 - 固定高度保持一致 */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 h-[88px]">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center">
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={() => navigate('/home/rufus-research')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* 产品图片 - 固定尺寸保持一致 */}
              {sessionData.product_image && (
                <div className="flex-shrink-0 w-16 h-16">
                  <img
                    src={sessionData.product_image}
                    alt={sessionData.product_title || sessionData.asin || 'Product'}
                    className="w-full h-full object-contain rounded-lg border border-slate-200 bg-slate-50"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                {/* 第一行：4个字段 - 统一高度 */}
                <div className="flex items-center gap-2 mb-1 h-6">
                  {pageTypeConfig && (
                    <span className={`h-5 px-2 py-0.5 bg-${pageTypeConfig.color}-100 text-${pageTypeConfig.color}-700 rounded-md text-xs font-medium flex-shrink-0 flex items-center`}>
                      {pageTypeConfig.label}
                    </span>
                  )}
                  {sessionData.keyword && (
                    <span className="h-5 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-sm flex-shrink-0 flex items-center">
                      🔍 {sessionData.keyword}
                    </span>
                  )}
                  {sessionData.asin && (
                    <span className="h-5 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-sm font-mono flex-shrink-0 flex items-center">
                      {sessionData.asin}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-slate-500 flex-shrink-0 ml-auto h-5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{sessionData.conversations.length} 条对话</span>
                    <span className="text-slate-300 select-none">·</span>
                    <span className="font-medium text-slate-600">{sessionData.marketplace}</span>
                    <span className="text-slate-300 select-none">·</span>
                    {/* 分享按钮 */}
                    <ShareButton
                      resourceType="rufus_session"
                      asin={sessionData.session_id}
                      title={sessionData.product_title || sessionData.keyword || 'Rufus 调研'}
                      variant="outline"
                      size="sm"
                    />
                  </div>
                </div>
                
                {/* 第二行：产品标题 - 减少行间距 */}
                {sessionData.product_title && (
                  <h1 className="text-base font-semibold text-slate-900 line-clamp-2 leading-tight">
                    {sessionData.product_title}
                  </h1>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 - 全宽布局 */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-rose-500" />
              对话记录
            </h2>
          </div>
          
          <div className="divide-y divide-slate-100">
            {sessionData.conversations.map((conv, index) => (
              <ConversationItem 
                key={conv.id} 
                conversation={conv} 
                index={index}
                onEdit={(conv) => {
                  setEditingConversation(conv);
                }}
                onDelete={async (convId) => {
                  await deleteRufusConversation(convId);
                }}
                onRefresh={fetchSessionDetail}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 编辑对话对话框 */}
      {editingConversation && (
        <ConversationEditDialog
          conversation={editingConversation}
          onClose={() => setEditingConversation(null)}
          onRefresh={fetchSessionDetail}
        />
      )}
    </div>
  );
}

// 格式化回答文本（保留格式标记）
function formatAnswerText(text: string): React.ReactNode {
  if (!text) return '';
  
  // 将文本按行分割
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listGroup: React.ReactNode[] = [];
  let inListGroup = false;
  
      const flushListGroup = () => {
        if (listGroup.length > 0) {
          elements.push(
            <ul key={`list-${elements.length}`} className="list-none space-y-0.5 mb-2 ml-4">
              {listGroup}
            </ul>
          );
          listGroup = [];
          inListGroup = false;
        }
      };
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
      // 检查是否是标题行（包含 ━━━）
    if (trimmedLine.includes('━━━')) {
      flushListGroup();
      const match = trimmedLine.match(/━━━\s*(.+?)\s*━━━/);
      if (match) {
        elements.push(
          <h3 key={index} className="font-semibold text-slate-900 mt-3 mb-1.5 first:mt-0 text-base leading-tight">
            {match[1]}
          </h3>
        );
        return;
      }
    }
    
    // 检查是否是列表项（以 • 开头，可能前面有空格）
    if (trimmedLine.startsWith('•') || line.match(/^\s+•/)) {
      const content = trimmedLine.replace(/^•\s*/, '').trim();
      
      // 检查是否包含【】标记（强调文本）
      const parts = content.split(/(【[^】]+】)/);
      const formattedParts = parts.map((part, partIndex) => {
        if (part.match(/^【[^】]+】$/)) {
          const emphasized = part.replace(/【|】/g, '');
          return <strong key={partIndex} className="font-semibold text-slate-900">{emphasized}</strong>;
        }
        return <span key={partIndex}>{part}</span>;
      });
      
      listGroup.push(
        <li key={`li-${listGroup.length}`} className="flex items-start gap-1.5 leading-tight">
          <span className="text-slate-500 mt-0.5 flex-shrink-0">•</span>
          <span className="flex-1">{formattedParts}</span>
        </li>
      );
      inListGroup = true;
      return;
    }
    
    // 普通段落
    if (trimmedLine) {
      flushListGroup();
      
      // 检查是否包含【】标记
      const parts = trimmedLine.split(/(【[^】]+】)/);
      const formattedParts = parts.map((part, partIndex) => {
        if (part.match(/^【[^】]+】$/)) {
          const emphasized = part.replace(/【|】/g, '');
          return <strong key={partIndex} className="font-semibold text-slate-900">{emphasized}</strong>;
        }
        return <span key={partIndex}>{part}</span>;
      });
      
      elements.push(
        <p key={index} className="mb-1.5 last:mb-0 text-slate-700 leading-snug">
          {formattedParts}
        </p>
      );
    } else {
      // 空行 - 如果正在列表组中，结束列表组
      if (inListGroup) {
        flushListGroup();
      } else if (elements.length > 0) {
        // 只在有内容时才添加空行
        elements.push(<br key={`br-${index}`} />);
      }
    }
  });
  
  // 最后刷新列表组
  flushListGroup();
  
  return <div className="space-y-0.5">{elements}</div>;
}

// 对话项组件
function ConversationItem({ 
  conversation, 
  index,
  onEdit,
  onDelete,
  onRefresh
}: { 
  conversation: RufusConversationDetail; 
  index: number;
  onEdit: (conv: RufusConversationDetail) => void;
  onDelete: (convId: string) => void;
  onRefresh: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除这条对话记录吗？`)) return;
    
    setIsDeleting(true);
    try {
      await onDelete(conversation.id);
      toast.success('删除成功');
      onRefresh();
    } catch (err: any) {
      toast.error('删除失败: ' + (err?.message || '未知错误'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 pb-3 group hover:bg-slate-50 transition-colors">
      {/* 问题 */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-900">问题 #{index + 1}</span>
            <span className="text-xs text-slate-400">{formatTime(conversation.created_at)}</span>
            {conversation.question_type !== 'diy' && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                {conversation.question_type}
              </span>
            )}
            {conversation.question_type === 'diy' && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-xs">
                自定义
              </span>
            )}
            {/* 操作按钮 */}
            <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(conversation)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                title="编辑"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-slate-700 text-sm leading-snug">
            {conversation.question}
          </p>
        </div>
      </div>
      
      {/* 回答 */}
      <div className="flex items-start gap-3 ml-11">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-900">Rufus</span>
            {/* 回答的操作按钮 */}
            <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(conversation)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                title="编辑"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 leading-snug whitespace-pre-wrap">
            {formatAnswerText(conversation.answer)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RufusDetailPage;
