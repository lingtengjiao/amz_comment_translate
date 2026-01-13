// 产品类型
export interface Product {
  id: number;
  name: string;
  code: string;
  image: string;
  rating: number;
  reviews: number | string;
  category: string;
  productsCount?: number;
  isFavorite?: boolean;
  lastUpdate?: string;
}

// 报告类型
export interface Report {
  id: number;
  title: string;
  reportType: string;
  asin: string;
  projectImage: string;
  createdAt: string;
  fileSize: string;
  status: 'completed' | 'generating';
  progress?: number;
}

// 对比项目类型
export interface CompareProject {
  id: number;
  name: string;
  productsCount: number;
  status: string;
  insights: number;
  sentiment: number;
  lastUpdate: string;
  progress?: number;
  productAvatars: string[];
}

// 产品中心项目类型
export interface ProductCenterItem {
  id: number;
  code: string;
  name: string;
  image: string;
  category: string;
  rating: number;
  reviewsCount: number;
  price: string;
  sales: string;
  addedBy: number;
}

// 历史记录类型
export interface HistoryItem {
  id: number;
  type: string;
  title: string;
  timestamp: string;
}

// 对比历史类型
export interface CompareHistoryItem {
  id: number;
  products: {
    asin: string;
    title: string;
    image: string;
  }[];
  comparedAt: string;
}

// 删除确认对话框类型
export interface DeleteConfirmDialog {
  open: boolean;
  type: 'report' | 'project' | 'compare' | null;
  id: number | null;
  title: string;
}

// 应用页面类型
export type AppSection = "home" | "my-projects" | "product-center" | "ai-compare" | "reports";

// 标签类型
export type TabType = "all" | "favorites";

// 爬取模式类型
export type CrawlMode = "fast" | "stable";

// 爬取页数类型
export type CrawlPages = 3 | 5 | 10;

// 首页模式类型
export type HomeMode = "analyze" | "compare";
