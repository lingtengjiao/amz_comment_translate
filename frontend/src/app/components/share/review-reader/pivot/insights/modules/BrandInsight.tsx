/**
 * 品牌洞察模块
 * 分析品牌心智和推荐意愿
 */
import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { PivotCalculatorInput } from '../../types';
import { SlicedHeatmapChart } from '../../charts/SlicedHeatmapChart';
import { InsightCard } from '../InsightCard';
import { ModuleContainer } from '../ModuleContainer';
import { getModuleConfig } from '../moduleConfig';
import { calculateStrengthScenarioEmotionRelation } from '../dataCalculator';
import { interpretBrandMemory } from '../AIInterpreter';
import { DrillDownData } from '../../types';

interface BrandInsightProps {
  data: PivotCalculatorInput;
  aiInsights?: any[]; // 后端生成的AI洞察
  onDrillDown?: (data: DrillDownData) => void;
}

export function BrandInsight({ data, aiInsights, onDrillDown }: BrandInsightProps) {
  const [error, setError] = useState<string | null>(null);
  const config = getModuleConfig('brand');
  
  // 计算评分分布和推荐意愿
  const ratingStats = useMemo(() => {
    try {
      const reviews = data.reviews || [];
      const ratingDist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let totalRating = 0;
      
      reviews.forEach((review: any) => {
        const rating = review.rating || 3;
        ratingDist[rating] = (ratingDist[rating] || 0) + 1;
        totalRating += rating;
      });
      
      const avgRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(2) : '0';
      const recommendationRate = reviews.length > 0
        ? (((ratingDist[5] + ratingDist[4]) / reviews.length) * 100).toFixed(1)
        : '0';
      
      return {
        distribution: ratingDist,
        avgRating,
        recommendationRate,
        totalReviews: reviews.length,
      };
    } catch (err) {
      console.error('计算评分统计失败:', err);
      setError('数据计算失败');
      return {
        distribution: {},
        avgRating: '0',
        recommendationRate: '0',
        totalReviews: 0,
      };
    }
  }, [data]);
  
  // 计算品牌心智（核心优势）
  const brandMind = useMemo(() => {
    try {
      const insights = data.aggregated_insights || {};
      const strengths = insights.strengths || [];
      
      // 按维度统计优势提及次数
      const dimensionCount: Record<string, number> = {};
      strengths.forEach((strength: any) => {
        const dim = strength.dimension || '其他';
        dimensionCount[dim] = (dimensionCount[dim] || 0) + 1;
      });
      
      // 转换为数组并排序
      const topStrengths = Object.entries(dimensionCount)
        .map(([dimension, count]) => ({ dimension, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      return topStrengths;
    } catch (err) {
      console.error('计算品牌心智失败:', err);
      return [];
    }
  }, [data]);
  
  // 计算产品优势-场景-情感3D数据
  const strength3DData = useMemo(() => {
    try {
      return calculateStrengthScenarioEmotionRelation(data);
    } catch (err) {
      console.error('计算优势-场景-情感3D数据失败:', err);
      return { strengths: [], scenarios: [], emotions: [], slices: [] };
    }
  }, [data]);
  
  // 生成品牌记忆点 AI 解读
  const brandMemoryInterpretation = useMemo(() => {
    const aiBrandMemory = aiInsights?.find((insight: any) => insight.insight_type === 'brand_memory');
    if (aiBrandMemory?.interpretation) {
      return aiBrandMemory.interpretation;
    }
    // 降级为本地计算
    return interpretBrandMemory(strength3DData);
  }, [aiInsights, strength3DData]);
  
  // 计算1D情感分布数据
  const emotionDistribution = useMemo(() => {
    const emotions = data.aggregated_themes?.emotion || [];
    return emotions.map((item: any) => ({
      label: item.label,
      count: item.count,
    })).sort((a: any, b: any) => b.count - a.count);
  }, [data.aggregated_themes]);
  
  const hasData = ratingStats.totalReviews > 0 || strength3DData.slices.length > 0 || emotionDistribution.length > 0;
  
  return (
    <ModuleContainer 
      config={config}
      error={error}
      hasData={hasData}
      defaultExpanded={true}
    >
      {/* 5.0 情感分布概览 */}
      {emotionDistribution.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">5.0 情感分布概览</h4>
          <p className="text-sm text-gray-600 mb-4">用户情感标签分布</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {emotionDistribution.slice(0, 6).map((item: any, idx: number) => {
                const isPositive = ['喜爱', '满意', '安心', '愉悦', '骄傲', '兴奋', '开心'].some(e => item.label.includes(e));
                const isNegative = ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧'].some(e => item.label.includes(e));
                
                const bgClass = isPositive ? 'bg-green-50 border-green-200' : isNegative ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
                const textClass = isPositive ? 'text-green-700' : isNegative ? 'text-red-700' : 'text-gray-700';
                const countClass = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-600';
                
                return (
                  <div key={idx} className={`${bgClass} border rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${textClass}`}>{item.label}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`text-2xl font-bold ${countClass}`}>{item.count}</div>
                      <div className="text-xs text-gray-500">次</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <InsightCard
            interpretation={{
              keyFindings: [
                `💖 核心情感：${emotionDistribution[0]?.label}（${emotionDistribution[0]?.count}次提及）`,
                `情感多样性：识别到${emotionDistribution.length}种不同情感`,
                (() => {
                  const positiveCount = emotionDistribution.filter((e: any) => 
                    ['喜爱', '满意', '安心', '愉悦', '骄傲', '兴奋', '开心'].some(pos => e.label.includes(pos))
                  ).reduce((sum: number, e: any) => sum + e.count, 0);
                  const negativeCount = emotionDistribution.filter((e: any) => 
                    ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧'].some(neg => e.label.includes(neg))
                  ).reduce((sum: number, e: any) => sum + e.count, 0);
                  
                  if (positiveCount > negativeCount * 2) {
                    return '✅ 正面情感占主导，品牌口碑良好';
                  } else if (positiveCount > negativeCount) {
                    return '⚖️ 正面情感略多，仍有改进空间';
                  } else {
                    return '⚠️ 负面情感较多，需要重点关注';
                  }
                })()
              ],
              dataSupport: [
                {
                  metric: 'Top 3情感',
                  value: emotionDistribution.slice(0, 3).map((e: any) => e.label).join('、')
                },
                {
                  metric: '情感类型',
                  value: `${emotionDistribution.length}种`
                }
              ],
              recommendations: [
                `将「${emotionDistribution[0]?.label}」作为品牌情感定位`,
                '在营销中强化正面情感的表达',
                emotionDistribution.some((e: any) => ['失望', '愤怒', '焦虑'].some(neg => e.label.includes(neg))) 
                  ? '针对负面情感提供解决方案' 
                  : '维持良好的品牌情感体验',
              ],
              severity: 'info' as const
            }}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 5.1 品牌记忆点（3D：优势×场景×情感） */}
      {strength3DData.slices.length > 0 && (
        <div className="mb-8">
          <h4 className="text-base font-bold text-gray-900 mb-3">5.1 品牌记忆点 ⭐</h4>
          <p className="text-sm text-gray-600 mb-4">产品优势 × 使用场景 × 情感标签：识别品牌溢价空间</p>
          
          <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="text-pink-600 text-sm font-bold">💡 3D分析</div>
              <div className="text-xs text-pink-700">
                通过Tab切换不同产品优势，查看该优势在不同场景下触发的用户情感分布
              </div>
            </div>
            
            <SlicedHeatmapChart
              slices={strength3DData.slices}
              colorScheme="frequency"
            />
          </div>
          
          <InsightCard
            interpretation={brandMemoryInterpretation}
            title="AI 解读"
          />
        </div>
      )}
      
      {/* 5.2 用户推荐意愿 */}
      <div className={strength3DData.slices.length > 0 ? "pt-6 border-t-2 border-gray-200 mb-8" : "mb-8"}>
        <h4 className="text-base font-bold text-gray-900 mb-3">5.2 用户推荐意愿</h4>
        <p className="text-sm text-gray-600 mb-4">评分分布和推荐率分析</p>
        
        {/* 关键指标卡片 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-green-700">{ratingStats.avgRating}</div>
            <div className="text-sm text-green-600 mt-2 flex items-center justify-center gap-1">
              <Star className="h-4 w-4 fill-green-600" />
              平均评分
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-blue-700">{ratingStats.recommendationRate}%</div>
            <div className="text-sm text-blue-600 mt-2">推荐率</div>
          </div>
        </div>
        
        {/* 评分分布详情 */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-3">📊 评分分布详情</h5>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingStats.distribution[rating] || 0;
              const percentage = ratingStats.totalReviews > 0 
                ? ((count / ratingStats.totalReviews) * 100).toFixed(1) 
                : '0';
              
              return (
                <div key={rating}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: rating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        ))}
                      </div>
                      <span className="text-sm text-gray-700">{rating}星</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{percentage}%</span>
                      <span className="text-sm font-medium text-gray-700">{count}条</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        rating >= 4
                          ? 'bg-gradient-to-r from-green-500 to-green-600'
                          : rating === 3
                          ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                          : 'bg-gradient-to-r from-red-500 to-red-600'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <InsightCard
          interpretation={
            aiInsights?.find((i: any) => i.insight_type === 'recommendation_willingness')?.interpretation || {
              keyFindings: [
                `推荐率：${ratingStats.recommendationRate}%（4-5星好评）`,
                `平均评分：${ratingStats.avgRating} / 5.0`,
                `${parseFloat(ratingStats.recommendationRate) >= 80 ? '用户满意度高，品牌口碑良好' : '存在改进空间，需提升用户体验'}`,
              ],
              dataSupport: `基于${ratingStats.totalReviews}条评论分析`,
              recommendations: [
                parseFloat(ratingStats.recommendationRate) >= 80
                  ? '维持高满意度，强化用户推荐激励'
                  : '优先解决负面反馈，提升产品质量',
                '在营销中突出高分评价和用户见证',
              ],
              severity: parseFloat(ratingStats.recommendationRate) >= 80 ? 'normal' : 'warning',
            }
          }
          title="AI 解读"
        />
      </div>
      
      {/* 5.3 品牌核心心智 */}
      {brandMind.length > 0 && (
        <div className="pt-6 border-t-2 border-gray-200">
          <h4 className="text-base font-bold text-gray-900 mb-3">5.3 品牌核心心智</h4>
          <p className="text-sm text-gray-600 mb-4">用户认知中的核心优势维度</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="space-y-4">
              {brandMind.map((item, idx) => {
                const percentage = ((item.count / (brandMind[0]?.count || 1)) * 100).toFixed(0);
                return (
                  <div key={idx} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-sm">
                          <span className="text-base font-bold text-white">#{idx + 1}</span>
                        </div>
                        <span className="text-base font-semibold text-gray-800">{item.dimension}</span>
                      </div>
                      <span className="text-sm font-medium text-pink-600">{item.count}次</span>
                    </div>
                    <div className="ml-13 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 to-rose-600 rounded-full relative"
                        style={{ width: `${percentage}%` }}
                      >
                        {parseInt(percentage) >= 20 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white font-medium">
                            {percentage}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <InsightCard
            interpretation={
              aiInsights?.find((i: any) => i.insight_type === 'brand_mind')?.interpretation || {
                keyFindings: [
                  `💎 核心优势：${brandMind[0]?.dimension}（${brandMind[0]?.count}次提及）`,
                  `🎯 差异化特征：${brandMind.slice(0, 3).map(b => b.dimension).join('、')}`,
                  brandMind.length >= 5 ? '✅ 品牌心智丰富，多维度领先' : '⚠️ 核心优势集中，可考虑拓展更多维度'
                ],
                dataSupport: [
                  {
                    metric: '核心维度',
                    value: `${brandMind.length}个`
                  },
                  {
                    metric: 'Top 3优势',
                    value: brandMind.slice(0, 3).map(b => b.dimension).join('、')
                  }
                ],
                recommendations: [
                  `在品牌传播中强化「${brandMind[0]?.dimension}」核心认知`,
                  '将核心心智融入产品卖点和广告文案',
                  '在A+页面、主图视频中突出Top 3优势维度',
                  brandMind.length < 3 ? '挖掘产品更多差异化优势点' : '保持多维度优势，构建品牌护城河'
                ],
                severity: 'success' as const
              }
            }
            title="AI 解读"
          />
        </div>
      )}
    </ModuleContainer>
  );
}
