import { Card } from './ui/card';

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = '没有找到匹配的任务' }: EmptyStateProps) {
  return (
    <Card className="p-12 text-center bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
    </Card>
  );
}
