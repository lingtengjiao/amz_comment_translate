/**
 * 透视计算引擎
 * 计算任意两个或三个维度之间的交叉矩阵
 */
import { PivotMatrix, Pivot3DMatrix, PivotDimensionType, PivotCalculatorInput } from './types';

/**
 * 计算两个维度之间的交叉矩阵（决策树逻辑）
 */
export function calculateCrossMatrix(
  rowDimension: PivotDimensionType,
  colDimension: PivotDimensionType,
  input: PivotCalculatorInput
): PivotMatrix | null {
  const { reviews, aggregated_themes = {}, aggregated_insights = {} } = input;
  
  // 获取行维度的所有标签
  const rowLabels = extractDimensionLabels(rowDimension, aggregated_themes, aggregated_insights, reviews);
  
  // 获取列维度的所有标签
  const colLabels = extractDimensionLabels(colDimension, aggregated_themes, aggregated_insights, reviews);
  
  if (rowLabels.length === 0 || colLabels.length === 0) {
    return null;
  }
  
  // 初始化矩阵
  const data: number[][] = rowLabels.map(() => colLabels.map(() => 0));
  const reviewIds: string[][][] = rowLabels.map(() => colLabels.map(() => []));
  
  // 遍历每条评论，提取其在两个维度下的标签，并填充矩阵
  reviews.forEach(review => {
    const rowTags = extractReviewTags(review, rowDimension);
    const colTags = extractReviewTags(review, colDimension);
    
    // 为每个行列组合填充数据
    rowTags.forEach(rowTag => {
      colTags.forEach(colTag => {
        const rowIndex = rowLabels.indexOf(rowTag);
        const colIndex = colLabels.indexOf(colTag);
        
        if (rowIndex >= 0 && colIndex >= 0) {
          data[rowIndex][colIndex]++;
          if (!reviewIds[rowIndex][colIndex].includes(review.id)) {
            reviewIds[rowIndex][colIndex].push(review.id);
          }
        }
      });
    });
  });
  
  return buildMatrix(rowLabels, colLabels, data, reviewIds);
}

/**
 * 从数据源中提取某个维度的所有标签
 */
function extractDimensionLabels(
  dimension: PivotDimensionType,
  aggregated_themes: Record<string, any[]>,
  aggregated_insights: any,
  reviews: any[]
): string[] {
  // 5W维度：从 aggregated_themes 获取
  if (['buyer', 'user', 'what', 'why', 'when', 'where'].includes(dimension)) {
    const themes = aggregated_themes[dimension] || [];
    return themes.map(t => t.label).filter(Boolean);
  }
  
  // 产品优势维度：从 aggregated_insights.strengths 中提取
  if (dimension === 'strength') {
    const items = aggregated_insights.strengths || [];
    const dimensionSet = new Set<string>();
    items.forEach((item: any) => {
      if (item.dimension && item.dimension !== '其他') {
        dimensionSet.add(item.dimension);
      }
    });
    return Array.from(dimensionSet);
  }
  
  // 产品劣势维度：从 aggregated_insights.weaknesses 中提取
  if (dimension === 'weakness') {
    const items = aggregated_insights.weaknesses || [];
    const dimensionSet = new Set<string>();
    items.forEach((item: any) => {
      if (item.dimension && item.dimension !== '其他') {
        dimensionSet.add(item.dimension);
      }
    });
    return Array.from(dimensionSet);
  }
  
  // 产品建议维度：从 aggregated_insights.suggestions 中提取
  if (dimension === 'suggestion') {
    const items = aggregated_insights.suggestions || [];
    const dimensionSet = new Set<string>();
    items.forEach((item: any) => {
      if (item.dimension && item.dimension !== '其他') {
        dimensionSet.add(item.dimension);
      }
    });
    return Array.from(dimensionSet);
  }
  
  // 情感倾向：固定为 正面、中性、负面
  if (dimension === 'sentiment') {
    return ['正面', '中性', '负面'];
  }
  
  // 用户情感标签：从 aggregated_insights.emotions 中提取
  if (dimension === 'emotion') {
    const emotions = aggregated_insights.emotions || [];
    const dimensionSet = new Set<string>();
    emotions.forEach((e: any) => {
      if (e.dimension && e.dimension !== '其他') {
        dimensionSet.add(e.dimension);
      }
    });
    return Array.from(dimensionSet);
  }
  
  // 场景维度：从 aggregated_insights.scenarios 获取所有唯一的 dimension
  if (dimension === 'scenario') {
    const scenarios = aggregated_insights.scenarios || [];
    const dimensionSet = new Set<string>();
    scenarios.forEach((s: any) => {
      if (s.dimension && s.dimension !== '其他') {
        dimensionSet.add(s.dimension);
      }
    });
    return Array.from(dimensionSet);
  }
  
  return [];
}

/**
 * 从单条评论中提取其在某个维度下的所有标签
 */
