/**
 * 数据透视洞察模块的统一容器组件
 * 确保所有5大洞察模块的视觉风格和交互行为一致
 */
import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ModuleConfig, buildModuleStyles } from './moduleConfig';

interface ModuleContainerProps {
  config: ModuleConfig;
  children: ReactNode;
  error?: string | null;
  hasData?: boolean;
  defaultExpanded?: boolean;
}

export function ModuleContainer({ 
  config, 
  children, 
  error, 
  hasData = true,
  defaultExpanded = true 
}: ModuleContainerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const styles = buildModuleStyles(config.id as any, expanded);
  const Icon = config.icon;
  
  // 错误状态 - 移动端优化
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-4 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="text-left min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">
              {config.number}. {config.title}
            </h3>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 sm:p-8 text-center">
          <p className="text-xs sm:text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      {/* 模块标题 - 可折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={styles.headerButton}
      >
        <div className="flex items-center gap-3">
          <div className={styles.iconContainer}>
            <Icon className={styles.icon} />
          </div>
          <div className="text-left">
            <h3 className={styles.titleText}>
              {config.number}. {config.title}
            </h3>
            <p className={styles.subtitleText}>
              {config.subtitle}
            </p>
          </div>
        </div>
        
        {/* 折叠图标 */}
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className={styles.chevronIcon} />
          ) : (
            <ChevronDown className={styles.chevronIcon} />
          )}
        </div>
      </button>
      
      {/* 内容区域 - 移动端优化 */}
      {expanded && (
        <div className={styles.content}>
          {hasData ? (
            children
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 sm:p-8 text-center">
              <p className="text-xs sm:text-sm text-gray-600">
                暂无数据，请检查评论内容或重新分析
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
