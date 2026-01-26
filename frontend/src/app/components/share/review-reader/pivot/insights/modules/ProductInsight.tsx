/**
 * 产品洞察模块
 * 分析产品优势、劣势和改进建议
 */
import { useMemo, useState } from 'react';
import { PivotCalculatorInput } from '../../types';
import { HeatmapChart } from '../../charts/HeatmapChart';
import { BiDirectionalBarChart } from '../../charts/BiDirectionalBarChart';
import { GroupedBarChart } from '../../charts/GroupedBarChart';
import { InsightCard } from '../InsightCard';
import { ModuleContainer } from '../ModuleContainer';
import { getModuleConfig } from '../moduleConfig';
import { 
  calculateWeaknessSentimentRelation,
  calculateStrengthWeaknessComparison,
  calculateLocationSuggestionRelation,
  calculateStrengthEmotionRelation,
  calculateMotivationSuggestionRelation,
  calculateSuggestionStrengthRelation
} from '../dataCalculator';
import { 
  interpretCriticalWeakness, 
  interpretImprovementPriority,
  interpretStrengthEmotion,
  interpretMotivationSuggestion,
  interpretNegativeOptimization
} from '../AIInterpreter';

interface ProductInsightProps {
  data: PivotCalculatorInput;
  aiInsights?: any[]; // 后端生成的AI洞察
}

