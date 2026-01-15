-- Migration: Add confidence field to review_theme_highlights
-- Date: 2026-01-15
-- Purpose: Track AI classification confidence level for better user experience

-- Add confidence column to review_theme_highlights table
ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'high';

-- Add comment for documentation
COMMENT ON COLUMN review_theme_highlights.confidence IS '置信度：high(明确证据)/medium(合理推断)/low(弱关联)';

-- Create index for filtering by confidence (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_theme_highlights_confidence ON review_theme_highlights(confidence);

-- Verify the migration
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'review_theme_highlights' 
AND column_name = 'confidence';
