/**
 * PrintContext - 全局打印模式状态
 * 
 * 用于在导出PDF时通知所有组件进入打印模式：
 * - 强制展开所有折叠内容
 * - 显示PrintHeader
 * - 隐藏交互元素
 */
import { createContext, useContext, useState, ReactNode } from 'react';

interface PrintContextType {
  isPrintMode: boolean;
  setIsPrintMode: (value: boolean) => void;
}

const PrintContext = createContext<PrintContextType | undefined>(undefined);

export function PrintProvider({ children }: { children: ReactNode }) {
  const [isPrintMode, setIsPrintMode] = useState(false);

  return (
    <PrintContext.Provider value={{ isPrintMode, setIsPrintMode }}>
      {children}
    </PrintContext.Provider>
  );
}

export function usePrintMode() {
  const context = useContext(PrintContext);
  if (!context) {
    // 如果没有Provider，返回默认值
    return { isPrintMode: false, setIsPrintMode: () => {} };
  }
  return context;
}

export { PrintContext };
