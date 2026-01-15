-- Migration: Add confidence field to review_insights
-- Date: 2026-01-15
-- Purpose: Track AI insight extraction confidence level

-- Add confidence column to review_insights table
ALTER TABLE review_insights 
ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'high';

-- Add comment for documentation
COMMENT ON COLUMN review_insights.confidence IS '置信度：high(明确证据)/medium(合理推断)/low(弱关联)';

-- Create index for filtering by confidence (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_review_insights_confidence ON review_insights(confidence);

-- Verify the migration
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'review_insights' 
AND column_name = 'confidence';
