import { Search, Filter } from 'lucide-react';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { TaskStatus } from '../data/mockData';

interface TaskListFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  statusFilter: TaskStatus | 'all';
  setStatusFilter: (value: TaskStatus | 'all') => void;
}

export function TaskListFilters({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter
}: TaskListFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-8">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          type="text"
          placeholder="搜索商品标题或 ASIN..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
        />
      </div>
      <div className="flex gap-2 items-center">
        <Filter className="size-4 text-gray-500" />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TaskStatus | 'all')}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="筛选状态" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="translating">翻译中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
