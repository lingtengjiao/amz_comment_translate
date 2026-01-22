/**
 * ReportPage - 智能报告独立页面（支持多种报告类型）
 * 
 * 路由: /report/:asin/:reportId?
 * - /report/B0CYT6D2ZS - 显示该产品的最新报告
 * - /report/B0CYT6D2ZS/xxx-xxx-xxx - 显示指定 ID 的报告
 * 
 * 支持的报告类型：
 * - comprehensive: 综合战略报告
 * - operations: 运营与市场策略报告
 * - product: 产品分析报告
 * - supply_chain: 供应链/质检报告
 */
import { useState, useEffect, memo, useMemo, Component, ErrorInfo, ReactNode, lazy, Suspense, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSectionCache } from '../hooks/useSectionCache';
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
  Minimize2,
  Download
} from 'lucide-react';
import { Button } from './ui/button';
import { 
  getLatestReport, 
  getReportById, 
  getReportHistory,
  generateReportAsync,
  getReportTaskStatus,
  getProductStats
} from '@/api/service';
import type { ProductReport, ReportType, ApiProduct } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { JsonReportRenderer } from './JsonReportRenderer';
import { TableOfContents } from './TableOfContents';
import { PrintHeader } from './PrintHeader';
import { PrintProvider, usePrintMode } from '../contexts/PrintContext';
import { CompareReviewSidebar } from './CompareReviewSidebar';
import { ShareButton } from './share/ShareButton';

// 懒加载独立报告页面（按报告类型分离）
const SupplyChainReportPage = lazy(() => import('./reports/supply-chain/SupplyChainReportPage'));
const ComprehensiveReportPage = lazy(() => import('./reports/comprehensive/ComprehensiveReportPage'));
const OperationsReportPage = lazy(() => import('./reports/operations/OperationsReportPage'));
const ProductReportPage = lazy(() => import('./reports/product/ProductReportPage'));

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

// 根据报告类型获取标题
function getReportTitle(reportType?: string): string {
  const titleMap: Record<ReportType, string> = {
    comprehensive: '综合战略报告',
    operations: '运营与市场策略报告',
    product: '产品分析报告',
    supply_chain: '供应链/质检报告'
  };
  
  if (!reportType || !(reportType in titleMap)) {
    return '产品分析报告'; // 默认标题
  }
  
  return titleMap[reportType as ReportType];
}

