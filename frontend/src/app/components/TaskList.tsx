import { useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { TaskCard } from './TaskCard';
import { TaskListHeader } from './TaskListHeader';
import { apiService, transformProductsToTasks } from '@/api';
import type { Task } from '@/api/types';

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

  const handleViewReviews = useCallback((taskId: string) => {
    // 通过 task 找到对应的 asin
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      navigate(`/reader/${task.asin}`);
    }
  }, [navigate, tasks]);

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
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
