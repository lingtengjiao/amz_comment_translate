import { useMemo } from 'react';
import type { ThemeTag } from './ThemeHighlight';

// 下划线颜色映射（固定类名确保 Tailwind 编译）
const underlineColorMap: Record<string, string> = {
  'blue': 'decoration-blue-600 dark:decoration-blue-400',
  'purple': 'decoration-purple-600 dark:decoration-purple-400',
  'green': 'decoration-green-600 dark:decoration-green-400',
  'red': 'decoration-red-600 dark:decoration-red-400',
  'orange': 'decoration-orange-600 dark:decoration-orange-400',
  'emerald': 'decoration-emerald-600 dark:decoration-emerald-400',
  'amber': 'decoration-amber-600 dark:decoration-amber-400',
  'pink': 'decoration-pink-600 dark:decoration-pink-400',
  'indigo': 'decoration-indigo-600 dark:decoration-indigo-400',
  'cyan': 'decoration-cyan-600 dark:decoration-cyan-400',
};

// 主题 ID 到颜色的映射
const themeColorMap: Record<string, string> = {
  'who': 'blue',
  'where': 'purple',
  'when': 'green',
  'unmet_needs': 'red',
  'pain_points': 'orange',
  'benefits': 'emerald',
  'features': 'amber',
  'comparison': 'pink',
};

interface ThemeUnderlinedTextProps {
  text: string;
  activeThemes: string[];
  allTags: ThemeTag[];
  className?: string;
}

export function ThemeUnderlinedText({ text, activeThemes, allTags, className = '' }: ThemeUnderlinedTextProps) {
  const elements = useMemo(() => {
    if (!text || activeThemes.length === 0) return text;

    const matches: Array<{ 
      start: number; 
      end: number; 
      underlineColor: string; 
      text: string;
    }> = [];

    // 获取激活的主题配置（只取有 patternsOriginal 的）
    const activeTagConfigs = allTags.filter(
      tag => activeThemes.includes(tag.id) && tag.patternsOriginal && tag.patternsOriginal.length > 0
    );

    if (activeTagConfigs.length === 0) return text;

    activeTagConfigs.forEach(tag => {
      // 获取下划线颜色
      const colorKey = themeColorMap[tag.id] || extractColorFromTag(tag);
      const underlineColor = underlineColorMap[colorKey] || underlineColorMap['blue'];
      
      // 使用 AI 提取的英文原文作为匹配模式
      const patterns = tag.patternsOriginal || [];
      
      patterns.forEach(pattern => {
        if (!pattern) return;
        
        // 不区分大小写匹配
        const searchText = text.toLowerCase();
        const searchPattern = pattern.toLowerCase();
        
        let index = 0;
        while (index < searchText.length) {
          const foundIndex = searchText.indexOf(searchPattern, index);
          if (foundIndex === -1) break;
          
          matches.push({
            start: foundIndex,
            end: foundIndex + pattern.length,
            underlineColor: underlineColor,
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

    // 去除重叠的匹配（保留更长的）
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

    // 构建带下划线的文本
    const result: JSX.Element[] = [];
    let lastIndex = 0;

    filteredMatches.forEach((match, i) => {
      // 添加匹配前的普通文本
      if (match.start > lastIndex) {
        result.push(
          <span key={`text-${i}`}>{text.slice(lastIndex, match.start)}</span>
        );
      }

      // 添加下划线文本
      result.push(
        <span
          key={`underline-${i}`}
          className={match.underlineColor}
          style={{ 
            textDecoration: 'underline',
            textDecorationThickness: '2px',
            textUnderlineOffset: '2px'
          }}
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
  }, [text, activeThemes, allTags]);

  return <span className={className}>{elements}</span>;
}

// 从标签配置中提取颜色名称
function extractColorFromTag(tag: ThemeTag): string {
  const colorMatch = tag.bgColor.match(/bg-(\w+)-/);
  return colorMatch ? colorMatch[1] : 'blue';
}
