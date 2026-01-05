import { useMemo } from 'react';

interface HighlightRule {
  patterns: string[];
  type: 'positive' | 'negative' | 'entity' | 'feature';
  className: string;
  caseSensitive?: boolean;
}

const highlightRules: HighlightRule[] = [
  // 正面情绪词汇
  {
    patterns: ['令人惊叹', '非常出色', '强烈推荐', '太喜欢', '完美', '优秀', '很好', '不错', '满意', '惊喜', '赞', '棒', '超值', '值得', '性价比高', '物超所值', '精美', '卓越', '杰出', '一流'],
    type: 'positive',
    className: 'bg-green-100/80 text-green-900 dark:bg-green-500/30 dark:text-green-200 px-1.5 py-0.5 rounded-md'
  },
  // 负面情绪词汇
  {
    patterns: ['失望', '糟糕', '不好', '差', '烂', '后悔', '垃圾', '没用', '不值', '浪费', '问题', '故障', '坏', '难用', '不推荐', '退货'],
    type: 'negative',
    className: 'bg-red-100/80 text-red-900 dark:bg-red-500/30 dark:text-red-200 px-1.5 py-0.5 rounded-md'
  },
  // 品牌和产品名称
  {
    patterns: ['Amazon', 'Alexa', 'Echo', 'Apple', 'Google', 'Samsung', 'Sony', 'Microsoft', 'iPhone', 'iPad', 'MacBook', 'Windows', 'Android'],
    type: 'entity',
    className: 'bg-blue-100/80 text-blue-900 dark:bg-blue-500/30 dark:text-blue-200 px-1.5 py-0.5 rounded-md font-medium',
    caseSensitive: false
  },
  // 中文品牌和产品
  {
    patterns: ['亚马逊', '智能家居', '智能音箱', '智能设备', '智能灯', '扬声器', '耳机', '充电宝', '充电器', '数据线', '移动电源', '路由器'],
    type: 'entity',
    className: 'bg-purple-100/80 text-purple-900 dark:bg-purple-500/30 dark:text-purple-200 px-1.5 py-0.5 rounded-md font-medium'
  },
  // 功能和特性
  {
    patterns: ['音质', '音量', '续航', '充电', '连接', 'WiFi', '蓝牙', '设置', '安装', '兼容', '性能', '速度', '画质', '屏幕', '电池', '待机'],
    type: 'feature',
    className: 'bg-amber-100/80 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200 px-1.5 py-0.5 rounded-md'
  }
];

interface HighlightedTextProps {
  text: string;
  className?: string;
}

export function HighlightedText({ text, className = '' }: HighlightedTextProps) {
  const elements = useMemo(() => {
    if (!text) return text;

    const matches: Array<{ start: number; end: number; className: string; text: string }> = [];

    // 查找所有匹配
    highlightRules.forEach(rule => {
      rule.patterns.forEach(pattern => {
        const searchText = rule.caseSensitive === false ? text.toLowerCase() : text;
        const searchPattern = rule.caseSensitive === false ? pattern.toLowerCase() : pattern;
        
        let index = 0;
        while (index < searchText.length) {
          const foundIndex = searchText.indexOf(searchPattern, index);
          if (foundIndex === -1) break;
          
          matches.push({
            start: foundIndex,
            end: foundIndex + pattern.length,
            className: rule.className,
            text: text.slice(foundIndex, foundIndex + pattern.length)
          });
          
          index = foundIndex + 1;
        }
      });
    });

    // 如果没有匹配，直接返回原文
    if (matches.length === 0) {
      return text;
    }

    // 按位置排序
    matches.sort((a, b) => a.start - b.start);

    // 去除重叠的匹配（保留第一个）
    const filteredMatches: typeof matches = [];
    matches.forEach(match => {
      const hasOverlap = filteredMatches.some(
        existing => 
          (match.start >= existing.start && match.start < existing.end) ||
          (match.end > existing.start && match.end <= existing.end)
      );
      if (!hasOverlap) {
        filteredMatches.push(match);
      }
    });

    // 构建带高亮的文本
    const result: JSX.Element[] = [];
    let lastIndex = 0;

    filteredMatches.forEach((match, i) => {
      // 添加匹配前的普通文本
      if (match.start > lastIndex) {
        result.push(
          <span key={`text-${i}`}>{text.slice(lastIndex, match.start)}</span>
        );
      }

      // 添加高亮文本
      result.push(
        <span
          key={`highlight-${i}`}
          className={match.className}
        >
          {match.text}
        </span>
      );

      lastIndex = match.end;
    });

    // 添加最后一段普通文本
    if (lastIndex < text.length) {
      result.push(
        <span key="text-end">{text.slice(lastIndex)}</span>
      );
    }

    return result;
  }, [text]);

  return <span className={className}>{elements}</span>;
}

// 图例组件
export function HighlightLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="bg-green-100/80 text-green-900 dark:bg-green-500/30 dark:text-green-200 px-2 py-1 rounded-md">正面情绪</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="bg-red-100/80 text-red-900 dark:bg-red-500/30 dark:text-red-200 px-2 py-1 rounded-md">负面情绪</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="bg-blue-100/80 text-blue-900 dark:bg-blue-500/30 dark:text-blue-200 px-2 py-1 rounded-md">品牌名称</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="bg-purple-100/80 text-purple-900 dark:bg-purple-500/30 dark:text-purple-200 px-2 py-1 rounded-md">产品实体</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="bg-amber-100/80 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200 px-2 py-1 rounded-md">功能特性</span>
      </div>
    </div>
  );
}
