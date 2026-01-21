/**
 * 产品表单弹窗组件
 */
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { ProductData } from './useProfitCalculator';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<ProductData, 'id' | 'calculation'>) => void;
  product?: ProductData | null;
  categories: string[];
}

export function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  product,
  categories,
}: ProductFormModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    length_cm: '',
    width_cm: '',
    height_cm: '',
    weight_g: '',
    selling_price_usd: '',
    total_cost_cny: '',
    category: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // 当 product 变化时，填充表单
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        length_cm: product.length_cm.toString(),
        width_cm: product.width_cm.toString(),
        height_cm: product.height_cm.toString(),
        weight_g: product.weight_g.toString(),
        selling_price_usd: product.selling_price_usd.toString(),
        total_cost_cny: product.total_cost_cny.toString(),
        category: product.category || '__default__',
        notes: product.notes || '',
      });
    } else {
      setFormData({
        name: '',
        length_cm: '',
        width_cm: '',
        height_cm: '',
        weight_g: '',
        selling_price_usd: '',
        total_cost_cny: '',
        category: '__default__',
        notes: '',
      });
    }
  }, [product, isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // 验证必填字段
    if (!formData.name.trim()) {
      alert('请输入产品名称');
      return;
    }
    if (!formData.length_cm || !formData.width_cm || !formData.height_cm) {
      alert('请输入产品尺寸');
      return;
    }
    if (!formData.weight_g) {
      alert('请输入产品重量');
      return;
    }
    if (!formData.selling_price_usd) {
      alert('请输入预期售价');
      return;
    }
    if (!formData.total_cost_cny) {
      alert('请输入总成本');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: formData.name.trim(),
        length_cm: parseFloat(formData.length_cm),
        width_cm: parseFloat(formData.width_cm),
        height_cm: parseFloat(formData.height_cm),
        weight_g: parseFloat(formData.weight_g),
        selling_price_usd: parseFloat(formData.selling_price_usd),
        total_cost_cny: parseFloat(formData.total_cost_cny),
        category: formData.category && formData.category !== '__default__' ? formData.category : undefined,
        notes: formData.notes || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{product ? '编辑产品' : '添加产品'}</DialogTitle>
          <DialogDescription>
            输入产品信息进行毛利计算
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* 产品名称 */}
          <div className="grid gap-2">
            <Label htmlFor="modal-name">产品名称 *</Label>
            <Input
              id="modal-name"
              placeholder="输入产品名称"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
            />
          </div>

          {/* 尺寸 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="modal-length">长(cm) *</Label>
              <Input
                id="modal-length"
                type="number"
                placeholder="长"
                value={formData.length_cm}
                onChange={(e) => handleInputChange('length_cm', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modal-width">宽(cm) *</Label>
              <Input
                id="modal-width"
                type="number"
                placeholder="宽"
                value={formData.width_cm}
                onChange={(e) => handleInputChange('width_cm', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modal-height">高(cm) *</Label>
              <Input
                id="modal-height"
                type="number"
                placeholder="高"
                value={formData.height_cm}
                onChange={(e) => handleInputChange('height_cm', e.target.value)}
              />
            </div>
          </div>

          {/* 重量 */}
          <div className="grid gap-2">
            <Label htmlFor="modal-weight">重量(克) *</Label>
            <Input
              id="modal-weight"
              type="number"
              placeholder="产品重量（克）"
              value={formData.weight_g}
              onChange={(e) => handleInputChange('weight_g', e.target.value)}
            />
          </div>

          {/* 售价和成本 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="modal-price">预期售价(USD) *</Label>
              <Input
                id="modal-price"
                type="number"
                placeholder="售价"
                value={formData.selling_price_usd}
                onChange={(e) => handleInputChange('selling_price_usd', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modal-cost">总成本(CNY) *</Label>
              <Input
                id="modal-cost"
                type="number"
                placeholder="成本"
                value={formData.total_cost_cny}
                onChange={(e) => handleInputChange('total_cost_cny', e.target.value)}
              />
            </div>
          </div>

          {/* 类目 */}
          <div className="grid gap-2">
            <Label htmlFor="modal-category">产品类目</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => handleInputChange('category', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择类目（影响佣金比例）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">默认 (15%)</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 备注 */}
          <div className="grid gap-2">
            <Label htmlFor="modal-notes">备注</Label>
            <Textarea
              id="modal-notes"
              placeholder="添加备注（可选）"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-rose-500 hover:bg-rose-600"
          >
            {saving ? '保存中...' : (product ? '更新' : '添加')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
