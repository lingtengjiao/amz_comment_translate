-- Migration: Add product_image field to rufus_conversations table
-- Description: Store product image URL for product research sessions
-- Date: 2026-01-21

-- ============================================================
-- Add product_image column
-- ============================================================

-- product_image: Store the product image URL from the page
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS product_image TEXT;

-- ============================================================
-- Add comments for documentation
-- ============================================================

COMMENT ON COLUMN rufus_conversations.product_image IS 'Product image URL from the Amazon product page';
