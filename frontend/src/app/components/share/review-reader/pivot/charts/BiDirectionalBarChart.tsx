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
    
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
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
          fontSize: 11,
        },
      },
      grid: {
        left: '25%',
        right: '25%',
        top: '5%',
        bottom: '15%',
        containLabel: false,
      },
      xAxis: {
        type: 'value',
        min: -maxValue * 1.1,
        max: maxValue * 1.1,
        axisLabel: {
          formatter: (value: number) => Math.abs(value).toString(),
          fontSize: 10,
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
          fontSize: 11,
          align: 'center',
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
            show: true,
            position: 'left',
            fontSize: 10,
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
            show: true,
            position: 'right',
            fontSize: 10,
          },
          data: rightData,
          itemStyle: {
            color: '#ef4444', // 红色
          },
        },
      ],
    };
  }, [categories, leftData, rightData, leftLabel, rightLabel]);
  
  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: Math.max(300, categories.length * 45) + 'px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
