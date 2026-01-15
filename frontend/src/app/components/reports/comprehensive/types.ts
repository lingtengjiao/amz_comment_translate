/**
 * 综合战略报告类型定义 - 精确匹配 AI 输出结构
 */

// 证据项
export interface Evidence {
  review_id: string | null;
  quote: string;
}

// 用户画像项
export interface UserProfileItem {
  aspect?: string;
  insight?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// 战略判断项
export interface StrategicVerdictItem {
  verdict?: string;
  insight?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// 市场匹配分析项
export interface MarketFitItem {
  insight?: string;
  analysis?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// SWOT 项
export interface SwotItem {
  point?: string;
  描述?: string;
  description?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// SWOT 分析
export interface SwotAnalysis {
  strengths: Array<string | SwotItem>;
  weaknesses: Array<string | SwotItem>;
  opportunities: Array<string | SwotItem>;
  threats: Array<string | SwotItem>;
}

// 部门指令项
export interface DepartmentDirectiveItem {
  department?: string;
  to?: string;
  directive?: string;
  action?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// 部门指令（对象格式）
export interface DepartmentDirectivesObject {
  to_marketing?: string;
  to_product?: string;
  to_supply_chain?: string;
}

// 优先行动项
export interface PriorityActionItem {
  action?: string;
  task?: string;
  owner?: string;
  deadline?: string;
  priority?: string;
  evidence?: Evidence[];
  confidence?: 'high' | 'medium' | 'low';
}

// 综合战略报告完整内容
export interface ComprehensiveReportContent {
  user_profile?: UserProfileItem[] | UserProfileItem;
  strategic_verdict: string | StrategicVerdictItem[];
  market_fit_analysis: string | MarketFitItem[];
  core_swot: SwotAnalysis;
  department_directives: DepartmentDirectivesObject | DepartmentDirectiveItem[];
  priority_actions?: PriorityActionItem[];
  risk_level?: 'low' | 'medium' | 'high' | 'critical' | string;
}
