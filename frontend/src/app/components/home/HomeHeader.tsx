/**
 * 首页顶部栏组件 - 1:1 复刻原始设计
 */
import { useEffect, useState } from 'react';
import { Bell, Clock } from 'lucide-react';
import apiService from '../../../api/service';

export function HomeHeader() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weeklyReportCount, setWeeklyReportCount] = useState<number | null>(null);

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取本周报告数量
  useEffect(() => {
    const fetchWeeklyReportCount = async () => {
      try {
        const response = await apiService.getWeeklyReportCount();
        if (response.success) {
          setWeeklyReportCount(response.count);
        }
      } catch (error) {
        console.error('获取本周报告统计失败:', error);
        // 失败时显示默认值 0
        setWeeklyReportCount(0);
      }
    };
    
    fetchWeeklyReportCount();
    // 每5分钟刷新一次
    const interval = setInterval(fetchWeeklyReportCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 格式化时间显示
  const formatTime = (date: Date, timezone: string) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  // 多时区配置
  const timezones = [
    { label: '北京', timezone: 'Asia/Shanghai' },
    { label: '纽约', timezone: 'America/New_York' },
    { label: '伦敦', timezone: 'Europe/London' },
    { label: '东京', timezone: 'Asia/Tokyo' },
  ];

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Announcement */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-rose-50 to-pink-50 rounded-lg border border-rose-100">
          <Bell className="w-4 h-4 text-rose-500" />
          <span className="text-sm text-slate-700">
            本周已更新{' '}
            <span className="font-semibold text-rose-600">
              {weeklyReportCount !== null 
                ? weeklyReportCount.toLocaleString('zh-CN')
                : '...'}
            </span>{' '}
            份洞察报告
          </span>
        </div>

        {/* Right: Multi-timezone Display */}
        <div className="flex items-center gap-4">
          {timezones.map((tz, index) => (
            <div key={tz.label} className="flex items-center gap-1.5 text-xs">
              {index === 0 && <Clock className="w-3.5 h-3.5 text-slate-400" />}
              <span className="text-slate-500 font-medium">{tz.label}</span>
              <span className="text-slate-700 font-mono">{formatTime(currentTime, tz.timezone)}</span>
              {index < timezones.length - 1 && <span className="text-slate-300">|</span>}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
