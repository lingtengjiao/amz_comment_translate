import React, { memo } from 'react';
import { 
  Trophy, Users, Zap, AlertTriangle, 
  ThumbsUp, ThumbsDown, Target, Lightbulb 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import type { ComparisonResultContent, FeatureMatrixItem } from '@/api/types';

// ----------------------------------------------------------------------
// 子组件：维度对比矩阵表格
// ----------------------------------------------------------------------
const FeatureMatrixTable = ({ matrix }: { matrix: FeatureMatrixItem[] }) => {
  // 提取所有产品名称（从第一行数据中获取）
  const productNames = matrix[0]?.rankings.map(r => r.product_name) || [];

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 font-medium">
          <tr>
            <th className="p-4 w-32">核心维度</th>
            {productNames.map((name, i) => (
              <th key={i} className="p-4 min-w-[140px] text-gray-900 dark:text-gray-100">{name}</th>
            ))}
            <th className="p-4 w-64">分析总结</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {matrix.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
              <td className="p-4 font-medium">
                {row.dimension}
                {row.weight === '高' && <Badge variant="destructive" className="ml-2 text-[10px] h-5">核心</Badge>}
              </td>
              {row.rankings.map((r, rIdx) => (
                <td key={rIdx} className="p-4 align-top">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`text-lg font-bold ${
                      r.score >= 90 ? 'text-emerald-600' : 
                      r.score >= 70 ? 'text-blue-600' : 'text-amber-600'
                    }`}>
                      {r.score}
                    </div>
                    <span className="text-xs text-gray-400">分</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-snug">{r.reason}</p>
                </td>
              ))}
              <td className="p-4 text-xs text-gray-600 dark:text-gray-400 align-top bg-gray-50/30 dark:bg-gray-800/30">
                {row.summary}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ----------------------------------------------------------------------
// 子组件：SWOT 并列对比
// ----------------------------------------------------------------------
const SwotGrid = ({ data }: { data: ComparisonResultContent['swot_comparison'] }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Object.entries(data).map(([productName, swot], idx) => (
        <Card key={idx} className="border-t-4 border-t-blue-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{productName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="flex items-center gap-1 text-emerald-600 font-semibold mb-1">
                <ThumbsUp className="size-3" /> 优势
              </div>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-0.5">
                {swot.strengths.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1 text-red-500 font-semibold mb-1">
                <ThumbsDown className="size-3" /> 劣势
              </div>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-0.5">
                {swot.weaknesses.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// ----------------------------------------------------------------------
// 主组件：ComparisonRenderer
// ----------------------------------------------------------------------
export const ComparisonRenderer = memo(({ data }: { data: ComparisonResultContent }) => {
  if (!data) return null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      
      {/* 1. 市场全景速览 (Hero Section) */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800">
        <div className="flex items-start gap-4">
          <Trophy className="size-8 text-indigo-600 mt-1 flex-shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-100 mb-2">市场格局速览</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
              {data.overview_verdict}
            </p>
          </div>
        </div>
      </div>

      {/* 2. 核心维度横向大比拼 */}
      <section>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Zap className="text-amber-500" /> 核心维度横向评测
        </h3>
        <FeatureMatrixTable matrix={data.feature_matrix} />
      </section>

      {/* 3. 人群与场景定位 (对比卡片) */}
      <section>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Users className="text-blue-500" /> 人群与场景差异
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-100">
            <CardHeader><CardTitle className="text-base text-blue-700">👥 人群画像对比</CardTitle></CardHeader>
            <CardContent>{data.audience_diff.demographic_contrast}</CardContent>
          </Card>
          <Card className="bg-purple-50/50 dark:bg-purple-900/10 border-purple-100">
            <CardHeader><CardTitle className="text-base text-purple-700">⛺ 使用场景区隔</CardTitle></CardHeader>
            <CardContent>{data.audience_diff.scenario_contrast}</CardContent>
          </Card>
          <Card className="bg-pink-50/50 dark:bg-pink-900/10 border-pink-100">
            <CardHeader><CardTitle className="text-base text-pink-700">❤️ 购买动机差异</CardTitle></CardHeader>
            <CardContent>{data.audience_diff.buying_motivation_gap}</CardContent>
          </Card>
        </div>
      </section>

      {/* 4. SWOT 矩阵 */}
      <section>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Target className="text-emerald-500" /> 产品 SWOT 全景
        </h3>
        <SwotGrid data={data.swot_comparison} />
      </section>

      {/* 5. 口碑热词对比 */}
      <section>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <AlertTriangle className="text-orange-500" /> 口碑热词与情感对比
        </h3>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <h4 className="font-semibold text-green-600 mb-2">👍 正面主题</h4>
              <p className="text-gray-700 dark:text-gray-300">{data.sentiment_comparison.positive_themes_contrast}</p>
            </div>
            <div>
              <h4 className="font-semibold text-red-600 mb-2">👎 负面主题</h4>
              <p className="text-gray-700 dark:text-gray-300">{data.sentiment_comparison.negative_themes_contrast}</p>
            </div>
            <div className="pt-4 border-t">
              <p className="text-gray-700 dark:text-gray-300 italic">{data.sentiment_comparison.verdict}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6. 行动建议 */}
      <section>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Lightbulb className="text-yellow-500" /> 机会点与行动建议
        </h3>
        <div className="space-y-3">
          {data.actionable_advice.map((advice, idx) => (
            <Card key={idx} className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Badge 
                    variant={advice.priority === 'High' ? 'destructive' : 'secondary'}
                    className="shrink-0"
                  >
                    {advice.priority}
                  </Badge>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-500">{advice.category}</span>
                    </div>
                    <p className="text-gray-900 dark:text-gray-100 mb-2">{advice.advice}</p>
                    <p className="text-xs text-gray-500 italic">{advice.rationale}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 7. 购买决策指南 (Sticky Bottom) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50">
        <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-2xl p-4 px-8 flex items-center gap-4 border border-gray-700/50 backdrop-blur-sm bg-opacity-95">
          <Lightbulb className="size-6 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
              一句话购买建议
            </div>
            <div className="font-medium text-sm md:text-base line-clamp-2">
              {data.final_conclusion}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
});

ComparisonRenderer.displayName = 'ComparisonRenderer';

