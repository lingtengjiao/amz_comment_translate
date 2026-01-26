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
    // 检测是否为移动设备
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    const baseOption = {
      title: title ? {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: isMobile ? 12 : 14,
          fontWeight: 'bold',
        },
      } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        confine: true, // 限制在图表区域内
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
          fontSize: isMobile ? 9 : 11,
        },
        type: isMobile ? 'scroll' : 'plain', // 移动端使用滚动图例
        pageIconSize: isMobile ? 10 : 12,
      },
      grid: {
        left: horizontal ? (isMobile ? '20%' : '15%') : (isMobile ? '10%' : '5%'),
        right: isMobile ? '5%' : '5%',
        top: title ? (isMobile ? '12%' : '15%') : (isMobile ? '5%' : '5%'),
        bottom: isMobile ? '20%' : '15%',
        containLabel: true,
      },
      [horizontal ? 'yAxis' : 'xAxis']: {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: horizontal ? 0 : (isMobile ? 45 : (categories.length > 6 ? 30 : 0)),
          fontSize: isMobile ? 9 : 11,
          overflow: 'truncate',
          width: isMobile ? 60 : undefined,
        },
      },
      [horizontal ? 'xAxis' : 'yAxis']: {
        type: 'value',
        axisLabel: {
          fontSize: isMobile ? 9 : 11,
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
          show: !isMobile, // 移动端隐藏标签
          position: horizontal ? 'right' : 'top',
          fontSize: isMobile ? 8 : 10,
          formatter: '{c}',
        },
      })),
    };
    
    return baseOption;
  }, [categories, series, title, horizontal]);
  
  // 移动端适配高度
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const cellHeight = isMobile ? 35 : 50;
  const defaultHeight = isMobile ? 280 : 350;
  const minHeight = isMobile ? 250 : 300;
  const chartHeight = horizontal 
    ? Math.max(minHeight, categories.length * cellHeight) + 'px'
    : defaultHeight + 'px';
  
  return (
    <div className="w-full overflow-x-auto">
      <ReactECharts
        option={option}
        style={{ 
          height: chartHeight, 
          width: '100%',
          minWidth: isMobile ? '300px' : 'auto'
        }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
