/**
 * StructuredRenderer - 全量结构化分析报告渲染组件
 * 
 * 设计原则：
 * 1. 标签墙：5W 用户画像用 emoji + 标签 + 描述 的清单形式
 * 2. 红绿榜：优点用 ✅，痛点用 ⚠️
 * 3. 去图表化：直接列表展示，简洁直观
 */
import React, { memo } from 'react';
import { 
  Users, Clock, MapPin, ShoppingCart, Target, 
  CheckCircle, AlertTriangle, TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import type { StructuredResultContent, ProductProfile, LabelDescItem, FiveWProfile } from '@/api/types';

// ----------------------------------------------------------------------
// 5W 维度配置 - 扩展版：Who 拆分为 Buyer + User
// ----------------------------------------------------------------------
const FIVE_W_CONFIG: Record<string, { 
  icon: React.ReactNode; 
  emoji: string;
  label: string; 
  color: string;
  bgColor: string;
}> = {
  buyer: { 
    icon: <Users className="size-4" />, 
    emoji: '👤',
    label: '购买者', 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20'
  },
  user: { 
    icon: <Users className="size-4" />, 
    emoji: '👶',
    label: '使用者', 
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20'
  },
  who: { 
    icon: <Users className="size-4" />, 
    emoji: '👥',
    label: '人群', 
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 dark:bg-slate-900/20'
  },
  when: { 
    icon: <Clock className="size-4" />, 
    emoji: '⏰',
    label: '何时使用', 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20'
  },
  where: { 
    icon: <MapPin className="size-4" />, 
    emoji: '📍',
    label: '在哪里用', 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
  },
  why: { 
    icon: <ShoppingCart className="size-4" />, 
    emoji: '💡',
    label: '购买动机', 
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20'
  },
  what: { 
    icon: <Target className="size-4" />, 
    emoji: '🎯',
    label: '具体用途', 
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20'
  },
};

// ----------------------------------------------------------------------
// 子组件：标签项
// ----------------------------------------------------------------------
const LabelItem = memo(({ item, emoji }: { item: LabelDescItem; emoji: string }) => (
  <div className="flex items-start gap-3 py-2 px-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
    <span className="text-base flex-shrink-0">{emoji}</span>
    <div className="flex-1 min-w-0">
      <span className="font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
    </div>
  </div>
));

LabelItem.displayName = 'LabelItem';

// ----------------------------------------------------------------------
// 子组件：5W 用户画像区块 - 支持 Buyer/User 拆分
// ----------------------------------------------------------------------
const FiveWSection = memo(({ fiveW }: { fiveW: FiveWProfile }) => {
  // 定义展示顺序：buyer/user 优先，who 作为向后兼容
  const displayOrder = ['buyer', 'user', 'who', 'when', 'where', 'why', 'what'];
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Users className="size-5 text-blue-500" />
        5W 用户画像
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {displayOrder.map((key) => {
          const config = FIVE_W_CONFIG[key];
          if (!config) return null;
          
          const items = (fiveW as Record<string, LabelDescItem[] | undefined>)[key] || [];
          if (items.length === 0) return null;
          
          return (
            <Card key={key} className={`border-t-2 ${config.color.replace('text-', 'border-')}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${config.color}`}>
                  {config.icon}
                  {config.label}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {items.map((item, idx) => (
                  <LabelItem key={idx} item={item} emoji={config.emoji} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
});

FiveWSection.displayName = 'FiveWSection';

// ----------------------------------------------------------------------
// 子组件：维度评价（红绿榜）
// ----------------------------------------------------------------------
const DimensionSection = memo(({ pros, cons }: { pros: LabelDescItem[]; cons: LabelDescItem[] }) => (
  <div className="space-y-4">
    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
      <TrendingUp className="size-5 text-emerald-500" />
      维度评价
    </h3>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 优点榜 */}
      <Card className="border-t-4 border-t-emerald-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-emerald-600">
            <CheckCircle className="size-5" />
            用户好评点
            <Badge variant="outline" className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200">
              {pros.length} 项
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pros.length > 0 ? (
            pros.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10">
                <CheckCircle className="size-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 italic py-4 text-center">暂无数据</p>
          )}
        </CardContent>
      </Card>
      
      {/* 痛点榜 */}
      <Card className="border-t-4 border-t-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-600">
            <AlertTriangle className="size-5" />
            用户痛点
            <Badge variant="outline" className="ml-auto bg-amber-50 text-amber-700 border-amber-200">
              {cons.length} 项
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cons.length > 0 ? (
            cons.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/10">
                <AlertTriangle className="size-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 italic py-4 text-center">暂无数据</p>
          )}
        </CardContent>
      </Card>
    </div>
  </div>
));

DimensionSection.displayName = 'DimensionSection';

// ----------------------------------------------------------------------
// 子组件：单个产品画像卡片
// ----------------------------------------------------------------------
const ProductProfileCard = memo(({ profile, index }: { profile: ProductProfile; index: number }) => (
  <div className="space-y-6 p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
    {/* 产品标题 */}
    <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 font-bold text-lg">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
          {profile.product_name}
        </h2>
        <p className="text-sm text-gray-500">ASIN: {profile.asin}</p>
      </div>
    </div>
    
    {/* 5W 用户画像 */}
    <FiveWSection fiveW={profile.five_w} />
    
    {/* 维度评价 */}
    <DimensionSection 
      pros={profile.dimensions?.pros || []} 
      cons={profile.dimensions?.cons || []} 
    />
  </div>
));

ProductProfileCard.displayName = 'ProductProfileCard';

// ----------------------------------------------------------------------
// 主组件：StructuredRenderer
// ----------------------------------------------------------------------
export const StructuredRenderer = memo(({ data }: { data: StructuredResultContent }) => {
  if (!data || !data.product_profiles) {
    return (
      <div className="text-center py-12 text-gray-500">
        暂无分析数据
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* 产品画像列表 */}
      <div className="space-y-8">
        {data.product_profiles.map((profile, idx) => (
          <ProductProfileCard key={profile.asin || idx} profile={profile} index={idx} />
        ))}
      </div>
      
      {/* 市场总结 */}
      {data.market_summary && (
        <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-100 dark:border-indigo-800">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
              📊 市场全局总结
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">
              {data.market_summary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

StructuredRenderer.displayName = 'StructuredRenderer';

export default StructuredRenderer;

