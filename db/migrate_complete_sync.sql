-- ========================================
-- 完整数据库同步脚本
-- 生成时间：2026-01-11
-- 目的：根据对比报告，完整同步本地模型与线上数据库
-- ========================================

-- 1. 修复 review_insights 表 (已执行，验证)
-- ✅ type 列已重命名为 insight_type

-- 2. 修复 review_theme_highlights 表
-- ✅ quote_translated 列已添加

-- 3. 修复 products 表
-- 扩大 price 列长度 (50 -> 100)
ALTER TABLE products ALTER COLUMN price TYPE VARCHAR(100);
COMMENT ON COLUMN products.price IS '产品价格（含货币符号）';

-- 4. 为 product_reports 表添加增量报告功能字段
ALTER TABLE product_reports ADD COLUMN IF NOT EXISTS review_count_at_generation INTEGER;
COMMENT ON COLUMN product_reports.review_count_at_generation IS '生成报告时的评论数量';

ALTER TABLE product_reports ADD COLUMN IF NOT EXISTS is_incremental BOOLEAN DEFAULT false;
COMMENT ON COLUMN product_reports.is_incremental IS '是否为增量报告';

ALTER TABLE product_reports ADD COLUMN IF NOT EXISTS base_report_id UUID;
COMMENT ON COLUMN product_reports.base_report_id IS '基准报告ID（用于增量对比）';

-- 添加外键约束
ALTER TABLE product_reports 
ADD CONSTRAINT product_reports_base_report_id_fkey 
FOREIGN KEY (base_report_id) REFERENCES product_reports(id) 
ON DELETE SET NULL;

-- 5. 清理 review_theme_highlights 表中的废弃列（可选，不影响功能）
-- 如果确认不再需要这些列，可以执行：
-- ALTER TABLE review_theme_highlights DROP COLUMN IF EXISTS highlight;
-- ALTER TABLE review_theme_highlights DROP COLUMN IF EXISTS highlight_translated;
-- ALTER TABLE review_theme_highlights DROP COLUMN IF EXISTS matched_label_name;

-- 6. 验证所有关键表的完整性
DO $$
BEGIN
    -- 验证 products 表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'bullet_points'
    ) THEN
        RAISE EXCEPTION 'products.bullet_points 列不存在';
    END IF;
    
    -- 验证 reviews 表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reviews' AND column_name = 'has_video'
    ) THEN
        RAISE EXCEPTION 'reviews.has_video 列不存在';
    END IF;
    
    -- 验证 review_insights 表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'review_insights' AND column_name = 'insight_type'
    ) THEN
        RAISE EXCEPTION 'review_insights.insight_type 列不存在';
    END IF;
    
    -- 验证 review_theme_highlights 表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'review_theme_highlights' AND column_name = 'quote_translated'
    ) THEN
        RAISE EXCEPTION 'review_theme_highlights.quote_translated 列不存在';
    END IF;
    
    -- 验证 tasks 表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'heartbeat_at'
    ) THEN
        RAISE EXCEPTION 'tasks.heartbeat_at 列不存在';
    END IF;
    
    RAISE NOTICE '✅ 所有关键表验证通过';
END $$;

-- 7. 创建缺失的索引
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_reviews_has_video ON reviews(has_video);
CREATE INDEX IF NOT EXISTS idx_reviews_has_images ON reviews(has_images);
CREATE INDEX IF NOT EXISTS idx_product_reports_review_count ON product_reports(review_count_at_generation);
CREATE INDEX IF NOT EXISTS idx_product_reports_is_incremental ON product_reports(is_incremental);

-- 8. 输出同步摘要
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
BEGIN
    -- 统计表数量
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    
    -- 统计索引数量
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ 数据库同步完成';
    RAISE NOTICE '========================================';
    RAISE NOTICE '表总数: %', table_count;
    RAISE NOTICE '索引总数: %', index_count;
    RAISE NOTICE '========================================';
END $$;
