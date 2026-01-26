/**
 * AI 解读生成器 - 规则引擎
 * 基于数据自动生成洞察解读
 */
import { Interpretation } from './types';

/**
 * 生成人群洞察 - 决策链路分析
 */
export function interpretAudienceDecision(data: {
  buyerUserPairs: Array<{ buyer: string; user: string; count: number; percent: number }>;
  totalReviews: number;
}): Interpretation {
  const { buyerUserPairs, totalReviews } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!buyerUserPairs || buyerUserPairs.length === 0 || totalReviews === 0) {
    keyFindings.push('暂无足够的购买者和使用者数据进行分析');
    recommendations.push('请确保评论中包含购买者(Buyer)和使用者(User)的标签信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 排序找出最主要的模式
  const sorted = [...buyerUserPairs].sort((a, b) => b.count - a.count);
  const topPattern = sorted[0];
  
  // 判断是否自用为主
  const selfUseCount = buyerUserPairs
    .filter(p => p.buyer === p.user)
    .reduce((sum, p) => sum + p.count, 0);
  const selfUsePercent = (selfUseCount / totalReviews) * 100;
  
  if (selfUsePercent >= 70) {
    keyFindings.push(`自用为主：${selfUsePercent.toFixed(1)}% 的购买者自己使用产品`);
    recommendations.push('产品文案应直接打痛点，强调功能性和个人价值实现');
    recommendations.push('广告投放可聚焦"解决方案"类关键词');
    severity = 'success';
  } else {
    keyFindings.push(`送礼场景明显：${(100 - selfUsePercent).toFixed(1)}% 的购买者为他人购买`);
    keyFindings.push(`主要模式是「${topPattern.buyer}」买给「${topPattern.user}」，占比 ${topPattern.percent.toFixed(1)}%`);
    recommendations.push('营销内容需要分裂：解决购买者的焦虑/礼物属性，产品设计满足使用者的易用性');
    recommendations.push('在亚马逊广告中突出"礼物推荐"、"送礼佳品"等标签');
    severity = 'warning';
  }
  
  dataSupport.push({
    metric: '主要购买模式',
    value: `${topPattern.buyer} → ${topPattern.user} (${topPattern.count} 条评论)`,
  });
  
  dataSupport.push({
    metric: '自用比例',
    value: `${selfUsePercent.toFixed(1)}%`,
  });
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成人群洞察 - 人群卖点匹配
 */
export function interpretAudienceStrength(data: {
  buyerStrengthMap: Record<string, Record<string, number>>;
}): Interpretation {
  const { buyerStrengthMap } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  
  // 检查数据是否为空
  if (!buyerStrengthMap || Object.keys(buyerStrengthMap).length === 0) {
    keyFindings.push('暂无足够的购买者和产品优势数据进行分析');
    recommendations.push('请确保评论中包含购买者(Buyer)和产品优势的信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 分析每个购买者群体最关注的优势
  Object.entries(buyerStrengthMap).forEach(([buyer, strengths]) => {
    const sortedStrengths = Object.entries(strengths)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 0) // 过滤掉 0 计数
      .slice(0, 2);
    
    if (sortedStrengths.length > 0) {
      const topStrength = sortedStrengths[0];
      keyFindings.push(`「${buyer}」最关注「${topStrength[0]}」，提及 ${topStrength[1]} 次`);
      
      if (sortedStrengths.length > 1) {
        dataSupport.push({
          metric: `${buyer}关注点`,
          value: `${topStrength[0]} (${topStrength[1]}次) > ${sortedStrengths[1][0]} (${sortedStrengths[1][1]}次)`,
        });
      }
    }
  });
  
  if (keyFindings.length === 0) {
    keyFindings.push('暂无明显的购买者-优势匹配模式');
  }
  
  recommendations.push('针对不同人群定制广告素材：突出他们最关注的产品优势');
  recommendations.push('在Listing标题中平衡不同人群的关注点');
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity: 'success',
  };
}

/**
 * 生成需求洞察 - 期望落差分析
 */
export function interpretDemandGap(data: {
  motivationSentiment: Array<{
    motivation: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  }>;
}): Interpretation {
  const { motivationSentiment } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!motivationSentiment || motivationSentiment.length === 0) {
    keyFindings.push('暂无足够的购买动机和情感数据进行分析');
    recommendations.push('请确保评论中包含购买动机(Why)和情感倾向的信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出满意度最高和最低的动机
  const analyzed = motivationSentiment.map(m => ({
    ...m,
    positivePercent: m.total > 0 ? (m.positive / m.total) * 100 : 0,
    negativePercent: m.total > 0 ? (m.negative / m.total) * 100 : 0,
  })).filter(m => m.total > 0); // 过滤掉没有数据的项
  
  if (analyzed.length === 0) {
    keyFindings.push('暂无有效的动机-情感分析数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  const mostSatisfied = analyzed.sort((a, b) => b.positivePercent - a.positivePercent)[0];
  const leastSatisfied = analyzed.sort((a, b) => b.negativePercent - a.negativePercent)[0];
  
  if (mostSatisfied) {
    keyFindings.push(
      `超预期惊喜：带着「${mostSatisfied.motivation}」动机购买的用户，${mostSatisfied.positivePercent.toFixed(1)}% 表达正面情感`
    );
    recommendations.push(`将「${mostSatisfied.motivation}」作为口碑营销的核心素材`);
  }
  
  if (leastSatisfied && leastSatisfied.negativePercent >= 30) {
    keyFindings.push(
      `⚠️ 期望落差严重：「${leastSatisfied.motivation}」动机的用户，${leastSatisfied.negativePercent.toFixed(1)}% 表达负面情感`
    );
    recommendations.push(`核心功能需要改进，或调整营销话术避免过度承诺`);
    severity = 'error';
  }
  
  dataSupport.push({
    metric: '最满意动机',
    value: `${mostSatisfied.motivation} (${mostSatisfied.positivePercent.toFixed(1)}% 正面)`,
  });
  
  if (leastSatisfied) {
    dataSupport.push({
      metric: '最不满意动机',
      value: `${leastSatisfied.motivation} (${leastSatisfied.negativePercent.toFixed(1)}% 负面)`,
    });
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 致命缺陷识别
 */
export function interpretCriticalWeakness(data: {
  weaknessSentiment: Array<{
    weakness: string;
    negative: number;
    total: number;
    negativePercent: number;
  }>;
}): Interpretation {
  const { weaknessSentiment } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!weaknessSentiment || weaknessSentiment.length === 0) {
    keyFindings.push('暂无产品劣势数据进行分析');
    recommendations.push('这可能说明产品表现良好，或者需要更多评论数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出导致强烈负面情感的劣势
  const critical = weaknessSentiment.filter(w => w.negativePercent >= 60 && w.total >= 5);
  const tolerable = weaknessSentiment.filter(w => w.negativePercent < 40);
  
  if (critical.length > 0) {
    severity = 'error';
    critical.forEach(w => {
      keyFindings.push(`🚨 致命缺陷：「${w.weakness}」导致 ${w.negativePercent.toFixed(1)}% 负面情感 (${w.negative}/${w.total})`);
      dataSupport.push({
        metric: `致命缺陷`,
        value: `${w.weakness} - ${w.negative} 条差评`,
      });
    });
    recommendations.push('这是产品改进的最高优先级，直接影响用户满意度和评分');
    recommendations.push('考虑在下一版本中优先解决这些问题');
  } else {
    severity = 'success';
    keyFindings.push('未发现致命缺陷，产品整体表现良好');
  }
  
  if (tolerable.length > 0) {
    keyFindings.push(`可接受的劣势：${tolerable.map(t => t.weakness).join('、')} 未引起强烈负面情感`);
    recommendations.push('这些是次要矛盾，可以在营销中坦诚告知，反而增加可信度');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 核心竞争力
 */
export function interpretCoreStrength(data: {
  strengthEmotion: Array<{
    strength: string;
    emotions: Record<string, number>;
    total: number;
  }>;
}): Interpretation {
  const { strengthEmotion } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  
  // 检查数据是否为空
  if (!strengthEmotion || strengthEmotion.length === 0) {
    keyFindings.push('暂无产品优势和情感数据进行分析');
    recommendations.push('请确保评论中包含产品优势和情感标签信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出触发最强烈正面情感的优势
  const topStrength = strengthEmotion
    .filter(s => s.total > 0) // 过滤掉没有数据的项
    .map(s => ({
      strength: s.strength,
      total: s.total,
      topEmotion: Object.entries(s.emotions).sort((a, b) => b[1] - a[1])[0],
    }))
    .sort((a, b) => b.total - a.total)[0];
  
  if (topStrength) {
    keyFindings.push(
      `核心竞争力是「${topStrength.strength}」，共有 ${topStrength.total} 条正面评价`
    );
    
    if (topStrength.topEmotion) {
      keyFindings.push(
        `最能触发「${topStrength.topEmotion[0]}」情感 (${topStrength.topEmotion[1]} 次提及)`
      );
      
      dataSupport.push({
        metric: '核心优势',
        value: `${topStrength.strength}`,
      });
      
      dataSupport.push({
        metric: '情感触发',
        value: `${topStrength.topEmotion[0]} (${topStrength.topEmotion[1]} 次)`,
      });
      
      recommendations.push(`这是你的品牌溢价关键点，在所有营销物料中都应突出「${topStrength.strength}」`);
      recommendations.push(`文案应围绕「${topStrength.topEmotion[0]}」情感展开，不要只列功能参数`);
      recommendations.push(`在 A+ 页面和主图视频中，重点展示这个优势带来的用户情感体验`);
    }
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity: 'success',
  };
}

/**
 * 生成场景洞察 - 高频与长尾场景
 */
export function interpretScenarioDistribution(data: {
  whenScenario: Array<{
    when: string;
    scenarios: Record<string, number>;
    total: number;
  }>;
  totalReviews: number;
}): Interpretation {
  const { whenScenario, totalReviews } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!whenScenario || whenScenario.length === 0 || totalReviews === 0) {
    keyFindings.push('暂无使用场景数据进行分析');
    recommendations.push('请确保评论中包含使用时机(When)和场景信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出高频时机和场景
  const sorted = [...whenScenario].filter(w => w.total > 0).sort((a, b) => b.total - a.total);
  const topWhen = sorted[0];
  
  if (!topWhen) {
    keyFindings.push('暂无有效的场景分布数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  if (topWhen) {
    const topScenario = Object.entries(topWhen.scenarios).sort((a, b) => b[1] - a[1])[0];
    const percent = (topWhen.total / totalReviews) * 100;
    
    keyFindings.push(
      `高频场景：「${topWhen.when} + ${topScenario[0]}」，占比 ${percent.toFixed(1)}%`
    );
    
    dataSupport.push({
      metric: '主力场景',
      value: `${topWhen.when} - ${topScenario[0]} (${topScenario[1]} 次)`,
    });
    
    if (percent >= 50) {
      severity = 'warning';
      keyFindings.push('⚠️ 场景过于集中，可能错失其他细分市场');
      recommendations.push('考虑开发针对长尾场景的差异化版本或营销策略');
    } else {
      severity = 'success';
      keyFindings.push('场景分布较为均衡，产品适用性广');
      recommendations.push('在不同场景下都有用户基础，可以多场景营销');
    }
    
    recommendations.push(`在主图和视频中重点展示「${topWhen.when} - ${topScenario[0]}」这个高频场景`);
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成品牌洞察 - 营销心智验证
 */
export function interpretBrandMind(data: {
  motivationEmotion: Array<{
    motivation: string;
    emotions: Record<string, number>;
    total: number;
  }>;
  targetEmotion?: string; // 用户期望打造的品牌情感
}): Interpretation {
  const { motivationEmotion, targetEmotion } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!motivationEmotion || motivationEmotion.length === 0) {
    keyFindings.push('暂无动机和情感数据进行品牌心智分析');
    recommendations.push('请确保评论中包含购买动机(Why)和情感标签信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 统计所有情感标签的总频次
  const emotionTotals: Record<string, number> = {};
  motivationEmotion.forEach(m => {
    if (m.emotions) {
      Object.entries(m.emotions).forEach(([emotion, count]) => {
        emotionTotals[emotion] = (emotionTotals[emotion] || 0) + count;
      });
    }
  });
  
  if (Object.keys(emotionTotals).length === 0) {
    keyFindings.push('暂无情感标签数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  const topEmotions = Object.entries(emotionTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  keyFindings.push(
    `用户对品牌的实际感知：${topEmotions.map(e => `「${e[0]}」(${e[1]}次)`).join(' > ')}`
  );
  
  topEmotions.forEach(([emotion, count], idx) => {
    dataSupport.push({
      metric: `Top ${idx + 1} 情感`,
      value: `${emotion} (${count} 次提及)`,
    });
  });
  
  if (targetEmotion) {
    const targetCount = emotionTotals[targetEmotion] || 0;
    const targetRank = topEmotions.findIndex(e => e[0] === targetEmotion);
    
    if (targetRank === 0) {
      severity = 'success';
      keyFindings.push(`✅ 品牌心智匹配：「${targetEmotion}」是用户的主要感知`);
      recommendations.push('现有营销策略有效，继续强化这个品牌联想');
    } else if (targetCount > 0) {
      severity = 'warning';
      keyFindings.push(
        `⚠️ 品牌心智偏离：期望的「${targetEmotion}」仅排名第 ${targetRank + 1}`
      );
      recommendations.push('需要调整营销话术，或重新审视品牌定位是否符合产品实际');
    } else {
      severity = 'error';
      keyFindings.push(`🚨 品牌心智缺失：用户完全未感知到「${targetEmotion}」`);
      recommendations.push('当前产品特性无法支撑这个品牌定位，需要产品层面的改进');
    }
  } else {
    recommendations.push(`建议将「${topEmotions[0][0]}」作为核心品牌联想进行传播`);
    recommendations.push('在所有触点（主图、A+、视频、评价回复）中强化这个情感');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 改进优先级
 */
export function interpretImprovementPriority(data: {
  whereSuggestion: Array<{
    location: string;
    suggestions: Record<string, number>;
    total: number;
  }>;
}): Interpretation {
  const { whereSuggestion } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  
  // 分析不同地点的改进建议
  whereSuggestion.forEach(loc => {
    const topSuggestions = Object.entries(loc.suggestions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    
    if (topSuggestions.length > 0) {
      keyFindings.push(
        `「${loc.location}」场景：用户主要希望改进「${topSuggestions[0][0]}」(${topSuggestions[0][1]}次)`
      );
      
      dataSupport.push({
        metric: `${loc.location} 改进需求`,
        value: topSuggestions.map(s => `${s[0]} (${s[1]}次)`).join(', '),
      });
    }
  });
  
  // 给出研发建议
  const outdoorLoc = whereSuggestion.find(l => ['户外', '室外', '外出'].some(kw => l.location.includes(kw)));
  const indoorLoc = whereSuggestion.find(l => ['居家', '室内', '卧室', '客厅'].some(kw => l.location.includes(kw)));
  
  if (outdoorLoc) {
    recommendations.push('户外场景建议：重点改进「续航、防水、便携」等特性');
  }
  
  if (indoorLoc) {
    recommendations.push('居家场景建议：重点改进「静音、外观配色、收纳」等特性');
  }
  
  recommendations.push('下一代产品可考虑推出场景化版本（轻薄版/静音版/户外版）');
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity: 'info',
  };
}

/**
 * 生成需求洞察 - 刚需场景分析（动机×地点）
 */
export function interpretMotivationLocation(data: {
  motivationLocationData: Array<{
    motivation: string;
    locationScores: Record<string, { count: number; avgRating: number }>;
  }>;
}): Interpretation {
  const { motivationLocationData } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!motivationLocationData || motivationLocationData.length === 0) {
    keyFindings.push('暂无足够的动机和地点数据进行分析');
    recommendations.push('请确保评论中包含购买动机(Why)和使用地点(Where)的信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出高评分且高频次的"刚需场景"
  const rigidDemands: Array<{ motivation: string; location: string; count: number; rating: number }> = [];
  
  motivationLocationData.forEach(m => {
    Object.entries(m.locationScores).forEach(([location, score]) => {
      if (score.count >= 3 && score.avgRating >= 4.0) {
        rigidDemands.push({
          motivation: m.motivation,
          location,
          count: score.count,
          rating: score.avgRating,
        });
      }
    });
  });
  
  // 按评分和频次排序
  rigidDemands.sort((a, b) => {
    const scoreA = a.rating * a.count;
    const scoreB = b.rating * b.count;
    return scoreB - scoreA;
  });
  
  if (rigidDemands.length > 0) {
    severity = 'success';
    const topDemand = rigidDemands[0];
    
    keyFindings.push(
      `🎯 核心刚需场景：「${topDemand.motivation} × ${topDemand.location}」`
    );
    
    keyFindings.push(
      `该场景用户满意度高达 ${topDemand.rating.toFixed(1)}⭐，且有 ${topDemand.count} 条评论提及`
    );
    
    dataSupport.push({
      metric: '刚需场景',
      value: `${topDemand.motivation} @ ${topDemand.location}`,
    });
    
    dataSupport.push({
      metric: '场景评分',
      value: `${topDemand.rating.toFixed(1)}⭐ (${topDemand.count} 条评论)`,
    });
    
    recommendations.push(`这是产品的"黄金使用场景"，应该在所有营销物料中重点突出`);
    recommendations.push(`在广告投放中，优先选择与「${topDemand.location}」相关的场景关键词`);
    recommendations.push(`主图和A+页面应该展示「${topDemand.motivation}」动机下的「${topDemand.location}」使用场景`);
    
    // 列出其他刚需场景
    if (rigidDemands.length > 1) {
      const others = rigidDemands.slice(1, 3).map(d => `${d.motivation} × ${d.location}`).join('、');
      keyFindings.push(`其他刚需场景：${others}`);
      recommendations.push('可以针对不同刚需场景开发差异化的营销素材');
    }
  } else {
    severity = 'warning';
    keyFindings.push('⚠️ 未发现明显的刚需场景（高评分+高频次）');
    recommendations.push('产品可能缺乏明确的核心使用场景，建议收集更多用户反馈');
    recommendations.push('或者考虑重新定义产品定位，找到更精准的目标场景');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成需求洞察 - 心智匹配分析（动机×情感标签）
 */
export function interpretMotivationEmotion(data: {
  motivationEmotionMap: Record<string, Record<string, number>>;
  motivations: string[];
  emotions: string[];
}): Interpretation {
  const { motivationEmotionMap, motivations, emotions } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!motivationEmotionMap || Object.keys(motivationEmotionMap).length === 0) {
    keyFindings.push('暂无足够的动机和情感标签数据进行分析');
    recommendations.push('请确保评论中包含购买动机(Why)和情感标签(Emotion)的信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 分析每个动机触发的主要情感
  const motivationEmotionPairs: Array<{
    motivation: string;
    topEmotion: string;
    count: number;
    total: number;
  }> = [];
  
  motivations.forEach(motivation => {
    const emotionCounts = motivationEmotionMap[motivation];
    if (!emotionCounts) return;
    
    const total = Object.values(emotionCounts).reduce((sum, c) => sum + c, 0);
    if (total === 0) return;
    
    const sortedEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 0);
    
    if (sortedEmotions.length > 0) {
      motivationEmotionPairs.push({
        motivation,
        topEmotion: sortedEmotions[0][0],
        count: sortedEmotions[0][1],
        total,
      });
    }
  });
  
  if (motivationEmotionPairs.length === 0) {
    keyFindings.push('暂无有效的动机-情感匹配数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 按总频次排序，找出主要模式
  motivationEmotionPairs.sort((a, b) => b.total - a.total);
  const topPair = motivationEmotionPairs[0];
  
  severity = 'success';
  keyFindings.push(
    `💡 核心心智：「${topPair.motivation}」动机的用户主要感受到「${topPair.topEmotion}」情感`
  );
  
  keyFindings.push(
    `该情感在 ${topPair.total} 条评论中出现 ${topPair.count} 次，占比 ${((topPair.count / topPair.total) * 100).toFixed(1)}%`
  );
  
  dataSupport.push({
    metric: '核心动机-情感',
    value: `${topPair.motivation} → ${topPair.topEmotion}`,
  });
  
  dataSupport.push({
    metric: '匹配强度',
    value: `${topPair.count}/${topPair.total} (${((topPair.count / topPair.total) * 100).toFixed(1)}%)`,
  });
  
  // 判断情感是否正向
  const positiveEmotions = ['满意', '开心', '惊喜', '安心', '骄傲', '自由', '轻松', '正面'];
  const isPositive = positiveEmotions.some(e => topPair.topEmotion.includes(e));
  
  if (isPositive) {
    recommendations.push(`这是一个良性的心智匹配，品牌定位应围绕「${topPair.topEmotion}」展开`);
    recommendations.push(`在文案中强化「${topPair.motivation}」带来的「${topPair.topEmotion}」体验`);
    recommendations.push(`视觉设计风格应该传递「${topPair.topEmotion}」的感觉`);
  } else {
    severity = 'warning';
    recommendations.push(`⚠️ 需要注意：用户虽然带着「${topPair.motivation}」动机购买，但情感倾向为「${topPair.topEmotion}」`);
    recommendations.push('这可能提示产品存在期望落差，需要优化产品或调整营销话术');
  }
  
  // 列出其他动机-情感对
  if (motivationEmotionPairs.length > 1) {
    const others = motivationEmotionPairs.slice(1, 3)
      .map(p => `${p.motivation} → ${p.topEmotion}`)
      .join('、');
    keyFindings.push(`其他心智模式：${others}`);
    recommendations.push('针对不同购买动机，可以设计差异化的品牌传播内容');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 品牌溢价分析（优势×情感）
 */
export function interpretStrengthEmotion(data: {
  strengthEmotion: Array<{
    strength: string;
    emotions: Record<string, number>;
    total: number;
  }>;
}): Interpretation {
  const { strengthEmotion } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!strengthEmotion || strengthEmotion.length === 0) {
    keyFindings.push('暂无产品优势和情感数据进行分析');
    recommendations.push('请确保评论中包含产品优势(Strength)和情感标签信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出能触发强烈正面情感的优势（品牌溢价点）
  const positiveEmotions = ['满意', '开心', '惊喜', '安心', '骄傲', '自由', '轻松', '正面', '愉悦', '舒适'];
  
  const premiumStrengths = strengthEmotion
    .filter(s => s.total >= 3) // 至少3条评论
    .map(s => {
      // 计算正面情感的总数
      const positiveCount = Object.entries(s.emotions)
        .filter(([emotion, _]) => positiveEmotions.some(pe => emotion.includes(pe)))
        .reduce((sum, [_, count]) => sum + count, 0);
      
      const positivePercent = s.total > 0 ? (positiveCount / s.total) * 100 : 0;
      
      // 找出最强情感
      const topEmotion = Object.entries(s.emotions)
        .sort((a, b) => b[1] - a[1])
        .filter(([_, count]) => count > 0)[0];
      
      return {
        strength: s.strength,
        positiveCount,
        positivePercent,
        total: s.total,
        topEmotion: topEmotion ? topEmotion[0] : null,
        topEmotionCount: topEmotion ? topEmotion[1] : 0,
      };
    })
    .filter(s => s.positivePercent >= 60) // 正面情感占比>=60%
    .sort((a, b) => b.positivePercent - a.positivePercent);
  
  if (premiumStrengths.length > 0) {
    severity = 'success';
    const topPremium = premiumStrengths[0];
    
    keyFindings.push(
      `💎 品牌溢价点：「${topPremium.strength}」触发了 ${topPremium.positivePercent.toFixed(1)}% 的正面情感`
    );
    
    if (topPremium.topEmotion) {
      keyFindings.push(
        `最能激发「${topPremium.topEmotion}」情感 (${topPremium.topEmotionCount}/${topPremium.total} 条评论)`
      );
    }
    
    dataSupport.push({
      metric: '溢价优势',
      value: `${topPremium.strength}`,
    });
    
    dataSupport.push({
      metric: '正面情感占比',
      value: `${topPremium.positivePercent.toFixed(1)}% (${topPremium.positiveCount}/${topPremium.total})`,
    });
    
    if (topPremium.topEmotion) {
      dataSupport.push({
        metric: '核心情感',
        value: `${topPremium.topEmotion} (${topPremium.topEmotionCount} 次)`,
      });
    }
    
    recommendations.push(`「${topPremium.strength}」是你的品牌溢价关键，可以支撑更高的定价策略`);
    recommendations.push(`在所有营销物料中，都应该突出这个优势带来的情感价值`);
    
    if (topPremium.topEmotion) {
      recommendations.push(`文案不要只说功能参数，要围绕「${topPremium.topEmotion}」情感来讲故事`);
    }
    
    recommendations.push(`建议在产品包装、A+页面、视频中强化「${topPremium.strength}」的视觉呈现`);
    
    // 列出其他溢价点
    if (premiumStrengths.length > 1) {
      const others = premiumStrengths.slice(1, 3)
        .map(p => `${p.strength} (${p.positivePercent.toFixed(0)}%正面)`)
        .join('、');
      keyFindings.push(`其他溢价优势：${others}`);
    }
  } else {
    severity = 'warning';
    keyFindings.push('⚠️ 未发现明显的品牌溢价点（高正面情感的优势）');
    recommendations.push('产品优势可能停留在功能层面，缺乏情感共鸣');
    recommendations.push('建议通过用户访谈或调研，找到能触发正面情感的产品特性');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 用户分层优化（动机×建议）
 */
export function interpretMotivationSuggestion(data: {
  motivationSuggestion: Array<{
    motivation: string;
    suggestions: Record<string, number>;
    total: number;
  }>;
}): Interpretation {
  const { motivationSuggestion } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!motivationSuggestion || motivationSuggestion.length === 0) {
    keyFindings.push('暂无动机和改进建议数据进行分析');
    recommendations.push('请确保评论中包含购买动机(Why)和改进建议(Suggestion)的信息');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出有明确改进建议的动机群体
  const validMotivations = motivationSuggestion.filter(m => m.total >= 3);
  
  if (validMotivations.length === 0) {
    keyFindings.push('暂无足够的动机-建议匹配数据');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  severity = 'info';
  
  // 分析每个动机群体的核心诉求
  validMotivations.forEach((m, idx) => {
    const topSuggestions = Object.entries(m.suggestions)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 0)
      .slice(0, 2);
    
    if (topSuggestions.length > 0) {
      keyFindings.push(
        `「${m.motivation}」群体的核心诉求：改进「${topSuggestions[0][0]}」(${topSuggestions[0][1]} 次)`
      );
      
      dataSupport.push({
        metric: `${m.motivation} 群体诉求`,
        value: topSuggestions.map(s => `${s[0]} (${s[1]}次)`).join(', '),
      });
      
      // 针对前2个动机群体给出具体建议
      if (idx < 2 && topSuggestions.length > 0) {
        recommendations.push(
          `针对「${m.motivation}」用户：优先改进「${topSuggestions[0][0]}」，可提升该细分市场的满意度`
        );
      }
    }
  });
  
  // 检查是否存在明显的分层差异
  if (validMotivations.length >= 2) {
    const motivation1 = validMotivations[0];
    const motivation2 = validMotivations[1];
    
    const top1 = Object.entries(motivation1.suggestions).sort((a, b) => b[1] - a[1])[0];
    const top2 = Object.entries(motivation2.suggestions).sort((a, b) => b[1] - a[1])[0];
    
    if (top1 && top2 && top1[0] !== top2[0]) {
      severity = 'warning';
      keyFindings.push(
        `⚠️ 用户分层明显：不同动机群体的改进诉求差异较大`
      );
      recommendations.push('建议针对不同细分用户群体，开发差异化的产品版本或迭代方向');
      recommendations.push(`例如：「${motivation1.motivation}」版重点改进「${top1[0]}」，「${motivation2.motivation}」版重点改进「${top2[0]}」`);
    } else {
      severity = 'success';
      keyFindings.push('✅ 用户诉求一致：不同动机群体的改进方向趋同');
      recommendations.push('可以集中资源优先解决共性问题，提升整体满意度');
    }
  }
  
  // 总体建议
  recommendations.push('基于用户分层的改进优先级，有助于提高产品迭代的ROI');
  recommendations.push('在产品路线图中，平衡不同用户群体的需求，避免偏向单一群体');
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成产品洞察 - 负向优化分析（改进建议×优势维度）
 */
export function interpretNegativeOptimization(data: {
  dimensionAnalysis: Array<{
    dimension: string;
    strengthCount: number;
    suggestionCount: number;
    total: number;
    conflictRate: number;
  }>;
}): Interpretation {
  const { dimensionAnalysis } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!dimensionAnalysis || dimensionAnalysis.length === 0) {
    keyFindings.push('暂无维度冲突数据进行分析');
    recommendations.push('请确保评论中同时包含产品优势和改进建议');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出高冲突率的维度（既是优势又需要改进）
  const highConflict = dimensionAnalysis.filter(d => d.conflictRate >= 30 && d.total >= 5);
  const pureStrength = dimensionAnalysis.filter(d => d.strengthCount > 0 && d.suggestionCount === 0);
  const pureSuggestion = dimensionAnalysis.filter(d => d.strengthCount === 0 && d.suggestionCount > 0);
  
  if (highConflict.length > 0) {
    severity = 'warning';
    const topConflict = highConflict[0];
    
    keyFindings.push(
      `⚠️ 维度冲突：「${topConflict.dimension}」既是优势（${topConflict.strengthCount}次）又需改进（${topConflict.suggestionCount}次）`
    );
    
    keyFindings.push(
      `冲突率 ${topConflict.conflictRate.toFixed(1)}%，说明该维度存在"内部矛盾"`
    );
    
    dataSupport.push({
      metric: '冲突维度',
      value: `${topConflict.dimension}`,
    });
    
    dataSupport.push({
      metric: '优势vs改进',
      value: `${topConflict.strengthCount} vs ${topConflict.suggestionCount}`,
    });
    
    recommendations.push(`「${topConflict.dimension}」需要平衡优化：保持优势的同时解决用户吐槽点`);
    recommendations.push('这类维度往往是"高期望+不稳定"的表现，需要重点改进一致性');
    
    // 列出其他冲突维度
    if (highConflict.length > 1) {
      const others = highConflict.slice(1, 3)
        .map(d => `${d.dimension}(${d.conflictRate.toFixed(0)}%)`)
        .join('、');
      keyFindings.push(`其他冲突维度：${others}`);
    }
  } else {
    severity = 'success';
    keyFindings.push('✅ 未发现明显的维度冲突，产品各维度定位清晰');
  }
  
  // 分析纯优势维度（差异化优势）
  if (pureStrength.length > 0) {
    const topStrength = pureStrength.sort((a, b) => b.strengthCount - a.strengthCount).slice(0, 2);
    const strengthList = topStrength.map(s => `${s.dimension}(${s.strengthCount}次)`).join('、');
    
    keyFindings.push(`💎 纯优势维度：${strengthList}，无用户建议改进`);
    dataSupport.push({
      metric: '差异化优势',
      value: strengthList,
    });
    recommendations.push('纯优势维度是你的核心竞争力，应该在营销中重点突出');
  }
  
  // 分析纯改进维度（明显短板）
  if (pureSuggestion.length > 0) {
    const topSuggestion = pureSuggestion.sort((a, b) => b.suggestionCount - a.suggestionCount).slice(0, 2);
    const suggestionList = topSuggestion.map(s => `${s.dimension}(${s.suggestionCount}次)`).join('、');
    
    if (topSuggestion.some(s => s.suggestionCount >= 5)) {
      severity = severity === 'success' ? 'warning' : severity;
      keyFindings.push(`🔧 明显短板：${suggestionList}，仅有改进建议无优势`);
      recommendations.push('明显短板需要尽快迭代，否则会影响整体评分和口碑');
    }
  }
  
  // 总体建议
  recommendations.push('建议在产品迭代中优先解决"高冲突"维度，同时保持"纯优势"维度');
  recommendations.push('对于"纯改进"维度，需评估是否为核心功能，决定改进优先级');
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 生成场景洞察 - 真实生活瞬间（地点×时机×场景 3D组合）
 */
export function interpretLifeMoment(data: {
  slices: Array<{
    label: string;
    count: number;
    data: number[][];
    rows: string[];
    columns: string[];
  }>;
}): Interpretation {
  const { slices } = data;
  
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';
  
  // 检查数据是否为空
  if (!slices || slices.length === 0) {
    keyFindings.push('暂无地点、时机、场景的3维数据进行分析');
    recommendations.push('请确保评论中包含使用地点(Where)、时机(When)和场景(Scenario)的标签');
    return {
      keyFindings,
      dataSupport,
      recommendations,
      severity: 'info',
    };
  }
  
  // 找出最高频的地点
  const topLocations = slices.slice(0, 3);
  
  if (topLocations.length > 0) {
    severity = 'success';
    const topLocation = topLocations[0];
    
    // 分析该地点下的时机×场景组合
    let maxCombo = { time: '', scenario: '', count: 0 };
    
    topLocation.rows.forEach((time, i) => {
      topLocation.columns.forEach((scenario, j) => {
        const count = topLocation.data[i][j];
        if (count > maxCombo.count) {
          maxCombo = { time, scenario, count };
        }
      });
    });
    
    keyFindings.push(
      `🎯 典型生活瞬间：在「${topLocation.label}」「${maxCombo.time}」进行「${maxCombo.scenario}」`
    );
    
    keyFindings.push(
      `该场景在 ${topLocation.count} 条评论中出现，是产品的核心使用场景`
    );
    
    dataSupport.push({
      metric: '核心场景',
      value: `${topLocation.label} × ${maxCombo.time} × ${maxCombo.scenario}`,
    });
    
    dataSupport.push({
      metric: '场景频次',
      value: `${maxCombo.count} 次提及`,
    });
    
    recommendations.push(`这是用户的"真实生活瞬间"，应该成为产品定义(PD)和营销的核心`);
    recommendations.push(`在主图、A+页面、视频中重点展示「${topLocation.label} × ${maxCombo.time} × ${maxCombo.scenario}」的使用场景`);
    recommendations.push(`广告投放可以针对「${maxCombo.time}」时段、「${topLocation.label}」相关的兴趣标签`);
  }
  
  // 分析场景分布（是否过于集中）
  const totalCount = slices.reduce((sum, s) => sum + s.count, 0);
  const topLocationPercent = topLocations.length > 0 ? (topLocations[0].count / totalCount) * 100 : 0;
  
  if (topLocationPercent >= 60) {
    severity = 'warning';
    keyFindings.push(`⚠️ 场景过于集中：${topLocationPercent.toFixed(1)}% 的使用发生在单一地点`);
    recommendations.push('考虑拓展其他使用场景，避免过度依赖单一场景');
  } else if (slices.length >= 3) {
    keyFindings.push(`✅ 场景分布均衡：产品在 ${slices.length} 个不同地点都有典型使用场景`);
    recommendations.push('多场景适用性强，可以针对不同场景开发差异化营销策略');
  }
  
  // 列出其他高频场景
  if (topLocations.length > 1) {
    const others = topLocations.slice(1, 3).map(loc => {
      // 找出该地点的最高频组合
      let maxCombo = { time: '', scenario: '', count: 0 };
      loc.rows.forEach((time, i) => {
        loc.columns.forEach((scenario, j) => {
          const count = loc.data[i][j];
          if (count > maxCombo.count) {
            maxCombo = { time, scenario, count };
          }
        });
      });
      return `${loc.label} × ${maxCombo.time} × ${maxCombo.scenario}`;
    }).join('、');
    
    keyFindings.push(`其他典型场景：${others}`);
    recommendations.push('可以为不同场景设计专属的产品版本或套餐（如：居家版、户外版）');
  }
  
  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 解读购买者-使用者-动机关系（3D：决策逻辑链）
 */
export function interpretDecisionLogicChain(data: {
  buyers: string[];
  users: string[];
  motivations: string[];
  slices: Array<{
    label: string;
    rows: string[];
    columns: string[];
    data: number[][];
    count: number;
  }>;
}): Interpretation {
  const { slices } = data;
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';

  if (!slices || slices.length === 0) {
    return {
      keyFindings: ['暂无足够数据进行决策逻辑链分析'],
      dataSupport: [],
      recommendations: ['建议积累更多评论数据后再进行分析'],
      severity: 'info',
    };
  }

  // 分析每个购买者的决策逻辑
  const buyerAnalysis = slices.map(slice => {
    const totalCount = slice.count;
    
    // 找出该购买者最常为哪些使用者购买
    const userMotivations: Array<{ user: string; motivation: string; count: number }> = [];
    slice.rows.forEach((user, userIdx) => {
      slice.columns.forEach((motivation, motIdx) => {
        const count = slice.data[userIdx][motIdx];
        if (count > 0) {
          userMotivations.push({ user, motivation, count });
        }
      });
    });
    
    userMotivations.sort((a, b) => b.count - a.count);
    
    return {
      buyer: slice.label,
      totalCount,
      topCombination: userMotivations[0],
      allCombinations: userMotivations,
    };
  });

  // 识别主要决策模式
  severity = 'success';
  const mainBuyer = buyerAnalysis[0];
  
  if (mainBuyer && mainBuyer.topCombination) {
    keyFindings.push(
      `🎯 核心决策链：「${mainBuyer.buyer}」→「${mainBuyer.topCombination.user}」→「${mainBuyer.topCombination.motivation}」`
    );
    keyFindings.push(
      `该决策链路占比最高，说明这是产品的主要消费场景`
    );
    
    dataSupport.push({
      metric: '主要购买者',
      value: mainBuyer.buyer,
    });
    dataSupport.push({
      metric: '主要使用者',
      value: mainBuyer.topCombination.user,
    });
    dataSupport.push({
      metric: '核心动机',
      value: mainBuyer.topCombination.motivation,
    });
    
    recommendations.push(
      `广告投放建议：定位「${mainBuyer.buyer}」人群，强调「${mainBuyer.topCombination.motivation}」价值点`
    );
    recommendations.push(
      `文案话术：突出「${mainBuyer.topCombination.user}」的使用场景和体验`
    );
  }

  // 识别礼品场景（买者非用者）
  const giftScenarios = buyerAnalysis.filter(b => 
    b.topCombination && b.topCombination.user !== b.buyer
  );
  
  if (giftScenarios.length > 0) {
    severity = 'warning';
    keyFindings.push(
      `🎁 礼品场景识别：${giftScenarios.length}个购买者存在"买者非用者"场景`
    );
    
    const giftExamples = giftScenarios.slice(0, 2).map(g => 
      `${g.buyer}→${g.topCombination?.user}`
    ).join('、');
    
    keyFindings.push(`典型场景：${giftExamples}`);
    
    recommendations.push('针对礼品场景优化包装和礼品卡设计');
    recommendations.push('在产品详情页突出"送礼佳品"等文案');
  }

  // 识别多动机场景
  const multiMotivationBuyers = buyerAnalysis.filter(b => 
    b.allCombinations && b.allCombinations.length > 2
  );
  
  if (multiMotivationBuyers.length > 0) {
    keyFindings.push(
      `🔄 多动机购买：${multiMotivationBuyers.length}个购买者群体有多种购买动机`
    );
    recommendations.push('可以设计多种营销策略覆盖不同购买动机');
  }

  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 解读产品优势-场景-情感关系（3D：品牌记忆点）
 */
export function interpretBrandMemory(data: {
  strengths: string[];
  scenarios: string[];
  emotions: string[];
  slices: Array<{
    label: string;
    rows: string[];
    columns: string[];
    data: number[][];
    count: number;
  }>;
}): Interpretation {
  const { slices } = data;
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';

  if (!slices || slices.length === 0) {
    return {
      keyFindings: ['暂无足够数据进行品牌记忆点分析'],
      dataSupport: [],
      recommendations: ['建议积累更多评论数据后再进行分析'],
      severity: 'info',
    };
  }

  // 分析每个优势维度在不同场景下触发的情感
  const strengthAnalysis = slices.map(slice => {
    const totalCount = slice.count;
    
    // 找出该优势最强的场景-情感组合
    const scenarioEmotions: Array<{ scenario: string; emotion: string; count: number }> = [];
    slice.rows.forEach((scenario, scenarioIdx) => {
      slice.columns.forEach((emotion, emotionIdx) => {
        const count = slice.data[scenarioIdx][emotionIdx];
        if (count > 0) {
          scenarioEmotions.push({ scenario, emotion, count });
        }
      });
    });
    
    scenarioEmotions.sort((a, b) => b.count - a.count);
    
    // 计算最高情感强度
    const maxEmotionCount = scenarioEmotions[0]?.count || 0;
    const emotionIntensity = totalCount > 0 ? (maxEmotionCount / totalCount) * 100 : 0;
    
    return {
      strength: slice.label,
      totalCount,
      topCombination: scenarioEmotions[0],
      emotionIntensity,
      allCombinations: scenarioEmotions,
    };
  }).sort((a, b) => b.emotionIntensity - a.emotionIntensity);

  // 识别品牌记忆点（高强度的优势-场景-情感组合）
  const brandMemoryPoints = strengthAnalysis.filter(s => s.emotionIntensity >= 40);
  
  if (brandMemoryPoints.length > 0) {
    severity = 'success';
    const topPoint = brandMemoryPoints[0];
    
    keyFindings.push(
      `⭐ 品牌记忆点：「${topPoint.strength}」×「${topPoint.topCombination.scenario}」→「${topPoint.topCombination.emotion}」`
    );
    keyFindings.push(
      `情感强度 ${topPoint.emotionIntensity.toFixed(1)}%，这是品牌的核心溢价空间`
    );
    
    dataSupport.push({
      metric: '核心优势',
      value: topPoint.strength,
    });
    dataSupport.push({
      metric: '黄金场景',
      value: topPoint.topCombination.scenario,
    });
    dataSupport.push({
      metric: '触发情感',
      value: topPoint.topCombination.emotion,
    });
    dataSupport.push({
      metric: '情感强度',
      value: `${topPoint.emotionIntensity.toFixed(1)}%`,
    });
    
    recommendations.push(
      `A+页面脚本：围绕「${topPoint.topCombination.scenario}」场景展开，突出「${topPoint.strength}」如何带来「${topPoint.topCombination.emotion}」体验`
    );
    recommendations.push(
      `主图视频：拍摄「${topPoint.topCombination.scenario}」场景的真实使用画面`
    );
    recommendations.push(
      `品牌定位：将「${topPoint.topCombination.emotion}」作为核心情感诉求`
    );
  } else {
    severity = 'warning';
    keyFindings.push('⚠️ 未发现明显的品牌记忆点（情感强度均<40%）');
    keyFindings.push('产品优势与场景、情感的关联较弱，需要强化品牌叙事');
    
    recommendations.push('建议提升产品在特定场景下的情感体验');
    recommendations.push('可以通过用户故事、场景营销来建立情感连接');
  }

  // 识别多场景适配性
  const multiScenarioStrengths = strengthAnalysis.filter(s => 
    s.allCombinations && s.allCombinations.length >= 3
  );
  
  if (multiScenarioStrengths.length > 0) {
    keyFindings.push(
      `🌟 多场景适配：${multiScenarioStrengths.length}个优势维度在多个场景下都能触发正向情感`
    );
    
    const examples = multiScenarioStrengths.slice(0, 2).map(s => s.strength).join('、');
    keyFindings.push(`如：${examples}`);
    
    recommendations.push('这些优势具有通用性，可以作为产品的核心卖点');
  }

  // 识别独特情感价值
  const emotionTypes = new Set<string>();
  strengthAnalysis.forEach(s => {
    s.allCombinations?.forEach(c => emotionTypes.add(c.emotion));
  });
  
  if (emotionTypes.size >= 4) {
    keyFindings.push(
      `💎 情感丰富度高：产品能触发${emotionTypes.size}种不同情感，品牌价值多元`
    );
  }

  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 解读动机-劣势-建议关系（3D：研发优先级）
 */
export function interpretRnDPriority(data: {
  motivations: string[];
  weaknesses: string[];
  suggestions: string[];
  slices: Array<{
    label: string;
    rows: string[];
    columns: string[];
    data: number[][];
    count: number;
  }>;
}): Interpretation {
  const { slices } = data;
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';

  if (!slices || slices.length === 0) {
    return {
      keyFindings: ['暂无足够数据进行研发优先级分析'],
      dataSupport: [],
      recommendations: ['建议积累更多评论数据后再进行分析'],
      severity: 'info',
    };
  }

  // 分析每个动机下的劣势-建议关系
  const motivationAnalysis = slices.map(slice => {
    const totalCount = slice.count;
    
    // 找出该动机下最紧迫的劣势-建议组合
    const weaknessSuggestions: Array<{ weakness: string; suggestion: string; count: number }> = [];
    slice.rows.forEach((weakness, weaknessIdx) => {
      slice.columns.forEach((suggestion, suggestionIdx) => {
        const count = slice.data[weaknessIdx][suggestionIdx];
        if (count > 0) {
          weaknessSuggestions.push({ weakness, suggestion, count });
        }
      });
    });
    
    weaknessSuggestions.sort((a, b) => b.count - a.count);
    
    // 计算劣势严重度（基于反馈数量）
    const urgencyScore = totalCount > 0 ? (weaknessSuggestions[0]?.count || 0) / totalCount : 0;
    
    return {
      motivation: slice.label,
      totalCount,
      topIssue: weaknessSuggestions[0],
      allIssues: weaknessSuggestions,
      urgencyScore,
    };
  }).sort((a, b) => b.urgencyScore - a.urgencyScore); // 按紧急程度排序

  // 识别高优先级研发任务
  const urgentIssues = motivationAnalysis.filter(m => m.urgencyScore >= 0.3);
  
  if (urgentIssues.length > 0) {
    severity = 'error';
    const topIssue = urgentIssues[0];
    
    keyFindings.push(
      `🚨 最高优先级：「${topIssue.motivation}」动机下的「${topIssue.topIssue.weakness}」问题`
    );
    keyFindings.push(
      `用户强烈建议「${topIssue.topIssue.suggestion}」，集中度 ${(topIssue.urgencyScore * 100).toFixed(1)}%`
    );
    
    dataSupport.push({
      metric: '核心动机',
      value: topIssue.motivation,
    });
    dataSupport.push({
      metric: '关键劣势',
      value: topIssue.topIssue.weakness,
    });
    dataSupport.push({
      metric: '改进建议',
      value: topIssue.topIssue.suggestion,
    });
    dataSupport.push({
      metric: '紧急程度',
      value: `${(topIssue.urgencyScore * 100).toFixed(1)}%`,
    });
    
    recommendations.push(
      `立即启动「${topIssue.topIssue.suggestion}」项目，解决「${topIssue.topIssue.weakness}」痛点`
    );
    recommendations.push(
      `针对「${topIssue.motivation}」用户群体优先验证改进效果`
    );
    recommendations.push(
      `在PRD中明确：目标用户动机 → 现存问题 → 解决方案`
    );
  } else if (motivationAnalysis.length > 0) {
    severity = 'warning';
    const topIssue = motivationAnalysis[0];
    
    keyFindings.push(
      `⚠️ 需要关注：「${topIssue.motivation}」动机下的「${topIssue.topIssue.weakness}」问题`
    );
    keyFindings.push(
      `建议改进方向：「${topIssue.topIssue.suggestion}」`
    );
    
    recommendations.push('将该问题纳入下一迭代计划');
    recommendations.push('收集更多用户反馈以验证改进方向');
  }

  // 识别多动机共性问题（高优先级）
  const weaknessFrequency: Record<string, number> = {};
  motivationAnalysis.forEach(m => {
    m.allIssues.forEach(issue => {
      weaknessFrequency[issue.weakness] = (weaknessFrequency[issue.weakness] || 0) + 1;
    });
  });
  
  const commonWeaknesses = Object.entries(weaknessFrequency)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);
  
  if (commonWeaknesses.length > 0) {
    keyFindings.push(
      `🔄 跨动机共性问题：${commonWeaknesses.length}个劣势在多个用户群体中被提及`
    );
    
    const examples = commonWeaknesses.slice(0, 2).map(([w, c]) => `${w}(${c}个场景)`).join('、');
    keyFindings.push(`如：${examples}`);
    
    recommendations.push('优先解决跨场景共性问题，可获得最大ROI');
  }

  // 识别长尾建议
  const suggestionFrequency: Record<string, number> = {};
  motivationAnalysis.forEach(m => {
    m.allIssues.forEach(issue => {
      suggestionFrequency[issue.suggestion] = (suggestionFrequency[issue.suggestion] || 0) + 1;
    });
  });
  
  const rareSuggestions = Object.entries(suggestionFrequency)
    .filter(([_, count]) => count === 1)
    .length;
  
  if (rareSuggestions >= 3) {
    keyFindings.push(
      `💡 创新机会：发现${rareSuggestions}个独特改进建议，可探索差异化方向`
    );
  }

  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}

/**
 * 解读情感-维度-地点关系（3D：环境冲突）
 */
export function interpretEnvironmentConflict(data: {
  emotions: string[];
  dimensions: string[];
  locations: string[];
  slices: Array<{
    label: string;
    rows: string[];
    columns: string[];
    data: number[][];
    count: number;
  }>;
}): Interpretation {
  const { slices } = data;
  const keyFindings: string[] = [];
  const dataSupport: Array<{ metric: string; value: string }> = [];
  const recommendations: string[] = [];
  let severity: 'success' | 'warning' | 'error' | 'info' = 'info';

  if (!slices || slices.length === 0) {
    return {
      keyFindings: ['暂无足够数据进行环境冲突分析'],
      dataSupport: [],
      recommendations: ['建议积累更多评论数据后再进行分析'],
      severity: 'info',
    };
  }

  // 分析每种情感在不同环境下的产品维度表现
  const emotionAnalysis = slices.map(slice => {
    const totalCount = slice.count;
    
    // 找出该情感下最显著的维度-地点组合
    const dimensionLocations: Array<{ dimension: string; location: string; count: number }> = [];
    slice.rows.forEach((dimension, dimensionIdx) => {
      slice.columns.forEach((location, locationIdx) => {
        const count = slice.data[dimensionIdx][locationIdx];
        if (count > 0) {
          dimensionLocations.push({ dimension, location, count });
        }
      });
    });
    
    dimensionLocations.sort((a, b) => b.count - a.count);
    
    // 计算环境集中度（是否存在明显的环境依赖）
    const maxLocationCount = dimensionLocations[0]?.count || 0;
    const environmentConcentration = totalCount > 0 ? maxLocationCount / totalCount : 0;
    
    return {
      emotion: slice.label,
      totalCount,
      topCombination: dimensionLocations[0],
      allCombinations: dimensionLocations,
      environmentConcentration,
    };
  });

  // 识别负面情感的环境冲突（高优先级）
  const negativeEmotions = ['失望', '愤怒', '焦虑', '不满', '困扰', '沮丧'];
  const negativeConflicts = emotionAnalysis.filter(e => 
    negativeEmotions.some(neg => e.emotion.includes(neg)) && e.environmentConcentration >= 0.3
  );
  
  if (negativeConflicts.length > 0) {
    severity = 'error';
    const topConflict = negativeConflicts[0];
    
    keyFindings.push(
      `⚠️ 环境冲突警告：「${topConflict.topCombination.location}」场景下「${topConflict.topCombination.dimension}」引发「${topConflict.emotion}」`
    );
    keyFindings.push(
      `环境集中度 ${(topConflict.environmentConcentration * 100).toFixed(1)}%，说明该场景存在明显适配问题`
    );
    
    dataSupport.push({
      metric: '问题场景',
      value: topConflict.topCombination.location,
    });
    dataSupport.push({
      metric: '问题维度',
      value: topConflict.topCombination.dimension,
    });
    dataSupport.push({
      metric: '用户情感',
      value: topConflict.emotion,
    });
    dataSupport.push({
      metric: '集中度',
      value: `${(topConflict.environmentConcentration * 100).toFixed(1)}%`,
    });
    
    recommendations.push(
      `针对「${topConflict.topCombination.location}」场景优化「${topConflict.topCombination.dimension}」设计`
    );
    recommendations.push(
      `考虑推出专为该场景设计的产品版本或配件`
    );
    recommendations.push(
      `在产品详情页明确标注适用/不适用场景`
    );
  } else {
    // 识别正向情感的黄金场景
    const positiveEmotions = ['喜悦', '满意', '惊喜', '安心', '舒适', '愉悦', '开心'];
    const positiveScenarios = emotionAnalysis.filter(e => 
      positiveEmotions.some(pos => e.emotion.includes(pos)) && e.environmentConcentration >= 0.4
    );
    
    if (positiveScenarios.length > 0) {
      severity = 'success';
      const topScenario = positiveScenarios[0];
      
      keyFindings.push(
        `✨ 黄金场景：「${topScenario.topCombination.location}」×「${topScenario.topCombination.dimension}」→「${topScenario.emotion}」`
      );
      keyFindings.push(
        `该场景下产品表现优异，用户满意度集中`
      );
      
      dataSupport.push({
        metric: '优势场景',
        value: topScenario.topCombination.location,
      });
      dataSupport.push({
        metric: '优势维度',
        value: topScenario.topCombination.dimension,
      });
      dataSupport.push({
        metric: '用户情感',
        value: topScenario.emotion,
      });
      
      recommendations.push(
        `在营销中重点展示「${topScenario.topCombination.location}」场景的使用画面`
      );
      recommendations.push(
        `强化「${topScenario.topCombination.dimension}」卖点在该场景下的优势`
      );
    } else {
      severity = 'info';
      keyFindings.push('产品在各场景表现较为均衡，未发现明显环境冲突或黄金场景');
      recommendations.push('可以继续优化产品的场景适配性');
    }
  }

  // 识别多场景适配性
  const locationCoverage = new Set<string>();
  emotionAnalysis.forEach(e => {
    e.allCombinations.forEach(c => locationCoverage.add(c.location));
  });
  
  if (locationCoverage.size >= 4) {
    keyFindings.push(
      `🌍 多场景适配：产品在${locationCoverage.size}个不同场景下都有用户反馈，适用性广`
    );
  }

  // 识别维度-场景不匹配
  const dimensionLocationMismatches: Array<{ dimension: string; location: string; emotion: string }> = [];
  negativeConflicts.forEach(conflict => {
    if (conflict.allCombinations.length > 0) {
      conflict.allCombinations.slice(0, 2).forEach(combo => {
        dimensionLocationMismatches.push({
          dimension: combo.dimension,
          location: combo.location,
          emotion: conflict.emotion,
        });
      });
    }
  });
  
  if (dimensionLocationMismatches.length > 0) {
    keyFindings.push(
      `🔍 发现${dimensionLocationMismatches.length}个维度-场景不匹配情况`
    );
    recommendations.push('建议进行产品线扩张，针对不同场景推出专属版本');
  }

  return {
    keyFindings,
    dataSupport,
    recommendations,
    severity,
  };
}
