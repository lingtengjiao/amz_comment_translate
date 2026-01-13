import { useState } from 'react';
import type { 
  AppSection, 
  TabType, 
  CrawlMode, 
  CrawlPages, 
  HomeMode, 
  DeleteConfirmDialog 
} from '../types/homepage.types';

export const useAppState = () => {
  // 导航状态
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  // 对话框状态
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showCompareLaunchpad, setShowCompareLaunchpad] = useState(false);
  const [showCompareConfigDialog, setShowCompareConfigDialog] = useState(false);
  const [showGeneratingDialog, setShowGeneratingDialog] = useState(false);
  const [showLaunchpad, setShowLaunchpad] = useState(false);
  const [showAICompareDialog, setShowAICompareDialog] = useState(false);
  const [showCrawlDialog, setShowCrawlDialog] = useState(false);
  const [showCrawlRunningDialog, setShowCrawlRunningDialog] = useState(false);
  const [showProductSelectDialog, setShowProductSelectDialog] = useState(false);
  const [showAdvancedOptionsDialog, setShowAdvancedOptionsDialog] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // 标签页状态
  const [projectsTab, setProjectsTab] = useState<TabType>("all");
  const [reportsTab, setReportsTab] = useState<TabType>("all");
  const [productSelectDialogTab, setProductSelectDialogTab] = useState<TabType>("all");

  // 爬取状态
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [crawlMode, setCrawlMode] = useState<CrawlMode>("stable");
  const [crawlPages, setCrawlPages] = useState<CrawlPages>(5);
  const [crawlRating, setCrawlRating] = useState<number[]>([1, 2, 3, 4, 5]);
  const [crawlInput, setCrawlInput] = useState("");

  // 首页模式
  const [homeMode, setHomeMode] = useState<HomeMode>("analyze");
  const [compareProducts, setCompareProducts] = useState<string[]>([]);
  const [compareProjectName, setCompareProjectName] = useState("");

  // 生成进度
  const [generatingProgress, setGeneratingProgress] = useState(0);

  // 选中产品
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // 删除确认对话框
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<DeleteConfirmDialog>({
    open: false,
    type: null,
    id: null,
    title: ''
  });

  // 其他状态
  const [currentTime, setCurrentTime] = useState(new Date());

  return {
    // 导航
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    projectsExpanded,
    setProjectsExpanded,

    // 对话框
    showCreateDialog,
    setShowCreateDialog,
    showCompareDialog,
    setShowCompareDialog,
    showCompareLaunchpad,
    setShowCompareLaunchpad,
    showCompareConfigDialog,
    setShowCompareConfigDialog,
    showGeneratingDialog,
    setShowGeneratingDialog,
    showLaunchpad,
    setShowLaunchpad,
    showAICompareDialog,
    setShowAICompareDialog,
    showCrawlDialog,
    setShowCrawlDialog,
    showCrawlRunningDialog,
    setShowCrawlRunningDialog,
    showProductSelectDialog,
    setShowProductSelectDialog,
    showAdvancedOptionsDialog,
    setShowAdvancedOptionsDialog,
    showUserMenu,
    setShowUserMenu,

    // 标签页
    projectsTab,
    setProjectsTab,
    reportsTab,
    setReportsTab,
    productSelectDialogTab,
    setProductSelectDialogTab,

    // 爬取
    isCrawling,
    setIsCrawling,
    crawlProgress,
    setCrawlProgress,
    crawlMode,
    setCrawlMode,
    crawlPages,
    setCrawlPages,
    crawlRating,
    setCrawlRating,
    crawlInput,
    setCrawlInput,

    // 首页
    homeMode,
    setHomeMode,
    compareProducts,
    setCompareProducts,
    compareProjectName,
    setCompareProjectName,

    // 其他
    generatingProgress,
    setGeneratingProgress,
    selectedProducts,
    setSelectedProducts,
    deleteConfirmDialog,
    setDeleteConfirmDialog,
    currentTime,
    setCurrentTime,
  };
};
