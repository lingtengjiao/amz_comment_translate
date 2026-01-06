/**
 * ProductReportDialog - 产品分析报告弹窗
 * 
 * 功能：
 * 1. 检查前置条件（是否完成洞察提取和主题提取）
 * 2. 显示数据预览
 * 3. 生成并展示 AI 分析报告（Markdown 格式）
 * 4. 支持查看历史报告（秒开）
 * 5. 支持删除历史报告
 */
import { useState, useEffect, useRef, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Sparkles,
  Users,
  MapPin,
  Target,
  TrendingDown,
  TrendingUp,
  Copy,
  Check,
  ExternalLink,
  History,
  Clock,
  ChevronLeft,
  Trash2,
  RefreshCw,
  Link2,
  Calendar,
  BarChart3
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { 
  generateReport, 
  getReportPreview, 
  getReportHistory,
  getLatestReport,
  deleteReport 
} from '@/api/service';
import type { ReportStats, ProductReport, ApiReportPreviewResponse } from '@/api/types';

interface ProductReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
  productTitle: string;
  ratingStats: {
    totalReviews: number;
    translatedReviews: number;
    reviewsWithInsights: number;
    reviewsWithThemes: number;
  };
}

// 简单的 Markdown 渲染组件
const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];
    let inList = false;
    
    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-3 text-gray-700 dark:text-gray-300">
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
          <h1 key={index} className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
            {trimmed.slice(2)}
          </h1>
        );
        return;
      }
      
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={index} className="text-xl font-bold text-gray-900 dark:text-white mt-6 mb-3 flex items-center gap-2">
            {trimmed.slice(3)}
          </h2>
        );
        return;
      }
      
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
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
          <hr key={index} className="my-6 border-gray-200 dark:border-gray-700" />
        );
        return;
      }
      
      flushList();
      elements.push(
        <p 
          key={index} 
          className="text-gray-700 dark:text-gray-300 leading-relaxed my-3"
          dangerouslySetInnerHTML={{ __html: parseInline(trimmed) }}
        />
      );
    });
    
    flushList();
    return elements;
  };
  
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {renderMarkdown(content)}
    </div>
  );
});

// 视图类型
type ViewMode = 'preview' | 'report' | 'history';

