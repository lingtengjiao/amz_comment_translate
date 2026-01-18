/**
 * 活跃用户时段图组件
 */
import { Card } from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface ActiveUsersChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
}

export function ActiveUsersChart({ data }: ActiveUsersChartProps) {
  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    count: item.count
  }));

  const chartConfig = {
    count: {
      label: '活跃用户',
      color: 'hsl(var(--chart-3))'
    }
  };

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">每日活跃用户</h3>
      <ChartContainer config={chartConfig} className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--chart-3))"
              fillOpacity={1}
              fill="url(#colorCount)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  );
}
