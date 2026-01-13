/**
 * 首页状态管理上下文
 */
import { createContext, useContext, ReactNode } from 'react';
import { useAppState } from '../../hooks/useAppState';
import { useFilters } from '../../hooks/useFilters';
import { useUserData } from '../../hooks/useUserData';

// 创建上下文类型
type HomeContextType = ReturnType<typeof useAppState> & 
  ReturnType<typeof useFilters> & 
  ReturnType<typeof useUserData>;

const HomeContext = createContext<HomeContextType | undefined>(undefined);

export function HomeProvider({ children }: { children: ReactNode }) {
  const appState = useAppState();
  const filters = useFilters();
  const userData = useUserData();

  const value: HomeContextType = {
    ...appState,
    ...filters,
    ...userData,
  };

  return (
    <HomeContext.Provider value={value}>
      {children}
    </HomeContext.Provider>
  );
}

export function useHome() {
  const context = useContext(HomeContext);
  if (context === undefined) {
    throw new Error('useHome must be used within a HomeProvider');
  }
  return context;
}
