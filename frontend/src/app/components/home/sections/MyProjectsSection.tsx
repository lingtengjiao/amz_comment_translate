/**
 * 我的洞察页面 - 使用真实 API
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Star, MessageSquare, ArrowRight, Trash2, Heart, Loader2, Copy } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { useHome } from '../HomeContext';
import apiService from '../../../../api/service';

interface UserProject {
  id: string;
  asin: string;
  title: string | null;
  image_url: string | null;
  is_favorite: boolean;
  total_reviews: number;
  translated_reviews: number;
  average_rating: number | null;
  created_at: string | null;
}

export function MyProjectsSection() {
  const navigate = useNavigate();
  const { projectsTab, setProjectsTab, projectsSearchQuery, setProjectsSearchQuery } = useHome();
  
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, [projectsTab]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const favoritesOnly = projectsTab === 'favorites';
      const response = await apiService.getMyProjects(favoritesOnly);
      setProjects(response.projects || []);
    } catch (err: any) {
      setError(err.message || '加载失败');
      toast.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 切换收藏
  const handleToggleFavorite = async (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await apiService.toggleProjectFavorite(asin);
      // 更新本地状态
      setProjects(prev => prev.map(p => 
        p.asin === asin ? { ...p, is_favorite: result.is_favorite } : p
      ));
      toast.success(result.is_favorite ? '已添加收藏' : '已取消收藏');
    } catch (err: any) {
      toast.error('操作失败');
    }
  };

  // 复制 ASIN
  const handleCopyAsin = (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(asin);
    toast.success('ASIN 已复制');
  };

  // 删除项目
  const handleDelete = async (asin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要从我的洞察中移除这个产品吗？')) return;
    
    try {
      await apiService.removeFromMyProjects(asin);
      setProjects(prev => prev.filter(p => p.asin !== asin));
      toast.success('已移除');
    } catch (err: any) {
      toast.error('操作失败');
    }
  };

  // 过滤项目
  const filteredProjects = projects.filter(project => {
    const searchLower = projectsSearchQuery.toLowerCase();
    return (
      project.asin.toLowerCase().includes(searchLower) ||
      (project.title && project.title.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div>
      {/* 标题和标签页 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-2 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">我的洞察</h3>
            <p className="text-sm text-slate-600">你分析过的产品都在这里</p>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center gap-2 mb-5 border-b border-slate-200">
          <button
            onClick={() => setProjectsTab('all')}
            className={`px-4 py-2.5 text-sm font-medium transition-all relative ${
              projectsTab === 'all' ? 'text-rose-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            全部
            {projectsTab === 'all' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600"></div>
            )}
          </button>
          <button
            onClick={() => setProjectsTab('favorites')}
            className={`px-4 py-2.5 text-sm font-medium transition-all relative ${
              projectsTab === 'favorites' ? 'text-rose-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            我的收藏
            {projectsTab === 'favorites' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600"></div>
            )}
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索产品名称、ASIN..."
              value={projectsSearchQuery}
              onChange={(e) => setProjectsSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="text-center py-20">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={loadProjects}
            className="text-rose-600 hover:underline"
          >
            重试
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && filteredProjects.length === 0 && (
        <div className="text-center py-20">
          <p className="text-slate-500 mb-4">
            {projectsSearchQuery ? '没有找到匹配的项目' : '还没有添加任何产品'}
          </p>
        </div>
      )}

      {/* 项目列表 */}
      {!loading && !error && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjects.map((project) => (
            <Card 
              key={project.id}
              className="border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group overflow-hidden bg-white relative"
              onClick={() => navigate(`/reader/${project.asin}`)}
            >
              <CardContent className="p-4">
                {/* 头部：ASIN 和收藏按钮 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium px-2 py-1 bg-slate-50 rounded">
                    <span>{project.asin}</span>
                    <button
                      onClick={(e) => handleCopyAsin(project.asin, e)}
                      className="flex-shrink-0 p-0.5 hover:bg-slate-200 rounded transition-colors"
                      title="复制 ASIN"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => handleToggleFavorite(project.asin, e)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all flex-shrink-0 group/fav"
                  >
                    <Heart 
                      className={`w-4 h-4 transition-all ${
                        project.is_favorite 
                          ? 'fill-rose-500 text-rose-500' 
                          : 'text-slate-400 group-hover/fav:text-rose-400'
                      }`}
                    />
                  </button>
                </div>

                {/* 产品信息 */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-16 h-16 flex-shrink-0 overflow-hidden bg-slate-100 rounded-lg">
                    <ImageWithFallback 
                      src={project.image_url || ''}
                      alt={project.title || 'Product'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 text-sm leading-snug overflow-hidden" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.25rem',
                      maxHeight: '2.5rem'
                    }}>
                      {project.title || project.asin}
                    </h4>
                  </div>
                </div>

                {/* 统计信息 */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-3 text-xs">
                    {/* 评分 */}
                    {project.average_rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-slate-900">{project.average_rating.toFixed(1)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-slate-500">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{project.total_reviews} 条</span>
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/reader/${project.asin}`);
                      }}
                      className="text-blue-600 hover:text-blue-700 p-1 hover:bg-blue-50 rounded transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(project.asin, e)}
                      className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
