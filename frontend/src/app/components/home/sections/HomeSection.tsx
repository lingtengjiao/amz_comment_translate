/**
 * 首页内容区 - 1:1 复刻原始设计
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Zap, ChevronLeft, ChevronRight, Package, X, Plus, Settings, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { useHome } from '../HomeContext';
import { EyeIcon } from '../../EyeIcon';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { ProductSelectDialog } from '../dialogs/ProductSelectDialog';
import { AdvancedOptionsDialog } from '../dialogs/AdvancedOptionsDialog';
import { AnalysisModal, AnalysisType } from '../../AnalysisModal';
import apiService from '../../../../api/service';

interface UserProject {
  id: string;
  asin: string;
  title: string | null;
  image_url: string | null;
}

export function HomeSection() {
  const navigate = useNavigate();
  const { 
    homeMode, setHomeMode, 
    crawlInput, setCrawlInput,
    isCrawling, setIsCrawling,
    crawlProgress, setCrawlProgress,
    crawlMode, setCrawlMode,
    crawlPages, setCrawlPages,
    crawlRating, setCrawlRating,
    showAdvancedOptionsDialog, setShowAdvancedOptionsDialog,
    compareProducts, setCompareProducts,
    showProductSelectDialog, setShowProductSelectDialog,
  } = useHome();

  // 已选产品详情
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<UserProject[]>([]);
  
  // 分析弹窗状态
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [isCreatingAnalysis, setIsCreatingAnalysis] = useState(false);
  
  // 分析模式：一步到位 或 仅翻译
  const [workflowMode, setWorkflowMode] = useState<'one_step_insight' | 'translate_only'>('one_step_insight');

  // 加载已选产品详情
  useEffect(() => {
    if (compareProducts.length > 0) {
      loadSelectedProjectDetails();
    } else {
      setSelectedProjectDetails([]);
    }
  }, [compareProducts]);

  const loadSelectedProjectDetails = async () => {
    try {
      const response = await apiService.getMyProjects(false);
      const projects = response.projects || [];
      const selected = projects.filter(p => compareProducts.includes(p.asin));
      setSelectedProjectDetails(selected);
    } catch (err) {
      console.error('Failed to load project details:', err);
    }
  };

  // 切换首页模式
  const toggleHomeMode = (direction: "prev" | "next") => {
    setHomeMode(current => {
      if (direction === "prev") {
        return current === "analyze" ? "compare" : "analyze";
      } else {
        return current === "analyze" ? "compare" : "analyze";
      }
    });
  };

  // 提取 ASIN（支持 URL 或直接输入 ASIN）
  const extractAsin = (input: string): string | null => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/\/dp\/([A-Z0-9]{10})/i) || 
                    trimmed.match(/\/product\/([A-Z0-9]{10})/i) ||
                    trimmed.match(/asin=([A-Z0-9]{10})/i);
    if (urlMatch) return urlMatch[1].toUpperCase();
    if (/^[A-Z0-9]{10}$/i.test(trimmed)) return trimmed.toUpperCase();
    return null;
  };

  // 开始分析
  const handleStartAnalysis = async () => {
    if (homeMode === "analyze") {
      // 解析输入的多个链接/ASIN
      const lines = crawlInput.split('\n').filter(line => line.trim());
      const asins = lines.map(line => extractAsin(line)).filter(Boolean) as string[];
      
      if (asins.length === 0) {
        toast.error('请输入有效的 ASIN 或亚马逊商品链接');
        return;
      }

      if (asins.length > 5) {
        toast.error('最多支持同时采集 5 个产品');
        return;
      }

      // 通过 Chrome Extension 进行爬取
      try {
        // 检查 Extension ID
        const extensionId = localStorage.getItem('voc_extension_id') || '';
        if (!extensionId) {
          toast.error('请先在高级选项中配置 Chrome 扩展 ID');
          setShowAdvancedOptionsDialog(true);
          return;
        }

        // 检查 Extension 是否可用
        if (!window.chrome?.runtime) {
          toast.error('请安装并启用 Chrome 扩展来采集产品数据');
          return;
        }

        setIsCrawling(true);
        setCrawlProgress(0);

        // 发送消息到 Extension 进行爬取
        const crawlConfig = {
          stars: crawlRating,           // [1, 2, 3, 4, 5] 或用户选择的星级
          pagesPerStar: crawlPages,     // 3, 5, 或 10
          speedMode: crawlMode,         // 'fast' 或 'stable'
          mediaType: 'all_formats',     // 默认采集所有格式
          workflowMode: workflowMode    // 'one_step_insight' 或 'translate_only'
        };

        // 模拟进度（实际进度由 Extension 提供）
        const progressInterval = setInterval(() => {
          setCrawlProgress((prev) => {
            if (prev >= 95) {
              clearInterval(progressInterval);
              return 95;
            }
            return prev + 5;
          });
        }, 500);

        // 批量发送爬取请求 - 使用 BATCH_START_EXTERNAL
        const result = await new Promise((resolve, reject) => {
          window.chrome!.runtime!.sendMessage(
            extensionId,  // 使用配置的 Extension ID
            { 
              type: 'BATCH_START_EXTERNAL',  // 外部消息使用的正确类型
              asins: asins,
              config: crawlConfig
            },
            (response) => {
              if (window.chrome?.runtime?.lastError) {
                reject(window.chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            }
          );
        });

        clearInterval(progressInterval);
        
        // 任务提交成功，立即重置状态
        setIsCrawling(false);
        setCrawlProgress(0);
        
        if (result && (result as any).success) {
          toast.success(
            `已添加 ${asins.length} 个产品到采集队列，扩展正在后台采集数据，请稍后在"我的洞察"中查看`
          );
          // 清空输入框，防止用户再次点击发送相同的 ASIN
          setCrawlInput('');
        } else {
          toast.error('采集失败：' + ((result as any)?.error || '未知错误'));
        }

      } catch (err) {
        setIsCrawling(false);
        setCrawlProgress(0);
        console.error('Crawl error:', err);
        toast.error('采集失败：' + (err as Error).message);
      }
    } else {
      // 竞品对比模式 - 弹出分析项目创建弹窗
      if (compareProducts.length >= 2) {
        setShowAnalysisModal(true);
      }
    }
  };

  // 创建分析项目（支持对比分析和市场洞察）
  const handleCreateAnalysis = async (title: string, description?: string, analysisType?: AnalysisType) => {
    if (compareProducts.length < 2) {
      toast.error('至少需要选择 2 个产品');
      return;
    }

    setIsCreatingAnalysis(true);
    try {
      // 根据 ASIN 获取产品 ID
      const response = await apiService.getMyProjects(false);
      const projects = response.projects || [];
      
      // 构建产品列表 - 使用 product_id 而不是 id
      const productsList = compareProducts.map((asin, index) => {
        const project = projects.find((p: any) => p.asin === asin);
        return {
          product_id: project?.product_id || project?.id || asin,
          role_label: index === 0 ? 'target' : 'competitor',
        };
      });

      const result = await apiService.createAnalysisProject({
        title,
        description,
        products: productsList,
        auto_run: true,
        analysis_type: analysisType || 'comparison',
      });

      if (result.success && result.project) {
        const projectId = result.project.id;
        const typeName = analysisType === 'market_insight' ? '市场洞察' : '对比分析';
        toast.success(`${typeName}已启动`, {
          description: '分析预计需要 1-2 分钟，点击查看进度',
          duration: 8000,
          action: {
            label: '查看进度',
            onClick: () => navigate(`/analysis/${projectId}`),
          },
        });
        
        setShowAnalysisModal(false);
        setCompareProducts([]);
      } else {
        throw new Error(result.error || '创建失败');
      }
    } catch (error) {
      console.error('创建分析项目失败:', error);
      const errorMessage = error instanceof Error ? error.message : '创建分析项目失败';
      toast.error(errorMessage);
    } finally {
      setIsCreatingAnalysis(false);
    }
  };

  return (
    <>
      <div className="h-full flex items-center justify-center py-8">
        <div className="max-w-4xl w-full px-6 relative">
          {/* Left Arrow Button */}
          <button
            onClick={() => toggleHomeMode("prev")}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-10 h-10 rounded-full bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 flex items-center justify-center transition-all shadow-sm hover:shadow-md group"
            aria-label="上一个"
          >
            <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-rose-500" />
          </button>

          {/* Right Arrow Button */}
          <button
            onClick={() => toggleHomeMode("next")}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-10 h-10 rounded-full bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 flex items-center justify-center transition-all shadow-sm hover:shadow-md group"
            aria-label="下一个"
          >
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-rose-500" />
          </button>

          {/* Hero Section */}
          <div className="text-center mb-10">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <EyeIcon className="w-20 h-20" withBackground />
            </div>
            
            {/* Mode Tabs */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setHomeMode("analyze")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  homeMode === "analyze"
                    ? "bg-rose-500 text-white shadow-md"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-600"
                }`}
              >
                产品洞察
              </button>
              <button
                onClick={() => setHomeMode("compare")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  homeMode === "compare"
                    ? "bg-rose-500 text-white shadow-md"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-600"
                }`}
              >
                竞品对比
              </button>
            </div>

            {/* Title and Description with Animation */}
            <div className="relative h-[80px]">
              <div
                className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                  homeMode === "analyze" 
                    ? "opacity-100 translate-x-0" 
                    : "opacity-0 -translate-x-4 pointer-events-none"
                }`}
              >
                <h1 className="text-3xl font-bold text-slate-900 mb-3">深入洞察，听听用户怎么说</h1>
                <p className="text-base text-slate-600">粘贴产品链接，AI帮你挖掘用户真实心声 ✨</p>
              </div>
              <div
                className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                  homeMode === "compare" 
                    ? "opacity-100 translate-x-0" 
                    : "opacity-0 translate-x-4 pointer-events-none"
                }`}
              >
                <h1 className="text-3xl font-bold text-slate-900 mb-3">竞品大PK，谁更胜一筹</h1>
                <p className="text-base text-slate-600">多产品同台竞技，优劣势一目了然 🎯</p>
              </div>
            </div>
          </div>

          {/* Main Card - 固定高度确保两个模式一致 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 h-[340px] flex flex-col">
              {/* Input Section - Product Analyze Mode */}
              {homeMode === "analyze" && (
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <label className="text-sm font-medium text-slate-900">
                      输入亚马逊链接或 ASIN <span className="text-rose-600">（最多支持5个）</span>
                    </label>
                    <button
                      onClick={() => setShowAdvancedOptionsDialog(true)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition-all"
                      title="高级选项"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={crawlInput}
                    onChange={(e) => setCrawlInput(e.target.value)}
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm resize-none mb-4"
                    placeholder={`粘贴亚马逊链接或 ASIN，每行一个...

支持格式：
• https://www.amazon.com/dp/B09V3KXJPB
• https://www.amazon.com/gp/product/B09V3KXJPB
• B09V3KXJPB`}
                  />
                  
                  {/* 分析模式选择 - 二选一 */}
                  <div className="flex gap-2 mb-4 flex-shrink-0">
                    <button
                      onClick={() => setWorkflowMode('one_step_insight')}
                      className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        workflowMode === 'one_step_insight'
                          ? "bg-rose-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      一步到位
                    </button>
                    <button
                      onClick={() => setWorkflowMode('translate_only')}
                      className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        workflowMode === 'translate_only'
                          ? "bg-rose-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      仅翻译
                    </button>
                  </div>
                </div>
              )}

              {/* Input Section - Compare Mode */}
              {homeMode === "compare" && (
                <div className="flex-1 flex flex-col mb-4">
                  <label className="text-sm font-medium text-slate-900 mb-2 block flex-shrink-0">
                    选择对比产品 <span className="text-slate-500">（2-5个产品）</span>
                  </label>
                  
                  {/* No products selected - show select button */}
                  {compareProducts.length === 0 ? (
                    <button
                      onClick={() => setShowProductSelectDialog(true)}
                      className="flex-1 border-2 border-dashed border-slate-300 rounded-2xl hover:border-rose-400 hover:bg-rose-50 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-rose-600 transition-all"
                    >
                      <Package className="w-8 h-8" />
                      <div className="text-sm font-medium">点击选择产品</div>
                      <div className="text-xs text-slate-500">从产品库中选择要对比的产品</div>
                    </button>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Selected Products List */}
                      <div className="flex-1 overflow-y-auto -mx-2 px-2 min-h-0">
                        <div className="space-y-2">
                          {selectedProjectDetails.map((project) => (
                            <div 
                              key={project.id}
                              className="flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200"
                            >
                              <div className="w-11 h-11 flex-shrink-0 overflow-hidden bg-white rounded-lg">
                                <ImageWithFallback 
                                  src={project.image_url || ''}
                                  alt={project.title || 'Product'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-900 truncate leading-tight">
                                  {project.title || project.asin}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">{project.asin}</div>
                              </div>
                              <button
                                onClick={() => setCompareProducts(compareProducts.filter(asin => asin !== project.asin))}
                                className="flex-shrink-0 w-7 h-7 rounded-lg hover:bg-rose-200 flex items-center justify-center text-rose-600 hover:text-rose-700 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Add More Button & Count */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 flex-shrink-0">
                        <button
                          onClick={() => setShowProductSelectDialog(true)}
                          disabled={compareProducts.length >= 5}
                          className="flex-1 h-8 border border-slate-300 rounded-lg hover:border-rose-400 hover:bg-rose-50 flex items-center justify-center gap-1 text-xs font-medium text-slate-600 hover:text-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-600"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {compareProducts.length >= 5 ? '已达上限' : '继续添加'}
                        </button>
                        <div className="text-xs font-medium text-slate-600 flex-shrink-0">
                          已选 <span className="text-rose-600">{compareProducts.length}</span>/5
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Submit Button or Progress */}
            {!isCrawling ? (
              <Button 
                className="w-full h-12 text-base bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                disabled={homeMode === "analyze" ? !crawlInput.trim() : compareProducts.length < 2}
                onClick={handleStartAnalysis}
              >
                <Zap className="w-4 h-4 mr-2" />
                {homeMode === "analyze" 
                  ? (workflowMode === 'one_step_insight' ? "开始分析" : "开始翻译") 
                  : "开始对比"}
              </Button>
            ) : (
              <div className="space-y-3">
                {/* Progress Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-900">采集进度</span>
                    <span className="text-sm font-semibold text-rose-600">{crawlProgress}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${crawlProgress}%` }}
                    />
                  </div>
                </div>
                
                {/* Cancel Button */}
                <Button 
                  variant="outline"
                  className="w-full h-12 text-base border-slate-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => {
                    setIsCrawling(false);
                    setCrawlProgress(0);
                  }}
                >
                  取消采集
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Select Dialog */}
      <ProductSelectDialog />

      {/* Advanced Options Dialog */}
      <AdvancedOptionsDialog />

      {/* Analysis Modal - 创建对比分析项目 */}
      <AnalysisModal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        onSubmit={handleCreateAnalysis}
        count={compareProducts.length}
      />
    </>
  );
}
