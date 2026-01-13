import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Product, HistoryItem, CompareHistoryItem } from '../types/homepage.types';

export const useUserData = () => {
  // 使用现有的 AuthContext 获取认证状态
  const auth = useAuth();

  // 收藏列表
  const [favoriteProjects, setFavoriteProjects] = useState<number[]>([2, 4, 6]);
  const [favoriteReports, setFavoriteReports] = useState<number[]>([1, 3, 5]);

  // 我的产品列表
  const [myProjectsList, setMyProjectsList] = useState<Product[]>([]);

  // 最近历史记录
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([
    {
      id: 1,
      type: "analyze",
      title: "Multi-Purpose Pull-Out Storage Organizers, Under Sink/Cabinet Organizers and Storage for Bathroom & Kitchen, Black, 12.2 Inches, 2 Packs",
      timestamp: "2小时前"
    },
    {
      id: 2,
      type: "analyze",
      title: "Smallest Invisible Sleep Earbuds, Comfortable Noise Blocking Wireless Headphones, Flat Bluetooth Ear Buds for Side Sleepers, Zero Pressure",
      timestamp: "昨天"
    },
    {
      id: 3,
      type: "analyze",
      title: "15Set Leather Office Desk Pad Protector, Large Mouse Pad, Non-Slip, PU Leather, Laptop Desk Blotter, Waterproof Writing Pad for Office a...",
      timestamp: "3天前"
    }
  ]);

  const [recentCompareHistory, setRecentCompareHistory] = useState<CompareHistoryItem[]>([
    {
      id: 1,
      products: [
        { asin: "B09V3KXJPB", title: "智能音箱 Echo Dot 5th Gen", image: "https://images.unsplash.com/photo-1558002038-1055907df827?w=100" },
        { asin: "B09B8V1LZ3", title: "Google Nest Mini 2nd Gen", image: "https://images.unsplash.com/photo-1543512214-318c7553f230?w=100" },
        { asin: "B08KRG4X4Q", title: "HomePod mini - Space Gray", image: "https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=100" }
      ],
      comparedAt: "3小时前"
    },
    {
      id: 2,
      products: [
        { asin: "B08XYZABC1", title: "Air Fryer 6QT Digital", image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=100" },
        { asin: "B07ZYQN3P2", title: "Instant Pot Vortex Plus", image: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=100" }
      ],
      comparedAt: "昨天"
    },
    {
      id: 3,
      products: [
        { asin: "B08N5WRWNW", title: "Sony WH-1000XM4 Wireless", image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=100" },
        { asin: "B0BZD7S9ZF", title: "Bose QuietComfort 45", image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=100" },
        { asin: "B09JQMJHXY", title: "AirPods Max - Silver", image: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=100" }
      ],
      comparedAt: "2天前"
    }
  ]);

  // 切换收藏状态
  const toggleFavoriteProject = (id: number) => {
    setFavoriteProjects(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const toggleFavoriteReport = (id: number) => {
    setFavoriteReports(prev => 
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  return {
    // 登录状态 - 从 AuthContext 获取
    isLoggedIn: auth.isAuthenticated,
    userInfo: {
      name: auth.user?.name || auth.user?.email?.split('@')[0] || '',
      email: auth.user?.email || ''
    },
    logout: auth.logout,

    // 收藏
    favoriteProjects,
    setFavoriteProjects,
    toggleFavoriteProject,
    favoriteReports,
    setFavoriteReports,
    toggleFavoriteReport,

    // 我的产品
    myProjectsList,
    setMyProjectsList,

    // 历史记录
    recentHistory,
    setRecentHistory,
    recentCompareHistory,
    setRecentCompareHistory,
  };
};
