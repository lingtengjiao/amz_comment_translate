/**
 * 产品数据表格详情页
 * 独立的全屏表格操作页面，提供完整的数据管理功能
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { 
  ArrowLeft, Plus, Trash2, Edit2, ChevronDown, ChevronUp, ExternalLink,
  Save, Search, LayoutGrid, Loader2, Settings2, GripVertical, Upload,
  Pin, Highlighter
} from 'lucide-react';
import { Product } from './ProductCard';
import { ProductEditModal } from './ProductEditModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { DataUploadModal, DataUploadResult } from './DataUploadModal';
import apiService, { type BatchUpdateProductItem, CustomFieldDefinition, KeywordCollection } from '../../../api/service';

// 扩展 Product 类型以包含新字段
interface ExtendedProduct extends Product {
  salesVolumeAmazon?: number;  // 亚马逊预估销量 (sales_volume)
  listingDate?: string;  // 上架具体日期 YYYY-MM-DD (listing_date)，视图仍按 year 分组
  monthly_sales?: Record<string, number>;
  custom_tags?: Record<string, string>;
}

// 添加自定义列弹窗
interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (field: CustomFieldDefinition) => void;
  existingFields: CustomFieldDefinition[];
}

function AddColumnModal({ isOpen, onClose, onAdd, existingFields }: AddColumnModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'number' | 'select'>('text');
  const [options, setOptions] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('请输入列名');
      return;
    }

    if (existingFields.some(f => f.name === name.trim())) {
      toast.error('列名已存在');
      return;
    }

    const newField: CustomFieldDefinition = {
      id: `field_${Date.now()}`,
      name: name.trim(),
      type,
      options: type === 'select' ? options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };

    onAdd(newField);
    setName('');
    setType('text');
    setOptions('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[450px] p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">添加自定义列</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">列名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：产品类型"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">列类型</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'text' | 'number' | 'select')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            >
              <option value="text">文本</option>
              <option value="number">数字</option>
              <option value="select">下拉选择</option>
            </select>
          </div>

          {type === 'select' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选项（用逗号分隔）</label>
              <input
                type="text"
                value={options}
                onChange={e => setOptions(e.target.value)}
                placeholder="例如：TSA-Clear, TSA-Lock, 其他"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#FF1B82' }}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

// 内置列 key 与中文标签（销量拆分为：亚马逊预估销量 sales_volume、第三方预估销量 sales_volume_manual）
const BUILT_IN_COLUMN_KEYS = ['image', 'asin', 'title', 'price', 'rating', 'reviewCount', 'amazonSales', 'manualSales', 'year', 'brand', 'majorCategoryRank', 'minorCategoryRank'] as const;
const COLUMN_LABELS: Record<string, string> = {
  image: '图片', asin: 'ASIN', title: '标题', price: '价格', rating: '评分', reviewCount: '评论数',
  amazonSales: '亚马逊预估销量', manualSales: '第三方预估销量',
  year: '年份', brand: '品牌', majorCategoryRank: '大类BSR', minorCategoryRank: '小类BSR',
};

const COLUMN_STORAGE_KEY_PREFIX = 'product-table-columns-';

/** 将列顺序中的月度列按时间从近期到远期重排（其余列相对顺序不变） */
function orderWithMonthsRecentFirst(keys: string[]): string[] {
  const monthKeys = keys.filter(k => k.startsWith('month_'));
  if (monthKeys.length === 0) return keys;
  const sorted = [...monthKeys].sort((a, b) => b.localeCompare(a));
  return keys.map(k => (k.startsWith('month_') ? sorted[monthKeys.indexOf(k)] : k));
}

interface ColumnConfig {
  visibility: Record<string, boolean>;
  order: string[];
}

function loadColumnConfig(collectionId: string): ColumnConfig | null {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY_PREFIX + collectionId);
    if (!raw) return null;
    return JSON.parse(raw) as ColumnConfig;
  } catch {
    return null;
  }
}

function saveColumnConfig(collectionId: string, config: ColumnConfig) {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY_PREFIX + collectionId, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save column config', e);
  }
}

// 列设置弹窗：隐藏/显示、调整顺序
interface ColumnSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnKeys: string[];
  getColumnLabel: (key: string) => string;
  visibility: Record<string, boolean>;
  order: string[];
  onVisibilityChange: (key: string, visible: boolean) => void;
  onOrderChange: (newOrder: string[]) => void;
}

