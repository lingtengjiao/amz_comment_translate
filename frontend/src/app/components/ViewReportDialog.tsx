/**
 * ViewReportDialog - 查看报告弹窗
 * 显示报告列表，用户可以查看历史报告
 */
import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, History, ExternalLink, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { getReportHistory } from '@/api/service';
import type { ProductReport, ReportType } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';

interface ViewReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
}

export const ViewReportDialog = memo(function ViewReportDialog({
  isOpen,
  onClose,
  asin
}: ViewReportDialogProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 加载报告列表
  useEffect(() => {
    if (isOpen && asin) {
      loadReports();
    }
  }, [isOpen, asin]);

  const loadReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getReportHistory(asin, 20);
      setReports(response.reports || []);
    } catch (err: any) {
      console.error('Failed to load reports:', err);
      setError(err.message || '加载报告列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 查看报告（从详情页跳转，传递来源信息）
  const handleViewReport = (reportId: string) => {
    navigate(`/report/${asin}/${reportId}`, { state: { from: 'reader' } });
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
      <DialogContent className="max-w-3xl w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <FileText className="size-5" />
            查看报告
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500">{error}</div>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">暂无报告</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <History className="size-4" />
                共 {reports.length} 份报告
              </div>
              {reports.map((report) => {
                // 获取报告类型配置
                const typeConfig = report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType]
                  ? REPORT_TYPE_CONFIG[report.report_type as ReportType]
                  : { label: '分析报告', description: '', icon: '📄' };
                
                return (
                  <div
                    key={report.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{typeConfig.icon}</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {typeConfig.label}
                          </span>
                        </div>
                        {typeConfig.description && (
                          <p className="text-xs text-gray-500 mb-2">{typeConfig.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatDate(report.created_at)}
                          </div>
                          {(report as any).data_snapshot && (
                            <div className="text-xs">
                              基于 {((report as any).data_snapshot.total_reviews || 0)} 条评论
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewReport(report.id)}
                        className="gap-2"
                      >
                        <ExternalLink className="size-4" />
                        查看
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
