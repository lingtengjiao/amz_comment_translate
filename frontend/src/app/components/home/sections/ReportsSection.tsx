/**
 * 报告库页面 - 使用真实 API
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, FileText, Download, Trash2, Loader2, Clock, ArrowRight, Copy } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { useHome } from '../HomeContext';
import apiService from '../../../../api/service';
import type { ProductReport } from '../../../../api/types';

// 报告类型配置
const REPORT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  comprehensive: { label: '综合战略版', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  operations: { label: '运营市场版', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  product: { label: '产品研发版', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  supply_chain: { label: '供应链版', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

interface ReportWithProduct extends ProductReport {
  product?: {
    asin: string;
    title: string;
    image_url?: string;
  };
}

export function ReportsSection() {
  const navigate = useNavigate();
  const { reportsSearchQuery, setReportsSearchQuery, reportsTypeFilter, setReportsTypeFilter } = useHome();
  
  const [reports, setReports] = useState<ReportWithProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载报告列表
  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      // 只获取当前用户关注的产品的报告
      const reportsRes = await apiService.getAllReports(200, undefined, true);
      
      if (reportsRes.reports) {
        const allReports: ReportWithProduct[] = reportsRes.reports.map((report: any) => ({
          ...report,
          product: report.product ? {
            asin: report.product.asin,
            title: report.product.title || report.product.asin,
            image_url: report.product.image_url || undefined,
          } : undefined,
        }));
        
        setReports(allReports);
      }
    } catch (err: any) {
      console.error('加载报告失败:', err);
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 复制 ASIN
  const handleCopyAsin = (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(asin);
    toast.success('ASIN 已复制');
  };

  // 删除报告
  const handleDelete = async (report: ReportWithProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!report.product?.asin || !confirm('确定要删除这份报告吗？')) return;
    
    try {
      await apiService.deleteReport(report.product.asin, report.id);
      setReports(prev => prev.filter(r => r.id !== report.id));
      toast.success('已删除');
    } catch (err: any) {
      toast.error('删除失败');
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 过滤报告
  const filteredReports = reports.filter(report => {
    const searchLower = reportsSearchQuery.toLowerCase();
    const matchesSearch = 
      (report.title && report.title.toLowerCase().includes(searchLower)) ||
      (report.product?.asin && report.product.asin.toLowerCase().includes(searchLower)) ||
      (report.product?.title && report.product.title.toLowerCase().includes(searchLower));
    
    const matchesType = reportsTypeFilter === 'all' || report.report_type === reportsTypeFilter;
    
    return matchesSearch && matchesType;
  });

  return (
    <div>
      {/* 标题 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-2 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">报告库</h3>
            <p className="text-sm text-slate-600">所有生成的分析报告都在这里</p>
          </div>
        </div>

        {/* 搜索和筛选 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索报告标题、ASIN..."
              value={reportsSearchQuery}
              onChange={(e) => setReportsSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>
          <select 
            value={reportsTypeFilter}
            onChange={(e) => setReportsTypeFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent bg-white"
          >
            <option value="all">全部类型</option>
            <option value="comprehensive">综合战略版</option>
            <option value="operations">运营市场版</option>
            <option value="product">产品研发版</option>
            <option value="supply_chain">供应链版</option>
          </select>
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      )}

      {/* 空状态 */}
      {!loading && filteredReports.length === 0 && (
        <div className="text-center py-20">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {reportsSearchQuery ? '没有找到匹配的报告' : '暂无报告'}
          </p>
        </div>
      )}

      {/* 报告列表 */}
      {!loading && filteredReports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredReports.map((report) => {
            const typeConfig = REPORT_TYPE_LABELS[report.report_type] || 
              { label: report.report_type, color: 'bg-slate-50 text-slate-700 border-slate-200' };
            
            return (
              <Card 
                key={report.id}
                className="border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group bg-white"
                onClick={() => navigate(`/report/${report.product?.asin}/${report.id}`, { state: { from: 'reports' } })}
              >
                <CardContent className="p-4">
                  {/* 类型标签 */}
                  <Badge className={`${typeConfig.color} mb-3`}>
                    {typeConfig.label}
                  </Badge>

                  {/* 产品信息 */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 flex-shrink-0 overflow-hidden bg-slate-100 rounded-lg">
                      <ImageWithFallback 
                        src={report.product?.image_url || ''}
                        alt={report.product?.title || 'Product'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 text-sm leading-snug overflow-hidden" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.25rem',
                        maxHeight: '2.5rem'
                      }}>
                        {report.title || report.product?.title || report.product?.asin}
                      </h4>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-slate-500">{report.product?.asin}</span>
                        {report.product?.asin && (
                          <button
                            onClick={(e) => handleCopyAsin(report.product!.asin, e)}
                            className="flex-shrink-0 p-0.5 hover:bg-slate-200 rounded transition-colors"
                            title="复制 ASIN"
                          >
                            <Copy className="w-3 h-3 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 时间信息 */}
                  <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(report.created_at)}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/report/${report.product?.asin}/${report.id}`, { state: { from: 'reports' } });
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      查看报告
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(report, e)}
                      className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
