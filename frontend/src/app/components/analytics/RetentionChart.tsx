/**
 * 用户留存分析组件
 */
import { Card } from '../ui/card';

interface RetentionChartProps {
  data: {
    retention_rates: {
      day_1: number;
      day_3: number;
      day_7: number;
      day_14: number;
      day_30: number;
    };
    total_users: number;
  };
}

export function RetentionChart({ data }: RetentionChartProps) {
  const retentionData = [
    { label: '1日留存', rate: data.retention_rates.day_1 },
    { label: '3日留存', rate: data.retention_rates.day_3 },
    { label: '7日留存', rate: data.retention_rates.day_7 },
    { label: '14日留存', rate: data.retention_rates.day_14 },
    { label: '30日留存', rate: data.retention_rates.day_30 }
  ];

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">用户留存率</h3>
      <div className="space-y-4">
        {retentionData.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {item.rate.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${item.rate}%` }}
              />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            统计用户数: {data.total_users}
          </p>
        </div>
      </div>
    </Card>
  );
}
