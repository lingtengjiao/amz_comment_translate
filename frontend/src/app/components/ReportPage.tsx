/**
 * ReportPage - 产品分析报告独立页面
 * 
 * 路由: /report/:asin/:reportId?
 * - /report/B0CYT6D2ZS - 显示该产品的最新报告
 * - /report/B0CYT6D2ZS/xxx-xxx-xxx - 显示指定 ID 的报告
 */
import { useState, useEffect, memo, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ArrowLeft, 
  Loader2, 
  Copy, 
  Check, 
  ExternalLink,
  Calendar,
  BarChart3,
  History,
  RefreshCw,
  Share2,
  AlertCircle,
  ChevronDown,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button } from './ui/button';
import { 
  getLatestReport, 
  getReportById, 
  getReportHistory,
  generateReport,
  getProductStats
} from '@/api/service';
import type { ProductReport, ReportType, ApiProduct } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { JsonReportRenderer } from './JsonReportRenderer';
import { TableOfContents } from './TableOfContents';

// Markdown 渲染组件
const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];
    
    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-2 my-4 text-gray-700 dark:text-gray-300">
            {listItems.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
            ))}
          </ul>
        );
        listItems = [];
      }
    };
    
    const parseInline = (text: string): string => {
      return text
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/"(.+?)"/g, '<span class="text-rose-600 dark:text-rose-400">"$1"</span>')
        .replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm">$1</code>');
    };
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (!trimmed) {
        flushList();
        return;
      }
      
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={index} className="text-3xl font-bold text-gray-900 dark:text-white mt-8 mb-6 pb-3 border-b-2 border-rose-500">
            {trimmed.slice(2)}
          </h1>
        );
        return;
      }
      
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={index} className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4 flex items-center gap-2">
            {trimmed.slice(3)}
          </h2>
        );
        return;
      }
      
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={index} className="text-xl font-semibold text-gray-800 dark:text-gray-200 mt-6 mb-3">
            {trimmed.slice(4)}
          </h3>
        );
        return;
      }
      
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listItems.push(trimmed.slice(2));
        return;
      }
      
      if (/^\d+\.\s/.test(trimmed)) {
        listItems.push(trimmed.replace(/^\d+\.\s/, ''));
        return;
      }
      
      if (trimmed === '---' || trimmed === '***') {
        flushList();
        elements.push(
          <hr key={index} className="my-8 border-gray-200 dark:border-gray-700" />
        );
        return;
      }
      
      flushList();
      elements.push(
        <p 
          key={index} 
          className="text-gray-700 dark:text-gray-300 leading-relaxed my-4 text-lg"
          dangerouslySetInnerHTML={{ __html: parseInline(trimmed) }}
        />
      );
    });
    
    flushList();
    return elements;
  };
  
  return (
    <article className="prose prose-lg dark:prose-invert max-w-none">
      {renderMarkdown(content)}
    </article>
  );
});

