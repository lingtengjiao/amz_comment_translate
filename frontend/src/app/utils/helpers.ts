import type { Product, Report } from '../types/homepage.types';

// 格式化日期时间
export const formatDateTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${hours}:${minutes} | ${month}月${day}日`;
};

// 搜索和筛选产品
export const filterProducts = (
  products: Product[],
  searchQuery: string,
  categoryFilter: string
): Product[] => {
  return products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
};

// 排序产品
export const sortProducts = (
  products: Product[],
  sortBy: string
): Product[] => {
  const sorted = [...products];
  switch (sortBy) {
    case "latest":
      // 按ID倒序（最新添加）
      return sorted.sort((a, b) => b.id - a.id);
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "reviews":
      return sorted.sort((a, b) => {
        const aReviews = typeof a.reviews === 'string' ? parseInt(a.reviews) : a.reviews;
        const bReviews = typeof b.reviews === 'string' ? parseInt(b.reviews) : b.reviews;
        return bReviews - aReviews;
      });
    case "popular":
      // 综合评分：rating * reviews
      return sorted.sort((a, b) => {
        const aScore = a.rating * (typeof a.reviews === 'string' ? parseInt(a.reviews) : a.reviews);
        const bScore = b.rating * (typeof b.reviews === 'string' ? parseInt(b.reviews) : b.reviews);
        return bScore - aScore;
      });
    default:
      return sorted;
  }
};

// 搜索和筛选报告
export const filterReports = (
  reports: Report[],
  searchQuery: string,
  typeFilter: string
): Report[] => {
  return reports.filter(report => {
    const matchesSearch = 
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.asin.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || report.reportType === typeFilter;
    return matchesSearch && matchesType;
  });
};

// 排序报告
export const sortReports = (
  reports: Report[],
  sortBy: string
): Report[] => {
  const sorted = [...reports];
  switch (sortBy) {
    case "latest":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    default:
      return sorted;
  }
};

// 检查产品是否已添加
export const isProductInList = (productCode: string, myProjectsList: Product[]): boolean => {
  return myProjectsList.some(p => p.code === productCode);
};

// 生成唯一ID
export const generateId = (): number => {
  return Date.now() + Math.floor(Math.random() * 1000);
};
