/**
 * 热力矩阵图表组件
 * 用于展示二维交叉频次分析
 */
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';

interface HeatmapChartProps {
  rows: string[];
  columns: string[];
  data: number[][];
  onCellClick?: (row: number, col: number) => void;
  colorScheme?: 'default' | 'sentiment'; // sentiment: 红绿配色
}

export function HeatmapChart({ rows, columns, data, onCellClick, colorScheme = 'default' }: HeatmapChartProps) {
  const option = useMemo(() => {
    // 转换数据为 ECharts 格式 [[colIndex, rowIndex, value]]
    const heatmapData: [number, number, number][] = [];
    const maxValue = Math.max(...data.flat());
    
    data.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        heatmapData.push([colIndex, rowIndex, value]);
      });
    });
    
    return {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const { value } = params;
          const [colIndex, rowIndex, count] = value;
          const rowTotal = data[rowIndex].reduce((sum, v) => sum + v, 0);
          const percent = rowTotal > 0 ? ((count / rowTotal) * 100).toFixed(1) : '0';
          return `<strong>${rows[rowIndex]}</strong> × <strong>${columns[colIndex]}</strong><br/>
                  评论数: ${count}<br/>
                  占比: ${percent}%`;
        },
      },
      grid: {
        left: '15%',
        right: '5%',
        top: '10%',
        bottom: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: columns,
        splitArea: {
          show: true,
        },
        axisLabel: {
          interval: 0,
          rotate: columns.length > 6 ? 30 : 0,
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'category',
        data: rows,
        splitArea: {
          show: true,
        },
        axisLabel: {
          fontSize: 11,
        },
      },
      visualMap: colorScheme === 'sentiment' ? {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#dcfce7', '#86efac', '#22c55e', '#15803d'], // 绿色系
        },
        text: ['高', '低'],
        textStyle: {
          fontSize: 10,
        },
      } : {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af'], // 蓝色系
        },
        text: ['高', '低'],
        textStyle: {
          fontSize: 10,
        },
      },
      series: [
        {
          name: '交叉频次',
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            fontSize: 10,
            formatter: (params: any) => {
              const value = params.value[2];
              return value > 0 ? value : '';
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              borderWidth: 2,
              borderColor: '#fff',
            },
          },
        },
      ],
    };
  }, [rows, columns, data, colorScheme]);
  
  const handleClick = (params: any) => {
    if (onCellClick && params.componentType === 'series') {
      const [colIndex, rowIndex] = params.value;
      onCellClick(rowIndex, colIndex);
    }
  };
  
  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: Math.max(300, rows.length * 40) + 'px', width: '100%' }}
        onEvents={{ click: handleClick }}
      />
    </div>
  );
}
