-- Migration: Add average_rating column to products table
-- This adds the average_rating field to store the real rating from Amazon product page

-- Add average_rating column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='products' 
        AND column_name='average_rating'
    ) THEN
        ALTER TABLE products ADD COLUMN average_rating VARCHAR(10) NULL;
        COMMENT ON COLUMN products.average_rating IS 'Real average rating from Amazon product page';
    END IF;
END $$;

