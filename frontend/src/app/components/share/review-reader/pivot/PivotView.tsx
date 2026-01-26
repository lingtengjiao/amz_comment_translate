/**
 * 数据透视主视图组件
 * 用户选择两个或三个维度进行交叉分析
 */
import { useState, useMemo } from 'react';
import { PivotDimensionType, DIMENSION_CONFIG, DrillDownData } from './types';
import { calculateCrossMatrix, calculate3DCrossMatrix } from './PivotCalculator';
import { PivotTable } from './PivotTable';
import { Pivot3DView } from './Pivot3DView';
import { DrillDownModal } from './DrillDownModal';
import { BarChart3, Layers, Grid3x3 } from 'lucide-react';

interface PivotViewProps {
  data: {
    reviews?: Array<any>;
    aggregated_themes?: Record<string, any[]>;
    aggregated_insights?: any;
  };
}

const DIMENSION_OPTIONS: PivotDimensionType[] = [
  'buyer',
  'user',
  'what',
  'why',
  'when',
  'where',
  'strength',
  'weakness',
  'suggestion',
  'sentiment',
  'emotion',
  'scenario',
];

export function PivotView({ data }: PivotViewProps) {
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [rowDimension, setRowDimension] = useState<PivotDimensionType>('strength');
  const [colDimension, setColDimension] = useState<PivotDimensionType>('user');
  const [layerDimension, setLayerDimension] = useState<PivotDimensionType>('why');
  const [minFrequency, setMinFrequency] = useState(0);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  
  // 计算二维交叉矩阵
  const pivotMatrix = useMemo(() => {
    if (mode !== '2d') return null;
    if (rowDimension === colDimension) return null;
    
    return calculateCrossMatrix(rowDimension, colDimension, {
      reviews: data.reviews || [],
      aggregated_themes: data.aggregated_themes || {},
      aggregated_insights: data.aggregated_insights || {},
    });
  }, [mode, rowDimension, colDimension, data]);
  
  // 计算三维交叉矩阵
  const pivot3DMatrix = useMemo(() => {
    if (mode !== '3d') return null;
    
    const dimensions = [rowDimension, colDimension, layerDimension];
    const uniqueDimensions = new Set(dimensions);
    if (uniqueDimensions.size !== 3) return null; // 三个维度必须不同
    
    return calculate3DCrossMatrix(rowDimension, colDimension, layerDimension, {
      reviews: data.reviews || [],
      aggregated_themes: data.aggregated_themes || {},
      aggregated_insights: data.aggregated_insights || {},
    });
  }, [mode, rowDimension, colDimension, layerDimension, data]);
  
  // 处理二维单元格点击
  const handleCellClick = (row: number, col: number) => {
    if (!pivotMatrix) return;
    
    const reviewIds = pivotMatrix.reviewIds[row]?.[col] || [];
    const rowLabel = pivotMatrix.rows[row];
    const colLabel = pivotMatrix.columns[col];
    const count = pivotMatrix.data[row][col];
    
    if (count > 0) {
      setDrillDownData({
        rowLabel,
        colLabel,
        reviewIds,
        count,
      });
    }
  };
  
  // 处理三维单元格点击
  const handle3DCellClick = (layer: number, row: number, col: number) => {
    if (!pivot3DMatrix) return;
    
    const reviewIds = pivot3DMatrix.reviewIds[layer]?.[row]?.[col] || [];
    const layerLabel = pivot3DMatrix.layers[layer];
    const rowLabel = pivot3DMatrix.rows[row];
    const colLabel = pivot3DMatrix.columns[col];
    const count = pivot3DMatrix.data[layer][row][col];
    
    if (count > 0) {
      setDrillDownData({
        rowLabel: `${layerLabel} × ${rowLabel}`,
        colLabel,
        reviewIds,
        count,
      });
    }
  };
  
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 标题和模式切换 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {mode === '2d' ? (
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
          ) : (
            <Layers className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
          )}
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              数据透视分析 {mode === '3d' && <span className="text-purple-600">(三维)</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mode === '2d' ? '选择两个维度进行交叉分析' : '选择三个维度进行深层洞察分析'}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setMode('2d')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              mode === '2d'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Grid3x3 className="h-4 w-4" />
            二维透视
          </button>
          <button
            onClick={() => setMode('3d')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              mode === '3d'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            三维透视
          </button>
        </div>
      </div>
      
      {/* 维度选择器 */}
      <div className={`bg-gradient-to-r ${mode === '2d' ? 'from-indigo-50 to-purple-50 border-indigo-200' : 'from-purple-50 to-pink-50 border-purple-200'} border rounded-xl p-4`}>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          {/* 行维度选择 */}
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              {mode === '2d' ? '行维度' : '第1维（行）'}
            </label>
            <select
              value={rowDimension}
              onChange={(e) => setRowDimension(e.target.value as PivotDimensionType)}
              className="w-full text-sm border-2 border-indigo-300 rounded-lg px-3 py-2.5 bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              {DIMENSION_OPTIONS.map(dim => (
                <option 
                  key={dim} 
                  value={dim} 
                  disabled={dim === colDimension || (mode === '3d' && dim === layerDimension)}
                >
                  {DIMENSION_CONFIG[dim].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {DIMENSION_CONFIG[rowDimension].description}
            </p>
          </div>
          
          {/* 交叉符号 */}
          <div className="flex items-center justify-center lg:mt-6">
            <div className={`w-8 h-8 ${mode === '2d' ? 'bg-indigo-600' : 'bg-purple-600'} rounded-full flex items-center justify-center`}>
              <span className="text-white font-bold text-lg">×</span>
            </div>
          </div>
          
          {/* 列维度选择 */}
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              {mode === '2d' ? '列维度' : '第2维（列）'}
            </label>
            <select
              value={colDimension}
              onChange={(e) => setColDimension(e.target.value as PivotDimensionType)}
              className="w-full text-sm border-2 border-purple-300 rounded-lg px-3 py-2.5 bg-white hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            >
              {DIMENSION_OPTIONS.map(dim => (
                <option 
                  key={dim} 
                  value={dim} 
                  disabled={dim === rowDimension || (mode === '3d' && dim === layerDimension)}
                >
                  {DIMENSION_CONFIG[dim].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {DIMENSION_CONFIG[colDimension].description}
            </p>
          </div>
          
          {/* 第三维度选择（仅3D模式） */}
          {mode === '3d' && (
            <>
              <div className="flex items-center justify-center lg:mt-6">
                <div className="w-8 h-8 bg-pink-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">×</span>
                </div>
              </div>
              
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  第3维（层）
                </label>
                <select
                  value={layerDimension}
                  onChange={(e) => setLayerDimension(e.target.value as PivotDimensionType)}
                  className="w-full text-sm border-2 border-pink-300 rounded-lg px-3 py-2.5 bg-white hover:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500 font-medium"
                >
                  {DIMENSION_OPTIONS.map(dim => (
                    <option key={dim} value={dim} disabled={dim === rowDimension || dim === colDimension}>
                      {DIMENSION_CONFIG[dim].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {DIMENSION_CONFIG[layerDimension].description}
                </p>
              </div>
            </>
          )}
        </div>
        
        {/* 快捷组合推荐 */}
        <div className="mt-4 pt-4 border-t border-indigo-200">
          <p className="text-xs text-gray-600 mb-2">常用组合：</p>
          <div className="flex flex-wrap gap-2">
            {mode === '2d' ? [
              { row: 'user' as PivotDimensionType, col: 'why' as PivotDimensionType, label: '使用者×动机' },
              { row: 'strength' as PivotDimensionType, col: 'user' as PivotDimensionType, label: '产品优势×使用者' },
              { row: 'weakness' as PivotDimensionType, col: 'scenario' as PivotDimensionType, label: '产品劣势×场景' },
              { row: 'user' as PivotDimensionType, col: 'emotion' as PivotDimensionType, label: '使用者×情感标签' },
              { row: 'what' as PivotDimensionType, col: 'sentiment' as PivotDimensionType, label: '用途×情感倾向' },
              { row: 'suggestion' as PivotDimensionType, col: 'why' as PivotDimensionType, label: '改进建议×动机' },
            ].map((combo, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setRowDimension(combo.row);
                  setColDimension(combo.col);
                }}
                className="text-xs px-3 py-1.5 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
              >
                {combo.label}
              </button>
            )) : [
              { row: 'buyer' as PivotDimensionType, col: 'user' as PivotDimensionType, layer: 'why' as PivotDimensionType, label: '购买者×使用者×动机' },
              { row: 'where' as PivotDimensionType, col: 'when' as PivotDimensionType, layer: 'scenario' as PivotDimensionType, label: '地点×时机×场景' },
              { row: 'strength' as PivotDimensionType, col: 'scenario' as PivotDimensionType, layer: 'emotion' as PivotDimensionType, label: '优势×场景×情感' },
              { row: 'why' as PivotDimensionType, col: 'weakness' as PivotDimensionType, layer: 'suggestion' as PivotDimensionType, label: '动机×劣势×建议' },
              { row: 'sentiment' as PivotDimensionType, col: 'strength' as PivotDimensionType, layer: 'where' as PivotDimensionType, label: '情感×维度×地点' },
            ].map((combo, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setRowDimension(combo.row);
                  setColDimension(combo.col);
                  setLayerDimension(combo.layer);
                }}
                className="text-xs px-3 py-1.5 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 hover:border-purple-400 transition-colors"
              >
                {combo.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* 交叉矩阵展示 */}
      {mode === '2d' ? (
        pivotMatrix ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                {DIMENSION_CONFIG[rowDimension].label} × {DIMENSION_CONFIG[colDimension].label}
              </h3>
              <p className="text-xs text-gray-500">
                共 {pivotMatrix.metadata.grandTotal} 个交叉数据点 · 点击单元格查看具体评论
              </p>
            </div>
            
            <PivotTable
              matrix={pivotMatrix}
              onCellClick={handleCellClick}
              minFrequency={minFrequency}
              onMinFrequencyChange={setMinFrequency}
            />
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-sm text-yellow-800">
              {rowDimension === colDimension 
                ? '请选择两个不同的维度进行交叉分析'
                : '暂无数据，请检查数据源'}
            </p>
          </div>
        )
      ) : (
        pivot3DMatrix ? (
          <div className="bg-white rounded-xl border border-purple-200 p-4 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                {DIMENSION_CONFIG[layerDimension].label} × {DIMENSION_CONFIG[rowDimension].label} × {DIMENSION_CONFIG[colDimension].label}
              </h3>
              <p className="text-xs text-gray-500">
                共 {pivot3DMatrix.metadata.grandTotal} 个三维交叉数据点 · {pivot3DMatrix.layers.length} 个层次 · 点击单元格查看具体评论
              </p>
            </div>
            
            <Pivot3DView
              matrix={pivot3DMatrix}
              rowDimension={rowDimension}
              colDimension={colDimension}
              layerDimension={layerDimension}
              onCellClick={handle3DCellClick}
            />
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-sm text-yellow-800">
              {[rowDimension, colDimension, layerDimension].length !== new Set([rowDimension, colDimension, layerDimension]).size
                ? '请选择三个不同的维度进行交叉分析'
                : '暂无数据，请检查数据源'}
            </p>
          </div>
        )
      )}
      
      {/* 高价值透视组合推荐 */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">💡 精选高价值透视组合</h3>
        </div>
        <p className="text-xs sm:text-sm text-gray-600 mb-6">
          以下组合经过验证，特别适合发现产品机会点或优化营销策略
        </p>
        
        {/* 基础洞察组合 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-amber-700">📊 基础洞察组合</span>
            <span className="text-xs text-gray-500">（适合产品分析和细分市场发现）</span>
          </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            {
              row: 'buyer' as PivotDimensionType,
              col: 'user' as PivotDimensionType,
              title: '购买者 × 使用者',
              badge: '决策错位',
              meaning: '识别"决策与需求的错位"',
              focus: '谁付钱？谁在用？',
              insight: '如果两者不一致（家长买，孩子用），营销内容要分裂：解决购买者的焦虑，产品设计满足使用者的易用性。',
              color: 'blue',
            },
            {
              row: 'why' as PivotDimensionType,
              col: 'where' as PivotDimensionType,
              title: '动机 × 地点',
              badge: '刚需场景',
              meaning: '定位"刚需触发场景"',
              focus: '用户在特定环境下的特定需求',
              insight: '如在"卧室"动机多为"放松"，在"办公室"动机是"提神"，可针对不同地点推差异化功能。',
              color: 'green',
            },
            {
              row: 'when' as PivotDimensionType,
              col: 'scenario' as PivotDimensionType,
              title: '时机 × 使用场景',
              badge: '流量密码',
              meaning: '挖掘"高频与长尾流量"',
              focus: '产品是节日礼品还是日常工具？',
              insight: '如果"节日+送礼"占比最高，说明产品缺乏日常自购动力，需要强化日常使用价值。',
              color: 'purple',
            },
            {
              row: 'weakness' as PivotDimensionType,
              col: 'sentiment' as PivotDimensionType,
              title: '产品劣势 × 情感倾向',
              badge: '优先级',
              meaning: '区分"可忍受缺陷"与"致命差评"',
              focus: '哪些劣势直接导致负向情感？',
              insight: '对应中性情感的劣势是次要矛盾，导致强烈负向情感的是改进最优先级。',
              color: 'red',
            },
            {
              row: 'strength' as PivotDimensionType,
              col: 'emotion' as PivotDimensionType,
              title: '产品优势 × 用户情感标签',
              badge: '品牌溢价',
              meaning: '提炼"品牌溢价/核心竞争力"',
              focus: '哪个功能最能引起情绪共鸣？',
              insight: '这是编写 Listing 标题和 A+ 页面的灵魂，不要只写功能，要写触发正面情感的功能点。',
              color: 'indigo',
            },
            {
              row: 'why' as PivotDimensionType,
              col: 'suggestion' as PivotDimensionType,
              title: '动机 × 产品改进建议',
              badge: '用户分层',
              meaning: '发现"未被满足的原始需求"',
              focus: '不同动机的用户想让你改什么？',
              insight: '帮助做用户分层。如果走高端路线，只参考高质动机用户的改进建议。',
              color: 'pink',
            },
          ].map((combo, idx) => {
            const colorMap = {
              blue: 'border-blue-300 bg-blue-50/50 hover:bg-blue-50',
              green: 'border-green-300 bg-green-50/50 hover:bg-green-50',
              purple: 'border-purple-300 bg-purple-50/50 hover:bg-purple-50',
              red: 'border-red-300 bg-red-50/50 hover:bg-red-50',
              indigo: 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50',
              pink: 'border-pink-300 bg-pink-50/50 hover:bg-pink-50',
            };
            
            const badgeColorMap = {
              blue: 'bg-blue-500 text-white',
              green: 'bg-green-500 text-white',
              purple: 'bg-purple-500 text-white',
              red: 'bg-red-500 text-white',
              indigo: 'bg-indigo-500 text-white',
              pink: 'bg-pink-500 text-white',
            };
            
            return (
              <div
                key={idx}
                onClick={() => {
                  setRowDimension(combo.row);
                  setColDimension(combo.col);
                  // 滚动到表格位置
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`border-2 ${colorMap[combo.color]} rounded-lg p-4 cursor-pointer transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-gray-900">{combo.title}</h4>
                  <span className={`text-[10px] px-2 py-0.5 ${badgeColorMap[combo.color]} rounded-full font-semibold shrink-0`}>
                    {combo.badge}
                  </span>
                </div>
                
                <div className="space-y-2 text-xs text-gray-700">
                  <div>
                    <span className="font-semibold text-gray-900">核心意义：</span>
                    <span className="ml-1">{combo.meaning}</span>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-gray-900">分析重点：</span>
                    <span className="ml-1">{combo.focus}</span>
                  </div>
                  
                  <div className="pt-1 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">💡 洞察：</span>
                    <p className="ml-1 mt-1 text-[11px] leading-relaxed">{combo.insight}</p>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-[10px] text-gray-500">点击卡片即可切换到此组合 ↑</span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
        
        {/* 进阶策略组合 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-orange-700">🚀 进阶策略组合</span>
            <span className="text-xs text-gray-500">（直接导出产品开发优先级和营销话术）</span>
          </div>
          
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            {
              row: 'buyer' as PivotDimensionType,
              col: 'strength' as PivotDimensionType,
              title: '购买者 × 产品优势维度',
              badge: '转化钩子',
              meaning: '精准配置"转化钩子"',
              focus: '不同购买人群最看重哪个卖点？',
              insight: '如果"送礼者"最看重"包装设计"，"自用者"最看重"耐用性"，在亚马逊广告中，针对Gift关键词的素材应突出包装，针对自用关键词应突出参数。',
              output: '📤 产出：广告素材 / 标题话术',
              color: 'cyan',
            },
            {
              row: 'why' as PivotDimensionType,
              col: 'sentiment' as PivotDimensionType,
              title: '动机 × 情感倾向',
              badge: '期望落差',
              meaning: '识别"期望 vs 现实"的落差',
              focus: '带着特定目的买的人，最后是开心还是失望？',
              insight: '如果动机是"解决漏水痛点"，结果情感多为负向，说明核心功能不及格。如果动机是"随便试试"，结果极正面，说明有超预期惊喜点，是极佳的口碑营销素材。',
              output: '📤 产出：差评预警 / 卖点验证',
              color: 'teal',
            },
            {
              row: 'where' as PivotDimensionType,
              col: 'suggestion' as PivotDimensionType,
              title: '地点 × 产品改进建议',
              badge: '硬件升级',
              meaning: '进行"针对性硬件升级"',
              focus: '用户在不同物理环境下的槽点',
              insight: '户外场景改进建议多集中在"续航、防水、便携"，居家场景多集中在"静音、外观配色、收纳"。帮助你决定下一代产品是做"轻薄版"还是"静音版"。',
              output: '📤 产出：研发需求文档 (PRD)',
              color: 'emerald',
            },
            {
              row: 'emotion' as PivotDimensionType,
              col: 'scenario' as PivotDimensionType,
              title: '用户情感标签 × 使用场景',
              badge: '品牌定调',
              meaning: '构建"场景化"的品牌联想',
              focus: '哪个具体瞬间让用户产生"治愈"、"专业"或"超值"的感觉？',
              insight: '例如在"给孩子读睡前故事"这个场景下，用户的标签是"温馨/省力"。这就是你 A+ 页面最核心的视觉头图（Hero Image）应该拍摄的画面。',
              output: '📤 产出：品牌视觉指南 / 主图设计',
              color: 'lime',
            },
            {
              row: 'why' as PivotDimensionType,
              col: 'emotion' as PivotDimensionType,
              title: '动机 × 用户情感标签',
              badge: '心智匹配',
              meaning: '验证"营销心智"是否匹配',
              focus: '用户的初衷（Why）与他们最终留下的主观印象（Tags）是否一致？',
              insight: '如果你想打"专业"标签，但用户反馈全是"便宜/性价比"，说明品牌溢价没做起来。如果你想打"便捷"，用户反馈全是"设计好看"，说明核心卖点偏离了用户感知。',
              output: '📤 产出：品牌定位校准 / 营销话术调整',
              color: 'violet',
            },
            {
              row: 'suggestion' as PivotDimensionType,
              col: 'strength' as PivotDimensionType,
              title: '产品改进建议 × 优势维度',
              badge: '负向优化',
              meaning: '防止"负向优化"',
              focus: '用户建议改动的地方，是否会削弱你现有的优势？',
              insight: '很多用户要求增加功能，但可能导致产品变重、变贵。通过这个交叉评估：为了满足这些建议，我是否会丢掉最初吸引用户的那批核心优势？这是产品迭代的重要决策依据。',
              output: '📤 产出：产品迭代优先级 / 取舍决策',
              color: 'fuchsia',
            },
            {
              row: 'strength' as PivotDimensionType,
              col: 'weakness' as PivotDimensionType,
              title: '产品优势维度 × 产品劣势维度',
              badge: '差异化',
              meaning: '寻找"性价比平衡点"或"差异化空档"',
              focus: '内部博弈分析：优势和劣势的矛盾点',
              insight: '如果产品"性能极强（优势）"但"噪音极大（劣势）"，说明该类目存在平衡点缺口。如果你能开发出"性能中等但极致静音"的产品，就能切走这部分细分市场。',
              output: '📤 产出：差异化产品方向 / 市场空白点',
              color: 'rose',
            },
          ].map((combo, idx) => {
            const colorMap = {
              cyan: 'border-cyan-300 bg-cyan-50/50 hover:bg-cyan-50',
              teal: 'border-teal-300 bg-teal-50/50 hover:bg-teal-50',
              emerald: 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50',
              lime: 'border-lime-300 bg-lime-50/50 hover:bg-lime-50',
              violet: 'border-violet-300 bg-violet-50/50 hover:bg-violet-50',
              fuchsia: 'border-fuchsia-300 bg-fuchsia-50/50 hover:bg-fuchsia-50',
              rose: 'border-rose-300 bg-rose-50/50 hover:bg-rose-50',
            };
            
            const badgeColorMap = {
              cyan: 'bg-cyan-500 text-white',
              teal: 'bg-teal-500 text-white',
              emerald: 'bg-emerald-500 text-white',
              lime: 'bg-lime-600 text-white',
              violet: 'bg-violet-500 text-white',
              fuchsia: 'bg-fuchsia-500 text-white',
              rose: 'bg-rose-500 text-white',
            };
            
            return (
              <div
                key={idx}
                onClick={() => {
                  setRowDimension(combo.row);
                  setColDimension(combo.col);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`border-2 ${colorMap[combo.color]} rounded-lg p-4 cursor-pointer transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-gray-900">{combo.title}</h4>
                  <span className={`text-[10px] px-2 py-0.5 ${badgeColorMap[combo.color]} rounded-full font-semibold shrink-0`}>
                    {combo.badge}
                  </span>
                </div>
                
                <div className="space-y-2 text-xs text-gray-700">
                  <div>
                    <span className="font-semibold text-gray-900">核心意义：</span>
                    <span className="ml-1">{combo.meaning}</span>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-gray-900">分析重点：</span>
                    <span className="ml-1">{combo.focus}</span>
                  </div>
                  
                  <div className="pt-1 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">💡 洞察：</span>
                    <p className="ml-1 mt-1 text-[11px] leading-relaxed">{combo.insight}</p>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-200 bg-white/60 -mx-1 px-1 py-1.5 rounded">
                    <span className="text-[11px] font-semibold text-orange-700">{combo.output}</span>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-[10px] text-gray-500">点击卡片即可切换到此组合 ↑</span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
        
        {/* 三维深层洞察组合 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-purple-700">🎯 三维深层洞察组合</span>
            <span className="text-xs text-gray-500">（完整行为路径分析，发现深层需求规律）</span>
          </div>
          
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            {
              row: 'buyer' as PivotDimensionType,
              col: 'user' as PivotDimensionType,
              layer: 'why' as PivotDimensionType,
              title: '购买者 × 使用者 × 动机',
              badge: '决策链',
              meaning: '解析"决策逻辑链"',
              focus: '谁买？给谁？图什么？',
              insight: '如果是"妻子买给丈夫"为了"缓解腰痛"，文案应侧重"关爱、健康、有效性"。如果是"丈夫买给自己"为了"极客爱好"，文案应侧重"参数、性能、可玩性"。',
              output: '📤 产出：广告受众定位 / 视觉风格',
              color: 'violet',
            },
            {
              row: 'where' as PivotDimensionType,
              col: 'when' as PivotDimensionType,
              layer: 'scenario' as PivotDimensionType,
              title: '地点 × 时机 × 使用场景',
              badge: '真实瞬间',
              meaning: '还原"真实生活瞬间"',
              focus: '在哪？何时？具体干什么？',
              insight: '比如："卧室+深夜+哄睡"，直接决定产品硬件规格：光线必须柔和、声音必须静音、操作必须能盲操。',
              output: '📤 产出：产品定义 (Product Definition)',
              color: 'purple',
            },
            {
              row: 'strength' as PivotDimensionType,
              col: 'scenario' as PivotDimensionType,
              layer: 'emotion' as PivotDimensionType,
              title: '产品优势 × 使用场景 × 情感标签',
              badge: '记忆点',
              meaning: '提炼"品牌记忆点（Hook）"',
              focus: '哪个优点在哪个场景下让用户感到爽？',
              insight: '比如："长续航"在"长途飞行"中让用户感到"安心"。这就是你亚马逊 A+ 页面和主图视频的脚本。',
              output: '📤 产出：A+ 页面脚本 / 主图视频',
              color: 'fuchsia',
            },
            {
              row: 'why' as PivotDimensionType,
              col: 'weakness' as PivotDimensionType,
              layer: 'suggestion' as PivotDimensionType,
              title: '动机 × 产品劣势 × 改进建议',
              badge: '研发优先级',
              meaning: '锁定"最迫切的研发优先级"',
              focus: '为了什么买？哪没做好？希望怎么改？',
              insight: '带着"专业摄影"动机买的人，吐槽"对焦慢"，建议"固件升级"。这种组合的权重远高于"随便玩玩"的人吐槽颜色不好看。',
              output: '📤 产出：核心痛点识别 / 迭代方向',
              color: 'pink',
            },
            {
              row: 'sentiment' as PivotDimensionType,
              col: 'strength' as PivotDimensionType,
              layer: 'where' as PivotDimensionType,
              title: '情感倾向 × 产品维度 × 地点',
              badge: '环境冲突',
              meaning: '发现"环境引起的体验冲突"',
              focus: '用户在某个地方对某个功能是褒还是贬？',
              insight: '用户在"客厅"对"音量"是"正向"（音质好），但在"办公室"对"音量"是"负向"（漏音严重）。启发你做产品线扩张，比如推出"Office Edition"。',
              output: '📤 产出：产品线扩张方向',
              color: 'rose',
            },
          ].map((combo, idx) => {
            const colorMap = {
              violet: 'border-violet-300 bg-violet-50/50 hover:bg-violet-50',
              purple: 'border-purple-300 bg-purple-50/50 hover:bg-purple-50',
              fuchsia: 'border-fuchsia-300 bg-fuchsia-50/50 hover:bg-fuchsia-50',
              pink: 'border-pink-300 bg-pink-50/50 hover:bg-pink-50',
              rose: 'border-rose-300 bg-rose-50/50 hover:bg-rose-50',
            };
            
            const badgeColorMap = {
              violet: 'bg-violet-500 text-white',
              purple: 'bg-purple-500 text-white',
              fuchsia: 'bg-fuchsia-500 text-white',
              pink: 'bg-pink-500 text-white',
              rose: 'bg-rose-500 text-white',
            };
            
            return (
              <div
                key={idx}
                onClick={() => {
                  setMode('3d');
                  setRowDimension(combo.row);
                  setColDimension(combo.col);
                  setLayerDimension(combo.layer);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`border-2 ${colorMap[combo.color]} rounded-lg p-4 cursor-pointer transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-gray-900">{combo.title}</h4>
                  <span className={`text-[10px] px-2 py-0.5 ${badgeColorMap[combo.color]} rounded-full font-semibold shrink-0`}>
                    {combo.badge}
                  </span>
                </div>
                
                <div className="space-y-2 text-xs text-gray-700">
                  <div>
                    <span className="font-semibold text-gray-900">核心意义：</span>
                    <span className="ml-1">{combo.meaning}</span>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-gray-900">分析重点：</span>
                    <span className="ml-1">{combo.focus}</span>
                  </div>
                  
                  <div className="pt-1 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">💡 洞察：</span>
                    <p className="ml-1 mt-1 text-[11px] leading-relaxed">{combo.insight}</p>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-200 bg-white/60 -mx-1 px-1 py-1.5 rounded">
                    <span className="text-[11px] font-semibold text-purple-700">{combo.output}</span>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-[10px] text-gray-500">点击卡片切换到三维透视模式 ↑</span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
        
        {/* 决策矩阵 */}
        <div className="mt-6 p-4 bg-white rounded-lg border-2 border-amber-300">
          <h4 className="text-sm font-bold text-gray-900 mb-3">📋 透视分析决策矩阵</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-amber-200">
                  <th className="text-left py-2 px-2 font-bold text-gray-700">组合类型</th>
                  <th className="text-left py-2 px-2 font-bold text-gray-700">解决的业务问题</th>
                  <th className="text-left py-2 px-2 font-bold text-gray-700">产出物</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">人群策略</td>
                  <td className="py-2 px-2">谁会被哪个卖点打动？</td>
                  <td className="py-2 px-2 text-orange-700">广告素材 / 标题</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">产品打磨</td>
                  <td className="py-2 px-2">针对不同场景改哪里？</td>
                  <td className="py-2 px-2 text-orange-700">研发需求文档 (PRD)</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">口碑监测</td>
                  <td className="py-2 px-2">用户买对了/用爽了吗？</td>
                  <td className="py-2 px-2 text-orange-700">差评预警 / 卖点验证</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">品牌定调</td>
                  <td className="py-2 px-2">品牌在用户心中长啥样？</td>
                  <td className="py-2 px-2 text-orange-700">品牌视觉指南 / 主图</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">心智验证</td>
                  <td className="py-2 px-2">营销心智与用户感知是否一致？</td>
                  <td className="py-2 px-2 text-orange-700">品牌定位校准</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">迭代决策</td>
                  <td className="py-2 px-2">改进会不会破坏优势？</td>
                  <td className="py-2 px-2 text-orange-700">产品迭代优先级</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">差异化</td>
                  <td className="py-2 px-2">哪里有性价比平衡点缺口？</td>
                  <td className="py-2 px-2 text-orange-700">差异化产品方向</td>
                </tr>
                <tr className="border-b border-gray-200 bg-purple-50">
                  <td className="py-2 px-2 font-semibold text-purple-700">决策链路 (3D)</td>
                  <td className="py-2 px-2">谁买给谁？为什么买？</td>
                  <td className="py-2 px-2 text-purple-700">广告受众定位</td>
                </tr>
                <tr className="border-b border-gray-200 bg-purple-50">
                  <td className="py-2 px-2 font-semibold text-purple-700">场景还原 (3D)</td>
                  <td className="py-2 px-2">在哪？何时？做什么？</td>
                  <td className="py-2 px-2 text-purple-700">产品定义 (PD)</td>
                </tr>
                <tr className="bg-purple-50">
                  <td className="py-2 px-2 font-semibold text-purple-700">品牌Hook (3D)</td>
                  <td className="py-2 px-2">哪个优点在哪让用户爽？</td>
                  <td className="py-2 px-2 text-purple-700">A+ 脚本 / 主图视频</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-white/80 rounded-lg border border-amber-200">
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-amber-700">💡 使用建议：</span>
            使用热力图模式查看这些组合，颜色越深代表交叉频次越高。重点关注高频和异常低频的交叉点，它们往往蕴含着产品机会或风险点。基础组合适合探索，进阶组合直接输出可落地的业务决策。
          </p>
        </div>
      </div>
      
      {/* 下钻弹窗 */}
      {drillDownData && (
        <DrillDownModal
          data={drillDownData}
          reviews={data.reviews || []}
          onClose={() => setDrillDownData(null)}
        />
      )}
    </div>
  );
}
