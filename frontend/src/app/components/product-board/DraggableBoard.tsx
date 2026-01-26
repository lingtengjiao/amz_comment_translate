import { useDrag, useDrop } from 'react-dnd';
import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { Board } from './Board';
import { Product } from './ProductCard';

interface DraggableBoardProps {
  id: string;
  name: string;
  products: Product[];
  onDrop: (product: Product, boardId: string) => void;
  onDelete: (boardId: string) => void;
  onRename: (boardId: string, newName: string) => void;
  isDefault?: boolean;
  isBatchMode?: boolean;
  selectedProducts?: Set<string>;
  onProductSelect?: (productId: string) => void;
  isReadOnly?: boolean;
  /** 为 true 时隐藏画板标题栏的编辑、删除按钮 */
  hideBoardActions?: boolean;
  onProductEdit?: (product: Product) => void;
  onProductDelete?: (productId: string) => void;
  index: number;
  onMoveBoard: (dragIndex: number, hoverIndex: number) => void;
  getProductColor?: (product: Product) => string | undefined;
}

interface DragItem {
  type: string;
  id: string;
  index: number;
}

export function DraggableBoard({
  id,
  name,
  products,
  onDrop,
  onDelete,
  onRename,
  isDefault,
  isBatchMode,
  selectedProducts,
  onProductSelect,
  isReadOnly = false,
  hideBoardActions = false,
  onProductEdit,
  onProductDelete,
  index,
  onMoveBoard,
  getProductColor,
}: DraggableBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: 'BOARD',
    item: () => ({ type: 'BOARD', id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    // 画板拖拽排序在所有视图模式下都可用
    canDrag: true,
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: 'BOARD',
    hover: (item: DragItem, monitor) => {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const clientOffset = monitor.getClientOffset();
      
      if (!clientOffset) {
        return;
      }

      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }

      onMoveBoard(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // 将拖拽功能绑定到标题区域（通过 dragHandleRef），drop 功能绑定到容器
  drag(dragHandleRef);
  drop(ref);

  return (
    <div
      ref={ref}
      className="relative group"
      style={{
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* 拖拽手柄 - 所有视图模式都显示 */}
      <div 
        className="absolute -left-6 top-4 z-40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing pointer-events-none"
      >
        <div className="bg-white rounded-lg shadow-md p-1.5 border-2 border-gray-200 hover:border-rose-300 hover:shadow-lg transition-all">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* 放置指示器 */}
      {isOver && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: '3px dashed #FF1B82',
            backgroundColor: 'rgba(255, 27, 130, 0.05)',
          }}
        />
      )}

      <Board
        id={id}
        name={name}
        products={products}
        onDrop={onDrop}
        onDelete={onDelete}
        onRename={onRename}
        isDefault={isDefault}
        isBatchMode={isBatchMode}
        selectedProducts={selectedProducts}
        onProductSelect={onProductSelect}
        isReadOnly={isReadOnly}
        hideBoardActions={hideBoardActions}
        onProductEdit={onProductEdit}
        onProductDelete={onProductDelete}
        getProductColor={getProductColor}
        dragHandleRef={dragHandleRef}
      />
    </div>
  );
}
