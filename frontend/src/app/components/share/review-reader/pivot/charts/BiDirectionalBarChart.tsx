/**
 * 双向柱状图组件
 * 用于优劣势对比（类似人口金字塔）
 */
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';

interface BiDirectionalBarChartProps {
  categories: string[]; // 维度标签
  leftData: number[]; // 左侧数据（如优势）
  rightData: number[]; // 右侧数据（如劣势）
  leftLabel: string; // 左侧标签
  rightLabel: string; // 右侧标签
}

export function BiDirectionalBarChart({
  categories,
  leftData,
  rightData,
  leftLabel,
  rightLabel,
}: BiDirectionalBarChartProps) {
  const option = useMemo(() => {
    const maxValue = Math.max(...leftData, ...rightData);
    // 检测是否为移动设备
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        confine: true, // 限制在图表区域内
        formatter: (params: any) => {
          const category = params[0].axisValue;
          const left = Math.abs(params[0].value);
          const right = params[1].value;
          return `<strong>${category}</strong><br/>
                  ${leftLabel}: ${left}<br/>
                  ${rightLabel}: ${right}`;
        },
      },
      legend: {
        data: [leftLabel, rightLabel],
        bottom: 0,
        textStyle: {
          fontSize: isMobile ? 9 : 11,
        },
      },
      grid: {
        left: isMobile ? '30%' : '25%',
        right: isMobile ? '30%' : '25%',
        top: isMobile ? '3%' : '5%',
        bottom: isMobile ? '18%' : '15%',
        containLabel: false,
      },
      xAxis: {
        type: 'value',
        min: -maxValue * 1.1,
        max: maxValue * 1.1,
        axisLabel: {
          formatter: (value: number) => Math.abs(value).toString(),
          fontSize: isMobile ? 8 : 10,
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          fontSize: isMobile ? 9 : 11,
          align: 'center',
          overflow: 'truncate',
          width: isMobile ? 60 : undefined,
          margin: 80,
        },
        splitLine: {
          show: false,
        },
      },
      series: [
        {
          name: leftLabel,
          type: 'bar',
          stack: 'total',
          label: {
            show: !isMobile, // 移动端隐藏标签
            position: 'left',
            fontSize: isMobile ? 8 : 10,
            formatter: (params: any) => Math.abs(params.value),
          },
          data: leftData.map(v => -v), // 负值显示在左侧
          itemStyle: {
            color: '#10b981', // 绿色
          },
        },
        {
          name: rightLabel,
          type: 'bar',
          stack: 'total',
          label: {
            show: !isMobile, // 移动端隐藏标签
            position: 'right',
            fontSize: isMobile ? 8 : 10,
          },
          data: rightData,
          itemStyle: {
            color: '#ef4444', // 红色
          },
        },
      ],
    };
  }, [categories, leftData, rightData, leftLabel, rightLabel]);
  
  // 移动端适配高度
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const cellHeight = isMobile ? 35 : 45;
  const minHeight = isMobile ? 250 : 300;
  const chartHeight = Math.max(minHeight, categories.length * cellHeight);
  
  return (
    <div className="w-full overflow-x-auto">
      <ReactECharts
        option={option}
        style={{ 
          height: chartHeight + 'px', 
          width: '100%',
          minWidth: isMobile ? '300px' : 'auto'
        }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
