import { useNavigate } from 'react-router-dom';
import { GitCompare } from 'lucide-react';

export function TaskListHeader() {
  const navigate = useNavigate();

  const handleCompareClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔵 TaskListHeader: 对比分析按钮被点击');
    try {
      console.log('🔵 准备导航到 /analysis');
      navigate('/analysis');
      console.log('✅ 导航命令已执行');
    } catch (error) {
      console.error('❌ 导航失败:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-gray-900">亚马逊评论翻译工具</h1>
            <p className="text-gray-500 mt-1">智能管理和分析评论翻译任务</p>
          </div>
          <button
            type="button"
            onClick={handleCompareClick}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm hover:shadow-md active:scale-95 cursor-pointer"
            style={{ pointerEvents: 'auto' }}
          >
            <GitCompare className="h-4 w-4" />
            <span>对比分析</span>
          </button>
        </div>
      </div>
    </header>
  );
}
