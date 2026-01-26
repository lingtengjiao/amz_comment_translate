/**
 * 交互式透视表格组件
 * 清晰展示交叉矩阵，支持点击下钻
 */
import { useState, useMemo } from 'react';
import { PivotMatrix } from './types';
import { ArrowDown, Filter } from 'lucide-react';

interface PivotTableProps {
  matrix: PivotMatrix;
  onCellClick: (row: number, col: number) => void;
  minFrequency?: number;
  onMinFrequencyChange?: (value: number) => void;
}

type SortMode = 'row-total' | 'col-index';
type DisplayMode = 'count' | 'percent' | 'both';

export function PivotTable({
  matrix,
  onCellClick,
  minFrequency = 0,
  onMinFrequencyChange,
}: PivotTableProps) {
  const [sortMode, setSortMode] = useState<SortMode>('row-total');
  const [sortColIndex, setSortColIndex] = useState<number>(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  
  // 过滤和排序后的矩阵索引
  const processedMatrix = useMemo(() => {
    // 过滤行：只保留总评论数 >= minFrequency 的行
    let filteredRows = matrix.rows
      .map((_, i) => i)
      .filter(i => matrix.metadata.rowTotals[i] >= minFrequency);
    
    // 过滤列：只保留总评论数 >= minFrequency 的列
    const filteredCols = matrix.columns
      .map((_, i) => i)
      .filter(i => matrix.metadata.columnTotals[i] >= minFrequency);
    
    // 排序
    if (sortMode === 'row-total') {
      filteredRows.sort((a, b) => 
        matrix.metadata.rowTotals[b] - matrix.metadata.rowTotals[a]
      );
    } else if (sortMode === 'col-index' && sortColIndex >= 0) {
      filteredRows.sort((a, b) => 
        matrix.data[b][sortColIndex] - matrix.data[a][sortColIndex]
      );
    }
    
    return {
      rowIndices: filteredRows,
      colIndices: filteredCols,
    };
  }, [matrix, minFrequency, sortMode, sortColIndex]);
  
  // 热力图着色
  const getCellColor = (value: number, percent: number, rowTotal: number) => {
    if (value === 0) return 'bg-gray-50 text-gray-400';
    
    // 基于百分比的热力图
    if (percent >= 40) {
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    } else if (percent >= 20) {
      return 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100';
    } else if (percent >= 10) {
      return 'bg-blue-50 text-blue-800 hover:bg-blue-100';
    } else {
      return 'bg-gray-50 text-gray-600 hover:bg-gray-100';
    }
  };
  
  const formatCellValue = (value: number, percent: number) => {
    if (value === 0) return '-';
    
    switch (displayMode) {
      case 'count':
        return value.toString();
      case 'percent':
        return `${percent.toFixed(1)}%`;
      case 'both':
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{value}</span>
            <span className="text-[10px] opacity-70 hidden sm:inline">{percent.toFixed(1)}%</span>
          </div>
        );
    }
  };
  
  return (
    <div className="w-full">
      {/* 控制栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">最小评论数:</span>
          <input
            type="number"
            min="0"
            value={minFrequency}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 0;
              if (onMinFrequencyChange) {
                onMinFrequencyChange(value);
              }
            }}
            className="w-16 px-2 py-1 text-xs border rounded"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">显示:</span>
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="count">数值</option>
            <option value="percent">百分比</option>
            <option value="both">双显示</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">排序:</span>
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as SortMode);
            }}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="row-total">按行合计</option>
            <option value="col-index">按列排序</option>
          </select>
        </div>
      </div>
      
      {/* 表格 */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700 min-w-[120px]">
                <div className="flex items-center gap-1">
                  <span>↓ 行 \ 列 →</span>
                  {sortMode === 'row-total' && <ArrowDown className="h-3 w-3" />}
                </div>
              </th>
              {processedMatrix.colIndices.map(colIndex => (
                <th
                  key={colIndex}
                  className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs font-semibold text-gray-700 bg-gray-50 cursor-pointer hover:bg-gray-100 min-w-[80px] sm:min-w-[100px]"
                  onClick={() => {
                    setSortMode('col-index');
                    setSortColIndex(colIndex);
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-bold">{matrix.columns[colIndex]}</span>
                    <span className="text-[10px] text-gray-500">
                      (n={matrix.metadata.columnTotals[colIndex]})
                    </span>
                    {sortMode === 'col-index' && sortColIndex === colIndex && (
                      <ArrowDown className="h-3 w-3 text-indigo-600" />
                    )}
                  </div>
                </th>
              ))}
              <th className="border border-gray-300 px-3 py-2 text-center text-xs font-bold text-gray-700 bg-gray-100 min-w-[80px]">
                合计
              </th>
            </tr>
          </thead>
          <tbody>
            {processedMatrix.rowIndices.map(rowIndex => {
              const row = matrix.rows[rowIndex];
              const rowTotal = matrix.metadata.rowTotals[rowIndex];
              
              return (
                <tr key={rowIndex} className="hover:bg-blue-50/50">
                  <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-900">
                    <div className="flex flex-col">
                      <span>{row}</span>
                      <span className="text-[10px] text-gray-500 font-normal">(n={rowTotal})</span>
                    </div>
                  </td>
                  {processedMatrix.colIndices.map(colIndex => {
                    const value = matrix.data[rowIndex][colIndex];
                    const percent = matrix.percentages[rowIndex][colIndex];
                    
                    return (
                      <td
                        key={colIndex}
                        className={`border border-gray-200 px-2 py-2 text-center text-xs cursor-pointer transition-all ${getCellColor(value, percent, rowTotal)} ${value > 0 ? 'font-medium' : ''}`}
                        onClick={() => value > 0 && onCellClick(rowIndex, colIndex)}
                        title={value > 0 ? `${row} × ${matrix.columns[colIndex]}: ${value} 条评论 (${percent.toFixed(1)}%)` : '无数据'}
                      >
                        {formatCellValue(value, percent)}
                      </td>
                    );
                  })}
                  <td className="border border-gray-300 px-3 py-2 text-center text-xs font-bold text-gray-700 bg-gray-50">
                    {rowTotal}
                  </td>
                </tr>
              );
            })}
            
            {/* 合计行 */}
            <tr className="bg-gray-100 font-bold">
              <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-3 py-2 text-xs text-gray-700">
                合计
              </td>
              {processedMatrix.colIndices.map(colIndex => (
                <td
                  key={colIndex}
                  className="border border-gray-300 px-2 py-2 text-center text-xs text-gray-700"
                >
                  {matrix.metadata.columnTotals[colIndex]}
                </td>
              ))}
              <td className="border border-gray-300 px-3 py-2 text-center text-xs text-gray-700">
                {matrix.metadata.grandTotal}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* 图例说明 */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs font-semibold text-gray-700 mb-2">颜色说明：</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-gray-300 rounded"></div>
            <span>高频 (≥40%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-50 border border-gray-300 rounded"></div>
            <span>中频 (20-40%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-50 border border-gray-300 rounded"></div>
            <span>低频 (10-20%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
            <span>极低 (&lt;10%)</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          * 百分比基于行合计计算 · 点击有数据的单元格查看具体评论
        </p>
      </div>
    </div>
  );
}
