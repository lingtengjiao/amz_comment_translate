-- =====================================================
-- VOC-Master Database Migration Script
-- Date: 2026-01-15
-- Version: 1.0.6 → 1.1.0
-- =====================================================

-- 1. Add confidence field to review_theme_highlights
ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'high';

COMMENT ON COLUMN review_theme_highlights.confidence IS '置信度：high(明确证据)/medium(合理推断)/low(弱关联)';
CREATE INDEX IF NOT EXISTS idx_theme_highlights_confidence ON review_theme_highlights(confidence);

-- 2. Add confidence field to review_insights
ALTER TABLE review_insights 
ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'high';

COMMENT ON COLUMN review_insights.confidence IS '置信度：high(明确证据)/medium(合理推断)/low(弱关联)';
CREATE INDEX IF NOT EXISTS idx_review_insights_confidence ON review_insights(confidence);

-- 3. Create product_time_series table for Keepa API data (optional)
CREATE TABLE IF NOT EXISTS product_time_series (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    keepa_data JSONB NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_time_series_product_id ON product_time_series(product_id);
CREATE INDEX IF NOT EXISTS idx_product_time_series_last_updated ON product_time_series(last_updated);

-- 4. Create trigger for auto-updating last_updated
CREATE OR REPLACE FUNCTION update_product_time_series_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_product_time_series_updated_at ON product_time_series;
CREATE TRIGGER update_product_time_series_updated_at
    BEFORE UPDATE ON product_time_series
    FOR EACH ROW
    EXECUTE FUNCTION update_product_time_series_updated_at();

-- Verify migration
SELECT 'Migration completed successfully!' as status;
