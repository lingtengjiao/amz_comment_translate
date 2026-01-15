/**
 * SupplyChainReportPage - 供应链质检报告独立页面
 * 
 * 专门针对供应链报告的渲染，结构清晰，易于维护
 */
import { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import type { SupplyChainReportContent } from './types';
import type { ReportStats } from '@/api/types';
import { REPORT_TYPE_CONFIG } from '@/api/types';
import { StatsDashboard } from '../../StatsDashboard';
import { TocContext } from '../shared';
import {
  UsageContextAnalysis,
  QualitySummary,
  MaterialDefects,
  PackagingIssues,
  MissingParts,
  SupplierIssues,
  ReturnRateFactors,
  QCChecklist,
  AssemblyDefects
} from './sections';

interface SupplyChainReportPageProps {
  content: string; // JSON 字符串
  analysisData?: ReportStats | null; // 原始统计数据，用于数据概览
  onSectionsChange?: (sections: Array<{ id: string; title: string; level?: number }>) => void;
  asin?: string;
  onViewReviews?: (dimensionKey: string, dimensionLabel: string, tagLabel: string, totalCount: number) => void;
}

// 安全解析 JSON
function safeParseJson(content: string): SupplyChainReportContent | null {
  try {
    return JSON.parse(content);
  } catch {
    console.error('Failed to parse supply chain report content');
    return null;
  }
}

export const SupplyChainReportPage = memo(function SupplyChainReportPage({
  content,
  analysisData,
  onSectionsChange,
  asin,
  onViewReviews
}: SupplyChainReportPageProps) {
  // 解析内容
  const data = useMemo(() => safeParseJson(content), [content]);

  // 报告类型配置
  const config = REPORT_TYPE_CONFIG['supply_chain'];

  // 大纲收集机制
  const sectionsRef = useRef<Map<string, { id: string; title: string; level: number }>>(new Map());
  const updateTimerRef = useRef<number | null>(null);

  const registerSection = useCallback((id: string, title: string, level: number = 0) => {
    const existing = sectionsRef.current.get(id);
    if (existing && existing.title === title && existing.level === level) {
      return;
    }
    sectionsRef.current.set(id, { id, title, level });
    
    // 防抖更新
    if (updateTimerRef.current) {
      cancelAnimationFrame(updateTimerRef.current);
    }
    updateTimerRef.current = requestAnimationFrame(() => {
      if (onSectionsChange) {
        const sections = Array.from(sectionsRef.current.values());
        onSectionsChange(sections);
      }
    });
  }, [onSectionsChange]);

  // 清理
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        cancelAnimationFrame(updateTimerRef.current);
      }
    };
  }, []);

  if (!data) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="size-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          报告内容解析失败
        </h3>
        <p className="text-sm text-gray-500">
          无法解析报告内容，请检查数据格式
        </p>
      </div>
    );
  }

  return (
    <TocContext.Provider value={{ registerSection }}>
    <div className="space-y-6 json-report-container">
      {/* 📊 数据概览 - 5W用户画像 + 5类口碑洞察 */}
      {analysisData && (
        <StatsDashboard 
          analysisData={analysisData} 
          onViewReviews={asin ? onViewReviews : undefined}
        />
      )}

      {/* AI 智能分析标题 */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
        <span className="text-2xl">{config?.icon || '📦'}</span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{config?.label || '供应链版'}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{config?.description || '供应链视角 - 质量整改'}</p>
        </div>
      </div>
      
      {analysisData && (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Search className="size-3" />
          点击带有 🔍 的观点可查看原始评论证据
        </p>
      )}

      {/* 用户画像5W概况 */}
      <UsageContextAnalysis data={data.usage_context_analysis} />

      {/* 质量评估概况 */}
      <QualitySummary data={data.quality_summary} />

      {/* 材质做工问题 */}
      <MaterialDefects data={data.material_defects} />

      {/* 包装与物流 */}
      <PackagingIssues data={data.packaging_issues} />

      {/* 常见漏发配件 */}
      <MissingParts data={data.missing_parts} />

      {/* 供应商问题 */}
      <SupplierIssues data={data.supplier_issues} />

      {/* 主要退货原因 */}
      <ReturnRateFactors data={data.return_rate_factors} />

      {/* 组装问题 */}
      <AssemblyDefects data={data.assembly_defects} />

      {/* QC 检查清单 */}
      <QCChecklist data={data.qc_checklist} />
    </div>
    </TocContext.Provider>
  );
});

export default SupplyChainReportPage;
