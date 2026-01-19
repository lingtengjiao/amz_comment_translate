-- 产品库产品表：新增排名和分类字段
-- 1. 大类排名、小类排名
-- 2. 大类名称、小类名称
-- 3. 补充数据的销售量字段

-- 添加补充数据的销售量字段
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS sales_volume_manual INTEGER;

COMMENT ON COLUMN collection_products.sales_volume_manual IS '补充数据的销售量（手动输入或导入）';

-- 添加大类排名
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS major_category_rank INTEGER;

COMMENT ON COLUMN collection_products.major_category_rank IS '大类排名';

-- 添加小类排名
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS minor_category_rank INTEGER;

COMMENT ON COLUMN collection_products.minor_category_rank IS '小类排名';

-- 添加大类名称
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS major_category_name VARCHAR(200);

COMMENT ON COLUMN collection_products.major_category_name IS '大类名称';

-- 添加小类名称
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS minor_category_name VARCHAR(200);

COMMENT ON COLUMN collection_products.minor_category_name IS '小类名称';

-- 更新 position 字段的注释，明确它不是排名
COMMENT ON COLUMN collection_products.position IS '在搜索结果中的页面位置（不是排名）';

-- 更新 sales_volume 字段的注释，明确它是初步估算
COMMENT ON COLUMN collection_products.sales_volume IS '初步估算销售量';

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE '迁移完成：collection_products 表已添加新字段';
    RAISE NOTICE '  - sales_volume_manual: 补充数据的销售量';
    RAISE NOTICE '  - major_category_rank: 大类排名';
    RAISE NOTICE '  - minor_category_rank: 小类排名';
    RAISE NOTICE '  - major_category_name: 大类名称';
    RAISE NOTICE '  - minor_category_name: 小类名称';
END $$;
