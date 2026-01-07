/**
 * TableOfContents - 报告大纲导航组件
 * 
 * 功能：
 * 1. 自动提取报告中的所有板块标题
 * 2. 点击标题快速定位到对应板块
 * 3. 滚动时自动高亮当前可见的板块
 */
import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

interface TableOfContentsProps {
  sections: Array<{ id: string; title: string; level?: number }>;
  className?: string;
  isDrawerOpen?: boolean; // 是否打开证据抽屉
}

export const TableOfContents = memo(function TableOfContents({
  sections,
  className = '',
  isDrawerOpen = false
}: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 使用 Intersection Observer 检测当前可见的板块
  useEffect(() => {
    if (sections.length === 0) {
      setActiveId('');
      return;
    }

    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // 延迟创建 observer，确保 DOM 已渲染
    const timer = setTimeout(() => {
      try {
        // 创建新的 observer
        observerRef.current = new IntersectionObserver(
          (entries) => {
            // 找到所有可见的条目
            const visibleEntries = entries.filter(entry => entry.isIntersecting);
            
            if (visibleEntries.length > 0) {
              // 选择最接近顶部的可见条目
              const topEntry = visibleEntries.reduce((prev, current) => {
                return current.boundingClientRect.top < prev.boundingClientRect.top ? current : prev;
              });
              
              if (topEntry.target.id) {
                setActiveId(topEntry.target.id);
              }
            }
          },
          {
            rootMargin: '-20% 0px -70% 0px', // 当板块进入视口上方 20% 时激活
            threshold: [0, 0.1, 0.5, 1]
          }
        );

        // 观察所有板块
        sections.forEach(({ id }) => {
          if (id) {
            const element = document.getElementById(id);
            if (element && observerRef.current) {
              observerRef.current.observe(element);
            }
          }
        });

        // 设置第一个板块为默认激活
        if (sections[0]?.id) {
          setActiveId(prev => prev || sections[0].id);
        }
      } catch (error) {
        console.error('Error setting up IntersectionObserver:', error);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [sections]);

  // 点击标题滚动到对应板块
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100; // 距离顶部偏移量
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      setActiveId(id);
    }
  }, []);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      className={`hidden xl:block fixed left-8 top-24 w-[260px] max-h-[calc(100vh-8rem)] overflow-y-auto z-40 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-50 pointer-events-none' : 'opacity-100'} ${className}`}
    >
      <div className="bg-white/90 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          报告大纲
        </h3>
        <nav className="space-y-1">
          {sections.map((section) => {
            const isActive = activeId === section.id;
            const level = section.level || 0;

            return (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
              >
                {isActive && <ChevronRight className="size-3 flex-shrink-0" />}
                <span className="truncate">{section.title}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
});

export default TableOfContents;

