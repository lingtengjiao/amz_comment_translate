import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import type { Review } from '../data/mockData';

interface EditReviewModalProps {
  review: Review | null;
  onClose: () => void;
  onSave: (id: string, updates: { originalText: string; translatedText: string; originalTitle?: string; translatedTitle?: string }) => void;
}

export function EditReviewModal({ review, onClose, onSave }: EditReviewModalProps) {
  const [originalTitle, setOriginalTitle] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');

  useEffect(() => {
    if (review) {
      setOriginalTitle(review.originalTitle || '');
      setTranslatedTitle(review.translatedTitle || '');
      setOriginalText(review.originalText);
      setTranslatedText(review.translatedText);
    }
  }, [review]);

  if (!review) return null;

  const handleSave = () => {
    onSave(review.id, {
      originalTitle: originalTitle || undefined,
      translatedTitle: translatedTitle || undefined,
      originalText,
      translatedText
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            编辑评论
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="size-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* English Original */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  英文标题（可选）
                </label>
                <input
                  type="text"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter original title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  英文内容
                </label>
                <textarea
                  value={originalText}
                  onChange={(e) => setOriginalText(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Enter original review text..."
                />
              </div>
            </div>

            {/* Chinese Translation */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  中文标题（可选）
                </label>
                <input
                  type="text"
                  value={translatedTitle}
                  onChange={(e) => setTranslatedTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="输入中文标题..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  中文译文
                </label>
                <textarea
                  value={translatedText}
                  onChange={(e) => setTranslatedText(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  placeholder="输入中文译文..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={onClose}
            variant="outline"
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="size-4" />
            保存修改
          </Button>
        </div>
      </Card>
    </div>
  );
}
