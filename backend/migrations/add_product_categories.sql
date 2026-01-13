-- Add categories column to products table
-- Migration: add_product_categories
-- Date: 2026-01-12

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS categories TEXT;

COMMENT ON COLUMN products.categories IS 'Product category breadcrumb as JSON array';
