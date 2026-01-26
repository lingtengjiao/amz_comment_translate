/**
 * 产品数据表格视图组件
 * 提供表格形式的数据管理界面，支持：
 * 1. 查看和编辑产品基础数据
 * 2. 管理月度销量数据
 * 3. 管理自定义标签/列
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  X, Plus, Trash2, ChevronDown, ChevronUp, ExternalLink,
  Save, Search, Maximize2
} from 'lucide-react';
import { toast } from 'sonner';
import { Product } from './ProductCard';
import apiService, { CustomFieldDefinition } from '../../../api/service';

interface ProductDataTableProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  collectionId: string;
  customFields: CustomFieldDefinition[];
  onProductsUpdate: (products: Product[]) => void;
  onCustomFieldsUpdate: (fields: CustomFieldDefinition[]) => void;
}

// 扩展 Product 类型以包含新字段
interface ExtendedProduct extends Product {
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

    // 检查是否重名
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

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[450px] p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">添加自定义列</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
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
    </div>,
    document.body
  );
}

// 可编辑单元格组件
interface EditableCellProps {
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
}

function EditableCell({ value, onChange, type = 'text', options, placeholder }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));

  const handleBlur = () => {
    setIsEditing(false);
    const newValue = type === 'number' ? (editValue ? Number(editValue) : 0) : editValue;
    if (newValue !== value) {
      onChange(newValue);
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

export function ProductDataTable({
  isOpen,
  onClose,
  products,
  collectionId,
  customFields,
  onProductsUpdate,
  onCustomFieldsUpdate,
}: ProductDataTableProps) {
  const navigate = useNavigate();
  const [localProducts, setLocalProducts] = useState<ExtendedProduct[]>([]);
  const [localCustomFields, setLocalCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, Partial<ExtendedProduct>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  // 获取所有月度销量的月份列表
  const monthColumns = useMemo(() => {
    const months = new Set<string>();
    localProducts.forEach(p => {
      if (p.monthly_sales) {
        Object.keys(p.monthly_sales).forEach(m => months.add(m));
      }
    });
    return Array.from(months).sort();
  }, [localProducts]);

  // 初始化本地数据
  useEffect(() => {
    if (isOpen) {
      setLocalProducts(products.map(p => ({
        ...p,
        monthly_sales: (p as any).monthly_sales || {},
        custom_tags: (p as any).custom_tags || {},
      })));
      setLocalCustomFields(customFields || []);
      setPendingChanges(new Map());
    }
  }, [isOpen, products, customFields]);

  // 过滤和排序产品
  const filteredProducts = useMemo(() => {
    let result = [...localProducts];

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.asin.toLowerCase().includes(term) ||
        p.title.toLowerCase().includes(term) ||
        (p.brand && p.brand.toLowerCase().includes(term))
      );
    }

    // 排序
    if (sortConfig) {
      result.sort((a, b) => {
        let aVal: any = (a as any)[sortConfig.key];
        let bVal: any = (b as any)[sortConfig.key];

        // 处理自定义标签
        if (sortConfig.key.startsWith('tag_')) {
          const fieldId = sortConfig.key.replace('tag_', '');
          aVal = a.custom_tags?.[fieldId] || '';
          bVal = b.custom_tags?.[fieldId] || '';
        }

        // 处理月度销量
        if (sortConfig.key.startsWith('month_')) {
          const month = sortConfig.key.replace('month_', '');
          aVal = a.monthly_sales?.[month] || 0;
          bVal = b.monthly_sales?.[month] || 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [localProducts, searchTerm, sortConfig]);

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

      // 处理自定义标签
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

      // 处理月度销量
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

      // 处理普通字段
      return { ...p, [field]: value };
    }));

    // 记录待保存的更改
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

  // 添加自定义列
  const handleAddColumn = useCallback(async (field: CustomFieldDefinition) => {
    const newFields = [...localCustomFields, field];
    setLocalCustomFields(newFields);
    
    try {
      await apiService.saveCustomFields(collectionId, newFields);
      onCustomFieldsUpdate(newFields);
      toast.success('自定义列已添加');
    } catch (err) {
      console.error('保存自定义字段失败:', err);
      toast.error('保存失败');
      setLocalCustomFields(localCustomFields);
    }
  }, [collectionId, localCustomFields, onCustomFieldsUpdate]);

  // 删除自定义列
  const handleDeleteColumn = useCallback(async (fieldId: string) => {
    const newFields = localCustomFields.filter(f => f.id !== fieldId);
    setLocalCustomFields(newFields);
    
    try {
      await apiService.saveCustomFields(collectionId, newFields);
      onCustomFieldsUpdate(newFields);
      toast.success('自定义列已删除');
    } catch (err) {
      console.error('删除自定义字段失败:', err);
      toast.error('删除失败');
      setLocalCustomFields(localCustomFields);
    }
  }, [collectionId, localCustomFields, onCustomFieldsUpdate]);

  // 保存所有更改
  const handleSaveAll = useCallback(async () => {
    if (pendingChanges.size === 0) {
      toast.info('没有需要保存的更改');
      return;
    }

    setIsSaving(true);
    try {
      // 准备批量更新数据
      const updates: Array<{ product_id: string; custom_tags: Record<string, string> }> = [];
      const productUpdates: Array<any> = [];

      pendingChanges.forEach((changes, productId) => {
        const product = localProducts.find(p => p.id === productId);
        if (!product) return;

        // 如果有标签更改
        if (changes.custom_tags) {
          updates.push({
            product_id: productId,
            custom_tags: changes.custom_tags,
          });
        }

        // 如果有其他字段更改（API 使用 snake_case）
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
        if ((changes as any).salesCount !== undefined) {
          const v = (changes as any).salesCount;
          otherChanges.sales_volume_manual = typeof v === 'number' ? v : (v === '' ? null : parseInt(String(v), 10));
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

      // 批量更新标签
      if (updates.length > 0) {
        await apiService.batchUpdateProductTags(collectionId, updates);
      }

      // 批量更新产品数据
      if (productUpdates.length > 0) {
        await apiService.batchUpdateCollectionProducts(collectionId, productUpdates);
      }

      // 更新父组件
      onProductsUpdate(localProducts as Product[]);
      setPendingChanges(new Map());
      toast.success(`成功保存 ${pendingChanges.size} 个产品的更改`);
    } catch (err) {
      console.error('保存失败:', err);
      toast.error('保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, localProducts, collectionId, onProductsUpdate]);

  // 渲染排序图标
  const renderSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">数据表格</h2>
            <span className="text-sm text-gray-500">
              共 {localProducts.length} 个产品
              {pendingChanges.size > 0 && (
                <span className="ml-2 text-rose-500">
                  ({pendingChanges.size} 个待保存)
                </span>
              )}
            </span>
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
                className="pl-9 pr-4 py-2 w-64 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>

            {/* 添加列按钮 */}
            <button
              onClick={() => setIsAddColumnOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              添加列
            </button>

            {/* 进入完整页面按钮 */}
            <button
              onClick={() => {
                onClose();
                navigate(`/product-board/${collectionId}/data-table`);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg"
              style={{ backgroundColor: '#3B82F6' }}
              title="在新页面中打开完整表格"
            >
              <Maximize2 className="w-4 h-4" />
              完整页面
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

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* 表格区域 */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {/* 固定列 */}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r bg-gray-50 sticky left-0 z-20 w-12">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-20">
                  图片
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-28"
                  onClick={() => handleSort('asin')}
                >
                  <div className="flex items-center gap-1">
                    ASIN {renderSortIcon('asin')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 min-w-[200px]"
                  onClick={() => handleSort('title')}
                >
                  <div className="flex items-center gap-1">
                    标题 {renderSortIcon('title')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-20"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center gap-1">
                    价格 {renderSortIcon('price')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-16"
                  onClick={() => handleSort('rating')}
                >
                  <div className="flex items-center gap-1">
                    评分 {renderSortIcon('rating')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-20"
                  onClick={() => handleSort('reviewCount')}
                >
                  <div className="flex items-center gap-1">
                    评论数 {renderSortIcon('reviewCount')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-20"
                  onClick={() => handleSort('salesCount')}
                >
                  <div className="flex items-center gap-1">
                    销量 {renderSortIcon('salesCount')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-16"
                  onClick={() => handleSort('year')}
                >
                  <div className="flex items-center gap-1">
                    年份 {renderSortIcon('year')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-24"
                  onClick={() => handleSort('brand')}
                >
                  <div className="flex items-center gap-1">
                    品牌 {renderSortIcon('brand')}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-20"
                >
                  大类BSR
                </th>
                <th 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-20"
                >
                  小类BSR
                </th>

                {/* 月度销量列 */}
                {monthColumns.map(month => (
                  <th 
                    key={month}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-24 bg-blue-50"
                    onClick={() => handleSort(`month_${month}`)}
                  >
                    <div className="flex items-center gap-1">
                      {month} {renderSortIcon(`month_${month}`)}
                    </div>
                  </th>
                ))}

                {/* 自定义标签列 */}
                {localCustomFields.map(field => (
                  <th 
                    key={field.id}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b cursor-pointer hover:bg-gray-100 w-28 bg-purple-50 group"
                    onClick={() => handleSort(`tag_${field.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {field.name} {renderSortIcon(`tag_${field.id}`)}
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteColumn(field.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded"
                        title="删除此列"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product, index) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  {/* 序号 */}
                  <td className="px-3 py-2 text-sm text-gray-500 border-r bg-gray-50 sticky left-0">
                    {index + 1}
                  </td>
                  {/* 图片：方形容器内 object-cover 铺满且不变形 */}
                  <td className="px-3 py-2 w-20 p-1 align-middle">
                    <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 flex shrink-0">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=N/A';
                        }}
                      />
                    </div>
                  </td>
                  {/* ASIN */}
                  <td className="px-3 py-2 text-sm">
                    <a
                      href={product.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {product.asin}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  {/* 标题 */}
                  <td className="px-3 py-2 text-sm text-gray-900 max-w-[300px] truncate" title={product.title}>
                    {product.title}
                  </td>
                  {/* 价格 */}
                  <td className="px-3 py-2 text-sm font-medium" style={{ color: '#FF1B82' }}>
                    {product.price}
                  </td>
                  {/* 评分 */}
                  <td className="px-3 py-2 text-sm text-gray-900">
                    {product.rating.toFixed(1)}
                  </td>
                  {/* 评论数 */}
                  <td className="px-3 py-2 text-sm text-gray-900">
                    {product.reviewCount.toLocaleString()}
                  </td>
                  {/* 销量 */}
                  <td className="px-3 py-2">
                    <EditableCell
                      value={product.salesVolumeManual || product.salesCount}
                      onChange={v => updateProduct(product.id, 'salesCount', v)}
                      type="number"
                    />
                  </td>
                  {/* 年份 */}
                  <td className="px-3 py-2">
                    <EditableCell
                      value={product.year || ''}
                      onChange={v => updateProduct(product.id, 'year', v)}
                      type="number"
                      placeholder="年份"
                    />
                  </td>
                  {/* 品牌 */}
                  <td className="px-3 py-2">
                    <EditableCell
                      value={product.brand || ''}
                      onChange={v => updateProduct(product.id, 'brand', v)}
                      placeholder="品牌"
                    />
                  </td>
                  {/* 大类BSR */}
                  <td className="px-3 py-2">
                    <EditableCell
                      value={product.majorCategoryRank ?? ''}
                      onChange={v => updateProduct(product.id, 'majorCategoryRank', typeof v === 'string' && v.trim() === '' ? undefined : (typeof v === 'number' ? v : Number(v)))}
                      type="number"
                      placeholder="大类BSR"
                    />
                  </td>
                  {/* 小类BSR */}
                  <td className="px-3 py-2">
                    <EditableCell
                      value={product.minorCategoryRank ?? ''}
                      onChange={v => updateProduct(product.id, 'minorCategoryRank', typeof v === 'string' && v.trim() === '' ? undefined : (typeof v === 'number' ? v : Number(v)))}
                      type="number"
                      placeholder="小类BSR"
                    />
                  </td>

                  {/* 月度销量 */}
                  {monthColumns.map(month => (
                    <td key={month} className="px-3 py-2 bg-blue-50/30">
                      <EditableCell
                        value={product.monthly_sales?.[month] || ''}
                        onChange={v => updateProduct(product.id, `month_${month}`, v)}
                        type="number"
                        placeholder="0"
                      />
                    </td>
                  ))}

                  {/* 自定义标签 */}
                  {localCustomFields.map(field => (
                    <td key={field.id} className="px-3 py-2 bg-purple-50/30">
                      <EditableCell
                        value={product.custom_tags?.[field.id] || ''}
                        onChange={v => updateProduct(product.id, `tag_${field.id}`, v)}
                        type={field.type}
                        options={field.options}
                        placeholder={field.name}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
          显示 {filteredProducts.length} / {localProducts.length} 个产品
          {monthColumns.length > 0 && ` | ${monthColumns.length} 个月度销量列`}
          {localCustomFields.length > 0 && ` | ${localCustomFields.length} 个自定义列`}
        </div>
      </div>

      {/* 添加列弹窗 */}
      <AddColumnModal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        onAdd={handleAddColumn}
        existingFields={localCustomFields}
      />
    </div>,
    document.body
  );
}
