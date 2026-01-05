import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'destructive' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmVariant = 'destructive',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {confirmVariant === 'destructive' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="size-6 text-red-600 dark:text-red-400" />
              </div>
            )}
            <div className="flex-1 pt-1">
              <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {message}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-row-reverse gap-2 sm:gap-0">
          <Button
            onClick={onConfirm}
            size="sm"
            className={
              confirmVariant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : ''
            }
          >
            {confirmText}
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            size="sm"
          >
            {cancelText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
