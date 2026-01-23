import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, Maximize2, Minimize2, TrendingUp, BarChart3 } from 'lucide-react';
import { VocComparisonRenderer } from './VocComparisonRenderer';
import { ComparisonRenderer } from './ComparisonRenderer';
import { MarketInsightRenderer } from './MarketInsightRenderer';
import { getAnalysisProject } from '@/api/service';
import type { AnalysisProject } from '@/api/types';
import { isStructuredResult, isComparisonResult } from '@/api/types';
import { Button } from './ui/button';
import { toast } from '@/app/utils/toast';
import { ShareButton } from './share/ShareButton';
import { useSectionCache } from '../hooks/useSectionCache';

// 检查是否是市场洞察结果
const isMarketInsightResult = (data: any): boolean => {
  return data?.analysis_type === 'market_insight' || 
    (data?.market_overview && data?.market_persona) ||
    (data?.market_opportunities && data?.product_profiles);
};

export default function AnalysisResultPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<AnalysisProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 智能返回函数：如果有历史记录就返回，否则跳转到我的洞察
  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/home/my-projects');
    }
  };

  // 全屏切换 - 文档级全屏
  const handleFullscreenClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const isCurrentlyFullscreen = !!document.fullscreenElement;

      if (!isCurrentlyFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
      toast.error('全屏模式受限', '请检查浏览器权限');
    }
  }, []);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNativeFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNativeFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 🚀 优化：分离缓存加载和轮询逻辑，避免依赖循环
  const { data: cachedProject, refetch: refetchProject } = useSectionCache<AnalysisProject>(
    projectId ? `analysis_project_${projectId}` : '',
    async () => {
      if (!projectId) throw new Error('项目 ID 无效');
      return await getAnalysisProject(projectId);
    },
    { ttl: 3 * 60 * 1000 } // 3分钟缓存
  );

  // 🚀 优化：独立的轮询逻辑，不依赖 cachedProject 避免循环
  useEffect(() => {
    if (!projectId) {
      setError('项目 ID 无效');
      setLoading(false);
      return;
    }

    let timer: NodeJS.Timeout;
    let isMounted = true;
    let isPolling = false;

    // 🚀 轮询函数：使用 status_only=true 减少数据传输
    const pollStatus = async () => {
      if (!isMounted || isPolling) return;
      isPolling = true;
      
      try {
        // 🚀 使用 statusOnly=true，只获取状态字段
        const statusData = await getAnalysisProject(projectId, true);
        
        if (!isMounted) return;
        
        // 更新状态（保留已有的完整数据）
        setProject(prev => prev ? { ...prev, status: statusData.status, error_message: statusData.error_message } : statusData);
        
        // 如果已完成或失败，获取完整数据并停止轮询
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          setLoading(false);
          // 获取完整数据并更新缓存
          const fullData = await getAnalysisProject(projectId, false);
          if (isMounted) {
            setProject(fullData);
            refetchProject();
          }
        } else {
          // 🚀 继续轮询，间隔3秒
          timer = setTimeout(pollStatus, 3000);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || '无法加载分析项目');
        setLoading(false);
      } finally {
        isPolling = false;
      }
    };

    // 初始加载：获取完整数据
    const initialLoad = async () => {
      try {
        const data = await getAnalysisProject(projectId, false);
        
        if (!isMounted) return;
        
        setProject(data);
        setLoading(false);
        
        // 如果状态是 processing，开始轮询
        if (data.status === 'processing' || data.status === 'pending') {
          timer = setTimeout(pollStatus, 3000);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || '无法加载分析项目');
        setLoading(false);
      }
    };

    // 如果有缓存且已完成，直接使用缓存
    if (cachedProject && (cachedProject.status === 'completed' || cachedProject.status === 'failed')) {
      setProject(cachedProject);
      setLoading(false);
    } else if (cachedProject) {
      // 有缓存但未完成，使用缓存并开始轮询
      setProject(cachedProject);
      setLoading(false);
      timer = setTimeout(pollStatus, 3000);
    } else {
      // 无缓存，初始加载
      setLoading(true);
      initialLoad();
    }
    
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // 🚀 只依赖 projectId，避免 cachedProject 变化触发重新轮询

  if (loading && !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
        <Loader2 className="size-10 animate-spin text-rose-500" />
        <p className="text-gray-500">正在加载分析项目...</p>
      </div>
    );
  }
  
  if (loading && project?.status === 'processing') {
    const isMarketInsight = project?.analysis_type === 'market_insight';
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 dark:bg-gray-950">
        <Loader2 className={`size-10 animate-spin ${isMarketInsight ? 'text-blue-500' : 'text-rose-500'}`} />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-gray-700">
            {isMarketInsight ? '正在生成市场洞察报告...' : '正在生成深度分析报告...'}
          </p>
          <p className="text-sm text-gray-500">分析进行中，预计需要 1-2 分钟</p>
        </div>
        {/* [NEW] 允许用户返回，让分析在后台运行 */}
        <div className="flex gap-3 mt-4">
          <Button 
            variant="outline" 
            onClick={handleGoBack}
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            返回继续浏览
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => window.location.reload()}
            className="gap-2 text-gray-500"
          >
            刷新查看进度
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          💡 提示：您可以返回继续其他操作，分析将在后台运行。<br/>
          完成后可在「AI 竞品对比」页面查看。
        </p>
      </div>
    );
  }

  if (error || project?.status === 'failed') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
        <AlertCircle className="size-10 text-red-500" />
        <p className="text-red-500 font-medium">{project?.error_message || error}</p>
        <Button 
          variant="outline" 
          onClick={handleGoBack}
          className="mt-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          返回
        </Button>
      </div>
    );
  }

  return (
    <div 
      className={`bg-gray-50 dark:bg-gray-950 transition-all duration-300 ease-in-out ${
        isFullscreen 
          ? 'fixed inset-0 z-40 w-screen h-screen overflow-y-auto' 
          : 'min-h-screen relative'
      }`}
    >
      {/* 顶部 Header */}
      <header className="border-b dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 沉浸模式按钮 */}
            <button
              type="button"
              onClick={handleFullscreenClick}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium transition-colors hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 flex-shrink-0"
              title={isFullscreen ? '退出沉浸模式 (Esc)' : '进入沉浸模式'}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="size-4" />
                  退出
                </>
              ) : (
                <>
                  <Maximize2 className="size-4" />
                  沉浸
                </>
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="gap-2"
            >
              <ArrowLeft className="size-4" />
              返回
            </Button>
            <div>
              <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {project?.analysis_type === 'market_insight' ? (
                  <TrendingUp className="size-5 text-blue-600" />
                ) : (
                  <BarChart3 className="size-5 text-rose-600" />
                )}
                {project?.title || (project?.analysis_type === 'market_insight' ? '细分市场洞察' : 'VOC 产品对比分析')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {project?.analysis_type === 'market_insight' 
                  ? '市场共性 · 趋势分析 · 机会挖掘' 
                  : '智能化竞品洞察 · 数据驱动决策'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {project?.items.length || 0} 款产品{project?.analysis_type === 'market_insight' ? '聚合分析' : '对比'}
            </span>
            {/* 分享按钮 */}
            {project && project.status === 'completed' && (
              <ShareButton
                resourceType="analysis_project"
                resourceId={project.id}
                title={project.title}
                variant="outline"
                size="sm"
              />
            )}
          </div>
        </div>
      </header>

      {/* 内容区域 */}
      {project?.result_content ? (
        // 根据分析类型和结果类型选择渲染器
        isMarketInsightResult(project.result_content) ? (
          <MarketInsightRenderer data={project.result_content} items={project.items} projectId={projectId} />
        ) : isStructuredResult(project.result_content) ? (
          <VocComparisonRenderer data={project.result_content} items={project.items} />
        ) : isComparisonResult(project.result_content) ? (
          <div className="p-6">
            <ComparisonRenderer data={project.result_content} />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto py-20 text-center">
            <AlertCircle className="size-10 text-amber-500 mx-auto mb-4" />
            <p className="text-gray-500">未知的报告格式</p>
          </div>
        )
      ) : (
        <div className="max-w-7xl mx-auto py-20 text-center">
          <Loader2 className="size-10 animate-spin text-rose-500 mx-auto mb-4" />
          <p className="text-gray-500">分析结果尚未生成</p>
        </div>
      )}
    </div>
  );
}
