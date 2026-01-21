/**
 * 产品分析库页面 - 展示按关键词分组的产品快照
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, FolderOpen, Calendar, Package, Trash2, ChevronRight, Loader2, Database } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import apiService, { type GroupedCollection, type KeywordCollection } from '../../../../api/service';
import { CollectionDetailDialog } from '../dialogs/CollectionDetailDialog';
import { useSectionCache } from '../../../hooks/useSectionCache';

export function KeywordCollectionsSection() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  
  // 弹窗状态
  const [selectedCollection, setSelectedCollection] = useState<KeywordCollection | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // 使用缓存加载数据
  const { data, loading, error, refetch } = useSectionCache<{ groups: GroupedCollection[] }>(
    'keyword_collections',
    async () => {
      const response = await apiService.getKeywordCollectionsGrouped();
      return { groups: response.groups || [] };
    }
  );
  
  const groups = data?.groups || [];

  // 删除快照
  const handleDeleteSnapshot = async (collectionId: string, keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定要删除关键词「${keyword}」的这个快照吗？`)) return;
    
    try {
      await apiService.deleteKeywordCollection(collectionId);
      toast.success('快照已删除');
      refetch(); // 重新加载
    } catch (err: any) {
      toast.error('删除失败: ' + (err?.message || '未知错误'));
    }
  };

  // 切换展开/折叠
  const toggleExpand = (keyword: string) => {
    const newExpanded = new Set(expandedKeywords);
    if (newExpanded.has(keyword)) {
      newExpanded.delete(keyword);
    } else {
      newExpanded.add(keyword);
    }
    setExpandedKeywords(newExpanded);
  };

  // 跳转到产品分类画板页面
  const openCollectionDetail = (collection: KeywordCollection) => {
    console.log('[KeywordCollections] 跳转到产品画板:', collection.id);
    navigate(`/product-board/${collection.id}`);
  };

  // 打开详情弹窗（用于批量洞察、对比分析、市场细分等功能）
  const openDetailDialog = async (collection: KeywordCollection) => {
    try {
      const detail = await apiService.getKeywordCollectionDetail(collection.id);
      setSelectedCollection(detail);
      setDetailDialogOpen(true);
    } catch (err: any) {
      console.error('[KeywordCollections] 加载详情失败:', err);
      toast.error('加载详情失败: ' + (err?.message || '未知错误'));
    }
  };

  // 过滤分组
  const filteredGroups = groups.filter(group => {
    const searchLower = searchQuery.toLowerCase();
    return group.keyword.toLowerCase().includes(searchLower);
  });

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      {/* 标题 */}
      <div className="sticky top-[57px] z-[9] bg-white pb-2 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Database className="w-5 h-5 text-rose-500" />
              市场格局分析
            </h3>
            <p className="text-sm text-slate-600">管理你通过插件保存的搜索结果快照</p>
          </div>
          <div className="text-sm text-slate-500">
            共 {groups.length} 个关键词
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索关键词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
          <p className="text-red-500 mb-4 text-sm">{error}</p>
          <button 
            onClick={loadCollections}
            className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && filteredGroups.length === 0 && (
        <div className="text-center py-20">
          <FolderOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">
            {searchQuery ? '没有找到匹配的关键词' : '还没有保存任何产品库'}
          </p>
          <p className="text-sm text-slate-400">
            在亚马逊搜索页面使用插件的「保存到产品库」功能
          </p>
        </div>
      )}

      {/* 关键词分组列表 */}
      {!loading && !error && filteredGroups.length > 0 && (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <Card 
              key={group.keyword}
              className="border border-slate-200 hover:border-rose-200 transition-all overflow-hidden"
            >
              {/* 关键词头部 */}
              <div 
                className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(group.keyword)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ChevronRight 
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedKeywords.has(group.keyword) ? 'rotate-90' : ''
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-slate-900">{group.keyword}</h4>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {group.total_snapshots} 个快照
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          共 {group.total_products} 个产品
                        </span>
                        {group.marketplace && (
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">
                            {group.marketplace}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    最新: {formatDate(group.latest_snapshot)}
                  </div>
                </div>
              </div>

              {/* 展开的快照列表 */}
              {expandedKeywords.has(group.keyword) && (
                <div className="border-t border-slate-100 bg-slate-50/50">
                  {group.snapshots.map((snapshot, index) => (
                    <div 
                      key={snapshot.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-white transition-colors cursor-pointer border-b border-slate-100 last:border-b-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[KeywordCollections] 点击快照:', snapshot.id);
                        openCollectionDetail(snapshot);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-xs font-semibold">
                          #{index + 1}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-700">
                            {formatDate(snapshot.created_at)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {snapshot.product_count} 个产品
                            {snapshot.description && ` · ${snapshot.description}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDeleteSnapshot(snapshot.id, group.keyword, e)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除快照"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      <CollectionDetailDialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        collection={selectedCollection}
        onRefresh={loadCollections}
      />
    </div>
  );
}
