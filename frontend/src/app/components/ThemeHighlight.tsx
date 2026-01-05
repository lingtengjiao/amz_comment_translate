import { useMemo } from 'react';
import type { ReviewThemeHighlight } from '@/api/types';

export interface ThemeTag {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  darkBgColor: string;
  darkTextColor: string;
  patterns: string[]; // 中文：从后端 AI 提取的 items.content
  patternsOriginal?: string[]; // 英文：从后端 AI 提取的 items.content_original
  isCustom?: boolean;
  isProcessing?: boolean;
  question?: string;
}

// 主题类型配置（只包含元数据，patterns 为空，由后端 AI 填充）
export const themeTagsPreset: ThemeTag[] = [
  {
    id: 'who',
    label: 'Who（使用者）',
    color: 'text-blue-900',
    bgColor: 'bg-blue-100/90',
    darkBgColor: 'dark:bg-blue-500/30',
    darkTextColor: 'dark:text-blue-200',
    patterns: [] // 由后端 AI 动态填充
  },
  {
    id: 'where',
    label: 'Where（使用场景）',
    color: 'text-purple-900',
    bgColor: 'bg-purple-100/90',
    darkBgColor: 'dark:bg-purple-500/30',
    darkTextColor: 'dark:text-purple-200',
    patterns: []
  },
  {
    id: 'when',
    label: 'When（使用时机）',
    color: 'text-green-900',
    bgColor: 'bg-green-100/90',
    darkBgColor: 'dark:bg-green-500/30',
    darkTextColor: 'dark:text-green-200',
    patterns: []
  },
  {
    id: 'unmet_needs',
    label: '未被满足的需求',
    color: 'text-red-900',
    bgColor: 'bg-red-100/90',
    darkBgColor: 'dark:bg-red-500/30',
    darkTextColor: 'dark:text-red-200',
    patterns: []
  },
  {
    id: 'pain_points',
    label: 'Pain Points（痛点）',
    color: 'text-orange-900',
    bgColor: 'bg-orange-100/90',
    darkBgColor: 'dark:bg-orange-500/30',
    darkTextColor: 'dark:text-orange-200',
    patterns: []
  },
  {
    id: 'benefits',
    label: 'Benefits（收益/好处）',
    color: 'text-emerald-900',
    bgColor: 'bg-emerald-100/90',
    darkBgColor: 'dark:bg-emerald-500/30',
    darkTextColor: 'dark:text-emerald-200',
    patterns: []
  },
  {
    id: 'features',
    label: 'Features（功能特性）',
    color: 'text-amber-900',
    bgColor: 'bg-amber-100/90',
    darkBgColor: 'dark:bg-amber-500/30',
    darkTextColor: 'dark:text-amber-200',
    patterns: []
  },
  {
    id: 'comparison',
    label: 'Comparison（对比）',
    color: 'text-pink-900',
    bgColor: 'bg-pink-100/90',
    darkBgColor: 'dark:bg-pink-500/30',
    darkTextColor: 'dark:text-pink-200',
    patterns: []
  }
];

/**
 * 从后端动态数据构建主题标签
 * patterns 来自 items.content（中文）
 * patternsOriginal 来自 items.content_original（英文）
 */
export function buildThemeTagsFromHighlights(
  dynamicHighlights?: ReviewThemeHighlight[]
): ThemeTag[] {
  // 创建动态内容映射（中文和英文分开）
  const dynamicMapChinese = new Map<string, string[]>();
  const dynamicMapEnglish = new Map<string, string[]>();
  
  if (dynamicHighlights && dynamicHighlights.length > 0) {
    dynamicHighlights.forEach(h => {
      const contentsChinese: string[] = [];
      const contentsEnglish: string[] = [];
      
      if (h.items && Array.isArray(h.items) && h.items.length > 0) {
        h.items.forEach(item => {
          // 中文内容
          if (item.content && item.content.trim()) {
            contentsChinese.push(item.content.trim());
          }
          // 英文原文（使用下划线格式，与 types.ts 一致）
          if (item.content_original && item.content_original.trim()) {
            contentsEnglish.push(item.content_original.trim());
          }
        });
      }
      
      if (contentsChinese.length > 0) {
        dynamicMapChinese.set(h.themeType, contentsChinese);
      }
      if (contentsEnglish.length > 0) {
        dynamicMapEnglish.set(h.themeType, contentsEnglish);
      }
    });
  }
  
  // 构建标签
  return themeTagsPreset.map(tag => {
    return {
      ...tag,
      patterns: dynamicMapChinese.get(tag.id) || [],
      patternsOriginal: dynamicMapEnglish.get(tag.id) || []
    };
  });
}

