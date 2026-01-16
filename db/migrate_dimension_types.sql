-- Migration: Add dimension_type field to product_dimensions table
-- Date: 2026-01-16
-- Purpose: Support 3-category dimension system (product/scenario/emotion)

-- ============================================
-- Step 1: Add dimension_type column
-- ============================================
ALTER TABLE product_dimensions 
ADD COLUMN IF NOT EXISTS dimension_type VARCHAR(20) DEFAULT 'product';

-- ============================================
-- Step 2: Add comment for the new column
-- ============================================
COMMENT ON COLUMN product_dimensions.dimension_type IS 
'维度类型: product(产品维度), scenario(场景维度), emotion(情绪维度)';

-- ============================================
-- Step 3: Create index for faster filtering
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_dimensions_type 
ON product_dimensions(product_id, dimension_type);

-- ============================================
-- Step 4: Migrate existing data
-- All existing dimensions are product dimensions
-- ============================================
UPDATE product_dimensions 
SET dimension_type = 'product' 
WHERE dimension_type IS NULL;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify the migration:
-- SELECT dimension_type, COUNT(*) FROM product_dimensions GROUP BY dimension_type;
