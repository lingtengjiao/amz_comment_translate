/**
 * 桑基图组件
 * 用于展示决策链路、流向关系
 */
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';

interface SankeyNode {
  name: string;
  depth?: number;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  title?: string;
}

export function SankeyChart({ nodes, links, title }: SankeyChartProps) {
  const option = useMemo(() => {
    // 检测是否为移动设备
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    return {
      title: title ? {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: isMobile ? 12 : 14,
          fontWeight: 'bold',
        },
      } : undefined,
      tooltip: {
        trigger: 'item',
        triggerOn: isMobile ? 'click' : 'mousemove', // 移动端改为点击触发
        confine: true, // 限制在图表区域内
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            return `${params.data.source} → ${params.data.target}<br/>评论数: ${params.data.value}`;
          } else {
            return `${params.name}<br/>总计: ${params.value}`;
          }
        },
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: {
            focus: 'adjacency',
          },
          data: nodes,
          links: links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5,
          },
          label: {
            fontSize: isMobile ? 9 : 11,
            color: '#333',
            overflow: 'truncate',
            width: isMobile ? 60 : undefined,
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: '#fff',
          },
        },
      ],
    };
  }, [nodes, links, title]);
  
  // 移动端适配高度
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const chartHeight = isMobile ? '300px' : '400px';
  
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
