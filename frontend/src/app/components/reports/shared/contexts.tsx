/**
 * 报告共享上下文
 */
import { createContext } from 'react';
import type { ReportStats } from '@/api/types';

// 证据上下文 - 用于在子组件中访问 analysisData
export interface EvidenceContextType {
  analysisData: ReportStats | null;
  asin?: string;
  openEvidence: (title: string, sourceTag: string, sourceType: 'context' | 'insight', category: string) => void;
}

export const EvidenceContext = createContext<EvidenceContextType>({
  analysisData: null,
  openEvidence: () => {}
});

// 大纲上下文 - 用于收集所有板块标题
export interface TocContextType {
  registerSection: (id: string, title: string, level?: number) => void;
}

export const TocContext = createContext<TocContextType>({
  registerSection: () => {}
});
