import { X, Eye } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import type { Review } from '../data/mockData';

interface HiddenReviewsModalProps {
  hiddenReviews: Review[];
  onClose: () => void;
  onRestore: (id: string) => void;
}

export function HiddenReviewsModal({ hiddenReviews, onClose, onRestore }: HiddenReviewsModalProps) {
  if (hiddenReviews.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-3xl max-h-[80vh] overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            隐藏的评论 ({hiddenReviews.length})
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="size-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4">
          <div className="space-y-3">
            {hiddenReviews.map((review) => (
              <div
                key={review.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Review Info */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {review.author}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {review.date}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[...Array(review.rating)].map((_, i) => (
                          <span key={i} className="text-yellow-400">★</span>
                        ))}
                      </div>
                    </div>

                    {/* Review Text Preview */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {review.translatedText}
                    </p>
                  </div>

                  {/* Restore Button */}
                  <Button
                    onClick={() => onRestore(review.id)}
                    size="sm"
                    variant="outline"
                    className="gap-2 flex-shrink-0"
                  >
                    <Eye className="size-4" />
                    恢复
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