function extractReviewTags(review: any, dimension: PivotDimensionType): string[] {
  // 5W维度：从 theme_highlights 获取
  if (['buyer', 'user', 'what', 'why', 'when', 'where'].includes(dimension)) {
    const themes = review.theme_highlights || [];
    return themes
      .filter((t: any) => t.theme_type === dimension)
      .map((t: any) => t.label_name)
      .filter(Boolean);
  }
  
  // 产品优势维度：从 insights 获取 type='strength' 的 dimension
  if (dimension === 'strength') {
    const insights = review.insights || [];
    const dimensions = insights
      .filter((i: any) => i.type === 'strength')
      .map((i: any) => i.dimension)
      .filter((d: string) => d && d !== '其他');
    return [...new Set(dimensions)];
  }
  
  // 产品劣势维度：从 insights 获取 type='weakness' 的 dimension
  if (dimension === 'weakness') {
    const insights = review.insights || [];
    const dimensions = insights
      .filter((i: any) => i.type === 'weakness')
      .map((i: any) => i.dimension)
      .filter((d: string) => d && d !== '其他');
    return [...new Set(dimensions)];
  }
  
  // 产品建议维度：从 insights 获取 type='suggestion' 的 dimension
  if (dimension === 'suggestion') {
    const insights = review.insights || [];
    const dimensions = insights
      .filter((i: any) => i.type === 'suggestion')
      .map((i: any) => i.dimension)
      .filter((d: string) => d && d !== '其他');
    return [...new Set(dimensions)];
  }
  
  // 情感倾向：从 sentiment 获取
  if (dimension === 'sentiment') {
    const sentiment = review.sentiment || 'neutral';
    if (sentiment === 'positive') return ['正面'];
    if (sentiment === 'neutral') return ['中性'];
    if (sentiment === 'negative') return ['负面'];
    return [];
  }
  
  // 用户情感标签：从 insights 获取 type='emotion' 的 dimension
  if (dimension === 'emotion') {
    const insights = review.insights || [];
    const dimensions = insights
      .filter((i: any) => i.type === 'emotion')
      .map((i: any) => i.dimension)
      .filter((d: string) => d && d !== '其他');
    return [...new Set(dimensions)];
  }
  
  // 场景维度：从 insights 获取 type='scenario' 的 dimension
  if (dimension === 'scenario') {
    const insights = review.insights || [];
    const dimensions = insights
      .filter((i: any) => i.type === 'scenario')
      .map((i: any) => i.dimension)
      .filter((d: string) => d && d !== '其他');
    return [...new Set(dimensions)];
  }
  
  return [];
}

/**
 * 构建完整的透视矩阵（包括百分比和元数据）
 */
function buildMatrix(
  rows: string[],
  columns: string[],
  data: number[][],
  reviewIds: string[][][]
): PivotMatrix {
  // 计算行合计和列合计
  const rowTotals = data.map(row => row.reduce((sum, val) => sum + val, 0));
  const columnTotals = columns.map((_, colIndex) =>
    data.reduce((sum, row) => sum + row[colIndex], 0)
  );
  const grandTotal = rowTotals.reduce((sum, val) => sum + val, 0);
  
  // 计算百分比矩阵（基于行合计）
  const percentages: number[][] = data.map((row, rowIndex) =>
    row.map((val) => {
      const rowTotal = rowTotals[rowIndex];
      return rowTotal > 0 ? (val / rowTotal) * 100 : 0;
    })
  );
  
  return {
    rows,
    columns,
    data,
    percentages,
    reviewIds,
    metadata: {
      rowTotals,
      columnTotals,
      grandTotal,
    },
  };
}

/**
 * 计算三个维度之间的交叉矩阵（三维透视）
 */
export function calculate3DCrossMatrix(
  rowDimension: PivotDimensionType,
  colDimension: PivotDimensionType,
  layerDimension: PivotDimensionType,
  input: PivotCalculatorInput
): Pivot3DMatrix | null {
  const { reviews, aggregated_themes = {}, aggregated_insights = {} } = input;
  
  // 获取三个维度的所有标签
  const rowLabels = extractDimensionLabels(rowDimension, aggregated_themes, aggregated_insights, reviews);
  const colLabels = extractDimensionLabels(colDimension, aggregated_themes, aggregated_insights, reviews);
  const layerLabels = extractDimensionLabels(layerDimension, aggregated_themes, aggregated_insights, reviews);
  
  if (rowLabels.length === 0 || colLabels.length === 0 || layerLabels.length === 0) {
    return null;
  }
  
  // 初始化三维矩阵 [layer][row][col]
  const data: number[][][] = layerLabels.map(() => 
    rowLabels.map(() => colLabels.map(() => 0))
  );
  const reviewIds: string[][][][] = layerLabels.map(() => 
    rowLabels.map(() => colLabels.map(() => []))
  );
  
  // 遍历每条评论，提取其在三个维度下的标签，并填充矩阵
  reviews.forEach(review => {
    const rowTags = extractReviewTags(review, rowDimension);
    const colTags = extractReviewTags(review, colDimension);
    const layerTags = extractReviewTags(review, layerDimension);
    
    // 为每个三维组合填充数据
    layerTags.forEach(layerTag => {
      rowTags.forEach(rowTag => {
        colTags.forEach(colTag => {
          const layerIndex = layerLabels.indexOf(layerTag);
          const rowIndex = rowLabels.indexOf(rowTag);
          const colIndex = colLabels.indexOf(colTag);
          
          if (layerIndex >= 0 && rowIndex >= 0 && colIndex >= 0) {
            data[layerIndex][rowIndex][colIndex]++;
            if (!reviewIds[layerIndex][rowIndex][colIndex].includes(review.id)) {
              reviewIds[layerIndex][rowIndex][colIndex].push(review.id);
            }
          }
        });
      });
    });
  });
  
  // 计算每层合计
  const layerTotals = data.map(layer =>
    layer.reduce((sum, row) => 
      sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
    )
  );
  const grandTotal = layerTotals.reduce((sum, val) => sum + val, 0);
  
  return {
    rows: rowLabels,
    columns: colLabels,
    layers: layerLabels,
    data,
    reviewIds,
    metadata: {
      layerTotals,
      grandTotal,
    },
  };
}