// 检测内容是否为 JSON
function isJsonContent(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// 简单的错误边界组件
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Report render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
            <AlertCircle className="size-5" />
            <span className="font-medium">报告渲染出错</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {this.state.error?.message || '未知错误'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ReportPage() {
  const { asin, reportId } = useParams<{ asin: string; reportId?: string }>();
  const navigate = useNavigate();
  
  const [report, setReport] = useState<ProductReport | null>(null);
  const [reportHistory, setReportHistory] = useState<ProductReport[]>([]);
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [reportSections, setReportSections] = useState<Array<{ id: string; title: string; level?: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [generatingReportType, setGeneratingReportType] = useState<ReportType>('comprehensive');
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // 证据抽屉是否打开
  const [isFullscreen, setIsFullscreen] = useState(false); // 沉浸模式状态
  
  // 判断当前报告是否为 JSON 格式
  const isJsonReport = useMemo(() => {
    return report?.content ? isJsonContent(report.content) : false;
  }, [report?.content]);
  
  // 加载报告
  useEffect(() => {
    if (asin) {
      loadReport();
    }
  }, [asin, reportId]);
  
  const loadReport = async () => {
    if (!asin) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // 并行加载报告和产品信息
      const [loadedReport, productStats] = await Promise.all([
        reportId ? getReportById(asin, reportId) : getLatestReport(asin),
        getProductStats(asin).catch(() => null) // 忽略产品信息加载错误
      ]);
      
      setReport(loadedReport);
      if (productStats) {
        setProduct(productStats.product);
      }
      
      // 同时加载历史报告列表
      try {
        const historyResponse = await getReportHistory(asin, 10);
        if (historyResponse.success) {
          setReportHistory(historyResponse.reports);
        }
      } catch {
        // 忽略历史加载错误
      }
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      if (errorMessage.includes('404') || errorMessage.includes('暂无报告')) {
        setError('该产品暂无分析报告，请先在产品详情页生成报告。');
      } else {
        setError(`加载报告失败: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGenerateReport = async (type: ReportType) => {
    if (!asin) return;
    
    setGeneratingReportType(type);
    setIsGenerating(true);
    setError(null);
    setShowTypeSelector(false);
    
    try {
      const response = await generateReport(asin, type);
      if (response.success && response.report) {
        setReport(response.report);
        // 更新 URL 到新报告
        navigate(`/report/${asin}/${response.report.id}`, { replace: true });
        // 重新加载历史
        const historyResponse = await getReportHistory(asin, 10);
        if (historyResponse.success) {
          setReportHistory(historyResponse.reports);
        }
      } else {
        setError(response.error || '报告生成失败');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError(`报告生成失败: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 切换沉浸模式
  const handleFullscreenClick = async () => {
    try {
      if (!isFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
    }
  };
  
  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  const handleCopyReport = async () => {
    if (!report?.content) return;
    try {
      await navigator.clipboard.writeText(report.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };
  
  const handlePrint = () => {
    window.print();
  };
  
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
  
  const handleSelectReport = (selectedReport: ProductReport) => {
    setReport(selectedReport);
    navigate(`/report/${asin}/${selectedReport.id}`, { replace: true });
    setShowHistory(false);
  };
  
  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="size-12 text-rose-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载报告中...</p>
        </div>
      </div>
    );
  }
  
  // 生成中状态
  if (isGenerating) {
    const typeConfig = REPORT_TYPE_CONFIG[generatingReportType];
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative inline-block">
            <Loader2 className="size-16 text-rose-500 animate-spin" />
            <span className="text-3xl absolute -top-2 -right-2">{typeConfig.icon}</span>
          </div>
          <p className="mt-6 text-xl font-medium text-gray-900 dark:text-white">
            AI 正在撰写 {typeConfig.label}...
          </p>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{typeConfig.description}</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">预计需要 30-60 秒，请耐心等待</p>
          <div className="mt-6 w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full" style={{
              animation: 'progress 30s ease-in-out forwards'
            }} />
          </div>
        </div>
        <style>{`
          @keyframes progress {
            0% { width: 0%; }
            10% { width: 15%; }
            30% { width: 40%; }
            50% { width: 60%; }
            70% { width: 75%; }
            90% { width: 90%; }
            100% { width: 95%; }
          }
        `}</style>
      </div>
    );
  }
  
  // 错误状态
  if (error && !report) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <AlertCircle className="size-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">暂无报告</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/reader/${asin}`}>
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="size-4" />
                返回产品详情
              </Button>
            </Link>
            <Button 
              onClick={() => handleGenerateReport('comprehensive')}
              className="gap-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
            >
              <FileText className="size-4" />
              立即生成报告
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // 报告展示
  return (
    <>
      {/* 打印样式 */}
      <style>{`
        @media print {
          @page {
            margin: 2cm;
            size: A4;
          }
          
          body {
            background: white !important;
            color: black !important;
          }
          
          /* 隐藏所有交互元素 */
          button, a, .print\\:hidden {
            display: none !important;
          }
          
          /* 优化打印字体和间距 */
          * {
            color: black !important;
            background: white !important;
          }
          
          /* 确保图表和卡片在打印时正常显示 */
          .bg-gray-50, .bg-gray-100, .bg-white {
            background: white !important;
          }
          
          /* 优化进度条在打印时的显示 */
          .bg-blue-500, .bg-purple-500, .bg-orange-500, 
          .bg-pink-500, .bg-cyan-500, .bg-emerald-500,
          .bg-red-500, .bg-amber-500, .bg-indigo-500, .bg-rose-500 {
            background: #e5e7eb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          /* 确保边框在打印时可见 */
          .border-gray-200, .border-gray-300 {
            border-color: #d1d5db !important;
          }
          
          /* 优化间距 */
          .mb-8, .mb-10, .mb-12 {
            margin-bottom: 1.5rem !important;
          }
          
          .p-8, .p-10 {
            padding: 1rem !important;
          }
          
          /* 避免分页时断开重要内容 */
          .stats-dashboard, .card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
      
      <div className={`min-h-screen bg-white dark:bg-gray-900 print:bg-white ${
        isFullscreen ? 'fixed inset-0 z-40 w-screen h-screen overflow-y-auto' : ''
      }`}>
      {/* 顶部导航栏 - 打印时隐藏 */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 print:hidden">
        <div className="max-w-[1700px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/reader/${asin}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-rose-600" />
              <span className="font-medium text-gray-900 dark:text-white">产品分析报告</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {reportHistory.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="gap-1.5"
              >
                <History className="size-4" />
                历史 ({reportHistory.length})
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5"
            >
              <Share2 className="size-4" />
              分享
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyReport}
              className="gap-1.5"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? '已复制' : '复制'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5"
            >
              <ExternalLink className="size-4" />
              打印
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFullscreenClick}
              className="gap-1.5"
              title={isFullscreen ? '退出沉浸模式' : '进入沉浸模式'}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              沉浸
            </Button>
            <div className="relative">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowTypeSelector(!showTypeSelector)}
                disabled={isGenerating}
                className="gap-1.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
              >
                <RefreshCw className="size-4" />
                生成新报告
                <ChevronDown className="size-3.5" />
              </Button>
              
              {/* 报告类型选择下拉 */}
              {showTypeSelector && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
                  <div className="p-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">选择报告类型</div>
                    {(Object.keys(REPORT_TYPE_CONFIG) as ReportType[]).map((type) => {
                      const config = REPORT_TYPE_CONFIG[type];
                      return (
                        <button
                          key={type}
                          onClick={() => handleGenerateReport(type)}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{config.icon}</span>
                            <div>
                              <div className="font-medium text-sm text-gray-900 dark:text-white">{config.label}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{config.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 历史报告下拉 */}
        {showHistory && reportHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
            <div className="max-w-[1700px] mx-auto px-8 py-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">历史报告</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {reportHistory.map((r) => {
                  const typeConfig = REPORT_TYPE_CONFIG[r.report_type as ReportType] || REPORT_TYPE_CONFIG.comprehensive;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectReport(r)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        r.id === report?.id 
                          ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{typeConfig.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{r.title || '未命名报告'}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">
                              {typeConfig.label}
                            </span>
                            <span>{formatDate(r.created_at)}</span>
                            {(r.analysis_data?.total_reviews || (r.analysis_data as any)?.meta?.total_reviews) && (
                              <span>{(r.analysis_data?.total_reviews || (r.analysis_data as any)?.meta?.total_reviews)} 条评论</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>
      
      {/* 报告内容 */}
      <main className="max-w-[1700px] mx-auto px-8 py-12 print:max-w-none print:px-12 print:py-8">
        <div className="xl:grid xl:grid-cols-[260px_minmax(0,1fr)_260px] xl:gap-10">
          {/* 左侧大纲（大屏） */}
          <aside className="hidden xl:block print:hidden">
            {/* 留白：大纲使用 fixed 固定在视口，不放在流内，避免随页面滚动 */} 
          </aside>

          {/* 中间报告主体 */}
          <div className="min-w-0">
            {/* 产品信息卡片 */}
            {product && (
              <div className="mb-8 print:mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 print:border-gray-300 print:p-4">
                <div className="flex items-start gap-6 print:gap-4">
                  {/* 产品图片 */}
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.title_translated || product.title || '产品图片'}
                      className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0 print:w-24 print:h-24"
                    />
                  )}
                  {/* 产品信息 */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 print:text-xl print:mb-1">
                      {product.title_translated || product.title || '产品标题'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400 print:gap-3 print:text-xs">
                      <span className="px-3 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-md text-xs font-medium print:px-2 print:py-0.5">
                        ASIN: {product.asin}
                      </span>
                      {product.average_rating > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-yellow-500">★</span>
                          {product.average_rating.toFixed(1)} 分
                        </span>
                      )}
                      {product.total_reviews > 0 && (
                        <span>{product.total_reviews.toLocaleString()} 条评论</span>
                      )}
                      {product.price && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">{product.price}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 报告元信息 */}
            {report && (
              <>
                <div className="mb-10 print:mb-6">
                  <div className="flex items-start gap-6 mb-4 print:gap-4 print:mb-3">
                    {/* 报告类型图标 */}
                    {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                      <span className="text-5xl print:text-3xl">
                        {REPORT_TYPE_CONFIG[report.report_type as ReportType].icon}
                      </span>
                    )}
                    <div className="flex-1">
                      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 print:text-2xl print:mb-1">
                        {report.title || '产品深度洞察报告'}
                      </h1>
                      {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                        <p className="text-lg text-gray-500 dark:text-gray-400 print:text-sm">
                          {REPORT_TYPE_CONFIG[report.report_type as ReportType].description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400 print:gap-4 print:text-xs">
                    {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md text-xs font-medium print:px-2 print:py-0.5">
                        {REPORT_TYPE_CONFIG[report.report_type as ReportType].label}
                      </span>
                    )}
                    <span className="flex items-center gap-2 print:gap-1.5">
                      <Calendar className="size-4 print:size-3" />
                      {formatDate(report.created_at)}
                    </span>
                    {(report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews) && (
                      <span className="flex items-center gap-2 print:gap-1.5">
                        <BarChart3 className="size-4 print:size-3" />
                        基于 {report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews} 条评论分析
                      </span>
                    )}
                    <span className="px-3 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-md text-xs font-medium print:px-2 print:py-0.5">
                      ASIN: {asin}
                    </span>
                  </div>
                </div>

                {/* 报告内容 - 根据格式选择渲染器 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-10 print:bg-white print:p-0 print:rounded-none print:shadow-none print:border-0">
                  {isJsonReport ? (
                    <ErrorBoundary>
                      <JsonReportRenderer 
                        content={report.content} 
                        reportType={(report.report_type as ReportType) || 'comprehensive'}
                        analysisData={report.analysis_data}
                        asin={asin}
                        onSectionsChange={setReportSections}
                        onDrawerStateChange={setIsDrawerOpen}
                      />
                    </ErrorBoundary>
                  ) : (
                    <MarkdownRenderer content={report.content} />
                  )}
                </div>
              </>
            )}
          </div>

          {/* 右侧对称留白列 */}
          <aside className="hidden xl:block print:hidden" />
        </div>

        {/* 左侧固定大纲（仅 JSON 报告，且大屏显示；打印隐藏） */}
        {isJsonReport && reportSections.length > 0 && (
          <TableOfContents 
            sections={reportSections} 
            className="print:hidden"
            isDrawerOpen={isDrawerOpen}
          />
        )}
      </main>
    </div>
    </>
  );
}

export default ReportPage;

