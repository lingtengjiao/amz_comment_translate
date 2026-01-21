-- Migration: Add new fields to rufus_conversations table
-- Description: Support for page types, DIY questions, and AI summaries
-- Date: 2026-01-21

-- ============================================================
-- Modify existing columns
-- ============================================================

-- Make ASIN nullable (homepage has no ASIN)
ALTER TABLE rufus_conversations 
ALTER COLUMN asin DROP NOT NULL;

-- ============================================================
-- Add new columns for enhanced Rufus functionality
-- ============================================================

-- page_type: Distinguish between homepage, keyword search, and product detail pages
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS page_type VARCHAR(30) NOT NULL DEFAULT 'product_detail';

-- keyword: Store the search keyword (for keyword search pages)
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS keyword VARCHAR(255);

-- product_title: Store the product title from the page
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS product_title TEXT;

-- bullet_points: Store product bullet points as JSON array
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS bullet_points TEXT;

-- session_id: Group related conversations into sessions
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

-- ai_summary: AI-generated summary of the conversation session
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- ============================================================
-- Create indexes for new columns
-- ============================================================

-- Index for page_type to support filtering
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_page_type 
ON rufus_conversations(page_type);

-- Index for session_id to support session grouping
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_session_id 
ON rufus_conversations(session_id);

-- Index for keyword to support keyword-based queries
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_keyword 
ON rufus_conversations(keyword) WHERE keyword IS NOT NULL;

-- ============================================================
-- Add comments for documentation
-- ============================================================

COMMENT ON COLUMN rufus_conversations.page_type IS 'Page type: homepage, keyword_search, or product_detail';
COMMENT ON COLUMN rufus_conversations.keyword IS 'Search keyword (for keyword_search page type)';
COMMENT ON COLUMN rufus_conversations.product_title IS 'Product title from the page';
COMMENT ON COLUMN rufus_conversations.bullet_points IS 'Product bullet points stored as JSON array';
COMMENT ON COLUMN rufus_conversations.session_id IS 'Session ID to group related conversations';
COMMENT ON COLUMN rufus_conversations.ai_summary IS 'AI-generated summary for the session';
