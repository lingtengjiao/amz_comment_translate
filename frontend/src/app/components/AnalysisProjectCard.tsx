import { useNavigate } from 'react-router-dom';
import { GitCompare, Clock, CheckCircle2, XCircle, Loader2, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import type { AnalysisProject } from '@/api/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';

interface AnalysisProjectCardProps {
  project: AnalysisProject;
}

const statusConfig = {
  pending: {
    label: '等待中',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
  },
  processing: {
    label: '分析中',
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  completed: {
    label: '已完成',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  failed: {
    label: '失败',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
  },
};

export function AnalysisProjectCard({ project }: AnalysisProjectCardProps) {
  const navigate = useNavigate();
  const statusInfo = statusConfig[project.status];
  const StatusIcon = statusInfo.icon;

  const handleClick = () => {
    navigate(`/analysis/${project.id}`);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
    } catch {
      return dateString;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] border-2 hover:border-rose-300 dark:hover:border-rose-700"
      onClick={handleClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold line-clamp-2 flex-1">
            {project.title}
          </CardTitle>
          <Badge
            variant="outline"
            className={`${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color} border shrink-0`}
          >
            <StatusIcon
              className={`size-3 mr-1 ${project.status === 'processing' ? 'animate-spin' : ''}`}
            />
            {statusInfo.label}
          </Badge>
        </div>
        {project.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-2">
            {project.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <GitCompare className="size-4" />
              <span>{project.items.length} 款产品</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="size-4" />
              <span>{formatDate(project.created_at)}</span>
            </div>
          </div>
          {project.status === 'completed' && (
            <span className="text-rose-600 dark:text-rose-400 font-medium">
              查看报告 →
            </span>
          )}
        </div>
        
        {/* 产品预览（显示所有产品的缩略图，最多5个） */}
        {project.items.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {project.items.slice(0, 5).map((item, idx) => (
                <div
                  key={item.id}
                  className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 overflow-hidden"
                  style={{ zIndex: 5 - idx }}
                >
                  {item.product?.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt={item.product.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                      {item.product?.asin?.slice(-2) || '?'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

