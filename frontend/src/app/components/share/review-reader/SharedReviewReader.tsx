/**
 * SharedReviewReader - 洞察大王分析报告
 * 
 * 优化：高级感设计、弹窗交互、信息完整展示
 */
import { useState, useMemo, useEffect } from 'react';
import { 
  Star, Package, ExternalLink, ThumbsUp, ThumbsDown,
  Lightbulb, MapPin, Clock, Target,
  ShieldCheck, Search, ShoppingBag, User, Zap, X, Quote, Link2, Users, Heart, Clapperboard,
  Sparkles, Loader2, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Crown, Medal, Award, Gauge
} from 'lucide-react';
import { EyeIcon } from '../../EyeIcon';

interface SharedReviewReaderProps {
  data: {
    product?: any;
    reviews?: Array<any>;
    stats?: any;
    aggregated_insights?: any;
    aggregated_themes?: any;
    context_labels?: Record<string, any[]>;
    dimension_summaries?: Array<any>;
  };
  title: string | null;
  token: string;
  onDataRefresh?: () => void;
}

type TabType = 'overview' | 'reviews';
type GenerateStatus = 'idle' | 'loading' | 'success' | 'error';

export function SharedReviewReader({ data, token, onDataRefresh }: SharedReviewReaderProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<{ type: string; label: string; reviewIds: string[]; allItems?: any[] } | null>(null);
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>('idle');
  const [generateMessage, setGenerateMessage] = useState('');
  const [dimensionModal, setDimensionModal] = useState<{ dim: string; summary: any; s: any[]; w: any[]; u: any[] } | null>(null);
  const [expandedThemeSummary, setExpandedThemeSummary] = useState(false);
  const [emotionModal, setEmotionModal] = useState(false);
  const [scenarioModal, setScenarioModal] = useState(false);
  const [dataChangeCheck, setDataChangeCheck] = useState<{ has_changes: boolean; checking: boolean; message: string } | null>(null);
  const [reviewViewMode, setReviewViewMode] = useState<'sentiment' | 'rating' | 'buyer' | 'user' | 'where' | 'when' | 'why' | 'what'>('sentiment');
  
  // 分页加载评论相关状态
  const [fullReviews, setFullReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [hasLoadedReviews, setHasLoadedReviews] = useState(false);
  const [reviewsTotal, setReviewsTotal] = useState(0);

  const hasAISummaries = useMemo(() => {
    const summaries = data.dimension_summaries || [];
    return summaries.some((s: any) => s.summary_type === 'consumer_persona' || s.summary_type === 'overall');
  }, [data.dimension_summaries]);

  // 加载全部评论（分页获取）
  const loadAllReviews = async () => {
    if (loadingReviews || hasLoadedReviews) return;
    
    setLoadingReviews(true);
    try {
      const allReviews: any[] = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;
      
      while (hasMore) {
        const response = await fetch(`/api/v1/share/${token}/reviews?page=${page}&page_size=${pageSize}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
          throw new Error('加载评论失败');
        }
        
        const result = await response.json();
        allReviews.push(...(result.reviews || []));
        setReviewsTotal(result.total || 0);
        
        hasMore = result.has_next;
        page++;
        
        // 防止无限循环，最多加载50页
        if (page > 50) break;
      }
      
      setFullReviews(allReviews);
      setHasLoadedReviews(true);
    } catch (err) {
      console.error('加载评论失败:', err);
      // 失败时回退使用 data.reviews
      setFullReviews(data.reviews || []);
    } finally {
      setLoadingReviews(false);
    }
  };

  // 切换到评论Tab时加载全部评论
  useEffect(() => {
    if (activeTab === 'reviews' && !hasLoadedReviews && !loadingReviews) {
      loadAllReviews();
    }
  }, [activeTab, hasLoadedReviews, loadingReviews]);

  // 检查数据变化
  const checkDataChanges = async () => {
    setDataChangeCheck({ has_changes: false, checking: true, message: '正在检查数据变化...' });
    try {
      const response = await fetch(`/api/v1/share/${token}/check-data-changes`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('检查失败');
      }
      const result = await response.json();
      setDataChangeCheck({
        has_changes: result.has_changes,
        checking: false,
        message: result.message || (result.has_changes ? '数据已发生变化' : '数据未发生变化')
      });
      return result.has_changes;
    } catch (err: any) {
      setDataChangeCheck({
        has_changes: true, // 检查失败时允许生成，避免阻塞
        checking: false,
        message: '检查失败，可以尝试重新生成'
      });
      return true; // 检查失败时允许生成
    }
  };

  // 组件加载时检查数据变化
  useEffect(() => {
    if (hasAISummaries) {
      checkDataChanges();
    }
  }, [hasAISummaries, token]);

  // 禁止全局滚动（评论明细页面）
  useEffect(() => {
    if (activeTab === 'reviews') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [activeTab]);

  const handleGenerateAI = async () => {
    if (generateStatus === 'loading') return;
    
    // 先检查数据变化
    const hasChanges = await checkDataChanges();
    if (!hasChanges) {
      setGenerateStatus('error');
      setGenerateMessage('数据未发生变化，无需重新生成');
      return;
    }
    
    setGenerateStatus('loading');
    setGenerateMessage('正在生成AI分析，预计需要1-3分钟...');
    try {
      const response = await fetch(`/api/v1/share/${token}/generate-summaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '生成失败');
      }
      const result = await response.json();
      setGenerateStatus('success');
      setGenerateMessage(result.message || 'AI分析生成完成');
      // 重新检查数据变化状态
      setTimeout(() => checkDataChanges(), 2000);
      if (onDataRefresh) {
        setTimeout(() => onDataRefresh(), 1000);
      }
    } catch (err: any) {
      setGenerateStatus('error');
      setGenerateMessage(err.message || '生成AI分析失败');
    }
  };

  const { product, reviews = [], stats, aggregated_insights = {}, aggregated_themes = {}, context_labels = {} } = data;

  const getLabels = (key: string) => {
    const t = aggregated_themes[key] || [];
    if (t.length > 0 && t.some((x: any) => x.count > 0)) return t;
    const c = context_labels[key] || [];
    return c.map((x: any) => ({ label: x.name, count: x.count || 1, review_ids: [] }));
  };

  const dimGroups = useMemo(() => {
    const g: Record<string, { s: any[]; w: any[]; u: any[] }> = {};
    ['strengths', 'weaknesses', 'suggestions'].forEach(type => {
      (aggregated_insights[type] || []).forEach((item: any) => {
        const d = item.dimension || '其他';
        if (!g[d]) g[d] = { s: [], w: [], u: [] };
        g[d][type === 'strengths' ? 's' : type === 'weaknesses' ? 'w' : 'u'].push(item);
      });
    });
    return g;
  }, [aggregated_insights]);

  const emotions = aggregated_insights.emotions || [];
  const scenarios = aggregated_insights.scenarios || [];

  // 使用完整评论数据（分页加载后）或预览数据
  const displayReviews = useMemo(() => {
    return hasLoadedReviews && fullReviews.length > 0 ? fullReviews : reviews;
  }, [hasLoadedReviews, fullReviews, reviews]);

  const filteredReviews = useMemo(() => {
    return searchQuery ? displayReviews.filter(r => r.title?.toLowerCase().includes(searchQuery.toLowerCase()) || r.content?.toLowerCase().includes(searchQuery.toLowerCase())) : displayReviews;
  }, [displayReviews, searchQuery]);

  const reviewsBySentiment = useMemo(() => {
    return { positive: filteredReviews.filter(r => r.sentiment === 'positive'), neutral: filteredReviews.filter(r => r.sentiment === 'neutral'), negative: filteredReviews.filter(r => r.sentiment === 'negative') };
  }, [filteredReviews]);

  // 按星级分组
  const reviewsByRating = useMemo(() => {
    return {
      5: filteredReviews.filter(r => r.rating === 5),
      4: filteredReviews.filter(r => r.rating === 4),
      3: filteredReviews.filter(r => r.rating === 3),
      2: filteredReviews.filter(r => r.rating === 2),
      1: filteredReviews.filter(r => r.rating === 1),
    };
  }, [filteredReviews]);

  // 按5W主题分组
  const reviewsByTheme = useMemo(() => {
    const groups: Record<string, { label: string; reviews: any[] }[]> = {
      buyer: [], user: [], where: [], when: [], why: [], what: []
    };
    // 先收集每个主题类型下的所有标签
    const labelMap: Record<string, Record<string, any[]>> = {
      buyer: {}, user: {}, where: {}, when: {}, why: {}, what: {}
    };
    filteredReviews.forEach(r => {
      const themes = r.theme_highlights || [];
      themes.forEach((t: any) => {
        const type = t.theme_type;
        const label = t.label_name;
        if (labelMap[type]) {
          if (!labelMap[type][label]) labelMap[type][label] = [];
          if (!labelMap[type][label].find((x: any) => x.id === r.id)) {
            labelMap[type][label].push(r);
          }
        }
      });
    });
    // 转换为数组格式并排序
    Object.keys(groups).forEach(type => {
      groups[type] = Object.entries(labelMap[type])
        .map(([label, revs]) => ({ label, reviews: revs }))
        .sort((a, b) => b.reviews.length - a.reviews.length);
    });
    return groups;
  }, [filteredReviews]);

  const themeConfig = [
    { key: 'buyer', label: 'Buyer', sub: '购买者', icon: ShoppingBag, color: '#3B82F6', bg: 'from-blue-500 to-blue-600' },
    { key: 'user', label: 'User', sub: '使用者', icon: User, color: '#06B6D4', bg: 'from-cyan-500 to-cyan-600' },
    { key: 'where', label: 'Where', sub: '地点', icon: MapPin, color: '#8B5CF6', bg: 'from-violet-500 to-violet-600' },
    { key: 'when', label: 'When', sub: '时机', icon: Clock, color: '#10B981', bg: 'from-emerald-500 to-emerald-600' },
    { key: 'why', label: 'Why', sub: '动机', icon: Target, color: '#F43F5E', bg: 'from-rose-500 to-rose-600' },
    { key: 'what', label: 'What', sub: '用途', icon: Zap, color: '#F59E0B', bg: 'from-amber-500 to-amber-600' },
  ];

  const findReview = (id: string) => reviews.find(r => r.id === id);

  // 消费者原型 - 从AI数据读取占比
  const consumerPersonas = useMemo(() => {
    const personas = (data.dimension_summaries || []).filter((s: any) => s.summary_type === 'consumer_persona');
    return personas.map((p: any, idx: number) => ({
      ...p,
      percentage: p.persona_data?.percentage || p.persona_data?.proportion || null,
      rank: idx + 1
    }));
  }, [data.dimension_summaries]);

  // 整体总结
  const overallSummary = useMemo(() => {
    return (data.dimension_summaries || []).find((s: any) => s.summary_type === 'overall');
  }, [data.dimension_summaries]);

  // 5W主题AI总结
  const themeSummaries = useMemo(() => {
    const summaries: Record<string, any> = {};
    (data.dimension_summaries || []).forEach((s: any) => {
      if (s.summary_type?.startsWith('theme_')) {
        const key = s.summary_type.replace('theme_', '');
        summaries[key] = s;
      }
    });
    return summaries;
  }, [data.dimension_summaries]);

  // 维度AI总结
  const dimensionSummaries = useMemo(() => {
    const summaries: Record<string, any> = {};
    (data.dimension_summaries || []).forEach((s: any) => {
      if (s.summary_type === 'dimension' && s.category) {
        summaries[s.category] = s;
      }
    });
    return summaries;
  }, [data.dimension_summaries]);

  // 情感AI总结 - 获取所有不同category的总结，并关联对应的洞察
  const emotionSummaries = useMemo(() => {
    const summaries = (data.dimension_summaries || []).filter((s: any) => s.summary_type === 'emotion');
    // 按dimension分组emotions
    const emotionsByDim: Record<string, any[]> = {};
    emotions.forEach((e: any) => {
      const dim = e.dimension || '其他';
      if (!emotionsByDim[dim]) emotionsByDim[dim] = [];
      emotionsByDim[dim].push(e);
    });
    // 为每个summary关联对应的insights
    return summaries.map((s: any) => ({
      ...s,
      insights: emotionsByDim[s.category] || emotionsByDim[s.title] || [],
      insightCount: (emotionsByDim[s.category] || emotionsByDim[s.title] || []).length
    }));
  }, [data.dimension_summaries, emotions]);
  
  // 场景AI总结 - 获取所有不同category的总结，并关联对应的洞察
  const scenarioSummaries = useMemo(() => {
    const summaries = (data.dimension_summaries || []).filter((s: any) => s.summary_type === 'scenario');
    // 按dimension分组scenarios
    const scenariosByDim: Record<string, any[]> = {};
    scenarios.forEach((s: any) => {
      const dim = s.dimension || '其他';
      if (!scenariosByDim[dim]) scenariosByDim[dim] = [];
      scenariosByDim[dim].push(s);
    });
    // 为每个summary关联对应的insights
    return summaries.map((s: any) => ({
      ...s,
      insights: scenariosByDim[s.category] || scenariosByDim[s.title] || [],
      insightCount: (scenariosByDim[s.category] || scenariosByDim[s.title] || []).length
    }));
  }, [data.dimension_summaries, scenarios]);

  const rankIcons = [Crown, Medal, Award];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <EyeIcon className="w-8 h-8" withBackground />
              <span className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">洞察大王分析报告</span>
            </div>
            <div className="flex bg-gray-100 rounded-xl p-1 ml-4">
              {[{ k: 'overview', l: '数据总览' }, { k: 'reviews', l: '评论明细' }].map(t => (
                <button key={t.k} onClick={() => setActiveTab(t.k as TabType)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {product?.average_rating && (
              <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                <span className="text-lg font-bold text-amber-700">{product.average_rating.toFixed(1)}</span>
                <span className="text-xs text-amber-600">({reviews.length})</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full">{stats?.sentiment_distribution?.positive || 0}正</span>
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{stats?.sentiment_distribution?.neutral || 0}中</span>
              <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-full">{stats?.sentiment_distribution?.negative || 0}负</span>
            </div>
          </div>
        </div>
        
        {product && (
          <div className="max-w-7xl mx-auto px-4 py-2 border-t border-gray-100/50 flex items-center gap-3">
            {product.image_url ? <img src={product.image_url} alt="" className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-white" />
              : <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Package className="h-5 w-5 text-gray-400" /></div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs mb-0.5">
                <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded text-[10px] font-mono">{product.asin}</span>
                <a href={`https://amazon.com/dp/${product.asin}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5"><ExternalLink className="h-3 w-3" />Amazon</a>
              </div>
              <p className="text-sm text-gray-700 truncate">{product.title}</p>
            </div>
          </div>
        )}
      </header>

      <main className={activeTab === 'overview' ? 'max-w-7xl mx-auto px-4 py-6' : 'px-4 py-4 overflow-hidden h-[calc(100vh-120px)]'}>
        {activeTab === 'overview' ? (
          <div className="space-y-6">
            {/* AI分析生成入口 */}
            <section className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-[1px]">
              <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/90 to-pink-50/90 backdrop-blur rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">AI 智能分析</h3>
                      <p className="text-xs text-gray-500">{hasAISummaries ? '已生成深度分析报告' : '一键生成深度分析报告'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {generateStatus === 'loading' && <span className="text-xs text-indigo-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{generateMessage}</span>}
                    {generateStatus === 'success' && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{generateMessage}</span>}
                    {generateStatus === 'error' && <span className="text-xs text-rose-600">{generateMessage}</span>}
                    <button onClick={handleGenerateAI} disabled={generateStatus === 'loading'}
                      className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shadow-lg ${
                        hasAISummaries ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-gray-100' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-indigo-200'
                      } ${generateStatus === 'loading' ? 'opacity-50' : ''}`}>
                      {generateStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : hasAISummaries ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      {hasAISummaries ? '重新生成' : '生成分析'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 一句话总结 - 结构化展示 */}
            {overallSummary && (
              <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center">
                    <Zap className="h-3.5 w-3.5 text-white" />
                  </div>
                  这款产品怎么样？
                </h3>
                {(() => {
                  // 尝试解析结构化数据
                  const structured = overallSummary.key_points?.find((p: any) => p.structured)?.structured;
                  if (structured && !structured.raw) {
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        {structured.target_users && (
                          <div className="bg-amber-50 rounded-xl p-3 border-l-3 border-amber-400">
                            <span className="text-xs font-bold text-amber-600 block mb-1">用户群体</span>
                            <p className="text-sm text-gray-700">{structured.target_users}</p>
                          </div>
                        )}
                        {structured.usage_scenario && (
                          <div className="bg-cyan-50 rounded-xl p-3 border-l-3 border-cyan-400">
                            <span className="text-xs font-bold text-cyan-600 block mb-1">使用场景</span>
                            <p className="text-sm text-gray-700">{structured.usage_scenario}</p>
                          </div>
                        )}
                        {structured.main_pros && (
                          <div className="bg-emerald-50 rounded-xl p-3 border-l-3 border-emerald-400">
                            <span className="text-xs font-bold text-emerald-600 block mb-1">主要优势</span>
                            <p className="text-sm text-gray-700">{Array.isArray(structured.main_pros) ? structured.main_pros.join('；') : structured.main_pros}</p>
                          </div>
                        )}
                        {structured.main_cons && (
                          <div className="bg-rose-50 rounded-xl p-3 border-l-3 border-rose-400">
                            <span className="text-xs font-bold text-rose-600 block mb-1">主要问题</span>
                            <p className="text-sm text-gray-700">{Array.isArray(structured.main_cons) ? structured.main_cons.join('；') : structured.main_cons}</p>
                          </div>
                        )}
                        {structured.recommendation && (
                          <div className="col-span-2 bg-blue-50 rounded-xl p-3 border-l-3 border-blue-400">
                            <span className="text-xs font-bold text-blue-600 block mb-1">改进建议</span>
                            <p className="text-sm text-gray-700">{structured.recommendation}</p>
                          </div>
                        )}
                      </div>
                    );
                  }
                  // 回退到纯文本
                  return <p className="text-gray-700 leading-relaxed text-sm">{overallSummary.summary}</p>;
                })()}
              </section>
            )}

            {/* 消费者原型 */}
            {consumerPersonas.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-white" />
                  </div>
                  消费者原型
                </h2>
                <div className="grid grid-cols-5 gap-3">
                  {consumerPersonas.map((persona: any, i: number) => {
                    const RankIcon = rankIcons[i] || Award;
                    const rankColors = ['from-amber-400 to-orange-500', 'from-gray-300 to-gray-400', 'from-amber-600 to-amber-700'];
                    const pd = persona.persona_data || {};
                    return (
                      <div key={i} className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-indigo-200 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${rankColors[i] || 'from-gray-200 to-gray-300'} flex items-center justify-center shadow-sm`}>
                            <RankIcon className="h-3.5 w-3.5 text-white" />
                          </div>
                          {persona.percentage && (
                            <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{persona.percentage}%</span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-gray-900 mb-1.5">{persona.title || `类型${i + 1}`}</h4>
                        <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-2">{persona.summary}</p>
                        {Object.keys(pd).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
                            {pd.buyer && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">{pd.buyer}</span>}
                            {pd.user && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{pd.user}</span>}
                            {pd.where && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]">{pd.where}</span>}
                            {pd.when && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px]">{pd.when}</span>}
                            {pd.why && <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px]">{pd.why}</span>}
                            {pd.what && <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-700 rounded text-[10px]">{pd.what}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 用户画像 · 5W分析 - 显示全部标签 */}
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-white" />
                </div>
                用户画像 · 5W分析
              </h2>
              <div className="grid grid-cols-6 gap-3 mb-4">
                {themeConfig.map(({ key, label, sub, icon: Icon, color, bg }) => {
                  const items = getLabels(key);
                  const total = items.reduce((s: number, x: any) => s + (x.count || 0), 0);
                  const maxCount = Math.max(...items.map((x: any) => x.count || 0), 1);
                  return (
                    <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
                      <div className={`px-3 py-2 bg-gradient-to-r ${bg} flex items-center justify-between`}>
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-white" />
                          <span className="text-xs font-bold text-white">{label}</span>
                          <span className="text-[10px] text-white/70">{sub}</span>
                        </div>
                        <span className="text-sm font-bold text-white">{total}</span>
                      </div>
                      {/* 显示全部标签，限制高度可滚动 */}
                      <div className="p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                        {items.map((x: any, i: number) => {
                          const pct = ((x.count || 0) / maxCount) * 100;
                          return (
                            <div key={i} className="cursor-pointer hover:bg-gray-50 rounded p-1 -m-1" onClick={() => setSelectedLabel({ type: key, label: x.label || x.name, reviewIds: x.review_ids || [] })}>
                              <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span className="text-gray-700 truncate font-medium">{x.label || x.name}</span>
                                <span className="font-bold" style={{ color }}>{x.count}</span>
                              </div>
                              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* 5W AI主题解读 - 可展开 */}
              {Object.keys(themeSummaries).length > 0 && (
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-[1px]">
                  <div className="bg-gradient-to-r from-blue-50/95 to-indigo-50/95 backdrop-blur rounded-xl p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-500" />AI 主题解读
                      </h4>
                      <button onClick={() => setExpandedThemeSummary(!expandedThemeSummary)} 
                        className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        {expandedThemeSummary ? <><ChevronUp className="h-3 w-3" />收起</> : <><ChevronDown className="h-3 w-3" />展开全部</>}
                      </button>
                    </div>
                    <div className={`space-y-2 ${expandedThemeSummary ? '' : 'max-h-24 overflow-hidden'}`}>
                      {themeConfig.map(({ key, label, color }) => {
                        const summary = themeSummaries[key];
                        if (!summary) return null;
                        // 尝试解析结构化数据
                        const structured = summary.key_points?.find((p: any) => p.structured)?.structured;
                        const hasStructured = structured && !structured.raw;
                        return (
                          <div key={key} className="bg-white/60 rounded-lg p-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-xs" style={{ color }}>{label}</span>
                            </div>
                            {hasStructured ? (
                              <table className="w-full text-xs text-gray-700">
                                <tbody>
                                  {structured.key_insight && (
                                    <tr>
                                      <td className="py-0.5 pr-3 align-top whitespace-nowrap"><span className="font-bold text-indigo-500">核心发现</span></td>
                                      <td className="py-0.5 leading-relaxed">{structured.key_insight}</td>
                                    </tr>
                                  )}
                                  {structured.pattern && (
                                    <tr>
                                      <td className="py-0.5 pr-3 align-top whitespace-nowrap"><span className="font-bold text-purple-500">模式趋势</span></td>
                                      <td className="py-0.5 leading-relaxed">{structured.pattern}</td>
                                    </tr>
                                  )}
                                  {structured.recommendation && (
                                    <tr>
                                      <td className="py-0.5 pr-3 align-top whitespace-nowrap"><span className="font-bold text-blue-500">营销建议</span></td>
                                      <td className="py-0.5 leading-relaxed">{structured.recommendation}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            ) : (
                              <span className="text-xs text-gray-700 leading-relaxed">{summary.summary}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!expandedThemeSummary && <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-blue-50 to-transparent pointer-events-none rounded-b-xl"></div>}
                  </div>
                </div>
              )}
            </section>

            {/* 大家都在说什么 */}
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <ThumbsUp className="h-3.5 w-3.5 text-white" />
                </div>
                大家都在说什么
              </h2>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-600 w-28">维度</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-600">用户评价总结</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-emerald-600 w-20">
                          <div className="flex items-center justify-center gap-1"><ThumbsUp className="h-3 w-3" />好评</div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-rose-600 w-20">
                          <div className="flex items-center justify-center gap-1"><ThumbsDown className="h-3 w-3" />吐槽</div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-blue-600 w-20">
                          <div className="flex items-center justify-center gap-1"><Lightbulb className="h-3 w-3" />期待</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(dimGroups).map(([dim, { s, w, u }], idx) => {
                        const dimSummary = dimensionSummaries[dim];
                        const structured = dimSummary?.key_points?.find((p: any) => p.structured)?.structured;
                        const colors = ['border-l-blue-500', 'border-l-violet-500', 'border-l-emerald-500', 'border-l-amber-500', 'border-l-rose-500', 'border-l-cyan-500'];
                        return (
                          <tr key={dim} 
                            onClick={() => setDimensionModal({ dim, summary: dimSummary, s, w, u })}
                            className={`border-l-4 ${colors[idx % colors.length]} hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 cursor-pointer transition-all group`}>
                            <td className="px-5 py-4">
                              <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition-colors">{dim}</span>
                            </td>
                            <td className="px-5 py-3">
                              {structured && !structured.raw ? (
                                <div className="space-y-1">
                                  {structured.overall && <p className="text-xs text-gray-800 font-medium">{structured.overall}</p>}
                                  <div className="flex flex-wrap gap-2 text-[11px]">
                                    {structured.pros_highlight && <span className="text-emerald-600"><ThumbsUp className="h-3 w-3 inline mr-0.5" />{structured.pros_highlight}</span>}
                                    {structured.cons_highlight && <span className="text-rose-600"><ThumbsDown className="h-3 w-3 inline mr-0.5" />{structured.cons_highlight}</span>}
                                    {structured.suggestion && <span className="text-blue-600"><Lightbulb className="h-3 w-3 inline mr-0.5" />{structured.suggestion}</span>}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 group-hover:text-gray-800">
                                  {dimSummary?.summary || '点击查看详情'}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[32px] h-7 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 rounded-lg text-xs font-bold shadow-sm">{s.length}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[32px] h-7 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 rounded-lg text-xs font-bold shadow-sm">{w.length}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[32px] h-7 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 rounded-lg text-xs font-bold shadow-sm">{u.length}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 真实感受 + 使用场景 - 卡片形式，点击弹窗 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 真实感受 */}
              <section 
                onClick={() => setEmotionModal(true)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-rose-200 transition-all cursor-pointer group">
                <div className="px-4 py-3 bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-white" />
                    <span className="text-sm font-bold text-white">真实感受</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{emotionSummaries.length}类</span>
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{emotions.length}条</span>
                  </div>
                </div>
                <div className="p-4">
                  {emotionSummaries.length > 0 ? (
                    <div className="space-y-2.5">
                      {emotionSummaries.slice(0, 4).map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-bold text-rose-600">{s.category || s.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded">{s.insightCount || s.evidence_count || 0}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 line-clamp-1 flex-1">{s.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : emotions.length > 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">{emotions.length} 条情感洞察</p>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">暂无数据</p>
                  )}
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-center">
                  <span className="text-xs text-rose-600 group-hover:text-rose-700 font-medium">点击查看完整分析 →</span>
                </div>
              </section>

              {/* 使用场景 */}
              <section 
                onClick={() => setScenarioModal(true)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-violet-200 transition-all cursor-pointer group">
                <div className="px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-white" />
                    <span className="text-sm font-bold text-white">怎么用的</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{scenarioSummaries.length}类</span>
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{scenarios.length}条</span>
                  </div>
                </div>
                <div className="p-4">
                  {scenarioSummaries.length > 0 ? (
                    <div className="space-y-2.5">
                      {scenarioSummaries.slice(0, 4).map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-bold text-violet-600">{s.category || s.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">{s.insightCount || s.evidence_count || 0}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 line-clamp-1 flex-1">{s.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : scenarios.length > 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">{scenarios.length} 条场景洞察</p>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">暂无数据</p>
                  )}
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-center">
                  <span className="text-xs text-violet-600 group-hover:text-violet-700 font-medium">点击查看完整分析 →</span>
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* 评论明细 - 多视角切换 */
          <div className="w-full h-full flex flex-col overflow-hidden">
            {/* 视角切换Tab和搜索 */}
            <div className="mb-4 shrink-0 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {[
                  { key: 'sentiment', label: '情感', icon: Heart },
                  { key: 'rating', label: '星级', icon: Star },
                  { key: 'buyer', label: 'Buyer', sub: '购买者' },
                  { key: 'user', label: 'User', sub: '使用者' },
                  { key: 'where', label: 'Where', sub: '地点' },
                  { key: 'when', label: 'When', sub: '时机' },
                  { key: 'why', label: 'Why', sub: '动机' },
                  { key: 'what', label: 'What', sub: '用途' },
                ].map(v => (
                  <button key={v.key} onClick={() => setReviewViewMode(v.key as any)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${reviewViewMode === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {v.label}
                    {v.sub && <span className="text-[10px] text-gray-400 ml-0.5 hidden sm:inline">{v.sub}</span>}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="搜索评论..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
            </div>
            
            {/* 加载状态 */}
            {loadingReviews && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                  <p className="text-sm text-gray-500">正在加载全部评论数据...</p>
                  {reviewsTotal > 0 && (
                    <p className="text-xs text-gray-400">共 {reviewsTotal} 条评论</p>
                  )}
                </div>
              </div>
            )}

            {/* 情感视角 - 3列 */}
            {!loadingReviews && reviewViewMode === 'sentiment' && (
              <div className="flex gap-4 flex-1 min-h-0">
                {(['positive', 'neutral', 'negative'] as const).map(s => {
                  const cfg = { 
                    positive: { t: '正面评价', gradient: 'from-emerald-500 to-teal-600' }, 
                    neutral: { t: '中性评价', gradient: 'from-gray-400 to-gray-500' }, 
                    negative: { t: '负面评价', gradient: 'from-rose-500 to-pink-600' } 
                  }[s];
                  const list = reviewsBySentiment[s];
                  return (
                    <div key={s} className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className={`px-4 py-3 bg-gradient-to-r ${cfg.gradient} flex items-center gap-2 shrink-0`}>
                        <span className="text-sm font-bold text-white">{cfg.t}</span>
                        <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{list.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                        {list.map(r => <ReviewCard key={r.id} review={r} />)}
                        {list.length === 0 && <p className="text-xs text-gray-400 text-center py-8">暂无评价</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 星级视角 - 5列 */}
            {!loadingReviews && reviewViewMode === 'rating' && (
              <div className="flex gap-3 flex-1 min-h-0">
                {([5, 4, 3, 2, 1] as const).map(rating => {
                  const list = reviewsByRating[rating];
                  const colors = {
                    5: 'from-emerald-500 to-green-600',
                    4: 'from-lime-500 to-green-500',
                    3: 'from-amber-400 to-yellow-500',
                    2: 'from-orange-400 to-amber-500',
                    1: 'from-rose-500 to-red-600',
                  };
                  return (
                    <div key={rating} className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className={`px-3 py-2.5 bg-gradient-to-r ${colors[rating]} flex items-center justify-center gap-1.5 shrink-0`}>
                        <span className="text-sm font-bold text-white">{rating}</span>
                        <Star className="h-3.5 w-3.5 text-white fill-white" />
                        <span className="text-xs text-white/80 bg-white/20 px-1.5 py-0.5 rounded-full ml-1">{list.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                        {list.map(r => <ReviewCard key={r.id} review={r} />)}
                        {list.length === 0 && <p className="text-xs text-gray-400 text-center py-8">暂无</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 5W主题视角 - 按标签分组 */}
            {!loadingReviews && ['buyer', 'user', 'where', 'when', 'why', 'what'].includes(reviewViewMode) && (
              <div className="flex-1 min-h-0 overflow-hidden">
                {(() => {
                  const themeKey = reviewViewMode as 'buyer' | 'user' | 'where' | 'when' | 'why' | 'what';
                  const labels = reviewsByTheme[themeKey] || [];
                  const themeInfo = themeConfig.find(t => t.key === themeKey);
                  if (labels.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-gray-400 text-sm">暂无 {themeInfo?.label} 主题数据</p>
                      </div>
                    );
                  }
                  // 最多显示6列
                  const displayLabels = labels.slice(0, 6);
                  return (
                    <div className="flex gap-3 h-full">
                      {displayLabels.map(({ label, reviews: revs }) => (
                        <div key={label} className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                          <div className={`px-3 py-2.5 bg-gradient-to-r ${themeInfo?.bg} flex items-center gap-2 shrink-0`}>
                            {themeInfo?.icon && <themeInfo.icon className="h-3.5 w-3.5 text-white" />}
                            <span className="text-xs font-bold text-white truncate">{label}</span>
                            <span className="text-[10px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded-full ml-auto shrink-0">{revs.length}</span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                            {revs.map((r: any) => <ReviewCard key={r.id} review={r} />)}
                            {revs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">暂无</p>}
                          </div>
                        </div>
                      ))}
                      {/* 如果标签超过6个，显示更多提示 */}
                      {labels.length > 6 && (
                        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 rounded-2xl border border-dashed border-gray-300 items-center justify-center">
                          <p className="text-xs text-gray-500">还有 {labels.length - 6} 个标签</p>
                          <p className="text-[10px] text-gray-400 mt-1">使用搜索筛选</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 维度详情弹窗 - 原文直接显示 */}
      {dimensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDimensionModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{dimensionModal.dim}</h3>
                <p className="text-sm text-gray-500">用户评价详情</p>
              </div>
              <button onClick={() => setDimensionModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            {dimensionModal.summary && (
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 shrink-0">
                {(() => {
                  const structured = dimensionModal.summary.key_points?.find((p: any) => p.structured)?.structured;
                  if (structured && !structured.raw) {
                    return (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          <span className="text-sm font-bold text-gray-800">AI 分析</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 ml-6">
                          {structured.overall && (
                            <div className="col-span-2 bg-white/60 rounded-lg p-2">
                              <span className="text-xs font-bold text-gray-500">整体评价</span>
                              <p className="text-sm text-gray-700 mt-0.5">{structured.overall}</p>
                            </div>
                          )}
                          {structured.pros_highlight && (
                            <div className="bg-emerald-50/60 rounded-lg p-2 border-l-2 border-emerald-400">
                              <span className="text-xs font-bold text-emerald-600">值得称赞</span>
                              <p className="text-sm text-gray-700 mt-0.5">{structured.pros_highlight}</p>
                            </div>
                          )}
                          {structured.cons_highlight && (
                            <div className="bg-rose-50/60 rounded-lg p-2 border-l-2 border-rose-400">
                              <span className="text-xs font-bold text-rose-600">需要关注</span>
                              <p className="text-sm text-gray-700 mt-0.5">{structured.cons_highlight}</p>
                            </div>
                          )}
                          {structured.suggestion && (
                            <div className="col-span-2 bg-blue-50/60 rounded-lg p-2 border-l-2 border-blue-400">
                              <span className="text-xs font-bold text-blue-600">改进建议</span>
                              <p className="text-sm text-gray-700 mt-0.5">{structured.suggestion}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-700 leading-relaxed">{dimensionModal.summary.summary}</p>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h5 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                      <ThumbsUp className="h-3 w-3 text-white" />
                    </div>
                    大家喜欢 ({dimensionModal.s.length})
                  </h5>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {dimensionModal.s.map((item: any, i: number) => (
                      <InsightCard key={i} item={item} type="positive" findReview={findReview} />
                    ))}
                    {dimensionModal.s.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">暂无</p>}
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-bold text-rose-700 mb-3 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg flex items-center justify-center">
                      <ThumbsDown className="h-3 w-3 text-white" />
                    </div>
                    需要注意 ({dimensionModal.w.length})
                  </h5>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {dimensionModal.w.map((item: any, i: number) => (
                      <InsightCard key={i} item={item} type="negative" findReview={findReview} />
                    ))}
                    {dimensionModal.w.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">暂无</p>}
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Lightbulb className="h-3 w-3 text-white" />
                    </div>
                    希望改进 ({dimensionModal.u.length})
                  </h5>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {dimensionModal.u.map((item: any, i: number) => (
                      <InsightCard key={i} item={item} type="suggestion" findReview={findReview} />
                    ))}
                    {dimensionModal.u.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">暂无</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 标签详情弹窗 - 显示置信度和AI推理 */}
      {selectedLabel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedLabel(null)} />
          <div className="relative w-[480px] bg-white shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white shrink-0">
              <div><h3 className="text-base font-bold text-gray-900">{selectedLabel.label}</h3><p className="text-xs text-gray-500">{selectedLabel.type.toUpperCase()}</p></div>
              <button onClick={() => setSelectedLabel(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedLabel.allItems ? (
                <div className="space-y-2">
                  {selectedLabel.allItems.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                      onClick={() => setSelectedLabel({ type: selectedLabel.type, label: item.label || item.name, reviewIds: item.review_ids || [] })}>
                      <span className="text-sm text-gray-700">{item.label || item.name}</span>
                      <span className="text-sm font-bold text-indigo-600">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  let list = reviews.filter(r => selectedLabel.reviewIds.includes(r.id));
                  if (!list.length) list = reviews.filter(r => (r.theme_highlights || []).some((t: any) => t.theme_type === selectedLabel.type && (t.label_name === selectedLabel.label)));
                  if (!list.length) return <p className="text-xs text-gray-400 text-center py-8">无相关评论</p>;
                  return list.slice(0, 20).map(r => <ReviewCardWithInsights key={r.id} review={r} labelType={selectedLabel.type} labelName={selectedLabel.label} />);
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* 情感分析弹窗 - 类型与洞察对应 */}
      {emotionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEmotionModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Heart className="h-6 w-6 text-white" />
                <div>
                  <h3 className="text-lg font-bold text-white">真实感受分析</h3>
                  <p className="text-sm text-white/80">{emotionSummaries.length} 类情感 · {emotions.length} 条洞察</p>
                </div>
              </div>
              <button onClick={() => setEmotionModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X className="h-5 w-5 text-white" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {/* 按情感类型分组展示 - 每个类型下显示对应的洞察 */}
              <div className="space-y-6">
                {emotionSummaries.map((summary: any, i: number) => (
                  <div key={i} className="border border-rose-100 rounded-xl overflow-hidden">
                    {/* 类型标题和AI总结 */}
                    <div className="p-4 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-rose-500" />
                          <span className="text-sm font-bold text-rose-700">{summary.category || summary.title}</span>
                        </div>
                        <span className="text-xs px-2 py-1 bg-rose-100 text-rose-600 rounded-full">{summary.insightCount || summary.evidence_count || 0} 条</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed">{summary.summary}</p>
                    </div>
                    {/* 该类型下的洞察列表 */}
                    <div className="p-3 bg-white max-h-48 overflow-y-auto">
                      {summary.insights && summary.insights.length > 0 ? (
                        <div className="space-y-2">
                          {summary.insights.map((item: any, j: number) => (
                            <div key={j} className="p-2 bg-gray-50 rounded-lg text-xs">
                              <p className="text-gray-700">{item.analysis}</p>
                              {item.quote_translated && (
                                <p className="mt-1 text-[10px] text-gray-400 italic border-l-2 border-rose-200 pl-2">"{item.quote_translated}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">暂无具体洞察</p>
                      )}
                    </div>
                  </div>
                ))}
                {emotionSummaries.length === 0 && emotions.length > 0 && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h5 className="text-sm font-bold text-gray-700 mb-3">全部洞察 ({emotions.length})</h5>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {emotions.map((item: any, i: number) => (
                        <div key={i} className="p-2 bg-gray-50 rounded-lg text-xs">
                          <p className="text-gray-700">{item.analysis}</p>
                          {item.quote_translated && (
                            <p className="mt-1 text-[10px] text-gray-400 italic">"{item.quote_translated}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 场景分析弹窗 - 类型与洞察对应 */}
      {scenarioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setScenarioModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Clapperboard className="h-6 w-6 text-white" />
                <div>
                  <h3 className="text-lg font-bold text-white">使用场景分析</h3>
                  <p className="text-sm text-white/80">{scenarioSummaries.length} 类场景 · {scenarios.length} 条洞察</p>
                </div>
              </div>
              <button onClick={() => setScenarioModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X className="h-5 w-5 text-white" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {/* 按场景类型分组展示 - 每个类型下显示对应的洞察 */}
              <div className="space-y-6">
                {scenarioSummaries.map((summary: any, i: number) => (
                  <div key={i} className="border border-violet-100 rounded-xl overflow-hidden">
                    {/* 类型标题和AI总结 */}
                    <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-violet-500" />
                          <span className="text-sm font-bold text-violet-700">{summary.category || summary.title}</span>
                        </div>
                        <span className="text-xs px-2 py-1 bg-violet-100 text-violet-600 rounded-full">{summary.insightCount || summary.evidence_count || 0} 条</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed">{summary.summary}</p>
                    </div>
                    {/* 该类型下的洞察列表 */}
                    <div className="p-3 bg-white max-h-48 overflow-y-auto">
                      {summary.insights && summary.insights.length > 0 ? (
                        <div className="space-y-2">
                          {summary.insights.map((item: any, j: number) => (
                            <div key={j} className="p-2 bg-gray-50 rounded-lg text-xs">
                              <p className="text-gray-700">{item.analysis}</p>
                              {item.quote_translated && (
                                <p className="mt-1 text-[10px] text-gray-400 italic border-l-2 border-violet-200 pl-2">"{item.quote_translated}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">暂无具体洞察</p>
                      )}
                    </div>
                  </div>
                ))}
                {scenarioSummaries.length === 0 && scenarios.length > 0 && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h5 className="text-sm font-bold text-gray-700 mb-3">全部洞察 ({scenarios.length})</h5>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {scenarios.map((item: any, i: number) => (
                        <div key={i} className="p-2 bg-gray-50 rounded-lg text-xs">
                          <p className="text-gray-700">{item.analysis}</p>
                          {item.quote_translated && (
                            <p className="mt-1 text-[10px] text-gray-400 italic">"{item.quote_translated}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 洞察卡片 - 直接显示原文
function InsightCard({ item, type, findReview }: { item: any; type: 'positive' | 'negative' | 'suggestion'; findReview: (id: string) => any }) {
  const colorMap = {
    positive: { bg: 'from-emerald-50 to-teal-50', border: 'border-emerald-100', quote: 'border-emerald-300 bg-emerald-50/50' },
    negative: { bg: 'from-rose-50 to-pink-50', border: 'border-rose-100', quote: 'border-rose-300 bg-rose-50/50' },
    suggestion: { bg: 'from-blue-50 to-indigo-50', border: 'border-blue-100', quote: 'border-blue-300 bg-blue-50/50' }
  };
  const colors = colorMap[type];
  const review = item.review_id ? findReview(item.review_id) : null;

  return (
    <div className={`p-3 bg-gradient-to-r ${colors.bg} rounded-xl border ${colors.border}`}>
      {/* AI分析 */}
      <p className="text-xs text-gray-700 leading-relaxed">{item.analysis}</p>
      
      {/* 置信度 */}
      {item.confidence && (
        <div className="flex items-center gap-1 mt-2">
          <Gauge className="h-3 w-3 text-gray-400" />
          <span className="text-[10px] text-gray-500">置信度: {Math.round(item.confidence * 100)}%</span>
        </div>
      )}
      
      {/* 直接显示原文 */}
      {item.quote_translated && (
        <div className={`mt-2 p-2 border-l-2 ${colors.quote} rounded-r-lg`}>
          <div className="flex items-start gap-1.5">
            <Quote className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-600 italic leading-relaxed">"{item.quote_translated}"</p>
          </div>
        </div>
      )}
      
      {/* 来源评论信息 */}
      {review && (
        <div className="mt-2 pt-2 border-t border-gray-100/50 flex items-center justify-between text-[10px] text-gray-400">
          <div className="flex items-center gap-1">
            <Stars n={review.rating} />
            <span>{review.author}</span>
          </div>
          {review.review_url && (
            <a href={review.review_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
              <Link2 className="h-2.5 w-2.5" />查看
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// 带洞察的评论卡片 - 侧边弹窗使用
function ReviewCardWithInsights({ review, labelType, labelName }: { review: any; labelType: string; labelName: string }) {
  const themes = review.theme_highlights || [];
  const insights = review.insights || [];
  
  // 找到与当前标签相关的主题
  const relatedTheme = themes.find((t: any) => t.theme_type === labelType && t.label_name === labelName);
  
  // 从 items 数组中提取 explanation、confidence、quote_translated
  // 数据结构: { theme_type, label_name, items: [{ content, explanation, confidence, quote_translated }] }
  const themeItem = relatedTheme?.items?.[0];
  const explanation = themeItem?.explanation;
  const confidence = themeItem?.confidence;
  const quoteTranslated = themeItem?.quote_translated || themeItem?.content_original;
  
  // 找到相关的洞察
  const relatedInsights = insights.filter((i: any) => 
    i.dimension?.includes(labelName) || labelName.includes(i.dimension || '')
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-center justify-between mb-2">
        <Stars n={review.rating} />
        <div className="flex items-center gap-1.5">
          {review.verified && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded flex items-center gap-0.5"><ShieldCheck className="h-2.5 w-2.5" />已验证</span>}
        </div>
      </div>
      
      {review.title && <h4 className="text-xs font-bold text-gray-900 mb-1">{review.title}</h4>}
      <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{review.content}</p>
      
      {/* AI归类理由 - 从 items[0].explanation 读取 */}
      {relatedTheme && (
        <div className="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[11px] font-bold text-indigo-700">AI 归类理由</span>
            </div>
            {confidence && (
              <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                置信度: {typeof confidence === 'number' 
                  ? `${Math.round(confidence * 100)}%` 
                  : confidence}
              </span>
            )}
          </div>
          {/* explanation 字段是AI的真正推理过程 */}
          {explanation ? (
            <p className="text-[11px] text-gray-700 leading-relaxed">{explanation}</p>
          ) : (
            <p className="text-[11px] text-gray-400 italic">暂无AI归类解释</p>
          )}
          {/* 显示原文证据 */}
          {quoteTranslated && (
            <div className="mt-2 p-2 bg-white/60 rounded border-l-2 border-indigo-300">
              <div className="flex items-start gap-1.5">
                <Quote className="h-3 w-3 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-gray-500 italic">"{quoteTranslated}"</p>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 相关洞察 */}
      {relatedInsights.length > 0 && (
        <div className="mt-2 space-y-1">
          {relatedInsights.slice(0, 2).map((insight: any, i: number) => (
            <div key={i} className="p-2 bg-gray-50 rounded-lg text-[11px] text-gray-600">
              <span className="font-medium text-gray-700">{insight.dimension}:</span> {insight.analysis}
            </div>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
        <span>{review.author}</span>
        <span>{review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}</span>
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return <div className="flex">{[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= n ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />)}</div>;
}

function ReviewCard({ review, compact = false }: { review: any; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const themes = review.theme_highlights || [];
  const insights = review.insights || [];
  const tags = [...themes.filter((t: any) => ['buyer','user','where','when','why','what'].includes(t.theme_type)).map((t: any) => t.label_name), ...insights.map((i: any) => i.dimension)].filter(Boolean);
  
  // 判断文本是否需要展开（超过3行）
  const content = review.content || '';
  const needsExpand = content.length > 150; // 大约3行的字符数
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-center justify-between mb-1.5">
        <Stars n={review.rating} />
        <div className="flex items-center gap-1.5">
          {review.verified && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded flex items-center gap-0.5"><ShieldCheck className="h-2.5 w-2.5" />已验证</span>}
        </div>
      </div>
      {review.title && !compact && <h4 className="text-xs font-bold text-gray-900 mb-1 line-clamp-1">{review.title}</h4>}
      <div className="relative">
        <p className={`text-xs text-gray-600 leading-relaxed ${!expanded && needsExpand ? (compact ? 'line-clamp-2' : 'line-clamp-3') : ''}`}>
          {content}
        </p>
        {needsExpand && (
          <button 
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-[10px] text-blue-600 hover:text-blue-700 mt-1 font-medium"
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {[...new Set(tags)].slice(0, 3).map((t: string, i: number) => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{t}</span>)}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100 text-[10px] text-gray-400">
        <span>{review.author}</span>
        <span>{review.date ? new Date(review.date).toLocaleDateString('zh-CN') : ''}</span>
      </div>
    </div>
  );
}
