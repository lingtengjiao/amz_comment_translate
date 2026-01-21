/**
 * ConversationEditDialog - 编辑单个对话对话框
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { RufusConversationDetail } from '../../../../api/service';
import { updateRufusConversation } from '../../../../api/service';

interface ConversationEditDialogProps {
  conversation: RufusConversationDetail | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function ConversationEditDialog({ conversation, onClose, onRefresh }: ConversationEditDialogProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (conversation) {
      setQuestion(conversation.question || '');
      setAnswer(conversation.answer || '');
    }
  }, [conversation]);

  const handleSave = async () => {
    if (!conversation) return;

    if (!question.trim() || !answer.trim()) {
      toast.error('问题和回答不能为空');
      return;
    }

    setSaving(true);
    try {
      await updateRufusConversation(conversation.id, {
        question: question.trim(),
        answer: answer.trim(),
      });
      toast.success('更新成功');
      onRefresh();
      onClose();
    } catch (err: any) {
      toast.error('更新失败: ' + (err?.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  if (!conversation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">编辑对话</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              问题
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入问题"
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              回答
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="输入回答"
              rows={8}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none font-mono"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
