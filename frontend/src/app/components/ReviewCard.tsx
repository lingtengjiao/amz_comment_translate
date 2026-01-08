import { memo, useState, useEffect, useRef } from 'react';
import { Star, ShieldCheck, Image as ImageIcon, Video, ThumbsUp, Pin } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ThemeHighlightedText, type ThemeTag } from './ThemeHighlight';
import { ThemeUnderlinedText } from './ThemeUnderlinedText';
import { ReviewInsights } from './ReviewInsights';
import { ReviewActions } from './ReviewActions';
import type { Review } from '../data/mockData';

interface ReviewCardProps {
  review: Review;
  highlightEnabled: boolean;
  activeThemes?: string[]; // 激活的主题标签
  allTags?: ThemeTag[]; // 所有标签（预设 + 自定义）
  sentimentConfig: {
    positive: { label: string; color: string };
    negative: { label: string; color: string };
    neutral: { label: string; color: string };
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onTogglePin: (id: string) => void;
  isNewlyTranslated?: boolean; // 是否刚刚翻译完成（触发打字机动画）
  insightsExpanded?: boolean; // 是否展开洞察（全局控制）
}

export const ReviewCard = memo(function ReviewCard({ 
  review, 
  highlightEnabled,
  activeThemes = [],
  allTags = [],
  sentimentConfig,
  onEdit,
  onDelete,
  onToggleHidden,
  onTogglePin,
  isNewlyTranslated = false,
  insightsExpanded = true
}: ReviewCardProps) {
  const hasImages = review.images && review.images.length > 0;
  const hasVideos = review.videos && review.videos.length > 0;
  
  // 新翻译的短暂高亮效果（无打字机动画，更简洁）
  const [showNewBadge, setShowNewBadge] = useState(false);
  const badgeShownRef = useRef(false);
  
  // 检测新翻译完成，显示短暂高亮
  useEffect(() => {
    if (isNewlyTranslated && review.translatedText && !badgeShownRef.current) {
      badgeShownRef.current = true;
      setShowNewBadge(true);
      
      // 3秒后移除高亮效果
      const timer = setTimeout(() => {
        setShowNewBadge(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isNewlyTranslated, review.translatedText]);

  // Don't render hidden reviews
  if (review.isHidden) {
    return null;
  }

  return (
    <Card className={`overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-all duration-500 ${
      review.isPinned ? 'ring-2 ring-orange-400 dark:ring-orange-500' : ''
    } ${
      showNewBadge ? 'ring-2 ring-emerald-400 dark:ring-emerald-500 shadow-lg shadow-emerald-100 dark:shadow-emerald-900/30 animate-pulse-once' : ''
    }`}>
      {/* Pinned Badge */}
      {review.isPinned && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-500/20 px-4 py-2">
          <div className="flex items-center gap-2">
            <Pin className="size-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-orange-800 dark:text-orange-300">置顶评论</span>
          </div>
        </div>
      )}
      
      <div className="p-4">
        {/* Review Header - Hierarchical Layout */}
        <div className="mb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              {/* Top Priority: Stars, Date, Helpful Count */}
              <div className="flex items-center gap-4 flex-wrap">
                {/* Stars - Most Important */}
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`size-5 ${
                        i < review.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300 dark:text-gray-600'
                      }`}
                    />
                  ))}
                </div>
                
                {/* Date - Important */}
                <span className="text-gray-900 dark:text-white font-medium">{review.date}</span>
                
                {/* Helpful Count - Important */}
                {review.helpfulCount !== undefined && review.helpfulCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                    <ThumbsUp className="size-3.5" />
                    <span className="font-medium">{review.helpfulCount} 有帮助</span>
                  </div>
                )}
                
                {/* Sentiment Badge */}
                <Badge className={sentimentConfig[review.sentiment].color}>
                  {sentimentConfig[review.sentiment].label}
                </Badge>
              </div>
              
              {/* Second Line: Verified Badge, Author */}
              <div className="flex items-center gap-3 flex-wrap">
                {review.verified && (
                  <Badge variant="secondary" className="gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
                    <ShieldCheck className="size-4" />
                    <span className="font-semibold">已验证购买</span>
                  </Badge>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">评论人：{review.author}</span>
              </div>
            </div>
            
            {/* Actions Menu */}
            <ReviewActions
              reviewId={review.id}
              isPinned={review.isPinned}
              isHidden={review.isHidden}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleHidden={onToggleHidden}
              onTogglePin={onTogglePin}
            />
          </div>
        </div>

        {/* Review Content - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Original Text - Left Column with Underlines */}
          <div className="relative group">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4 h-full border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-900/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">原文</span>
                </div>
                {/* Media Icons */}
                {(hasImages || hasVideos) && (
                  <div className="flex items-center gap-1.5">
                    {hasImages && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        <ImageIcon className="size-3" />
                        <span className="text-xs">{review.images?.length}</span>
                      </div>
                    )}
                    {hasVideos && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        <Video className="size-3" />
                        <span className="text-xs">{review.videos?.length}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Original Title if exists */}
              {review.originalTitle && (
                highlightEnabled ? (
                  <ThemeUnderlinedText 
                    text={review.originalTitle} 
                    activeThemes={activeThemes}
                    allTags={allTags}
                    className="text-gray-900 dark:text-white font-medium mb-2 leading-snug block" 
                  />
                ) : (
                  <p className="text-gray-900 dark:text-white font-medium mb-2 leading-snug">{review.originalTitle}</p>
                )
              )}
              
              {highlightEnabled ? (
                <ThemeUnderlinedText 
                  text={review.originalText} 
                  activeThemes={activeThemes}
                  allTags={allTags}
                  className="text-gray-600 dark:text-gray-300 leading-relaxed block whitespace-pre-wrap" 
                />
              ) : (
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{review.originalText}</p>
              )}
            </div>
          </div>

          {/* Translated Text - Right Column - EMPHASIZED */}
          <div className="relative group">
            <div className={`rounded-xl p-4 h-full border transition-all duration-500 ${
              showNewBadge
                ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800/50 shadow-inner' 
                : 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-100 dark:border-blue-900/50 hover:border-blue-300 dark:hover:border-blue-800/50 hover:shadow-md dark:hover:shadow-blue-900/20'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold ${
                  showNewBadge
                    ? 'text-emerald-700 dark:text-emerald-400' 
                    : 'text-blue-700 dark:text-blue-400'
                }`}>
                  {showNewBadge ? '✨ 刚刚翻译' : '中文译文'}
                </span>
              </div>
              
              {/* 检查是否有翻译内容 */}
              {review.translatedText ? (
                <>
                  {/* Translated Title */}
              {review.translatedTitle && (
                    <p className="text-gray-900 dark:text-white font-bold mb-2.5 leading-snug">
                      {review.translatedTitle}
                    </p>
              )}
              
                  {/* Translated Body */}
              {highlightEnabled ? (
                <ThemeHighlightedText 
                  text={review.translatedText} 
                  activeThemes={activeThemes} 
                  allTags={allTags}
                  className="text-gray-900 dark:text-white leading-relaxed" 
                />
              ) : (
                    <p className="text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                      {review.translatedText}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[60px]">
                  <span className="text-gray-400 dark:text-gray-500 text-sm italic">等待翻译...</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Review Insights */}
        <ReviewInsights review={review} expanded={insightsExpanded} />
      </div>
    </Card>
  );
});