/**
 * 洞察卡片组件
 * 展示 AI 解读内容
 */
import React from 'react';
import { Interpretation } from './types';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, TrendingUp } from 'lucide-react';

interface InsightCardProps {
  interpretation: Interpretation;
  title?: string;
  children?: React.ReactNode;
}

const severityConfig = {
  success: {
    icon: CheckCircle2,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    iconColor: 'text-green-600',
    badgeColor: 'bg-green-100 text-green-700',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    iconColor: 'text-yellow-600',
    badgeColor: 'bg-yellow-100 text-yellow-700',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    badgeColor: 'bg-red-100 text-red-700',
  },
  critical: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    badgeColor: 'bg-red-100 text-red-700',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  normal: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
};

export function InsightCard({ interpretation, title, children }: InsightCardProps) {
  const config = severityConfig[interpretation.severity] || severityConfig.normal;
  const Icon = config.icon;
  
  return (
    <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-4 sm:p-5`}>
      {/* 标题 */}
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
          <h4 className="text-sm sm:text-base font-bold text-gray-900">{title}</h4>
        </div>
      )}
      
      {/* 自定义内容（图表等） */}
      {children && (
        <div className="mb-4">
          {children}
        </div>
      )}
      
      {/* 关键发现 */}
      {interpretation.keyFindings.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-gray-600" />
            <h5 className="text-xs font-semibold text-gray-700">关键发现</h5>
          </div>
          <ul className="space-y-1.5">
            {interpretation.keyFindings.map((finding, idx) => (
              <li key={idx} className="text-xs sm:text-sm text-gray-800 pl-4 relative">
                <span className="absolute left-0 top-1">•</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* 数据支撑 */}
      {interpretation.dataSupport && (
        <div className="mb-4">
          {typeof interpretation.dataSupport === 'string' ? (
            <div className="bg-white/70 rounded-lg px-3 py-2 border border-gray-200">
              <div className="text-xs text-gray-700">{interpretation.dataSupport}</div>
            </div>
          ) : Array.isArray(interpretation.dataSupport) && interpretation.dataSupport.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {interpretation.dataSupport.map((point, idx) => (
                <div key={idx} className="bg-white/70 rounded-lg px-3 py-2 border border-gray-200">
                  <div className="text-[10px] text-gray-500 mb-0.5">{point.metric}</div>
                  <div className="text-xs font-bold text-gray-900">{point.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 行动建议 */}
      {interpretation.recommendations.length > 0 && (
        <div className="pt-3 border-t border-gray-300">
          <h5 className="text-xs font-semibold text-gray-700 mb-2">🎯 行动建议</h5>
          <ul className="space-y-1.5">
            {interpretation.recommendations.map((rec, idx) => (
              <li key={idx} className="text-xs sm:text-sm text-gray-800 pl-5 relative">
                <span className="absolute left-0 top-1 font-bold">{idx + 1}.</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
