import {
  ArrowLeft,
  Languages,
  PlayCircle,
  ExternalLink,
  Image as ImageIcon,
  EyeOff,
  RefreshCw,
  Check,
  Tag,
  Maximize2,
  Minimize2,
  StopCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  Eye
} from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ReviewCard } from './ReviewCard';
import { ProductInfoCard } from './ProductInfoCard';
import { StatsCards } from './StatsCards';
import { FilterBar } from './FilterBar';
import { ThemeTagBar } from './ThemeTagBar';
import { MediaTabContent } from './MediaTabContent';
import { ProductReportDialog } from './ProductReportDialog';
import { ViewReportDialog } from './ViewReportDialog';
import { HiddenReviewsModal } from './HiddenReviewsModal';
import { EditReviewModal } from './EditReviewModal';
import { ConfirmDialog } from './ConfirmDialog';
import { InfoDialog } from './InfoDialog';
import { Progress } from './ui/progress';
import { themeTagsPreset, buildThemeTagsFromHighlights, type ThemeTag } from './ThemeHighlight';
import { apiService, transformStatsToTask, transformReviews } from '@/api';
import { getReportHistory } from '@/api/service';
import type { Task, Review, FilterRating, FilterSentiment, SortOption, ReviewThemeHighlight } from '@/api/types';
import { toast } from '../utils/toast';

const sentimentConfig = {
  positive: { label: '正面', color: 'bg-green-100 text-green-800' },
  negative: { label: '负面', color: 'bg-red-100 text-red-800' },
  neutral: { label: '中性', color: 'bg-gray-100 text-gray-800' }
};

