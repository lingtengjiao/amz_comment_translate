/**
 * 场景洞察模块
 * 分析使用场景分布和场景满意度
 */
import { useMemo, useState } from 'react';
import { PivotCalculatorInput } from '../../types';
import { InsightCard } from '../InsightCard';
import { ModuleContainer } from '../ModuleContainer';
import { getModuleConfig } from '../moduleConfig';
import { DrillDownData } from '../../types';
import { SlicedHeatmapChart } from '../../charts/SlicedHeatmapChart';
import { calculateLocationTimeScenarioRelation, calculateEmotionDimensionLocationRelation } from '../dataCalculator';
import { interpretLifeMoment, interpretEnvironmentConflict } from '../AIInterpreter';

interface ScenarioInsightProps {
  data: PivotCalculatorInput;
  aiInsights?: any[]; // 后端生成的AI洞察
  onDrillDown?: (data: DrillDownData) => void;
}

export function ScenarioInsight({ data, aiInsights, onDrillDown }: ScenarioInsightProps) {
  const [error, setError] = useState<string | null>(null);
  const config = getModuleConfig('scenario');
  
  // 计算地点×时间2D关系矩阵
  const locationTimeMatrix = useMemo(() => {
    try {
      const reviews = data.reviews || [];
      const matrix: Record<string, Record<string, number>> = {};
      
      reviews.forEach((review: any) => {
        // 🔧 修复：从 theme_highlights 获取 where 和 when
        const locations = (review.theme_highlights || [])
          .filter((th: any) => th.theme_type === 'where' && th.label_name)
          .map((th: any) => th.label_name);
        const times = (review.theme_highlights || [])
          .filter((th: any) => th.theme_type === 'when' && th.label_name)
          .map((th: any) => th.label_name);
        
        locations.forEach((location: string) => {
          if (!matrix[location]) matrix[location] = {};
          times.forEach((time: string) => {
            matrix[location][time] = (matrix[location][time] || 0) + 1;
          });
        });
      });
      
      // 提取并排序
      const locations = Object.keys(matrix).sort((a, b) => {
        const sumA = Object.values(matrix[a]).reduce((sum: number, v) => sum + v, 0);
        const sumB = Object.values(matrix[b]).reduce((sum: number, v) => sum + v, 0);
        return sumB - sumA;
      });
      
      const allTimes = new Set<string>();
      Object.values(matrix).forEach(timeMap => {
        Object.keys(timeMap).forEach(time => allTimes.add(time));
      });
      const times = Array.from(allTimes).sort((a, b) => {
        const sumA = locations.reduce((sum, loc) => sum + (matrix[loc]?.[a] || 0), 0);
        const sumB = locations.reduce((sum, loc) => sum + (matrix[loc]?.[b] || 0), 0);
        return sumB - sumA;
      });
      
      return { matrix, locations: locations.slice(0, 6), times: times.slice(0, 5) };
    } catch (err) {
      console.error('计算地点×时间矩阵失败:', err);
      return { matrix: {}, locations: [], times: [] };
    }
  }, [data]);
  
  // 计算场景×情感2D矩阵
  const scenarioEmotionMatrix = useMemo(() => {
    try {
      const reviews = data.reviews || [];
      const matrix: Record<string, Record<string, number>> = {};
      
      reviews.forEach((review: any) => {
        // 🔧 修复：场景从 insights 中获取（type='scenario'），不是从 theme_highlights
        const scenarios = (review.insights || [])
          .filter((insight: any) => insight.type === 'scenario' && insight.dimension)
          .map((insight: any) => insight.dimension);
        
        // 🔧 修复：情感从 insights 中获取（type='emotion'）
        const emotions = (review.insights || [])
          .filter((insight: any) => insight.type === 'emotion' && insight.dimension)
          .map((insight: any) => insight.dimension);
        
        scenarios.forEach((scenario: string) => {
          if (!matrix[scenario]) matrix[scenario] = {};
          emotions.forEach((emotion: string) => {
            matrix[scenario][emotion] = (matrix[scenario][emotion] || 0) + 1;
          });
        });
      });
      
      // 提取并排序
      const scenarios = Object.keys(matrix).sort((a, b) => {
        const sumA = Object.values(matrix[a]).reduce((sum: number, v) => sum + v, 0);
        const sumB = Object.values(matrix[b]).reduce((sum: number, v) => sum + v, 0);
        return sumB - sumA;
      });
      
      const allEmotions = new Set<string>();
      Object.values(matrix).forEach(emotionMap => {
        Object.keys(emotionMap).forEach(emotion => allEmotions.add(emotion));
      });
      const emotions = Array.from(allEmotions).sort((a, b) => {
        const sumA = scenarios.reduce((sum, sc) => sum + (matrix[sc]?.[a] || 0), 0);
        const sumB = scenarios.reduce((sum, sc) => sum + (matrix[sc]?.[b] || 0), 0);
        return sumB - sumA;
      });
      
      return { matrix, scenarios: scenarios.slice(0, 6), emotions: emotions.slice(0, 6) };
    } catch (err) {
      console.error('计算场景×情感矩阵失败:', err);
      return { matrix: {}, scenarios: [], emotions: [] };
    }
  }, [data]);
  
  // 计算3D场景数据（地点×时机×场景）
  const location3DData = useMemo(() => {
    try {
      return calculateLocationTimeScenarioRelation(data);
    } catch (err) {
      console.error('计算3D场景数据失败:', err);
      return { locations: [], times: [], scenarios: [], slices: [] };
    }
  }, [data]);
  
  // 生成3D场景AI解读
  const lifeMomentInterpretation = useMemo(() => {
    const ai3D = aiInsights?.find((insight: any) => insight.insight_type === 'life_moment');
    if (ai3D?.interpretation) {
      return ai3D.interpretation;
    }
    // 降级为本地计算
    return interpretLifeMoment({
      slices: location3DData.slices,
    });
  }, [aiInsights, location3DData]);
  
  // 计算情感-维度-地点3D数据
  const emotion3DData = useMemo(() => {
    try {
      return calculateEmotionDimensionLocationRelation(data);
    } catch (err) {
      console.error('计算情感-维度-地点3D数据失败:', err);
      return { emotions: [], dimensions: [], locations: [], slices: [] };
    }
  }, [data]);
  
  // 生成环境冲突 AI 解读
  const environmentConflictInterpretation = useMemo(() => {
    const aiEnv = aiInsights?.find((insight: any) => insight.insight_type === 'environment_conflict');
    if (aiEnv?.interpretation) {
      return aiEnv.interpretation;
    }
    // 降级为本地计算
    return interpretEnvironmentConflict(emotion3DData);
  }, [aiInsights, emotion3DData]);
  
  // 计算1D场景要素分布
  const scenarioElements = useMemo(() => {
    const where = data.aggregated_themes?.where || [];
    const when = data.aggregated_themes?.when || [];
    const scenario = data.aggregated_themes?.scenario || [];
    
    return {
      where: where.map((item: any) => ({ label: item.label, count: item.count })).sort((a: any, b: any) => b.count - a.count),
      when: when.map((item: any) => ({ label: item.label, count: item.count })).sort((a: any, b: any) => b.count - a.count),
      scenario: scenario.map((item: any) => ({ label: item.label, count: item.count })).sort((a: any, b: any) => b.count - a.count),
    };
  }, [data.aggregated_themes]);
  
  const hasData = locationTimeMatrix.locations.length > 0 || scenarioEmotionMatrix.scenarios.length > 0 || 
                   location3DData.slices.length > 0 || emotion3DData.slices.length > 0 || 
                   scenarioElements.where.length > 0;
  
  return (
    <ModuleContainer 
      config={config}
      error={error}
      hasData={hasData}
      defaultExpanded={true}
    >
      {/* 4.0 场景要素分布 */}
      {(scenarioElements.where.length > 0 || scenarioElements.when.length > 0 || scenarioElements.scenario.length > 0) && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">4.0 场景要素分布</h4>
          <p className="text-sm text-gray-600 mb-4">地点、时机、场景三要素分布</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* 地点分布 */}
            {scenarioElements.where.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="text-sm font-semibold text-orange-700 mb-3">📍 地点（WHERE）</h5>
                <div className="space-y-2">
                  {scenarioElements.where.slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{item.label}</span>
                      <span className="font-medium text-orange-600 ml-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 时机分布 */}
            {scenarioElements.when.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="text-sm font-semibold text-orange-700 mb-3">🕐 时机（WHEN）</h5>
                <div className="space-y-2">
                  {scenarioElements.when.slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{item.label}</span>
                      <span className="font-medium text-orange-600 ml-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 场景分布 */}
            {scenarioElements.scenario.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="text-sm font-semibold text-orange-700 mb-3">🎬 场景</h5>
                <div className="space-y-2">
                  {scenarioElements.scenario.slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{item.label}</span>
                      <span className="font-medium text-orange-600 ml-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <InsightCard
            interpretation={{
              keyFindings: [
                `🔥 高频地点：${scenarioElements.where[0]?.label || '-'}（${scenarioElements.where[0]?.count || 0}次）`,
                `⏰ 高频时机：${scenarioElements.when[0]?.label || '-'}（${scenarioElements.when[0]?.count || 0}次）`,
                `🎯 核心场景：${scenarioElements.scenario[0]?.label || '-'}（${scenarioElements.scenario[0]?.count || 0}次）`,
                `场景丰富度：${scenarioElements.where.length}个地点 × ${scenarioElements.when.length}个时机 × ${scenarioElements.scenario.length}个场景`
              ],
              dataSupport: [
                {
                  metric: '黄金组合',
                  value: `${scenarioElements.where[0]?.label} × ${scenarioElements.when[0]?.label} × ${scenarioElements.scenario[0]?.label}`
                }
              ],
              recommendations: [
                `在「${scenarioElements.where[0]?.label}」场景优化产品体验`,
                `针对「${scenarioElements.when[0]?.label}」时段投放广告`,
                `突出「${scenarioElements.scenario[0]?.label}」使用场景的产品优势`,
                scenarioElements.where.length >= 5 ? '多场景适配性好，可以覆盖更广泛用户' : '考虑拓展更多使用场景'
              ],
              severity: 'info' as const
            }}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 4.1 地点×时间的完整交叉关系热力图 */}
      {(locationTimeMatrix.locations.length > 0 || scenarioElements.where.length > 0) && (
        <div className={scenarioElements.where.length > 0 ? "pt-6 border-t-2 border-gray-200 mb-8" : "mb-8"}>
          <h4 className="text-base font-bold text-gray-900 mb-3">4.1 地点×时间的完整交叉关系热力图</h4>
          <p className="text-sm text-gray-600 mb-4">
            {locationTimeMatrix.locations.length > 0 && locationTimeMatrix.times.length > 0 
              ? '地点 × 时间：揭示高频使用时空的完整交叉关系' 
              : '等待数据加载：需要同时有地点（where）和时间（when）数据才能显示交叉热力图'}
          </p>
          
          {/* 2D热力图：地点×时间 */}
          {locationTimeMatrix.locations.length > 0 && locationTimeMatrix.times.length > 0 ? (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 p-2 sticky left-0 bg-gray-50">地点 \ 时间</th>
                    {locationTimeMatrix.times.map((time, idx) => (
                      <th key={idx} className="text-center text-xs font-semibold text-gray-600 p-2 min-w-[80px]">
                        {time}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {locationTimeMatrix.locations.map((location, locIdx) => {
                    const rowMax = Math.max(
                      ...locationTimeMatrix.times.map(time => locationTimeMatrix.matrix[location]?.[time] || 0)
                    );
                    
                    return (
                      <tr key={locIdx} className="border-t border-gray-200">
                        <td className="text-sm font-medium text-gray-800 p-2 sticky left-0 bg-gray-50">
                          {location}
                        </td>
                        {locationTimeMatrix.times.map((time, timeIdx) => {
                          const count = locationTimeMatrix.matrix[location]?.[time] || 0;
                          const intensity = rowMax > 0 ? (count / rowMax) : 0;
                          const bgColor = count === 0 
                            ? 'bg-gray-100' 
                            : intensity >= 0.7 
                            ? 'bg-orange-500 text-white' 
                            : intensity >= 0.4 
                            ? 'bg-orange-300' 
                            : 'bg-orange-100';
                          
                          return (
                            <td 
                              key={timeIdx} 
                              className={`text-center p-2 ${bgColor} text-sm font-medium transition-colors`}
                              title={`${location} × ${time}: ${count}次`}
                            >
                              {count > 0 ? count : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* 数据不足提示 */
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-4 text-center">
              <p className="text-sm text-yellow-800 font-semibold mb-2">
                ⚠️ 无法显示二维交叉关系热力图
              </p>
              <p className="text-xs text-yellow-700">
                需要同时有地点（where）和时间（when）数据才能显示完整的交叉关系。
                {scenarioElements.where.length > 0 && scenarioElements.when.length === 0 && ' 当前只有地点数据，缺少时间数据。'}
                {scenarioElements.where.length === 0 && scenarioElements.when.length > 0 && ' 当前只有时间数据，缺少地点数据。'}
                {scenarioElements.where.length === 0 && scenarioElements.when.length === 0 && ' 当前缺少地点和时间数据。'}
              </p>
            </div>
          )}
          
          <InsightCard
            interpretation={
              aiInsights?.find((i: any) => i.insight_type === 'scenario_distribution')?.interpretation || (() => {
                // 如果有2D数据，分析交叉关系
                if (locationTimeMatrix.locations.length > 0 && locationTimeMatrix.times.length > 0) {
                  let maxCount = 0;
                  let maxLocation = '';
                  let maxTime = '';
                  locationTimeMatrix.locations.forEach(loc => {
                    locationTimeMatrix.times.forEach(time => {
                      const count = locationTimeMatrix.matrix[loc]?.[time] || 0;
                      if (count > maxCount) {
                        maxCount = count;
                        maxLocation = loc;
                        maxTime = time;
                      }
                    });
                  });
                  
                  return {
                    keyFindings: [
                      `🔥 黄金时空：${maxLocation} × ${maxTime}（${maxCount}次提及）`,
                      `覆盖场景：${locationTimeMatrix.locations.length}个地点 × ${locationTimeMatrix.times.length}个时间`,
                      maxCount >= 5 ? '✅ 高频场景明确，利于精准营销' : '💡 场景分散，可拓展多元市场'
                    ],
                    dataSupport: [
                      {
                        metric: '黄金组合',
                        value: `${maxLocation} × ${maxTime}`
                      },
                      {
                        metric: '提及频次',
                        value: `${maxCount}次`
                      }
                    ],
                    recommendations: [
                      `在「${maxLocation}」场景的「${maxTime}」时段投放广告`,
                      '针对高频时空优化产品功能和用户体验',
                      '在A+页面展示核心使用场景的真实画面',
                      locationTimeMatrix.locations.length < 3 ? '考虑拓展更多使用场景' : '保持多场景适配优势'
                    ],
                    severity: 'info' as const
                  };
                }
                
                // 降级：分析1D数据
                return {
                  keyFindings: [
                    `📍 核心地点：${scenarioElements.where[0]?.label || '-'}（${scenarioElements.where[0]?.count || 0}次提及）`,
                    `⏰ 核心时机：${scenarioElements.when[0]?.label || '-'}（${scenarioElements.when[0]?.count || 0}次提及）`,
                    `场景覆盖：${scenarioElements.where.length}个地点 × ${scenarioElements.when.length}个时间`
                  ],
                  dataSupport: `共识别${scenarioElements.where.length}个使用场景`,
                  recommendations: [
                    `针对「${scenarioElements.where[0]?.label}」场景优化产品功能`,
                    '在营销中突出高频场景的应用价值',
                    scenarioElements.where.length < 3 ? '考虑拓展更多使用场景' : '保持多场景适配优势'
                  ],
                  severity: 'info' as const
                };
              })()
            }
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 4.2 场景×情感的完整交叉关系热力图 */}
      {(scenarioEmotionMatrix.scenarios.length > 0 || scenarioElements.scenario.length > 0) && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">4.2 场景×情感的完整交叉关系热力图</h4>
          <p className="text-sm text-gray-600 mb-4">
            {scenarioEmotionMatrix.scenarios.length > 0 && scenarioEmotionMatrix.emotions.length > 0 
              ? '场景 × 情感：不同场景引发的情感反馈的完整交叉关系' 
              : '等待数据加载：需要同时有场景（scenario）和情感（emotion）数据才能显示交叉热力图'}
          </p>
          
          {/* 2D热力图：场景×情感 */}
          {scenarioEmotionMatrix.scenarios.length > 0 && scenarioEmotionMatrix.emotions.length > 0 ? (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 p-2 sticky left-0 bg-gray-50">场景 \ 情感</th>
                    {scenarioEmotionMatrix.emotions.map((emotion, idx) => {
                      const isPositive = ['喜爱', '满意', '安心', '愉悦', '骄傲', '兴奋', '开心', '惊喜'].some(e => emotion.includes(e));
                      const isNegative = ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧', '担忧'].some(e => emotion.includes(e));
                      return (
                        <th key={idx} className={`text-center text-xs font-semibold p-2 min-w-[80px] ${isPositive ? 'text-green-700' : isNegative ? 'text-red-700' : 'text-gray-600'}`}>
                          {emotion}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {scenarioEmotionMatrix.scenarios.map((scenario, scIdx) => {
                    const rowMax = Math.max(
                      ...scenarioEmotionMatrix.emotions.map(emotion => scenarioEmotionMatrix.matrix[scenario]?.[emotion] || 0)
                    );
                    
                    return (
                      <tr key={scIdx} className="border-t border-gray-200">
                        <td className="text-sm font-medium text-gray-800 p-2 sticky left-0 bg-gray-50">
                          {scenario}
                        </td>
                        {scenarioEmotionMatrix.emotions.map((emotion, emIdx) => {
                          const count = scenarioEmotionMatrix.matrix[scenario]?.[emotion] || 0;
                          const intensity = rowMax > 0 ? (count / rowMax) : 0;
                          const isPositive = ['喜爱', '满意', '安心', '愉悦', '骄傲', '兴奋', '开心', '惊喜'].some(e => emotion.includes(e));
                          const isNegative = ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧', '担忧'].some(e => emotion.includes(e));
                          
                          let bgColor = 'bg-gray-100';
                          if (count > 0) {
                            if (isPositive) {
                              bgColor = intensity >= 0.7 ? 'bg-green-500 text-white' : intensity >= 0.4 ? 'bg-green-300' : 'bg-green-100';
                            } else if (isNegative) {
                              bgColor = intensity >= 0.7 ? 'bg-red-500 text-white' : intensity >= 0.4 ? 'bg-red-300' : 'bg-red-100';
                            } else {
                              bgColor = intensity >= 0.7 ? 'bg-blue-500 text-white' : intensity >= 0.4 ? 'bg-blue-300' : 'bg-blue-100';
                            }
                          }
                          
                          return (
                            <td 
                              key={emIdx} 
                              className={`text-center p-2 ${bgColor} text-sm font-medium transition-colors`}
                              title={`${scenario} × ${emotion}: ${count}次`}
                            >
                              {count > 0 ? count : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* 数据不足提示 */
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-4 text-center">
              <p className="text-sm text-yellow-800 font-semibold mb-2">
                ⚠️ 无法显示二维交叉关系热力图
              </p>
              <p className="text-xs text-yellow-700">
                需要同时有场景（scenario）和情感（emotion）数据才能显示完整的交叉关系。
                {scenarioElements.scenario.length > 0 && scenarioEmotionMatrix.emotions.length === 0 && ' 当前只有场景数据，缺少情感数据。'}
                {scenarioElements.scenario.length === 0 && scenarioEmotionMatrix.emotions.length > 0 && ' 当前只有情感数据，缺少场景数据。'}
                {scenarioElements.scenario.length === 0 && scenarioEmotionMatrix.emotions.length === 0 && ' 当前缺少场景和情感数据。'}
              </p>
            </div>
          )}
          
          <InsightCard
            interpretation={
              aiInsights?.find((i: any) => i.insight_type === 'scenario_sentiment')?.interpretation || (() => {
                // 如果有2D数据，分析交叉关系
                if (scenarioEmotionMatrix.scenarios.length > 0 && scenarioEmotionMatrix.emotions.length > 0) {
                  let maxPositiveCount = 0;
                  let maxPositiveScenario = '';
                  let maxPositiveEmotion = '';
                  scenarioEmotionMatrix.scenarios.forEach(sc => {
                    scenarioEmotionMatrix.emotions.forEach(em => {
                      const count = scenarioEmotionMatrix.matrix[sc]?.[em] || 0;
                      const isPositive = ['喜爱', '满意', '安心', '愉悦', '骄傲', '兴奋', '开心', '惊喜'].some(e => em.includes(e));
                      if (isPositive && count > maxPositiveCount) {
                        maxPositiveCount = count;
                        maxPositiveScenario = sc;
                        maxPositiveEmotion = em;
                      }
                    });
                  });
                  
                  let maxNegativeCount = 0;
                  let maxNegativeScenario = '';
                  let maxNegativeEmotion = '';
                  scenarioEmotionMatrix.scenarios.forEach(sc => {
                    scenarioEmotionMatrix.emotions.forEach(em => {
                      const count = scenarioEmotionMatrix.matrix[sc]?.[em] || 0;
                      const isNegative = ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧', '担忧'].some(e => em.includes(e));
                      if (isNegative && count > maxNegativeCount) {
                        maxNegativeCount = count;
                        maxNegativeScenario = sc;
                        maxNegativeEmotion = em;
                      }
                    });
                  });
                  
                  return {
                    keyFindings: [
                      `💚 最佳情感体验：${maxPositiveScenario} → ${maxPositiveEmotion}（${maxPositiveCount}次）`,
                      maxNegativeCount > 0 
                        ? `⚠️ 需优化场景：${maxNegativeScenario} → ${maxNegativeEmotion}（${maxNegativeCount}次）` 
                        : '✅ 无明显负面情感场景',
                      `分析覆盖：${scenarioEmotionMatrix.scenarios.length}个场景 × ${scenarioEmotionMatrix.emotions.length}种情感`
                    ],
                    dataSupport: [
                      {
                        metric: '最佳组合',
                        value: `${maxPositiveScenario} × ${maxPositiveEmotion}`
                      },
                      {
                        metric: '情感类型',
                        value: `${scenarioEmotionMatrix.emotions.length}种`
                      }
                    ],
                    recommendations: [
                      `在「${maxPositiveScenario}」场景强化「${maxPositiveEmotion}」的品牌联想`,
                      maxNegativeCount > 0 
                        ? `改进「${maxNegativeScenario}」场景，减少「${maxNegativeEmotion}」情绪` 
                        : '保持各场景的积极情感体验',
                      '在营销中突出正面情感最强的使用场景',
                      '关注场景与情感的关联，针对性优化产品功能'
                    ],
                    severity: maxNegativeCount < maxPositiveCount ? 'success' : 'warning' as const
                  };
                }
                
                // 降级：分析1D场景数据
                return {
                  keyFindings: [
                    `🎬 核心场景：${scenarioElements.scenario[0]?.label || '-'}（${scenarioElements.scenario[0]?.count || 0}次提及）`,
                    `场景覆盖：识别到${scenarioElements.scenario.length}个使用场景`,
                    scenarioElements.scenario.length >= 5 ? '✅ 场景丰富，覆盖多元需求' : '💡 可拓展更多使用场景'
                  ],
                  dataSupport: `共识别${scenarioElements.scenario.length}个使用场景`,
                  recommendations: [
                    `针对「${scenarioElements.scenario[0]?.label}」场景优化用户体验`,
                    '在营销中突出核心使用场景',
                    scenarioElements.scenario.length < 3 ? '挖掘更多产品使用场景' : '保持多场景适配能力'
                  ],
                  severity: 'info' as const
                };
              })()
            }
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 4.3 真实生活瞬间（3D：地点×时机×场景） */}
      {location3DData.slices.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">4.3 真实生活瞬间 🎬</h4>
          <p className="text-sm text-gray-600 mb-4">地点 × 时机 × 场景：完整还原用户使用场景</p>
          
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="text-blue-600 text-sm font-bold">💡 3D分析</div>
              <div className="text-xs text-blue-700">
                通过Tab切换不同地点，查看该地点下的「时机×场景」分布热力图
              </div>
            </div>
            
            <SlicedHeatmapChart
              slices={location3DData.slices}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={lifeMomentInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 4.4 环境冲突（3D：情感×维度×地点） */}
      {emotion3DData.slices.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">4.4 环境冲突分析 ⚠️</h4>
          <p className="text-sm text-gray-600 mb-4">情感 × 产品维度 × 地点：识别场景适配问题与产品线扩张机会</p>
          
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="text-orange-600 text-sm font-bold">💡 3D分析</div>
              <div className="text-xs text-orange-700">
                通过Tab切换不同情感，查看该情感下产品维度在不同地点的表现分布
              </div>
            </div>
            
            <SlicedHeatmapChart
              slices={emotion3DData.slices}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={environmentConflictInterpretation}
            title="AI 解读"
          />
        </div>
      )}
    </ModuleContainer>
  );
}
