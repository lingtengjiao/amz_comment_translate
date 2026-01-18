/**
 * 用户增长趋势图组件
 */
import { useState } from 'react';
import { Card } from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface UserGrowthChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  const [days, setDays] = useState(30);

  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    count: item.count
  }));

  const chartConfig = {
    count: {
      label: '新增用户',
      color: 'hsl(var(--chart-1))'
    }
  };

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">用户增长趋势</h3>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                days === d
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {d}天
            </button>
          ))}
        </div>
      </div>
      <ChartContainer config={chartConfig} className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
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
            <Line
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  );
}
