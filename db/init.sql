-- VOC-Master Database Initialization Script

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asin VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(500),
    image_url TEXT,
    marketplace VARCHAR(20) DEFAULT 'US',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    review_id VARCHAR(50) NOT NULL,
    author VARCHAR(200),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title_original TEXT,
    title_translated TEXT,
    body_original TEXT NOT NULL,
    body_translated TEXT,
    review_date DATE,
    verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_votes INTEGER DEFAULT 0,
    sentiment VARCHAR(20) DEFAULT 'neutral',
    translation_status VARCHAR(20) DEFAULT 'pending',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_hidden BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_review_per_product UNIQUE (product_id, review_id)
);

-- Create tasks table for tracking async jobs
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create review_insights table for AI-generated insights
CREATE TABLE IF NOT EXISTS review_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,  -- strength, weakness, suggestion, scenario, emotion
    quote TEXT NOT NULL,
    quote_translated TEXT,
    analysis TEXT NOT NULL,
    dimension VARCHAR(50),  -- quality, price, appearance, function, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create review_theme_highlights table for AI-extracted theme content
CREATE TABLE IF NOT EXISTS review_theme_highlights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    theme_type VARCHAR(30) NOT NULL,  -- who/where/when/unmet_needs/pain_points/benefits/features/comparison
    items JSONB NOT NULL DEFAULT '[]',  -- 该主题识别到的内容项列表，每个项包含content/content_original/content_translated/explanation
    keywords JSONB,  -- 已废弃：向后兼容字段
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_translation_status ON reviews(translation_status);
CREATE INDEX IF NOT EXISTS idx_reviews_is_pinned ON reviews(is_pinned);
CREATE INDEX IF NOT EXISTS idx_reviews_is_hidden ON reviews(is_hidden);
CREATE INDEX IF NOT EXISTS idx_reviews_is_deleted ON reviews(is_deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_product_id ON tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_review_insights_review_id ON review_insights(review_id);
CREATE INDEX IF NOT EXISTS idx_review_insights_type ON review_insights(type);
CREATE INDEX IF NOT EXISTS idx_review_theme_highlights_review_id ON review_theme_highlights(review_id);
CREATE INDEX IF NOT EXISTS idx_review_theme_highlights_theme_type ON review_theme_highlights(theme_type);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add is_pinned, is_hidden, and is_deleted columns if they don't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='is_pinned') THEN
        ALTER TABLE reviews ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_reviews_is_pinned ON reviews(is_pinned);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='is_hidden') THEN
        ALTER TABLE reviews ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_reviews_is_hidden ON reviews(is_hidden);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='is_deleted') THEN
        ALTER TABLE reviews ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_reviews_is_deleted ON reviews(is_deleted);
    END IF;
END $$;

