/**
 * 数据透视洞察报告 - 主页面
 * 系统化、有条理地展示所有洞察
 */
import { useState, useEffect } from 'react';
import { BarChart3, Download, FileText, RefreshCw, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { PivotCalculatorInput } from './types';
import { AudienceInsight } from './insights/modules/AudienceInsight';
import { DemandInsight } from './insights/modules/DemandInsight';
import { ProductInsight } from './insights/modules/ProductInsight';
import { ScenarioInsight } from './insights/modules/ScenarioInsight';
import { BrandInsight } from './insights/modules/BrandInsight';
import { DrillDownModal } from './DrillDownModal';
import { DrillDownData } from './types';

type GenerateStatus = 'idle' | 'loading' | 'success' | 'error';

interface PivotInsightReportProps {
  data: {
    reviews?: Array<any>;
    aggregated_themes?: Record<string, any[]>;
    aggregated_insights?: any;
    pivot_matrices?: {
      location_suggestion?: Record<string, Record<string, number>>;
      motivation_location?: Record<string, Record<string, number>>;
      location_time_scenario?: Record<string, Record<string, Record<string, number>>>;
      buyer_user_motivation?: Record<string, Record<string, Record<string, number>>>;
      strength_scenario_emotion?: Record<string, Record<string, Record<string, number>>>;
      motivation_weakness_suggestion?: Record<string, Record<string, Record<string, number>>>;
      emotion_dimension_location?: Record<string, Record<string, Record<string, number>>>;
    };
  };
  token: string;
  onDataRefresh?: () => void;
}

export function PivotInsightReport({ data, token, onDataRefresh }: PivotInsightReportProps) {
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>('idle');
  const [generateMessage, setGenerateMessage] = useState('');
  const [hasAIInsights, setHasAIInsights] = useState(false);
  const [aiInsights, setAIInsights] = useState<any>(null);
  
  const calculatorInput: PivotCalculatorInput = {
    reviews: data.reviews || [],
    aggregated_themes: data.aggregated_themes || {},
    aggregated_insights: data.aggregated_insights || {},
    pivot_matrices: data.pivot_matrices,
  };
  
  const hasData = calculatorInput.reviews.length > 0;
  
  // 调试信息
  console.log('PivotInsightReport data:', {
    reviewsCount: calculatorInput.reviews.length,
    themesKeys: Object.keys(calculatorInput.aggregated_themes),
    insightsKeys: Object.keys(calculatorInput.aggregated_insights),
    sampleReview: calculatorInput.reviews[0],
  });
  
  // 检查并加载AI洞察
  const loadAIInsights = async () => {
    try {
      const response = await fetch(`/api/v1/share/${token}/pivot-insights`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache', // 禁用缓存，确保获取最新数据
      });
      if (response.ok) {
        const result = await response.json();
        setHasAIInsights(result.total > 0);
        if (result.total > 0) {
          setAIInsights(result.insights);
        }
      }
    } catch (err) {
      console.error('加载AI洞察失败:', err);
    }
  };

  useEffect(() => {
    loadAIInsights();
  }, [token]);
  
  // 🚀 生成数据透视AI洞察
  const handleGenerateAI = async () => {
    if (generateStatus === 'loading') return;
    
    setGenerateStatus('loading');
    setGenerateMessage('正在启动AI分析任务...');
    
    try {
      // Step 1: 启动异步任务
      const response = await fetch(`/api/v1/share/${token}/generate-pivot-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '启动任务失败');
      }
      const result = await response.json();
      
      if (!result.task_id) {
        // 兼容旧版同步模式
        setGenerateStatus('success');
        setGenerateMessage(result.message || '数据透视AI分析生成完成');
        // 重新加载AI洞察数据
        await loadAIInsights();
        if (onDataRefresh) setTimeout(() => onDataRefresh(), 1000);
        return;
      }
      
      // Step 2: 轮询任务状态
      setGenerateMessage('数据透视AI分析进行中，您可以继续浏览页面...');
      const taskId = result.task_id;
      let attempts = 0;
      const maxAttempts = 90; // 最多轮询3分钟
      const pollInterval = 2000; // 每2秒轮询一次
      
      const pollStatus = async () => {
        attempts++;
        try {
          const statusResponse = await fetch(`/api/v1/share/${token}/generate-pivot-insights/${taskId}`);
          if (!statusResponse.ok) {
            throw new Error('查询任务状态失败');
          }
          const statusResult = await statusResponse.json();
          
          if (statusResult.status === 'completed') {
            setGenerateStatus('success');
            setGenerateMessage(statusResult.message || '数据透视AI分析生成完成');
            // 重新加载AI洞察数据，确保获取最新生成的结果
            await loadAIInsights();
            setHasAIInsights(true);
            if (onDataRefresh) setTimeout(() => onDataRefresh(), 500);
            return;
          } else if (statusResult.status === 'failed') {
            setGenerateStatus('error');
            setGenerateMessage(statusResult.message || '数据透视AI分析失败');
            return;
          } else if (attempts < maxAttempts) {
            // 继续轮询
            setGenerateMessage(`数据透视AI分析进行中... (${Math.round(attempts * pollInterval / 1000)}秒)`);
            setTimeout(pollStatus, pollInterval);
          } else {
            setGenerateStatus('error');
            setGenerateMessage('分析超时，请稍后刷新页面查看结果');
          }
        } catch (err: any) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, pollInterval);
          } else {
            setGenerateStatus('error');
            setGenerateMessage('查询任务状态失败');
          }
        }
      };
      
      // 开始轮询
      setTimeout(pollStatus, pollInterval);
      
    } catch (err: any) {
      setGenerateStatus('error');
      setGenerateMessage(err.message || '生成数据透视AI分析失败');
    }
  };
  
  return (
    <div className="space-y-6">
      {/* 报告头部 */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="h-8 w-8" />
              <h1 className="text-2xl sm:text-3xl font-bold">数据透视洞察报告</h1>
            </div>
            <p className="text-sm sm:text-base text-white/90">
              基于 <span className="font-bold">{calculatorInput.reviews.length}</span> 条评论的深度交叉分析
            </p>
            <p className="text-xs sm:text-sm text-white/80 mt-1">
              AI 自动生成洞察，按业务目标分类呈现
            </p>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {/* AI生成按钮 */}
            <button
              onClick={handleGenerateAI}
              disabled={generateStatus === 'loading'}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all backdrop-blur-sm ${
                generateStatus === 'loading'
                  ? 'bg-white/20 cursor-wait'
                  : generateStatus === 'success'
                  ? 'bg-green-500/30 hover:bg-green-500/40'
                  : generateStatus === 'error'
                  ? 'bg-red-500/30 hover:bg-red-500/40'
                  : hasAIInsights
                  ? 'bg-white/20 hover:bg-white/30'
                  : 'bg-amber-500/40 hover:bg-amber-500/50 animate-pulse'
              }`}
              title={hasAIInsights ? '重新生成AI洞察' : '生成AI洞察'}
            >
              {generateStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : generateStatus === 'success' ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  生成完成
                </>
              ) : (
                <>
                  {hasAIInsights ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {hasAIInsights ? '重新生成' : '生成AI洞察'}
                </>
              )}
            </button>
            
            <button className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors backdrop-blur-sm">
              <Download className="h-4 w-4" />
              导出报告
            </button>
          </div>
        </div>
        
        {/* AI生成状态提示 */}
        {generateMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            generateStatus === 'loading'
              ? 'bg-blue-500/20 text-white'
              : generateStatus === 'success'
              ? 'bg-green-500/20 text-white'
              : 'bg-red-500/20 text-white'
          }`}>
            {generateMessage}
          </div>
        )}
        
        {/* 快速导航 */}
        <div className="mt-6 pt-6 border-t border-white/20">
          <p className="text-xs text-white/80 mb-3">快速跳转：</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '人群洞察', href: '#audience', color: 'bg-blue-500/30 hover:bg-blue-500/50' },
              { label: '需求洞察', href: '#demand', color: 'bg-green-500/30 hover:bg-green-500/50' },
              { label: '产品洞察', href: '#product', color: 'bg-purple-500/30 hover:bg-purple-500/50' },
              { label: '场景洞察', href: '#scenario', color: 'bg-amber-500/30 hover:bg-amber-500/50' },
              { label: '品牌洞察', href: '#brand', color: 'bg-pink-500/30 hover:bg-pink-500/50' },
            ].map((nav, idx) => (
              <a
                key={idx}
                href={nav.href}
                className={`px-3 py-1.5 ${nav.color} rounded-lg text-xs font-semibold transition-colors backdrop-blur-sm`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      
      {!hasData ? (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
          <FileText className="h-12 w-12 text-yellow-600 mx-auto mb-3" />
          <p className="text-sm text-yellow-800 font-semibold">暂无数据</p>
          <p className="text-xs text-yellow-700 mt-1">请等待评论数据加载完成</p>
        </div>
      ) : (
        <>
          {/* 洞察模块 */}
          <div id="audience" className="scroll-mt-6">
            <AudienceInsight data={calculatorInput} aiInsights={aiInsights?.audience} onDrillDown={setDrillDownData} />
          </div>
          
          <div id="demand" className="scroll-mt-6">
            <DemandInsight data={calculatorInput} aiInsights={aiInsights?.demand} onDrillDown={setDrillDownData} />
          </div>
          
          <div id="product" className="scroll-mt-6">
            <ProductInsight data={calculatorInput} aiInsights={aiInsights?.product} />
          </div>
          
          <div id="scenario" className="scroll-mt-6">
            <ScenarioInsight data={calculatorInput} aiInsights={aiInsights?.scenario} onDrillDown={setDrillDownData} />
          </div>
          
          <div id="brand" className="scroll-mt-6">
            <BrandInsight data={calculatorInput} aiInsights={aiInsights?.brand} onDrillDown={setDrillDownData} />
          </div>
          
          {/* 使用说明 */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border-2 border-gray-300 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-3">💡 如何使用这份报告</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>1. 人群洞察</strong>：用于精准定位目标受众，优化广告投放和文案话术</p>
              <p><strong>2. 需求洞察</strong>：验证产品是否满足用户期望，发现口碑传播点和风险点</p>
              <p><strong>3. 产品洞察</strong>：指导产品改进优先级，识别核心竞争力和差异化方向</p>
              <p><strong>4. 场景洞察</strong>：识别核心使用场景，优化场景化营销和产品适配</p>
              <p><strong>5. 品牌洞察</strong>：了解品牌心智和推荐意愿，指导品牌建设和口碑营销</p>
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-300">
                * 点击图表中的数据点可下钻查看具体评论<br/>
                * 建议结合多个维度的洞察综合决策
              </p>
            </div>
          </div>
        </>
      )}
      
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