/**
 * 为单条评论构建主题标签（使用该评论的 AI 提取内容）
 */
export function buildThemeTagsForReview(
  dynamicHighlights?: ReviewThemeHighlight[]
): ThemeTag[] {
  return buildThemeTagsFromHighlights(dynamicHighlights);
}

// 颜色配置映射
export const colorConfigMap: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  blue: { bg: 'bg-blue-100/90', text: 'text-blue-900', darkBg: 'dark:bg-blue-500/30', darkText: 'dark:text-blue-200' },
  purple: { bg: 'bg-purple-100/90', text: 'text-purple-900', darkBg: 'dark:bg-purple-500/30', darkText: 'dark:text-purple-200' },
  green: { bg: 'bg-green-100/90', text: 'text-green-900', darkBg: 'dark:bg-green-500/30', darkText: 'dark:text-green-200' },
  red: { bg: 'bg-red-100/90', text: 'text-red-900', darkBg: 'dark:bg-red-500/30', darkText: 'dark:text-red-200' },
  orange: { bg: 'bg-orange-100/90', text: 'text-orange-900', darkBg: 'dark:bg-orange-500/30', darkText: 'dark:text-orange-200' },
  emerald: { bg: 'bg-emerald-100/90', text: 'text-emerald-900', darkBg: 'dark:bg-emerald-500/30', darkText: 'dark:text-emerald-200' },
  amber: { bg: 'bg-amber-100/90', text: 'text-amber-900', darkBg: 'dark:bg-amber-500/30', darkText: 'dark:text-amber-200' },
  pink: { bg: 'bg-pink-100/90', text: 'text-pink-900', darkBg: 'dark:bg-pink-500/30', darkText: 'dark:text-pink-200' },
  indigo: { bg: 'bg-indigo-100/90', text: 'text-indigo-900', darkBg: 'dark:bg-indigo-500/30', darkText: 'dark:text-indigo-200' },
  cyan: { bg: 'bg-cyan-100/90', text: 'text-cyan-900', darkBg: 'dark:bg-cyan-500/30', darkText: 'dark:text-cyan-200' },
};

interface ThemeHighlightedTextProps {
  text: string;
  activeThemes: string[]; // 当前激活的主题ID列表
  allTags: ThemeTag[]; // 该评论的主题标签（含 AI 提取的 patterns）
  className?: string;
}

export function ThemeHighlightedText({ text, activeThemes, allTags, className = '' }: ThemeHighlightedTextProps) {
  const elements = useMemo(() => {
    if (!text || activeThemes.length === 0) return text;

    // 获取激活的主题标签（只取有 patterns 的）
    const activeTagConfigs = allTags.filter(
      tag => activeThemes.includes(tag.id) && tag.patterns.length > 0
    );
    
    if (activeTagConfigs.length === 0) return text;
    
    const matches: Array<{ start: number; end: number; className: string; text: string }> = [];

    // 查找所有匹配（使用 AI 提取的 patterns）
    activeTagConfigs.forEach(tag => {
      tag.patterns.forEach(pattern => {
        if (!pattern) return;
        
        let index = 0;
        while (index < text.length) {
          const foundIndex = text.indexOf(pattern, index);
          if (foundIndex === -1) break;
          
          matches.push({
            start: foundIndex,
            end: foundIndex + pattern.length,
            className: `${tag.bgColor} ${tag.color} ${tag.darkBgColor} ${tag.darkTextColor} px-1.5 py-0.5 rounded-md font-medium`,
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

    // 去除重叠的匹配（保留更长的匹配）
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
  }, [text, activeThemes, allTags]);

  return <span className={className}>{elements}</span>;
}
