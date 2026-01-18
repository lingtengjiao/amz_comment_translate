/**
 * 功能使用分布图组件
 */
import { Card } from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';

interface FeatureUsageChartProps {
  data: {
    feature_events: Array<{
      feature: string;
      count: number;
    }>;
    products_added: number;
    tasks_completed: number;
    reports_generated: number;
    analysis_created: number;
  };
}

export function FeatureUsageChart({ data }: FeatureUsageChartProps) {
  // 合并功能使用数据
  const chartData = [
    {
      name: '添加产品',
      count: data.products_added
    },
    {
      name: '完成任务',
      count: data.tasks_completed
    },
    {
      name: '生成报告',
      count: data.reports_generated
    },
    {
      name: '创建分析',
      count: data.analysis_created
    },
    ...data.feature_events.slice(0, 10).map(item => ({
      name: item.feature,
      count: item.count
    }))
  ].filter(item => item.count > 0);

  const chartConfig = {
    count: {
      label: '使用次数',
      color: 'hsl(var(--chart-2))'
    }
  };

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">功能使用分布</h3>
      <ChartContainer config={chartConfig} className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis type="number" className="text-xs" tick={{ fill: 'currentColor' }} />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  );
}
