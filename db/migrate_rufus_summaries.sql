-- Migration: Add rufus_summaries table
-- Description: Store AI summaries for Rufus conversations at two levels:
--   1. Individual conversation summaries (conversation_id)
--   2. Session group summaries (session_group_id) - more important, overall summary
-- Date: 2026-01-21

-- ============================================================
-- Create rufus_summaries table
-- ============================================================

CREATE TABLE IF NOT EXISTS rufus_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Summary type: 'conversation' (单个对话总结) or 'session_group' (总体总结)
    summary_type VARCHAR(20) NOT NULL CHECK (summary_type IN ('conversation', 'session_group')),
    
    -- For individual conversation summary
    conversation_id UUID REFERENCES rufus_conversations(id) ON DELETE CASCADE,
    
    -- For session group summary (e.g., 'asin_B0XXXXX', 'keyword_YYYYY', 'session_ZZZZZ')
    session_group_id VARCHAR(255),
    
    -- Page type for context
    page_type VARCHAR(30) NOT NULL DEFAULT 'product_detail',
    
    -- Summary content
    summary_text TEXT NOT NULL,
    
    -- User who owns this summary
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Create indexes for performance
-- ============================================================

-- Index for querying by conversation
CREATE INDEX IF NOT EXISTS idx_rufus_summaries_conversation_id 
    ON rufus_summaries(conversation_id) 
    WHERE conversation_id IS NOT NULL;

-- Index for querying by session group (most important queries)
CREATE INDEX IF NOT EXISTS idx_rufus_summaries_session_group_id 
    ON rufus_summaries(session_group_id) 
    WHERE session_group_id IS NOT NULL;

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_rufus_summaries_user_id 
    ON rufus_summaries(user_id) 
    WHERE user_id IS NOT NULL;

-- Index for querying by type and page_type
CREATE INDEX IF NOT EXISTS idx_rufus_summaries_type_page 
    ON rufus_summaries(summary_type, page_type);

-- Unique constraint: one summary per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_rufus_summaries_unique_conversation 
    ON rufus_summaries(conversation_id) 
    WHERE conversation_id IS NOT NULL;

-- Unique constraint: one summary per session group
CREATE UNIQUE INDEX IF NOT EXISTS idx_rufus_summaries_unique_session_group 
    ON rufus_summaries(session_group_id) 
    WHERE session_group_id IS NOT NULL;

-- ============================================================
-- Add comments for documentation
-- ============================================================

COMMENT ON TABLE rufus_summaries IS 'Stores AI-generated summaries for Rufus conversations at two levels: individual conversation summaries and session group summaries';
COMMENT ON COLUMN rufus_summaries.summary_type IS 'Type of summary: conversation (单个对话总结) or session_group (总体总结)';
COMMENT ON COLUMN rufus_summaries.conversation_id IS 'Reference to individual conversation (for conversation-type summaries)';
COMMENT ON COLUMN rufus_summaries.session_group_id IS 'Session group identifier (e.g., asin_B0XXXXX, keyword_YYYYY, session_ZZZZZ) for session_group-type summaries';
COMMENT ON COLUMN rufus_summaries.page_type IS 'Page type context: homepage, keyword_search, or product_detail';
COMMENT ON COLUMN rufus_summaries.summary_text IS 'The AI-generated summary content';
COMMENT ON COLUMN rufus_summaries.user_id IS 'User who owns this summary';
