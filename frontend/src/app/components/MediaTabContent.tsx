import { Image as ImageIcon, Video, ShieldCheck, Star, Pin } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ReviewMediaGallery } from './ReviewMediaGallery';
import { MediaActions } from './MediaActions';
import type { Task } from '../data/mockData';

interface MediaTabContentProps {
  task: Task;
  mediaStats: {
    totalImages: number;
    totalVideos: number;
    reviewsWithMedia: number;
  };
  sentimentConfig: {
    positive: { label: string; color: string };
    negative: { label: string; color: string };
    neutral: { label: string; color: string };
  };
  onEditMedia: (id: string) => void;
  onDeleteMedia: (id: string) => void;
  onToggleMediaHidden: (id: string) => void;
  onToggleMediaPin: (id: string) => void;
}

export function MediaTabContent({ task, mediaStats, sentimentConfig, onEditMedia, onDeleteMedia, onToggleMediaHidden, onToggleMediaPin }: MediaTabContentProps) {
  return (
    <div className="space-y-6">
      {/* Media Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
              <ImageIcon className="size-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl text-gray-900 dark:text-white">{mediaStats.totalImages}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">总图片数</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-pink-100 dark:bg-pink-500/20 flex items-center justify-center">
              <Video className="size-5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-2xl text-gray-900 dark:text-white">{mediaStats.totalVideos}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">总视频数</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <ShieldCheck className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl text-gray-900 dark:text-white">{mediaStats.reviewsWithMedia}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">含媒体评论</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Media Gallery by Review */}
      <div className="space-y-6">
        {task.reviews
          .filter(review => !review.isHidden && (review.images?.length || 0) + (review.videos?.length || 0) > 0)
          .sort((a, b) => {
            // Pinned items first
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
          })
          .map((review) => (
            <Card 
              key={review.id} 
              className={`bg-white dark:bg-gray-800 ${
                review.isPinned 
                  ? 'border-2 border-orange-400 dark:border-orange-500' 
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Pinned Badge */}
              {review.isPinned && (
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 flex items-center gap-2 rounded-t-lg">
                  <Pin className="size-4 text-white" />
                  <span className="text-sm font-semibold text-white">置顶买家秀</span>
                </div>
              )}
              
              <div className="p-6">
                {/* Review Info */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-gray-900 dark:text-white">{review.author}</p>
                      {review.verified && (
                        <Badge variant="secondary" className="gap-1 dark:bg-gray-700 dark:text-gray-300">
                          <ShieldCheck className="size-3" />
                          已验证
                        </Badge>
                      )}
                      <Badge className={sentimentConfig[review.sentiment].color}>
                        {sentimentConfig[review.sentiment].label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`size-3.5 ${
                              i < review.rating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                      <span>{review.date}</span>
                    </div>
                  </div>
                </div>

                {/* Review Text Preview */}
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    {review.translatedText}
                  </p>
                </div>

                {/* Media Gallery */}
                <ReviewMediaGallery images={review.images} videos={review.videos} />
                
                {/* Action Buttons */}
                <div className="mt-4 flex justify-end">
                  <MediaActions
                    reviewId={review.id}
                    isPinned={review.isPinned}
                    isHidden={review.isHidden}
                    onEdit={onEditMedia}
                    onDelete={onDeleteMedia}
                    onToggleHidden={onToggleMediaHidden}
                    onTogglePin={onToggleMediaPin}
                  />
                </div>
              </div>
            </Card>
          ))}
        
        {mediaStats.reviewsWithMedia === 0 && (
          <Card className="p-12 text-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <ImageIcon className="size-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">暂无图片或视频</p>
          </Card>
        )}
      </div>
    </div>
  );
}