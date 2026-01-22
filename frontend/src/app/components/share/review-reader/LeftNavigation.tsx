/**
 * LeftNavigation - 左侧导航栏
 * 
 * 功能：
 * - 层级化的导航结构
 * - 活跃section高亮
 * - 点击平滑滚动到对应区域
 * - 可收起设计
 */
import { 
  BarChart3, Users, ShoppingBag, User, MapPin, Clock, Target, Zap,
  TrendingUp, Smile, Play, MessageSquare, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeft, FileText
} from 'lucide-react';
import { useState } from 'react';

interface LeftNavigationProps {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  dimensions: string[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const themeConfig = [
  { key: 'buyer', label: 'Buyer', sub: '购买者', icon: ShoppingBag, color: '#3B82F6' },
  { key: 'user', label: 'User', sub: '使用者', icon: User, color: '#06B6D4' },
  { key: 'where', label: 'Where', sub: '地点', icon: MapPin, color: '#8B5CF6' },
  { key: 'when', label: 'When', sub: '时机', icon: Clock, color: '#10B981' },
  { key: 'why', label: 'Why', sub: '动机', icon: Target, color: '#F43F5E' },
  { key: 'what', label: 'What', sub: '用途', icon: Zap, color: '#F59E0B' },
];

export function LeftNavigation({ 
  activeSection, 
  onNavigate, 
  dimensions,
  isCollapsed,
  onToggleCollapse
}: LeftNavigationProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview', 'themes', 'dimensions'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const isActive = (id: string) => activeSection === id;

  const NavItem = ({ 
    id, 
    icon: Icon, 
    label, 
    sub,
    color,
    indent = false 
  }: { 
    id: string; 
    icon: any; 
    label: string; 
    sub?: string;
    color?: string;
    indent?: boolean;
  }) => (
    <button
      onClick={() => onNavigate(id)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all
        ${indent ? 'ml-4' : ''}
        ${isActive(id) 
          ? 'bg-blue-50 text-blue-700 font-medium' 
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      title={isCollapsed ? label : undefined}
    >
      <Icon 
        className="h-4 w-4 flex-shrink-0" 
        style={color ? { color } : undefined}
      />
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <span className="text-sm truncate">{label}</span>
          {sub && <span className="text-xs text-gray-400 ml-1">({sub})</span>}
        </div>
      )}
    </button>
  );

  const SectionHeader = ({ 
    id, 
    icon: Icon, 
    label,
    hasChildren = true
  }: { 
    id: string; 
    icon: any; 
    label: string;
    hasChildren?: boolean;
  }) => (
    <button
      onClick={() => hasChildren ? toggleSection(id) : onNavigate(id)}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all
        ${isActive(id) ? 'text-blue-700' : 'text-gray-800'}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!isCollapsed && (
        <>
          <span className="text-sm font-semibold flex-1">{label}</span>
          {hasChildren && (
            expandedSections.has(id) 
              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          )}
        </>
      )}
    </button>
  );

  return (
    <nav 
      className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-14' : 'w-52'
      }`}
      style={{ height: 'calc(100vh - 110px)', position: 'sticky', top: '110px' }}
    >
      {/* 收起/展开按钮 */}
      <div className="p-2 border-b border-gray-100">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          title={isCollapsed ? '展开导航' : '收起导航'}
        >
          {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {/* 数据概览 */}
        <SectionHeader id="overview" icon={BarChart3} label="数据概览" />
        {!isCollapsed && expandedSections.has('overview') && (
          <div className="space-y-0.5 mb-2">
            <NavItem id="overall" icon={FileText} label="整体总结" indent />
            <NavItem id="personas" icon={Users} label="消费者原型" indent />
          </div>
        )}

        {/* 5W主题分析 */}
        <SectionHeader id="themes" icon={Users} label="5W主题" />
        {!isCollapsed && expandedSections.has('themes') && (
          <div className="space-y-0.5 mb-2">
            {themeConfig.map(theme => (
              <NavItem 
                key={theme.key} 
                id={`theme-${theme.key}`} 
                icon={theme.icon} 
                label={theme.label}
                sub={theme.sub}
                color={theme.color}
                indent 
              />
            ))}
          </div>
        )}

        {/* 产品维度 */}
        <SectionHeader id="dimensions" icon={TrendingUp} label="产品维度" />
        {!isCollapsed && expandedSections.has('dimensions') && (
          <div className="space-y-0.5 mb-2">
            {dimensions.slice(0, 8).map(dim => (
              <NavItem 
                key={dim} 
                id={`dim-${dim}`} 
                icon={TrendingUp} 
                label={dim}
                indent 
              />
            ))}
            {dimensions.length > 8 && (
              <div className="text-xs text-gray-400 pl-7 py-1">
                +{dimensions.length - 8} 更多维度
              </div>
            )}
          </div>
        )}

        {/* 情感场景 */}
        <SectionHeader id="emotions" icon={Smile} label="情感场景" hasChildren={false} />

        {/* 评论明细 */}
        <SectionHeader id="reviews" icon={MessageSquare} label="评论明细" hasChildren={false} />
      </div>
    </nav>
  );
}
