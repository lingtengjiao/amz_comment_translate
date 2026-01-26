-- 数据表格视图升级：支持月度销量数据和自定义标签
-- 1. collection_products 表新增 monthly_sales 和 custom_tags 字段
-- 2. keyword_collections 表新增 custom_fields 字段（存储自定义字段定义）

-- ==========================================
-- CollectionProduct 表新增字段
-- ==========================================

-- 添加月度销量数据字段（JSONB 格式）
-- 结构示例: {"2023-05": 300, "2023-06": 1200, "2023-07": 1800, ...}
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS monthly_sales JSONB DEFAULT '{}';

COMMENT ON COLUMN collection_products.monthly_sales IS '月度销量数据（JSONB格式，key为月份如2023-05，value为销量数字）';

-- 添加自定义标签字段（JSONB 格式）
-- 结构示例: {"product_type": "TSA-Clear", "product_series": "TSA-Clear-常规款", ...}
ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS custom_tags JSONB DEFAULT '{}';

COMMENT ON COLUMN collection_products.custom_tags IS '自定义标签数据（JSONB格式，key为字段ID，value为标签值）';

-- 为 monthly_sales 创建 GIN 索引（支持 JSONB 查询）
CREATE INDEX IF NOT EXISTS idx_collection_products_monthly_sales 
ON collection_products USING GIN (monthly_sales);

-- 为 custom_tags 创建 GIN 索引（支持 JSONB 查询）
CREATE INDEX IF NOT EXISTS idx_collection_products_custom_tags 
ON collection_products USING GIN (custom_tags);

-- ==========================================
-- KeywordCollection 表新增字段
-- ==========================================

-- 添加自定义字段定义（JSONB 格式）
-- 结构示例:
-- [
--   {"id": "field_1", "name": "产品类型", "type": "select", "options": ["TSA-Clear", "TSA-Lock", ...]},
--   {"id": "field_2", "name": "产品系列", "type": "select", "options": ["TSA-Clear-常规款", ...]},
--   {"id": "field_3", "name": "备注", "type": "text"}
-- ]
ALTER TABLE keyword_collections
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';

COMMENT ON COLUMN keyword_collections.custom_fields IS '自定义字段定义（JSONB数组，每项包含id、name、type、options等）';

-- ==========================================
-- 完成提示
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '迁移完成：数据表格视图字段已添加';
    RAISE NOTICE '  collection_products 表:';
    RAISE NOTICE '    - monthly_sales: 月度销量数据（JSONB）';
    RAISE NOTICE '    - custom_tags: 自定义标签数据（JSONB）';
    RAISE NOTICE '  keyword_collections 表:';
    RAISE NOTICE '    - custom_fields: 自定义字段定义（JSONB）';
END $$;
