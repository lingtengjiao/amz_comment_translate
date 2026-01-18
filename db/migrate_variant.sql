-- Migration: Add variant column to reviews table
-- Description: Stores product variant information (color, size, etc.) for each review
-- Date: 2026-01-16

-- Add variant column to reviews table
ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS variant VARCHAR(500) NULL;

-- Add comment for documentation
COMMENT ON COLUMN reviews.variant IS '产品变体信息（颜色、尺寸等）';
