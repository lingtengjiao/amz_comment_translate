/**
 * 供应链报告类型定义 - 精确匹配 AI 输出结构
 */

// 证据项
export interface Evidence {
  review_id: string | null;
  quote: string;
}

// 使用场景分析项
export interface UsageContextItem {
  insight?: string;        // AI 实际返回的字段
  description?: string;    // 兼容旧格式
  evidence: Evidence[];
  confidence: 'high' | 'medium' | 'low';
}

// 质量概况
export interface QualitySummary {
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence[];
  // 可选的评分字段
  overall_quality_score?: string;
  estimated_return_rate?: string;
  top_quality_issues?: string[];
  improvement_priority?: string;
}

// 材质缺陷项
export interface MaterialDefectItem {
  issue: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence[];
}

// 材质缺陷（包装结构）
export interface MaterialDefects {
  issues: MaterialDefectItem[];
}

// 包装问题项
export interface PackagingIssueItem {
  issue: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence[];
}

// 包装问题（包装结构）
export interface PackagingIssues {
  issues: PackagingIssueItem[];
}

// 漏发配件项
export interface MissingPartItem {
  part: string;
  evidence: Evidence[];
  confidence: 'high' | 'medium' | 'low';
  impact_analysis: string;
}

// 供应商问题项
export interface SupplierIssueItem {
  issue: string;
  evidence: Evidence[];
  confidence: 'high' | 'medium' | 'low';
  insight?: string;           // AI 实际返回的字段
  recommendation?: string;    // AI 实际返回的字段
  impact_analysis?: string;   // 兼容旧格式
}

// 退货原因项
export interface ReturnRateFactorItem {
  factor: string;
  evidence: Evidence[];
  confidence: 'high' | 'medium' | 'low';
  insight?: string;           // AI 实际返回的字段
  recommendation?: string;    // AI 实际返回的字段
  impact_analysis?: string;   // 兼容旧格式
}

// QC 检查清单项
export interface QCChecklistItem {
  issue: string;
  evidence: Evidence[];
  confidence: 'high' | 'medium' | 'low';
  suggestion: string;
}

// 供应链报告完整内容
export interface SupplyChainReportContent {
  usage_context_analysis: UsageContextItem[];
  quality_summary: QualitySummary;
  material_defects: MaterialDefects;
  packaging_issues: PackagingIssues;
  missing_parts: MissingPartItem[];
  supplier_issues: SupplierIssueItem[];
  return_rate_factors: ReturnRateFactorItem[];
  qc_checklist: QCChecklistItem[];
}

// 供应链报告响应
export interface SupplyChainReport {
  id: string;
  product_id: string;
  title: string;
  content: string; // JSON 字符串，解析后为 SupplyChainReportContent
  report_type: 'supply_chain';
  status: string;
  created_at: string;
  updated_at: string;
  analysis_data?: {
    total_reviews?: number;
    meta?: { total_reviews?: number };
  };
}
