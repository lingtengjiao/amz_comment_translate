import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { VocComparisonRenderer } from './VocComparisonRenderer';
import { ComparisonRenderer } from './ComparisonRenderer';
import { getAnalysisProject } from '@/api/service';
import type { AnalysisProject } from '@/api/types';
import { isStructuredResult, isComparisonResult } from '@/api/types';
import { Button } from './ui/button';
import { toast } from '@/app/utils/toast';

export default function AnalysisResultPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<AnalysisProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 智能返回函数：如果有历史记录就返回，否则跳转到首页
  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
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

  // 轮询逻辑：如果状态是 pending/processing，每 3 秒刷新一次
  useEffect(() => {
    if (!projectId) {
      setError('项目 ID 无效');
      setLoading(false);
      return;
    }

    let timer: NodeJS.Timeout;
    let isMounted = true;

    const fetchProject = async () => {
      try {
        const data = await getAnalysisProject(projectId);
        
        if (!isMounted) return;
        
        setProject(data);
        
        // 如果已完成或失败，停止加载，停止轮询
        if (data.status === 'completed' || data.status === 'failed') {
          setLoading(false);
        } else {
          // 继续轮询
          timer = setTimeout(fetchProject, 3000);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || '无法加载分析项目');
        setLoading(false);
      }
    };

    fetchProject();
    
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);

  if (loading && !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
        <Loader2 className="size-10 animate-spin text-indigo-600" />
        <p className="text-gray-500">正在加载分析项目...</p>
      </div>
    );
  }
  
  if (loading && project?.status === 'processing') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
        <Loader2 className="size-10 animate-spin text-indigo-600" />
        <p className="text-gray-500">正在生成深度分析报告...</p>
        <p className="text-sm text-gray-400">分析进行中，预计需要 1-2 分钟</p>
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
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-shrink-0"
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
              <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                {project?.title || 'VOC 产品对比分析'}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                智能化竞品洞察 · 数据驱动决策
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {project?.items.length || 0} 款产品对比
          </div>
        </div>
      </header>

      {/* 内容区域 */}
      {project?.result_content ? (
        // 根据结果类型选择渲染器
        isStructuredResult(project.result_content) ? (
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
          <Loader2 className="size-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">分析结果尚未生成</p>
        </div>
      )}
    </div>
  );
}
