import {
  ArrowLeft,
  Download,
  Languages,
  FileSpreadsheet,
  PlayCircle,
  ExternalLink,
  Image as ImageIcon,
  EyeOff,
  RefreshCw,
  Check,
  Tag,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ReviewCard } from './ReviewCard';
import { ProductInfoCard } from './ProductInfoCard';
import { StatsCards } from './StatsCards';
import { FilterBar } from './FilterBar';
import { ThemeTagBar } from './ThemeTagBar';
import { AddThemeTagModal } from './AddThemeTagModal';
import { MediaTabContent } from './MediaTabContent';
import { HiddenReviewsModal } from './HiddenReviewsModal';
import { EditReviewModal } from './EditReviewModal';
import { ConfirmDialog } from './ConfirmDialog';
import { InfoDialog } from './InfoDialog';
import { Progress } from './ui/progress';
import { themeTagsPreset, colorConfigMap, buildThemeTagsFromHighlights, type ThemeTag } from './ThemeHighlight';
import { apiService, transformStatsToTask, transformReviews } from '@/api';
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
  const [customTags, setCustomTags] = useState<ThemeTag[]>([]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [isFullAnalysis, setIsFullAnalysis] = useState(false); // 完整分析模式（翻译+洞察+主题）
  const [displayedReviews, setDisplayedReviews] = useState(10);
  const loadMoreRef = useRef<HTMLDivElement>(null);
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
    if (!asin || !task) return;
    
    try {
      // 同时获取产品统计信息和评论
      const [statsResponse, reviewsResponse] = await Promise.all([
        apiService.getProductStats(asin),
        apiService.getReviews({ asin, page: currentPage, pageSize })
      ]);
      
      // 更新产品信息（标题和五点翻译）
      const product = statsResponse.product;
      
      // 更新 task 中的产品信息（ProductInfoCard 会自动处理打字机效果）
      setTask(prevTask => {
        if (!prevTask) return prevTask;
        return {
          ...prevTask,
          titleTranslated: product.title_translated || prevTask.titleTranslated,
          bulletPointsTranslated: product.bullet_points_translated || prevTask.bulletPointsTranslated
        };
      });
      
      const newReviews = transformReviews(reviewsResponse.reviews);
      
      // 找出新翻译完成的评论（之前没有翻译，现在有了）
      const freshlyTranslatedIds: string[] = [];
      const currentReviewsMap = new Map(task.reviews.map(r => [r.id, r]));
      
      newReviews.forEach(newReview => {
        const oldReview = currentReviewsMap.get(newReview.id);
        // 检测：之前没有翻译 -> 现在有翻译
        if (oldReview && !oldReview.translatedText && newReview.translatedText) {
          // 检查是否已经标记过
          if (!newlyTranslatedIds.has(newReview.id)) {
            freshlyTranslatedIds.push(newReview.id);
          }
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
        
        // 5秒后移除标记（让动画有时间完成）
        setTimeout(() => {
          setNewlyTranslatedIds(prev => {
            const updated = new Set(prev);
            freshlyTranslatedIds.forEach(id => updated.delete(id));
            return updated;
          });
        }, 8000);
      }
      
      // 增量合并：保留本地状态（如 isPinned, isHidden），更新翻译内容
      setTask(prevTask => {
        if (!prevTask) return prevTask;
        
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
          ...prevTask,
          reviews: mergedReviews
        };
      });
      
    } catch (err) {
      console.error('Failed to update reviews incrementally:', err);
    }
  }, [asin, task, currentPage, pageSize, newlyTranslatedIds]);

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

  // Handle add custom tag
  const handleAddCustomTag = () => {
    setShowAddTagModal(true);
  };

  // Handle custom tag confirmation with AI processing simulation
  const handleConfirmCustomTag = (label: string, question: string, colorKey: string) => {
    const colorConfig = colorConfigMap[colorKey];
    const newTag: ThemeTag = {
      id: `custom-${Date.now()}`,
      label,
      color: colorConfig.text,
      bgColor: colorConfig.bg,
      darkBgColor: colorConfig.darkBg,
      darkTextColor: colorConfig.darkText,
      patterns: [],
      isCustom: true,
      isProcessing: true,
      question
    };

    setCustomTags(prev => [...prev, newTag]);
    setShowAddTagModal(false);

    // Simulate AI processing
    setTimeout(() => {
      const mockPatterns = generateMockPatterns(question);
      setCustomTags(prev => 
        prev.map(tag => 
          tag.id === newTag.id 
            ? { ...tag, patterns: mockPatterns, isProcessing: false }
            : tag
        )
      );
    }, 3000);
  };

  const generateMockPatterns = (question: string): string[] => {
    const commonKeywords = ['家里', '办公室', '早上', '晚上', '孩子', '朋友', '方便', '简单', '问题', '满意'];
    return commonKeywords.slice(0, 5 + Math.floor(Math.random() * 5));
  };

  // 合并所有评论的动态主题关键词到预设标签
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
    
    // 从后端 AI 提取的内容构建主题标签
    const mergedPresets = buildThemeTagsFromHighlights(allHighlights);
    
    return [...mergedPresets, ...customTags];
  }, [task?.reviews, customTags]);

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

  // 无限加载功能
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && sortedReviews.length > displayedReviews) {
          setDisplayedReviews(prev => prev + 10);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [sortedReviews.length, displayedReviews]);

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

  const handleExportXLSX = async () => {
    if (!asin) return;

    try {
      const blob = await apiService.exportReviewsByAsin(asin);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `reviews_${asin}_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      toast.success('导出成功', '文件已开始下载');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('导出失败', '请重试');
    }
  };

  // 开始翻译
  const handleStartTranslation = async () => {
    if (!asin) return;
    
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

  // 提取洞察
  const [isExtractingInsights, setIsExtractingInsights] = useState(false);
  
  const handleExtractInsights = async () => {
    if (!asin) return;
    
    setIsExtractingInsights(true);
    
    try {
      const result = await apiService.triggerInsightExtraction(asin);
      setInfoDialog({
        show: true,
        title: '洞察提取已启动',
        message: `正在处理 ${result.reviews_to_process} 条评论`,
        type: 'success'
      });
      // 几秒后刷新数据
      setTimeout(() => {
        fetchData();
        setIsExtractingInsights(false);
      }, 5000);
    } catch (err) {
      console.error('Failed to extract insights:', err);
      setIsExtractingInsights(false);
      toast.error('提取洞察失败', '请确保有已翻译的评论');
    }
  };
  
  // 提取主题高亮
  const [isExtractingThemes, setIsExtractingThemes] = useState(false);
  
  // 完整分析：一键处理翻译+洞察+主题
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'translating' | 'insights' | 'themes' | 'complete'>('idle');
  
  const handleFullAnalysis = async () => {
    if (!asin) return;
    
    setIsFullAnalysis(true);

    // 用于追踪是否已触发Phase 2
    let phase2Triggered = false;

    // Phase 2: 触发洞察和主题提取，并持续轮询更新
    const triggerPhase2 = async () => {
      if (phase2Triggered) return;
      phase2Triggered = true;
      
      console.log('Triggering Phase 2: insights and themes extraction');
      setAnalysisPhase('insights');
      toast.info('正在提取洞察和主题...', '数据将实时更新到页面');
      
      try {
        // 同时触发洞察和主题提取
        const [insightResult, themeResult] = await Promise.allSettled([
          apiService.triggerInsightExtraction(asin),
          apiService.triggerThemeExtraction(asin)
        ]);
        
        // 检查结果
        const insightSuccess = insightResult.status === 'fulfilled';
        const themeSuccess = themeResult.status === 'fulfilled';
        
        if (!insightSuccess) {
          console.error('Insight extraction failed:', insightResult);
        }
        if (!themeSuccess) {
          console.error('Theme extraction failed:', themeResult);
        }
        
        // 开始轮询洞察和主题进度，直到完成
        const checkPhase2Progress = async () => {
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
            
            console.log('Phase 2 progress:', { 
              total, withInsights, withThemes,
              insightProgress: total > 0 ? Math.round((withInsights / total) * 100) : 0,
              themeProgress: total > 0 ? Math.round((withThemes / total) * 100) : 0
            });
            
            // 检查是否全部完成（洞察和主题都处理完所有已翻译评论）
            const allDone = withInsights >= total && withThemes >= total;
            
            if (allDone) {
              setAnalysisPhase('complete');
              toast.success('完整分析完成！', `已处理 ${total} 条评论`);
              setIsFullAnalysis(false);
              setIsTranslating(false);
              // 最后刷新一次数据
              await fetchData();
            } else {
              // 继续轮询
              setTimeout(checkPhase2Progress, 2000);
            }
          } catch (err) {
            console.error('Failed to check Phase 2 progress:', err);
            setTimeout(checkPhase2Progress, 3000);
          }
        };
        
        // 开始轮询 Phase 2 进度
        setTimeout(checkPhase2Progress, 2000);
        
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
        // 防止重复触发 Phase 2
        if (phase2Triggered) return;
        
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
            status: stats.product.translation_status 
          });
          
          if (translationDone && bulletsDone && titleDone && !phase2Triggered) {
            setIsTranslating(false);
            toast.success('翻译完成', '正在自动提取洞察和主题...');
            await triggerPhase2();
          } else if (!phase2Triggered) {
            // 继续轮询
            setTimeout(checkProgress, 2000);
          }
        } catch (err) {
          console.error('Failed to check progress:', err);
          if (!phase2Triggered) {
            setTimeout(checkProgress, 2000);
          }
        }
      };
      
      // 开始轮询
      setTimeout(checkProgress, 2000);
      
    } catch (err) {
      console.error('Failed to start full analysis:', err);
      setIsTranslating(false);
      setIsFullAnalysis(false);
      setAnalysisPhase('idle');
      toast.error('启动完整分析失败', '请重试');
    }
  };
  
  const handleExtractThemes = async () => {
    if (!asin) return;
    
    setIsExtractingThemes(true);
    
    try {
      const result = await apiService.triggerThemeExtraction(asin);
      setInfoDialog({
        show: true,
        title: '主题提取已启动',
        message: `正在处理 ${result.reviews_to_process} 条评论`,
        type: 'success'
      });
      // 几秒后刷新数据
      setTimeout(() => {
        fetchData();
        setIsExtractingThemes(false);
      }, 5000);
    } catch (err) {
      console.error('Failed to extract themes:', err);
      setIsExtractingThemes(false);
      toast.error('提取主题失败', '请确保有已翻译的评论');
    }
  };

  const handleOpenProductLink = () => {
    if (!asin) return;
    const productUrl = `https://www.amazon.com/dp/${asin}`;
    window.open(productUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
            <Button onClick={() => navigate('/')}>返回列表</Button>
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
          <Button onClick={() => navigate('/')}>返回列表</Button>
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
      {/* Header */}
      {/* Header 保持不变，但 z-index 不需要太高，相对于容器即可 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
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
                onClick={() => navigate('/')}
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
                
                if (allAnalyzed) {
                  return (
                    <Button 
                      disabled 
                      size="sm" 
                      variant="outline"
                      className="gap-2 min-w-[120px] text-blue-600 border-blue-600"
                      title="所有分析已完成"
                    >
                      <Check className="size-4" />
                      分析完成
                    </Button>
                  );
                } else if (isFullAnalysis || (isTranslating && isFullAnalysis)) {
                  return (
                    <Button disabled size="sm" className="gap-2 min-w-[120px] bg-blue-600">
                      <PlayCircle className="size-4 animate-spin" />
                      完整分析中
                    </Button>
                  );
                } else if (!allTranslated && !isTranslating) {
                  return (
                    <Button 
                      onClick={handleFullAnalysis}
                      size="sm"
                      className="gap-2 min-w-[120px] bg-blue-600 hover:bg-blue-700"
                      title="一键完成翻译、洞察提取和主题提取（推荐）"
                    >
                      <Languages className="size-4" />
                      完整分析
                    </Button>
                  );
                }
                return null;
              })()}
              {/* 翻译按钮 - 仅翻译模式 */}
              {(() => {
                // 判断是否全部翻译完成
                const allTranslated = totalReviews > 0 && translatedCount >= totalReviews && bulletPointsTranslated;
                
                if (allTranslated) {
                  return (
                    <Button 
                      disabled 
                      size="sm" 
                      variant="outline"
                      className="gap-2 min-w-[100px] text-emerald-600 border-emerald-600"
                    >
                      <Check className="size-4" />
                      已翻译
                    </Button>
                  );
                } else if (isTranslating && !isFullAnalysis) {
                  return (
                    <Button disabled size="sm" className="gap-2 min-w-[100px]">
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
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      title="仅翻译评论"
                    >
                      <Languages className="size-4" />
                      仅翻译
                    </Button>
                  );
                }
                return null;
              })()}
              {/* 提取洞察按钮 - 仅在有翻译评论且未进行完整分析时显示 */}
              {translatedCount > 0 && !isTranslating && !isFullAnalysis && (
                <Button 
                  onClick={handleExtractInsights}
                  disabled={isExtractingInsights}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  title="单独提取洞察（如需仅翻译可使用'仅翻译'按钮）"
                >
                  {isExtractingInsights ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      提取中
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4" />
                      提取洞察
                    </>
                  )}
                </Button>
              )}
              {/* 提取主题按钮 - 仅在有翻译评论且未进行完整分析时显示 */}
              {translatedCount > 0 && !isTranslating && !isFullAnalysis && (
                <Button 
                  onClick={handleExtractThemes}
                  disabled={isExtractingThemes}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  title="单独提取主题（如需仅翻译可使用'仅翻译'按钮）"
                >
                  {isExtractingThemes ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      提取中
                    </>
                  ) : (
                    <>
                      <Tag className="size-4" />
                      提取主题
                    </>
                  )}
                </Button>
              )}
              <Button onClick={handleExportXLSX} size="sm" className="gap-2">
                <FileSpreadsheet className="size-4" />
                XLSX
              </Button>
            </div>
          </div>

          {/* Translation/Analysis Progress Bar */}
          {(isTranslating || isFullAnalysis) && (
            <div className="mt-3 space-y-2">
              {/* 翻译进度 */}
              {analysisPhase === 'translating' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {isFullAnalysis ? '📝 正在翻译评论...' : '正在翻译评论...'}
                    </span>
                    <span className="text-gray-900 font-medium">{translationProgress}%</span>
                  </div>
                  <Progress value={translationProgress} className="h-2" />
                </>
              )}
              
              {/* 洞察和主题提取进度 */}
              {(analysisPhase === 'insights' || analysisPhase === 'themes') && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      🔍 正在提取洞察和主题...
                    </span>
                    <span className="text-gray-900 font-medium">
                      洞察: {reviewsWithInsights}/{translatedCount} | 主题: {reviewsWithThemes}/{translatedCount}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Progress 
                      value={translatedCount > 0 ? (reviewsWithInsights / translatedCount) * 100 : 0} 
                      className="h-2 flex-1" 
                    />
                    <Progress 
                      value={translatedCount > 0 ? (reviewsWithThemes / translatedCount) * 100 : 0} 
                      className="h-2 flex-1" 
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    数据正在实时更新到页面...
                  </p>
                </>
              )}
              
              {/* 完成状态 */}
              {analysisPhase === 'complete' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="size-4" />
                  <span>完整分析已完成！</span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Product Information Card */}
        <ProductInfoCard task={task} ratingStats={ratingStats} isTranslating={isTranslating} />

        {/* Statistics Cards */}
        <StatsCards ratingStats={ratingStats} />

        {/* Tabs for View Switching */}
        <Tabs defaultValue="reviews" className="w-full">
          {/* Sticky Filter Section */}
          <div className="sticky top-[57px] z-10 bg-white rounded-lg border border-gray-200 shadow-md">
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

            {/* Filter Bar */}
            <FilterBar
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
            />
            
            {/* Theme Tag Bar */}
            {highlightEnabled && (
              <ThemeTagBar 
                allTags={allTags}
                activeThemes={activeThemes}
                onToggleTheme={handleToggleTheme}
                onAddCustomTag={handleAddCustomTag}
              />
            )}
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
            
            {/* Reviews List */}
            <div className="space-y-6 mt-6">
              {sortedReviews.length === 0 ? (
                <Card className="p-12 text-center bg-white border-gray-200">
                  <p className="text-gray-500">没有符合筛选条件的评论</p>
                </Card>
              ) : (
                sortedReviews.slice(0, displayedReviews).map((review) => (
                  <ReviewCard
                    key={review.id}
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
                ))
              )}
            </div>

            {/* Load More Trigger */}
            {sortedReviews.length > displayedReviews && (
              <div ref={loadMoreRef} className="mt-6 text-center py-4">
                <Button
                  onClick={() => setDisplayedReviews(prev => prev + 10)}
                  variant="outline"
                  size="sm"
                >
                  加载更多评论...
                </Button>
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
      </main>

      {/* Hidden Reviews Modal */}
      {showHiddenModal && (
        <HiddenReviewsModal
          hiddenReviews={task.reviews.filter(r => r.isHidden)}
          onClose={() => setShowHiddenModal(false)}
          onRestore={handleToggleHidden}
        />
      )}

      {/* Add Custom Tag Modal */}
      {showAddTagModal && (
        <AddThemeTagModal
          onClose={() => setShowAddTagModal(false)}
          onConfirm={handleConfirmCustomTag}
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
    </div>
  );
}
