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
  const [activeThemes, setActiveThemes] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<ThemeTag[]>([]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
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

  // 全屏功能 - 获取全屏元素（兼容所有浏览器）
  const getFullscreenElement = useCallback(() => {
    return (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      null
    );
  }, []);


  // 全屏功能 - 退出全屏（兼容所有浏览器）
  const exitFullscreen = useCallback(async () => {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      await (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen();
    } else {
      throw new Error('浏览器不支持退出全屏功能');
    }
  }, []);

  // 全屏切换 - 针对页面容器进行全屏，实现真正的沉浸式
  const handleFullscreenClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 1. 获取要全屏的目标容器
    const element = pageContainerRef.current;
    if (!element) return;

    // 2. 检查当前全屏状态（兼容性写法）
    const fullscreenElement = getFullscreenElement();
    const isCurrentElementFullscreen = fullscreenElement === element;

    try {
      if (!isCurrentElementFullscreen) {
        // --- 进入全屏 ---
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if ((element as any).webkitRequestFullscreen) {
          await (element as any).webkitRequestFullscreen();
        } else if ((element as any).webkitRequestFullScreen) {
          await (element as any).webkitRequestFullScreen();
        } else if ((element as any).mozRequestFullScreen) {
          await (element as any).mozRequestFullScreen();
        } else if ((element as any).msRequestFullscreen) {
          await (element as any).msRequestFullscreen();
        } else {
          toast.error('不支持全屏', '您的浏览器不支持全屏功能');
        }
      } else {
        // --- 退出全屏 ---
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
      toast.error('全屏切换失败', '可能是浏览器权限限制');
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      // 检查当前全屏元素是否为我们的容器
      const currentFullscreenElement = getFullscreenElement();
      const isNowFullscreen = currentFullscreenElement === pageContainerRef.current;
      
      setIsFullscreen(isNowFullscreen);
      
      // 注意：不需要手动修改 body 样式了
      // 浏览器会对全屏元素自动应用 user-agent 样式
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
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
  }, [getFullscreenElement]);

  // 轮询翻译进度
  useEffect(() => {
    if (!isTranslating) return;
    
    const interval = setInterval(async () => {
      if (!asin) return;
      
      try {
        const stats = await apiService.getProductStats(asin);
        const total = stats.product.total_reviews;
        const translated = stats.product.translated_reviews;
        const progress = total > 0 ? Math.round((translated / total) * 100) : 0;
        
        setTranslationProgress(progress);
        setTranslatedCount(translated);
        
        if (stats.product.translation_status === 'completed' || progress >= 100) {
          setIsTranslating(false);
          // 刷新数据
          fetchData();
        }
      } catch (err) {
        console.error('Failed to check translation progress:', err);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isTranslating, asin, fetchData]);

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
      // 关键样式解释：
      // 1. overflow-y-auto: 确保全屏时内容长了可以滚动
      // 2. bg-gray-50: 防止全屏后背景变黑
      // 3. w-full h-full: 常规状态下占满父容器
      className={`min-h-screen bg-gray-50 transition-colors overflow-y-auto ${
        isFullscreen ? 'p-0' : ''
      }`}
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
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
              {/* 翻译按钮 - 三种状态：已翻译、翻译中、开始翻译 */}
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
                } else if (isTranslating) {
                  return (
                    <Button disabled size="sm" className="gap-2 min-w-[100px]">
                      <PlayCircle className="size-4 animate-spin" />
                      翻译中
                    </Button>
                  );
                } else {
                  return (
                    <Button 
                      onClick={handleStartTranslation}
                      size="sm"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Languages className="size-4" />
                      开始翻译
                    </Button>
                  );
                }
              })()}
              {/* 提取洞察按钮 - 仅在有翻译评论且翻译未进行时显示 */}
              {translatedCount > 0 && !isTranslating && (
                <Button 
                  onClick={handleExtractInsights}
                  disabled={isExtractingInsights}
                  variant="outline"
                  size="sm"
                  className="gap-2"
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
              {/* 提取主题按钮 - 仅在有翻译评论且翻译未进行时显示 */}
              {translatedCount > 0 && !isTranslating && (
                <Button 
                  onClick={handleExtractThemes}
                  disabled={isExtractingThemes}
                  variant="outline"
                  size="sm"
                  className="gap-2"
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

          {/* Translation Progress Bar */}
          {isTranslating && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">正在翻译评论...</span>
                <span className="text-gray-900 font-medium">{translationProgress}%</span>
              </div>
              <Progress value={translationProgress} className="h-2" />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Product Information Card */}
        <ProductInfoCard task={task} ratingStats={ratingStats} />

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
