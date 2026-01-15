/**
 * ListItem - 列表项组件
 */
import { memo } from 'react';
import { ChevronRight } from 'lucide-react';

interface ListItemProps {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

const iconColors = {
  default: 'text-gray-400',
  success: 'text-emerald-500',
  danger: 'text-red-500',
  warning: 'text-amber-500'
};

export const ListItem = memo(function ListItem({ 
  children, 
  icon: Icon,
  variant = 'default'
}: ListItemProps) {
  return (
    <li className="flex items-start gap-2 py-1">
      {Icon ? (
        <Icon className={`size-4 mt-0.5 flex-shrink-0 ${iconColors[variant]}`} />
      ) : (
        <ChevronRight className={`size-4 mt-0.5 flex-shrink-0 ${iconColors[variant]}`} />
      )}
      <span className="text-sm text-gray-700 dark:text-gray-300">{children}</span>
    </li>
  );
});
