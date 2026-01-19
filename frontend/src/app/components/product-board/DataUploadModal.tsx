import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface DataUploadResult {
  asin: string;
  brand?: string;
  year?: number;
  salesCount?: number;  // 月销量 → sales_volume_manual
  majorCategoryRank?: number;  // 大类BSR
  minorCategoryRank?: number;  // 小类BSR
  majorCategoryName?: string;  // 大类目
  minorCategoryName?: string;  // 小类目
}

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: DataUploadResult[]) => void;
}

type UploadStatus = 'idle' | 'parsing' | 'success' | 'error';

export function DataUploadModal({ isOpen, onClose, onUpload }: DataUploadModalProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState('');
  const [parsedCount, setParsedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const parseFile = async (file: File): Promise<DataUploadResult[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          const results: DataUploadResult[] = [];

          for (const row of jsonData as Record<string, unknown>[]) {
            // 支持多种列名（兼容卖家精灵、Sorftime 等工具导出格式）
            const asin = (row['ASIN'] || row['asin']) as string;
            if (!asin) continue;

            // 品牌
            const brand = (row['品牌'] || row['brand'] || row['Brand']) as string;
            
            // 上架时间（支持日期格式 "2024-10-24" 或纯年份）
            const yearRaw = (row['上架时间'] || row['year'] || row['Year'] || row['年份']) as string | number;
            let year: number | undefined;
            if (yearRaw) {
              const yearStr = String(yearRaw);
              if (yearStr.includes('-')) {
                // 日期格式，提取年份
                year = parseInt(yearStr.split('-')[0]);
              } else {
                year = parseInt(yearStr);
              }
            }
            
            // 月销量
            const salesStr = (row['月销量'] || row['sales'] || row['Sales'] || row['salescount'] || row['SalesCount'] || row['销量']) as string | number;
            const salesCount = salesStr ? parseInt(String(salesStr).replace(/,/g, '')) : undefined;
            
            // 大类BSR（大类排名）
            const majorCategoryRankStr = (row['大类BSR'] || row['major_category_rank']) as string | number;
            const majorCategoryRank = majorCategoryRankStr ? parseInt(String(majorCategoryRankStr).replace(/,/g, '')) : undefined;
            
            // 小类BSR（小类排名）
            const minorCategoryRankStr = (row['小类BSR'] || row['minor_category_rank']) as string | number;
            const minorCategoryRank = minorCategoryRankStr ? parseInt(String(minorCategoryRankStr).replace(/,/g, '')) : undefined;
            
            // 大类目名称
            const majorCategoryName = (row['大类目'] || row['major_category_name']) as string;
            
            // 小类目名称
            const minorCategoryName = (row['小类目'] || row['minor_category_name']) as string;

            results.push({
              asin: String(asin).trim(),
              brand: brand ? String(brand).trim() : undefined,
              year: year && !isNaN(year) ? year : undefined,
              salesCount: salesCount && !isNaN(salesCount) ? salesCount : undefined,
              majorCategoryRank: majorCategoryRank && !isNaN(majorCategoryRank) ? majorCategoryRank : undefined,
              minorCategoryRank: minorCategoryRank && !isNaN(minorCategoryRank) ? minorCategoryRank : undefined,
              majorCategoryName: majorCategoryName ? String(majorCategoryName).trim() : undefined,
              minorCategoryName: minorCategoryName ? String(minorCategoryName).trim() : undefined,
            });
          }

          resolve(results);
        } catch (err) {
          reject(new Error('文件解析失败，请检查文件格式'));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsBinaryString(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    // 检查文件类型
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (!validTypes.includes(file.type) && !['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setStatus('error');
      setMessage('仅支持 CSV 或 Excel 文件格式');
      return;
    }

    setStatus('parsing');
    setMessage('正在解析文件...');

    try {
      const results = await parseFile(file);
      
      if (results.length === 0) {
        setStatus('error');
        setMessage('文件中没有找到有效数据，请确保包含 ASIN 列');
        return;
      }

      setParsedCount(results.length);
      setStatus('success');
      setMessage(`成功解析 ${results.length} 条数据`);
      
      // 延迟关闭并上传数据
      setTimeout(() => {
        onUpload(results);
        resetState();
      }, 1500);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '文件解析失败');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const resetState = () => {
    setStatus('idle');
    setMessage('');
    setParsedCount(0);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={handleClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">补充数据</h2>
              <p className="text-sm text-gray-500">上传 CSV/Excel 文件批量更新产品数据</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging
                ? 'border-[#FF1B82] bg-rose-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {status === 'idle' && (
              <>
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2">拖拽文件到此处，或</p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span 
                    className="inline-block px-4 py-2 rounded-full text-white cursor-pointer transition-all hover:shadow-lg"
                    style={{ backgroundColor: '#FF1B82' }}
                  >
                    选择文件
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-4">支持 CSV、Excel 格式</p>
              </>
            )}

            {status === 'parsing' && (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin mb-4" />
                <p className="text-gray-600">{message}</p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center">
                <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                <p className="text-green-600 font-medium">{message}</p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-600">{message}</p>
                <button
                  onClick={resetState}
                  className="mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  重试
                </button>
              </div>
            )}
          </div>

          {/* Simple Instruction */}
          <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm text-blue-900">
              上传卖家精灵、Sorftime 等工具导出的数据文件，系统会根据 ASIN 自动匹配并更新产品信息
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end p-6 border-t border-gray-100">
          <button
            onClick={handleClose}
            className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
