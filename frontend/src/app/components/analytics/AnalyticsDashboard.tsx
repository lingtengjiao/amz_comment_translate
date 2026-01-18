/**
 * 用户行为分析面板主组件
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { StatsOverview } from './StatsOverview';
import { UserGrowthChart } from './UserGrowthChart';
import { FeatureUsageChart } from './FeatureUsageChart';
import { ActiveUsersChart } from './ActiveUsersChart';
import { RetentionChart } from './RetentionChart';
import { RecentEventsTable } from './RecentEventsTable';
import { BarChart3, Loader2 } from 'lucide-react';

const API_BASE = '/api/v1';

interface DashboardData {
  users: {
    total: number;
    new_today: number;
    new_yesterday: number;
    growth_rate: number;
    active_7d: number;
    active_30d: number;
  };
  products: {
    total: number;
    new_today: number;
  };
  tasks: {
    total: number;
    completed: number;
    completion_rate: number;
  };
  reports: {
    total: number;
  };
}

export default function AnalyticsDashboard() {
  const { getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [userGrowthData, setUserGrowthData] = useState<any[]>([]);
  const [activeUsersData, setActiveUsersData] = useState<any[]>([]);
  const [featureUsageData, setFeatureUsageData] = useState<any>(null);
  const [retentionData, setRetentionData] = useState<any>(null);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // 并行加载所有数据
      const [dashboardRes, growthRes, activeRes, featuresRes, retentionRes, eventsRes] =
        await Promise.all([
          fetch(`${API_BASE}/analytics/dashboard?days=30`, { headers }),
          fetch(`${API_BASE}/analytics/users/growth?days=30`, { headers }),
          fetch(`${API_BASE}/analytics/users/active?days=30`, { headers }),
          fetch(`${API_BASE}/analytics/features?days=30`, { headers }),
          fetch(`${API_BASE}/analytics/retention`, { headers }),
          fetch(`${API_BASE}/analytics/events/recent?limit=50`, { headers })
        ]);

      const [dashboardJson, growthJson, activeJson, featuresJson, retentionJson, eventsJson] =
        await Promise.all([
          dashboardRes.json(),
          growthRes.json(),
          activeRes.json(),
          featuresRes.json(),
          retentionRes.json(),
          eventsRes.json()
        ]);

      if (dashboardJson.success) {
        setDashboardData(dashboardJson.data);
      }
      if (growthJson.success) {
        setUserGrowthData(growthJson.data);
      }
      if (activeJson.success) {
        setActiveUsersData(activeJson.data.daily_active_users || []);
      }
      if (featuresJson.success) {
        setFeatureUsageData(featuresJson.data);
      }
      if (retentionJson.success) {
        setRetentionData(retentionJson.data);
      }
      if (eventsJson.success) {
        setRecentEvents(eventsJson.data);
      }
    } catch (error) {
      console.error('加载分析数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载分析数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="size-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">用户行为分析</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            查看用户使用产品的行为数据和统计信息
          </p>
        </div>

        {/* 核心指标卡片 */}
        {dashboardData && <StatsOverview data={dashboardData} />}

        {/* 图表区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* 用户增长趋势 */}
          {userGrowthData.length > 0 && <UserGrowthChart data={userGrowthData} />}

          {/* 每日活跃用户 */}
          {activeUsersData.length > 0 && <ActiveUsersChart data={activeUsersData} />}
        </div>

        {/* 功能使用和留存率 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* 功能使用分布 */}
          {featureUsageData && <FeatureUsageChart data={featureUsageData} />}

          {/* 用户留存率 */}
          {retentionData && <RetentionChart data={retentionData} />}
        </div>

        {/* 最近事件流 */}
        {recentEvents.length > 0 && <RecentEventsTable data={recentEvents} />}
      </div>
    </div>
  );
}
