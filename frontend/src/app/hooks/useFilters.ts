import { useState } from 'react';

export const useFilters = () => {
  // 搜索查询
  const [searchQuery, setSearchQuery] = useState("");
  const [reportsSearchQuery, setReportsSearchQuery] = useState("");
  const [projectsSearchQuery, setProjectsSearchQuery] = useState("");

  // 分类筛选
  const [reportsTypeFilter, setReportsTypeFilter] = useState("all");
  const [projectsCategoryFilter, setProjectsCategoryFilter] = useState("all");
  const [productCenterCategoryFilter, setProductCenterCategoryFilter] = useState("all");

  // 排序
  const [reportsSortBy, setReportsSortBy] = useState("latest");
  const [projectsSortBy, setProjectsSortBy] = useState("latest");
  const [productCenterSortBy, setProductCenterSortBy] = useState("popular");

  return {
    // 搜索
    searchQuery,
    setSearchQuery,
    reportsSearchQuery,
    setReportsSearchQuery,
    projectsSearchQuery,
    setProjectsSearchQuery,

    // 筛选
    reportsTypeFilter,
    setReportsTypeFilter,
    projectsCategoryFilter,
    setProjectsCategoryFilter,
    productCenterCategoryFilter,
    setProductCenterCategoryFilter,

    // 排序
    reportsSortBy,
    setReportsSortBy,
    projectsSortBy,
    setProjectsSortBy,
    productCenterSortBy,
    setProductCenterSortBy,
  };
};
