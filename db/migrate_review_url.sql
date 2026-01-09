-- 迁移脚本：添加 review_url 字段到 reviews 表
-- 用于存储亚马逊评论原文链接

DO $$ 
BEGIN
    -- 添加 review_url 字段
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='reviews' 
        AND column_name='review_url'
    ) THEN
        ALTER TABLE reviews ADD COLUMN review_url VARCHAR(500) NULL;
        COMMENT ON COLUMN reviews.review_url IS '亚马逊评论原文链接';
        RAISE NOTICE 'Added column review_url to reviews table';
    ELSE
        RAISE NOTICE 'Column review_url already exists in reviews table';
    END IF;
END $$;