export function ReviewReader() {
  const { taskId: asin } = useParams(); // taskId 实际上是 asin
  const navigate = useNavigate();
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<FilterRating>('all');
  const [sentimentFilter, setSentimentFilter] = useState<FilterSentiment>('all');
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [insightsExpanded, setInsightsExpanded] = useState(true); // 默认展开所有洞察
  const [activeThemes, setActiveThemes] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [isFullAnalysis, setIsFullAnalysis] = useState(false); // 完整分析模式（翻译+洞察+主题）
  // 虚拟滚动：滚动容器 ref
  const reviewListRef = useRef<HTMLDivElement>(null);
  const [showHiddenModal, setShowHiddenModal] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; reviewId: string | null }>({
    show: false,
    reviewId: null
  });
  const [infoDialog, setInfoDialog] = useState<{ show: boolean; title: string; message: string; type?: 'success' | 'info' | 'warning' }>({
    show: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReviews, setTotalReviews] = useState(0);
  const [translatedCount, setTranslatedCount] = useState(0);
  const [reviewsWithInsights, setReviewsWithInsights] = useState(0); // 已做洞察的评论数
  const [reviewsWithThemes, setReviewsWithThemes] = useState(0); // 已提取主题的评论数
  const [linkRating, setLinkRating] = useState(0); // 链接原始评分
  const [bulletPointsTranslated, setBulletPointsTranslated] = useState(false); // 五点是否已翻译
  const [apiRatingDistribution, setApiRatingDistribution] = useState<{5: number; 4: number; 3: number; 2: number; 1: number}>({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
  const [apiSentimentDistribution, setApiSentimentDistribution] = useState<{positive: number; neutral: number; negative: number}>({ positive: 0, neutral: 0, negative: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newlyTranslatedIds, setNewlyTranslatedIds] = useState<Set<string>>(new Set()); // 跟踪刚刚翻译完成的评论（触发打字机动画）
  const pageSize = 50;
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<{ active: boolean; timer: NodeJS.Timeout | null }>({ active: false, timer: null }); // 轮询状态管理
  const stuckDetectionRef = useRef<{ lastProgress: number; stuckCount: number }>({ lastProgress: 0, stuckCount: 0 }); // 卡住检测
  const manuallyStoppedRef = useRef(false); // 用户手动停止标志
  const [isTaskStuck, setIsTaskStuck] = useState(false); // 任务是否卡住
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false); // 报告对话框
  const [isViewReportDialogOpen, setIsViewReportDialogOpen] = useState(false); // 查看报告对话框
  const [hasReports, setHasReports] = useState(false); // 是否有报告
  const [activeTab, setActiveTab] = useState<'reviews' | 'media'>('reviews'); // 当前激活的 Tab
  
  // [NEW] 存储后端返回的活跃任务状态
  const [activeTasks, setActiveTasks] = useState<{
    translation: string;
    insights: string;
    themes: string;
  } | null>(null);

  // 加载产品统计信息和评论
  const fetchData = useCallback(async () => {
    if (!asin) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 并行获取产品统计和评论
      const [statsResponse, reviewsResponse] = await Promise.all([
        apiService.getProductStats(asin),
        apiService.getReviews({ asin, page: currentPage, pageSize })
      ]);
      
      const reviews = transformReviews(reviewsResponse.reviews);
      const taskData = transformStatsToTask(statsResponse, reviews);
      
      setTask(taskData);
      setTotalReviews(statsResponse.product.total_reviews);
      setTranslatedCount(statsResponse.product.translated_reviews);
      setReviewsWithInsights(statsResponse.product.reviews_with_insights || 0);
      setReviewsWithThemes(statsResponse.product.reviews_with_themes || 0);
      setLinkRating(statsResponse.product.average_rating);
      
      // 检查五点是否已翻译（有五点原文但没有翻译，或者没有五点则视为已完成）
      const hasBulletPoints = statsResponse.product.bullet_points && statsResponse.product.bullet_points.length > 0;
      const hasBulletPointsTranslated = !!(statsResponse.product.bullet_points_translated && statsResponse.product.bullet_points_translated.length > 0);
      const hasTitle = !!statsResponse.product.title;
      const hasTitleTranslated = !!statsResponse.product.title_translated;
      
      // 五点翻译完成条件：没有五点需要翻译，或者五点已翻译
      const bulletsDone = !hasBulletPoints || hasBulletPointsTranslated;
      const titleDone = !hasTitle || hasTitleTranslated;
      setBulletPointsTranslated(bulletsDone && titleDone);
      
      // 保存后端返回的评分分布和情感分布
      setApiRatingDistribution({
        5: statsResponse.rating_distribution.star_5,
        4: statsResponse.rating_distribution.star_4,
        3: statsResponse.rating_distribution.star_3,
        2: statsResponse.rating_distribution.star_2,
        1: statsResponse.rating_distribution.star_1,
      });
      setApiSentimentDistribution(statsResponse.sentiment_distribution);
      
      // [NEW] 保存活跃任务状态，并根据状态恢复轮询
      if (statsResponse.active_tasks) {
        setActiveTasks({
          translation: statsResponse.active_tasks.translation,
          insights: statsResponse.active_tasks.insights,
          themes: statsResponse.active_tasks.themes,
        });
        
        // 只有后端任务状态是 processing 时才恢复轮询（用户可控）
        if (!manuallyStoppedRef.current && !pollingRef.current.active) {
          const { translation, insights, themes } = statsResponse.active_tasks;
          
          if (translation === 'processing') {
            console.log('Backend reports translation is processing, resuming polling');
            setIsTranslating(true);
            // 翻译轮询由现有的 useEffect 自动处理
          }
          
          // 恢复洞察提取状态并启动轮询
          if (insights === 'processing') {
            console.log('Backend reports insights is processing, resuming polling');
            setIsExtractingInsights(true);
            setAnalysisPhase('insights'); // 设置正确的分析阶段
            pollingRef.current.active = true;
            
            // 启动洞察轮询
            const pollInsights = async () => {
              if (!pollingRef.current.active || manuallyStoppedRef.current) return;
              
              try {
                const stats = await apiService.getProductStats(asin);
                const total = stats.product.translated_reviews;
                const withInsights = stats.product.reviews_with_insights || 0;
                
                setReviewsWithInsights(withInsights);
                
                if (withInsights >= total && total > 0) {
                  setIsExtractingInsights(false);
                  pollingRef.current.active = false;
                  toast.success('洞察提取完成！');
                } else if (pollingRef.current.active && !manuallyStoppedRef.current) {
                  pollingRef.current.timer = setTimeout(pollInsights, 2000);
                }
              } catch (err) {
                if (pollingRef.current.active && !manuallyStoppedRef.current) {
                  pollingRef.current.timer = setTimeout(pollInsights, 3000);
                }
              }
            };
            pollingRef.current.timer = setTimeout(pollInsights, 1000);
          }
          
          // 恢复主题提取状态并启动轮询
          if (themes === 'processing') {
            console.log('Backend reports themes is processing, resuming polling');
            setIsExtractingThemes(true);
            setAnalysisPhase('themes'); // 设置正确的分析阶段
            pollingRef.current.active = true;
            
            // 启动主题轮询
            const pollThemes = async () => {
              if (!pollingRef.current.active || manuallyStoppedRef.current) return;
              
              try {
                const stats = await apiService.getProductStats(asin);
                const total = stats.product.translated_reviews;
                const withThemes = stats.product.reviews_with_themes || 0;
                
                setReviewsWithThemes(withThemes);
                
                if (withThemes >= total && total > 0) {
                  setIsExtractingThemes(false);
                  pollingRef.current.active = false;
                  toast.success('主题提取完成！');
                } else if (pollingRef.current.active && !manuallyStoppedRef.current) {
                  pollingRef.current.timer = setTimeout(pollThemes, 2000);
                }
              } catch (err) {
                if (pollingRef.current.active && !manuallyStoppedRef.current) {
                  pollingRef.current.timer = setTimeout(pollThemes, 3000);
                }
              }
            };
            pollingRef.current.timer = setTimeout(pollThemes, 1000);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [asin, currentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 检查是否有报告
  useEffect(() => {
    if (!asin) return;
    
    const checkReports = async () => {
      try {
        const response = await getReportHistory(asin, 1);
        setHasReports((response.reports || []).length > 0);
      } catch (err) {
        // 如果没有报告或出错，设置为 false
        setHasReports(false);
      }
    };
    
    checkReports();
  }, [asin]);

  // 清理轮询定时器（组件卸载或完整分析完成时）
  useEffect(() => {
    return () => {
      if (pollingRef.current.timer) {
        clearTimeout(pollingRef.current.timer);
        pollingRef.current.timer = null;
      }
      pollingRef.current.active = false;
    };
  }, []);

  // 全屏切换 - 文档级全屏 + CSS fixed 定位
  // 核心：使用 document.documentElement.requestFullscreen() 让整个文档全屏
  // 而不是某个 div，这样 Portal (Modal/Toast) 的 z-index 才能正常工作
  const handleFullscreenClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // 检查当前是否有元素处于全屏状态
      const isFullscreen = !!document.fullscreenElement;

      if (!isFullscreen) {
        // ✅ 关键：请求整个 HTML 文档全屏，而不是某个 div
        // 这样所有 React Portal (Modal/Toast) 依然在同一个层级树中，z-index 才会生效
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
      toast.error('全屏模式受限', '请检查浏览器权限');
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      // 【核心修改点】只要 document 有全屏元素，就激活沉浸模式 UI
      // 不需要判断是哪个元素，因为我们只允许 Document 全屏
      const isNativeFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNativeFullscreen);
    };

    // 标准事件
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    // 兼容旧版浏览器事件
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // 初始化状态
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 智能增量更新评论（翻译过程中使用）
  const updateReviewsIncrementally = useCallback(async () => {
    if (!asin) return;
    
    try {
      // 同时获取产品统计信息和评论
      const [statsResponse, reviewsResponse] = await Promise.all([
        apiService.getProductStats(asin),
        apiService.getReviews({ asin, page: currentPage, pageSize })
      ]);
      
      // 更新产品信息（标题和五点翻译）
      const product = statsResponse.product;
      
      const newReviews = transformReviews(reviewsResponse.reviews);
      
      // 使用函数式更新，避免闭包问题
      setTask(prevTask => {
        if (!prevTask) {
          // 如果没有 task，使用产品统计创建新的 task
          const newTask = transformStatsToTask(statsResponse, newReviews);
          return newTask;
        }
        
        // 更新产品信息
        const updatedTask = {
          ...prevTask,
          titleTranslated: product.title_translated || prevTask.titleTranslated,
          bulletPointsTranslated: product.bullet_points_translated || prevTask.bulletPointsTranslated
        };
        
        // 找出新翻译完成的评论（之前没有翻译，现在有了）
        const freshlyTranslatedIds: string[] = [];
        const currentReviewsMap = new Map(prevTask.reviews.map(r => [r.id, r]));
        
        newReviews.forEach(newReview => {
          const oldReview = currentReviewsMap.get(newReview.id);
          // 检测：之前没有翻译 -> 现在有翻译
          if (oldReview && !oldReview.translatedText && newReview.translatedText) {
            freshlyTranslatedIds.push(newReview.id);
          }
        });
        
        // 标记新翻译的评论（触发打字机动画）
        if (freshlyTranslatedIds.length > 0) {
          console.log('New translations detected:', freshlyTranslatedIds);
          
          setNewlyTranslatedIds(prev => {
            const updated = new Set(prev);
            freshlyTranslatedIds.forEach(id => updated.add(id));
            return updated;
          });
          
          // 8秒后移除标记（让动画有时间完成）
          setTimeout(() => {
            setNewlyTranslatedIds(prev => {
              const updated = new Set(prev);
              freshlyTranslatedIds.forEach(id => updated.delete(id));
              return updated;
            });
          }, 8000);
        }
        
        // 增量合并：保留本地状态（如 isPinned, isHidden），更新翻译内容
        const mergedReviews = newReviews.map(newReview => {
          const oldReview = currentReviewsMap.get(newReview.id);
          if (oldReview) {
            // 保留本地 UI 状态，更新翻译数据
            return {
              ...newReview,
              isPinned: oldReview.isPinned,
              isHidden: oldReview.isHidden,
            };
          }
          return newReview;
        });
        
        return {
          ...updatedTask,
          reviews: mergedReviews
        };
      });
      
    } catch (err) {
      console.error('Failed to update reviews incrementally:', err);
    }
  }, [asin, currentPage, pageSize]);

  // 轮询翻译进度（仅在非完整分析模式下使用）
  useEffect(() => {
    if (!isTranslating || isFullAnalysis) return; // 完整分析模式有独立的轮询逻辑
    
    const interval = setInterval(async () => {
      if (!asin) return;
      
      try {
        const stats = await apiService.getProductStats(asin);
        const total = stats.product.total_reviews;
        const translated = stats.product.translated_reviews;
        const progress = total > 0 ? Math.round((translated / total) * 100) : 0;
        
        setTranslationProgress(progress);
        setTranslatedCount(translated);
        
        // 增量更新评论列表（流式效果）
        await updateReviewsIncrementally();
        
        const bulletsDone = !stats.product.bullet_points || 
                           (stats.product.bullet_points_translated && stats.product.bullet_points_translated.length > 0);
        const titleDone = !stats.product.title || !!stats.product.title_translated;
        
        if ((stats.product.translation_status === 'completed' || progress >= 100) && bulletsDone && titleDone) {
          setIsTranslating(false);
          // 最终刷新确保数据一致
          fetchData();
        }
      } catch (err) {
        console.error('Failed to check translation progress:', err);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isTranslating, isFullAnalysis, asin, fetchData, updateReviewsIncrementally]);

  // [SIMPLIFIED] 自动恢复逻辑已移至 fetchData，基于后端 active_tasks 状态
  // 不再基于数据完整度"猜测"任务状态，完全由后端控制

  // Review action handlers
  const handleEdit = (id: string) => {
    if (!task) return;
    const review = task.reviews.find(r => r.id === id);
    if (review) {
      setEditingReview(review);
    }
  };

  const handleSaveEdit = async (id: string, updates: { originalText: string; translatedText: string; originalTitle?: string; translatedTitle?: string }) => {
    if (!task) return;
    try {
      const response = await apiService.updateReview(id, {
        originalText: updates.originalText,
        translatedText: updates.translatedText,
        originalTitle: updates.originalTitle,
        translatedTitle: updates.translatedTitle
      });
      
      // Update local state
      setTask({
        ...task,
        reviews: task.reviews.map(r =>
          r.id === id ? { ...r, ...updates } : r
        )
      });
      toast.success('评论编辑成功');
    } catch (err) {
      console.error('Failed to update review:', err);
      toast.error('更新评论失败', '请重试');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ show: true, reviewId: id });
  };

  const confirmDelete = async () => {
    if (!task || !deleteConfirm.reviewId) return;
    try {
      await apiService.deleteReview(deleteConfirm.reviewId);
      
      // Update local state
      setTask({
        ...task,
        reviews: task.reviews.filter(r => r.id !== deleteConfirm.reviewId)
      });
      setDeleteConfirm({ show: false, reviewId: null });
      toast.success('评论删除成功');
      fetchData(); // Refresh data to update counts
    } catch (err) {
      console.error('Failed to delete review:', err);
      toast.error('删除评论失败', '请重试');
      setDeleteConfirm({ show: false, reviewId: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ show: false, reviewId: null });
  };

  const handleToggleHidden = async (id: string) => {
    if (!task) return;
    const review = task.reviews.find(r => r.id === id);
    if (!review) return;
    
    const newHiddenState = !review.isHidden;
    
    try {
      await apiService.toggleReviewVisibility(id, newHiddenState);
      
      // Update local state
      setTask({
        ...task,
        reviews: task.reviews.map(r => 
          r.id === id ? { ...r, isHidden: newHiddenState } : r
        )
      });
      toast.success(review.isHidden ? '评论已显示' : '评论已隐藏');
      fetchData(); // Refresh data to update counts
    } catch (err) {
      console.error('Failed to toggle review visibility:', err);
      toast.error('操作失败', '请重试');
    }
  };

  const handleTogglePin = async (id: string) => {
    if (!task) return;
    const review = task.reviews.find(r => r.id === id);
    if (!review) return;
    
    const newPinnedState = !review.isPinned;
    
    try {
      await apiService.pinReview(id, newPinnedState);
      
      // Update local state
      setTask({
        ...task,
        reviews: task.reviews.map(r => 
          r.id === id ? { ...r, isPinned: newPinnedState } : r
        )
      });
      toast.success(review.isPinned ? '评论已取消置顶' : '评论已置顶');
    } catch (err) {
      console.error('Failed to toggle review pin:', err);
      toast.error('操作失败', '请重试');
    }
  };

  // Media tab handlers
  const handleEditMedia = (id: string) => handleEdit(id);
  const handleDeleteMedia = (id: string) => handleDelete(id);
  const handleToggleMediaHidden = (id: string) => handleToggleHidden(id);
  const handleToggleMediaPin = (id: string) => handleTogglePin(id);

  // Handle theme tag toggle
  const handleToggleTheme = (themeId: string) => {
    setActiveThemes(prev => 
      prev.includes(themeId)
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId]
    );
  };

  // 合并所有评论的动态主题关键词到预设标签（5W 模型）
  const allTags = useMemo(() => {
    // 收集所有评论的主题高亮数据
    const allHighlights: ReviewThemeHighlight[] = [];
    task?.reviews.forEach(review => {
      if (review.themeHighlights) {
        review.themeHighlights.forEach(h => {
          // 找到已有的同类型高亮并合并内容项
          const existing = allHighlights.find(e => e.themeType === h.themeType);
          if (existing) {
            // 合并 items，去重（基于 content）
            const existingContents = new Set(existing.items.map(item => item.content));
            const newItems = h.items.filter(item => !existingContents.has(item.content));
            existing.items = [...existing.items, ...newItems];
            // 向后兼容：也更新 keywords
            if (h.keywords) {
              existing.keywords = [...new Set([...(existing.keywords || []), ...h.keywords])];
            }
          } else {
            allHighlights.push({ 
              ...h, 
              items: [...h.items],
              keywords: h.keywords ? [...h.keywords] : undefined
            });
          }
        });
      }
    });
    
    // 从后端 AI 提取的内容构建主题标签（5W 模型）
    return buildThemeTagsFromHighlights(allHighlights);
  }, [task?.reviews]);

  const handleManageTags = (id: string) => {
    if (!task) return;
    const review = task.reviews.find(r => r.id === id);
    const currentTags = review?.tags?.join(', ') || '';
    const newTagsInput = prompt('请输入标签（用逗号分隔）：', currentTags);
    
    if (newTagsInput !== null) {
      const newTags = newTagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      
      setTask({
        ...task,
        reviews: task.reviews.map(r => 
          r.id === id ? { ...r, tags: newTags } : r
        )
      });
    }
  };

  const filteredReviews = useMemo(() => {
    if (!task) return [];
    
    return task.reviews.filter(review => {
      const matchesRating = ratingFilter === 'all' || review.rating === parseInt(ratingFilter);
      const matchesSentiment = sentimentFilter === 'all' || review.sentiment === sentimentFilter;
      const matchesSearch = searchQuery === '' || 
        review.originalText.toLowerCase().includes(searchQuery.toLowerCase()) || 
        review.translatedText.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRating && matchesSentiment && matchesSearch && !review.isHidden;
    });
  }, [task, ratingFilter, sentimentFilter, searchQuery]);

  const sortedReviews = useMemo(() => {
    if (!task) return [];
    
    const pinned = filteredReviews.filter(r => r.isPinned);
    const unpinned = filteredReviews.filter(r => !r.isPinned);
    
    const sortFunc = (a: Review, b: Review) => {
      switch (sortOption) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'rating-desc':
          return b.rating - a.rating;
        case 'rating-asc':
          return a.rating - b.rating;
        case 'helpful-desc':
          return (b.helpfulCount || 0) - (a.helpfulCount || 0);
        default:
          return 0;
      }
    };
    
    return [...pinned.sort(sortFunc), ...unpinned.sort(sortFunc)];
  }, [filteredReviews, sortOption, task]);

  // 虚拟滚动：只渲染可见区域的评论，性能恒定
  const rowVirtualizer = useVirtualizer({
    count: sortedReviews.length,
    getScrollElement: () => reviewListRef.current,
    estimateSize: () => 450, // 估计每条评论高度约 450px（包含洞察）
    overscan: 2, // 预渲染可见区域外 2 个条目
  });

  // 统计媒体数量
  const mediaStats = useMemo(() => {
    if (!task) return { totalImages: 0, totalVideos: 0, reviewsWithMedia: 0 };
    
    let totalImages = 0;
    let totalVideos = 0;
    let reviewsWithMedia = 0;
    
    task.reviews.forEach(review => {
      const hasMedia = (review.images?.length || 0) + (review.videos?.length || 0) > 0;
      if (hasMedia) reviewsWithMedia++;
      totalImages += review.images?.length || 0;
      totalVideos += review.videos?.length || 0;
    });
    
    return { totalImages, totalVideos, reviewsWithMedia };
  }, [task]);

  // 计算评分统计 - 使用后端返回的统计数据
  const ratingStats = useMemo(() => {
    return { 
      averageRating: linkRating.toFixed(1), // 链接评分（爬取时的评分）
      totalReviews,  // 后端返回的总下载数
      translatedReviews: translatedCount,  // 后端返回的已翻译数
      reviewsWithInsights,  // 后端返回的已做洞察数
      reviewsWithThemes,  // 后端返回的已提取主题数
      ratingDistribution: apiRatingDistribution,  // 后端返回的评分分布
      sentimentDistribution: apiSentimentDistribution  // 后端返回的情感分布
    };
  }, [linkRating, totalReviews, translatedCount, reviewsWithInsights, reviewsWithThemes, apiRatingDistribution, apiSentimentDistribution]);

  // 开始翻译
  const handleStartTranslation = async () => {
    if (!asin) return;
    
    // 清除手动停止标志，允许正常轮询
    manuallyStoppedRef.current = false;
    
    setIsTranslating(true);
    setTranslationProgress(0);

    try {
      await apiService.triggerTranslation(asin);
      toast.success('翻译已启动', '正在后台处理中...');
    } catch (err) {
      console.error('Failed to start translation:', err);
      setIsTranslating(false);
      toast.error('启动翻译失败', '请重试');
    }
  };

  // [REMOVED] handleExtractInsights 和 handleExtractThemes 已移除
  // 原因：单独触发会绕过"科学学习"步骤，导致数据质量差
  // 请使用 handleFullAnalysis 触发完整的分析流程（通过 startDeepAnalysis API）
  
  // 状态变量保留：用于恢复后台任务状态（由 task_full_auto_analysis 触发）
  const [isExtractingInsights, setIsExtractingInsights] = useState(false);
  const [isExtractingThemes, setIsExtractingThemes] = useState(false);
  
  // 完整分析：一键处理翻译+洞察+主题
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'translating' | 'insights' | 'themes' | 'complete'>('idle');
  const phase2TriggeredRef = useRef(false); // 使用 ref 避免闭包问题
  
  const handleFullAnalysis = async () => {
    if (!asin) return;
    
    // 清除手动停止标志，允许正常轮询
    manuallyStoppedRef.current = false;
    
    setIsFullAnalysis(true);
    phase2TriggeredRef.current = false; // 重置 Phase 2 触发标志
    pollingRef.current.active = true; // 标记轮询为活跃状态

    // Phase 2: 启动深度分析（科学学习 → 洞察+主题 → 报告）
    const triggerPhase2 = async () => {
      if (phase2TriggeredRef.current) return;
      phase2TriggeredRef.current = true;
      
      console.log('Triggering Phase 2: deep analysis (learning → insights + themes → report)');
      setAnalysisPhase('insights');
      toast.info('正在启动深度分析...', '将自动执行：科学学习 → 洞察+主题提取 → 报告生成');
      
      try {
        // 调用一键深度分析接口（包含科学学习 → 洞察+主题 → 报告）
        const result = await apiService.startDeepAnalysis(asin);
        
        if (result.status === 'already_running') {
          console.log('Deep analysis already running, task_id:', result.task_id);
          toast.info('分析任务已在运行中', result.message);
        } else {
          console.log('Deep analysis started, task_id:', result.task_id);
          toast.success('深度分析已启动', `正在处理 ${result.review_count} 条评论`);
        }
        
        // 开始轮询洞察和主题进度，直到完成
        const checkPhase2Progress = async () => {
          // 检查轮询是否应该继续（包括检查手动停止标志）
          if (!pollingRef.current.active || manuallyStoppedRef.current) {
            console.log('Phase 2 polling stopped');
            return;
          }
          
          try {
            const stats = await apiService.getProductStats(asin);
            const total = stats.product.translated_reviews;
            const withInsights = stats.product.reviews_with_insights || 0;
            const withThemes = stats.product.reviews_with_themes || 0;
            
            // 更新统计数据
            setReviewsWithInsights(withInsights);
            setReviewsWithThemes(withThemes);
            
            // 更新评论列表，显示新的洞察和主题
            await updateReviewsIncrementally();
            
            // 卡住检测：检查进度是否有变化
            const currentProgress = withInsights + withThemes;
            if (currentProgress === stuckDetectionRef.current.lastProgress) {
              stuckDetectionRef.current.stuckCount++;
              console.log('Progress unchanged, stuck count:', stuckDetectionRef.current.stuckCount);
              
              // 连续 5 次（~10 秒）没有进度变化，标记为卡住
              if (stuckDetectionRef.current.stuckCount >= 5 && !isTaskStuck) {
                setIsTaskStuck(true);
                toast.warning('任务可能已卡住', '后台服务可能已停止，点击「停止分析」后可重新启动');
              }
            } else {
              // 有进度，重置计数
              stuckDetectionRef.current.lastProgress = currentProgress;
              stuckDetectionRef.current.stuckCount = 0;
              setIsTaskStuck(false);
            }
            
            console.log('Phase 2 progress:', { 
              total, withInsights, withThemes,
              insightProgress: total > 0 ? Math.round((withInsights / total) * 100) : 0,
              themeProgress: total > 0 ? Math.round((withThemes / total) * 100) : 0,
              pollingActive: pollingRef.current.active,
              manuallyStopped: manuallyStoppedRef.current,
              stuckCount: stuckDetectionRef.current.stuckCount
            });
            
            // 检查是否全部完成（洞察和主题都处理完所有已翻译评论）
            const allDone = withInsights >= total && withThemes >= total;
            
            if (allDone) {
              setAnalysisPhase('complete');
              toast.success('完整分析完成！', `已处理 ${total} 条评论`);
              setIsFullAnalysis(false);
              setIsTranslating(false);
              pollingRef.current.active = false; // 停止轮询
              stuckDetectionRef.current = { lastProgress: 0, stuckCount: 0 };
              setIsTaskStuck(false);
              if (pollingRef.current.timer) {
                clearTimeout(pollingRef.current.timer);
                pollingRef.current.timer = null;
              }
              // 最后刷新一次数据
              await fetchData();
            } else if (pollingRef.current.active && !manuallyStoppedRef.current) {
              // 继续轮询（仅在没有手动停止时）
              pollingRef.current.timer = setTimeout(checkPhase2Progress, 2000);
            }
          } catch (err) {
            console.error('Failed to check Phase 2 progress:', err);
            if (pollingRef.current.active && !manuallyStoppedRef.current) {
              pollingRef.current.timer = setTimeout(checkPhase2Progress, 3000);
            }
          }
        };
        
        // 开始轮询 Phase 2 进度
        pollingRef.current.timer = setTimeout(checkPhase2Progress, 2000);
        
      } catch (err) {
        console.error('Failed to trigger insight/theme extraction:', err);
        toast.warning('提取洞察和主题时出现问题', '请手动触发');
        setIsFullAnalysis(false);
        setAnalysisPhase('idle');
        fetchData();
      }
    };

    try {
      // 先检查当前翻译状态
      const stats = await apiService.getProductStats(asin);
      const total = stats.product.total_reviews;
      const translated = stats.product.translated_reviews;
      const bulletsDone = !stats.product.bullet_points || 
                         (stats.product.bullet_points_translated && stats.product.bullet_points_translated.length > 0);
      const titleDone = !stats.product.title || !!stats.product.title_translated;
      const translationDone = stats.product.translation_status === 'completed' || 
                             (translated >= total && total > 0);
      
      console.log('Full analysis initial check:', { 
        translated, total, translationDone, bulletsDone, titleDone,
        status: stats.product.translation_status 
      });
      
      // 如果翻译已经完成，直接跳到 Phase 2
      if (translationDone && bulletsDone && titleDone) {
        console.log('Translation already complete, skipping to Phase 2');
        toast.info('翻译已完成', '正在直接提取洞察和主题...');
        setIsTranslating(false);
        await triggerPhase2();
        return;
      }
      
      // 需要先翻译
      setIsTranslating(true);
      setTranslationProgress(0);
      setAnalysisPhase('translating');
      
      // 触发翻译
      await apiService.triggerTranslation(asin);
      toast.success('完整分析已启动', '正在翻译评论，完成后将自动提取洞察和主题...');
      
      // 轮询翻译进度，完成后自动触发洞察和主题提取
      const checkProgress = async () => {
        // 检查轮询是否应该继续（包括检查手动停止标志）
        if (!pollingRef.current.active || phase2TriggeredRef.current || manuallyStoppedRef.current) {
          console.log('Translation polling stopped');
          return;
        }
        
        try {
          const stats = await apiService.getProductStats(asin);
          const total = stats.product.total_reviews;
          const translated = stats.product.translated_reviews;
          const progress = total > 0 ? Math.round((translated / total) * 100) : 0;
          
          setTranslationProgress(progress);
          setTranslatedCount(translated);
          
          // 增量更新评论列表（流式效果）
          await updateReviewsIncrementally();
          
          // 翻译完成条件检查
          const bulletsDone = !stats.product.bullet_points || 
                             (stats.product.bullet_points_translated && stats.product.bullet_points_translated.length > 0);
          const titleDone = !stats.product.title || !!stats.product.title_translated;
          const translationDone = stats.product.translation_status === 'completed' || 
                                 (translated >= total && total > 0);
          
          console.log('Full analysis progress check:', { 
            progress, translated, total, 
            translationDone, bulletsDone, titleDone,
            status: stats.product.translation_status,
            pollingActive: pollingRef.current.active,
            manuallyStopped: manuallyStoppedRef.current
          });
          
          if (translationDone && bulletsDone && titleDone && !phase2TriggeredRef.current) {
            setIsTranslating(false);
            toast.success('翻译完成', '正在自动提取洞察和主题...');
            await triggerPhase2();
          } else if (pollingRef.current.active && !phase2TriggeredRef.current && !manuallyStoppedRef.current) {
            // 继续轮询（仅在没有手动停止时）
            pollingRef.current.timer = setTimeout(checkProgress, 2000);
          }
        } catch (err) {
          console.error('Failed to check progress:', err);
          if (pollingRef.current.active && !phase2TriggeredRef.current && !manuallyStoppedRef.current) {
            pollingRef.current.timer = setTimeout(checkProgress, 3000);
          }
        }
      };
      
      // 开始轮询
      pollingRef.current.timer = setTimeout(checkProgress, 2000);
      
    } catch (err) {
      console.error('Failed to start full analysis:', err);
      setIsTranslating(false);
      setIsFullAnalysis(false);
      setAnalysisPhase('idle');
      toast.error('启动完整分析失败', '请重试');
    }
  };


  // 停止分析任务（前端停止轮询 + 后端终止任务）
  const handleStopAnalysis = useCallback(async () => {
    if (!asin) return;
    
    try {
      // 调用后端API终止 Celery 任务并更新 Task 表状态
      await apiService.stopAnalysisTasks(asin);
      
      // 设置手动停止标志（防止刷新后立即恢复）
      manuallyStoppedRef.current = true;
      
      // 清除轮询定时器
      if (pollingRef.current.timer) {
        clearTimeout(pollingRef.current.timer);
        pollingRef.current.timer = null;
      }
      pollingRef.current.active = false;
      
      // 重置所有分析状态
      setIsTranslating(false);
      setIsFullAnalysis(false);
      setIsExtractingInsights(false);
      setIsExtractingThemes(false);
      setAnalysisPhase('idle');
      setTranslationProgress(0);
      setIsTaskStuck(false);
      phase2TriggeredRef.current = false;
      stuckDetectionRef.current = { lastProgress: 0, stuckCount: 0 };
      
      // 刷新数据以获取最新状态（后端会返回 stopped 状态）
      await fetchData();
      
      toast.success('分析已停止', '后台任务已终止，可重新启动');
    } catch (error) {
      console.error('Failed to stop analysis:', error);
      toast.error('停止失败', '请重试或刷新页面');
    }
  }, [asin, fetchData]);
  
  // [REMOVED] handleResumeAnalysis 不再需要
  // 用户可以直接点击「完整分析」「提取洞察」等按钮重新启动任务

  const handleOpenProductLink = () => {
    if (!asin) return;
    const productUrl = `https://www.amazon.com/dp/${asin}`;
    window.open(productUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 text-center bg-white border-gray-200">
          <p className="text-gray-500 mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => navigate('/home/my-projects')}>返回列表</Button>
            <Button onClick={fetchData} variant="outline" className="gap-2">
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 text-center bg-white border-gray-200">
          <p className="text-gray-500 mb-4">产品不存在</p>
          <Button onClick={() => navigate('/home/my-projects')}>返回列表</Button>
        </Card>
      </div>
    );
  }

  return (
    <div 
      ref={pageContainerRef} 
      // ✅ 关键样式解析：
      // 1. fixed inset-0: 强制固定在视口，盖住原来的布局
      // 2. z-40: 盖住 Sidebar (通常 z-30)，但让出 z-50 给 Modal/Toast
      // 3. w-screen h-screen: 撑满屏幕
      // 4. overflow-y-auto: 保证内容可滚动
      className={`bg-gray-50 transition-all duration-300 ease-in-out ${
        isFullscreen 
          ? 'fixed inset-0 z-40 w-screen h-screen overflow-y-auto pt-0' 
          : 'min-h-screen relative'
      }`}
    >
      {/* Header - 固定在最顶部 */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Fullscreen Button + Back Button + Title */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={handleFullscreenClick}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-shrink-0"
                title={isFullscreen ? '退出沉浸模式 (Esc)' : '进入沉浸模式'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="size-4" />
                    退出
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-4" />
                    沉浸
                  </>
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/home/my-projects')}
                className="gap-2 flex-shrink-0"
              >
                <ArrowLeft className="size-4" />
                返回
              </Button>
              <h1 className="text-lg text-gray-900 truncate">{task.title}</h1>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button 
                onClick={handleOpenProductLink} 
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <ExternalLink className="size-4" />
                查看产品
              </Button>
              {/* 完整分析按钮 - 一键处理（翻译+洞察+主题），优先显示 */}
              {(() => {
                const allTranslated = totalReviews > 0 && translatedCount >= totalReviews && bulletPointsTranslated;
                const allAnalyzed = allTranslated && 
                                   reviewsWithInsights >= translatedCount && 
                                   reviewsWithThemes >= translatedCount;
                // 满足生成报告的最低条件：已翻译>=10条，有洞察，有主题
                const canGenerateReport = translatedCount >= 10 && reviewsWithInsights > 0 && reviewsWithThemes > 0;
                
                if (allAnalyzed) {
                  // 全部完成后，显示"分析完成"按钮
                  return (
                    <Button 
                      disabled 
                      size="sm" 
                      variant="outline"
                      className="gap-2 min-w-[120px] text-rose-600 border-rose-500"
                      title="所有分析已完成（翻译、洞察、主题）"
                    >
                      <Check className="size-4" />
                      分析完成
                    </Button>
                  );
                } else if (isFullAnalysis || isExtractingInsights || isExtractingThemes || isTranslating ||
                           activeTasks.translation === 'processing' || 
                           activeTasks.insights === 'processing' || 
                           activeTasks.themes === 'processing') {
                  // 🔥 统一显示"AI分析中"，计算综合进度
                  // 综合进度 = (翻译进度 + 洞察进度 + 主题进度) / 3
                  // 🔧 [FIX] 使用 Math.min(100, x) 确保进度不超过 100%
                  const transProgress = translatedCount > 0 && totalReviews > 0 
                    ? Math.min(100, Math.round((translatedCount / totalReviews) * 100)) : 0;
                  const insightProgress = totalReviews > 0 
                    ? Math.min(100, Math.round((reviewsWithInsights / totalReviews) * 100)) : 0;
                  const themeProgress = totalReviews > 0 
                    ? Math.min(100, Math.round((reviewsWithThemes / totalReviews) * 100)) : 0;
                  const overallProgress = Math.min(100, Math.round((transProgress + insightProgress + themeProgress) / 3));
                  
                  return (
                    <Button disabled size="sm" className="gap-2 min-w-[120px] bg-gradient-to-r from-rose-500 to-pink-500">
                      <PlayCircle className="size-4 animate-spin" />
                      AI分析中 {overallProgress}%
                    </Button>
                  );
                } else if (!allAnalyzed) {
                  // 未完成分析 → 显示"继续分析"或"开始分析"
                  const hasStarted = translatedCount > 0 || reviewsWithInsights > 0 || reviewsWithThemes > 0;
                  return (
                    <Button 
                      onClick={handleFullAnalysis}
                      size="sm"
                      className={`gap-2 min-w-[120px] ${hasStarted 
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
                        : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600'
                      }`}
                      title="触发AI分析流程（翻译→学习→洞察→主题→报告）"
                    >
                      <Sparkles className="size-4" />
                      {hasStarted ? '继续分析' : '开始分析'}
                    </Button>
                  );
                }
                return null;
              })()}
              {/* 翻译按钮 - 仅翻译模式（仅在未完成完整分析时显示） */}
              {(() => {
                const allTranslated = totalReviews > 0 && translatedCount >= totalReviews && bulletPointsTranslated;
                const allAnalyzed = allTranslated && 
                                   reviewsWithInsights >= translatedCount && 
                                   reviewsWithThemes >= translatedCount;
                
                // 如果已全部分析完成，不显示单独翻译按钮（因为完整分析按钮已显示"分析完成"）
                if (allAnalyzed) {
                  return null;
                }
                
                if (allTranslated) {
                  return (
                    <Button 
                      disabled 
                      size="sm" 
                      variant="outline"
                      className="gap-2 min-w-[100px] text-rose-600 border-rose-500"
                      title="翻译已完成"
                    >
                      <Check className="size-4" />
                      已翻译
                    </Button>
                  );
                } else if (isTranslating && !isFullAnalysis) {
                  return (
                    <Button disabled size="sm" className="gap-2 min-w-[80px]">
                      <PlayCircle className="size-4 animate-spin" />
                      翻译中
                    </Button>
                  );
                } else if (!isFullAnalysis) {
                  return (
                    <Button 
                      onClick={handleStartTranslation}
                      size="sm"
                      variant="outline"
                      className="gap-2 bg-rose-500 hover:bg-rose-600 text-white border-rose-500"
                      title="仅翻译评论"
                    >
                      <Languages className="size-4" />
                      仅翻译
                    </Button>
                  );
                }
                return null;
              })()}
              {/* 
                [REMOVED] 提取洞察按钮 和 完善洞察按钮
                
                原因：
                1. 洞察提取和主题提取必须在"科学学习"之后执行
                2. 单独触发会绕过学习步骤，导致降级模式（AI自由判断，数据质量差）
                3. 正确流程：采集完成 → task_full_auto_analysis → 自动学习 → 自动提取
                
                用户应该使用"开始分析"按钮触发完整的分析流程
              */}
              
              {/* 停止按钮 - 仅在任务运行时显示 */}
              {(isTranslating || isFullAnalysis || isExtractingInsights || isExtractingThemes) && (
                <Button 
                  onClick={handleStopAnalysis}
                  size="sm"
                  variant="outline"
                  className={`gap-2 min-w-[80px] ${isTaskStuck ? 'bg-red-500 text-white border-red-600 animate-pulse hover:bg-red-600' : 'text-red-600 border-red-500 hover:bg-red-50'}`}
                  title={isTaskStuck ? '⚠️ 任务可能已卡住，点击停止终止任务' : '停止并终止后台任务'}
                >
                  {isTaskStuck ? <AlertTriangle className="size-4" /> : <StopCircle className="size-4" />}
                  停止
                </Button>
              )}
              
              {/* 生成报告按钮 - 满足条件才显示（翻译>=90%，洞察>80%，主题>80%） */}
              {(() => {
                // 🔧 [FIX] 使用 totalReviews 作为分母，确保进度不超过 100%
                const translationPercent = totalReviews > 0 ? Math.min(100, (translatedCount / totalReviews) * 100) : 0;
                const insightsPercent = totalReviews > 0 ? Math.min(100, (reviewsWithInsights / totalReviews) * 100) : 0;
                const themesPercent = totalReviews > 0 ? Math.min(100, (reviewsWithThemes / totalReviews) * 100) : 0;
                const canGenerateReport = translationPercent >= 90 && insightsPercent > 80 && themesPercent > 80;
                
                if (!canGenerateReport) return null;
                return (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setIsReportDialogOpen(true)}
                      className="gap-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
                      title="生成产品深度分析报告"
                    >
                      <FileText className="size-4" />
                      生成报告
                      <Sparkles className="size-3.5 text-yellow-200" />
                    </Button>
                    {/* 查看报告按钮 - 只在有报告时显示 */}
                    {hasReports && (
                      <Button
                        size="sm"
                        onClick={() => setIsViewReportDialogOpen(true)}
                        variant="outline"
                        className="gap-2 border-rose-500 text-rose-600 hover:bg-rose-50"
                        title="查看历史报告"
                      >
                        <Eye className="size-4" />
                        查看报告
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* AI分析进度条 - 统一显示 */}
          {(isTranslating || isFullAnalysis || isExtractingInsights || isExtractingThemes ||
            activeTasks.translation === 'processing' || 
            activeTasks.insights === 'processing' || 
            activeTasks.themes === 'processing') && (
            <div className="mt-3 space-y-2">
              {(() => {
                // 🔧 [FIX] 计算综合进度，确保不超过 100%
                const transProgress = translatedCount > 0 && totalReviews > 0 
                  ? Math.min(100, (translatedCount / totalReviews) * 100) : 0;
                const insightProgress = totalReviews > 0 
                  ? Math.min(100, (reviewsWithInsights / totalReviews) * 100) : 0;
                const themeProgress = totalReviews > 0 
                  ? Math.min(100, (reviewsWithThemes / totalReviews) * 100) : 0;
                const overallProgress = Math.min(100, (transProgress + insightProgress + themeProgress) / 3);
                
                return (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        🤖 正在进行AI分析...
                      </span>
                      <span className="text-gray-900 font-medium">
                        洞察: {Math.min(reviewsWithInsights, totalReviews)}/{totalReviews} | 主题: {Math.min(reviewsWithThemes, totalReviews)}/{totalReviews}
                      </span>
                    </div>
                    <Progress value={overallProgress} className="h-2" />
                    <p className="text-xs text-gray-500">
                      数据正在实时更新到页面...
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </header>

      {/* Main Content - 产品信息和统计卡片 */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Product Information Card */}
        <ProductInfoCard task={task} ratingStats={ratingStats} isTranslating={isTranslating} />

        {/* Statistics Cards */}
        <StatsCards ratingStats={ratingStats} />
      </div>

      {/* Tabs Section - 独立区域，支持 sticky 吸顶 */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs 
          defaultValue="reviews" 
          className="w-full"
          onValueChange={(value) => setActiveTab(value as 'reviews' | 'media')}
        >
          {/* Sticky Filter Section - Tab 栏 + 筛选栏吸顶在 Header 下方 */}
          <div className="sticky top-[57px] z-40 bg-white rounded-lg border border-gray-200 shadow-lg">
            <TabsList className="w-full h-auto p-4 bg-transparent justify-start border-b border-gray-200">
              <TabsTrigger 
                value="reviews" 
                className="data-[state=active]:bg-gray-100 data-[state=active]:shadow-sm px-6 py-2.5"
              >
                📝 评论内容 ({totalReviews})
              </TabsTrigger>
              <TabsTrigger 
                value="media" 
                className="gap-2 data-[state=active]:bg-gray-100 data-[state=active]:shadow-sm px-6 py-2.5"
              >
                <ImageIcon className="size-4" />
                买家秀 ({mediaStats.totalImages + mediaStats.totalVideos})
              </TabsTrigger>
            </TabsList>

            {/* Filter Bar - 仅在评论内容 Tab 显示 */}
            {activeTab === 'reviews' && <FilterBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              ratingFilter={ratingFilter}
              setRatingFilter={setRatingFilter}
              sentimentFilter={sentimentFilter}
              setSentimentFilter={setSentimentFilter}
              sortOption={sortOption}
              setSortOption={setSortOption}
              highlightEnabled={highlightEnabled}
              setHighlightEnabled={setHighlightEnabled}
              insightsExpanded={insightsExpanded}
              setInsightsExpanded={setInsightsExpanded}
            />}
            
            {/* Theme Tag Bar - 5W 主题标签 - 已隐藏 */}
            {/* {highlightEnabled && (
              <ThemeTagBar 
                allTags={allTags}
                activeThemes={activeThemes}
                onToggleTheme={handleToggleTheme}
              />
            )} */}
          </div>

          {/* 双语对照 Tab */}
          <TabsContent value="reviews" className="mt-0 border-0">
            {/* Hidden Reviews Button */}
            {task.reviews.some(r => r.isHidden) && (
              <div className="mt-6 mb-4">
                <Button
                  onClick={() => setShowHiddenModal(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <EyeOff className="size-4" />
                  查看隐藏的评论 ({task.reviews.filter(r => r.isHidden).length})
                </Button>
              </div>
            )}
            
            {/* Reviews List - 虚拟滚动优化，只渲染可见区域 */}
            {sortedReviews.length === 0 ? (
              <Card className="p-12 text-center bg-white border-gray-200 mt-6">
                <p className="text-gray-500">没有符合筛选条件的评论</p>
              </Card>
            ) : (
              <div 
                ref={reviewListRef}
                className="mt-6 overflow-auto"
                style={{ 
                  height: isFullscreen ? 'calc(100vh - 280px)' : 'calc(100vh - 350px)',
                  minHeight: '500px'
                }}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const review = sortedReviews[virtualRow.index];
                    return (
                      <div
                        key={review.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: '24px', // 评论间距
                        }}
                      >
                        <ReviewCard
                          review={review}
                          highlightEnabled={highlightEnabled}
                          activeThemes={activeThemes}
                          allTags={allTags}
                          sentimentConfig={sentimentConfig}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onToggleHidden={handleToggleHidden}
                          onTogglePin={handleTogglePin}
                          isNewlyTranslated={newlyTranslatedIds.has(review.id)}
                          insightsExpanded={insightsExpanded}
                        />
                      </div>
                    );
                  })}
                </div>
                
                {/* 底部信息 */}
                <div className="text-center py-4 text-sm text-gray-500">
                  共 {sortedReviews.length} 条评论
                </div>
              </div>
            )}
          </TabsContent>

          {/* 图片视频 Tab */}
          <TabsContent value="media" className="mt-0 border-0">
            <div className="mt-6">
              <MediaTabContent
                task={task}
                mediaStats={mediaStats}
                sentimentConfig={sentimentConfig}
                onEditMedia={handleEditMedia}
                onDeleteMedia={handleDeleteMedia}
                onToggleMediaHidden={handleToggleMediaHidden}
                onToggleMediaPin={handleToggleMediaPin}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Hidden Reviews Modal */}
      {showHiddenModal && (
        <HiddenReviewsModal
          hiddenReviews={task.reviews.filter(r => r.isHidden)}
          onClose={() => setShowHiddenModal(false)}
          onRestore={handleToggleHidden}
        />
      )}

      {/* Edit Review Modal */}
      {editingReview && (
        <EditReviewModal
          review={editingReview}
          onClose={() => setEditingReview(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm.show && (
        <ConfirmDialog
          title="确认删除评论"
          message="确定要删除这条评论吗？"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      {/* Info Dialog */}
      <InfoDialog
        open={infoDialog.show}
        onClose={() => setInfoDialog({ ...infoDialog, show: false })}
        title={infoDialog.title}
        message={infoDialog.message}
        type={infoDialog.type}
      />

      {/* Product Report Dialog */}
      <ProductReportDialog
        isOpen={isReportDialogOpen}
        onClose={() => setIsReportDialogOpen(false)}
        asin={task?.asin || ''}
        productTitle={task?.titleTranslated || task?.title || ''}
        ratingStats={{
          totalReviews,
          translatedReviews: translatedCount,
          reviewsWithInsights,
          reviewsWithThemes,
        }}
      />

      {/* View Report Dialog */}
      <ViewReportDialog
        isOpen={isViewReportDialogOpen}
        onClose={() => setIsViewReportDialogOpen(false)}
        asin={task?.asin || ''}
      />
    </div>
  );
}
