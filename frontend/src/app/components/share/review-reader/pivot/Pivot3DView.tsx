/**
 * 三维透视视图组件
 * 展示三个维度的交叉分析（分层展示）
 */
import { useMemo, useState } from 'react';
import { Pivot3DMatrix, PivotDimensionType, DIMENSION_CONFIG } from './types';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface Pivot3DViewProps {
  matrix: Pivot3DMatrix;
  rowDimension: PivotDimensionType;
  colDimension: PivotDimensionType;
  layerDimension: PivotDimensionType;
  onCellClick: (layer: number, row: number, col: number) => void;
}

export function Pivot3DView({ 
  matrix, 
  rowDimension, 
  colDimension, 
  layerDimension,
  onCellClick 
}: Pivot3DViewProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));
  const [minFrequency, setMinFrequency] = useState(0);
  
  // 切换层展开状态
  const toggleLayer = (layerIndex: number) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(layerIndex)) {
      newExpanded.delete(layerIndex);
    } else {
      newExpanded.add(layerIndex);
    }
    setExpandedLayers(newExpanded);
  };
  
  // 热力图着色
  const getCellColor = (value: number, layerMax: number) => {
    if (value === 0) return 'bg-gray-50 text-gray-400';
    
    const percent = layerMax > 0 ? (value / layerMax) * 100 : 0;
    if (percent >= 50) {
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    } else if (percent >= 25) {
      return 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100';
    } else if (percent >= 10) {
      return 'bg-blue-50 text-blue-800 hover:bg-blue-100';
    } else {
      return 'bg-gray-50 text-gray-600 hover:bg-gray-100';
    }
  };
  
  // 计算每层的最大值（用于热力图）
  const layerMaxValues = useMemo(() => {
    return matrix.data.map(layer => 
      Math.max(...layer.flat())
    );
  }, [matrix]);
  
  // 过滤小于最小频次的层
  const visibleLayers = useMemo(() => {
    return matrix.layers
      .map((_, idx) => idx)
      .filter(idx => matrix.metadata.layerTotals[idx] >= minFrequency);
  }, [matrix, minFrequency]);
  
  return (
    <div className="space-y-4">
      {/* 控制栏 */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-semibold text-gray-700">
            三维透视：{matrix.layers.length} 个层次
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">最小评论数:</span>
          <input
            type="number"
            min="0"
            value={minFrequency}
            onChange={(e) => setMinFrequency(parseInt(e.target.value) || 0)}
            className="w-16 px-2 py-1 text-xs border rounded"
          />
        </div>
        
        <button
          onClick={() => setExpandedLayers(new Set(visibleLayers))}
          className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
        >
          展开全部
        </button>
        
        <button
          onClick={() => setExpandedLayers(new Set())}
          className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          收起全部
        </button>
      </div>
      
      {/* 维度说明 */}
      <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="font-semibold text-indigo-700">层维度（第3维）：</span>
            <span className="ml-1 text-gray-700">{DIMENSION_CONFIG[layerDimension].label}</span>
          </div>
          <div>
            <span className="font-semibold text-purple-700">行维度（第1维）：</span>
            <span className="ml-1 text-gray-700">{DIMENSION_CONFIG[rowDimension].label}</span>
          </div>
          <div>
            <span className="font-semibold text-pink-700">列维度（第2维）：</span>
            <span className="ml-1 text-gray-700">{DIMENSION_CONFIG[colDimension].label}</span>
          </div>
        </div>
      </div>
      
      {/* 分层展示 */}
      <div className="space-y-3">
        {visibleLayers.map(layerIndex => {
          const layer = matrix.layers[layerIndex];
          const layerData = matrix.data[layerIndex];
          const layerTotal = matrix.metadata.layerTotals[layerIndex];
          const layerMax = layerMaxValues[layerIndex];
          const isExpanded = expandedLayers.has(layerIndex);
          
          return (
            <div key={layerIndex} className="border-2 border-indigo-200 rounded-lg overflow-hidden">
              {/* 层标题 */}
              <button
                onClick={() => toggleLayer(layerIndex)}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    {layerIndex + 1}
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-bold text-gray-900">{layer}</h4>
                    <p className="text-xs text-gray-600">
                      {layerTotal} 个数据点 · 占比 {((layerTotal / matrix.metadata.grandTotal) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-indigo-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-indigo-600" />
                  )}
                </div>
              </button>
              
              {/* 层内容（表格） */}
              {isExpanded && (
                <div className="p-4 bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 py-2 text-left font-bold text-gray-700 min-w-[100px]">
                            {DIMENSION_CONFIG[rowDimension].label}
                          </th>
                          {matrix.columns.map((col, colIndex) => (
                            <th
                              key={colIndex}
                              className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700 bg-gray-50 min-w-[80px]"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-blue-50/30">
                            <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 py-2 font-semibold text-gray-900">
                              {row}
                            </td>
                            {matrix.columns.map((_, colIndex) => {
                              const value = layerData[rowIndex][colIndex];
                              const percent = layerTotal > 0 ? (value / layerTotal) * 100 : 0;
                              
                              return (
                                <td
                                  key={colIndex}
                                  className={`border border-gray-200 px-2 py-2 text-center cursor-pointer transition-all ${getCellColor(value, layerMax)}`}
                                  onClick={() => value > 0 && onCellClick(layerIndex, rowIndex, colIndex)}
                                  title={value > 0 ? `${layer} × ${row} × ${matrix.columns[colIndex]}: ${value} 条评论 (${percent.toFixed(1)}%)` : '无数据'}
                                >
                                  {value > 0 ? (
                                    <div className="flex flex-col">
                                      <span className="font-semibold">{value}</span>
                                      <span className="text-[10px] opacity-70">{percent.toFixed(1)}%</span>
                                    </div>
                                  ) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {visibleLayers.length === 0 && (
        <div className="p-6 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            没有符合条件的数据层，请降低最小评论数阈值
          </p>
        </div>
      )}
    </div>
  );
}
