-- Migration: Upgrade review_theme_highlights table structure
-- Purpose: Add label_name, quote, explanation fields for better association with product_context_labels
-- Date: 2026-01-06

-- Step 1: Add new columns
ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS label_name VARCHAR(100);

ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS quote TEXT;

ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS explanation TEXT;

ALTER TABLE review_theme_highlights 
ADD COLUMN IF NOT EXISTS context_label_id UUID;

-- Step 2: Add foreign key constraint (optional, with SET NULL on delete)
ALTER TABLE review_theme_highlights 
DROP CONSTRAINT IF EXISTS fk_theme_highlight_context_label;

ALTER TABLE review_theme_highlights 
ADD CONSTRAINT fk_theme_highlight_context_label 
FOREIGN KEY (context_label_id) 
REFERENCES product_context_labels(id) 
ON DELETE SET NULL;

-- Step 3: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS ix_review_theme_highlights_label_name 
ON review_theme_highlights (label_name);

CREATE INDEX IF NOT EXISTS ix_review_theme_highlights_context_label_id 
ON review_theme_highlights (context_label_id);

-- Step 4: Add column comments
COMMENT ON COLUMN review_theme_highlights.label_name IS '标签名称，如：老年人、卧室、睡前（关联 product_context_labels.name）';
COMMENT ON COLUMN review_theme_highlights.quote IS '原文证据，如：bought for my grandma';
COMMENT ON COLUMN review_theme_highlights.explanation IS '归类理由，如：评论明确提到买给奶奶';
COMMENT ON COLUMN review_theme_highlights.context_label_id IS '关联的标签库 ID（可选）';

-- Step 5: (Optional) Migrate existing data from items JSON to new columns
-- This will extract the first item from the items array if it exists
UPDATE review_theme_highlights 
SET 
    label_name = COALESCE(label_name, (items->0->>'content')),
    quote = COALESCE(quote, (items->0->>'content_original')),
    explanation = COALESCE(explanation, (items->0->>'explanation'))
WHERE items IS NOT NULL 
  AND jsonb_array_length(items::jsonb) > 0
  AND label_name IS NULL;

-- Done!
SELECT 'Migration completed successfully' as status;

