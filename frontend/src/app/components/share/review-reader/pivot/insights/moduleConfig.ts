/**
 * 数据透视5大洞察模块的统一配置
 * 确保视觉风格、交互行为的一致性
 */
import { Users, Target, Package, MapPin, Heart } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface ModuleConfig {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  // 颜色配置
  colors: {
    primary: string;       // 主色调
    bgGradient: string;    // 渐变背景
    hoverGradient: string; // hover渐变
    border: string;        // 边框色
    iconBg: string;        // 图标背景
    iconColor: string;     // 图标颜色
  };
  // 业务价值说明
  businessValue: string;
  // 后端 insight_type（用于数据匹配）
  insightTypes: string[];
}

export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  audience: {
    id: 'audience',
    number: 1,
    title: '人群洞察 (WHO)',
    subtitle: '识别决策者与使用者，精准定位目标人群',
    icon: Users,
    colors: {
      primary: 'blue',
      bgGradient: 'from-blue-50 to-indigo-50',
      hoverGradient: 'from-blue-100 to-indigo-100',
      border: 'border-blue-200',
      iconBg: 'bg-blue-600',
      iconColor: 'text-blue-600',
    },
    businessValue: '用于精准定位目标受众，优化广告投放和文案话术',
    insightTypes: ['decision_flow', 'audience_strength'],
  },
  
  demand: {
    id: 'demand',
    number: 2,
    title: '需求洞察 (WHY)',
    subtitle: '分析购买动机和期望满足度',
    icon: Target,
    colors: {
      primary: 'green',
      bgGradient: 'from-green-50 to-emerald-50',
      hoverGradient: 'from-green-100 to-emerald-100',
      border: 'border-green-200',
      iconBg: 'bg-green-600',
      iconColor: 'text-green-600',
    },
    businessValue: '验证产品是否满足用户期望，发现口碑传播点和风险点',
    insightTypes: ['demand_satisfaction'],
  },
  
  product: {
    id: 'product',
    number: 3,
    title: '产品洞察 (WHAT)',
    subtitle: '识别致命缺陷，核心竞争力和差异化机会',
    icon: Package,
    colors: {
      primary: 'purple',
      bgGradient: 'from-purple-50 to-violet-50',
      hoverGradient: 'from-purple-100 to-violet-100',
      border: 'border-purple-200',
      iconBg: 'bg-purple-600',
      iconColor: 'text-purple-600',
    },
    businessValue: '指导产品改进优先级，识别核心竞争力和差异化方向',
    insightTypes: ['critical_weakness', 'strength_weakness', 'improvement_priority'],
  },
  
  scenario: {
    id: 'scenario',
    number: 4,
    title: '场景洞察 (WHERE/WHEN)',
    subtitle: '分析使用场景分布和满意度分布',
    icon: MapPin,
    colors: {
      primary: 'orange',
      bgGradient: 'from-orange-50 to-amber-50',
      hoverGradient: 'from-orange-100 to-amber-100',
      border: 'border-orange-200',
      iconBg: 'bg-orange-600',
      iconColor: 'text-orange-600',
    },
    businessValue: '挖掘高频使用场景和流量密码，指导投放时段和内容策略',
    insightTypes: ['scenario_distribution', 'scenario_sentiment'],
  },
  
  brand: {
    id: 'brand',
    number: 5,
    title: '品牌洞察 (BRAND)',
    subtitle: '分析品牌心智和用户推荐意愿',
    icon: Heart,
    colors: {
      primary: 'pink',
      bgGradient: 'from-pink-50 to-rose-50',
      hoverGradient: 'from-pink-100 to-rose-100',
      border: 'border-pink-200',
      iconBg: 'bg-pink-600',
      iconColor: 'text-pink-600',
    },
    businessValue: '评估品牌口碑和NPS，识别品牌记忆点和情感共鸣',
    insightTypes: ['brand_mind', 'recommendation_willingness'],
  },
};

/**
 * 统一的样式类（Tailwind CSS）- 移动端优化
 */
export const UNIFIED_STYLES = {
  // 外层容器 - 移动端减小圆角和边框
  container: 'bg-white rounded-xl sm:rounded-2xl border sm:border-2 shadow-sm hover:shadow-md transition-shadow overflow-hidden',
  
  // 标题区域按钮 - 移动端减小内边距
  headerButton: (expanded: boolean) => 
    `w-full px-4 py-3 sm:px-6 sm:py-4 transition-colors flex items-center justify-between ${
      expanded ? 'bg-gradient-to-r' : 'bg-gradient-to-r hover:opacity-90 active:opacity-80'
    }`,
  
  // 图标容器 - 移动端缩小尺寸
  iconContainer: 'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0',
  
  // 图标 - 移动端缩小尺寸
  icon: 'h-5 w-5 sm:h-6 sm:w-6 text-white',
  
  // 标题文字 - 移动端缩小字体
  titleText: 'text-base sm:text-lg font-bold text-gray-900',
  
  // 副标题文字 - 移动端缩小字体，可能隐藏
  subtitleText: 'text-xs sm:text-sm text-gray-600 hidden sm:block',
  
  // 折叠图标 - 移动端缩小尺寸
  chevronIcon: 'h-4 w-4 sm:h-5 sm:w-5 text-gray-500 transition-transform flex-shrink-0',
  
  // 内容区域 - 移动端减小内边距
  content: 'p-4 sm:p-6',
  
  // 空数据提示 - 移动端减小内边距
  emptyState: 'bg-gray-50 rounded-xl p-4 sm:p-8 text-center',
  emptyStateText: 'text-xs sm:text-sm text-gray-600',
};

/**
 * 获取指定模块的配置
 */
export function getModuleConfig(moduleId: keyof typeof MODULE_CONFIGS): ModuleConfig {
  return MODULE_CONFIGS[moduleId];
}

/**
 * 构建完整的样式类名
 */
export function buildModuleStyles(moduleId: keyof typeof MODULE_CONFIGS, expanded: boolean) {
  const config = MODULE_CONFIGS[moduleId];
  
  return {
    container: `${UNIFIED_STYLES.container} ${config.colors.border}`,
    headerButton: `${UNIFIED_STYLES.headerButton(expanded)} ${
      expanded 
        ? config.colors.bgGradient 
        : `${config.colors.bgGradient} hover:${config.colors.hoverGradient}`
    }`,
    iconContainer: `${UNIFIED_STYLES.iconContainer} ${config.colors.iconBg}`,
    icon: UNIFIED_STYLES.icon,
    titleText: UNIFIED_STYLES.titleText,
    subtitleText: UNIFIED_STYLES.subtitleText,
    chevronIcon: UNIFIED_STYLES.chevronIcon,
    content: UNIFIED_STYLES.content,
  };
}
