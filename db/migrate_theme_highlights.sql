-- Migration script to update review_theme_highlights table
-- Adds items field and migrates existing keywords data

-- Add items column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='review_theme_highlights' AND column_name='items') THEN
        ALTER TABLE review_theme_highlights ADD COLUMN items JSONB NOT NULL DEFAULT '[]';
    END IF;
END $$;

-- Migrate existing keywords data to items format
-- Convert old keywords array to new items array format
UPDATE review_theme_highlights
SET items = (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'content', keyword,
                'content_original', NULL,
                'content_translated', NULL,
                'explanation', NULL
            )
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements_text(keywords) AS keyword
    WHERE keywords IS NOT NULL AND jsonb_typeof(keywords) = 'array'
)
WHERE keywords IS NOT NULL 
  AND jsonb_typeof(keywords) = 'array'
  AND (items IS NULL OR items = '[]'::jsonb);

-- Create index for items if needed (JSONB already has GIN index support)
-- No explicit index needed as JSONB columns can use GIN indexes efficiently

