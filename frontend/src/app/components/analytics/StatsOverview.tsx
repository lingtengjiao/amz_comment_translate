/**
 * 核心指标卡片组件
 */
import { Users, Package, CheckCircle, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '../ui/card';

interface StatsOverviewProps {
  data: {
    users: {
      total: number;
      new_today: number;
      new_yesterday: number;
      growth_rate: number;
      active_7d: number;
      active_30d: number;
    };
    products: {
      total: number;
      new_today: number;
    };
    tasks: {
      total: number;
      completed: number;
      completion_rate: number;
    };
    reports: {
      total: number;
    };
  };
}

export function StatsOverview({ data }: StatsOverviewProps) {
  const GrowthIndicator = ({ rate }: { rate: number }) => {
    if (rate > 0) {
      return (
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <TrendingUp className="size-4" />
          <span className="text-sm font-medium">+{rate.toFixed(1)}%</span>
        </div>
      );
    } else if (rate < 0) {
      return (
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <TrendingDown className="size-4" />
          <span className="text-sm font-medium">{rate.toFixed(1)}%</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {/* 总用户数 */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">总用户数</span>
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {data.users.total.toLocaleString()}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            今日新增: {data.users.new_today}
          </span>
          <GrowthIndicator rate={data.users.growth_rate} />
        </div>
      </Card>

      {/* 活跃用户 */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">活跃用户</span>
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {data.users.active_7d}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          7日活跃 / 30日活跃: {data.users.active_30d}
        </div>
      </Card>

      {/* 总产品数 */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-purple-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">总产品数</span>
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {data.products.total.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          今日新增: {data.products.new_today}
        </div>
      </Card>

      {/* 任务完成率 */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-5 text-orange-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">任务完成率</span>
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {data.tasks.completion_rate.toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          已完成: {data.tasks.completed} / {data.tasks.total}
        </div>
      </Card>

      {/* 报告总数 */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-indigo-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">报告总数</span>
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {data.reports.total.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          累计生成
        </div>
      </Card>
    </div>
  );
}
