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
    return {
      title: title ? {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold',
        },
      } : undefined,
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
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
            fontSize: 11,
            color: '#333',
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: '#fff',
          },
        },
      ],
    };
  }, [nodes, links, title]);
  
  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: '400px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
