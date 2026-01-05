import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'info' | 'warning';
  confirmText?: string;
}

export function InfoDialog({
  open,
  onClose,
  title,
  message,
  type = 'info',
  confirmText = '确定'
}: InfoDialogProps) {
  const iconMap = {
    success: <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />,
    info: <Info className="h-6 w-6 text-blue-600 dark:text-blue-400" />,
    warning: <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />,
  };

  const bgColorMap = {
    success: 'bg-green-50 dark:bg-green-500/10',
    info: 'bg-blue-50 dark:bg-blue-500/10',
    warning: 'bg-yellow-50 dark:bg-yellow-500/10',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full ${bgColorMap[type]} flex items-center justify-center`}>
              {iconMap[type]}
            </div>
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
        <div className="flex justify-end mt-4">
          <Button onClick={onClose} size="sm">
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

