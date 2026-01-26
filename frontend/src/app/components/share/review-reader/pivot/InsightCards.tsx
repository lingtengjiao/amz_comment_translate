/**
 * 洞察卡片展示组件
 */
import { Insight } from './types';
import { AlertTriangle, TrendingUp, Lightbulb, Target, Link2 } from 'lucide-react';

interface InsightCardsProps {
  insights: Insight[];
  onCellClick?: (row: number, col: number) => void;
}

export function InsightCards({ insights, onCellClick }: InsightCardsProps) {
  if (insights.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        暂无关键洞察，尝试切换其他透视类型
      </div>
    );
  }
  
  // 按类型分组
  const groupedInsights = {
    segment_diff: insights.filter(i => i.type === 'segment_diff'),
    risk: insights.filter(i => i.type === 'risk'),
    strength: insights.filter(i => i.type === 'strength'),
    opportunity: insights.filter(i => i.type === 'opportunity'),
    correlation: insights.filter(i => i.type === 'correlation'),
  };
  
  const getIcon = (type: Insight['type']) => {
    switch (type) {
      case 'segment_diff':
        return <Target className="h-4 w-4" />;
      case 'risk':
        return <AlertTriangle className="h-4 w-4" />;
      case 'strength':
        return <TrendingUp className="h-4 w-4" />;
      case 'opportunity':
        return <Lightbulb className="h-4 w-4" />;
      case 'correlation':
        return <Link2 className="h-4 w-4" />;
    }
  };
  
  const getColor = (type: Insight['type'], severity: Insight['severity']) => {
    const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      segment_diff: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'text-blue-500',
      },
      risk: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        icon: 'text-red-500',
      },
      strength: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        icon: 'text-green-500',
      },
      opportunity: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-700',
        icon: 'text-yellow-500',
      },
      correlation: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        icon: 'text-purple-500',
      },
    };
    
    return colorMap[type] || colorMap.segment_diff;
  };
  
  const getTypeLabel = (type: Insight['type']) => {
    switch (type) {
      case 'segment_diff':
        return '细分差异';
      case 'risk':
        return '风险点';
      case 'strength':
        return '优势点';
      case 'opportunity':
        return '机会点';
      case 'correlation':
        return '关联性';
    }
  };
  
  return (
    <div className="space-y-3">
      {insights.slice(0, 5).map((insight, index) => {
        const colors = getColor(insight.type, insight.severity);
        
        return (
          <div
            key={index}
            className={`p-3 rounded-lg border ${colors.bg} ${colors.border} cursor-pointer hover:shadow-md transition-shadow`}
            onClick={() => {
              // 点击第一个相关单元格
              if (insight.cells.length > 0 && onCellClick) {
                onCellClick(insight.cells[0].row, insight.cells[0].col);
              }
            }}
          >
            <div className="flex items-start gap-2">
              <div className={`${colors.icon} mt-0.5 shrink-0`}>
                {getIcon(insight.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold ${colors.text}`}>
                    {getTypeLabel(insight.type)}
                  </span>
                  {insight.severity === 'high' && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">
                      高优先级
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                  {insight.title}
                </h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {insight.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      
      {insights.length > 5 && (
        <div className="text-center text-xs text-gray-400 py-2">
          还有 {insights.length - 5} 个洞察，查看表格了解更多
        </div>
      )}
    </div>
  );
}