export function ProductInsight({ data, aiInsights }: ProductInsightProps) {
  const [error, setError] = useState<string | null>(null);
  const config = getModuleConfig('product');
  
  // 计算劣势-情感关系
  const weaknessSentimentData = useMemo(() => {
    try {
      return calculateWeaknessSentimentRelation(data);
    } catch (err) {
      console.error('计算劣势-情感数据失败:', err);
      setError('数据计算失败');
      return { weaknesses: [], weaknessSentiment: [] };
    }
  }, [data]);
  
  // 计算优劣势对比
  const comparisonData = useMemo(() => {
    try {
      return calculateStrengthWeaknessComparison(data);
    } catch (err) {
      console.error('计算优劣势对比数据失败:', err);
      return { dimensions: [], strengths: [], weaknesses: [] };
    }
  }, [data]);
  
  // 计算地点-改进建议关系
  const locationSuggestionData = useMemo(() => {
    try {
      return calculateLocationSuggestionRelation(data);
    } catch (err) {
      console.error('计算场景-建议数据失败:', err);
      return { locations: [], suggestions: [], whereSuggestion: [] };
    }
  }, [data]);
  
  // 计算优势-情感关系
  const strengthEmotionData = useMemo(() => {
    try {
      return calculateStrengthEmotionRelation(data);
    } catch (err) {
      console.error('计算优势-情感数据失败:', err);
      return { strengths: [], emotions: [], strengthEmotionMap: {}, strengthEmotion: [] };
    }
  }, [data]);
  
  // 计算动机-改进建议关系
  const motivationSuggestionData = useMemo(() => {
    try {
      return calculateMotivationSuggestionRelation(data);
    } catch (err) {
      console.error('计算动机-建议数据失败:', err);
      return { motivations: [], suggestions: [], motivationSuggestionMap: {}, motivationSuggestion: [] };
    }
  }, [data]);
  
  // 计算改进建议-优势维度关系
  const suggestionStrengthData = useMemo(() => {
    try {
      return calculateSuggestionStrengthRelation(data);
    } catch (err) {
      console.error('计算建议-优势数据失败:', err);
      return { dimensions: [], dimensionAnalysis: [] };
    }
  }, [data]);
  
  // 准备劣势-情感热力图数据
  const weaknessHeatmapData = useMemo(() => {
    const rows = weaknessSentimentData.weaknesses;
    const columns = ['正面', '中性', '负面'];
    const matrixData = weaknessSentimentData.weaknessSentiment.map(w => [
      w.positive,
      w.neutral,
      w.negative,
    ]);
    
    return { rows, columns, data: matrixData };
  }, [weaknessSentimentData]);
  
  // 生成 AI 解读（优先使用后端 AI 数据）
  const criticalWeaknessInterpretation = useMemo(() => {
    const aiWeakness = aiInsights?.find((insight: any) => insight.insight_type === 'critical_weakness');
    if (aiWeakness?.interpretation) {
      return aiWeakness.interpretation;
    }
    // 降级为本地计算
    return interpretCriticalWeakness({
      weaknessSentiment: weaknessSentimentData.weaknessSentiment,
    });
  }, [aiInsights, weaknessSentimentData]);
  
  const improvementInterpretation = useMemo(() => {
    const aiImprovement = aiInsights?.find((insight: any) => insight.insight_type === 'improvement_priority');
    if (aiImprovement?.interpretation) {
      return aiImprovement.interpretation;
    }
    // 降级为本地计算
    return interpretImprovementPriority({
      whereSuggestion: locationSuggestionData.whereSuggestion,
    });
  }, [aiInsights, locationSuggestionData]);
  
  const strengthWeaknessInterpretation = useMemo(() => {
    const aiStrengthWeakness = aiInsights?.find((insight: any) => insight.insight_type === 'strength_weakness');
    if (aiStrengthWeakness?.interpretation) {
      return aiStrengthWeakness.interpretation;
    }
    // 降级为本地计算
    return {
      severity: 'info' as const,
      keyFindings: [
        '通过对比各维度的优势/劣势提及次数，可以识别产品的核心竞争力和致命缺陷',
        comparisonData.dimensions.length > 0 ? 
          `最强优势：${comparisonData.dimensions[0] || '无'}`
          : '暂无数据'
      ],
      dataSupport: [],
      recommendations: [],
    };
  }, [aiInsights, comparisonData]);
  
  const strengthEmotionInterpretation = useMemo(() => {
    const aiStrengthEmotion = aiInsights?.find((insight: any) => insight.insight_type === 'strength_emotion');
    if (aiStrengthEmotion?.interpretation) {
      return aiStrengthEmotion.interpretation;
    }
    // 降级为本地计算
    return interpretStrengthEmotion({
      strengthEmotion: strengthEmotionData.strengthEmotion,
    });
  }, [aiInsights, strengthEmotionData]);
  
  const motivationSuggestionInterpretation = useMemo(() => {
    const aiMotivationSuggestion = aiInsights?.find((insight: any) => insight.insight_type === 'motivation_suggestion');
    if (aiMotivationSuggestion?.interpretation) {
      return aiMotivationSuggestion.interpretation;
    }
    // 降级为本地计算
    return interpretMotivationSuggestion({
      motivationSuggestion: motivationSuggestionData.motivationSuggestion,
    });
  }, [aiInsights, motivationSuggestionData]);
  
  const negativeOptimizationInterpretation = useMemo(() => {
    const aiNegativeOptimization = aiInsights?.find((insight: any) => insight.insight_type === 'negative_optimization');
    if (aiNegativeOptimization?.interpretation) {
      return aiNegativeOptimization.interpretation;
    }
    // 降级为本地计算
    return interpretNegativeOptimization({
      dimensionAnalysis: suggestionStrengthData.dimensionAnalysis,
    });
  }, [aiInsights, suggestionStrengthData]);
  
  // 计算1D维度分布数据
  const dimensionDistribution = useMemo(() => {
    const strengths = data.aggregated_insights?.strengths || [];
    const weaknesses = data.aggregated_insights?.weaknesses || [];
    const suggestions = data.aggregated_insights?.suggestions || [];
    
    return {
      strengths: strengths.length,
      weaknesses: weaknesses.length,
      suggestions: suggestions.length,
      strengthDetails: strengths.slice(0, 5).reduce((acc: Record<string, number>, item: any) => {
        const dim = item.dimension || '其他';
        acc[dim] = (acc[dim] || 0) + 1;
        return acc;
      }, {}),
      weaknessDetails: weaknesses.slice(0, 5).reduce((acc: Record<string, number>, item: any) => {
        const dim = item.dimension || '其他';
        acc[dim] = (acc[dim] || 0) + 1;
        return acc;
      }, {}),
    };
  }, [data.aggregated_insights]);
  
  const hasData = weaknessSentimentData.weaknesses.length > 0 || 
                   comparisonData.dimensions.length > 0 ||
                   strengthEmotionData.strengths.length > 0 ||
                   locationSuggestionData.whereSuggestion?.length > 0 ||
                   motivationSuggestionData.motivations.length > 0 ||
                   suggestionStrengthData.dimensionAnalysis.length > 0 ||
                   dimensionDistribution.strengths > 0;
  
  return (
    <ModuleContainer 
      config={config}
      error={error}
      hasData={hasData}
      defaultExpanded={true}
    >
      {/* 3.0 维度分布概览 */}
      {(dimensionDistribution.strengths > 0 || dimensionDistribution.weaknesses > 0) && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.0 维度分布概览</h4>
          <p className="text-sm text-gray-600 mb-4">产品优劣势整体情况</p>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-700">{dimensionDistribution.strengths}</div>
              <div className="text-sm text-green-600 mt-1">✅ 优势</div>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-700">{dimensionDistribution.weaknesses}</div>
              <div className="text-sm text-red-600 mt-1">⚠️ 劣势</div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{dimensionDistribution.suggestions}</div>
              <div className="text-sm text-blue-600 mt-1">💡 建议</div>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top优势维度 */}
              {Object.keys(dimensionDistribution.strengthDetails).length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-green-700 mb-2">💪 Top优势维度</h5>
                  <div className="space-y-2">
                    {Object.entries(dimensionDistribution.strengthDetails)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 3)
                      .map(([dim, count], idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{dim}</span>
                          <span className="font-medium text-green-600">{count}次</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {/* Top劣势维度 */}
              {Object.keys(dimensionDistribution.weaknessDetails).length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-red-700 mb-2">⚠️ Top劣势维度</h5>
                  <div className="space-y-2">
                    {Object.entries(dimensionDistribution.weaknessDetails)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 3)
                      .map(([dim, count], idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{dim}</span>
                          <span className="font-medium text-red-600">{count}次</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <InsightCard
            interpretation={{
              keyFindings: [
                `产品健康度：${dimensionDistribution.strengths}个优势 vs ${dimensionDistribution.weaknesses}个劣势`,
                dimensionDistribution.strengths > dimensionDistribution.weaknesses * 2 
                  ? '✅ 优势明显，产品综合表现优秀' 
                  : dimensionDistribution.strengths > dimensionDistribution.weaknesses 
                  ? '⚖️ 优势略胜，仍有提升空间' 
                  : '⚠️ 劣势较多，需重点改进',
                `用户提出${dimensionDistribution.suggestions}条改进建议`
              ],
              dataSupport: [
                {
                  metric: '优劣比',
                  value: `${(dimensionDistribution.strengths / Math.max(dimensionDistribution.weaknesses, 1)).toFixed(1)}:1`
                },
                {
                  metric: '改进需求',
                  value: `${dimensionDistribution.suggestions}条`
                }
              ],
              recommendations: [
                dimensionDistribution.weaknesses > dimensionDistribution.strengths 
                  ? '🚨 优先解决高频劣势问题' 
                  : '💪 继续强化优势维度，扩大差异化',
                `关注用户的${dimensionDistribution.suggestions}条改进建议`,
                '定期追踪各维度的变化趋势'
              ],
              severity: dimensionDistribution.strengths > dimensionDistribution.weaknesses ? 'success' : 'warning' as const
            }}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.1 致命缺陷识别 */}
      {weaknessHeatmapData.rows.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.1 致命缺陷识别</h4>
          <p className="text-sm text-gray-600 mb-4">产品劣势 × 情感倾向</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={weaknessHeatmapData.rows}
              columns={weaknessHeatmapData.columns}
              data={weaknessHeatmapData.data}
              colorScheme="sentiment"
            />
          </div>
          
          <InsightCard
            interpretation={criticalWeaknessInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.2 优劣势对比 */}
      {comparisonData.dimensions.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200 mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.2 优劣势维度对比</h4>
          <p className="text-sm text-gray-600 mb-4">识别差异化机会和平衡点</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <BiDirectionalBarChart
              categories={comparisonData.dimensions}
              leftData={comparisonData.strengthCounts}
              rightData={comparisonData.weaknessCounts}
              leftLabel="优势提及"
              rightLabel="劣势提及"
            />
          </div>
          
          <InsightCard
            interpretation={strengthWeaknessInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.3 优势情感分析（优势 × 情感标签） */}
      {strengthEmotionData.strengths.length > 0 && strengthEmotionData.emotions.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200 mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.3 优势情感分析</h4>
          <p className="text-sm text-gray-600 mb-4">产品优势 × 用户情感：品牌溢价点识别</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={strengthEmotionData.strengths}
              columns={strengthEmotionData.emotions}
              data={strengthEmotionData.strengths.map(s => 
                strengthEmotionData.emotions.map(e => 
                  strengthEmotionData.strengthEmotionMap[s]?.[e] || 0
                )
              )}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={strengthEmotionInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.4 场景化改进建议（地点 × 建议） */}
      {locationSuggestionData.whereSuggestion?.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200 mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.4 场景化改进建议</h4>
          <p className="text-sm text-gray-600 mb-4">不同使用地点的改进需求</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <GroupedBarChart
              categories={locationSuggestionData.suggestions}
              series={locationSuggestionData.whereSuggestion.map((loc, idx) => ({
                name: loc.location,
                data: locationSuggestionData.suggestions.map(s => loc.suggestions[s] || 0),
                color: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][idx % 4],
              }))}
            />
          </div>
          
          <InsightCard
            interpretation={improvementInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.5 动机分层优化（动机 × 改进建议） */}
      {motivationSuggestionData.motivations.length > 0 && motivationSuggestionData.suggestions.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200 mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.5 动机分层优化</h4>
          <p className="text-sm text-gray-600 mb-4">动机 × 改进建议：用户分层策略</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={motivationSuggestionData.motivations}
              columns={motivationSuggestionData.suggestions}
              data={motivationSuggestionData.motivations.map(m => 
                motivationSuggestionData.suggestions.map(s => 
                  motivationSuggestionData.motivationSuggestionMap[m]?.[s] || 0
                )
              )}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={motivationSuggestionInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 3.6 维度冲突分析（改进建议 × 优势维度） */}
      {suggestionStrengthData.dimensionAnalysis.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">3.6 维度冲突分析</h4>
          <p className="text-sm text-gray-600 mb-4">改进建议 × 优势维度：识别需要平衡的矛盾点</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="space-y-3">
              {suggestionStrengthData.dimensionAnalysis.slice(0, 8).map((item, idx) => {
                const maxCount = Math.max(item.strengthCount, item.suggestionCount);
                const strengthPercent = maxCount > 0 ? (item.strengthCount / maxCount) * 100 : 0;
                const suggestionPercent = maxCount > 0 ? (item.suggestionCount / maxCount) * 100 : 0;
                
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-24 text-sm font-medium text-gray-700 flex-shrink-0">
                      {item.dimension}
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 flex items-center">
                        <div className="flex-1 h-6 bg-gray-200 rounded-l overflow-hidden relative">
                          <div 
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
                            style={{ width: `${strengthPercent}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                            优势 {item.strengthCount}
                          </span>
                        </div>
                        <div className="flex-1 h-6 bg-gray-200 rounded-r overflow-hidden relative">
                          <div 
                            className="h-full bg-gradient-to-l from-orange-400 to-amber-500 transition-all"
                            style={{ width: `${suggestionPercent}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                            建议 {item.suggestionCount}
                          </span>
                        </div>
                      </div>
                      <div className="w-16 text-right text-xs text-gray-500 flex-shrink-0">
                        {item.conflictRate.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <InsightCard
            interpretation={negativeOptimizationInterpretation}
            title="AI 解读"
          />
        </div>
      )}
    </ModuleContainer>
  );
}
