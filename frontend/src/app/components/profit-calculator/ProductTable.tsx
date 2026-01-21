/**
 * 产品列表表格组件
 */
import { Package, Edit2, Trash2, TrendingUp, TrendingDown, Anchor, Ship, Plane } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import type { ProductData } from './useProfitCalculator';

interface ProductTableProps {
  products: ProductData[];
  loading: boolean;
  onEdit: (product: ProductData) => void;
  onDelete: (productId: string) => void;
}

export function ProductTable({ products, loading, onEdit, onDelete }: ProductTableProps) {
  const getProfitColor = (margin: number) => {
    if (margin >= 20) return 'text-green-600 bg-green-50';
    if (margin >= 10) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatDimensions = (product: ProductData) => {
    return `${product.length_cm}×${product.width_cm}×${product.height_cm}`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <Package className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-600">暂无产品</h3>
          <p className="text-sm text-slate-500 mt-1">
            使用左侧计算器添加产品，或点击"添加产品"按钮
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-rose-500" />
            产品列表
          </span>
          <span className="text-sm font-normal text-slate-500">
            共 {products.length} 个产品
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">产品名称</TableHead>
                <TableHead className="text-center">尺寸(cm)</TableHead>
                <TableHead className="text-center">重量(g)</TableHead>
                <TableHead className="text-center">售价($)</TableHead>
                <TableHead className="text-center">成本(¥)</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Anchor className="w-3 h-3 text-blue-600" />
                    普海利润
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Ship className="w-3 h-3 text-purple-600" />
                    美森利润
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Plane className="w-3 h-3 text-orange-600" />
                    空运利润
                  </div>
                </TableHead>
                <TableHead className="text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const calc = product.calculation;
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-slate-900 truncate max-w-[150px]" title={product.name}>
                          {product.name}
                        </div>
                        {product.category && (
                          <div className="text-xs text-slate-500">{product.category}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600">
                      {formatDimensions(product)}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600">
                      {product.weight_g}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      ${product.selling_price_usd}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      ¥{product.total_cost_cny}
                    </TableCell>
                    
                    {/* 普海利润 */}
                    <TableCell className="text-center">
                      {calc ? (
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getProfitColor(calc.sea_standard_profit_margin)}`}>
                          {calc.sea_standard_profit_margin >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {calc.sea_standard_profit_margin.toFixed(1)}%
                        </div>
                      ) : '-'}
                    </TableCell>
                    
                    {/* 美森利润 */}
                    <TableCell className="text-center">
                      {calc ? (
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getProfitColor(calc.sea_express_profit_margin)}`}>
                          {calc.sea_express_profit_margin >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {calc.sea_express_profit_margin.toFixed(1)}%
                        </div>
                      ) : '-'}
                    </TableCell>
                    
                    {/* 空运利润 */}
                    <TableCell className="text-center">
                      {calc ? (
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getProfitColor(calc.air_profit_margin)}`}>
                          {calc.air_profit_margin >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {calc.air_profit_margin.toFixed(1)}%
                        </div>
                      ) : '-'}
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(product)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>
                                确定要删除产品 "{product.name}" 吗？此操作无法撤销。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(product.id)}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
