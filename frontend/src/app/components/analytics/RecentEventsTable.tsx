/**
 * 最近事件流表格组件
 */
import { Card } from '../ui/card';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface RecentEventsTableProps {
  data: Array<{
    id: string;
    user_id: string | null;
    event_type: string;
    event_name: string;
    event_data: Record<string, any> | null;
    page_path: string | null;
    session_id: string | null;
    created_at: string;
  }>;
}

export function RecentEventsTable({ data }: RecentEventsTableProps) {
  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'page_view':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'click':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'feature_use':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">最近事件流</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">时间</th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">类型</th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">事件</th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">页面</th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">用户ID</th>
            </tr>
          </thead>
          <tbody>
            {data.map((event) => (
              <tr
                key={event.id}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                  {format(new Date(event.created_at), 'MM-dd HH:mm:ss', { locale: zhCN })}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${getEventTypeColor(
                      event.event_type
                    )}`}
                  >
                    {event.event_type}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                  {event.event_name}
                </td>
                <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                  {event.page_path || '-'}
                </td>
                <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs font-mono">
                  {event.user_id ? event.user_id.substring(0, 8) + '...' : '匿名'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
