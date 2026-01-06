import { useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { TaskCard } from './TaskCard';
import { TaskListHeader } from './TaskListHeader';
import { DimensionSetupDialog } from './DimensionSetupDialog';
import { apiService, transformProductsToTasks } from '@/api';
import type { Task } from '@/api/types';
import { toast } from 'sonner';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-6xl mb-4">📦</div>
      <h3 className="text-gray-900 mb-2">暂无任务</h3>
      <p className="text-gray-500">您还没有创建任何翻译任务</p>
      <p className="text-gray-400 text-sm mt-2">使用 Chrome 扩展抓取亚马逊评论后，任务将显示在这里</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p className="mt-4 text-gray-600">加载中...</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-6xl mb-4">❌</div>
      <h3 className="text-gray-900 mb-2">加载失败</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        重试
      </button>
    </div>
  );
}

export function TaskList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 维度设置对话框状态
  const [dimensionDialogOpen, setDimensionDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [checkingDimensions, setCheckingDimensions] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getProducts();
      const transformedTasks = transformProductsToTasks(response.products);
      setTasks(transformedTasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError(err instanceof Error ? err.message : '获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 检查是否有维度，如果没有则显示对话框
  const handleViewReviews = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // 如果没有评论，直接进入
    if (task.reviewCount === 0) {
      navigate(`/reader/${task.asin}`);
      return;
    }
    
    setCheckingDimensions(true);
    
    try {
      // 检查是否已有维度
      const dimensionsResponse = await apiService.getDimensions(task.asin);
      
      if (dimensionsResponse.total > 0) {
        // 已有维度，直接进入
        navigate(`/reader/${task.asin}`);
      } else {
        // 没有维度，显示设置对话框
        setSelectedTask(task);
        setDimensionDialogOpen(true);
      }
    } catch (err) {
      console.error('Failed to check dimensions:', err);
      // 检查失败时，仍然允许进入（兼容旧数据）
      toast.warning('无法检查分析框架状态，将直接进入');
      navigate(`/reader/${task.asin}`);
    } finally {
      setCheckingDimensions(false);
    }
  }, [navigate, tasks]);
  
  // 维度生成完成后进入产品详情
  const handleDimensionComplete = useCallback(() => {
    if (selectedTask) {
      navigate(`/reader/${selectedTask.asin}`);
    }
  }, [navigate, selectedTask]);

  return (
    <div className="min-h-screen bg-white transition-colors">
      {/* Header */}
      <TaskListHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Task Grid */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={fetchTasks} />
        ) : tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => handleViewReviews(task.id)}
                isLoading={checkingDimensions && selectedTask?.id === task.id}
              />
            ))}
          </div>
        )}
      </main>
      
      {/* 维度设置对话框 */}
      {selectedTask && (
        <DimensionSetupDialog
          open={dimensionDialogOpen}
          onOpenChange={setDimensionDialogOpen}
          asin={selectedTask.asin}
          productTitle={selectedTask.title}
          reviewCount={selectedTask.reviewCount}
          onComplete={handleDimensionComplete}
        />
      )}
    </div>
  );
}
