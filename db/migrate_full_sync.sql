-- =============================================================================
-- 完整数据库同步迁移脚本
-- 确保线上数据库与模型定义完全一致
-- 创建时间: 2026-01-11
-- =============================================================================

-- ==========================================
-- 1. Reviews 表 - 添加缺失的字段
-- ==========================================

-- 添加 has_video 字段
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS has_video BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN reviews.has_video IS '是否包含视频';

-- 添加 has_images 字段
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS has_images BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN reviews.has_images IS '是否包含图片';

-- 添加 image_urls 字段
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_urls TEXT;
COMMENT ON COLUMN reviews.image_urls IS '图片链接JSON数组';

-- 添加 video_url 字段
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
COMMENT ON COLUMN reviews.video_url IS '视频链接';

-- 添加 review_url 字段
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS review_url VARCHAR(500);
COMMENT ON COLUMN reviews.review_url IS '亚马逊评论原文链接';

-- ==========================================
-- 2. Products 表 - 确保字段类型正确
-- ==========================================

-- 确保 bullet_points 是 TEXT[] 数组类型
-- 注意：如果已经是 TEXT[] 类型，这个语句会报错，所以用 DO 块处理
DO $$
BEGIN
    -- 检查 bullet_points 列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'bullet_points'
    ) THEN
        ALTER TABLE products ADD COLUMN bullet_points TEXT[];
    END IF;
    
    -- 检查 bullet_points_translated 列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'bullet_points_translated'
    ) THEN
        ALTER TABLE products ADD COLUMN bullet_points_translated TEXT[];
    END IF;
    
    -- 检查 title_translated 列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'title_translated'
    ) THEN
        ALTER TABLE products ADD COLUMN title_translated TEXT;
    END IF;
    
    -- 检查 price 列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'price'
    ) THEN
        ALTER TABLE products ADD COLUMN price VARCHAR(50);
    END IF;
END $$;

-- ==========================================
-- 3. Tasks 表 - 添加心跳字段
-- ==========================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;
COMMENT ON COLUMN tasks.heartbeat_at IS '任务心跳时间';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100);
COMMENT ON COLUMN tasks.worker_id IS 'Worker 标识';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
COMMENT ON COLUMN tasks.retry_count IS '重试次数';

-- ==========================================
-- 4. Review Insights 表 - 确保字段存在
-- ==========================================

-- 检查并添加缺失的字段
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'review_insights' AND column_name = 'dimension'
    ) THEN
        ALTER TABLE review_insights ADD COLUMN dimension VARCHAR(50);
    END IF;
END $$;

-- ==========================================
-- 5. Review Theme Highlights 表 - 确保字段存在
-- ==========================================

ALTER TABLE review_theme_highlights ADD COLUMN IF NOT EXISTS theme_type VARCHAR(50);
ALTER TABLE review_theme_highlights ADD COLUMN IF NOT EXISTS highlight TEXT;
ALTER TABLE review_theme_highlights ADD COLUMN IF NOT EXISTS highlight_translated TEXT;
ALTER TABLE review_theme_highlights ADD COLUMN IF NOT EXISTS context_label_id UUID;
ALTER TABLE review_theme_highlights ADD COLUMN IF NOT EXISTS matched_label_name VARCHAR(200);

-- ==========================================
-- 6. 创建索引（如果不存在）
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_translation_status ON reviews(translation_status);
CREATE INDEX IF NOT EXISTS idx_reviews_is_pinned ON reviews(is_pinned);
CREATE INDEX IF NOT EXISTS idx_reviews_is_hidden ON reviews(is_hidden);
CREATE INDEX IF NOT EXISTS idx_reviews_is_deleted ON reviews(is_deleted);
CREATE INDEX IF NOT EXISTS idx_reviews_has_video ON reviews(has_video);
CREATE INDEX IF NOT EXISTS idx_reviews_has_images ON reviews(has_images);

CREATE INDEX IF NOT EXISTS idx_tasks_product_id ON tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat ON tasks(heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_review_insights_review_id ON review_insights(review_id);
CREATE INDEX IF NOT EXISTS idx_review_insights_type ON review_insights(type);

CREATE INDEX IF NOT EXISTS idx_review_theme_highlights_review_id ON review_theme_highlights(review_id);
CREATE INDEX IF NOT EXISTS idx_review_theme_highlights_theme_type ON review_theme_highlights(theme_type);

-- ==========================================
-- 7. 验证迁移结果
-- ==========================================

DO $$
DECLARE
    reviews_cols INTEGER;
    products_cols INTEGER;
BEGIN
    -- 统计 reviews 表列数
    SELECT COUNT(*) INTO reviews_cols 
    FROM information_schema.columns 
    WHERE table_name = 'reviews';
    
    -- 统计 products 表列数
    SELECT COUNT(*) INTO products_cols 
    FROM information_schema.columns 
    WHERE table_name = 'products';
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ 数据库迁移完成！';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'reviews 表: % 列', reviews_cols;
    RAISE NOTICE 'products 表: % 列', products_cols;
    RAISE NOTICE '==========================================';
END $$;
