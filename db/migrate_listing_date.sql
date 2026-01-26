-- 产品上架日期：支持存储具体月、日，视图仍按年分组
-- listing_date 有值时，year 可由其推导；保留 year 便于查询与分组

ALTER TABLE collection_products
ADD COLUMN IF NOT EXISTS listing_date DATE;

COMMENT ON COLUMN collection_products.listing_date IS '产品上架具体日期（YYYY-MM-DD），有值时 year 可由其推导';

-- 可选：用已有 year 回填 listing_date 为当年 1 月 1 日（仅当 listing_date 为空且 year 有值时执行一次）
-- UPDATE collection_products SET listing_date = (year || '-01-01')::date WHERE listing_date IS NULL AND year IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '迁移完成：collection_products 表已添加 listing_date 字段';
END $$;
