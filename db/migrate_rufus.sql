-- Migration: Add rufus_conversations table
-- Description: Stores conversations with Amazon Rufus AI for product analysis
-- Date: 2024-01-16
-- Updated: 2026-01-16 - Added question_index field

-- Create rufus_conversations table
CREATE TABLE IF NOT EXISTS rufus_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asin VARCHAR(20) NOT NULL,
    marketplace VARCHAR(10) NOT NULL DEFAULT 'US',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT 'wish_it_had',
    question_index INTEGER NOT NULL DEFAULT 0,
    conversation_id VARCHAR(100),
    raw_html TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add question_index column if table already exists (for upgrades)
ALTER TABLE rufus_conversations 
ADD COLUMN IF NOT EXISTS question_index INTEGER NOT NULL DEFAULT 0;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_asin ON rufus_conversations(asin);
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_user_id ON rufus_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_question_type ON rufus_conversations(question_type);
CREATE INDEX IF NOT EXISTS idx_rufus_conversations_created_at ON rufus_conversations(created_at);

-- Add comments for documentation
COMMENT ON TABLE rufus_conversations IS 'Stores conversations with Amazon Rufus AI';
COMMENT ON COLUMN rufus_conversations.asin IS 'Amazon product ASIN';
COMMENT ON COLUMN rufus_conversations.marketplace IS 'Amazon marketplace (US, UK, AU, etc.)';
COMMENT ON COLUMN rufus_conversations.question IS 'Question asked to Rufus';
COMMENT ON COLUMN rufus_conversations.answer IS 'Rufus response';
COMMENT ON COLUMN rufus_conversations.question_type IS 'Type of question (wish_it_had, quality_issues, price_value, comparison, use_scenarios, positive_highlights)';
COMMENT ON COLUMN rufus_conversations.question_index IS 'Index of question within the topic (0-based)';
COMMENT ON COLUMN rufus_conversations.conversation_id IS 'Optional conversation ID from Rufus';
COMMENT ON COLUMN rufus_conversations.raw_html IS 'Optional raw HTML for debugging';
COMMENT ON COLUMN rufus_conversations.user_id IS 'User who initiated the conversation';
