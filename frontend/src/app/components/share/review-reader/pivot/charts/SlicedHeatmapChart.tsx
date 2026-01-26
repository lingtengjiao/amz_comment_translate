/**
 * SlicedHeatmapChart - 分层热力图组件
 * 用于展示3D数据：通过Tab切换第3维度，每个Tab显示一个2D热力图
 */
import { useState } from 'react';
import { HeatmapChart } from './HeatmapChart';

export interface HeatmapSlice {
  label: string;          // Tab标签（第3维的某个值）
  rows: string[];         // 热力图行标签
  columns: string[];      // 热力图列标签
  data: number[][];       // 热力图数据（2D矩阵）
  count?: number;         // 该切片的总数据点（可选，用于排序）
}

interface SlicedHeatmapChartProps {
  slices: HeatmapSlice[];
  colorScheme?: 'sentiment' | 'frequency';
  defaultSliceIndex?: number;
  onCellClick?: (sliceIndex: number, row: number, col: number) => void;
}

export function SlicedHeatmapChart({
  slices,
  colorScheme = 'frequency',
  defaultSliceIndex = 0,
  onCellClick,
}: SlicedHeatmapChartProps) {
  const [activeSliceIndex, setActiveSliceIndex] = useState(defaultSliceIndex);

  if (!slices || slices.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-600">暂无数据</p>
      </div>
    );
  }

  const activeSlice = slices[activeSliceIndex] || slices[0];

  const handleCellClick = (row: number, col: number) => {
    if (onCellClick) {
      onCellClick(activeSliceIndex, row, col);
    }
  };

  return (
    <div className="w-full">
      {/* Tab切换 */}
      {slices.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {slices.map((slice, index) => (
            <button
              key={index}
              onClick={() => setActiveSliceIndex(index)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSliceIndex === index
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {slice.label}
              {slice.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-75">
                  ({slice.count})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 热力图 */}
      <div className="bg-white rounded-lg p-2">
        <HeatmapChart
          rows={activeSlice.rows}
          columns={activeSlice.columns}
          data={activeSlice.data}
          colorScheme={colorScheme}
          onCellClick={handleCellClick}
        />
      </div>

      {/* 切片信息 */}
      {slices.length > 1 && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          正在查看：<span className="font-semibold">{activeSlice.label}</span>
          {activeSlice.count !== undefined && (
            <span className="ml-1">（{activeSlice.count} 条数据）</span>
          )}
          <span className="mx-2">·</span>
          共 {slices.length} 个{colorScheme === 'sentiment' ? '场景' : '维度'}
        </div>
      )}
    </div>
  );
}
