-- Migration: Create product_context_labels table for 5W model
-- 迁移：创建 5W 营销要素标签表

-- Create the table
CREATE TABLE IF NOT EXISTS product_context_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,           -- who/where/when/why/what
    name VARCHAR(100) NOT NULL,          -- 标准标签名称
    description TEXT,                    -- 标签定义/描述
    count INTEGER DEFAULT 0,             -- 命中次数
    is_ai_generated BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: same product + type + name
    CONSTRAINT uix_product_context_label UNIQUE (product_id, type, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_context_labels_product ON product_context_labels(product_id);
CREATE INDEX IF NOT EXISTS idx_context_labels_type ON product_context_labels(type);
CREATE INDEX IF NOT EXISTS idx_context_labels_count ON product_context_labels(count DESC);

-- Add comments
COMMENT ON TABLE product_context_labels IS '产品5W上下文标签表 - 存储AI学习到的标准标签';
COMMENT ON COLUMN product_context_labels.type IS '5W类型：who/where/when/why/what';
COMMENT ON COLUMN product_context_labels.name IS '标准标签名称，如：老年人、宠物主、睡前';
COMMENT ON COLUMN product_context_labels.description IS '标签定义，用于指导AI归类';
COMMENT ON COLUMN product_context_labels.count IS '该标签被命中的次数，用于热度排序';
COMMENT ON COLUMN product_context_labels.is_ai_generated IS '是否由AI自动生成';

