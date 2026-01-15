/**
 * Card - 报告卡片通用组件
 */
import { memo, useState, useCallback, useRef, useEffect, useContext, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { TocContext } from './contexts';

interface CardProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  id?: string;
  level?: number;
}

const variantStyles = {
  default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
  danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
};

export const Card = memo(function Card({ 
  title, 
  icon: Icon, 
  children, 
  className = '',
  variant = 'default',
  id,
  level = 0
}: CardProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { registerSection } = useContext(TocContext);

  // 移除 title 中的 emoji，只保留文字
  const cleanTitle = title.replace(/^[\u{1F300}-\u{1F9FF}]+\s*/u, '').trim() || title;
  
  // 生成 ID（如果没有提供）
  const cardId = useMemo(() => {
    if (id) return id;
    const baseId = cleanTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    return baseId ? `section-${baseId}` : `section-${Math.random().toString(36).substr(2, 9)}`;
  }, [id, cleanTitle]);
  
  // 注册到大纲
  useEffect(() => {
    if (registerSection && cardRef.current) {
      const timer = requestAnimationFrame(() => {
        registerSection(cardId, cleanTitle, level);
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [cardId, cleanTitle, level, registerSection]);

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return;
    const textContent = cardRef.current.innerText || '';
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  return (
    <div 
      id={cardId}
      ref={cardRef} 
      className={`rounded-lg border p-4 ${variantStyles[variant]} ${className} relative scroll-mt-24`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-5 text-gray-600 dark:text-gray-400" />}
          <h3 className="font-semibold text-gray-900 dark:text-white">{cleanTitle}</h3>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="复制内容"
        >
          {copied ? (
            <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      {children}
    </div>
  );
});