export const ProductReportDialog = memo(function ProductReportDialog({
  isOpen,
  onClose,
  asin,
  productTitle,
  ratingStats
}: ProductReportDialogProps) {
  const navigate = useNavigate();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<ProductReport | null>(null);
  const [reportHistory, setReportHistory] = useState<ProductReport[]>([]);
  const [previewData, setPreviewData] = useState<ApiReportPreviewResponse | null>(null);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // 检查前置条件
  const hasEnoughReviews = ratingStats.translatedReviews >= 10;
  const hasInsights = ratingStats.reviewsWithInsights > 0;
  const hasThemes = ratingStats.reviewsWithThemes > 0;
  const canGenerate = hasEnoughReviews && hasInsights && hasThemes;
  
  // 重置状态
  const resetState = () => {
    setViewMode('preview');
    setCurrentReport(null);
    setReportHistory([]);
    setPreviewData(null);
    setStats(null);
    setError(null);
  };
  
  // 加载预览数据
  useEffect(() => {
    if (isOpen) {
      loadPreview();
    } else {
      resetState();
    }
  }, [isOpen]);
  
  // 组件卸载时清理 AbortController
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);
  
  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getReportPreview(asin);
      setPreviewData(response);
      if (response.success && response.stats) {
        setStats(response.stats);
      }
      
      // 如果有历史报告，自动加载最新的
      if (response.has_existing_report && response.latest_report_id) {
        try {
          const latestReport = await getLatestReport(asin);
          setCurrentReport(latestReport);
          setViewMode('report');
        } catch {
          // 忽略错误，用户可以手动生成新报告
        }
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
      setError('加载预览失败');
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getReportHistory(asin, 20);
      if (response.success) {
        setReportHistory(response.reports);
        setViewMode('history');
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setError('加载历史报告失败');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGenerateReport = async () => {
    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // 使用 fetch 并支持取消
      const response = await fetch(`/api/v1/products/${asin}/report/generate`, {
        method: 'POST',
        signal: abortController.signal,
      });
      
      // 检查是否被取消
      if (abortController.signal.aborted) {
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let message = response.statusText;
        try {
          const errorJson = JSON.parse(errorText);
          message = errorJson.detail || errorJson.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }
      
      const result = await response.json();
      
      // 再次检查是否被取消
      if (abortController.signal.aborted) {
        return;
      }
      
      if (result.success && result.report) {
        setCurrentReport(result.report);
        if (result.stats) {
          setStats(result.stats);
        }
        setViewMode('report');
      } else {
        setError(result.error || '报告生成失败，请稍后重试');
      }
    } catch (err: unknown) {
      // 如果是取消操作，不显示错误
      if (err instanceof Error && err.name === 'AbortError') {
        setError(null);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError(`报告生成失败: ${errorMessage}`);
    } finally {
      if (!abortController.signal.aborted) {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    }
  };
  
  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setError(null);
    }
  };
  
  const handleViewReport = (report: ProductReport) => {
    setCurrentReport(report);
    setViewMode('report');
  };
  
  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('确定要删除这份报告吗？')) return;
    
    setDeletingId(reportId);
    try {
      await deleteReport(asin, reportId);
      // 更新历史列表
      setReportHistory(prev => prev.filter(r => r.id !== reportId));
      // 如果删除的是当前显示的报告，返回预览
      if (currentReport?.id === reportId) {
        setCurrentReport(null);
        setViewMode('preview');
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
      setError('删除报告失败');
    } finally {
      setDeletingId(null);
    }
  };
  
  const handleCopyReport = async () => {
    if (!currentReport?.content) return;
    try {
      await navigator.clipboard.writeText(currentReport.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const handleOpenInNewWindow = () => {
    if (!currentReport?.id || !asin) return;
    // 跳转到报告独立页面
    navigate(`/report/${asin}/${currentReport.id}`);
    onClose(); // 关闭弹窗
  };
  
  const handleClose = () => {
    resetState();
    onClose();
  };
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '未知时间';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="size-5 text-emerald-600" />
            产品分析报告
            {viewMode === 'history' && (
              <span className="text-sm font-normal text-gray-500">- 历史报告</span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ========== 预览视图 ========== */}
          {viewMode === 'preview' && !isGenerating && (
            <>
              {/* 历史报告提示 */}
              {previewData?.has_existing_report && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                      <History className="size-4" />
                      <span className="text-sm">
                        存在历史报告（{formatDate(previewData.latest_report_date || null)}）
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadHistory}
                        className="text-blue-600 hover:text-blue-700 h-7"
                      >
                        <Clock className="size-3.5 mr-1" />
                        查看历史
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 前置条件检查 */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  报告生成条件检查
                </h3>
                <div className="space-y-3">
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                    hasEnoughReviews 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                  }`}>
                    {hasEnoughReviews ? (
                      <CheckCircle2 className="size-5 flex-shrink-0" />
                    ) : (
                      <XCircle className="size-5 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">
                      已翻译评论: {ratingStats.translatedReviews} 条
                      {!hasEnoughReviews && <span className="text-xs font-normal ml-1">（需要至少 10 条）</span>}
                    </span>
                  </div>
                  
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                    hasInsights 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  }`}>
                    {hasInsights ? (
                      <CheckCircle2 className="size-5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="size-5 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">
                      洞察提取: {ratingStats.reviewsWithInsights} 条评论
                      {!hasInsights && <span className="text-xs font-normal ml-1">（请先点击"提取洞察"）</span>}
                    </span>
                  </div>
                  
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                    hasThemes 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  }`}>
                    {hasThemes ? (
                      <CheckCircle2 className="size-5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="size-5 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">
                      主题提取: {ratingStats.reviewsWithThemes} 条评论
                      {!hasThemes && <span className="text-xs font-normal ml-1">（请先点击"提取主题"）</span>}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 数据预览 */}
              {stats && (
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    数据预览（基于 {stats.total_reviews} 条评论）
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {stats.context_stats && (
                      <>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-semibold mb-2">
                            <Users className="size-4" />
                            Who（人群）
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {stats.context_stats.who || '无数据'}
                          </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-semibold mb-2">
                            <MapPin className="size-4" />
                            Where/When（场景）
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {stats.context_stats.scene || '无数据'}
                          </p>
                        </div>
                        <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
                          <div className="flex items-center gap-2 text-pink-700 dark:text-pink-400 text-sm font-semibold mb-2">
                            <Sparkles className="size-4" />
                            Why（动机）
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {stats.context_stats.why || '无数据'}
                          </p>
                        </div>
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm font-semibold mb-2">
                            <Target className="size-4" />
                            What（任务）
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {stats.context_stats.what || '无数据'}
                          </p>
                        </div>
                      </>
                    )}
                    
                    {stats.insight_stats && (
                      <>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 col-span-2">
                          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-semibold mb-2">
                            <TrendingDown className="size-4" />
                            痛点 Top 3
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line line-clamp-4">
                            {stats.insight_stats.weakness?.replace(/^\s+-\s+/gm, '• ') || '无数据'}
                          </p>
                        </div>
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 col-span-2">
                          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold mb-2">
                            <TrendingUp className="size-4" />
                            爽点 Top 3
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line line-clamp-4">
                            {stats.insight_stats.strength?.replace(/^\s+-\s+/gm, '• ') || '无数据'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* ========== 历史报告列表视图 ========== */}
          {viewMode === 'history' && !isLoading && (
            <div className="space-y-3">
              {reportHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  暂无历史报告
                </div>
              ) : (
                reportHistory.map((report) => (
                  <div 
                    key={report.id}
                    className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-white truncate">
                          {report.title || '未命名报告'}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatDate(report.created_at)}
                          </span>
                          {report.analysis_data?.total_reviews && (
                            <span>基于 {report.analysis_data.total_reviews} 条评论</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewReport(report)}
                          className="text-emerald-600 hover:text-emerald-700 h-8"
                        >
                          查看
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteReport(report.id)}
                          disabled={deletingId === report.id}
                          className="text-red-500 hover:text-red-600 h-8"
                        >
                          {deletingId === report.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {/* ========== 报告内容视图 ========== */}
          {viewMode === 'report' && currentReport && (
            <div className="space-y-4">
              {/* 报告元信息 */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {currentReport.title || '产品分析报告'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        生成于 {formatDate(currentReport.created_at)}
                      </span>
                      {currentReport.analysis_data?.total_reviews && (
                        <span className="flex items-center gap-1.5">
                          <BarChart3 className="size-4" />
                          基于 {currentReport.analysis_data.total_reviews} 条评论
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 报告独立页面链接 */}
                  <Link 
                    to={`/report/${asin}/${currentReport.id}`}
                    target="_blank"
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Link2 className="size-4" />
                    独立页面
                  </Link>
                </div>
                {/* 报告链接提示 */}
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <Link2 className="size-4 flex-shrink-0" />
                    <span className="flex-1 break-all">
                      报告链接：
                      <code className="ml-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-800 dark:text-blue-200 font-mono text-xs">
                        {window.location.origin}/report/{asin}/{currentReport.id}
                      </code>
                    </span>
                  </p>
                </div>
              </div>
              
              {/* 报告 Markdown 内容 */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                <MarkdownRenderer content={currentReport.content} />
              </div>
            </div>
          )}
          
          {/* ========== 加载状态 ========== */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 text-gray-400 animate-spin" />
            </div>
          )}
          
          {/* ========== 生成中状态 ========== */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <Loader2 className="size-12 text-emerald-500 animate-spin" />
                <Sparkles className="size-5 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  AI 正在撰写报告...
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  预计需要 30-60 秒，请耐心等待
                </p>
              </div>
              <div className="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full animate-progress" style={{
                  animation: 'progress 30s ease-in-out forwards'
                }} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelGeneration}
                className="mt-4 gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <XCircle className="size-4" />
                取消生成
              </Button>
            </div>
          )}
          
          {/* ========== 错误提示 ========== */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-400 flex items-start gap-3">
              <AlertCircle className="size-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">操作失败</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>
        
        {/* ========== 底部操作栏 ========== */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {viewMode === 'report' && currentReport
              ? `报告 ID: ${currentReport.id.slice(0, 8)}...`
              : viewMode === 'history'
              ? `共 ${reportHistory.length} 份历史报告`
              : '基于 5W 分析 + 维度洞察生成深度商业报告'
            }
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'report' && currentReport ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('preview')}
                  className="gap-1.5"
                >
                  <ChevronLeft className="size-4" />
                  返回
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyReport}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      复制报告
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewWindow}
                  className="gap-1.5"
                >
                  <ExternalLink className="size-4" />
                  新窗口打开
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={!canGenerate || isGenerating}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  <RefreshCw className="size-4" />
                  重新生成
                </Button>
              </>
            ) : viewMode === 'history' ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('preview')}
                  className="gap-1.5"
                >
                  <ChevronLeft className="size-4" />
                  返回
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={!canGenerate || isGenerating}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Sparkles className="size-4" />
                  生成新报告
                </Button>
              </>
            ) : (
              <>
                {isGenerating ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelGeneration}
                    className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <XCircle className="size-4" />
                    取消生成
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClose}
                    >
                      取消
                    </Button>
                    {previewData?.has_existing_report && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadHistory}
                        className="gap-1.5"
                      >
                        <History className="size-4" />
                        历史报告
                      </Button>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleGenerateReport}
                      disabled={!canGenerate || isGenerating}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Sparkles className="size-4" />
                      {previewData?.has_existing_report ? '生成新报告' : '生成报告'}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* 进度条动画 CSS */}
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
      </DialogContent>
    </Dialog>
  );
});
