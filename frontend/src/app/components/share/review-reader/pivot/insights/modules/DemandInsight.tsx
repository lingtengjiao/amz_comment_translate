/**
 * 需求洞察模块
 * 分析用户动机和期望满足度
 */
import { useMemo, useState } from 'react';
import { PivotCalculatorInput } from '../../types';
import { HeatmapChart } from '../../charts/HeatmapChart';
import { SlicedHeatmapChart } from '../../charts/SlicedHeatmapChart';
import { InsightCard } from '../InsightCard';
import { ModuleContainer } from '../ModuleContainer';
import { getModuleConfig } from '../moduleConfig';
import { 
  calculateMotivationSentimentRelation,
  calculateMotivationLocationRelation,
  calculateMotivationEmotionRelation,
  calculateMotivationWeaknessSuggestionRelation
} from '../dataCalculator';
import { 
  interpretDemandGap,
  interpretMotivationLocation,
  interpretMotivationEmotion,
  interpretRnDPriority
} from '../AIInterpreter';
import { DrillDownData } from '../../types';

interface DemandInsightProps {
  data: PivotCalculatorInput;
  aiInsights?: any[]; // 后端生成的AI洞察
  onDrillDown?: (data: DrillDownData) => void;
}

export function DemandInsight({ data, aiInsights, onDrillDown }: DemandInsightProps) {
  const [error, setError] = useState<string | null>(null);
  const config = getModuleConfig('demand');
  
  // 计算动机-情感关系数据
  const motivationSentimentData = useMemo(() => {
    try {
      return calculateMotivationSentimentRelation(data);
    } catch (err) {
      console.error('计算动机-情感数据失败:', err);
      setError('数据计算失败');
      return { motivations: [], motivationSentiment: [] };
    }
  }, [data]);
  
  // 计算动机-地点关系数据
  const motivationLocationData = useMemo(() => {
    try {
      return calculateMotivationLocationRelation(data);
    } catch (err) {
      console.error('计算动机-地点数据失败:', err);
      return { motivations: [], locations: [], motivationLocationMap: {}, motivationLocationData: [] };
    }
  }, [data]);
  
  // 计算动机-情感标签关系数据
  const motivationEmotionData = useMemo(() => {
    try {
      return calculateMotivationEmotionRelation(data);
    } catch (err) {
      console.error('计算动机-情感标签数据失败:', err);
      return { motivations: [], emotions: [], motivationEmotionMap: {} };
    }
  }, [data]);
  
  // 准备热力图数据
  const heatmapData = useMemo(() => {
    const rows = motivationSentimentData.motivations;
    const columns = ['正面', '中性', '负面'];
    const matrixData = motivationSentimentData.motivationSentiment.map(m => [
      m.positive,
      m.neutral,
      m.negative,
    ]);
    
    return { rows, columns, data: matrixData };
  }, [motivationSentimentData]);
  
  // 生成 AI 解读（优先使用后端 AI 数据）
  const interpretation = useMemo(() => {
    const aiDemand = aiInsights?.find((insight: any) => insight.insight_type === 'demand_satisfaction');
    if (aiDemand?.interpretation) {
      return aiDemand.interpretation;
    }
    // 降级为本地计算
    return interpretDemandGap({
      motivationSentiment: motivationSentimentData.motivationSentiment,
    });
  }, [aiInsights, motivationSentimentData]);
  
  const locationInterpretation = useMemo(() => {
    const aiLocation = aiInsights?.find((insight: any) => insight.insight_type === 'motivation_location');
    if (aiLocation?.interpretation) {
      return aiLocation.interpretation;
    }
    // 降级为本地计算
    return interpretMotivationLocation({
      motivationLocationData: motivationLocationData.motivationLocationData,
    });
  }, [aiInsights, motivationLocationData]);
  
  const emotionInterpretation = useMemo(() => {
    const aiEmotion = aiInsights?.find((insight: any) => insight.insight_type === 'motivation_emotion');
    if (aiEmotion?.interpretation) {
      return aiEmotion.interpretation;
    }
    // 降级为本地计算
    return interpretMotivationEmotion({
      motivationEmotionMap: motivationEmotionData.motivationEmotionMap,
      motivations: motivationEmotionData.motivations,
      emotions: motivationEmotionData.emotions,
    });
  }, [aiInsights, motivationEmotionData]);
  
  // 计算动机-劣势-建议3D数据
  const motivation3DData = useMemo(() => {
    try {
      return calculateMotivationWeaknessSuggestionRelation(data);
    } catch (err) {
      console.error('计算动机-劣势-建议3D数据失败:', err);
      return { motivations: [], weaknesses: [], suggestions: [], slices: [] };
    }
  }, [data]);
  
  // 生成研发优先级 AI 解读
  const rndPriorityInterpretation = useMemo(() => {
    const aiRnD = aiInsights?.find((insight: any) => insight.insight_type === 'rnd_priority');
    if (aiRnD?.interpretation) {
      return aiRnD.interpretation;
    }
    // 降级为本地计算
    return interpretRnDPriority(motivation3DData);
  }, [aiInsights, motivation3DData]);
  
  const handleCellClick = (row: number, col: number) => {
    const motivation = heatmapData.rows[row];
    const sentiments = ['正面', '中性', '负面'];
    const sentiment = sentiments[col];
    
    // 这里可以触发下钻，找出对应的评论
    // 暂时省略实现
  };
  
  // 计算1D动机分布数据
  const motivationDistribution = useMemo(() => {
    const motivations = data.aggregated_themes?.why || [];
    return motivations.map((item: any) => ({
      label: item.label,
      count: item.count,
    })).sort((a: any, b: any) => b.count - a.count);
  }, [data.aggregated_themes]);
  
  const hasData = motivationSentimentData.motivations.length > 0 ||
                   motivationLocationData.motivations.length > 0 ||
                   motivationEmotionData.motivations.length > 0 ||
                   motivation3DData.slices.length > 0 ||
                   motivationDistribution.length > 0;
  
  return (
    <ModuleContainer 
      config={config}
      error={error}
      hasData={hasData}
      defaultExpanded={true}
    >
      {/* 2.0 动机分布概览 */}
      {motivationDistribution.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">2.0 动机分布概览</h4>
          <p className="text-sm text-gray-600 mb-4">用户购买动机排行</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="space-y-3">
              {motivationDistribution.slice(0, 8).map((item: any, idx: number) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 w-6">#{idx + 1}</span>
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </div>
                    <span className="text-sm font-medium text-green-700">{item.count}次</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden ml-8">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                      style={{ width: `${(item.count / motivationDistribution[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <InsightCard
            interpretation={{
              keyFindings: [
                `🎯 核心动机：${motivationDistribution[0]?.label}（${motivationDistribution[0]?.count}次提及）`,
                `动机多样性：发现${motivationDistribution.length}种不同购买动机`,
                motivationDistribution.length >= 5 
                  ? '✅ 产品满足多样化需求，市场广度大' 
                  : '⚠️ 需求集中，可考虑扩展使用场景'
              ],
              dataSupport: [
                {
                  metric: 'Top 3动机',
                  value: motivationDistribution.slice(0, 3).map((m: any) => m.label).join('、')
                },
                {
                  metric: '覆盖度',
                  value: `${motivationDistribution.length}种动机`
                }
              ],
              recommendations: [
                `主打「${motivationDistribution[0]?.label}」作为核心卖点`,
                '在不同渠道强调不同动机以覆盖更广受众',
                motivationDistribution.length < 3 ? '挖掘产品的更多使用场景和价值点' : '保持多元化的产品定位'
              ],
              severity: 'success' as const
            }}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 2.1 刚需场景分析（动机×地点） */}
      {motivationLocationData.motivations.length > 0 && motivationLocationData.locations.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">2.1 刚需场景分析</h4>
          <p className="text-sm text-gray-600 mb-4">动机 × 地点：识别高频高满意度场景</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={motivationLocationData.motivations}
              columns={motivationLocationData.locations}
              data={motivationLocationData.motivations.map(m => 
                motivationLocationData.locations.map(l => 
                  motivationLocationData.motivationLocationMap[m]?.[l] || 0
                )
              )}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={locationInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 2.2 需求满足度矩阵（动机×情感倾向） */}
      {heatmapData.rows.length > 0 && (
        <div className={motivationLocationData.motivations.length > 0 ? "pt-6 border-t-2 border-gray-200 mb-8" : "mb-8"}>
          <h4 className="text-base font-bold text-gray-900 mb-3">2.2 需求满足度矩阵</h4>
          <p className="text-sm text-gray-600 mb-4">不同购买动机的用户满意度分布</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={heatmapData.rows}
              columns={heatmapData.columns}
              data={heatmapData.data}
              onCellClick={handleCellClick}
              colorScheme="sentiment"
            />
          </div>
          
          <InsightCard
            interpretation={interpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 2.3 心智匹配分析（动机×情感标签） */}
      {motivationEmotionData.motivations.length > 0 && motivationEmotionData.emotions.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">2.3 心智匹配分析</h4>
          <p className="text-sm text-gray-600 mb-4">动机 × 情感标签：品牌定位验证</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <HeatmapChart
              rows={motivationEmotionData.motivations}
              columns={motivationEmotionData.emotions}
              data={motivationEmotionData.motivations.map(m => 
                motivationEmotionData.emotions.map(e => 
                  motivationEmotionData.motivationEmotionMap[m]?.[e] || 0
                )
              )}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={emotionInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 2.4 研发优先级（3D：动机×劣势×建议） */}
      {motivation3DData.slices.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">2.4 研发优先级 🚨</h4>
          <p className="text-sm text-gray-600 mb-4">动机 × 劣势 × 建议：核心痛点识别与改进路径</p>
          
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="text-red-600 text-sm font-bold">💡 3D分析</div>
              <div className="text-xs text-red-700">
                通过Tab切换不同购买动机，查看该动机下劣势问题与改进建议的对应关系
              </div>
            </div>
            
            <SlicedHeatmapChart
              slices={motivation3DData.slices}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={rndPriorityInterpretation}
            title="AI 解读"
          />
        </div>
      )}
    </ModuleContainer>
  );
}
