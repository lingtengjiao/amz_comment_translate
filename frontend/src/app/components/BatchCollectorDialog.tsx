import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { 
  Loader2, 
  Rocket, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Settings2,
  Zap,
  Shield,
  RefreshCw
} from 'lucide-react';

// 扩展 Window 类型以支持 Chrome 扩展 API
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback: (response: unknown) => void
        ) => void;
        lastError?: { message: string };
      };
    };
  }
}

interface BatchCollectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTasksAdded?: () => void;
}

interface QueueStatus {
  success: boolean;
  queueLength: number;
  isRunning: boolean;
  stats: {
    completed: number;
    failed: number;
    total: number;
  };
  currentTask?: {
    asin: string;
    status: string;
  };
}

// 从环境变量或 localStorage 获取插件 ID
const getExtensionId = (): string => {
  // 优先从 localStorage 读取用户配置的 ID
  const savedId = localStorage.getItem('voc_extension_id');
  if (savedId) return savedId;
  
  // 默认值（开发时需要替换）
  return import.meta.env.VITE_EXTENSION_ID || '';
};

const setExtensionId = (id: string) => {
  localStorage.setItem('voc_extension_id', id);
};

export function BatchCollectorDialog({ 
  open, 
  onOpenChange, 
  onTasksAdded 
}: BatchCollectorDialogProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [extensionVersion, setExtensionVersion] = useState<string>('');
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [customExtensionId, setCustomExtensionId] = useState(getExtensionId());
  
  // 采集配置
  const [speedMode, setSpeedMode] = useState<'fast' | 'stable'>('fast');
  const [pagesPerStar, setPagesPerStar] = useState(5);
  const [selectedStars, setSelectedStars] = useState<number[]>([1, 2, 3, 4, 5]);

  // 检测插件是否可用
  const checkExtension = useCallback(() => {
    const extensionId = getExtensionId();
    
    if (!extensionId) {
      setExtensionStatus('disconnected');
      setShowSettings(true);
      return;
    }
    
    if (!window.chrome?.runtime?.sendMessage) {
      setExtensionStatus('disconnected');
      return;
    }

    setExtensionStatus('checking');
    
    try {
      window.chrome.runtime.sendMessage(
        extensionId,
        { type: 'PING' },
        (response: unknown) => {
          if (window.chrome?.runtime?.lastError) {
            console.warn('Extension check failed:', window.chrome.runtime.lastError.message);
            setExtensionStatus('disconnected');
            return;
          }
          
          const res = response as { success: boolean; version?: string };
          if (res?.success) {
            setExtensionStatus('connected');
            setExtensionVersion(res.version || '');
            // 连接成功后获取队列状态
            fetchQueueStatus();
          } else {
            setExtensionStatus('disconnected');
          }
        }
      );
    } catch {
      setExtensionStatus('disconnected');
    }
  }, []);

  // 获取队列状态
  const fetchQueueStatus = useCallback(() => {
    const extensionId = getExtensionId();
    if (!extensionId || !window.chrome?.runtime?.sendMessage) return;

    try {
      window.chrome.runtime.sendMessage(
        extensionId,
        { type: 'GET_QUEUE_STATUS' },
        (response: unknown) => {
          if (window.chrome?.runtime?.lastError) return;
          const res = response as QueueStatus;
          if (res?.success) {
            setQueueStatus(res);
          }
        }
      );
    } catch {
      // ignore
    }
  }, []);

  // 定期刷新队列状态
  useEffect(() => {
    if (open && extensionStatus === 'connected') {
      const interval = setInterval(fetchQueueStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [open, extensionStatus, fetchQueueStatus]);

  // 对话框打开时检测插件
  useEffect(() => {
    if (open) {
      checkExtension();
    }
  }, [open, checkExtension]);

  // 从输入中提取 ASIN
  const extractAsins = (text: string): string[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const asins: string[] = [];
    
    for (const line of lines) {
      // 匹配完整 URL 中的 ASIN
      const urlMatch = line.match(/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i);
      if (urlMatch) {
        asins.push(urlMatch[1].toUpperCase());
        continue;
      }
      
      // 匹配纯 ASIN（10位字母数字组合）
      const asinMatch = line.match(/^[A-Z0-9]{10}$/i);
      if (asinMatch) {
        asins.push(line.toUpperCase());
      }
    }
    
    // 去重
    return [...new Set(asins)];
  };

  // 发送任务到插件
  const handleStart = () => {
    const extensionId = getExtensionId();
    
    if (!extensionId) {
      toast.error('请先配置插件 ID');
      setShowSettings(true);
      return;
    }
    
    if (!window.chrome?.runtime?.sendMessage) {
      toast.error('无法连接插件，请确保使用 Chrome 浏览器');
      return;
    }

    const asins = extractAsins(input);
    
    if (asins.length === 0) {
      toast.error('未识别到有效的 ASIN，请检查输入格式');
      return;
    }

    setLoading(true);

    try {
      window.chrome.runtime.sendMessage(
        extensionId,
        {
          type: 'BATCH_START_EXTERNAL',
          asins,
          config: {
            stars: selectedStars,
            pagesPerStar,
            speedMode,
            mediaType: 'all_formats'
          }
        },
        (response: unknown) => {
          setLoading(false);
          
          if (window.chrome?.runtime?.lastError) {
            console.error('Extension error:', window.chrome.runtime.lastError);
            toast.error('无法连接插件，请检查插件 ID 是否正确');
            return;
          }

          const res = response as { success: boolean; queueLength?: number; addedCount?: number };
          if (res?.success) {
            toast.success(`🚀 已发送 ${res.addedCount || asins.length} 个任务至插件后台！`);
            setInput('');
            fetchQueueStatus();
            onTasksAdded?.();
          } else {
            toast.error('插件接收任务失败');
          }
        }
      );
    } catch (err) {
      setLoading(false);
      toast.error('发送失败：' + (err as Error).message);
    }
  };

  // 保存插件 ID 设置
  const handleSaveSettings = () => {
    if (customExtensionId.trim()) {
      setExtensionId(customExtensionId.trim());
      setShowSettings(false);
      toast.success('插件 ID 已保存');
      // 重新检测
      setTimeout(checkExtension, 100);
    }
  };

  const extractedAsins = extractAsins(input);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-indigo-600" />
            批量自动化采集
          </DialogTitle>
          <DialogDescription>
            输入亚马逊链接或 ASIN，插件将在后台自动排队采集评论数据
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 插件状态 */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
            <div className="flex items-center gap-2">
              {extensionStatus === 'checking' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-500">检测插件中...</span>
                </>
              )}
              {extensionStatus === 'connected' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">
                    插件已连接 {extensionVersion && `(v${extensionVersion})`}
                  </span>
                </>
              )}
              {extensionStatus === 'disconnected' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">插件未连接</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={checkExtension}
                className="h-7 px-2"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="h-7 px-2"
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* 设置面板 */}
          {showSettings && (
            <div className="p-4 rounded-lg border border-orange-200 bg-orange-50 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-orange-600 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium">如何获取插件 ID？</p>
                  <ol className="list-decimal list-inside mt-1 space-y-1 text-orange-700">
                    <li>打开 Chrome 浏览器，访问 <code className="bg-white px-1 rounded">chrome://extensions</code></li>
                    <li>找到 "VOC-Master" 插件</li>
                    <li>复制 "ID" 下方的字符串（32位字母）</li>
                    <li>粘贴到下方输入框</li>
                  </ol>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="粘贴插件 ID..."
                  value={customExtensionId}
                  onChange={(e) => setCustomExtensionId(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm font-mono"
                />
                <Button onClick={handleSaveSettings} size="sm">
                  保存
                </Button>
              </div>
            </div>
          )}

          {/* 队列状态 */}
          {queueStatus && (queueStatus.isRunning || queueStatus.queueLength > 0) && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-700">
                    队列中有 {queueStatus.queueLength} 个待处理任务
                  </span>
                </div>
                <div className="text-xs text-blue-600">
                  已完成: {queueStatus.stats.completed} | 失败: {queueStatus.stats.failed}
                </div>
              </div>
              {queueStatus.currentTask && (
                <div className="mt-2 text-xs text-blue-600">
                  正在采集: {queueStatus.currentTask.asin}
                </div>
              )}
            </div>
          )}

          {/* 输入区域 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              输入链接或 ASIN
            </label>
            <Textarea
              placeholder={`粘贴亚马逊链接或 ASIN，每行一个...

支持格式：
• https://www.amazon.com/dp/B09V3KXJPB
• https://www.amazon.com/gp/product/B09V3KXJPB
• B09V3KXJPB`}
              className="min-h-[150px] font-mono text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            {input && (
              <div className="text-sm text-gray-500">
                已识别 <span className="font-semibold text-indigo-600">{extractedAsins.length}</span> 个有效 ASIN
                {extractedAsins.length > 0 && (
                  <span className="ml-2 text-gray-400">
                    ({extractedAsins.slice(0, 3).join(', ')}{extractedAsins.length > 3 ? '...' : ''})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 采集配置 */}
          <div className="space-y-3 p-4 rounded-lg border bg-gray-50">
            <div className="text-sm font-medium text-gray-700">采集配置</div>
            
            {/* 速度模式 */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={speedMode === 'fast' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSpeedMode('fast')}
                className="flex items-center gap-1"
              >
                <Zap className="h-3 w-3" />
                极速模式
              </Button>
              <Button
                type="button"
                variant={speedMode === 'stable' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSpeedMode('stable')}
                className="flex items-center gap-1"
              >
                <Shield className="h-3 w-3" />
                稳定模式
              </Button>
            </div>
            
            {/* 每星级页数 */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">每星级采集页数:</span>
              <select
                value={pagesPerStar}
                onChange={(e) => setPagesPerStar(Number(e.target.value))}
                className="px-2 py-1 border rounded text-sm"
              >
                {[1, 2, 3, 5, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n} 页</option>
                ))}
              </select>
            </div>
            
            {/* 星级选择 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">采集星级:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setSelectedStars(prev => 
                        prev.includes(star) 
                          ? prev.filter(s => s !== star)
                          : [...prev, star].sort()
                      );
                    }}
                    className={`w-7 h-7 rounded text-sm font-medium transition-colors ${
                      selectedStars.includes(star)
                        ? 'bg-yellow-400 text-yellow-900'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                  >
                    {star}★
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <p className="text-xs text-gray-400">
            插件将在后台排队执行，请保持浏览器开启
          </p>
          <Button
            onClick={handleStart}
            disabled={loading || extensionStatus !== 'connected' || extractedAsins.length === 0}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                发送中...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                启动批量任务 ({extractedAsins.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

