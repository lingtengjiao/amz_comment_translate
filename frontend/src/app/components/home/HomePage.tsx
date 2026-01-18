/**
 * 首页主组件 - 1:1 复刻原始设计
 */
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { HomeProvider, useHome } from './HomeContext';
import { HomeSidebar } from './HomeSidebar';
import { HomeHeader } from './HomeHeader';
import { HomeSection } from './sections/HomeSection';
import { MyProjectsSection } from './sections/MyProjectsSection';
import { ProductCenterSection } from './sections/ProductCenterSection';
import { AICompareSection } from './sections/AICompareSection';
import { MarketInsightSection } from './sections/MarketInsightSection';
import { ReportsSection } from './sections/ReportsSection';
import type { AppSection } from './types/homepage.types';

function HomeContent() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const { showUserMenu, setShowUserMenu } = useHome();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 计算当前有效的 section（直接从 URL 获取，不依赖 state）
  const validSections: AppSection[] = ['home', 'my-projects', 'product-center', 'ai-compare', 'market-insight', 'reports'];
  const currentSection: AppSection = section && validSections.includes(section as AppSection) 
    ? (section as AppSection) 
    : 'home';

  // 如果 URL 无效，重定向到首页
  useEffect(() => {
    if (!section || !validSections.includes(section as AppSection)) {
      navigate('/home/home', { replace: true });
    }
  }, [section, navigate]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = () => {
      if (showUserMenu) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showUserMenu, setShowUserMenu]);

  // 根据 URL 参数渲染内容（不依赖 state）
  const renderContent = () => {
    switch (currentSection) {
      case 'home':
        return <HomeSection />;
      case 'my-projects':
        return <MyProjectsSection />;
      case 'product-center':
        return <ProductCenterSection />;
      case 'ai-compare':
        return <AICompareSection />;
      case 'market-insight':
        return <MarketInsightSection />;
      case 'reports':
        return <ReportsSection />;
      default:
        return <HomeSection />;
    }
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden relative">
      {/* Left Sidebar - Fixed */}
      <HomeSidebar />

      {/* Right Content Area - Scrollable */}
      <div ref={scrollContainerRef} className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Bar - Sticky */}
        <HomeHeader />

        {/* Main Content */}
        <main className="flex-1 bg-white p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <HomeProvider>
      <Toaster position="top-center" richColors />
      <HomeContent />
    </HomeProvider>
  );
}
