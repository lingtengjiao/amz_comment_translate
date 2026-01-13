/**
 * ProductReportDialog - 产品分析报告生成入口
 * 
 * 功能：
 * 1. 检查前置条件（是否完成洞察提取和主题提取）
 * 2. 显示数据预览
 * 3. 选择报告类型并生成
 * 4. 生成成功后跳转到独立报告页面
 */
import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  TrendingDown,
  TrendingUp,
  History,
  Lightbulb,
  BarChart3,
  Clock
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
  getReportHistory
} from '@/api/service';
import type { ReportStats, ApiReportPreviewResponse, ReportType, ProductReport } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';

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

export const ProductReportDialog = memo(function ProductReportDialog({
  isOpen,
  onClose,
  asin,
  ratingStats
}: ProductReportDialogProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<ApiReportPreviewResponse | null>(null);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [reportHistory, setReportHistory] = useState<ProductReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('comprehensive');
  const [isDataUnchanged, setIsDataUnchanged] = useState(false); // 数据是否未更新

  // 加载预览数据
  useEffect(() => {
    if (isOpen) {
      loadPreview();
    }
  }, [isOpen, asin]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);
    setIsDataUnchanged(false);
    try {
      const [data, history] = await Promise.all([
        getReportPreview(asin),
        getReportHistory(asin, 20) // 加载最近20份报告
      ]);
      setPreviewData(data);
      setStats(data.stats || null);
      setReportHistory(history.reports || []);
      
      // 检查数据是否与最新报告相同
      if (history.reports && history.reports.length > 0) {
        const latestReport = history.reports[0];
        const snapshot = (latestReport as any).data_snapshot;
        if (snapshot) {
          // 比较关键数据：总评论数、翻译数、洞察数、主题数
          const unchanged = 
            snapshot.total_reviews === ratingStats.totalReviews &&
            snapshot.translated_reviews === ratingStats.translatedReviews &&
            snapshot.reviews_with_insights === ratingStats.reviewsWithInsights &&
            snapshot.reviews_with_themes === ratingStats.reviewsWithThemes;
          setIsDataUnchanged(unchanged);
        }
      }
    } catch (err: any) {
      console.error('Failed to load preview:', err);
      setError(err.message || '加载预览数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 检查是否可以生成报告
  const meetsRequirements = 
    ratingStats.translatedReviews >= 10 &&
    ratingStats.reviewsWithInsights > 0 &&
    ratingStats.reviewsWithThemes > 0;
  
  // 满足条件且数据有更新才能生成
  const canGenerate = meetsRequirements && !isDataUnchanged;

  // 生成报告
  const handleGenerateReport = async () => {
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await generateReport(asin, selectedReportType);
      
      // 生成成功后，直接跳转到报告页面
      if (response.report?.id) {
        navigate(`/report/${asin}/${response.report.id}`);
        onClose(); // 关闭弹窗
      } else {
        setError('报告生成失败：未返回报告ID');
      }
    } catch (err: any) {
      console.error('Failed to generate report:', err);
      setError(err.message || '报告生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // 取消生成（简单重置状态）
  const handleCancelGeneration = () => {
    setIsGenerating(false);
    setError(null);
  };

  // 查看指定报告
  const handleViewReport = (reportId: string) => {
    navigate(`/report/${asin}/${reportId}`);
    onClose();
  };

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '未知时间';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <FileText className="size-5" />
            产品分析报告
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-6">
          {/* 前置条件检查 */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              报告生成条件检查
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {ratingStats.translatedReviews >= 10 ? (
                  <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0" />
                ) : (
                  <XCircle className="size-4 text-red-500 flex-shrink-0" />
                )}
                <span className={ratingStats.translatedReviews >= 10 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}>
                  已翻译评论: {ratingStats.translatedReviews} 条
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {ratingStats.reviewsWithInsights > 0 ? (
                  <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0" />
                ) : (
                  <XCircle className="size-4 text-red-500 flex-shrink-0" />
                )}
                <span className={ratingStats.reviewsWithInsights > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}>
                  洞察提取：{ratingStats.reviewsWithInsights} 条
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {ratingStats.reviewsWithThemes > 0 ? (
                  <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0" />
                ) : (
                  <XCircle className="size-4 text-red-500 flex-shrink-0" />
                )}
                <span className={ratingStats.reviewsWithThemes > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}>
                  完善洞察提取：{ratingStats.reviewsWithThemes} 条
                </span>
              </div>
            </div>
            {!meetsRequirements && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ 请先完成翻译、洞察提取和完善洞察提取后才能生成报告
                </p>
              </div>
            )}
            {meetsRequirements && isDataUnchanged && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                <p className="text-xs text-rose-700 dark:text-rose-400">
                  💡 数据未更新，无需重新生成报告。您可以查看上方的历史报告。
                </p>
              </div>
            )}
          </div>

          {/* 历史报告列表 */}
          {reportHistory.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <History className="size-5 text-rose-600 dark:text-rose-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  历史报告（{reportHistory.length} 份）
                </h3>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {reportHistory.map((report) => {
                  const reportTypeConfig = REPORT_TYPE_CONFIG[report.report_type as ReportType] || REPORT_TYPE_CONFIG.comprehensive;
                  // 获取数据标签
                  const dataLabel = (report as any).data_snapshot 
                    ? `基于 ${(report as any).data_snapshot.total_reviews || 0} 条评论`
                    : null;
                  return (
                    <button
                      key={report.id}
                      onClick={() => handleViewReport(report.id)}
                      className="w-full p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-rose-300 dark:hover:border-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all text-left group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-lg">{reportTypeConfig.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-white text-sm">
                              {report.title || reportTypeConfig.label}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              report.status === 'completed'
                                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                                : report.status === 'failed'
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            }`}>
                              {report.status === 'completed' ? '已完成' : report.status === 'failed' ? '失败' : '处理中'}
                            </span>
                            {dataLabel && (
                              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                {dataLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <span>{reportTypeConfig.label}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatDate(report.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-gray-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                          <FileText className="size-5" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 报告类型选择 */}
          {meetsRequirements && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                选择报告类型
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(REPORT_TYPE_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedReportType(key as ReportType)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedReportType === key
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{config.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">
                          {config.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {config.description}
                        </div>
                        {previewData?.report_counts?.[key as ReportType] && (
                          <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                            已有 {previewData.report_counts[key as ReportType]} 份
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 数据预览 */}
          {stats && meetsRequirements && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <BarChart3 className="size-4" />
                数据预览（基于 {stats.total_reviews} 条评论）
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {stats.insight && (
                  <>
                    {stats.insight.strength && stats.insight.strength.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="size-4 text-emerald-500" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">优势</span>
                        </div>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {stats.insight.strength[0]?.value || 0}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {stats.insight.strength[0]?.name || '-'}
                        </div>
                      </div>
                    )}
                    {stats.insight.weakness && stats.insight.weakness.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingDown className="size-4 text-red-500" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">痛点</span>
                        </div>
                        <div className="text-lg font-bold text-red-600 dark:text-red-400">
                          {stats.insight.weakness[0]?.value || 0}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {stats.insight.weakness[0]?.name || '-'}
                        </div>
                      </div>
                    )}
                    {stats.insight.suggestion && stats.insight.suggestion.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-1">
                          <Lightbulb className="size-4 text-blue-500" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">建议</span>
                        </div>
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {stats.insight.suggestion[0]?.value || 0}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {stats.insight.suggestion[0]?.name || '-'}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 text-gray-400 animate-spin" />
            </div>
          )}

          {/* 生成中状态 */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <Loader2 className="size-12 text-rose-500 animate-spin" />
                <span className="text-2xl absolute -top-2 -right-2">{REPORT_TYPE_CONFIG[selectedReportType].icon}</span>
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  AI 正在撰写 {REPORT_TYPE_CONFIG[selectedReportType].label}...
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {REPORT_TYPE_CONFIG[selectedReportType].description}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  预计需要 30-60 秒，请耐心等待
                </p>
              </div>
              <div className="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full animate-progress" style={{
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

          {/* 错误提示 */}
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

        {/* 底部操作栏 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            基于 5W 分析 + 维度洞察生成深度商业报告
          </div>
          <div className="flex items-center gap-2">
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
                  onClick={onClose}
                >
                  取消
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={!canGenerate || isGenerating}
                  className="gap-1.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
                >
                  <span className="mr-1">{REPORT_TYPE_CONFIG[selectedReportType].icon}</span>
                  生成{REPORT_TYPE_CONFIG[selectedReportType].label}
                </Button>
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