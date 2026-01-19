-- 产品分类画板功能：添加 year 和 brand 字段
-- 用于支持按年份和品牌分类视图

-- 添加 year 字段
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS year INTEGER;

COMMENT ON COLUMN collection_products.year IS '产品上架年份';

-- 添加 brand 字段
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS brand VARCHAR(200);

COMMENT ON COLUMN collection_products.brand IS '产品品牌';

-- 为 brand 字段创建索引（加速按品牌分类查询）
CREATE INDEX IF NOT EXISTS idx_collection_products_brand 
ON collection_products(brand);

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE '迁移完成：collection_products 表已添加 year 和 brand 字段';
END $$;