function ColumnSettingsModal({
  isOpen,
  onClose,
  columnKeys,
  getColumnLabel,
  visibility,
  order,
  onVisibilityChange,
  onOrderChange,
}: ColumnSettingsModalProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);

  const orderedKeys = order.filter(k => columnKeys.includes(k));
  const appendedKeys = columnKeys.filter(k => !order.includes(k));
  const rawOrder = [...orderedKeys, ...appendedKeys];
  // 前 3 列固定：#、操作、图片。图片在列设置里排第一且不可拖到其他列前面
  const PINNED_KEYS = ['image'];
  const pinnedKeys = PINNED_KEYS.filter(k => columnKeys.includes(k) && visibility[k] !== false);
  const reorderableKeys = rawOrder.filter(k => !pinnedKeys.includes(k));
  const displayOrder = [...pinnedKeys, ...reorderableKeys];

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
      e.preventDefault();
      return;
    }
    if (pinnedKeys.includes(displayOrder[index])) return; // 固定列不可拖拽
    setDragIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (pinnedKeys.includes(displayOrder[index])) return; // 不允许拖到固定列前面
    e.dataTransfer.dropEffect = 'move';
    setDropIndicatorIndex(index);
  };

  const handleDragLeave = () => {
    setDropIndicatorIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDropIndicatorIndex(null);
    setDragIndex(null);
    if (pinnedKeys.includes(displayOrder[dropIndex])) return; // 不能落在固定列位置
    const dragIndexNum = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(dragIndexNum) || dragIndexNum === dropIndex) return;
    if (pinnedKeys.includes(displayOrder[dragIndexNum])) return;
    const newOrder = [...displayOrder];
    const [removed] = newOrder.splice(dragIndexNum, 1);
    newOrder.splice(dropIndex, 0, removed);
    onOrderChange(newOrder);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndicatorIndex(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">列设置</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">✕</button>
        </div>
        <p className="px-4 pt-2 text-xs text-gray-500">勾选显示列，拖拽列表项调整顺序（前 3 列 #、操作、图片 固定）</p>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {displayOrder.map((key, index) => {
            const isPinned = pinnedKeys.includes(key);
            return (
            <div
              key={key}
              draggable={!isPinned}
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 py-2 px-3 rounded-lg select-none
                ${isPinned ? 'cursor-default bg-gray-50' : 'cursor-grab active:cursor-grabbing'}
                ${dragIndex === index ? 'opacity-50 bg-gray-100' : !isPinned ? 'hover:bg-gray-50' : ''}
                ${dropIndicatorIndex === index && dragIndex !== index ? 'ring-2 ring-inset ring-purple-400 bg-purple-50/50' : ''}`}
            >
              {isPinned ? <span className="w-4 flex-shrink-0 text-[10px] text-gray-400">固定</span> : <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 pointer-events-none" />}
              <input
                type="checkbox"
                id={`col-${key}`}
                checked={visibility[key] !== false}
                onChange={e => onVisibilityChange(key, e.target.checked)}
                onClick={e => e.stopPropagation()}
                className="rounded border-gray-300 text-rose-500 focus:ring-rose-500 pointer-events-auto"
              />
              <label htmlFor={`col-${key}`} className="flex-1 text-sm text-gray-800 cursor-pointer truncate pointer-events-auto">
                {getColumnLabel(key)}
              </label>
            </div>
          );
          })}
        </div>
        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// 可编辑单元格组件
interface EditableCellProps {
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'select' | 'date';
  options?: string[];
  placeholder?: string;
}

function EditableCell({ value, onChange, type = 'text', options, placeholder }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));

  useEffect(() => {
    setEditValue(String(value ?? ''));
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const newValue = type === 'number' ? (editValue ? Number(editValue) : 0) : editValue;
    if (newValue !== value) {
      onChange(newValue as string | number);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditValue(String(value ?? ''));
      setIsEditing(false);
    }
  };

  if (type === 'date') {
    const dateStr = String(value ?? '').trim();
    const displayText = dateStr ? dateStr : '—';  // 无数据只显示 —，不显示占位文案
    return (
      <div className="w-full min-w-[7.5rem]">
        {!isEditing ? (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setIsEditing(true)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsEditing(true); }}
            className="block w-full px-2 py-1 text-sm cursor-text text-left rounded hover:bg-gray-50"
            title={dateStr ? `上架日期 ${dateStr}，点击编辑` : '点击填写'}
          >
            {displayText}
          </span>
        ) : (
          <input
            type="date"
            value={dateStr}
            onChange={e => onChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            autoFocus
            className="w-full min-w-[7.5rem] px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-rose-500"
          />
        )}
      </div>
    );
  }

  if (type === 'select' && options) {
    return (
      <select
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 text-sm border-0 bg-transparent focus:ring-1 focus:ring-rose-500 rounded"
      >
        <option value="">-</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (isEditing) {
    return (
      <input
        type={type}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full px-2 py-1 text-sm border border-rose-300 rounded focus:ring-1 focus:ring-rose-500 focus:border-transparent"
        autoFocus
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="px-2 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded min-h-[28px]"
    >
      {value ?? <span className="text-gray-300">{placeholder || '-'}</span>}
    </div>
  );
}

export default function ProductDataTablePage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();

  // 加载状态
  const [loading, setLoading] = useState(true);
  const [collectionInfo, setCollectionInfo] = useState<KeywordCollection | null>(null);

  // 数据状态
  const [localProducts, setLocalProducts] = useState<ExtendedProduct[]>([]);
  const [localCustomFields, setLocalCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, Partial<ExtendedProduct>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmProductId, setDeleteConfirmProductId] = useState<string | null>(null);
  const [deleteConfirmColumnId, setDeleteConfirmColumnId] = useState<string | null>(null);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [isDataUploadOpen, setIsDataUploadOpen] = useState(false);

  // 行置顶、行标记（按产品库持久化到 localStorage）
  const PIN_STORAGE_KEY = (cid: string) => `product_table_pins_${cid}`;
  const MARK_STORAGE_KEY = (cid: string) => `product_table_marks_${cid}`;
  const ROW_MARK_COLORS = ['#fef3c7', '#d1fae5', '#dbeafe', '#ffe4e6'] as const; // 黄、绿、蓝、粉

  const [pinnedProductIds, setPinnedProductIds] = useState<string[]>(() => {
    if (!collectionId) return [];
    try {
      const raw = localStorage.getItem(PIN_STORAGE_KEY(collectionId));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [rowMarkColors, setRowMarkColors] = useState<Record<string, string>>(() => {
    if (!collectionId) return {};
    try {
      const raw = localStorage.getItem(MARK_STORAGE_KEY(collectionId));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    if (!collectionId) return;
    try {
      localStorage.setItem(PIN_STORAGE_KEY(collectionId), JSON.stringify(pinnedProductIds));
    } catch (_) {}
  }, [collectionId, pinnedProductIds]);

  useEffect(() => {
    if (!collectionId) return;
    try {
      localStorage.setItem(MARK_STORAGE_KEY(collectionId), JSON.stringify(rowMarkColors));
    } catch (_) {}
  }, [collectionId, rowMarkColors]);

  // 切换产品库时从 localStorage 恢复置顶/标记
  useEffect(() => {
    if (!collectionId) {
      setPinnedProductIds([]);
      setRowMarkColors({});
      return;
    }
    try {
      const pinRaw = localStorage.getItem(PIN_STORAGE_KEY(collectionId));
      setPinnedProductIds(pinRaw ? JSON.parse(pinRaw) : []);
      const markRaw = localStorage.getItem(MARK_STORAGE_KEY(collectionId));
      setRowMarkColors(markRaw ? JSON.parse(markRaw) : {});
    } catch {
      setPinnedProductIds([]);
      setRowMarkColors({});
    }
  }, [collectionId]);

  // 加载数据
  useEffect(() => {
    if (collectionId) {
      loadData();
    }
  }, [collectionId]);

  const loadData = async () => {
    if (!collectionId) return;
    
    setLoading(true);
    try {
      const collection = await apiService.getKeywordCollectionDetail(collectionId);
      setCollectionInfo(collection);
      setLocalCustomFields(collection.custom_fields || []);
      
      // 转换产品数据
      const products: ExtendedProduct[] = (collection.products ?? []).map((p: any) => ({
        id: p.id,
        asin: p.asin,
        title: p.title,
        price: p.price || '$0.00',
        rating: p.rating || 0,
        reviewCount: p.review_count || 0,
        salesCount: p.sales_volume_manual ?? p.sales_volume ?? 0,
        salesVolumeManual: p.sales_volume_manual ?? undefined,
        salesVolumeAmazon: p.sales_volume ?? undefined,
        imageUrl: p.image_url || '',
        productUrl: p.product_url || `https://www.amazon.com/dp/${p.asin}`,
        // 插件爬不到年份/上架日期，无数据时保持为空，不默认当前年
        year: p.year ?? (p.listing_date ? new Date(p.listing_date).getFullYear() : undefined),
        listingDate: p.listing_date ?? undefined,
        brand: p.brand || '',
        majorCategoryRank: p.major_category_rank,
        minorCategoryRank: p.minor_category_rank,
        boardId: p.board_id || 'default',
        monthly_sales: p.monthly_sales || {},
        custom_tags: p.custom_tags || {},
      }));
      
      setLocalProducts(products);
    } catch (err) {
      console.error('加载数据失败:', err);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有月度销量的月份列表
  // 月度列默认按时间从近期到远期排序（如 2025-01, 2024-12, 2024-11…）
  const monthColumns = useMemo(() => {
    const months = new Set<string>();
    localProducts.forEach(p => {
      if (p.monthly_sales) {
        Object.keys(p.monthly_sales).forEach(m => months.add(m));
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [localProducts]);

  // 当前所有数据列 key（不含 # 和 操作）
  const currentColumnKeys = useMemo(() => [
    ...BUILT_IN_COLUMN_KEYS,
    ...monthColumns.map(m => 'month_' + m),
    ...localCustomFields.map(f => 'tag_' + f.id),
  ], [monthColumns, localCustomFields]);

  // 标记是否已完成初始加载
  const [initialConfigLoaded, setInitialConfigLoaded] = useState(false);

  // 从 localStorage 恢复列配置（仅在初始加载时运行一次）
  useEffect(() => {
    if (!collectionId || initialConfigLoaded) return;
    if (currentColumnKeys.length === 0) return; // 等待 currentColumnKeys 准备好
    
    const saved = loadColumnConfig(collectionId);
    const vis = saved?.visibility ?? {};
    let order = saved?.order ?? [];
    // 兼容旧配置：将已废弃的 salesCount 列替换为 amazonSales、manualSales
    if (order.includes('salesCount')) {
      const idx = order.indexOf('salesCount');
      order = [...order.slice(0, idx), 'amazonSales', 'manualSales', ...order.slice(idx + 1)];
    }
    
    // 初始化可见性
    const initialVisibility: Record<string, boolean> = {};
    currentColumnKeys.forEach(k => {
      initialVisibility[k] = vis[k] !== false;
    });
    setColumnVisibility(initialVisibility);
    
    // 初始化列顺序：优先使用 localStorage 中保存的顺序
    // 只添加那些在 currentColumnKeys 中但不在 order 中的列
    const known = order.filter(k => currentColumnKeys.includes(k));
    const appended = currentColumnKeys.filter(k => !order.includes(k));
    let rawOrder = orderWithMonthsRecentFirst([...known, ...appended]);
    
    // 强制 image 排第一（sticky 列必须在 DOM 中排在前面）
    if (rawOrder.includes('image') && rawOrder[0] !== 'image') {
      rawOrder = ['image', ...rawOrder.filter(k => k !== 'image')];
      // 自动修正并保存
      saveColumnConfig(collectionId, { visibility: initialVisibility, order: rawOrder });
    }
    setColumnOrder(rawOrder);
    setInitialConfigLoaded(true);
  }, [collectionId, currentColumnKeys, initialConfigLoaded]);

  // 当有新的月度列出现时（比如上传数据后），自动添加到列顺序中
  useEffect(() => {
    if (!initialConfigLoaded || !collectionId) return;
    
    // 只处理月度列，不处理 tag_* 列（tag_* 列由 handleAddColumn 管理）
    const newMonthKeys = currentColumnKeys.filter(k => 
      k.startsWith('month_') && !columnOrder.includes(k)
    );
    
    if (newMonthKeys.length > 0) {
      setColumnOrder(prev => {
        const next = [...prev, ...newMonthKeys];
        saveColumnConfig(collectionId, { visibility: columnVisibility, order: next });
        return next;
      });
      setColumnVisibility(prev => {
        const next = { ...prev };
        newMonthKeys.forEach(k => { next[k] = true; });
        return next;
      });
    }
  }, [currentColumnKeys, initialConfigLoaded, collectionId, columnOrder, columnVisibility]);

  // 构建当前有效的 tag_* 列 key 集合（基于 localCustomFields，这是最权威的来源）
  // 这个集合用于判断哪些 tag_* 列应该显示
  const validTagKeys = useMemo(() => {
    return new Set(localCustomFields.map(f => 'tag_' + f.id));
  }, [localCustomFields]);

  // 可见列按顺序；#、操作、图片固定前3列；自定义列(tag_*)紧随图片后；月度列近期→远期
  const visibleColumnsInOrder = useMemo(() => {
    // 核心逻辑：
    // 1. columnOrder 决定列的顺序
    // 2. validTagKeys 决定哪些 tag_* 列是有效的（基于 localCustomFields）
    // 3. currentColumnKeys 包含所有内置列和月度列
    
    // 从 columnOrder 中过滤出有效的列
    const ordered = columnOrder.filter(k => {
      if (k.startsWith('tag_')) {
        // tag_* 列必须在 validTagKeys 中才有效（即必须在 localCustomFields 中存在）
        // 这确保了：
        // - 新增列：只有当 localCustomFields 更新后，列才会显示
        // - 删除列：一旦从 localCustomFields 中移除，列立即消失
        return validTagKeys.has(k);
      }
      if (k.startsWith('month_')) {
        return true;
      }
      // 内置列
      return currentColumnKeys.includes(k);
    });
    
    // 找出不在 columnOrder 中的列（可能是新数据或旧数据）
    const appended = currentColumnKeys.filter(k => !columnOrder.includes(k));
    // 对于 tag_* 列，只添加那些在 validTagKeys 中但不在 columnOrder 中的
    // （这种情况发生在：localCustomFields 已更新但 columnOrder 还没更新时）
    const tagAppended = appended.filter(k => k.startsWith('tag_') && validTagKeys.has(k));
    const otherAppended = appended.filter(k => !k.startsWith('tag_'));
    
    let fullOrder: string[];
    if (ordered.length > 0) {
      fullOrder = [...ordered];
      
      // 追加不在 columnOrder 中的其他列
      if (otherAppended.length > 0) {
        fullOrder = [...fullOrder, ...otherAppended];
      }
      
      // 处理不在 columnOrder 中的 tag_* 列，插入到图片列之后
      if (tagAppended.length > 0) {
        const imageIdx = fullOrder.indexOf('image');
        if (imageIdx !== -1) {
          fullOrder = [...fullOrder.slice(0, imageIdx + 1), ...tagAppended, ...fullOrder.slice(imageIdx + 1)];
        } else {
          fullOrder = [...fullOrder, ...tagAppended];
        }
      }
    } else {
      // 如果 columnOrder 为空，使用 currentColumnKeys（过滤掉无效的 tag_* 列）
      fullOrder = currentColumnKeys.filter(k => !k.startsWith('tag_') || validTagKeys.has(k));
    }
    
    const withMonthsRecentFirst = orderWithMonthsRecentFirst(fullOrder);
    
    // 过滤可见性
    let list = withMonthsRecentFirst.filter(k => {
      // 如果列在 columnOrder 中但没有 visibility 设置，默认显示
      if (columnOrder.includes(k) && columnVisibility[k] === undefined) {
        return true;
      }
      return columnVisibility[k] !== false;
    });
    
    // 强制 image 排第一（sticky 列必须在 DOM 中排在前面）
    if (list.includes('image') && list[0] !== 'image') {
      const imageIdx = list.indexOf('image');
      const beforeImage = list.slice(0, imageIdx);
      const imageAndAfter = list.slice(imageIdx);
      list = [...imageAndAfter, ...beforeImage];
    }
    return list;
  }, [columnOrder, columnVisibility, currentColumnKeys, validTagKeys]);

  const getColumnLabel = useCallback((key: string) => {
    if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];
    if (key.startsWith('month_')) return key.slice(6);
    if (key.startsWith('tag_')) {
      const id = key.slice(4);
      return localCustomFields.find(f => f.id === id)?.name ?? id;
    }
    return key;
  }, [localCustomFields]);

  const handleColumnVisibilityChange = useCallback((key: string, visible: boolean) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [key]: visible };
      if (collectionId) saveColumnConfig(collectionId, { visibility: next, order: columnOrder });
      return next;
    });
  }, [collectionId, columnOrder]);

  const handleColumnOrderChange = useCallback((newOrder: string[]) => {
    setColumnOrder(prev => {
      let next = newOrder.length ? newOrder : prev;
      // 强制 image 排第一（sticky 列必须在 DOM 中排在前面）
      if (next.includes('image')) {
        next = ['image', ...next.filter(k => k !== 'image')];
      }
      if (collectionId) saveColumnConfig(collectionId, { visibility: columnVisibility, order: next });
      return next;
    });
  }, [collectionId, columnVisibility]);

  // 过滤和排序产品
  const filteredProducts = useMemo(() => {
    let result = [...localProducts];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.asin.toLowerCase().includes(term) ||
        p.title.toLowerCase().includes(term) ||
        (p.brand && p.brand.toLowerCase().includes(term))
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        let aVal: any = (a as any)[sortConfig.key];
        let bVal: any = (b as any)[sortConfig.key];

        if (sortConfig.key.startsWith('tag_')) {
          const fieldId = sortConfig.key.replace('tag_', '');
          aVal = a.custom_tags?.[fieldId] || '';
          bVal = b.custom_tags?.[fieldId] || '';
        }

        if (sortConfig.key.startsWith('month_')) {
          const month = sortConfig.key.replace('month_', '');
          aVal = a.monthly_sales?.[month] || 0;
          bVal = b.monthly_sales?.[month] || 0;
        }
        if (sortConfig.key === 'amazonSales') {
          aVal = (a as ExtendedProduct).salesVolumeAmazon ?? 0;
          bVal = (b as ExtendedProduct).salesVolumeAmazon ?? 0;
        }
        if (sortConfig.key === 'manualSales') {
          aVal = a.salesVolumeManual ?? 0;
          bVal = b.salesVolumeManual ?? 0;
        }
        // 年份列按完整上架日期 YYYY-MM-DD 排序，否则同一年内顺序错乱
        if (sortConfig.key === 'year') {
          const extA = a as ExtendedProduct;
          const extB = b as ExtendedProduct;
          aVal = extA.listingDate || (a.year ? `${a.year}-01-01` : '');
          bVal = extB.listingDate || (b.year ? `${b.year}-01-01` : '');
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // 置顶行排在前面，按 pinnedProductIds 顺序
    if (pinnedProductIds.length > 0) {
      const pinSet = new Set(pinnedProductIds);
      const pinned = result.filter(p => pinSet.has(p.id));
      const unpinned = result.filter(p => !pinSet.has(p.id));
      const orderedPinned = pinnedProductIds.map(id => pinned.find(p => p.id === id)).filter(Boolean) as ExtendedProduct[];
      result = [...orderedPinned, ...unpinned];
    }

    return result;
  }, [localProducts, searchTerm, sortConfig, pinnedProductIds]);

  const togglePin = useCallback((productId: string) => {
    setPinnedProductIds(prev => {
      const idx = prev.indexOf(productId);
      if (idx >= 0) return prev.filter(id => id !== productId);
      return [productId, ...prev];
    });
  }, []);

  const cycleRowMark = useCallback((productId: string) => {
    setRowMarkColors(prev => {
      const current = prev[productId] || '';
      const colors = [...ROW_MARK_COLORS, ''];
      const i = colors.indexOf(current);
      const next = colors[(i + 1) % colors.length];
      if (!next) {
        const nextState = { ...prev };
        delete nextState[productId];
        return nextState;
      }
      return { ...prev, [productId]: next };
    });
  }, []);

  // 处理排序
  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' 
          ? { key, direction: 'desc' }
          : null;
      }
      return { key, direction: 'asc' };
    });
  };

  // 更新产品数据
  const updateProduct = useCallback((productId: string, field: string, value: any) => {
    setLocalProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;

      if (field.startsWith('tag_')) {
        const fieldId = field.replace('tag_', '');
        return {
          ...p,
          custom_tags: {
            ...p.custom_tags,
            [fieldId]: value,
          },
        };
      }

      if (field.startsWith('month_')) {
        const month = field.replace('month_', '');
        return {
          ...p,
          monthly_sales: {
            ...p.monthly_sales,
            [month]: Number(value) || 0,
          },
        };
      }
      if (field === 'amazonSales') {
        const v = value === '' || value === undefined ? undefined : (typeof value === 'number' ? value : parseInt(String(value), 10));
        return { ...p, salesVolumeAmazon: Number.isNaN(v) ? undefined : v };
      }
      if (field === 'manualSales') {
        const v = value === '' || value === undefined ? undefined : (typeof value === 'number' ? value : parseInt(String(value), 10));
        return { ...p, salesVolumeManual: Number.isNaN(v) ? undefined : v };
      }
      if (field === 'listingDate') {
        const s = typeof value === 'string' ? value.trim() || undefined : undefined;
        const y = s ? new Date(s).getFullYear() : (p.year ?? undefined);
        return { ...p, listingDate: s, year: Number.isNaN(y) ? p.year : y };
      }

      return { ...p, [field]: value };
    }));

    setPendingChanges(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(productId) || {};
      
      if (field.startsWith('tag_')) {
        const fieldId = field.replace('tag_', '');
        existing.custom_tags = {
          ...(existing.custom_tags || {}),
          [fieldId]: value,
        };
      } else if (field.startsWith('month_')) {
        const month = field.replace('month_', '');
        existing.monthly_sales = {
          ...(existing.monthly_sales || {}),
          [month]: Number(value) || 0,
        };
      } else {
        (existing as any)[field] = value;
      }
      
      newMap.set(productId, existing);
      return newMap;
    });
  }, []);

  // 添加自定义列（新列始终插入到图片列后面）
  const handleAddColumn = useCallback(async (field: CustomFieldDefinition) => {
    if (!collectionId) return;
    
    const key = 'tag_' + field.id;
    
    // 计算新的状态值（在更新前计算，确保一致性）
    const newFields = [...localCustomFields, field];
    const imageIdx = columnOrder.indexOf('image');
    
    const newOrder = columnOrder.includes(key) ? columnOrder : (() => {
      if (imageIdx !== -1) {
        return [...columnOrder.slice(0, imageIdx + 1), key, ...columnOrder.slice(imageIdx + 1)];
      }
      const asinIdx = columnOrder.indexOf('asin');
      if (asinIdx !== -1) {
        return [...columnOrder.slice(0, asinIdx + 1), key, ...columnOrder.slice(asinIdx + 1)];
      }
      return [...columnOrder, key];
    })();
    const newVisibility = { ...columnVisibility, [key]: true };
    
    // 关键：先保存到 localStorage，这样即使 useEffect 重新运行，也会读取到正确的顺序
    saveColumnConfig(collectionId, { visibility: newVisibility, order: newOrder });
    
    // 同时更新所有状态（React 18 会自动批处理）
    setLocalCustomFields(newFields);
    setColumnOrder(newOrder);
    setColumnVisibility(newVisibility);
    
    try {
      await apiService.saveCustomFields(collectionId, newFields);
      toast.success('自定义列已添加');
    } catch (err) {
      console.error('保存自定义字段失败:', err);
      toast.error('保存失败');
      // 回滚状态和 localStorage
      setLocalCustomFields(localCustomFields);
      setColumnOrder(columnOrder);
      setColumnVisibility(columnVisibility);
      saveColumnConfig(collectionId, { visibility: columnVisibility, order: columnOrder });
    }
  }, [collectionId, localCustomFields, columnOrder, columnVisibility]);

  // 删除自定义列（先显示确认弹窗）
  const handleDeleteColumn = useCallback((fieldId: string) => {
    setDeleteConfirmColumnId(fieldId);
  }, []);

  // 确认删除自定义列
  const confirmDeleteColumn = useCallback(async (fieldId: string) => {
    if (!collectionId) return;
    
    const newFields = localCustomFields.filter(f => f.id !== fieldId);
    setLocalCustomFields(newFields);
    
    // 同时更新列配置：隐藏该列并从顺序中移除
    const key = 'tag_' + fieldId;
    const newVisibility = { ...columnVisibility };
    delete newVisibility[key];
    const newOrder = columnOrder.filter(k => k !== key);
    setColumnVisibility(newVisibility);
    setColumnOrder(newOrder);
    
    try {
      await apiService.saveCustomFields(collectionId, newFields);
      saveColumnConfig(collectionId, { visibility: newVisibility, order: newOrder });
      toast.success('自定义列已删除');
      setDeleteConfirmColumnId(null);
    } catch (err) {
      console.error('删除自定义字段失败:', err);
      toast.error('删除失败');
      setLocalCustomFields(localCustomFields);
      setDeleteConfirmColumnId(null);
    }
  }, [collectionId, localCustomFields, columnVisibility, columnOrder]);

  // 编辑产品（打开编辑弹窗）
  const handleProductEdit = useCallback((product: Product) => {
    setEditingProduct(product);
  }, []);

  // 保存产品编辑（弹窗内保存，同步到后端）
  const handleProductSave = useCallback(async (updatedProduct: Product) => {
    if (!collectionId) {
      setLocalProducts(prev => prev.map(p => p.id === updatedProduct.id ? { ...p, ...updatedProduct } as ExtendedProduct : p));
      setEditingProduct(null);
      return;
    }
    try {
      const ext = updatedProduct as ExtendedProduct;
      await apiService.updateCollectionProduct(collectionId, updatedProduct.id, {
        asin: updatedProduct.asin,
        title: updatedProduct.title,
        image_url: updatedProduct.imageUrl,
        product_url: updatedProduct.productUrl,
        price: updatedProduct.price,
        rating: updatedProduct.rating,
        review_count: updatedProduct.reviewCount,
        sales_volume: ext.salesVolumeAmazon ?? undefined,
        sales_volume_manual: ext.salesVolumeManual ?? updatedProduct.salesCount ?? undefined,
        year: updatedProduct.year,
        brand: updatedProduct.brand,
        listing_date: ext.listingDate ?? undefined,
      });
      setLocalProducts(prev => prev.map(p => p.id === updatedProduct.id ? {
        ...p,
        ...updatedProduct,
        salesVolumeManual: (updatedProduct as ExtendedProduct).salesVolumeManual ?? updatedProduct.salesCount,
        listingDate: (updatedProduct as ExtendedProduct).listingDate,
      } as ExtendedProduct : p));
      setEditingProduct(null);
      toast.success('产品信息已保存');
    } catch (err) {
      console.error('保存产品失败:', err);
      toast.error('保存产品失败');
    }
  }, [collectionId]);

  // 删除产品（确认后同步到后端）
  const handleProductDelete = useCallback(async (productId: string) => {
    if (!collectionId) {
      setLocalProducts(prev => prev.filter(p => p.id !== productId));
      setDeleteConfirmProductId(null);
      return;
    }
    try {
      await apiService.deleteCollectionProduct(collectionId, productId);
      setLocalProducts(prev => prev.filter(p => p.id !== productId));
      setDeleteConfirmProductId(null);
      toast.success('产品已删除');
    } catch (err) {
      console.error('删除产品失败:', err);
      toast.error('删除产品失败');
    }
  }, [collectionId]);

  // 保存所有更改
  const handleSaveAll = useCallback(async () => {
    if (!collectionId) return;
    
    if (pendingChanges.size === 0) {
      toast.info('没有需要保存的更改');
      return;
    }

    setIsSaving(true);
    try {
      const updates: Array<{ product_id: string; custom_tags: Record<string, string> }> = [];
      const productUpdates: Array<any> = [];

      pendingChanges.forEach((changes, productId) => {
        const product = localProducts.find(p => p.id === productId);
        if (!product) return;

        if (changes.custom_tags && Object.keys(changes.custom_tags).length > 0) {
          const mergedTags: Record<string, string> = { ...(product.custom_tags || {}) };
          Object.entries(changes.custom_tags).forEach(([k, v]) => {
            mergedTags[k] = v != null ? String(v) : '';
          });
          updates.push({
            product_id: String(productId),
            custom_tags: mergedTags,
          });
        }

        const otherChanges: any = { asin: product.asin };
        if (changes.monthly_sales) {
          otherChanges.monthly_sales = changes.monthly_sales;
        }
        if ((changes as any).year !== undefined) {
          const v = (changes as any).year;
          otherChanges.year = typeof v === 'number' ? v : (v === '' ? null : parseInt(String(v), 10));
        }
        if ((changes as any).brand !== undefined) {
          otherChanges.brand = (changes as any).brand;
        }
        if ((changes as any).amazonSales !== undefined) {
          const v = (changes as any).amazonSales;
          otherChanges.sales_volume = typeof v === 'number' ? v : (v === '' ? null : parseInt(String(v), 10));
        }
        if ((changes as any).manualSales !== undefined) {
          const v = (changes as any).manualSales;
          otherChanges.sales_volume_manual = typeof v === 'number' ? v : (v === '' ? null : parseInt(String(v), 10));
        }
        if ((changes as any).listingDate !== undefined) {
          const v = (changes as any).listingDate;
          otherChanges.listing_date = (v === '' || v === null || v === undefined) ? null : String(v);
          if (otherChanges.listing_date) otherChanges.year = new Date(otherChanges.listing_date).getFullYear();
        }
        if ((changes as any).price !== undefined) {
          otherChanges.price = (changes as any).price;
        }
        if ('majorCategoryRank' in changes) {
          const v = (changes as any).majorCategoryRank;
          otherChanges.major_category_rank = (v === '' || v === undefined || v === null) ? null : (typeof v === 'number' ? v : parseInt(String(v), 10));
        }
        if ('minorCategoryRank' in changes) {
          const v = (changes as any).minorCategoryRank;
          otherChanges.minor_category_rank = (v === '' || v === undefined || v === null) ? null : (typeof v === 'number' ? v : parseInt(String(v), 10));
        }

        if (Object.keys(otherChanges).length > 1) {
          productUpdates.push(otherChanges);
        }
      });

      if (updates.length > 0) {
        await apiService.batchUpdateProductTags(collectionId, updates);
      }

      if (productUpdates.length > 0) {
        await apiService.batchUpdateCollectionProducts(collectionId, productUpdates);
      }

      setPendingChanges(new Map());
      toast.success(`成功保存 ${pendingChanges.size} 个产品的更改`);
    } catch (err) {
      console.error('保存失败:', err);
      toast.error('保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, localProducts, collectionId]);

  // 补充数据：按 ASIN 匹配，支持两种模板——仅销售数据 或 品牌/排名等全部字段；更新后列表视图立即可见
  const handleDataUpload = useCallback(async (data: DataUploadResult[]) => {
    if (!collectionId || data.length === 0) {
      setIsDataUploadOpen(false);
      return;
    }
    const normalizeAsin = (a: string) => String(a).trim().toUpperCase();
    const asinSet = new Set(localProducts.map(p => normalizeAsin(p.asin)));
    const batchData: BatchUpdateProductItem[] = [];
    for (const d of data) {
      const asin = String(d.asin).trim();
      if (!asinSet.has(normalizeAsin(asin))) continue;
      const item: BatchUpdateProductItem = { asin };
      if (d.salesCount !== undefined) item.sales_volume_manual = d.salesCount;
      if (d.monthly_sales && Object.keys(d.monthly_sales).length > 0) item.monthly_sales = d.monthly_sales;
      if (d.year !== undefined) item.year = d.year;
      if (d.listing_date !== undefined) item.listing_date = d.listing_date;
      if (d.brand !== undefined) item.brand = d.brand;
      if (d.majorCategoryRank !== undefined) item.major_category_rank = d.majorCategoryRank;
      if (d.minorCategoryRank !== undefined) item.minor_category_rank = d.minorCategoryRank;
      if (d.majorCategoryName !== undefined) item.major_category_name = d.majorCategoryName;
      if (d.minorCategoryName !== undefined) item.minor_category_name = d.minorCategoryName;
      batchData.push(item);
    }
    if (batchData.length === 0) {
      toast.warning('未匹配到当前产品库中的 ASIN，请确认表格含有 ASIN 列且与产品库一致');
      setIsDataUploadOpen(false);
      return;
    }
    try {
      const res = await apiService.batchUpdateCollectionProducts(collectionId, batchData);
      // 收集上传数据里的新月份，用于后面确保在列表视图中显示
      const uploadedMonthKeys = new Set<string>();
      data.forEach(d => {
        if (d.monthly_sales) Object.keys(d.monthly_sales).forEach(m => uploadedMonthKeys.add(m));
      });
      setLocalProducts(prev => prev.map(p => {
        const match = data.find(d => normalizeAsin(d.asin) === normalizeAsin(p.asin));
        if (!match) return p;
        return {
          ...p,
          ...(match.salesCount !== undefined && { salesCount: match.salesCount, salesVolumeManual: match.salesCount }),
          ...(match.monthly_sales && Object.keys(match.monthly_sales).length > 0 && { monthly_sales: { ...p.monthly_sales, ...match.monthly_sales } }),
          ...(match.year !== undefined && { year: match.year }),
          ...(match.listing_date !== undefined && { listingDate: match.listing_date }),
          ...(match.brand !== undefined && { brand: match.brand }),
          ...(match.majorCategoryRank !== undefined && { majorCategoryRank: match.majorCategoryRank }),
          ...(match.minorCategoryRank !== undefined && { minorCategoryRank: match.minorCategoryRank }),
          ...(match.majorCategoryName !== undefined && { majorCategoryName: match.majorCategoryName }),
          ...(match.minorCategoryName !== undefined && { minorCategoryName: match.minorCategoryName }),
        };
      }));
      // 确保新出现的月度列在列表视图中可见并加入列顺序
      if (uploadedMonthKeys.size > 0) {
        setColumnOrder(prev => {
          const next = [...prev];
          uploadedMonthKeys.forEach(m => {
            const k = 'month_' + m;
            if (!next.includes(k)) next.push(k);
          });
          return next;
        });
        setColumnVisibility(prev => {
          const next = { ...prev };
          uploadedMonthKeys.forEach(m => {
            const k = 'month_' + m;
            if (next[k] !== true) next[k] = true;
          });
          return next;
        });
      }
      toast.success(`已更新 ${res.updated_count} 个产品${res.not_found_count ? `，${res.not_found_count} 个未找到` : ''}`);
      setIsDataUploadOpen(false);
    } catch (err) {
      console.error('补充数据失败:', err);
      toast.error('补充数据失败');
    }
  }, [collectionId, localProducts]);

  // 返回画板页面
  const handleBackToBoard = () => {
    navigate(`/product-board/${collectionId}`);
  };

  // 渲染排序图标
  const renderSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Toaster position="top-center" richColors />
      
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToBoard}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回画板
          </button>
          
          <div className="h-6 w-px bg-gray-300" />
          
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {collectionInfo?.keyword || '数据表格'}
            </h1>
            <p className="text-sm text-gray-500">
              共 {localProducts.length} 个产品
              {pendingChanges.size > 0 && (
                <span className="ml-2 text-rose-500">
                  ({pendingChanges.size} 个待保存)
                </span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索 ASIN、标题、品牌..."
              className="pl-9 pr-4 py-2 w-72 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>

          {/* 列设置：隐藏列、调整列顺序 */}
          <button
            onClick={() => setIsColumnSettingsOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-800 border-2 rounded-lg hover:bg-gray-50 flex-shrink-0"
            style={{ borderColor: '#8B5CF6' }}
            title="隐藏列、调整列顺序"
          >
            <Settings2 className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            列设置（隐藏/排序）
          </button>

          {/* 添加列按钮 */}
          <button
            onClick={() => setIsAddColumnOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            添加列
          </button>

          {/* 补充数据：支持仅销售数据 或 品牌/排名等模板 */}
          <button
            onClick={() => setIsDataUploadOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" />
            补充数据
          </button>

          {/* 返回画板视图 */}
          <button
            onClick={handleBackToBoard}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: '#3B82F6' }}
          >
            <LayoutGrid className="w-4 h-4" />
            画板视图
          </button>

          {/* 保存按钮 */}
          <button
            onClick={handleSaveAll}
            disabled={pendingChanges.size === 0 || isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: pendingChanges.size > 0 ? '#FF1B82' : '#ccc' }}
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </div>

      {/* 表格区域：min-h-0 使 flex 子项能占满剩余高度，避免底部留空 */}
      <div className="flex-1 min-h-0 overflow-auto bg-white m-4 rounded-xl shadow-sm">
        <table className="w-full border-collapse table-fixed">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r bg-gray-50 sticky left-0 z-50 w-12 shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]" style={{ backgroundColor: '#f9fafb' }}>
                #
              </th>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r bg-gray-50 sticky z-50 min-w-[136px] w-[136px] shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]" style={{ left: 48, backgroundColor: '#f9fafb' }}>
                操作
              </th>
              {visibleColumnsInOrder.map(key => {
                const sortable = ['asin','title','price','rating','reviewCount','amazonSales','manualSales','year','brand'].includes(key) || key.startsWith('month_') || key.startsWith('tag_');
                const isMonth = key.startsWith('month_');
                const isTag = key.startsWith('tag_');
                const field = isTag ? localCustomFields.find(f => f.id === key.slice(4)) : null;
                const isFixedImage = key === 'image';
                // 图片列需要固定宽度，避免与默认 w-28 冲突
                const columnWidth = key === 'image' ? 'w-[72px] min-w-[72px] max-w-[72px]' : key === 'asin' ? 'min-w-[140px] w-40' : key === 'title' ? 'w-[300px] min-w-[300px]' : key === 'price' ? 'w-24 min-w-[96px]' : 'w-28';
                return (
                  <th
                    key={key}
                    className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider border-b cursor-pointer ${columnWidth}
                      ${isMonth ? 'text-blue-700 hover:bg-blue-100 bg-blue-50' : ''}
                      ${isTag ? 'text-purple-700 hover:bg-purple-100 bg-purple-50 group' : !isMonth ? 'text-gray-500 hover:bg-gray-100' : ''}
                      ${!sortable && !isMonth && !isTag && key !== 'image' && key !== 'asin' && key !== 'title' ? 'w-20' : ''}
                      ${isFixedImage ? 'sticky z-50 bg-gray-50 border-r border-gray-200 shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]' : ''}`}
                    style={isFixedImage ? { left: 184, backgroundColor: '#f9fafb' } : undefined}
                    onClick={sortable ? () => handleSort(key) : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {getColumnLabel(key)} {sortable ? renderSortIcon(key) : null}
                      </div>
                      {isTag && field && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteColumn(field.id); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded"
                          title="删除此列"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProducts.map((product, index) => {
              const rowBg = rowMarkColors[product.id];
              const isPinned = pinnedProductIds.includes(product.id);
              const markColor = rowMarkColors[product.id];
              return (
              <tr key={product.id} className="group hover:bg-gray-50" style={rowBg ? { backgroundColor: rowBg } : undefined}>
                <td className="px-3 py-2 text-sm text-gray-500 border-r sticky left-0 z-40 shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]" style={rowBg ? { backgroundColor: rowBg } : { backgroundColor: 'white' }}>
                  {index + 1}
                </td>
                <td className="px-2 py-2 text-sm border-r sticky z-40 whitespace-nowrap shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]" style={{ left: 48, ...(rowBg ? { backgroundColor: rowBg } : { backgroundColor: 'white' }) }}>
                  <div className="flex items-center gap-0.5 flex-nowrap">
                    <button type="button" onClick={() => togglePin(product.id)} className={`flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 ${isPinned ? 'text-rose-500 bg-rose-50' : 'text-gray-600'}`} title={isPinned ? '取消置顶' : '置顶'}>
                      <Pin className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => cycleRowMark(product.id)} className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-600" title={markColor ? '行标记（点击切换颜色）' : '行标记'}>
                      <Highlighter className="w-4 h-4" style={markColor ? { color: markColor } : undefined} />
                    </button>
                    <button type="button" onClick={() => handleProductEdit(product)} className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-600" title="编辑">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteConfirmProductId(product.id)} className="flex-shrink-0 p-1 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600" title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                {visibleColumnsInOrder.map(key => {
                  const isMonth = key.startsWith('month_');
                  const isTag = key.startsWith('tag_');
                  const field = isTag ? localCustomFields.find(f => f.id === key.slice(4)) : null;
                  const tdClass = `px-3 py-2 text-sm ${isMonth ? 'bg-blue-50/30' : ''} ${isTag ? 'bg-purple-50/30' : ''}`;
                  const cellStyle = rowBg ? { backgroundColor: rowBg } : undefined;
                  if (key === 'image') {
                    return (
                      <td key={key} className="w-[72px] min-w-[72px] max-w-[72px] p-1 align-middle border-r border-gray-200 sticky z-40 shadow-[2px_0_6px_-1px_rgba(0,0,0,0.15)]" style={{ left: 184, ...cellStyle }}>
                        <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 flex shrink-0">
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=N/A'; }}
                          />
                        </div>
                      </td>
                    );
                  }
                  if (key === 'asin') {
                    return (
                      <td key={key} className={`${tdClass} min-w-[140px] whitespace-nowrap pl-6 relative`} style={{ paddingLeft: '1.75rem', ...cellStyle }}>
                        <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                          {product.asin}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </td>
                    );
                  }
                  if (key === 'title') {
                    return (
                      <td key={key} className={`${tdClass} text-gray-900 w-[300px] min-w-[300px] truncate`} title={product.title} style={cellStyle}>
                        {product.title}
                      </td>
                    );
                  }
                  if (key === 'price') {
                    return (
                      <td key={key} className={`${tdClass} font-medium w-24 min-w-[96px] whitespace-nowrap`} style={{ color: '#FF1B82', ...cellStyle }}>
                        {product.price}
                      </td>
                    );
                  }
                  if (key === 'rating') {
                    return <td key={key} className={tdClass} style={cellStyle}>{product.rating.toFixed(1)}</td>;
                  }
                  if (key === 'reviewCount') {
                    return <td key={key} className={tdClass} style={cellStyle}>{product.reviewCount.toLocaleString()}</td>;
                  }
                  if (key === 'amazonSales') {
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={(product as ExtendedProduct).salesVolumeAmazon ?? ''} onChange={v => updateProduct(product.id, 'amazonSales', v)} type="number" placeholder="亚马逊预估" />
                      </td>
                    );
                  }
                  if (key === 'manualSales') {
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={product.salesVolumeManual ?? ''} onChange={v => updateProduct(product.id, 'manualSales', v)} type="number" placeholder="第三方预估" />
                      </td>
                    );
                  }
                  if (key === 'year') {
                    const ext = product as ExtendedProduct;
                    const dateVal = ext.listingDate || (product.year ? `${product.year}-01-01` : '');
                    return (
                      <td key={key} className={tdClass} style={{ minWidth: '120px', ...cellStyle }} title={ext.listingDate ? `上架日期 ${ext.listingDate}` : product.year ? `${product.year}年` : ''}>
                        <EditableCell value={dateVal} onChange={v => updateProduct(product.id, 'listingDate', v)} type="date" placeholder="上架日期" />
                      </td>
                    );
                  }
                  if (key === 'brand') {
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={product.brand || ''} onChange={v => updateProduct(product.id, 'brand', v)} placeholder="品牌" />
                      </td>
                    );
                  }
                  if (key === 'majorCategoryRank') {
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={product.majorCategoryRank ?? ''} onChange={v => updateProduct(product.id, 'majorCategoryRank', typeof v === 'string' && v.trim() === '' ? undefined : (typeof v === 'number' ? v : Number(v)))} type="number" placeholder="大类BSR" />
                      </td>
                    );
                  }
                  if (key === 'minorCategoryRank') {
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={product.minorCategoryRank ?? ''} onChange={v => updateProduct(product.id, 'minorCategoryRank', typeof v === 'string' && v.trim() === '' ? undefined : (typeof v === 'number' ? v : Number(v)))} type="number" placeholder="小类BSR" />
                      </td>
                    );
                  }
                  if (isMonth) {
                    const month = key.slice(6);
                    return (
                      <td key={key} className={tdClass} style={cellStyle}>
                        <EditableCell value={product.monthly_sales?.[month] || ''} onChange={v => updateProduct(product.id, `month_${month}`, v)} type="number" placeholder="0" />
                      </td>
                    );
                  }
                  if (isTag) {
                    // 即使 field 暂时不存在（由于异步更新），也渲染列，显示占位符
                    if (field) {
                      return (
                        <td key={key} className={tdClass} style={cellStyle}>
                          <EditableCell value={product.custom_tags?.[field.id] || ''} onChange={v => updateProduct(product.id, `tag_${field.id}`, v)} type={field.type} options={field.options} placeholder={field.name} />
                        </td>
                      );
                    } else {
                      // field 暂时不存在，显示占位符，等待 localCustomFields 更新
                      const fieldId = key.slice(4);
                      return (
                        <td key={key} className={tdClass} style={cellStyle}>
                          <EditableCell value={product.custom_tags?.[fieldId] || ''} onChange={v => updateProduct(product.id, `tag_${fieldId}`, v)} type="text" placeholder="加载中..." />
                        </td>
                      );
                    }
                  }
                  return <td key={key} className={tdClass} style={cellStyle}>-</td>;
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 底部统计 */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 text-sm text-gray-500">
        显示 {filteredProducts.length} / {localProducts.length} 个产品
        {monthColumns.length > 0 && ` | ${monthColumns.length} 个月度销量列`}
        {localCustomFields.length > 0 && ` | ${localCustomFields.length} 个自定义列`}
      </div>

      {/* 列设置弹窗 */}
      <ColumnSettingsModal
        isOpen={isColumnSettingsOpen}
        onClose={() => setIsColumnSettingsOpen(false)}
        columnKeys={currentColumnKeys}
        getColumnLabel={getColumnLabel}
        visibility={columnVisibility}
        order={columnOrder}
        onVisibilityChange={handleColumnVisibilityChange}
        onOrderChange={handleColumnOrderChange}
      />

      {/* 添加列弹窗 */}
      <AddColumnModal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        onAdd={handleAddColumn}
        existingFields={localCustomFields}
      />

      {/* 补充数据弹窗：按 ASIN 匹配，可上传销售数据或品牌/排名等 */}
      <DataUploadModal
        isOpen={isDataUploadOpen}
        onClose={() => setIsDataUploadOpen(false)}
        onUpload={handleDataUpload}
      />

      {/* 编辑产品弹窗 */}
      <ProductEditModal
        product={editingProduct}
        onSave={handleProductSave}
        onClose={() => setEditingProduct(null)}
      />

      {/* 删除产品确认弹窗 */}
      {deleteConfirmProductId && (
        <ConfirmDialog
          title="删除产品"
          message="确定要从当前产品库中移除此产品吗？"
          confirmText="删除"
          cancelText="取消"
          confirmVariant="destructive"
          onConfirm={() => handleProductDelete(deleteConfirmProductId)}
          onCancel={() => setDeleteConfirmProductId(null)}
        />
      )}

      {/* 删除自定义列确认弹窗 */}
      {deleteConfirmColumnId && (() => {
        const field = localCustomFields.find(f => f.id === deleteConfirmColumnId);
        const fieldName = field?.name || deleteConfirmColumnId;
        return (
          <ConfirmDialog
            title="删除自定义列"
            message={`确定要删除自定义列"${fieldName}"吗？删除后该列的所有数据将被清除。`}
            confirmText="删除"
            cancelText="取消"
            confirmVariant="destructive"
            onConfirm={() => confirmDeleteColumn(deleteConfirmColumnId)}
            onCancel={() => setDeleteConfirmColumnId(null)}
          />
        );
      })()}
    </div>
  );
}
