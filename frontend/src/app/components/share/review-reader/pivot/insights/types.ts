/**
 * 洞察报告类型定义
 */

export interface InsightData {
  title: string;
  description: string;
  findings: string[];
  dataPoints: DataPoint[];
  actionable: string[];
  severity?: 'success' | 'warning' | 'error' | 'info';
}

export interface DataPoint {
  label: string;
  value: number;
  percentage?: number;
  category?: string;
}

export interface CrossData {
  row: string;
  col: string;
  value: number;
  percentage: number;
  reviewIds: string[];
}

export interface ChartConfig {
  type: 'heatmap' | 'bar' | 'grouped-bar' | 'bubble' | 'radar' | 'sunburst' | 'sankey';
  data: any;
  options?: any;
}

export type InsightCategory = 'audience' | 'demand' | 'product' | 'scenario' | 'brand';

export interface InsightModule {
  id: string;
  category: InsightCategory;
  title: string;
  subtitle: string;
  icon: string;
  insights: InsightSection[];
}

export interface InsightSection {
  id: string;
  title: string;
  description: string;
  chartConfig: ChartConfig;
  interpretation: Interpretation;
  rawData?: any;
}

export interface Interpretation {
  keyFindings: string[];
  dataSupport: {
    metric: string;
    value: string;
  }[];
  recommendations: string[];
  severity: 'success' | 'warning' | 'error' | 'info';
}
