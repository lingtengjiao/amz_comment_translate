/**
 * ReportPage - 产品分析报告独立页面
 * 
 * 路由: /report/:asin/:reportId?
 * - /report/B0CYT6D2ZS - 显示该产品的最新报告
 * - /report/B0CYT6D2ZS/xxx-xxx-xxx - 显示指定 ID 的报告
 */
import { useState, useEffect, memo } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { Button } from './ui/button';
import { 
  getLatestReport, 
  getReportById, 
  getReportHistory,
  generateReport 
} from '@/api/service';
import type { ProductReport } from '@/api/types';

// Markdown 渲染组件
const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];
    let inList = false;
    
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
      inList = false;
    };
    
    const parseInline = (text: string): string => {
      return text
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/"(.+?)"/g, '<span class="text-emerald-600 dark:text-emerald-400">"$1"</span>')
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
          <h1 key={index} className="text-3xl font-bold text-gray-900 dark:text-white mt-8 mb-6 pb-3 border-b-2 border-emerald-500">
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
        inList = true;
        listItems.push(trimmed.slice(2));
        return;
      }
      
      if (/^\d+\.\s/.test(trimmed)) {
        inList = true;
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

export function ReportPage() {
  const { asin, reportId } = useParams<{ asin: string; reportId?: string }>();
  const navigate = useNavigate();
  
  const [report, setReport] = useState<ProductReport | null>(null);
  const [reportHistory, setReportHistory] = useState<ProductReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
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
      let loadedReport: ProductReport;
      
      if (reportId) {
        // 加载指定 ID 的报告
        loadedReport = await getReportById(asin, reportId);
      } else {
        // 加载最新报告
        loadedReport = await getLatestReport(asin);
      }
      
      setReport(loadedReport);
      
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
  
  const handleGenerateReport = async () => {
    if (!asin) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await generateReport(asin);
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
          <Loader2 className="size-12 text-emerald-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载报告中...</p>
        </div>
      </div>
    );
  }
  
  // 生成中状态
  if (isGenerating) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative inline-block">
            <Loader2 className="size-16 text-emerald-500 animate-spin" />
            <FileText className="size-6 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="mt-6 text-xl font-medium text-gray-900 dark:text-white">AI 正在撰写报告...</p>
          <p className="mt-2 text-gray-500 dark:text-gray-400">预计需要 30-60 秒，请耐心等待</p>
          <div className="mt-6 w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-emerald-500 rounded-full" style={{
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
              onClick={handleGenerateReport}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
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
    <div className="min-h-screen bg-white dark:bg-gray-900 print:bg-white">
      {/* 顶部导航栏 - 打印时隐藏 */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/reader/${asin}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-emerald-600" />
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
              variant="default"
              size="sm"
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <RefreshCw className="size-4" />
              重新生成
            </Button>
          </div>
        </div>
        
        {/* 历史报告下拉 */}
        {showHistory && reportHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
            <div className="max-w-5xl mx-auto px-4 py-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">历史报告</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {reportHistory.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectReport(r)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      r.id === report?.id 
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{r.title || '未命名报告'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(r.created_at)}
                      {r.analysis_data?.total_reviews && ` · ${r.analysis_data.total_reviews} 条评论`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
      
      {/* 报告内容 */}
      <main className="max-w-4xl mx-auto px-4 py-8 print:py-0 print:max-w-none">
        {/* 报告元信息 */}
        {report && (
          <>
            <div className="mb-8 print:mb-4">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3 print:text-2xl">
                {report.title || '产品深度洞察报告'}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  {formatDate(report.created_at)}
                </span>
                {report.analysis_data?.total_reviews && (
                  <span className="flex items-center gap-1.5">
                    <BarChart3 className="size-4" />
                    基于 {report.analysis_data.total_reviews} 条评论分析
                  </span>
                )}
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs">
                  ASIN: {asin}
                </span>
              </div>
            </div>
            
            {/* Markdown 报告内容 */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8 print:bg-white print:p-0 print:rounded-none">
              <MarkdownRenderer content={report.content} />
            </div>
            
            {/* 底部信息 */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400 print:hidden">
              <p>报告 ID: {report.id}</p>
              <p className="mt-1">
                此报告由 AI 自动生成，基于用户评论数据分析
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default ReportPage;

