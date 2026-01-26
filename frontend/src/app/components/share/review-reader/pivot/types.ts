/**
 * 数据透视功能类型定义
 */

// 透视维度类型
export type PivotDimensionType = 
  | 'buyer'      // 购买者
  | 'user'       // 使用者
  | 'what'       // 用途
  | 'why'        // 动机
  | 'when'       // 时机
  | 'where'      // 地点
  | 'strength'   // 产品优势维度
  | 'weakness'   // 产品劣势维度
  | 'suggestion' // 产品建议维度
  | 'sentiment'  // 情感倾向（正面/中性/负面）
  | 'emotion'    // 用户情感标签（学习出来的）
  | 'scenario';  // 场景维度

// 维度配置
export const DIMENSION_CONFIG: Record<PivotDimensionType, { label: string; description: string }> = {
  buyer: { label: '购买者 (Buyer)', description: '谁购买了这个产品' },
  user: { label: '使用者 (User)', description: '谁在使用这个产品' },
  what: { label: '用途 (What)', description: '用来做什么' },
  why: { label: '动机 (Why)', description: '为什么购买' },
  when: { label: '时机 (When)', description: '什么时候使用' },
  where: { label: '地点 (Where)', description: '在哪里使用' },
  strength: { label: '产品优势维度', description: '用户认为好的产品特性' },
  weakness: { label: '产品劣势维度', description: '用户认为差的产品特性' },
  suggestion: { label: '产品改进建议', description: '用户希望改进的方面' },
  sentiment: { label: '情感倾向', description: '正面/中性/负面' },
  emotion: { label: '用户情感标签', description: '用户表达的具体情感' },
  scenario: { label: '使用场景', description: '产品使用场景' },
};

export interface PivotMatrix {
  rows: string[];           // 行标签
  columns: string[];        // 列标签
  data: number[][];        // 数值矩阵 [row][col]
  percentages: number[][]; // 百分比矩阵 [row][col]（基于行合计的百分比）
  reviewIds: string[][][]; // 每个单元格对应的评论ID列表 [row][col][reviewIds]
  metadata: {
    rowTotals: number[];    // 每行合计
    columnTotals: number[]; // 每列合计
    grandTotal: number;     // 总计
  };
}

// 三维透视矩阵
export interface Pivot3DMatrix {
  rows: string[];           // 行标签（维度1）
  columns: string[];        // 列标签（维度2）
  layers: string[];         // 层标签（维度3）
  data: number[][][];      // 数值矩阵 [layer][row][col]
  reviewIds: string[][][][]; // 评论ID列表 [layer][row][col][reviewIds]
  metadata: {
    layerTotals: number[];  // 每层合计
    grandTotal: number;     // 总计
  };
}

export interface DrillDownData {
  rowLabel: string;
  colLabel: string;
  reviewIds: string[];
  count: number;
}

export interface PivotCalculatorInput {
  reviews: Array<{
    id: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    rating?: number;
    review_date?: string;
    theme_highlights?: Array<{
      theme_type: string;
      label_name: string;
    }>;
    insights?: Array<{
      type: 'strength' | 'weakness' | 'suggestion' | 'scenario' | 'emotion';
      dimension?: string;
    }>;
  }>;
  aggregated_themes?: Record<string, Array<{
    label: string;
    count: number;
    review_ids: string[];
  }>>;
  aggregated_insights?: {
    strengths?: Array<{ dimension?: string; review_id: string }>;
    weaknesses?: Array<{ dimension?: string; review_id: string }>;
    suggestions?: Array<{ dimension?: string; review_id: string }>;
    scenarios?: Array<{ dimension?: string; review_id: string }>;
    emotions?: Array<{ dimension?: string; review_id: string }>;
  };
  pivot_matrices?: {
    location_suggestion?: Record<string, Record<string, number>>;
    motivation_location?: Record<string, Record<string, number>>;
    location_time_scenario?: Record<string, Record<string, Record<string, number>>>;
    buyer_user_motivation?: Record<string, Record<string, Record<string, number>>>;
    strength_scenario_emotion?: Record<string, Record<string, Record<string, number>>>;
    motivation_weakness_suggestion?: Record<string, Record<string, Record<string, number>>>;
    emotion_dimension_location?: Record<string, Record<string, Record<string, number>>>;
  };
}
