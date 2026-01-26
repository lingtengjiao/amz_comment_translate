/**
 * 数据计算工具
 * 将原始数据转换为图表所需格式
 */
import { PivotCalculatorInput } from '../types';

/**
 * 计算购买者-使用者关系
 */
export function calculateBuyerUserRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {} } = input;
  
  const buyerThemes = Array.isArray(aggregated_themes['buyer']) ? aggregated_themes['buyer'] : [];
  const userThemes = Array.isArray(aggregated_themes['user']) ? aggregated_themes['user'] : [];
  
  const buyers = buyerThemes.map((t: any) => t.label || t);
  const users = userThemes.map((t: any) => t.label || t);
  
  // 统计每个 buyer-user 组合
  const pairMap = new Map<string, { count: number; reviewIds: string[] }>();
  
  reviews.forEach(review => {
    const reviewBuyers = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'buyer')
      .map((t: any) => t.label_name);
    
    const reviewUsers = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'user')
      .map((t: any) => t.label_name);
    
    reviewBuyers.forEach(buyer => {
      reviewUsers.forEach(user => {
        const key = `${buyer}|${user}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, { count: 0, reviewIds: [] });
        }
        const pair = pairMap.get(key)!;
        pair.count++;
        if (!pair.reviewIds.includes(review.id)) {
          pair.reviewIds.push(review.id);
        }
      });
    });
  });
  
  const pairs = Array.from(pairMap.entries()).map(([key, data]) => {
    const [buyer, user] = key.split('|');
    return {
      buyer,
      user,
      count: data.count,
      percent: (data.count / reviews.length) * 100,
      reviewIds: data.reviewIds,
    };
  });
  
  return {
    buyers,
    users,
    pairs,
    totalReviews: reviews.length,
  };
}

/**
 * 计算购买者-产品优势关系
 */
export function calculateBuyerStrengthRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {} } = input;
  
  const buyerThemes = Array.isArray(aggregated_themes['buyer']) ? aggregated_themes['buyer'] : [];
  const buyers = buyerThemes.map((t: any) => t.label || t);
  
  // 收集所有优势维度
  const strengthDimensions = new Set<string>();
  (aggregated_insights.strengths || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      strengthDimensions.add(item.dimension);
    }
  });
  
  const strengths = Array.from(strengthDimensions);
  
  // 构建 buyer -> strength 的映射
  const buyerStrengthMap: Record<string, Record<string, number>> = {};
  
  buyers.forEach(buyer => {
    buyerStrengthMap[buyer] = {};
    strengths.forEach(strength => {
      buyerStrengthMap[buyer][strength] = 0;
    });
  });
  
  reviews.forEach(review => {
    const reviewBuyers = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'buyer')
      .map((t: any) => t.label_name);
    
    const reviewStrengths = (review.insights || [])
      .filter((i: any) => i.type === 'strength' && i.dimension && i.dimension !== '其他')
      .map((i: any) => i.dimension);
    
    reviewBuyers.forEach(buyer => {
      reviewStrengths.forEach(strength => {
        if (buyerStrengthMap[buyer] && buyerStrengthMap[buyer][strength] !== undefined) {
          buyerStrengthMap[buyer][strength]++;
        }
      });
    });
  });
  
  return {
    buyers,
    strengths,
    buyerStrengthMap,
  };
}

/**
 * 计算动机-情感倾向关系
 */
export function calculateMotivationSentimentRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {} } = input;
  
  const whyThemes = Array.isArray(aggregated_themes['why']) ? aggregated_themes['why'] : [];
  const motivations = whyThemes.map((t: any) => t.label || t);
  
  const motivationSentiment = motivations.map(motivation => {
    let positive = 0, neutral = 0, negative = 0;
    
    reviews.forEach(review => {
      const hasMotivation = (review.theme_highlights || [])
        .some((t: any) => t.theme_type === 'why' && t.label_name === motivation);
      
      if (hasMotivation) {
        const sentiment = review.sentiment || 'neutral';
        if (sentiment === 'positive') positive++;
        else if (sentiment === 'neutral') neutral++;
        else if (sentiment === 'negative') negative++;
      }
    });
    
    const total = positive + neutral + negative;
    
    return {
      motivation,
      positive,
      neutral,
      negative,
      total,
    };
  }).filter(m => m.total > 0);
  
  return {
    motivations,
    motivationSentiment,
  };
}

/**
 * 计算产品劣势-情感倾向关系
 */
export function calculateWeaknessSentimentRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_insights = {} } = input;
  
  // 收集所有劣势维度
  const weaknessDimensions = new Set<string>();
  (aggregated_insights.weaknesses || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      weaknessDimensions.add(item.dimension);
    }
  });
  
  const weaknesses = Array.from(weaknessDimensions);
  
  const weaknessSentiment = weaknesses.map(weakness => {
    let positive = 0, neutral = 0, negative = 0;
    
    reviews.forEach(review => {
      const hasWeakness = (review.insights || [])
        .some((i: any) => i.type === 'weakness' && i.dimension === weakness);
      
      if (hasWeakness) {
        const sentiment = review.sentiment || 'neutral';
        if (sentiment === 'positive') positive++;
        else if (sentiment === 'neutral') neutral++;
        else if (sentiment === 'negative') negative++;
      }
    });
    
    const total = positive + neutral + negative;
    
    return {
      weakness,
      positive,
      neutral,
      negative,
      total,
      negativePercent: total > 0 ? (negative / total) * 100 : 0,
    };
  }).filter(w => w.total > 0);
  
  return {
    weaknesses,
    weaknessSentiment,
  };
}

/**
 * 计算产品优势-劣势对比
 */
export function calculateStrengthWeaknessComparison(input: PivotCalculatorInput) {
  const { aggregated_insights = {} } = input;
  
  // 收集所有维度
  const allDimensions = new Set<string>();
  
  (aggregated_insights.strengths || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      allDimensions.add(item.dimension);
    }
  });
  
  (aggregated_insights.weaknesses || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      allDimensions.add(item.dimension);
    }
  });
  
  const dimensions = Array.from(allDimensions);
  
  // 统计每个维度的优势和劣势数量
  const strengthCounts = dimensions.map(dim => {
    return (aggregated_insights.strengths || [])
      .filter((item: any) => item.dimension === dim).length;
  });
  
  const weaknessCounts = dimensions.map(dim => {
    return (aggregated_insights.weaknesses || [])
      .filter((item: any) => item.dimension === dim).length;
  });
  
  return {
    dimensions,
    strengthCounts,
    weaknessCounts,
  };
}

/**
 * 计算地点-改进建议关系
 */
export function calculateLocationSuggestionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {}, pivot_matrices } = input;
  
  const whereThemes = Array.isArray(aggregated_themes['where']) ? aggregated_themes['where'] : [];
  const locations = whereThemes.map((t: any) => t.label || t);
  
  // 收集所有改进建议维度
  const suggestionDimensions = new Set<string>();
  (aggregated_insights.suggestions || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      suggestionDimensions.add(item.dimension);
    }
  });
  
  const suggestions = Array.from(suggestionDimensions);
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.location_suggestion) {
    const matrix = pivot_matrices.location_suggestion;
    const whereSuggestion = locations.map(location => {
      const suggestionMap = matrix[location] || {};
      const total = Object.values(suggestionMap).reduce((sum: number, v: any) => sum + (v || 0), 0);
      
      return {
        location,
        suggestions: suggestionMap,
        total,
      };
    }).filter(l => l.total > 0);
    
    return {
      locations,
      suggestions,
      whereSuggestion,
    };
  }
  
  // 降级：从reviews计算（数据可能不完整）
  const whereSuggestion = locations.map(location => {
    const suggestionMap: Record<string, number> = {};
    suggestions.forEach(s => suggestionMap[s] = 0);
    
    reviews.forEach(review => {
      const hasLocation = (review.theme_highlights || [])
        .some((t: any) => t.theme_type === 'where' && t.label_name === location);
      
      if (hasLocation) {
        (review.insights || [])
          .filter((i: any) => i.type === 'suggestion' && i.dimension && i.dimension !== '其他')
          .forEach((i: any) => {
            if (suggestionMap[i.dimension] !== undefined) {
              suggestionMap[i.dimension]++;
            }
          });
      }
    });
    
    const total = Object.values(suggestionMap).reduce((sum, v) => sum + v, 0);
    
    return {
      location,
      suggestions: suggestionMap,
      total,
    };
  }).filter(l => l.total > 0);
  
  return {
    locations,
    suggestions,
    whereSuggestion,
  };
}

/**
 * 计算动机-地点关系（刚需场景分析）
 */
export function calculateMotivationLocationRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {} } = input;
  
  const whyThemes = Array.isArray(aggregated_themes['why']) ? aggregated_themes['why'] : [];
  const whereThemes = Array.isArray(aggregated_themes['where']) ? aggregated_themes['where'] : [];
  
  const motivations = whyThemes.map((t: any) => t.label || t);
  const locations = whereThemes.map((t: any) => t.label || t);
  
  // 构建 motivation -> location -> count 的映射
  const motivationLocationMap: Record<string, Record<string, number>> = {};
  
  motivations.forEach(motivation => {
    motivationLocationMap[motivation] = {};
    locations.forEach(location => {
      motivationLocationMap[motivation][location] = 0;
    });
  });
  
  reviews.forEach(review => {
    const reviewMotivations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'why')
      .map((t: any) => t.label_name);
    
    const reviewLocations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'where')
      .map((t: any) => t.label_name);
    
    reviewMotivations.forEach(motivation => {
      reviewLocations.forEach(location => {
        if (motivationLocationMap[motivation] && motivationLocationMap[motivation][location] !== undefined) {
          motivationLocationMap[motivation][location]++;
        }
      });
    });
  });
  
  // 计算每个组合的评分（可选：如果需要加权分析）
  const motivationLocationData = motivations.map(motivation => {
    const locationScores: Record<string, { count: number; avgRating: number }> = {};
    
    locations.forEach(location => {
      const count = motivationLocationMap[motivation][location];
      let ratingSum = 0;
      let ratingCount = 0;
      
      reviews.forEach(review => {
        const hasMotivation = (review.theme_highlights || [])
          .some((t: any) => t.theme_type === 'why' && t.label_name === motivation);
        const hasLocation = (review.theme_highlights || [])
          .some((t: any) => t.theme_type === 'where' && t.label_name === location);
        
        if (hasMotivation && hasLocation && review.rating) {
          ratingSum += review.rating;
          ratingCount++;
        }
      });
      
      locationScores[location] = {
        count,
        avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
      };
    });
    
    return {
      motivation,
      locationScores,
    };
  });
  
  return {
    motivations,
    locations,
    motivationLocationMap,
    motivationLocationData,
  };
}

/**
 * 计算动机-用户情感标签关系（心智匹配分析）
 */
export function calculateMotivationEmotionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {} } = input;
  
  const whyThemes = Array.isArray(aggregated_themes['why']) ? aggregated_themes['why'] : [];
  const emotionThemes = Array.isArray(aggregated_themes['emotion']) ? aggregated_themes['emotion'] : [];
  
  const motivations = whyThemes.map((t: any) => t.label || t);
  const emotions = emotionThemes.map((t: any) => t.label || t);
  
  // 如果没有emotion标签，使用sentiment作为替代
  const useEmotions = emotions.length > 0 ? emotions : ['满意', '中立', '不满'];
  
  // 构建 motivation -> emotion -> count 的映射
  const motivationEmotionMap: Record<string, Record<string, number>> = {};
  
  motivations.forEach(motivation => {
    motivationEmotionMap[motivation] = {};
    useEmotions.forEach(emotion => {
      motivationEmotionMap[motivation][emotion] = 0;
    });
  });
  
  reviews.forEach(review => {
    const reviewMotivations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'why')
      .map((t: any) => t.label_name);
    
    let reviewEmotions: string[] = [];
    
    if (emotions.length > 0) {
      // 使用emotion标签
      reviewEmotions = (review.theme_highlights || [])
        .filter((t: any) => t.theme_type === 'emotion')
        .map((t: any) => t.label_name);
    } else {
      // 降级为sentiment
      const sentiment = review.sentiment || 'neutral';
      if (sentiment === 'positive') reviewEmotions = ['满意'];
      else if (sentiment === 'neutral') reviewEmotions = ['中立'];
      else if (sentiment === 'negative') reviewEmotions = ['不满'];
    }
    
    reviewMotivations.forEach(motivation => {
      reviewEmotions.forEach(emotion => {
        if (motivationEmotionMap[motivation] && motivationEmotionMap[motivation][emotion] !== undefined) {
          motivationEmotionMap[motivation][emotion]++;
        }
      });
    });
  });
  
  return {
    motivations,
    emotions: useEmotions,
    motivationEmotionMap,
  };
}

/**
 * 计算产品优势-用户情感关系（品牌溢价分析）
 */
export function calculateStrengthEmotionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_insights = {}, aggregated_themes = {} } = input;
  
  // 收集所有优势维度
  const strengthDimensions = new Set<string>();
  (aggregated_insights.strengths || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      strengthDimensions.add(item.dimension);
    }
  });
  
  const strengths = Array.from(strengthDimensions);
  
  // 获取情感标签
  const emotionThemes = Array.isArray(aggregated_themes['emotion']) ? aggregated_themes['emotion'] : [];
  const emotions = emotionThemes.map((t: any) => t.label || t);
  
  // 如果没有emotion标签，使用sentiment作为替代
  const useEmotions = emotions.length > 0 ? emotions : ['正面', '中性', '负面'];
  
  // 构建 strength -> emotion -> count 的映射
  const strengthEmotionMap: Record<string, Record<string, number>> = {};
  
  strengths.forEach(strength => {
    strengthEmotionMap[strength] = {};
    useEmotions.forEach(emotion => {
      strengthEmotionMap[strength][emotion] = 0;
    });
  });
  
  reviews.forEach(review => {
    const reviewStrengths = (review.insights || [])
      .filter((i: any) => i.type === 'strength' && i.dimension && i.dimension !== '其他')
      .map((i: any) => i.dimension);
    
    let reviewEmotions: string[] = [];
    
    if (emotions.length > 0) {
      // 使用emotion标签
      reviewEmotions = (review.theme_highlights || [])
        .filter((t: any) => t.theme_type === 'emotion')
        .map((t: any) => t.label_name);
    } else {
      // 降级为sentiment
      const sentiment = review.sentiment || 'neutral';
      if (sentiment === 'positive') reviewEmotions = ['正面'];
      else if (sentiment === 'neutral') reviewEmotions = ['中性'];
      else if (sentiment === 'negative') reviewEmotions = ['负面'];
    }
    
    reviewStrengths.forEach(strength => {
      reviewEmotions.forEach(emotion => {
        if (strengthEmotionMap[strength] && strengthEmotionMap[strength][emotion] !== undefined) {
          strengthEmotionMap[strength][emotion]++;
        }
      });
    });
  });
  
  const strengthEmotion = strengths.map(strength => {
    const emotionCounts = useEmotions.map(emotion => strengthEmotionMap[strength][emotion] || 0);
    const total = emotionCounts.reduce((sum, count) => sum + count, 0);
    
    return {
      strength,
      emotions: useEmotions.reduce((obj, emotion, idx) => {
        obj[emotion] = emotionCounts[idx];
        return obj;
      }, {} as Record<string, number>),
      total,
    };
  }).filter(s => s.total > 0);
  
  return {
    strengths,
    emotions: useEmotions,
    strengthEmotionMap,
    strengthEmotion,
  };
}

/**
 * 计算动机-改进建议关系（用户分层优化）
 */
export function calculateMotivationSuggestionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {} } = input;
  
  const whyThemes = Array.isArray(aggregated_themes['why']) ? aggregated_themes['why'] : [];
  const motivations = whyThemes.map((t: any) => t.label || t);
  
  // 收集所有改进建议维度
  const suggestionDimensions = new Set<string>();
  (aggregated_insights.suggestions || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      suggestionDimensions.add(item.dimension);
    }
  });
  
  const suggestions = Array.from(suggestionDimensions);
  
  // 构建 motivation -> suggestion -> count 的映射
  const motivationSuggestionMap: Record<string, Record<string, number>> = {};
  
  motivations.forEach(motivation => {
    motivationSuggestionMap[motivation] = {};
    suggestions.forEach(suggestion => {
      motivationSuggestionMap[motivation][suggestion] = 0;
    });
  });
  
  reviews.forEach(review => {
    const reviewMotivations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'why')
      .map((t: any) => t.label_name);
    
    const reviewSuggestions = (review.insights || [])
      .filter((i: any) => i.type === 'suggestion' && i.dimension && i.dimension !== '其他')
      .map((i: any) => i.dimension);
    
    reviewMotivations.forEach(motivation => {
      reviewSuggestions.forEach(suggestion => {
        if (motivationSuggestionMap[motivation] && motivationSuggestionMap[motivation][suggestion] !== undefined) {
          motivationSuggestionMap[motivation][suggestion]++;
        }
      });
    });
  });
  
  const motivationSuggestion = motivations.map(motivation => {
    const suggestionCounts = suggestions.map(s => motivationSuggestionMap[motivation][s] || 0);
    const total = suggestionCounts.reduce((sum, count) => sum + count, 0);
    
    return {
      motivation,
      suggestions: motivationSuggestionMap[motivation],
      total,
    };
  }).filter(m => m.total > 0);
  
  return {
    motivations,
    suggestions,
    motivationSuggestionMap,
    motivationSuggestion,
  };
}

/**
 * 计算产品改进建议-优势维度关系（负向优化分析）
 */
export function calculateSuggestionStrengthRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_insights = {} } = input;
  
  // 收集所有维度（既有优势又有建议的维度）
  const allDimensions = new Set<string>();
  
  (aggregated_insights.strengths || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      allDimensions.add(item.dimension);
    }
  });
  
  (aggregated_insights.suggestions || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      allDimensions.add(item.dimension);
    }
  });
  
  const dimensions = Array.from(allDimensions);
  
  // 统计每个维度的优势和建议数量
  const dimensionAnalysis = dimensions.map(dimension => {
    let strengthCount = 0;
    let suggestionCount = 0;
    
    reviews.forEach(review => {
      const hasStrength = (review.insights || [])
        .some((i: any) => i.type === 'strength' && i.dimension === dimension);
      const hasSuggestion = (review.insights || [])
        .some((i: any) => i.type === 'suggestion' && i.dimension === dimension);
      
      if (hasStrength) strengthCount++;
      if (hasSuggestion) suggestionCount++;
    });
    
    const total = strengthCount + suggestionCount;
    const conflictRate = total > 0 ? (Math.min(strengthCount, suggestionCount) / total) * 100 : 0;
    
    return {
      dimension,
      strengthCount,
      suggestionCount,
      total,
      conflictRate, // 冲突率：既有优势又有建议的程度
    };
  })
  .filter(d => d.total > 0)
  .sort((a, b) => b.conflictRate - a.conflictRate); // 按冲突率排序
  
  return {
    dimensions,
    dimensionAnalysis,
  };
}

/**
 * 计算地点-时机-场景关系（3D组合：真实生活瞬间）
 */
export function calculateLocationTimeScenarioRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, pivot_matrices } = input;
  
  const whereThemes = Array.isArray(aggregated_themes['where']) ? aggregated_themes['where'] : [];
  const whenThemes = Array.isArray(aggregated_themes['when']) ? aggregated_themes['when'] : [];
  const scenarioThemes = Array.isArray(aggregated_themes['scenario']) ? aggregated_themes['scenario'] : [];
  
  const locations = whereThemes.map((t: any) => t.label || t);
  const times = whenThemes.map((t: any) => t.label || t);
  const scenarios = scenarioThemes.map((t: any) => t.label || t);
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.location_time_scenario && locations.length > 0 && times.length > 0 && scenarios.length > 0) {
    const matrix3D = pivot_matrices.location_time_scenario;
    
    const slices = locations.map(location => {
      const locationData = matrix3D[location] || {};
      
      const matrixData = times.map(time => {
        const timeData = locationData[time] || {};
        return scenarios.map(scenario => timeData[scenario] || 0);
      });
      
      const count = matrixData.reduce((sum, row) => 
        sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
      );
      
      return {
        label: location,
        rows: times,
        columns: scenarios,
        data: matrixData,
        count,
      };
    })
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count);
    
    return {
      locations,
      times,
      scenarios,
      slices,
    };
  }
  
  // 为每个地点构建一个时机×场景的2D矩阵
  const slices = locations.map(location => {
    // 构建该地点下的 时机×场景 映射
    const timeScenarioMap: Record<string, Record<string, number>> = {};
    
    times.forEach(time => {
      timeScenarioMap[time] = {};
      scenarios.forEach(scenario => {
        timeScenarioMap[time][scenario] = 0;
      });
    });
    
    let locationCount = 0;
    
    reviews.forEach(review => {
      const hasLocation = (review.theme_highlights || [])
        .some((t: any) => t.theme_type === 'where' && t.label_name === location);
      
      if (hasLocation) {
        const reviewTimes = (review.theme_highlights || [])
          .filter((t: any) => t.theme_type === 'when')
          .map((t: any) => t.label_name);
        
        const reviewScenarios = (review.theme_highlights || [])
          .filter((t: any) => t.theme_type === 'scenario')
          .map((t: any) => t.label_name);
        
        reviewTimes.forEach(time => {
          reviewScenarios.forEach(scenario => {
            if (timeScenarioMap[time] && timeScenarioMap[time][scenario] !== undefined) {
              timeScenarioMap[time][scenario]++;
              locationCount++;
            }
          });
        });
      }
    });
    
    // 转换为2D矩阵
    const matrixData = times.map(time => 
      scenarios.map(scenario => timeScenarioMap[time][scenario] || 0)
    );
    
    return {
      label: location,
      rows: times,
      columns: scenarios,
      data: matrixData,
      count: locationCount,
    };
  })
  .filter(slice => slice.count > 0) // 过滤掉没有数据的地点
  .sort((a, b) => b.count - a.count); // 按数据量排序
  
  return {
    locations,
    times,
    scenarios,
    slices,
  };
}

/**
 * 计算购买者-使用者-动机关系（3D组合：决策逻辑链）
 */
export function calculateBuyerUserMotivationRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, pivot_matrices } = input;
  
  const buyerThemes = Array.isArray(aggregated_themes['buyer']) ? aggregated_themes['buyer'] : [];
  const userThemes = Array.isArray(aggregated_themes['user']) ? aggregated_themes['user'] : [];
  const whyThemes = Array.isArray(aggregated_themes['why']) ? aggregated_themes['why'] : [];
  
  const buyers = buyerThemes.map((t: any) => t.label || t);
  const users = userThemes.map((t: any) => t.label || t);
  const motivations = whyThemes.map((t: any) => t.label || t);
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.buyer_user_motivation && buyers.length > 0 && users.length > 0 && motivations.length > 0) {
    const matrix3D = pivot_matrices.buyer_user_motivation;
    
    const slices = buyers.map(buyer => {
      const buyerData = matrix3D[buyer] || {};
      
      const matrixData = users.map(user => {
        const userData = buyerData[user] || {};
        return motivations.map(motivation => userData[motivation] || 0);
      });
      
      const count = matrixData.reduce((sum, row) => 
        sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
      );
      
      return {
        label: buyer,
        rows: users,
        columns: motivations,
        data: matrixData,
        count,
      };
    })
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count);
    
    return {
      buyers,
      users,
      motivations,
      slices,
    };
  }
  
  // 降级：从reviews计算（数据可能不完整）
  const buyerUserMotivationMap: Record<string, Record<string, Record<string, number>>> = {};
  
  reviews.forEach(review => {
    const reviewBuyers = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'buyer')
      .map((t: any) => t.label_name);
    const reviewUsers = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'user')
      .map((t: any) => t.label_name);
    const reviewMotivations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'why')
      .map((t: any) => t.label_name);
    
    reviewBuyers.forEach(buyer => {
      if (!buyerUserMotivationMap[buyer]) {
        buyerUserMotivationMap[buyer] = {};
      }
      reviewUsers.forEach(user => {
        if (!buyerUserMotivationMap[buyer][user]) {
          buyerUserMotivationMap[buyer][user] = {};
        }
        reviewMotivations.forEach(motivation => {
          buyerUserMotivationMap[buyer][user][motivation] = 
            (buyerUserMotivationMap[buyer][user][motivation] || 0) + 1;
        });
      });
    });
  });
  
  const slices = buyers.map(buyer => {
    const buyerData = buyerUserMotivationMap[buyer] || {};
    
    const matrixData = users.map(user => {
      const userData = buyerData[user] || {};
      return motivations.map(motivation => userData[motivation] || 0);
    });
    
    const count = matrixData.reduce((sum, row) => 
      sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
    );
    
    return {
      label: buyer,
      rows: users,
      columns: motivations,
      data: matrixData,
      count,
    };
  })
  .filter(slice => slice.count > 0)
  .sort((a, b) => b.count - a.count);
  
  return {
    buyers,
    users,
    motivations,
    slices,
  };
}

/**
 * 计算产品优势-场景-情感关系（3D组合：品牌记忆点）
 */
export function calculateStrengthScenarioEmotionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {}, pivot_matrices } = input;
  
  // 从aggregated_insights收集维度
  const strengthDimensions = new Set<string>();
  (aggregated_insights.strengths || []).forEach((item: any) => {
    if (item.dimension && item.dimension !== '其他') {
      strengthDimensions.add(item.dimension);
    }
  });
  
  const scenarioThemes = Array.isArray(aggregated_themes['scenario']) ? aggregated_themes['scenario'] : [];
  const emotionThemes = Array.isArray(aggregated_themes['emotion']) ? aggregated_themes['emotion'] : [];
  
  const strengths = Array.from(strengthDimensions);
  const scenarios = scenarioThemes.map((t: any) => t.label || t);
  const emotions = emotionThemes.map((t: any) => t.label || t);
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.strength_scenario_emotion && strengths.length > 0 && scenarios.length > 0 && emotions.length > 0) {
    const matrix3D = pivot_matrices.strength_scenario_emotion;
    
    const slices = strengths.map(strength => {
      const strengthData = matrix3D[strength] || {};
      
      const matrixData = scenarios.map(scenario => {
        const scenarioData = strengthData[scenario] || {};
        return emotions.map(emotion => scenarioData[emotion] || 0);
      });
      
      const count = matrixData.reduce((sum, row) => 
        sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
      );
      
      return {
        label: strength,
        rows: scenarios,
        columns: emotions,
        data: matrixData,
        count,
      };
    })
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count);
    
    return {
      strengths,
      scenarios,
      emotions,
      slices,
    };
  }
  
  // 降级：从reviews计算（数据可能不完整）
  const strengthScenarioEmotionMap: Record<string, Record<string, Record<string, number>>> = {};
  
  reviews.forEach(review => {
    const reviewStrengths = (review.insights || [])
      .filter((i: any) => i.type === 'strength' && i.dimension && i.dimension !== '其他')
      .map((i: any) => i.dimension);
    const reviewScenarios = (review.insights || [])
      .filter((i: any) => i.type === 'scenario' && i.dimension)
      .map((i: any) => i.dimension);
    const reviewEmotions = (review.insights || [])
      .filter((i: any) => i.type === 'emotion' && i.dimension)
      .map((i: any) => i.dimension);
    
    reviewStrengths.forEach(strength => {
      if (!strengthScenarioEmotionMap[strength]) {
        strengthScenarioEmotionMap[strength] = {};
      }
      reviewScenarios.forEach(scenario => {
        if (!strengthScenarioEmotionMap[strength][scenario]) {
          strengthScenarioEmotionMap[strength][scenario] = {};
        }
        reviewEmotions.forEach(emotion => {
          strengthScenarioEmotionMap[strength][scenario][emotion] = 
            (strengthScenarioEmotionMap[strength][scenario][emotion] || 0) + 1;
        });
      });
    });
  });
  
  const slices = strengths.map(strength => {
    const strengthData = strengthScenarioEmotionMap[strength] || {};
    
    const matrixData = scenarios.map(scenario => {
      const scenarioData = strengthData[scenario] || {};
      return emotions.map(emotion => scenarioData[emotion] || 0);
    });
    
    const count = matrixData.reduce((sum, row) => 
      sum + row.reduce((rowSum, val) => rowSum + val, 0), 0
    );
    
    return {
      label: strength,
      rows: scenarios,
      columns: emotions,
      data: matrixData,
      count,
    };
  })
  .filter(slice => slice.count > 0)
  .sort((a, b) => b.count - a.count);
  
  return {
    strengths,
    scenarios,
    emotions,
    slices,
  };
}

/**
 * 计算动机-劣势-建议关系（3D：研发优先级）
 */
export function calculateMotivationWeaknessSuggestionRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {}, pivot_matrices } = input;
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.motivation_weakness_suggestion) {
    const matrix = pivot_matrices.motivation_weakness_suggestion;
    
    const motivations = Object.keys(matrix);
    const weaknessSet = new Set<string>();
    const suggestionSet = new Set<string>();
    
    motivations.forEach(motivation => {
      Object.keys(matrix[motivation]).forEach(weakness => {
        weaknessSet.add(weakness);
        Object.keys(matrix[motivation][weakness]).forEach(suggestion => {
          suggestionSet.add(suggestion);
        });
      });
    });
    
    const weaknesses = Array.from(weaknessSet);
    const suggestions = Array.from(suggestionSet);
    
    const slices = motivations.map(motivation => {
      const motivationData = matrix[motivation];
      
      const matrixData = weaknesses.map(weakness => {
        return suggestions.map(suggestion => {
          return motivationData[weakness]?.[suggestion] || 0;
        });
      });
      
      const count = matrixData.flat().reduce((sum, val) => sum + val, 0);
      
      return {
        label: motivation,
        rows: weaknesses,
        columns: suggestions,
        data: matrixData,
        count,
      };
    })
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count);
    
    return {
      motivations,
      weaknesses,
      suggestions,
      slices,
    };
  }
  
  // 降级：从reviews计算（数据可能不完整）
  const motivationWeaknessSuggestionMap: Record<string, Record<string, Record<string, number>>> = {};
  
  reviews.forEach(review => {
    const reviewMotivations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'why')
      .map((t: any) => t.label_name);
    const reviewWeaknesses = (review.insights || [])
      .filter((i: any) => i.insight_type === 'weakness')
      .map((i: any) => i.dimension);
    const reviewSuggestions = (review.insights || [])
      .filter((i: any) => i.insight_type === 'suggestion')
      .map((i: any) => i.dimension);
    
    reviewMotivations.forEach(motivation => {
      if (!motivationWeaknessSuggestionMap[motivation]) {
        motivationWeaknessSuggestionMap[motivation] = {};
      }
      reviewWeaknesses.forEach(weakness => {
        if (!motivationWeaknessSuggestionMap[motivation][weakness]) {
          motivationWeaknessSuggestionMap[motivation][weakness] = {};
        }
        reviewSuggestions.forEach(suggestion => {
          motivationWeaknessSuggestionMap[motivation][weakness][suggestion] = 
            (motivationWeaknessSuggestionMap[motivation][weakness][suggestion] || 0) + 1;
        });
      });
    });
  });
  
  const motivations = Object.keys(motivationWeaknessSuggestionMap);
  const weaknessSet = new Set<string>();
  const suggestionSet = new Set<string>();
  
  motivations.forEach(motivation => {
    Object.keys(motivationWeaknessSuggestionMap[motivation]).forEach(weakness => {
      weaknessSet.add(weakness);
      Object.keys(motivationWeaknessSuggestionMap[motivation][weakness]).forEach(suggestion => {
        suggestionSet.add(suggestion);
      });
    });
  });
  
  const weaknesses = Array.from(weaknessSet);
  const suggestions = Array.from(suggestionSet);
  
  const slices = motivations.map(motivation => {
    const motivationData = motivationWeaknessSuggestionMap[motivation] || {};
    
    const matrixData = weaknesses.map(weakness => {
      return suggestions.map(suggestion => {
        return motivationData[weakness]?.[suggestion] || 0;
      });
    });
    
    const count = matrixData.flat().reduce((sum, val) => sum + val, 0);
    
    return {
      label: motivation,
      rows: weaknesses,
      columns: suggestions,
      data: matrixData,
      count,
    };
  })
  .filter(slice => slice.count > 0)
  .sort((a, b) => b.count - a.count);
  
  return {
    motivations,
    weaknesses,
    suggestions,
    slices,
  };
}

/**
 * 计算情感-维度-地点关系（3D：环境冲突）
 */
export function calculateEmotionDimensionLocationRelation(input: PivotCalculatorInput) {
  const { reviews, aggregated_themes = {}, aggregated_insights = {}, pivot_matrices } = input;
  
  // 🚀 优先使用后端预聚合数据
  if (pivot_matrices?.emotion_dimension_location) {
    const matrix = pivot_matrices.emotion_dimension_location;
    
    const emotions = Object.keys(matrix);
    const dimensionSet = new Set<string>();
    const locationSet = new Set<string>();
    
    emotions.forEach(emotion => {
      Object.keys(matrix[emotion]).forEach(dimension => {
        dimensionSet.add(dimension);
        Object.keys(matrix[emotion][dimension]).forEach(location => {
          locationSet.add(location);
        });
      });
    });
    
    const dimensions = Array.from(dimensionSet);
    const locations = Array.from(locationSet);
    
    const slices = emotions.map(emotion => {
      const emotionData = matrix[emotion];
      
      const matrixData = dimensions.map(dimension => {
        return locations.map(location => {
          return emotionData[dimension]?.[location] || 0;
        });
      });
      
      const count = matrixData.flat().reduce((sum, val) => sum + val, 0);
      
      return {
        label: emotion,
        rows: dimensions,
        columns: locations,
        data: matrixData,
        count,
      };
    })
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count);
    
    return {
      emotions,
      dimensions,
      locations,
      slices,
    };
  }
  
  // 降级：从reviews计算（数据可能不完整）
  const emotionDimensionLocationMap: Record<string, Record<string, Record<string, number>>> = {};
  
  reviews.forEach(review => {
    const reviewEmotions = (review.insights || [])
      .filter((i: any) => i.insight_type === 'emotion')
      .map((i: any) => i.dimension);
    const reviewStrengths = (review.insights || [])
      .filter((i: any) => i.insight_type === 'strength')
      .map((i: any) => i.dimension);
    const reviewWeaknesses = (review.insights || [])
      .filter((i: any) => i.insight_type === 'weakness')
      .map((i: any) => i.dimension);
    const reviewDimensions = [...reviewStrengths, ...reviewWeaknesses];
    const reviewLocations = (review.theme_highlights || [])
      .filter((t: any) => t.theme_type === 'where')
      .map((t: any) => t.label_name);
    
    reviewEmotions.forEach(emotion => {
      if (!emotionDimensionLocationMap[emotion]) {
        emotionDimensionLocationMap[emotion] = {};
      }
      reviewDimensions.forEach(dimension => {
        if (!emotionDimensionLocationMap[emotion][dimension]) {
          emotionDimensionLocationMap[emotion][dimension] = {};
        }
        reviewLocations.forEach(location => {
          emotionDimensionLocationMap[emotion][dimension][location] = 
            (emotionDimensionLocationMap[emotion][dimension][location] || 0) + 1;
        });
      });
    });
  });
  
  const emotions = Object.keys(emotionDimensionLocationMap);
  const dimensionSet = new Set<string>();
  const locationSet = new Set<string>();
  
  emotions.forEach(emotion => {
    Object.keys(emotionDimensionLocationMap[emotion]).forEach(dimension => {
      dimensionSet.add(dimension);
      Object.keys(emotionDimensionLocationMap[emotion][dimension]).forEach(location => {
        locationSet.add(location);
      });
    });
  });
  
  const dimensions = Array.from(dimensionSet);
  const locations = Array.from(locationSet);
  
  const slices = emotions.map(emotion => {
    const emotionData = emotionDimensionLocationMap[emotion] || {};
    
    const matrixData = dimensions.map(dimension => {
      return locations.map(location => {
        return emotionData[dimension]?.[location] || 0;
      });
    });
    
    const count = matrixData.flat().reduce((sum, val) => sum + val, 0);
    
    return {
      label: emotion,
      rows: dimensions,
      columns: locations,
      data: matrixData,
      count,
    };
  })
  .filter(slice => slice.count > 0)
  .sort((a, b) => b.count - a.count);
  
  return {
    emotions,
    dimensions,
    locations,
    slices,
  };
}
