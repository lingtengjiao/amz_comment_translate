/**
 * 洞察提取器
 * 自动从透视矩阵中提取关键洞察
 */
import { PivotMatrix, Insight, PivotType } from './types';

const THRESHOLD_SEGMENT_DIFF = 20; // 细分差异阈值（百分比差）
const THRESHOLD_RISK_COUNT = 5; // 风险点最小评论数
const THRESHOLD_RISK_PERCENT = 30; // 风险点最小百分比
const THRESHOLD_OPPORTUNITY_PERCENT = 20; // 机会点最小百分比
const THRESHOLD_OPPORTUNITY_COUNT = 10; // 机会点最小评论数
const THRESHOLD_STRENGTH_PERCENT = 60; // 优势点最小百分比

/**
 * 从透视矩阵中提取所有洞察
 */
export function extractInsights(
  matrix: PivotMatrix | null,
  pivotType: PivotType
): Insight[] {
  if (!matrix || matrix.rows.length === 0 || matrix.columns.length === 0) {
    return [];
  }
  
  const insights: Insight[] = [];
  
  // 根据透视类型提取不同的洞察
  switch (pivotType) {
    case '5w_sentiment':
    case 'product_sentiment':
      insights.push(...detectSegmentDifference(matrix));
      insights.push(...detectRisks(matrix, '负面'));
      insights.push(...detectStrengths(matrix, '正面'));
      break;
    
    case '5w_product':
      insights.push(...detectSegmentDifference(matrix));
      insights.push(...detectOpportunities(matrix, '建议'));
      insights.push(...detectRisks(matrix, '劣势'));
      insights.push(...detectStrengths(matrix, '优势'));
      break;
    
    case '5w_rating':
    case 'rating_segment':
      insights.push(...detectSegmentDifference(matrix));
      insights.push(...detectRisks(matrix, '1-2星'));
      insights.push(...detectStrengths(matrix, '5星'));
      break;
    
    case '5w_cross':
      insights.push(...detectCorrelations(matrix));
      insights.push(...detectSegmentDifference(matrix));
      break;
    
    case 'time_trend':
      insights.push(...detectTimeTrends(matrix));
      break;
  }
  
  // 按严重程度排序
  return insights.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * 检测细分差异
 * 对比不同行的列分布，识别显著差异
 */
function detectSegmentDifference(matrix: PivotMatrix): Insight[] {
  const insights: Insight[] = [];
  
  for (let i = 0; i < matrix.rows.length; i++) {
    for (let j = i + 1; j < matrix.rows.length; j++) {
      const row1 = matrix.percentages[i];
      const row2 = matrix.percentages[j];
      const row1Total = matrix.metadata.rowTotals[i];
      const row2Total = matrix.metadata.rowTotals[j];
      
      // 只比较有足够数据的行
      if (row1Total < 5 || row2Total < 5) continue;
      
      // 计算每列的差异
      let maxDiff = 0;
      let maxDiffCol = -1;
      
      for (let col = 0; col < matrix.columns.length; col++) {
        const diff = Math.abs(row1[col] - row2[col]);
        if (diff > maxDiff) {
          maxDiff = diff;
          maxDiffCol = col;
        }
      }
      
      // 如果最大差异超过阈值，生成洞察
      if (maxDiff > THRESHOLD_SEGMENT_DIFF) {
        const cells: Array<{ row: number; col: number }> = [
          { row: i, col: maxDiffCol },
          { row: j, col: maxDiffCol },
        ];
        
        insights.push({
          type: 'segment_diff',
          title: `"${matrix.rows[i]}" 与 "${matrix.rows[j]}" 评价差异显著`,
          description: `在"${matrix.columns[maxDiffCol]}"维度上，差异达 ${maxDiff.toFixed(1)}%`,
          cells,
          severity: maxDiff > 40 ? 'high' : maxDiff > 25 ? 'medium' : 'low',
        });
      }
    }
  }
  
  return insights;
}

/**
 * 检测风险点
 * 识别高频负面反馈的组合
 */
function detectRisks(matrix: PivotMatrix, riskColumnName: string): Insight[] {
  const riskColIndex = matrix.columns.findIndex(col => col.includes(riskColumnName));
  if (riskColIndex < 0) return [];
  
  const risks: Insight[] = [];
  
  for (let i = 0; i < matrix.rows.length; i++) {
    const riskCount = matrix.data[i][riskColIndex];
    const riskPercent = matrix.percentages[i][riskColIndex];
    const rowTotal = matrix.metadata.rowTotals[i];
    
    // 如果负面评论数量 > 阈值 且占比 > 阈值
    if (riskCount >= THRESHOLD_RISK_COUNT && riskPercent >= THRESHOLD_RISK_PERCENT) {
      risks.push({
        type: 'risk',
        title: `"${matrix.rows[i]}" 群体${riskColumnName}反馈较多`,
        description: `该群体有 ${riskCount} 条${riskColumnName}评论（占 ${riskPercent.toFixed(1)}%）`,
        cells: [{ row: i, col: riskColIndex }],
        severity: riskPercent > 50 ? 'high' : riskPercent > 40 ? 'medium' : 'low',
      });
    }
  }
  
  return risks;
}

/**
 * 检测优势点
 * 识别高频正面反馈的组合
 */
function detectStrengths(matrix: PivotMatrix, strengthColumnName: string): Insight[] {
  const strengthColIndex = matrix.columns.findIndex(col => col.includes(strengthColumnName));
  if (strengthColIndex < 0) return [];
  
  const strengths: Insight[] = [];
  
  for (let i = 0; i < matrix.rows.length; i++) {
    const strengthCount = matrix.data[i][strengthColIndex];
    const strengthPercent = matrix.percentages[i][strengthColIndex];
    const rowTotal = matrix.metadata.rowTotals[i];
    
    // 如果正面评论占比 > 阈值 且总评论数 > 5
    if (strengthPercent >= THRESHOLD_STRENGTH_PERCENT && rowTotal >= 5) {
      strengths.push({
        type: 'strength',
        title: `"${matrix.rows[i]}" 群体${strengthColumnName}反馈突出`,
        description: `该群体有 ${strengthCount} 条${strengthColumnName}评论（占 ${strengthPercent.toFixed(1)}%）`,
        cells: [{ row: i, col: strengthColIndex }],
        severity: strengthPercent > 80 ? 'high' : strengthPercent > 70 ? 'medium' : 'low',
      });
    }
  }
  
  return strengths;
}

/**
 * 检测机会点
 * 识别高频建议型洞察的组合
 */
function detectOpportunities(matrix: PivotMatrix, opportunityColumnName: string): Insight[] {
  const oppColIndex = matrix.columns.findIndex(col => col.includes(opportunityColumnName));
  if (oppColIndex < 0) return [];
  
  const opportunities: Insight[] = [];
  
  for (let i = 0; i < matrix.rows.length; i++) {
    const oppCount = matrix.data[i][oppColIndex];
    const rowTotal = matrix.metadata.rowTotals[i];
    const oppPercent = rowTotal > 0 ? (oppCount / rowTotal) * 100 : 0;
    
    // 如果建议类洞察占比 > 阈值 且总评论数 > 阈值
    if (oppPercent >= THRESHOLD_OPPORTUNITY_PERCENT && rowTotal >= THRESHOLD_OPPORTUNITY_COUNT) {
      opportunities.push({
        type: 'opportunity',
        title: `"${matrix.rows[i]}" 群体有明确改进需求`,
        description: `该群体提出了 ${oppCount} 条${opportunityColumnName}（占 ${oppPercent.toFixed(1)}%）`,
        cells: [{ row: i, col: oppColIndex }],
        severity: oppPercent > 30 ? 'high' : oppPercent > 25 ? 'medium' : 'low',
      });
    }
  }
  
  return opportunities;
}

/**
 * 检测关联性
 * 识别5W交叉中的强关联模式
 */
function detectCorrelations(matrix: PivotMatrix): Insight[] {
  const correlations: Insight[] = [];
  
  // 计算每行的最大值和最小值
  for (let i = 0; i < matrix.rows.length; i++) {
    const row = matrix.data[i];
    const maxVal = Math.max(...row);
    const maxColIndex = row.indexOf(maxVal);
    const rowTotal = matrix.metadata.rowTotals[i];
    
    // 如果某个组合的评论数明显高于其他组合（占比 > 40%）
    if (rowTotal > 5 && maxVal / rowTotal > 0.4) {
      correlations.push({
        type: 'correlation',
        title: `"${matrix.rows[i]}" 与 "${matrix.columns[maxColIndex]}" 强关联`,
        description: `有 ${maxVal} 条评论同时属于这两个标签（占该行的 ${((maxVal / rowTotal) * 100).toFixed(1)}%）`,
        cells: [{ row: i, col: maxColIndex }],
        severity: maxVal / rowTotal > 0.6 ? 'high' : 'medium',
      });
    }
  }
  
  return correlations;
}

/**
 * 检测时间趋势
 * 识别维度随时间的变化趋势
 */
function detectTimeTrends(matrix: PivotMatrix): Insight[] {
  const trends: Insight[] = [];
  
  // 按时间排序的行
  const sortedRows = [...matrix.rows].sort();
  
  // 对每一列（维度），检测时间趋势
  for (let col = 0; col < matrix.columns.length; col++) {
    const values = sortedRows.map(row => {
      const rowIndex = matrix.rows.indexOf(row);
      return matrix.data[rowIndex][col];
    });
    
    // 计算趋势（简单线性回归斜率）
    const n = values.length;
    if (n < 3) continue;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    values.forEach((y, i) => {
      const x = i;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgValue = sumY / n;
    
    // 如果趋势明显（斜率 > 平均值的10%）
    if (Math.abs(slope) > avgValue * 0.1) {
      const trend = slope > 0 ? '上升' : '下降';
      trends.push({
        type: 'correlation',
        title: `"${matrix.columns[col]}" 维度呈${trend}趋势`,
        description: `从 ${sortedRows[0]} 到 ${sortedRows[sortedRows.length - 1]}，该维度评论数${trend}了 ${Math.abs(slope).toFixed(1)} 条/月`,
        cells: sortedRows.map((_, i) => ({ row: matrix.rows.indexOf(sortedRows[i]), col })),
        severity: Math.abs(slope) > avgValue * 0.2 ? 'high' : 'medium',
      });
    }
  }
  
  return trends;
}
