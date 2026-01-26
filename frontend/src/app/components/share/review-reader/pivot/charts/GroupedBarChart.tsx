/**
 * 分组柱状图组件
 * 用于展示对比分析
 */
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';

interface GroupedBarChartProps {
  categories: string[]; // X轴分类
  series: Array<{
    name: string;
    data: number[];
    color?: string;
  }>;
  title?: string;
  horizontal?: boolean; // 是否横向显示
}

export function GroupedBarChart({ categories, series, title, horizontal = false }: GroupedBarChartProps) {
  const option = useMemo(() => {
    const baseOption = {
      title: title ? {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold',
        },
      } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          let result = `<strong>${params[0].axisValue}</strong><br/>`;
          params.forEach((item: any) => {
            result += `${item.marker} ${item.seriesName}: ${item.value}<br/>`;
          });
          return result;
        },
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 0,
        textStyle: {
          fontSize: 11,
        },
      },
      grid: {
        left: horizontal ? '15%' : '5%',
        right: '5%',
        top: title ? '15%' : '5%',
        bottom: '15%',
        containLabel: true,
      },
      [horizontal ? 'yAxis' : 'xAxis']: {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: horizontal ? 0 : (categories.length > 6 ? 30 : 0),
          fontSize: 11,
        },
      },
      [horizontal ? 'xAxis' : 'yAxis']: {
        type: 'value',
        axisLabel: {
          fontSize: 11,
        },
      },
      series: series.map(s => ({
        name: s.name,
        type: 'bar',
        data: s.data,
        itemStyle: s.color ? {
          color: s.color,
        } : undefined,
        label: {
          show: true,
          position: horizontal ? 'right' : 'top',
          fontSize: 10,
          formatter: '{c}',
        },
      })),
    };
    
    return baseOption;
  }, [categories, series, title, horizontal]);
  
  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: horizontal ? Math.max(300, categories.length * 50) + 'px' : '350px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