// 内部报告页面组件
function ReportPageInner() {
  const { asin, reportId } = useParams<{ asin: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // 获取来源信息（从 location.state 或 URL 参数）
  const from = (location.state as any)?.from || new URLSearchParams(location.search).get('from') || null;
  
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
  const [generatingProgress, setGeneratingProgress] = useState(0); // 后端真实进度
  const [generatingStep, setGeneratingStep] = useState('准备中...'); // 当前步骤
  const [displayProgress, setDisplayProgress] = useState(0); // 显示进度（含平滑）
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // 证据抽屉是否打开
  const [isFullscreen, setIsFullscreen] = useState(false); // 沉浸模式状态
  
  // 评论侧边栏状态
  const [reviewSidebar, setReviewSidebar] = useState<{
    isOpen: boolean;
    dimensionKey: string;
    dimensionLabel: string;
    tagLabel: string;
    totalCount: number;
  }>({
    isOpen: false,
    dimensionKey: '',
    dimensionLabel: '',
    tagLabel: '',
    totalCount: 0
  });
  
  // 打开评论侧边栏
  const openReviewSidebar = useCallback((dimensionKey: string, dimensionLabel: string, tagLabel: string, totalCount: number) => {
    setReviewSidebar({
      isOpen: true,
      dimensionKey,
      dimensionLabel,
      tagLabel,
      totalCount
    });
  }, []);
  
  // 关闭评论侧边栏
  const closeReviewSidebar = useCallback(() => {
    setReviewSidebar(prev => ({ ...prev, isOpen: false }));
  }, []);
  
  // 进度平滑过渡：当后端进度在 30%-90% 之间时，前端缓慢增长避免卡顿感
  useEffect(() => {
    // 当后端进度更新时，同步到显示进度
    if (generatingProgress > displayProgress) {
      setDisplayProgress(generatingProgress);
    }
    
    // 当后端进度在 30-85 之间时，启动平滑增长
    if (isGenerating && generatingProgress >= 30 && generatingProgress < 90) {
      const interval = setInterval(() => {
        setDisplayProgress(prev => {
          // 缓慢增长，最高到 88%，给最后完成留空间
          if (prev < 88 && prev >= generatingProgress) {
            return prev + 0.5; // 每秒增长 0.5%
          }
          return prev;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
    
    // 重置：当不在生成状态时，重置显示进度
    if (!isGenerating) {
      setDisplayProgress(0);
    }
  }, [isGenerating, generatingProgress]);
  
  // 判断当前报告是否为 JSON 格式
  const isJsonReport = useMemo(() => {
    return report?.content ? isJsonContent(report.content) : false;
  }, [report?.content]);
  
  // 使用缓存加载报告（3分钟 TTL）
  const cacheKey = asin ? `report_${asin}_${reportId || 'latest'}` : '';
  const { data: reportData, loading: cacheLoading, error: cacheError, refetch: refetchReport } = useSectionCache<{
    report: ProductReport;
    product: ApiProduct | null;
    history: ProductReport[];
  }>(
    cacheKey,
    async () => {
      if (!asin) throw new Error('ASIN 不能为空');
      
      // 并行加载报告和产品信息
      const [loadedReport, productStats] = await Promise.all([
        reportId ? getReportById(asin, reportId) : getLatestReport(asin),
        getProductStats(asin).catch(() => null) // 忽略产品信息加载错误
      ]);
      
      // 同时加载历史报告列表
      let history: ProductReport[] = [];
      try {
        const historyResponse = await getReportHistory(asin, 10);
        if (historyResponse.success) {
          history = historyResponse.reports;
        }
      } catch {
        // 忽略历史加载错误
      }
      
      return {
        report: loadedReport,
        product: productStats?.product || null,
        history
      };
    },
    { ttl: 3 * 60 * 1000 } // 3分钟缓存
  );

  // 同步缓存数据到 state
  useEffect(() => {
    if (reportData) {
      setReport(reportData.report);
      setProduct(reportData.product);
      setReportHistory(reportData.history);
    }
  }, [reportData]);

  useEffect(() => {
    setIsLoading(cacheLoading);
  }, [cacheLoading]);

  useEffect(() => {
    if (cacheError) {
      const errorMessage = cacheError.includes('404') || cacheError.includes('暂无报告')
        ? '该产品暂无分析报告，请先在产品详情页生成报告。'
        : `加载报告失败: ${cacheError}`;
      setError(errorMessage);
    } else {
      setError(null);
    }
  }, [cacheError]);

  const loadReport = () => {
    refetchReport();
  };
  
  // 🚀 异步生成报告（后台运行）
  const handleGenerateReport = async (type: ReportType) => {
    if (!asin) return;
    
    setGeneratingReportType(type);
    setGeneratingProgress(0);
    setGeneratingStep('准备中...');
    setIsGenerating(true);
    setError(null);
    setShowTypeSelector(false);
    
    try {
      // 1. 触发异步任务
      const startResponse = await generateReportAsync(asin, type);
      
      if (!startResponse.success || !startResponse.task_id) {
        throw new Error(startResponse.message || '启动报告生成失败');
      }
      
      const taskId = startResponse.task_id;
      console.log('[报告生成] 任务已启动:', taskId);
      
      // 2. 轮询任务状态
      const pollInterval = 2000;
      const maxAttempts = 90; // 最多 3 分钟
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusResponse = await getReportTaskStatus(asin, taskId);
          console.log('[报告生成] 状态:', statusResponse.status, '进度:', statusResponse.progress);
          
          // 更新真实进度
          if (statusResponse.progress !== undefined) {
            setGeneratingProgress(statusResponse.progress);
          }
          if (statusResponse.current_step) {
            setGeneratingStep(statusResponse.current_step);
          }
          
          if (statusResponse.status === 'completed') {
            if (statusResponse.report_id) {
              // 加载新报告
              // getReportById 直接返回 ProductReport 对象，不是 { success, report } 格式
              const reportData = await getReportById(asin, statusResponse.report_id);
              if (reportData && reportData.id) {
                setReport(reportData);
                // 保持来源信息
                navigate(`/report/${asin}/${reportData.id}`, { replace: true, state: { from: from || 'reader' } });
                // 重新加载历史
                const historyResponse = await getReportHistory(asin, 10);
                if (historyResponse.success) {
                  setReportHistory(historyResponse.reports);
                }
              }
              setIsGenerating(false);
              return;
            } else if (statusResponse.success === false) {
              // 任务完成但失败（report_id 为 null）
              throw new Error(statusResponse.error || '报告生成失败：未返回报告ID');
            }
          } else if (statusResponse.status === 'failed') {
            throw new Error(statusResponse.error || '报告生成失败');
          }
        } catch (pollError: unknown) {
          console.warn('[报告生成] 轮询出错，继续重试');
        }
      }
      
      throw new Error('报告生成超时，请稍后查看历史报告');
      
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
  
  // 获取打印模式状态  
  const { isPrintMode, setIsPrintMode } = usePrintMode();
  const [isExporting, setIsExporting] = useState(false);
  
  // 生成数据概览HTML（直接根据数据构建，不依赖DOM状态）
  const generateStatsHTML = () => {
    const analysisData = report?.analysis_data;
    if (!analysisData) return '';
    
    const context = analysisData.context;
    const insight = analysisData.insight;
    
    // 辅助函数：获取统计项（支持多种数据格式）
    const getItems = (data: any): Array<{name: string, value: number, percent: number}> => {
      if (!data) return [];
      
      // 如果已经是数组格式
      if (Array.isArray(data)) {
        return data.map(item => {
          const name = item.name || item.tag || item.content || '';
          const value = item.count || item.value || 0;
          // 计算百分比（如果没有提供）
          let percent = item.percent || 0;
          if (!percent && value > 0) {
            const total = data.reduce((sum: number, i: any) => sum + (i.count || i.value || 0), 0);
            percent = total > 0 ? (value / total * 100) : 0;
          }
          return { name, value, percent };
        }).filter(item => item.name);
      }
      
      // 如果是对象且有items属性
      if (data.items && Array.isArray(data.items)) {
        return data.items.map((item: any) => {
          const name = item.name || item.tag || item.content || '';
          const value = item.count || item.value || 0;
          let percent = item.percent || 0;
          if (!percent && value > 0) {
            const total = data.items.reduce((sum: number, i: any) => sum + (i.count || i.value || 0), 0);
            percent = total > 0 ? (value / total * 100) : 0;
          }
          return { name, value, percent };
        }).filter((item: any) => item.name);
      }
      
      return [];
    };
    
    // 生成进度条HTML（只显示百分比，去掉具体数字）
    const renderProgressBar = (items: Array<{name: string, value: number, percent: number}>, color: string) => {
      if (items.length === 0) return '';
      const maxPercent = Math.max(...items.map(i => i.percent || 0));
      return items.map(item => {
        const width = maxPercent > 0 ? (item.percent / maxPercent * 100) : 0;
        return `
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 12px; color: #374151; font-weight: 500;">${item.name}</span>
              <span style="font-size: 11px; color: #6b7280;">${item.percent.toFixed(1)}%</span>
            </div>
            <div style="background: #f3f4f6; border-radius: 4px; height: 6px; overflow: hidden;">
              <div style="background: ${color}; width: ${width}%; height: 100%; border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('');
    };
    
    // 生成卡片HTML（去掉图标，英文标题居中，数字居中）
    const renderCard = (title: string, icon: string, items: Array<{name: string, value: number, percent: number}>, color: string) => {
      if (items.length === 0) return '';
      const total = items.reduce((sum, i) => sum + i.value, 0);
      return `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; break-inside: avoid;">
          <div style="margin-bottom: 12px; text-align: center;">
            <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 8px;">${title}</div>
            <div style="font-size: 18px; font-weight: 600; color: #374151;">${total}</div>
          </div>
          ${renderProgressBar(items, color)}
        </div>
      `;
    };
    
    // 5W用户画像（现在包含Buyer和User，共6列布局）
    let fiveWHTML = '';
    if (context) {
      const cards = [
        { title: 'Buyer', icon: '💳', data: context.buyer, color: '#3b82f6' },
        { title: 'User', icon: '👤', data: context.user, color: '#06b6d4' },
        { title: 'Where', icon: '📍', data: context.where, color: '#a855f7' },
        { title: 'When', icon: '⏰', data: context.when, color: '#f97316' },
        { title: 'Why', icon: '❓', data: context.why, color: '#ec4899' },
        { title: 'What', icon: '🎯', data: context.what, color: '#10b981' },
      ];
      const cardsHTML = cards.map(c => renderCard(c.title, c.icon, getItems(c.data), c.color)).filter(h => h).join('');
      if (cardsHTML) {
        fiveWHTML = `
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span style="color: #3b82f6;">👥</span> 5W 用户画像
            </h3>
            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px;">
              ${cardsHTML}
            </div>
          </div>
        `;
      }
    }
    
    // 5类口碑洞察（横向5列布局）
    let insightHTML = '';
    if (insight) {
      const cards = [
        { title: '优势/卖点', icon: '👍', data: insight.strength, color: '#22c55e' },
        { title: '痛点/问题', icon: '💬', data: insight.weakness, color: '#ef4444' },
        { title: '用户建议', icon: '💡', data: insight.suggestion, color: '#f59e0b' },
        { title: '使用场景', icon: '🏠', data: insight.scenario, color: '#6366f1' },
        { title: '情绪反馈', icon: '❤️', data: insight.emotion, color: '#f43f5e' },
      ];
      const cardsHTML = cards.map(c => renderCard(c.title, c.icon, getItems(c.data), c.color)).filter(h => h).join('');
      if (cardsHTML) {
        insightHTML = `
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span style="color: #f59e0b;">💡</span> 5类口碑洞察
            </h3>
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;">
              ${cardsHTML}
            </div>
          </div>
        `;
      }
    }
    
    const totalReviews = analysisData.total_reviews || (analysisData as any).meta?.total_reviews || 0;
    
    return `
      <div style="background: linear-gradient(to right, #f8fafc, #f1f5f9); border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
          <span style="font-size: 24px;">📊</span>
          <div>
            <h2 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0;">数据概览</h2>
            <p style="font-size: 14px; color: #6b7280; margin: 4px 0 0 0;">基于 ${totalReviews} 条评论的统计分析 · Top 10 展示</p>
          </div>
        </div>
        ${fiveWHTML}
        ${insightHTML}
      </div>
    `;
  };
  
  // 导出 PDF（直接构建HTML内容）
  const handleExportPDF = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    
    // 创建新窗口
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      alert('请允许弹出窗口以导出PDF');
      setIsExporting(false);
      return;
    }
    
    // 获取AI分析内容（从DOM获取，排除数据概览部分）
    const reportContainer = document.querySelector('.json-report-container');
    let aiContentHTML = '';
    if (reportContainer) {
      // 克隆节点并移除StatsDashboard
      const cloned = reportContainer.cloneNode(true) as HTMLElement;
      const statsDashboard = cloned.querySelector('.stats-dashboard');
      if (statsDashboard) {
        statsDashboard.remove();
      }
      aiContentHTML = cloned.innerHTML;
    }
    
    // 获取当前页面的所有样式
    const styleSheets = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML)
      .join('\n');
    
    // 构建打印页面HTML
    const reportTitle = report ? getReportTitle(report.report_type) : '产品分析报告';
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${reportTitle} - ${asin}</title>
        ${styleSheets}
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: white !important;
            color: #111827;
            padding: 40px;
            line-height: 1.6;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @media print {
            @page { margin: 1.5cm; size: A4; }
            body { padding: 0; }
          }
          /* 隐藏按钮和抽屉 */
          button, .drawer, [role="dialog"] { display: none !important; }
          /* PDF专用头部样式 */
          .pdf-header {
            border-bottom: 3px solid #e11d48;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo-icon { font-size: 32px; }
          .logo-text { font-size: 24px; font-weight: 700; color: #e11d48; }
          .logo-sub { font-size: 12px; color: #6b7280; }
          .product-card {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            display: flex;
            gap: 20px;
          }
          .product-img {
            width: 100px;
            height: 100px;
            object-fit: contain;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            flex-shrink: 0;
          }
          .product-info { flex: 1; }
          .product-title {
            font-size: 18px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 12px;
          }
          .product-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 14px;
            color: #6b7280;
          }
          .asin-tag {
            background: #ffe4e6;
            color: #be123c;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <!-- 头部 -->
        <div class="pdf-header">
          <div class="logo">
            <span class="logo-icon">🎯</span>
            <div>
              <div class="logo-text">洞察大王</div>
              <div class="logo-sub">AI驱动的产品评论深度分析平台</div>
            </div>
          </div>
        </div>
        
        <!-- 产品信息 -->
        <div class="product-card">
          ${product?.image_url ? `<img class="product-img" src="${product.image_url}" alt="产品图片" />` : ''}
          <div class="product-info">
            <div class="product-title">${product?.title_translated || product?.title || '产品标题'}</div>
            <div class="product-meta">
              <span class="asin-tag">ASIN: ${product?.asin || asin}</span>
              ${product?.average_rating ? `<span>⭐ ${product.average_rating.toFixed(1)} 分</span>` : ''}
              ${product?.total_reviews ? `<span>${product.total_reviews.toLocaleString()} 条评论</span>` : ''}
              ${product?.price ? `<span>${product.price}</span>` : ''}
            </div>
          </div>
        </div>
        
        <!-- 数据概览（手动构建） -->
        ${generateStatsHTML()}
        
        <!-- AI分析内容 -->
        <div style="margin-top: 30px;">
          ${aiContentHTML}
        </div>
      </body>
      </html>
    `;
    
    // 写入新窗口
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // 等待资源加载后打印
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => {
          printWindow.close();
        };
      }, 800);
    };
    
    setIsExporting(false);
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
    // 保持来源信息
    navigate(`/report/${asin}/${selectedReport.id}`, { replace: true, state: { from: from || 'reader' } });
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
  
  // 生成中状态 - 不再全屏遮挡，改为顶部进度条
  const generatingTypeConfig = REPORT_TYPE_CONFIG[generatingReportType];
  
  // 错误状态（生成中时不显示错误页面）
  if (error && !report && !isGenerating) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <AlertCircle className="size-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">暂无报告</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                if (from === 'reports') {
                  navigate('/home/reports');
                } else if (from === 'reader') {
                  navigate(`/reader/${asin}`);
                } else {
                  navigate('/home/reports');
                }
              }}
            >
              <ArrowLeft className="size-4" />
              {from === 'reports' ? '返回报告库' : from === 'reader' ? '返回产品详情' : '返回报告库'}
            </Button>
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
      {/* 打印样式 - 优化PDF导出效果 */}
      <style>{`
        @media print {
          @page {
            margin: 1.5cm 1.5cm 2cm 1.5cm;
            size: A4;
          }
          
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* 打印头部样式 */
          .print-header {
            display: block !important;
          }
          
          /* ⭐ 强制展开所有统计卡片内容 ⭐ */
          .stats-card-items .stats-item {
            display: block !important;
          }
          .stats-card-items .stats-item.hidden {
            display: block !important;
          }
          
          /* 隐藏交互元素但保留链接文字 */
          button, .print\\:hidden {
            display: none !important;
          }
          
          a {
            color: inherit !important;
            text-decoration: none !important;
          }
          
          /* 保持颜色 */
          .text-rose-600, .text-rose-500 {
            color: #e11d48 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .text-blue-600, .text-blue-500 {
            color: #2563eb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .bg-rose-100, .bg-rose-50 {
            background: #ffe4e6 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .bg-blue-100, .bg-blue-50 {
            background: #dbeafe !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* 进度条颜色保持 */
          .bg-blue-500 { background: #3b82f6 !important; -webkit-print-color-adjust: exact !important; }
          .bg-purple-500 { background: #a855f7 !important; -webkit-print-color-adjust: exact !important; }
          .bg-orange-500 { background: #f97316 !important; -webkit-print-color-adjust: exact !important; }
          .bg-pink-500 { background: #ec4899 !important; -webkit-print-color-adjust: exact !important; }
          .bg-cyan-500 { background: #06b6d4 !important; -webkit-print-color-adjust: exact !important; }
          .bg-emerald-500 { background: #10b981 !important; -webkit-print-color-adjust: exact !important; }
          .bg-red-500 { background: #ef4444 !important; -webkit-print-color-adjust: exact !important; }
          .bg-amber-500 { background: #f59e0b !important; -webkit-print-color-adjust: exact !important; }
          
          /* 卡片边框 */
          .border-gray-200, .border-gray-300 {
            border-color: #e5e7eb !important;
          }
          
          /* 优化间距 */
          .mb-8, .mb-10, .mb-12 {
            margin-bottom: 1rem !important;
          }
          
          .p-8, .p-10 {
            padding: 0.75rem !important;
          }
          
          /* 避免分页时断开重要内容 */
          .stats-dashboard, .card, [class*="rounded-lg"] {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* 隐藏侧边栏 */
          aside {
            display: none !important;
          }
          
          /* 主内容区全宽 */
          main {
            max-width: none !important;
            padding: 0 !important;
          }
          
          main > div {
            display: block !important;
          }
          
          main > div > div:first-child {
            width: 100% !important;
          }
        }
      `}</style>
      
      <div className={`min-h-screen bg-white dark:bg-gray-900 print:bg-white ${
        isFullscreen ? 'fixed inset-0 z-40 w-screen h-screen overflow-y-auto' : ''
      }`}>
      {/* 打印专用头部 - 屏幕隐藏，打印时显示（含Logo和网站名称） */}
      <div className="hidden print:block print:px-8 print:pt-6">
        <PrintHeader product={product} report={report} asin={asin} />
      </div>
      
      {/* 顶部导航栏 - 打印/PDF导出时隐藏 */}
      {!isPrintMode && (
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 print:hidden">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                // 根据来源决定回退位置
                if (from === 'reports') {
                  // 从报告库来，回退到报告库
                  navigate('/home/reports');
                } else if (from === 'reader') {
                  // 从详情页来，回退到详情页
                  navigate(`/reader/${asin}`);
                } else {
                  // 默认回退到报告库（更合理）
                  navigate('/home/reports');
                }
              }}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="size-5" />
            </button>
            {/* 报告类型图标+标题+描述整合 */}
            <div className="flex items-center gap-3">
              {report?.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                <span className="text-2xl">{REPORT_TYPE_CONFIG[report.report_type as ReportType].icon}</span>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {report ? getReportTitle(report.report_type) : '产品分析报告'}
                  </span>
                  {report?.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                      {REPORT_TYPE_CONFIG[report.report_type as ReportType].label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {report?.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                    <span>{REPORT_TYPE_CONFIG[report.report_type as ReportType].description}</span>
                  )}
                  {report?.created_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatDate(report.created_at)}
                    </span>
                  )}
                  {(report?.analysis_data?.total_reviews || (report?.analysis_data as any)?.meta?.total_reviews) && (
                    <span className="flex items-center gap-1">
                      <BarChart3 className="size-3" />
                      基于 {report?.analysis_data?.total_reviews || (report?.analysis_data as any)?.meta?.total_reviews} 条评论
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded text-xs">
                    ASIN: {asin}
                  </span>
                </div>
              </div>
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
            {/* 分享按钮 */}
            <ShareButton
              resourceType="report"
              resourceId={report?.id}
              asin={asin}
              title={report?.title || `${asin} 分析报告`}
              variant="ghost"
              size="sm"
            />
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
              onClick={handleExportPDF}
              disabled={isExporting}
              className="gap-1.5"
              title="导出高质量PDF报告"
            >
              {isExporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isExporting ? '导出中...' : '导出PDF'}
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
            {/* 生成中显示进度，否则显示生成按钮 */}
            {isGenerating ? (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 text-rose-500 animate-spin" />
                  <span className="text-xl">{generatingTypeConfig.icon}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    正在生成 {generatingTypeConfig.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{generatingStep}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(displayProgress, 5)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-400 w-8">
                    {Math.round(displayProgress)}%
                  </span>
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </div>
        
        {/* 历史报告下拉 */}
        {showHistory && reportHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
            <div className="max-w-[1920px] mx-auto px-4 lg:px-8 py-4">
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
      )}
      
      {/* 报告内容 - 用于PDF导出的容器 */}
      <main id="report-content-for-pdf" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:ml-[220px] xl:mr-auto py-8 lg:py-12 print:max-w-none print:px-12 print:py-8 print:ml-0 bg-white">
        {/* PDF导出时显示的头部 */}
        {isPrintMode && (
          <div className="mb-8">
            <PrintHeader product={product} report={report} asin={asin} />
          </div>
        )}
        
        <div>

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

            {/* 报告元信息 - 仅打印时显示（屏幕上已整合到顶部导航栏） */}
            {report && (
              <>
                <div className="hidden print:block mb-6">
                  <div className="flex items-start gap-4 mb-3">
                    {/* 报告类型图标 */}
                    {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                      <span className="text-3xl">
                        {REPORT_TYPE_CONFIG[report.report_type as ReportType].icon}
                      </span>
                    )}
                    <div className="flex-1">
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">
                        {report.title || getReportTitle(report.report_type)}
                      </h1>
                      {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                        <p className="text-sm text-gray-500">
                          {REPORT_TYPE_CONFIG[report.report_type as ReportType].description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    {report.report_type && REPORT_TYPE_CONFIG[report.report_type as ReportType] && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {REPORT_TYPE_CONFIG[report.report_type as ReportType].label}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      {formatDate(report.created_at)}
                    </span>
                    {(report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews) && (
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="size-3" />
                        基于 {report.analysis_data?.total_reviews || (report.analysis_data as any)?.meta?.total_reviews} 条评论分析
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-medium">
                      ASIN: {asin}
                    </span>
                  </div>
                </div>

                {/* 报告内容 - 根据类型选择独立渲染器 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-10 print:bg-white print:p-0 print:rounded-none print:shadow-none print:border-0">
                  {isJsonReport ? (
                    <ErrorBoundary>
                      <Suspense fallback={
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="size-8 animate-spin text-rose-500" />
                          <span className="ml-2 text-gray-500">加载报告组件...</span>
                        </div>
                      }>
                        {/* 根据报告类型选择不同的渲染器 */}
                        {report.report_type === 'supply_chain' && (
                          <SupplyChainReportPage 
                            content={report.content} 
                            analysisData={report.analysis_data}
                            onSectionsChange={setReportSections}
                            asin={asin}
                            onViewReviews={openReviewSidebar}
                          />
                        )}
                        {report.report_type === 'comprehensive' && (
                          <ComprehensiveReportPage 
                            content={report.content} 
                            analysisData={report.analysis_data}
                            onSectionsChange={setReportSections}
                            asin={asin}
                            onViewReviews={openReviewSidebar}
                          />
                        )}
                        {report.report_type === 'operations' && (
                          <OperationsReportPage 
                            content={report.content} 
                            analysisData={report.analysis_data}
                            onSectionsChange={setReportSections}
                            asin={asin}
                            onViewReviews={openReviewSidebar}
                          />
                        )}
                        {report.report_type === 'product' && (
                          <ProductReportPage 
                            content={report.content} 
                            analysisData={report.analysis_data}
                            onSectionsChange={setReportSections}
                            asin={asin}
                            onViewReviews={openReviewSidebar}
                          />
                        )}
                        {/* 未知类型回退到通用渲染器 */}
                        {!['supply_chain', 'comprehensive', 'operations', 'product'].includes(report.report_type || '') && (
                          <JsonReportRenderer 
                            content={report.content} 
                            reportType={(report.report_type as ReportType) || 'comprehensive'}
                            analysisData={report.analysis_data}
                            asin={asin}
                            onSectionsChange={setReportSections}
                            onDrawerStateChange={setIsDrawerOpen}
                          />
                        )}
                      </Suspense>
                    </ErrorBoundary>
                  ) : (
                    <MarkdownRenderer content={report.content} />
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        {/* 左侧固定大纲（仅 JSON 报告，且大屏显示；PDF导出时隐藏） */}
        {isJsonReport && reportSections.length > 0 && !isPrintMode && (
          <TableOfContents 
            sections={reportSections} 
            className="print:hidden"
            isDrawerOpen={isDrawerOpen || reviewSidebar.isOpen}
          />
        )}
      </main>
      
      {/* 评论侧边栏 - 显示完整评论（包含原文和译文） */}
      {asin && (
        <CompareReviewSidebar
          isOpen={reviewSidebar.isOpen}
          onClose={closeReviewSidebar}
          productAsin={asin}
          dimension={reviewSidebar.dimensionLabel}
          dimensionKey={reviewSidebar.dimensionKey}
          tagLabel={reviewSidebar.tagLabel}
          totalCount={reviewSidebar.totalCount}
        />
      )}
    </div>
    </>
  );
}

// 导出的主组件 - 包装 PrintProvider
export function ReportPage() {
  return (
    <PrintProvider>
      <ReportPageInner />
    </PrintProvider>
  );
}

export default ReportPage;

