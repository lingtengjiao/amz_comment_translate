/**
 * 产品分类画板主组件
 * 1:1 还原设计稿，支持六大视图模式、拖拽分类、颜色透视等功能
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'sonner';
import { 
  Plus, CheckSquare, X, LayoutGrid, DollarSign, Settings, 
  TrendingUp, ArrowUpDown, Calendar, Tag, Trophy, Upload, 
  Palette, ArrowLeft, Loader2, BarChart3, Share2
} from 'lucide-react';
import { ShareButton } from '../share/ShareButton';
import { Product } from './ProductCard';
import { DraggableBoard } from './DraggableBoard';
import { PriceRangeSettings, PriceRange } from './PriceRangeSettings';
import { SalesRangeSettings, SalesRange } from './SalesRangeSettings';
import { YearRangeSettings, YearRange } from './YearRangeSettings';
import { BrandRangeSettings, BrandRange } from './BrandRangeSettings';
import { RankingSettings, RankingMetric, RankingRange } from './RankingSettings';
import { ProductEditModal } from './ProductEditModal';
import { DataUploadModal, DataUploadResult } from './DataUploadModal';
import { ColorPerspectiveSettings, ColorRule } from './ColorPerspectiveSettings';
import { CollectionDetailDialog } from '../home/dialogs/CollectionDetailDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import apiService, { type KeywordCollection } from '../../../api/service';

interface BoardData {
  id: string;
  name: string;
}

type ViewMode = 'custom' | 'price' | 'sales' | 'year' | 'brand' | 'ranking';

// 默认价格段配置
const defaultPriceRanges: PriceRange[] = [
  { id: 'price-0-50', name: '$0-50', min: 0, max: 50 },
  { id: 'price-50-100', name: '$50-100', min: 50, max: 100 },
  { id: 'price-100-200', name: '$100-200', min: 100, max: 200 },
  { id: 'price-200-plus', name: '$200+', min: 200, max: Infinity },
];

// 默认销量段配置
const defaultSalesRanges: SalesRange[] = [
  { id: 'sales-0-1000', name: '<1000', min: 0, max: 1000 },
  { id: 'sales-1000-5000', name: '1000-5000', min: 1000, max: 5000 },
  { id: 'sales-5000-10000', name: '5000-10000', min: 5000, max: 10000 },
  { id: 'sales-10000-plus', name: '>10000', min: 10000, max: Infinity },
];

// 默认年份段配置（一年一个组，从2020到当前年份）
const getDefaultYearRanges = (): YearRange[] => {
  const currentYear = new Date().getFullYear();
  const ranges: YearRange[] = [];
  for (let year = 2020; year <= currentYear; year++) {
    ranges.push({
      id: `year-${year}`,
      name: String(year),
      min: year,
      max: year,
    });
  }
  return ranges;
};
const defaultYearRanges = getDefaultYearRanges();

// 默认品牌段配置
const defaultBrandRanges: BrandRange[] = [
  { id: 'brand-other', name: '其他品牌', brands: [] },
];

// 默认排名段配置
const defaultRankingRanges: RankingRange[] = [
  { id: 'rank-1-1000', name: '1～1000', min: 1, max: 1000 },
  { id: 'rank-1000-5000', name: '1000～5000', min: 1000, max: 5000 },
  { id: 'rank-5000-10000', name: '5000～10000', min: 5000, max: 10000 },
  { id: 'rank-10000-20000', name: '10000～20000', min: 10000, max: 20000 },
  { id: 'rank-20000-plus', name: '20000以上', min: 20000, max: Infinity },
];

export function ProductBoardSection() {
  const { collectionId } = useParams<{ collectionId?: string }>();
  const navigate = useNavigate();

  // 加载状态
  const [loading, setLoading] = useState(true);
  const [collectionInfo, setCollectionInfo] = useState<{ keyword: string; marketplace: string | null } | null>(null);
  const [fullCollection, setFullCollection] = useState<KeywordCollection | null>(null);
  
  // 详情弹窗状态
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>('custom');
  
  // 画板数据
  const [boards, setBoards] = useState<BoardData[]>([
    { id: 'default', name: '默认画板' },
  ]);

  // 产品数据状态
  const [products, setProducts] = useState<Product[]>([]);

  // 产品画板映射
  const [productBoards, setProductBoards] = useState<Record<string, string>>({});

  // 价格区间状态
  const [priceRanges, setPriceRanges] = useState<PriceRange[]>(defaultPriceRanges);
  const [isPriceSettingsOpen, setIsPriceSettingsOpen] = useState(false);

  // 销量区间状态
  const [salesRanges, setSalesRanges] = useState<SalesRange[]>(defaultSalesRanges);
  const [isSalesSettingsOpen, setIsSalesSettingsOpen] = useState(false);

  // 年份区间状态
  const [yearRanges, setYearRanges] = useState<YearRange[]>(defaultYearRanges);
  const [isYearSettingsOpen, setIsYearSettingsOpen] = useState(false);

  // 品牌区间状态
  const [brandRanges, setBrandRanges] = useState<BrandRange[]>(defaultBrandRanges);
  const [isBrandSettingsOpen, setIsBrandSettingsOpen] = useState(false);

  // 排名设置状态
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>('major');
  const [rankingRanges, setRankingRanges] = useState<RankingRange[]>(defaultRankingRanges);
  const [isRankingSettingsOpen, setIsRankingSettingsOpen] = useState(false);

  // 数据上传状态
  const [isDataUploadOpen, setIsDataUploadOpen] = useState(false);

  // 默认颜色规则
  const defaultColorRule: ColorRule = {
    id: 'default-rule-1',
    name: '新品爆款',
    color: '#10b981',
    conditions: [
      { id: 'cond-1', field: 'year', operator: 'gte', value: 2024 },
      { id: 'cond-2', field: 'sales', operator: 'gt', value: 5000 },
    ],
    matchAll: true,
  };

  // 颜色透视状态
  const [colorRules, setColorRules] = useState<ColorRule[]>([defaultColorRule]);
  const [isColorPerspectiveEnabled, setIsColorPerspectiveEnabled] = useState(false);
  const [isColorPerspectiveSettingsOpen, setIsColorPerspectiveSettingsOpen] = useState(false);

  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  
  // 删除画板确认对话框状态
  const [deleteBoardId, setDeleteBoardId] = useState<string | null>(null);

  // 产品编辑状态
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // 批量操作相关状态
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [targetBoardId, setTargetBoardId] = useState<string>('');

  // 画板排序状态
  type BoardSortOption = 'custom' | 'name-asc' | 'name-desc' | 'count-asc' | 'count-desc' | 'avgPrice-asc' | 'avgPrice-desc';
  const [boardSortBy, setBoardSortBy] = useState<BoardSortOption>('custom');

  // 防止初始加载时保存
  const isInitialLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const viewModeLoadedRef = useRef(false);  // 跟踪 viewMode 是否已从数据库加载
  const savedViewModeRef = useRef<ViewMode>('custom');  // 存储从数据库加载的 viewMode

  // 加载产品数据
  useEffect(() => {
    if (collectionId) {
      loadCollectionData(collectionId);
    }
  }, [collectionId]);

  // 自动保存画板配置（防抖）
  useEffect(() => {
    // 跳过初始加载
    if (isInitialLoadRef.current) {
      return;
    }

    if (!collectionId) {
      return;
    }

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 防抖保存（1秒后保存）
    // 分别保存画板配置和视图配置
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // 保存画板配置（画板顺序和产品映射）
        const boardsToSave = boards;
        const productBoardsToSave = viewMode === 'custom' ? productBoards : {};
        await apiService.saveBoardConfig(
          collectionId, 
          boardsToSave, 
          productBoardsToSave
        );
        console.log('[ProductBoard] 画板配置已自动保存');

        // 保存视图配置（视图模式、颜色规则、年份、排名等）
        // 使用 savedViewModeRef.current，因为用户切换视图时会立即保存并更新这个值
        // 这样可以避免使用可能还未更新的 viewMode state
        await apiService.saveViewConfig(collectionId, {
          viewMode: savedViewModeRef.current,
          colorRules,
          yearRanges,
          rankingRanges,
          rankingMetric,
          priceRanges,
          salesRanges,
          brandRanges
        });
        console.log('[ProductBoard] 视图配置已自动保存');
      } catch (err) {
        console.error('[ProductBoard] 保存配置失败:', err);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [boards, productBoards, colorRules, yearRanges, rankingRanges, rankingMetric, priceRanges, salesRanges, brandRanges, collectionId]);

  const loadCollectionData = async (id: string) => {
    setLoading(true);
    viewModeLoadedRef.current = false;  // 重置 viewMode 加载标记
    try {
      const collection = await apiService.getKeywordCollectionDetail(id);
      setFullCollection(collection); // 保存完整的 collection 信息用于弹窗
      setCollectionInfo({
        keyword: collection.keyword,
        marketplace: collection.marketplace,
      });

      // 转换产品数据格式
      const convertedProducts: Product[] = (collection.products || []).map((p, index) => ({
        id: p.id || `product-${index}`,
        asin: p.asin,
        title: p.title || p.asin,
        imageUrl: p.image_url || '',
        productUrl: p.product_url || `https://amazon.com/dp/${p.asin}`,
        price: p.price || '$0.00',  // 已经是字符串格式
        rating: p.rating || 0,
        reviewCount: p.review_count || 0,
        salesCount: p.sales_volume || 0,
        salesVolumeManual: p.sales_volume_manual || undefined,  // 补充数据的月销量
        year: p.year || 0,  // 只有在有真实年份数据时才设置，否则为 0
        brand: p.brand || '',  // 使用 brand 字段
        majorCategoryRank: p.major_category_rank || undefined,  // 大类BSR
        minorCategoryRank: p.minor_category_rank || undefined,  // 小类BSR
        majorCategoryName: p.major_category_name || undefined,  // 大类目
        minorCategoryName: p.minor_category_name || undefined,  // 小类目
      }));

      setProducts(convertedProducts);
      
      // 加载已保存的画板配置，或使用默认配置
      if (collection.board_config) {
        // 使用已保存的画板配置
        setBoards(collection.board_config.boards || [{ id: 'default', name: '默认画板' }]);
        setProductBoards(collection.board_config.productBoards || {});
        
        // 确保所有产品都有画板映射
        const savedProductBoards = collection.board_config.productBoards || {};
        const updatedProductBoards: Record<string, string> = {};
        convertedProducts.forEach(p => {
          updatedProductBoards[p.id] = savedProductBoards[p.id] || 'default';
        });
        setProductBoards(updatedProductBoards);
      } else {
        // 初始化默认产品画板映射
        const initialBoards: Record<string, string> = {};
        convertedProducts.forEach(p => {
          initialBoards[p.id] = 'default';
        });
        setProductBoards(initialBoards);
      }

      // 加载视图配置，或使用默认配置
      // 先获取保存的 viewMode，稍后验证是否可用
      let savedViewMode: ViewMode = 'custom';
      let hasSavedBrandRanges = false;
      
      if (collection.view_config) {
        // 加载视图模式
        if (collection.view_config.viewMode) {
          savedViewMode = collection.view_config.viewMode as ViewMode;
        }

        // 加载颜色规则
        // 注意：区分 undefined/null（使用默认值）和空数组（用户明确清空了配置）
        if (collection.view_config.colorRules !== undefined && collection.view_config.colorRules !== null) {
          const loadedRules = collection.view_config.colorRules.length > 0 
            ? collection.view_config.colorRules as ColorRule[]
            : [];  // 用户明确清空了配置，保持空数组
          setColorRules(loadedRules);
        } else {
          setColorRules([defaultColorRule]);  // 第一次加载，使用默认规则
        }

        // 加载年份配置
        if (collection.view_config.yearRanges !== undefined && collection.view_config.yearRanges !== null) {
          setYearRanges(collection.view_config.yearRanges.length > 0 
            ? collection.view_config.yearRanges 
            : []);
        } else {
          setYearRanges(defaultYearRanges);
        }

        // 加载排名配置
        if (collection.view_config.rankingRanges !== undefined && collection.view_config.rankingRanges !== null) {
          setRankingRanges(collection.view_config.rankingRanges.length > 0 
            ? collection.view_config.rankingRanges 
            : []);
        } else {
          setRankingRanges(defaultRankingRanges);
        }
        if (collection.view_config.rankingMetric) {
          setRankingMetric(collection.view_config.rankingMetric);
        }

        // 加载价格配置
        if (collection.view_config.priceRanges !== undefined && collection.view_config.priceRanges !== null) {
          setPriceRanges(collection.view_config.priceRanges.length > 0 
            ? collection.view_config.priceRanges 
            : []);
        }

        // 加载销量配置
        if (collection.view_config.salesRanges !== undefined && collection.view_config.salesRanges !== null) {
          setSalesRanges(collection.view_config.salesRanges.length > 0 
            ? collection.view_config.salesRanges 
            : []);
        }

        // 加载品牌配置
        if (collection.view_config.brandRanges !== undefined && collection.view_config.brandRanges !== null) {
          setBrandRanges(collection.view_config.brandRanges);
          hasSavedBrandRanges = true;
        }
      } else {
        // 使用默认视图配置
        setColorRules([defaultColorRule]);
        setYearRanges(defaultYearRanges);
        setRankingRanges(defaultRankingRanges);
      }

      // 只在没有保存的品牌配置时，自动检测品牌
      if (!hasSavedBrandRanges) {
        const detectedBrands = new Set<string>();
        convertedProducts.forEach(p => {
          if (p.brand) detectedBrands.add(p.brand);
        });
        if (detectedBrands.size > 0) {
          setBrandRanges([
            ...Array.from(detectedBrands).map(brand => ({
              id: `brand-${brand.toLowerCase()}`,
              name: brand,
              brands: [brand],
            })),
            { id: 'brand-other', name: '其他品牌', brands: [] },
          ]);
        }
      }
      
      // 检查数据可用性，验证保存的 viewMode 是否可用
      const hasYearDataCheck = convertedProducts.some((p) => p.year && p.year > 0);
      const hasRankingDataCheck = convertedProducts.some((p) => {
        const hasMajorRank = p.majorCategoryRank && p.majorCategoryRank > 0;
        const hasMinorRank = p.minorCategoryRank && p.minorCategoryRank > 0;
        return hasMajorRank || hasMinorRank;
      });
      
      // 如果保存的视图模式不可用（没有对应数据），切换回自定义视图
      // 注意：price、sales、brand 视图不需要数据检查，因为它们总是可用的
      let finalViewMode: ViewMode = savedViewMode;
      if (savedViewMode === 'year' && !hasYearDataCheck) {
        finalViewMode = 'custom';
      } else if (savedViewMode === 'ranking' && !hasRankingDataCheck) {
        finalViewMode = 'custom';
      }
      
      // 存储到 ref，供自动保存使用
      savedViewModeRef.current = finalViewMode;
      // 立即设置 viewMode
      setViewMode(finalViewMode);
      // 标记 viewMode 已加载（在设置后立即标记，因为 React 状态更新是异步的）
      viewModeLoadedRef.current = true;

    } catch (err) {
      toast.error('加载产品数据失败');
      console.error(err);
    } finally {
      setLoading(false);
      // 延迟设置，确保状态更新完成后再开启自动保存
      // 使用 2 秒延迟，确保所有 React 状态更新和副作用都完成
      setTimeout(() => {
        isInitialLoadRef.current = false;
        console.log('[ProductBoard] 初始加载完成，开启自动保存');
      }, 2000);
    }
  };

  const handleDrop = (product: Product, boardId: string) => {
    setProductBoards((prev) => ({
      ...prev,
      [product.id]: boardId,
    }));
  };

  const handleAddBoard = () => {
    if (newBoardName.trim()) {
      const newBoard: BoardData = {
        id: `board-${Date.now()}`,
        name: newBoardName.trim(),
      };
      setBoards([...boards, newBoard]);
      setNewBoardName('');
      setIsAddingBoard(false);
    }
  };

  const handleDeleteBoard = (boardId: string) => {
    setDeleteBoardId(boardId);
  };
  
  const confirmDeleteBoard = () => {
    if (deleteBoardId) {
      setProductBoards((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((productId) => {
          if (updated[productId] === deleteBoardId) {
            updated[productId] = 'default';
          }
        });
        return updated;
      });
      setBoards(boards.filter((b) => b.id !== deleteBoardId));
      setDeleteBoardId(null);
    }
  };

  const handleRenameBoard = (boardId: string, newName: string) => {
    setBoards(
      boards.map((b) => (b.id === boardId ? { ...b, name: newName } : b))
    );
  };

  const getBoardProducts = (boardId: string): Product[] => {
    return products.filter((p) => productBoards[p.id] === boardId);
  };

  // 处理产品选择
  const handleProductSelect = (productId: string) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // 开启批量模式
  const handleEnterBatchMode = () => {
    setIsBatchMode(true);
    setSelectedProducts(new Set());
    setTargetBoardId('');
  };

  // 取消批量模式
  const handleCancelBatchMode = () => {
    setIsBatchMode(false);
    setSelectedProducts(new Set());
    setTargetBoardId('');
  };

  // 批量移动产品
  const handleBatchMove = () => {
    if (!targetBoardId || selectedProducts.size === 0) {
      return;
    }

    setProductBoards((prev) => {
      const updated = { ...prev };
      selectedProducts.forEach((productId) => {
        updated[productId] = targetBoardId;
      });
      return updated;
    });

    setSelectedProducts(new Set());
    setIsBatchMode(false);
    setTargetBoardId('');
  };

  // ========== 缓存各视图模式的产品分组 ==========
  
  // 缓存价格分组（依赖: products, priceRanges）
  const priceRangeProductsCache = useMemo(() => {
    const cache: Record<string, Product[]> = {};
    priceRanges.forEach(range => {
      cache[range.id] = products.filter((p) => {
        const priceNum = parseFloat(p.price.replace(/[^0-9.]/g, ''));
        return priceNum >= range.min && priceNum < range.max;
      });
    });
    console.log('[ProductBoard] 价格分组缓存已更新');
    return cache;
  }, [products, priceRanges]);

  // 缓存销量分组（依赖: products, salesRanges）
  const salesRangeProductsCache = useMemo(() => {
    const cache: Record<string, Product[]> = {};
    salesRanges.forEach(range => {
      cache[range.id] = products.filter((p) => {
        return p.salesCount >= range.min && p.salesCount < range.max;
      });
    });
    console.log('[ProductBoard] 销量分组缓存已更新');
    return cache;
  }, [products, salesRanges]);

  // 缓存年份分组（依赖: products, yearRanges）
  const yearRangeProductsCache = useMemo(() => {
    const cache: Record<string, Product[]> = {};
    yearRanges.forEach(range => {
      cache[range.id] = products.filter((p) => {
        return p.year >= range.min && p.year <= range.max;
      });
    });
    console.log('[ProductBoard] 年份分组缓存已更新');
    return cache;
  }, [products, yearRanges]);

  // 缓存品牌分组（依赖: products, brandRanges）
  const brandRangeProductsCache = useMemo(() => {
    const cache: Record<string, Product[]> = {};
    const allBrands = brandRanges.flatMap(r => r.brands);
    brandRanges.forEach(range => {
      if (range.brands.length === 0) {
        // "其他品牌" 分组
        cache[range.id] = products.filter((p) => !allBrands.includes(p.brand));
      } else {
        cache[range.id] = products.filter((p) => range.brands.includes(p.brand));
      }
    });
    console.log('[ProductBoard] 品牌分组缓存已更新');
    return cache;
  }, [products, brandRanges]);

  // 缓存排名分组（依赖: products, rankingRanges, rankingMetric）
  // 基于真实的 BSR 排名数据进行分组（大类BSR 或 小类BSR）
  const rankingRangeProductsCache = useMemo(() => {
    const cache: Record<string, Product[]> = {};
    
    // 根据指标选择排名字段
    const getRank = (p: Product): number | undefined => {
      if (rankingMetric === 'major') {
        return p.majorCategoryRank;
      } else {
        return p.minorCategoryRank;
      }
    };
    
    // 按排名区间分组产品
    rankingRanges.forEach(range => {
      cache[range.id] = products.filter(p => {
        const rank = getRank(p);
        if (!rank || rank <= 0) return false;
        if (range.max === Infinity) {
          return rank >= range.min;
        }
        return rank >= range.min && rank <= range.max;
      });
    });
    
    console.log('[ProductBoard] 排名分组缓存已更新');
    return cache;
  }, [products, rankingRanges, rankingMetric]);

  // 获取价格段产品（使用缓存）
  const getPriceRangeProducts = (rangeId: string): Product[] => {
    return priceRangeProductsCache[rangeId] || [];
  };

  // 获取销量段产品（使用缓存）
  const getSalesRangeProducts = (rangeId: string): Product[] => {
    return salesRangeProductsCache[rangeId] || [];
  };

  // 获取年份段产品（使用缓存）
  const getYearRangeProducts = (rangeId: string): Product[] => {
    return yearRangeProductsCache[rangeId] || [];
  };

  // 获取品牌段产品（使用缓存）
  const getBrandRangeProducts = (rangeId: string): Product[] => {
    return brandRangeProductsCache[rangeId] || [];
  };

  // 获取排名段产品（使用缓存）
  const getRankingRangeProducts = (rangeId: string): Product[] => {
    return rankingRangeProductsCache[rangeId] || [];
  };

  // 根据视图模式获取画板的产品
  const getCurrentBoardProducts = (boardId: string): Product[] => {
    if (viewMode === 'price') {
      return getPriceRangeProducts(boardId);
    } else if (viewMode === 'sales') {
      return getSalesRangeProducts(boardId);
    } else if (viewMode === 'year') {
      return getYearRangeProducts(boardId);
    } else if (viewMode === 'brand') {
      return getBrandRangeProducts(boardId);
    } else if (viewMode === 'ranking') {
      return getRankingRangeProducts(boardId);
    }
    return getBoardProducts(boardId);
  };

  // 根据视图模式获取当前使用的画板列表（缓存）
  const currentBoards = useMemo(() => {
    if (viewMode === 'price') return priceRanges.map(r => ({ id: r.id, name: r.name }));
    if (viewMode === 'sales') return salesRanges.map(r => ({ id: r.id, name: r.name }));
    if (viewMode === 'year') return yearRanges.map(r => ({ id: r.id, name: r.name }));
    if (viewMode === 'brand') {
      // 品牌视图：只显示有产品的品牌子看板
      return brandRanges
        .filter(r => {
          const products = brandRangeProductsCache[r.id] || [];
          return products.length > 0;
        })
        .map(r => ({ id: r.id, name: r.name }));
    }
    if (viewMode === 'ranking') return rankingRanges.map(r => ({ id: r.id, name: r.name }));
    return boards;
  }, [viewMode, priceRanges, salesRanges, yearRanges, brandRanges, rankingRanges, boards, brandRangeProductsCache]);

  // 画板排序逻辑（缓存）
  const sortedBoards = useMemo(() => {
    if (boardSortBy === 'custom') {
      return currentBoards;
    }

    // 获取各画板产品的缓存
    const getBoardProductsCached = (boardId: string): Product[] => {
      if (viewMode === 'price') return priceRangeProductsCache[boardId] || [];
      if (viewMode === 'sales') return salesRangeProductsCache[boardId] || [];
      if (viewMode === 'year') return yearRangeProductsCache[boardId] || [];
      if (viewMode === 'brand') return brandRangeProductsCache[boardId] || [];
      if (viewMode === 'ranking') return rankingRangeProductsCache[boardId] || [];
      return products.filter((p) => productBoards[p.id] === boardId);
    };

    return [...currentBoards].sort((a, b) => {
      const productsA = getBoardProductsCached(a.id);
      const productsB = getBoardProductsCached(b.id);

      if (boardSortBy === 'name-asc') {
        return a.name.localeCompare(b.name, 'zh-CN');
      } else if (boardSortBy === 'name-desc') {
        return b.name.localeCompare(a.name, 'zh-CN');
      } else if (boardSortBy === 'count-asc') {
        return productsA.length - productsB.length;
      } else if (boardSortBy === 'count-desc') {
        return productsB.length - productsA.length;
      } else if (boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc') {
        const avgPriceA = productsA.length > 0
          ? productsA.reduce((sum, p) => sum + parseFloat(p.price.replace(/[^0-9.]/g, '')), 0) / productsA.length
          : 0;
        const avgPriceB = productsB.length > 0
          ? productsB.reduce((sum, p) => sum + parseFloat(p.price.replace(/[^0-9.]/g, '')), 0) / productsB.length
          : 0;
        return boardSortBy === 'avgPrice-asc' 
          ? avgPriceA - avgPriceB 
          : avgPriceB - avgPriceA;
      }
      
      return 0;
    });
  }, [currentBoards, boardSortBy, viewMode, priceRangeProductsCache, salesRangeProductsCache, yearRangeProductsCache, brandRangeProductsCache, rankingRangeProductsCache, products, productBoards]);

  // 处理视图模式切换
  const handleViewModeChange = async (mode: ViewMode) => {
    setViewMode(mode);
    // 更新 savedViewModeRef，确保自动保存时使用正确的值
    savedViewModeRef.current = mode;
    if (mode === 'custom') {
      setIsBatchMode(false);
      setSelectedProducts(new Set());
    }
    
    // 立即保存视图模式，确保切换后立即持久化
    if (collectionId && viewModeLoadedRef.current) {
      try {
        await apiService.saveViewConfig(collectionId, {
          viewMode: mode,
          colorRules,
          yearRanges,
          rankingRanges,
          rankingMetric,
          priceRanges,
          salesRanges,
          brandRanges
        });
        console.log('[ProductBoard] 视图模式已立即保存:', mode);
      } catch (err) {
        console.error('[ProductBoard] 保存视图模式失败:', err);
      }
    }
  };

  // 处理产品编辑
  const handleProductEdit = (product: Product) => {
    setEditingProduct(product);
  };

  // 保存产品编辑（同步到后端）
  const handleProductSave = async (updatedProduct: Product) => {
    if (!collectionId) {
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setEditingProduct(null);
      return;
    }

    try {
      // 调用后端 API 更新产品
      await apiService.updateCollectionProduct(collectionId, updatedProduct.id, {
        asin: updatedProduct.asin,
        title: updatedProduct.title,
        image_url: updatedProduct.imageUrl,
        product_url: updatedProduct.productUrl,
        price: updatedProduct.price,
        rating: updatedProduct.rating,
        review_count: updatedProduct.reviewCount,
        sales_volume: updatedProduct.salesCount,
        year: updatedProduct.year,
        brand: updatedProduct.brand,
      });
      
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setEditingProduct(null);
      toast.success('产品信息已保存');
    } catch (err) {
      console.error('保存产品失败:', err);
      toast.error('保存产品失败');
    }
  };

  // 处理产品删除（同步到后端）
  const handleProductDelete = async (productId: string) => {
    if (!collectionId) {
      setProducts(products.filter(p => p.id !== productId));
      setProductBoards(prev => {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      });
      return;
    }

    try {
      await apiService.deleteCollectionProduct(collectionId, productId);
      setProducts(products.filter(p => p.id !== productId));
      setProductBoards(prev => {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      });
      toast.success('产品已删除');
    } catch (err) {
      console.error('删除产品失败:', err);
      toast.error('删除产品失败');
    }
  };

  // 处理画板拖拽移动（所有视图模式都支持）
  const handleMoveBoard = useCallback((dragIndex: number, hoverIndex: number) => {
    // 根据当前视图模式，更新对应的数组
    if (viewMode === 'custom') {
      setBoards((prevBoards) => {
        const newBoards = [...prevBoards];
        const dragBoard = newBoards[dragIndex];
        newBoards.splice(dragIndex, 1);
        newBoards.splice(hoverIndex, 0, dragBoard);
        return newBoards;
      });
    } else if (viewMode === 'price') {
      setPriceRanges((prevRanges) => {
        const newRanges = [...prevRanges];
        const dragRange = newRanges[dragIndex];
        newRanges.splice(dragIndex, 1);
        newRanges.splice(hoverIndex, 0, dragRange);
        return newRanges;
      });
    } else if (viewMode === 'sales') {
      setSalesRanges((prevRanges) => {
        const newRanges = [...prevRanges];
        const dragRange = newRanges[dragIndex];
        newRanges.splice(dragIndex, 1);
        newRanges.splice(hoverIndex, 0, dragRange);
        return newRanges;
      });
    } else if (viewMode === 'year') {
      setYearRanges((prevRanges) => {
        const newRanges = [...prevRanges];
        const dragRange = newRanges[dragIndex];
        newRanges.splice(dragIndex, 1);
        newRanges.splice(hoverIndex, 0, dragRange);
        return newRanges;
      });
    } else if (viewMode === 'brand') {
      setBrandRanges((prevRanges) => {
        const newRanges = [...prevRanges];
        const dragRange = newRanges[dragIndex];
        newRanges.splice(dragIndex, 1);
        newRanges.splice(hoverIndex, 0, dragRange);
        return newRanges;
      });
    } else if (viewMode === 'ranking') {
      setRankingRanges((prevRanges) => {
        const newRanges = [...prevRanges];
        const dragRange = newRanges[dragIndex];
        newRanges.splice(dragIndex, 1);
        newRanges.splice(hoverIndex, 0, dragRange);
        return newRanges;
      });
    }
  }, [viewMode]);

  // 处理数据上传（同步到后端）
  const handleDataUpload = async (data: DataUploadResult[]) => {
    if (!collectionId) {
      // 本地模式
      const updatedLocalProducts = products.map((product) => {
        const uploadData = data.find((d) => d.asin === product.asin);
        if (uploadData) {
          return {
            ...product,
            brand: uploadData.brand || product.brand,
            year: uploadData.year || product.year,
            salesCount: uploadData.salesCount || product.salesCount,
            majorCategoryRank: uploadData.majorCategoryRank || product.majorCategoryRank,
            minorCategoryRank: uploadData.minorCategoryRank || product.minorCategoryRank,
            majorCategoryName: uploadData.majorCategoryName || product.majorCategoryName,
            minorCategoryName: uploadData.minorCategoryName || product.minorCategoryName,
          };
        }
        return product;
      });
      
      setProducts(updatedLocalProducts);
      
      // 自动更新品牌分组
      const newLocalBrands = new Set<string>();
      updatedLocalProducts.forEach(p => {
        if (p.brand && p.brand.trim() !== '') {
          newLocalBrands.add(p.brand);
        }
      });
      
      if (newLocalBrands.size > 0) {
        setBrandRanges(prevRanges => {
          const existingBrands = new Set<string>();
          prevRanges.forEach(range => {
            range.brands.forEach(brand => existingBrands.add(brand));
          });
          
          const brandsToAdd: string[] = [];
          newLocalBrands.forEach(brand => {
            if (!existingBrands.has(brand)) {
              brandsToAdd.push(brand);
            }
          });
          
          if (brandsToAdd.length === 0) return prevRanges;
          
          const newRanges = brandsToAdd.map(brand => ({
            id: `brand-${brand.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name: brand,
            brands: [brand],
          }));
          
          const otherIndex = prevRanges.findIndex(r => r.id === 'brand-other' || r.name === '其他品牌');
          if (otherIndex >= 0) {
            return [
              ...prevRanges.slice(0, otherIndex),
              ...newRanges,
              ...prevRanges.slice(otherIndex),
            ];
          }
          return [...prevRanges, ...newRanges];
        });
      }
      
      setIsDataUploadOpen(false);
      toast.success('数据上传成功');
      return;
    }

    try {
      // 准备批量更新数据（包含新增的排名和分类字段）
      const batchData = data.map((d) => ({
        asin: d.asin,
        year: d.year,
        brand: d.brand,
        sales_volume_manual: d.salesCount,  // 月销量 → 补充数据的销售量
        major_category_rank: d.majorCategoryRank,  // 大类BSR
        minor_category_rank: d.minorCategoryRank,  // 小类BSR
        major_category_name: d.majorCategoryName,  // 大类目
        minor_category_name: d.minorCategoryName,  // 小类目
      }));

      // 调用后端批量更新 API
      const result = await apiService.batchUpdateCollectionProducts(collectionId, batchData);
      
      // 更新本地状态
      const updatedProducts = products.map((product) => {
        const uploadData = data.find((d) => d.asin === product.asin);
        if (uploadData) {
          return {
            ...product,
            brand: uploadData.brand || product.brand,
            year: uploadData.year || product.year,
            salesCount: uploadData.salesCount || product.salesCount,
            majorCategoryRank: uploadData.majorCategoryRank || product.majorCategoryRank,
            minorCategoryRank: uploadData.minorCategoryRank || product.minorCategoryRank,
            majorCategoryName: uploadData.majorCategoryName || product.majorCategoryName,
            minorCategoryName: uploadData.minorCategoryName || product.minorCategoryName,
          };
        }
        return product;
      });
      
      setProducts(updatedProducts);
      
      // 自动更新品牌分组：检测新上传的品牌并添加到分组中
      const newBrands = new Set<string>();
      updatedProducts.forEach(p => {
        if (p.brand && p.brand.trim() !== '') {
          newBrands.add(p.brand);
        }
      });
      
      if (newBrands.size > 0) {
        setBrandRanges(prevRanges => {
          // 获取已存在的品牌列表
          const existingBrands = new Set<string>();
          prevRanges.forEach(range => {
            range.brands.forEach(brand => existingBrands.add(brand));
          });
          
          // 找出新增的品牌（不在任何分组中的品牌）
          const brandsToAdd: string[] = [];
          newBrands.forEach(brand => {
            if (!existingBrands.has(brand)) {
              brandsToAdd.push(brand);
            }
          });
          
          if (brandsToAdd.length === 0) {
            return prevRanges; // 没有新品牌，不更新
          }
          
          // 为新品牌创建分组
          const newRanges = brandsToAdd.map(brand => ({
            id: `brand-${brand.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name: brand,
            brands: [brand],
          }));
          
          // 找到"其他品牌"分组的位置，在其前面插入新分组
          const otherIndex = prevRanges.findIndex(r => r.id === 'brand-other' || r.name === '其他品牌');
          if (otherIndex >= 0) {
            return [
              ...prevRanges.slice(0, otherIndex),
              ...newRanges,
              ...prevRanges.slice(otherIndex),
            ];
          }
          
          // 如果没有"其他品牌"分组，直接追加
          return [...prevRanges, ...newRanges];
        });
        
        console.log('[ProductBoard] 品牌分组已自动更新，新增品牌:', Array.from(newBrands));
      }

      setIsDataUploadOpen(false);
      
      if (result.not_found_count > 0) {
        toast.success(`成功更新 ${result.updated_count} 个产品，${result.not_found_count} 个产品未找到`);
      } else {
        toast.success(`成功更新 ${result.updated_count} 个产品`);
      }
    } catch (err) {
      console.error('批量更新失败:', err);
      toast.error('数据上传失败');
    }
  };

  // 检查数据可用性
  const hasBrandData = products.some((p) => p.brand && p.brand.trim() !== '');
  const hasYearData = products.some((p) => p.year && p.year > 0);
  const hasSalesData = products.some((p) => p.salesCount && p.salesCount > 0);
  // 排名视图需要有真正的排名数据（大类BSR 或 小类BSR）
  const hasRankingData = products.some((p) => {
    const hasMajorRank = p.majorCategoryRank && p.majorCategoryRank > 0;
    const hasMinorRank = p.minorCategoryRank && p.minorCategoryRank > 0;
    return hasMajorRank || hasMinorRank;
  });

  // 获取产品的颜色透视颜色
  const getProductColor = (product: Product): string | undefined => {
    if (!isColorPerspectiveEnabled || colorRules.length === 0) {
      return undefined;
    }

    for (const rule of colorRules) {
      if (rule.conditions.length === 0) continue;

      const matches = rule.conditions.map((condition) => {
        let productValue: number;
        
        switch (condition.field) {
          case 'year':
            productValue = product.year;
            break;
          case 'sales':
            productValue = product.salesCount;
            break;
          case 'rating':
            productValue = product.rating;
            break;
          case 'price':
            productValue = parseFloat(product.price.replace(/[^0-9.]/g, ''));
            break;
          case 'reviewCount':
            productValue = product.reviewCount;
            break;
          default:
            return false;
        }

        switch (condition.operator) {
          case 'gt':
            return productValue > condition.value;
          case 'lt':
            return productValue < condition.value;
          case 'gte':
            return productValue >= condition.value;
          case 'lte':
            return productValue <= condition.value;
          case 'eq':
            return productValue === condition.value;
          default:
            return false;
        }
      });

      const shouldApply = rule.matchAll
        ? matches.every(m => m === true)
        : matches.some(m => m === true);

      if (shouldApply) {
        return rule.color;
      }
    }

    return undefined;
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col" style={{ backgroundColor: '#F5F6FA', minHeight: '100vh' }}>
        {/* 置顶工具栏 */}
        <div className="bg-white shadow-sm px-6 py-3 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/home/keyword-collections')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              {collectionInfo && (
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">
                    {collectionInfo.keyword}
                  </span>
                  {collectionInfo.marketplace && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-500">
                      {collectionInfo.marketplace}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* 分享按钮 */}
              {collectionId && (
                <ShareButton
                  resourceType="keyword_collection"
                  resourceId={collectionId}
                  title={collectionInfo?.keyword || '市场格局分析'}
                  variant="outline"
                  size="sm"
                />
              )}
              
              {/* 洞察分析按钮 */}
              <button
                onClick={() => setDetailDialogOpen(true)}
                className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                style={{ backgroundColor: '#9333ea' }}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                洞察分析
              </button>
              
              {/* 视图模式切换器 */}
              <div className="flex border-2 border-gray-200 rounded-full p-0.5 gap-0.5">
                <button
                  onClick={() => handleViewModeChange('custom')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'custom' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'custom' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  自定义
                </button>
                <button
                  onClick={() => handleViewModeChange('price')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                    viewMode === 'price' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={viewMode === 'price' ? { backgroundColor: '#FF1B82' } : {}}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  价格
                </button>
                {hasSalesData && (
                  <button
                    onClick={() => handleViewModeChange('sales')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                      viewMode === 'sales' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={viewMode === 'sales' ? { backgroundColor: '#FF1B82' } : {}}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    销量
                  </button>
                )}
                {hasYearData && (
                  <button
                    onClick={() => handleViewModeChange('year')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                      viewMode === 'year' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={viewMode === 'year' ? { backgroundColor: '#FF1B82' } : {}}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    年份
                  </button>
                )}
                {hasBrandData && (
                  <button
                    onClick={() => handleViewModeChange('brand')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                      viewMode === 'brand' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={viewMode === 'brand' ? { backgroundColor: '#FF1B82' } : {}}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    品牌
                  </button>
                )}
                {hasRankingData && (
                  <button
                    onClick={() => handleViewModeChange('ranking')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium ${
                      viewMode === 'ranking' ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={viewMode === 'ranking' ? { backgroundColor: '#FF1B82' } : {}}
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    排名
                  </button>
                )}
              </div>
              
              {/* 数据上传按钮 */}
              <button
                onClick={() => setIsDataUploadOpen(true)}
                className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                style={{ backgroundColor: '#FF1B82' }}
              >
                <Upload className="w-3.5 h-3.5" />
                补充数据
              </button>

              {/* 颜色透视开关按钮 */}
              <button
                onClick={() => {
                  if (isColorPerspectiveEnabled) {
                    setIsColorPerspectiveEnabled(false);
                  } else {
                    setIsColorPerspectiveSettingsOpen(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium ${
                  isColorPerspectiveEnabled ? 'text-white' : 'text-gray-700 bg-white border-2 border-gray-300'
                }`}
                style={isColorPerspectiveEnabled ? { backgroundColor: '#9333ea' } : {}}
              >
                <Palette className="w-3.5 h-3.5" />
                {isColorPerspectiveEnabled ? '颜色透视：开' : '颜色透视'}
              </button>
              
              {!isBatchMode && viewMode === 'custom' ? (
                <>
                  <button
                    onClick={handleEnterBatchMode}
                    className="flex items-center gap-1.5 text-gray-700 px-4 py-1.5 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-all text-xs font-medium"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    批量移动
                  </button>
                  <button
                    onClick={() => setIsAddingBoard(true)}
                    className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                    style={{ backgroundColor: '#FF1B82' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新建画板
                  </button>
                </>
              ) : viewMode === 'price' ? (
                <button
                  onClick={() => setIsPriceSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                  style={{ backgroundColor: '#FF1B82' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  价格设置
                </button>
              ) : viewMode === 'sales' ? (
                <button
                  onClick={() => setIsSalesSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                  style={{ backgroundColor: '#FF1B82' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  销量设置
                </button>
              ) : viewMode === 'year' ? (
                <button
                  onClick={() => setIsYearSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                  style={{ backgroundColor: '#FF1B82' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  年份设置
                </button>
              ) : viewMode === 'brand' ? (
                <button
                  onClick={() => setIsBrandSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                  style={{ backgroundColor: '#FF1B82' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  品牌设置
                </button>
              ) : viewMode === 'ranking' ? (
                <button
                  onClick={() => setIsRankingSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-white px-4 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-all text-xs font-medium"
                  style={{ backgroundColor: '#FF1B82' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  排名设置
                </button>
              ) : isBatchMode ? (
                <button
                  onClick={handleCancelBatchMode}
                  className="flex items-center gap-1.5 text-gray-700 px-4 py-1.5 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-all text-xs font-medium"
                >
                  <X className="w-3.5 h-3.5" />
                  取消批量
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* 画板容器 */}
        <div className="flex-1 px-6">
          {/* 画板排序控件 */}
          <div className="py-3 flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ArrowUpDown className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium whitespace-nowrap">画板排序：</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setBoardSortBy('custom')}
                className={`text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                  boardSortBy === 'custom' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                style={boardSortBy === 'custom' ? { backgroundColor: '#FF1B82' } : {}}
              >
                默认顺序
              </button>
              <button
                onClick={() => setBoardSortBy(boardSortBy === 'name-asc' ? 'name-desc' : 'name-asc')}
                className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
                  boardSortBy === 'name-asc' || boardSortBy === 'name-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                style={boardSortBy === 'name-asc' || boardSortBy === 'name-desc' ? { backgroundColor: '#FF1B82' } : {}}
              >
                名称
                {(boardSortBy === 'name-asc' || boardSortBy === 'name-desc') && (
                  <span className="text-[10px]">{boardSortBy === 'name-asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={() => setBoardSortBy(boardSortBy === 'count-asc' ? 'count-desc' : 'count-asc')}
                className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
                  boardSortBy === 'count-asc' || boardSortBy === 'count-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                style={boardSortBy === 'count-asc' || boardSortBy === 'count-desc' ? { backgroundColor: '#FF1B82' } : {}}
              >
                产品数量
                {(boardSortBy === 'count-asc' || boardSortBy === 'count-desc') && (
                  <span className="text-[10px]">{boardSortBy === 'count-asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={() => setBoardSortBy(boardSortBy === 'avgPrice-asc' ? 'avgPrice-desc' : 'avgPrice-asc')}
                className={`text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1 whitespace-nowrap ${
                  boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc' ? 'text-white shadow-sm' : 'text-gray-600 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                style={boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc' ? { backgroundColor: '#FF1B82' } : {}}
              >
                平均价格
                {(boardSortBy === 'avgPrice-asc' || boardSortBy === 'avgPrice-desc') && (
                  <span className="text-[10px]">{boardSortBy === 'avgPrice-asc' ? '↑' : '↓'}</span>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex gap-4 items-start">
              {sortedBoards.map((board, index) => (
                <DraggableBoard
                  key={board.id}
                  id={board.id}
                  name={board.name}
                  products={getCurrentBoardProducts(board.id)}
                  onDrop={handleDrop}
                  onDelete={handleDeleteBoard}
                  onRename={handleRenameBoard}
                  isDefault={board.id === 'default'}
                  isBatchMode={isBatchMode}
                  selectedProducts={selectedProducts}
                  onProductSelect={handleProductSelect}
                  isReadOnly={viewMode !== 'custom'}
                  onProductEdit={handleProductEdit}
                  onProductDelete={handleProductDelete}
                  index={index}
                  onMoveBoard={handleMoveBoard}
                  getProductColor={getProductColor}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 设置模态框 */}
        <PriceRangeSettings
          isOpen={isPriceSettingsOpen}
          onClose={() => setIsPriceSettingsOpen(false)}
          priceRanges={priceRanges}
          onSave={async (ranges) => {
            setPriceRanges(ranges);
            // 保存价格配置到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules,
                  yearRanges,
                  rankingRanges,
                  rankingMetric,
                  priceRanges: ranges,
                  salesRanges,
                  brandRanges
                });
                console.log('[ProductBoard] 价格配置已保存');
                toast.success('价格配置已保存');
                setIsPriceSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存价格配置失败:', err);
                toast.error('保存价格配置失败');
                throw err;
              }
            } else {
              setIsPriceSettingsOpen(false);
            }
          }}
        />

        <SalesRangeSettings
          isOpen={isSalesSettingsOpen}
          onClose={() => setIsSalesSettingsOpen(false)}
          salesRanges={salesRanges}
          onSave={async (ranges) => {
            setSalesRanges(ranges);
            // 保存销量配置到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules,
                  yearRanges,
                  rankingRanges,
                  rankingMetric,
                  priceRanges,
                  salesRanges: ranges,
                  brandRanges
                });
                console.log('[ProductBoard] 销量配置已保存');
                toast.success('销量配置已保存');
                setIsSalesSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存销量配置失败:', err);
                toast.error('保存销量配置失败');
                throw err;
              }
            } else {
              setIsSalesSettingsOpen(false);
            }
          }}
        />

        <YearRangeSettings
          isOpen={isYearSettingsOpen}
          onClose={() => setIsYearSettingsOpen(false)}
          yearRanges={yearRanges}
          onSave={async (ranges) => {
            setYearRanges(ranges);
            // 保存年份配置到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules,
                  yearRanges: ranges,
                  rankingRanges,
                  rankingMetric,
                  priceRanges,
                  salesRanges,
                  brandRanges
                });
                console.log('[ProductBoard] 年份配置已保存');
                toast.success('年份配置已保存');
                setIsYearSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存年份配置失败:', err);
                toast.error('保存年份配置失败');
                throw err;
              }
            } else {
              setIsYearSettingsOpen(false);
            }
          }}
        />

        <BrandRangeSettings
          isOpen={isBrandSettingsOpen}
          onClose={() => setIsBrandSettingsOpen(false)}
          brandRanges={brandRanges}
          onSave={async (ranges) => {
            setBrandRanges(ranges);
            // 保存品牌配置到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules,
                  yearRanges,
                  rankingRanges,
                  rankingMetric,
                  priceRanges,
                  salesRanges,
                  brandRanges: ranges
                });
                console.log('[ProductBoard] 品牌配置已保存');
                toast.success('品牌配置已保存');
                setIsBrandSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存品牌配置失败:', err);
                toast.error('保存品牌配置失败');
                throw err;
              }
            } else {
              setIsBrandSettingsOpen(false);
            }
          }}
        />

        <RankingSettings
          isOpen={isRankingSettingsOpen}
          onClose={() => setIsRankingSettingsOpen(false)}
          rankingMetric={rankingMetric}
          rankingRanges={rankingRanges}
          onSave={async (ranges, metric) => {
            setRankingRanges(ranges);
            setRankingMetric(metric);
            // 保存排名配置到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules,
                  yearRanges,
                  rankingRanges: ranges,
                  rankingMetric: metric,
                  priceRanges,
                  salesRanges,
                  brandRanges
                });
                console.log('[ProductBoard] 排名配置已保存');
                toast.success('排名配置已保存');
                setIsRankingSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存排名配置失败:', err);
                toast.error('保存排名配置失败');
                throw err;
              }
            } else {
              setIsRankingSettingsOpen(false);
            }
          }}
        />

        <ProductEditModal
          product={editingProduct}
          onSave={handleProductSave}
          onClose={() => setEditingProduct(null)}
        />

        <DataUploadModal
          isOpen={isDataUploadOpen}
          onClose={() => setIsDataUploadOpen(false)}
          onUpload={handleDataUpload}
        />

        <ColorPerspectiveSettings
          isOpen={isColorPerspectiveSettingsOpen}
          onClose={() => setIsColorPerspectiveSettingsOpen(false)}
          colorRules={colorRules}
          onSave={async (rules) => {
            setColorRules(rules);
            if (rules.length > 0) {
              setIsColorPerspectiveEnabled(true);
            }
            
            // 保存颜色规则到后端
            if (collectionId) {
              try {
                await apiService.saveViewConfig(collectionId, {
                  viewMode,
                  colorRules: rules,
                  yearRanges,
                  rankingRanges,
                  rankingMetric,
                  priceRanges,
                  salesRanges,
                  brandRanges
                });
                console.log('[ProductBoard] 颜色规则已保存');
                toast.success('颜色规则已保存');
                setIsColorPerspectiveSettingsOpen(false);
              } catch (err) {
                console.error('[ProductBoard] 保存颜色规则失败:', err);
                toast.error('保存颜色规则失败');
                throw err; // 抛出错误，让弹窗保持打开
              }
            } else {
              // 没有 collectionId 时也关闭弹窗
              setIsColorPerspectiveSettingsOpen(false);
            }
          }}
        />

        {/* 详情弹窗（用于批量洞察、对比分析、市场细分） */}
        <CollectionDetailDialog
          open={detailDialogOpen}
          onClose={() => setDetailDialogOpen(false)}
          collection={fullCollection}
          onRefresh={() => {
            if (collectionId) {
              loadCollectionData(collectionId);
            }
          }}
        />

        {/* 删除画板确认对话框 */}
        {deleteBoardId && (
          <ConfirmDialog
            title="删除画板"
            message="确定要删除此画板吗？画板中的产品将移回默认画板。"
            confirmText="删除"
            cancelText="取消"
            confirmVariant="destructive"
            onConfirm={confirmDeleteBoard}
            onCancel={() => setDeleteBoardId(null)}
          />
        )}

        {/* 新建画板模态框 */}
        {isAddingBoard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">新建画板</h2>
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddBoard();
                  } else if (e.key === 'Escape') {
                    setIsAddingBoard(false);
                    setNewBoardName('');
                  }
                }}
                placeholder="请输入画板名称"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-pink-500 focus:outline-none mb-6"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setIsAddingBoard(false);
                    setNewBoardName('');
                  }}
                  className="px-5 py-2.5 rounded-full border-2 border-gray-300 text-gray-700 hover:border-gray-400 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleAddBoard}
                  className="px-5 py-2.5 rounded-full text-white shadow-lg hover:shadow-xl transition-all"
                  style={{ backgroundColor: '#FF1B82' }}
                  disabled={!newBoardName.trim()}
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}
