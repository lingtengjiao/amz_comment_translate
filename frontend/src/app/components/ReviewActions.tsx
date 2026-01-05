import { useState } from 'react';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  EyeOff, 
  Eye,
  Pin, 
  PinOff 
} from 'lucide-react';

interface ReviewActionsProps {
  reviewId: string;
  isPinned?: boolean;
  isHidden?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export function ReviewActions({
  reviewId,
  isPinned = false,
  isHidden = false,
  onEdit,
  onDelete,
  onToggleHidden,
  onTogglePin
}: ReviewActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {/* Pin/Unpin Button */}
      <button
        onClick={() => onTogglePin(reviewId)}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={isPinned ? "取消置顶" : "置顶评论"}
        title={isPinned ? "取消置顶" : "置顶评论"}
      >
        {isPinned ? (
          <PinOff className="size-4 text-orange-600 dark:text-orange-400" />
        ) : (
          <Pin className="size-4 text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400" />
        )}
      </button>

      {/* Hide/Show Button */}
      <button
        onClick={() => onToggleHidden(reviewId)}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={isHidden ? "显示评论" : "隐藏评论"}
        title={isHidden ? "显示评论" : "隐藏评论"}
      >
        {isHidden ? (
          <Eye className="size-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <EyeOff className="size-4 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" />
        )}
      </button>

      {/* Edit Button */}
      <button
        onClick={() => onEdit(reviewId)}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="编辑评论"
        title="编辑评论"
      >
        <Edit className="size-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" />
      </button>

      {/* More Menu (Delete only) */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="更多操作"
          title="更多操作"
        >
          <MoreVertical className="size-4 text-gray-500 dark:text-gray-400" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsOpen(false)}
            />
            
            {/* Menu */}
            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
              {/* Delete */}
              <button
                onClick={() => {
                  onDelete(reviewId);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="size-4 text-red-600 dark:text-red-400" />
                <span className="text-red-600 dark:text-red-400">删除评论</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}