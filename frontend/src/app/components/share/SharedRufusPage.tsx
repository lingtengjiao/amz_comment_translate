/**
 * SharedRufusPage - Rufus 调研详情页只读版本
 * 
 * 用于分享链接查看，移除了所有编辑操作
 */
import { 
  Bot, 
  User,
  Clock, 
  Home,
  Search,
  Package,
  MessageSquare,
  ExternalLink
} from 'lucide-react';

interface SharedRufusPageProps {
  data: {
    session?: {
      session_id: string;
      page_type: string;
      asin: string | null;
      keyword: string | null;
      product_title: string | null;
      product_image: string | null;
      marketplace: string;
      created_at: string | null;
    };
    conversations?: Array<{
      id: string;
      question: string;
      answer: string;
      question_type: string;
      question_index: number;
      ai_summary: string | null;
      created_at: string | null;
    }>;
  };
  title: string | null;
}

// 页面类型配置
const PAGE_TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  homepage: { label: '首页调研', icon: Home, color: 'blue' },
  keyword_search: { label: '关键词调研', icon: Search, color: 'purple' },
  product_detail: { label: '产品调研', icon: Package, color: 'rose' },
};

export function SharedRufusPage({ data, title }: SharedRufusPageProps) {
  const { session, conversations = [] } = data;

  if (!session || conversations.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Rufus 会话不存在或已被删除</p>
        </div>
      </div>
    );
  }

  const pageTypeConfig = PAGE_TYPE_CONFIG[session.page_type] || PAGE_TYPE_CONFIG.product_detail;
  const PageIcon = pageTypeConfig.icon;

  // 格式化时间
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* 会话头部信息 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            {/* 产品图片 */}
            {session.product_image ? (
              <img
                src={session.product_image}
                alt={session.product_title || '产品图片'}
                className="w-20 h-20 object-contain rounded-lg bg-white border"
              />
            ) : (
              <div className={`w-20 h-20 rounded-lg flex items-center justify-center bg-${pageTypeConfig.color}-100`}>
                <PageIcon className={`h-8 w-8 text-${pageTypeConfig.color}-600`} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* 会话标题 */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium bg-${pageTypeConfig.color}-100 text-${pageTypeConfig.color}-700`}>
                  {pageTypeConfig.label}
                </span>
                <span className="text-xs text-slate-500">
                  Amazon {session.marketplace}
                </span>
              </div>

              {/* 产品标题或关键词 */}
              <h1 className="text-lg font-semibold text-slate-900 mb-2 line-clamp-2">
                {session.product_title || session.keyword || title || 'Rufus AI 调研'}
              </h1>

              {/* 元信息 */}
              <div className="flex items-center gap-4 text-sm text-slate-600">
                {session.asin && (
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">
                    {session.asin}
                  </span>
                )}
                {session.keyword && (
                  <span className="flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    {session.keyword}
                  </span>
                )}
                {session.created_at && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(session.created_at)}
                  </span>
                )}
              </div>

              {/* 亚马逊链接 */}
              {session.asin && (
                <a
                  href={`https://www.amazon.com/dp/${session.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-sm text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  在亚马逊查看
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 对话列表 */}
        <div className="space-y-6">
          {conversations.map((conv, index) => (
            <div key={conv.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* 问题区域 */}
              <div className="p-5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900">问题 {index + 1}</span>
                      {conv.question_type && (
                        <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">
                          {conv.question_type}
                        </span>
                      )}
                      {conv.created_at && (
                        <span className="text-xs text-slate-400">
                          {formatTime(conv.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700">{conv.question}</p>
                  </div>
                </div>
              </div>

              {/* 回答区域 */}
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900">Rufus</span>
                    </div>
                    <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {conv.answer}
                    </div>
                    
                    {/* AI 总结 */}
                    {conv.ai_summary && (
                      <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                            <MessageSquare className="h-3 w-3 text-purple-600" />
                          </div>
                          <span className="text-sm font-medium text-purple-900">AI 洞察总结</span>
                        </div>
                        <p className="text-sm text-purple-800">{conv.ai_summary}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 对话统计 */}
        <div className="mt-6 text-center text-sm text-slate-500">
          共 {conversations.length} 个问答对话
        </div>
      </div>
    </div>
  );
}

export default SharedRufusPage;
