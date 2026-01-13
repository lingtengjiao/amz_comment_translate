/**
 * 首页侧边栏组件 - 1:1 复刻原始设计
 */
import { 
  Home, 
  Package, 
  Folder, 
  Brain, 
  FileText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { EyeIcon } from '../EyeIcon';
import { useHome } from './HomeContext';
import type { AppSection } from '../../types/homepage.types';

export function HomeSidebar() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    showUserMenu,
    setShowUserMenu,
    userInfo,
    logout,
  } = useHome();

  // 从 URL 获取当前激活的 section
  const validSections: AppSection[] = ['home', 'my-projects', 'product-center', 'ai-compare', 'reports'];
  const activeSection: AppSection = section && validSections.includes(section as AppSection) 
    ? (section as AppSection) 
    : 'home';

  const navItems: { id: AppSection; label: string; icon: typeof Home }[] = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'product-center', label: '洞察广场', icon: Package },
    { id: 'my-projects', label: '我的洞察', icon: Folder },
    { id: 'ai-compare', label: 'AI 竞品对比', icon: Brain },
    { id: 'reports', label: '报告库', icon: FileText },
  ];

  // 通过路由切换板块
  const handleNavigate = (sectionId: AppSection) => {
    navigate(`/home/${sectionId}`);
  };

  return (
    <>
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} bg-slate-50 border-r border-slate-200 flex-shrink-0 flex flex-col transition-[width] duration-300 ease-in-out relative h-screen overflow-hidden z-20`}>
        {/* Logo */}
        <div className={`${sidebarCollapsed ? 'p-4' : 'p-5'} flex items-center justify-between transition-all duration-300 overflow-hidden`}>
          <div className="flex items-center gap-2 min-w-0">
            <EyeIcon className="w-8 h-8 flex-shrink-0" withBackground />
            <div className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
              <h1 className="font-semibold text-slate-900 text-sm whitespace-nowrap">洞察大王</h1>
            </div>
          </div>
          {/* Collapse button - always present but may be invisible */}
          <button
            onClick={() => setSidebarCollapsed(true)}
            className={`w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
              sidebarCollapsed ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100'
            }`}
            title="折叠侧边栏"
          >
            <PanelLeftClose className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg transition-all text-sm ${
                activeSection === item.id
                  ? "bg-rose-50 text-rose-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className={`font-medium transition-all duration-300 whitespace-nowrap ${
                sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-slate-200 relative">
          <div 
            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'} px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-all duration-300`}
            onClick={(e) => {
              e.stopPropagation();
              setShowUserMenu(!showUserMenu);
            }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {userInfo.name ? userInfo.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-300 ${
              sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}>
              <div className="text-sm font-medium text-slate-900 truncate whitespace-nowrap">{userInfo.name || '用户'}</div>
              <div className="text-xs text-slate-500 truncate whitespace-nowrap">{userInfo.email}</div>
            </div>
          </div>

          {/* User Menu Dropdown */}
          {showUserMenu && !sidebarCollapsed && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-30">
              <button
                onClick={() => {
                  logout();
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-rose-50 transition-colors text-sm text-slate-700 hover:text-rose-600"
              >
                <LogOut className="w-4 h-4" />
                <span>退出登录</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Expand button - positioned outside sidebar */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed left-[52px] top-5 w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition-all shadow-sm z-50"
          title="展开侧边栏"
        >
          <PanelLeftOpen className="w-3.5 h-3.5 text-slate-600" />
        </button>
      )}
    </>
  );
}
