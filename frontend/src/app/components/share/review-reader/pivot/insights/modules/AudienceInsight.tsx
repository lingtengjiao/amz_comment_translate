/**
 * 人群洞察模块
 * 分析购买者、使用者及其关系
 */
import { useMemo, useState } from 'react';
import { PivotCalculatorInput } from '../../types';
import { SankeyChart } from '../../charts/SankeyChart';
import { GroupedBarChart } from '../../charts/GroupedBarChart';
import { SlicedHeatmapChart } from '../../charts/SlicedHeatmapChart';
import { InsightCard } from '../InsightCard';
import { ModuleContainer } from '../ModuleContainer';
import { getModuleConfig } from '../moduleConfig';
import { calculateBuyerUserRelation, calculateBuyerStrengthRelation, calculateBuyerUserMotivationRelation } from '../dataCalculator';
import { interpretAudienceDecision, interpretAudienceStrength, interpretDecisionLogicChain } from '../AIInterpreter';
import { DrillDownData } from '../../types';

interface AudienceInsightProps {
  data: PivotCalculatorInput;
  aiInsights?: any[]; // 后端生成的AI洞察
  onDrillDown?: (data: DrillDownData) => void;
}

export function AudienceInsight({ data, aiInsights, onDrillDown }: AudienceInsightProps) {
  const [error, setError] = useState<string | null>(null);
  const config = getModuleConfig('audience');
  
  // 计算购买者-使用者关系数据
  const buyerUserData = useMemo(() => {
    try {
      return calculateBuyerUserRelation(data);
    } catch (err) {
      console.error('计算购买者-使用者数据失败:', err);
      setError('数据计算失败');
      return { buyers: [], users: [], pairs: [] };
    }
  }, [data]);
  
  // 计算购买者-优势关系数据
  const buyerStrengthData = useMemo(() => {
    try {
      return calculateBuyerStrengthRelation(data);
    } catch (err) {
      console.error('计算购买者-优势数据失败:', err);
      return { buyers: [], strengths: [], buyerStrengthMap: {} };
    }
  }, [data]);
  
  // 生成桑基图数据（购买者 -> 使用者）
  const sankeyData = useMemo(() => {
    const nodes = [
      ...buyerUserData.buyers.map(b => ({ name: `购买者:${b}`, depth: 0 })),
      ...buyerUserData.users.map(u => ({ name: `使用者:${u}`, depth: 1 })),
    ];
    
    const links = buyerUserData.pairs
      .filter(p => p.count >= 2) // 过滤低频数据
      .map(p => ({
        source: `购买者:${p.buyer}`,
        target: `使用者:${p.user}`,
        value: p.count,
      }));
    
    return { nodes, links };
  }, [buyerUserData]);
  
  // 生成分组柱状图数据（购买者 -> 优势）
  const barChartData = useMemo(() => {
    return {
      categories: buyerStrengthData.strengths,
      series: buyerStrengthData.buyers.slice(0, 5).map((buyer, idx) => ({
        name: buyer,
        data: buyerStrengthData.strengths.map(s => buyerStrengthData.buyerStrengthMap[buyer]?.[s] || 0),
        color: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'][idx],
      })),
    };
  }, [buyerStrengthData]);
  
  // 生成 AI 解读（优先使用后端 AI 数据）
  const decisionInterpretation = useMemo(() => {
    const aiDecision = aiInsights?.find((insight: any) => insight.insight_type === 'decision_flow');
    if (aiDecision?.interpretation) {
      return aiDecision.interpretation;
    }
    // 降级为本地计算
    return interpretAudienceDecision({
      buyerUserPairs: buyerUserData.pairs,
      totalReviews: buyerUserData.totalReviews,
    });
  }, [aiInsights, buyerUserData]);
  
  const strengthInterpretation = useMemo(() => {
    const aiStrength = aiInsights?.find((insight: any) => insight.insight_type === 'audience_strength');
    if (aiStrength?.interpretation) {
      return aiStrength.interpretation;
    }
    // 降级为本地计算
    return interpretAudienceStrength({
      buyerStrengthMap: buyerStrengthData.buyerStrengthMap,
    });
  }, [aiInsights, buyerStrengthData]);
  
  // 计算购买者-使用者-动机3D数据
  const buyerUserMotivation3DData = useMemo(() => {
    try {
      return calculateBuyerUserMotivationRelation(data);
    } catch (err) {
      console.error('计算购买者-使用者-动机3D数据失败:', err);
      return { buyers: [], users: [], motivations: [], slices: [] };
    }
  }, [data]);
  
  // 生成决策逻辑链 AI 解读
  const decisionLogicInterpretation = useMemo(() => {
    const aiLogic = aiInsights?.find((insight: any) => insight.insight_type === 'decision_logic_chain');
    if (aiLogic?.interpretation) {
      return aiLogic.interpretation;
    }
    // 降级为本地计算
    return interpretDecisionLogicChain(buyerUserMotivation3DData);
  }, [aiInsights, buyerUserMotivation3DData]);
  
  // 计算1D人群分布数据
  const buyerDistribution = useMemo(() => {
    const buyers = data.aggregated_themes?.buyer || [];
    return buyers.map((item: any) => ({
      label: item.label,
      count: item.count,
      percentage: 0 // 后续计算
    })).sort((a: any, b: any) => b.count - a.count);
  }, [data.aggregated_themes]);
  
  const userDistribution = useMemo(() => {
    const users = data.aggregated_themes?.user || [];
    return users.map((item: any) => ({
      label: item.label,
      count: item.count,
      percentage: 0
    })).sort((a: any, b: any) => b.count - a.count);
  }, [data.aggregated_themes]);
  
  const hasData = buyerUserData.pairs.length > 0 || buyerStrengthData.buyers.length > 0 || buyerUserMotivation3DData.slices.length > 0 || buyerDistribution.length > 0;
  
  return (
    <ModuleContainer 
      config={config}
      error={error}
      hasData={hasData}
      defaultExpanded={true}
    >
      {/* 1.0 人群分布概览 */}
      {(buyerDistribution.length > 0 || userDistribution.length > 0) && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">1.0 人群分布概览</h4>
          <p className="text-sm text-gray-600 mb-4">核心用户群体构成</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 购买者分布 */}
            {buyerDistribution.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">👤 购买者分布</h5>
                <div className="space-y-3">
                  {buyerDistribution.slice(0, 5).map((item: any, idx: number) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{item.label}</span>
                        <span className="text-sm font-medium text-gray-900">{item.count}次</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                          style={{ width: `${(item.count / buyerDistribution[0].count) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 使用者分布 */}
            {userDistribution.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">👥 使用者分布</h5>
                <div className="space-y-3">
                  {userDistribution.slice(0, 5).map((item: any, idx: number) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{item.label}</span>
                        <span className="text-sm font-medium text-gray-900">{item.count}次</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full"
                          style={{ width: `${(item.count / userDistribution[0].count) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <InsightCard
            interpretation={{
              keyFindings: [
                `主要购买者：${buyerDistribution[0]?.label || '-'}（${buyerDistribution[0]?.count || 0}次提及）`,
                `主要使用者：${userDistribution[0]?.label || '-'}（${userDistribution[0]?.count || 0}次提及）`,
                buyerDistribution[0]?.label === userDistribution[0]?.label 
                  ? '✅ 购买者=使用者，为自用场景' 
                  : '🎁 购买者≠使用者，存在礼品/代购场景'
              ],
              dataSupport: `基于${data.reviews?.length || 0}条评论分析`,
              recommendations: [
                '针对主要人群定制营销素材',
                buyerDistribution[0]?.label !== userDistribution[0]?.label 
                  ? '优化礼品包装和赠送体验' 
                  : '强化自用场景的产品价值'
              ],
              severity: 'info' as const
            }}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 1.1 决策链路分析 */}
      {buyerUserData.pairs.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">1.1 决策链路分析</h4>
          <p className="text-sm text-gray-600 mb-4">谁买？给谁用？</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <SankeyChart
              nodes={sankeyData.nodes}
              links={sankeyData.links}
            />
          </div>
          
          <InsightCard
            interpretation={decisionInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 1.2 人群-卖点匹配 */}
      {barChartData.series.length > 0 && barChartData.categories.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">1.2 人群-卖点匹配分析</h4>
          <p className="text-sm text-gray-600 mb-4">不同购买者群体最关注的产品优势</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <GroupedBarChart
              categories={barChartData.categories}
              series={barChartData.series}
            />
          </div>
          
          <InsightCard
            interpretation={strengthInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 1.3 决策逻辑链（3D：购买者×使用者×动机） */}
      {buyerUserMotivation3DData.slices.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">1.3 决策逻辑链 🎯</h4>
          <p className="text-sm text-gray-600 mb-4">购买者 × 使用者 × 动机：完整还原购买决策路径</p>
          
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="text-blue-600 text-sm font-bold">💡 3D分析</div>
              <div className="text-xs text-blue-700">
                通过Tab切换不同购买者，查看该购买者为不同使用者购买的动机分布
              </div>
            </div>
            
            <SlicedHeatmapChart
              slices={buyerUserMotivation3DData.slices}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={decisionLogicInterpretation}
            title="AI 解读"
          />
        </div>
      )}
    </ModuleContainer>
  );
}
