import { Search, Filter, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';

type FilterRating = 'all' | '5' | '4' | '3' | '2' | '1';
type FilterSentiment = 'all' | 'positive' | 'negative' | 'neutral';
type SortOption = 'date-desc' | 'date-asc' | 'rating-desc' | 'rating-asc' | 'helpful-desc';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  ratingFilter: FilterRating;
  setRatingFilter: (value: FilterRating) => void;
  sentimentFilter: FilterSentiment;
  setSentimentFilter: (value: FilterSentiment) => void;
  sortOption: SortOption;
  setSortOption: (value: SortOption) => void;
  highlightEnabled: boolean;
  setHighlightEnabled: (value: boolean) => void;
  insightsExpanded: boolean;
  setInsightsExpanded: (value: boolean) => void;
}

export function FilterBar({
  searchQuery,
  setSearchQuery,
  ratingFilter,
  setRatingFilter,
  sentimentFilter,
  setSentimentFilter,
  sortOption,
  setSortOption,
  highlightEnabled,
  setHighlightEnabled,
  insightsExpanded,
  setInsightsExpanded
}: FilterBarProps) {
  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        {/* Left side: Search and Filters */}
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <Filter className="size-4 text-gray-500 dark:text-gray-400" />
          
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="搜索评论..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          <Select value={ratingFilter} onValueChange={(value) => setRatingFilter(value as FilterRating)}>
            <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="筛选星级" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all">全部星级</SelectItem>
              <SelectItem value="5">⭐⭐⭐⭐⭐ (5星)</SelectItem>
              <SelectItem value="4">⭐⭐⭐⭐ (4星)</SelectItem>
              <SelectItem value="3">⭐⭐⭐ (3星)</SelectItem>
              <SelectItem value="2">⭐⭐ (2星)</SelectItem>
              <SelectItem value="1">⭐ (1星)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value as FilterSentiment)}>
            <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="筛选情感" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all">全部情感</SelectItem>
              <SelectItem value="positive">正面</SelectItem>
              <SelectItem value="neutral">中性</SelectItem>
              <SelectItem value="negative">负面</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
            <SelectTrigger className="w-[170px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="排序选项" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="date-desc">日期降序</SelectItem>
              <SelectItem value="date-asc">日期升序</SelectItem>
              <SelectItem value="rating-desc">评分降序</SelectItem>
              <SelectItem value="rating-asc">评分升序</SelectItem>
              <SelectItem value="helpful-desc">买家赞同数降序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right side: Insights Toggle */}
        <div className="flex items-center gap-4">
          {/* 折叠/展开洞察按钮 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInsightsExpanded(!insightsExpanded)}
            className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
          >
            <Lightbulb className="size-4" />
            <span>{insightsExpanded ? '收起洞察' : '展开洞察'}</span>
            {insightsExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}