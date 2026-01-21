/**
 * RufusEditDialog - 编辑 Rufus 会话对话框
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { RufusSessionSummary } from '../../../../api/service';

interface RufusEditDialogProps {
  session: RufusSessionSummary | null;
  pageType: string;
  onClose: () => void;
  onSave: (sessionId: string, data: { product_title?: string; keyword?: string; product_image?: string }) => Promise<void>;
}

export function RufusEditDialog({ session, pageType, onClose, onSave }: RufusEditDialogProps) {
  const [productTitle, setProductTitle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [productImage, setProductImage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session) {
      setProductTitle(session.product_title || '');
      setKeyword(session.keyword || '');
      setProductImage(''); // 图片URL暂时不显示，因为session中没有这个字段
    }
  }, [session]);

  const handleSave = async () => {
    if (!session) return;

    setSaving(true);
    try {
      const updateData: { product_title?: string; keyword?: string; product_image?: string } = {};
      
      if (pageType === 'product_detail') {
        if (productTitle.trim()) {
          updateData.product_title = productTitle.trim();
        }
        if (productImage.trim()) {
          updateData.product_image = productImage.trim();
        }
      } else if (pageType === 'keyword_search') {
        if (keyword.trim()) {
          updateData.keyword = keyword.trim();
        }
      }

      await onSave(session.session_id, updateData);
      toast.success('更新成功');
      onClose();
    } catch (err: any) {
      toast.error('更新失败: ' + (err?.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">编辑会话信息</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {pageType === 'product_detail' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  产品标题
                </label>
                <input
                  type="text"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder="输入产品标题"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  产品图片 URL（可选）
                </label>
                <input
                  type="text"
                  value={productImage}
                  onChange={(e) => setProductImage(e.target.value)}
                  placeholder="输入产品图片URL"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {pageType === 'keyword_search' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                关键词
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入关键词"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>
          )}

          {pageType === 'homepage' && (
            <p className="text-sm text-slate-500">首页调研暂不支持编辑</p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (pageType === 'homepage')}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
