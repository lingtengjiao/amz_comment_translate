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
    
    // 检测是否为移动设备
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    return {
      tooltip: {
        position: 'top',
        confine: true, // 限制在图表区域内，防止移动端溢出
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
        left: isMobile ? '20%' : '15%',
        right: isMobile ? '2%' : '5%',
        top: isMobile ? '5%' : '10%',
        bottom: isMobile ? '20%' : '15%',
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
          rotate: isMobile ? 45 : (columns.length > 6 ? 30 : 0),
          fontSize: isMobile ? 9 : 11,
          overflow: 'truncate',
          width: isMobile ? 60 : undefined,
        },
      },
      yAxis: {
        type: 'category',
        data: rows,
        splitArea: {
          show: true,
        },
        axisLabel: {
          fontSize: isMobile ? 9 : 11,
          overflow: 'truncate',
          width: isMobile ? 80 : undefined,
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
          fontSize: isMobile ? 9 : 10,
        },
        itemWidth: isMobile ? 15 : 20,
        itemHeight: isMobile ? 100 : 140,
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
          fontSize: isMobile ? 9 : 10,
        },
        itemWidth: isMobile ? 15 : 20,
        itemHeight: isMobile ? 100 : 140,
      },
      series: [
        {
          name: '交叉频次',
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: !isMobile, // 移动端隐藏标签，避免拥挤
            fontSize: isMobile ? 8 : 10,
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
  
  // 动态计算图表高度，移动端更紧凑
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const cellHeight = isMobile ? 30 : 40;
  const minHeight = isMobile ? 250 : 300;
  const chartHeight = Math.max(minHeight, rows.length * cellHeight);
  
  return (
    <div className="w-full overflow-x-auto">
      <ReactECharts
        option={option}
        style={{ 
          height: chartHeight + 'px', 
          width: '100%',
          minWidth: isMobile ? '300px' : 'auto' // 移动端设置最小宽度，允许横向滚动
        }}
        onEvents={{ click: handleClick }}
        opts={{ renderer: 'canvas' }} // 移动端使用canvas渲染，性能更好
      />
    </div>
  );
}
