-- 维度总结表 - 打通微观(单条评论)到宏观(项目报告)的桥梁
-- 存储5W主题总结、产品维度总结、消费者原型等AI生成内容

CREATE TABLE IF NOT EXISTS product_dimension_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- 总结类型
    -- theme_buyer, theme_user, theme_where, theme_when, theme_why, theme_what (5W主题总结)
    -- dimension (产品维度总结)
    -- emotion (情感维度总结)
    -- scenario (场景维度总结)
    -- consumer_persona (消费者原型)
    -- overall (整体数据总结)
    summary_type VARCHAR(50) NOT NULL,
    
    -- 具体分类名称（如：质感体验、清洁收纳、失望不满 等）
    category VARCHAR(200),
    
    -- AI生成内容
    title VARCHAR(500),                    -- 标题/名称
    summary TEXT,                          -- 总结内容
    key_points JSONB DEFAULT '[]'::jsonb,  -- 核心要点列表 [{"point": "...", "evidence_count": 10}]
    evidence_count INTEGER DEFAULT 0,      -- 支撑证据数量
    sentiment_tendency VARCHAR(20),        -- positive/negative/neutral/mixed
    
    -- 消费者原型专用字段
    persona_data JSONB,                    -- {"buyer": "宝妈", "user": "学龄前儿童", "why": "感官发育", ...}
    
    -- 元数据
    ai_model VARCHAR(50) DEFAULT 'qwen-max',
    confidence FLOAT DEFAULT 0.8,
    raw_response JSONB,                    -- AI原始响应（用于调试）
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_dimension_summaries_product ON product_dimension_summaries(product_id);
CREATE INDEX IF NOT EXISTS idx_dimension_summaries_type ON product_dimension_summaries(summary_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dimension_summaries_unique ON product_dimension_summaries(product_id, summary_type, category) WHERE category IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dimension_summaries_unique_no_cat ON product_dimension_summaries(product_id, summary_type) WHERE category IS NULL;

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_dimension_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_dimension_summaries_updated_at ON product_dimension_summaries;
CREATE TRIGGER trigger_dimension_summaries_updated_at
    BEFORE UPDATE ON product_dimension_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_dimension_summaries_updated_at();

-- 注释
COMMENT ON TABLE product_dimension_summaries IS '产品维度总结表 - 存储AI生成的中观层分析内容';
COMMENT ON COLUMN product_dimension_summaries.summary_type IS '总结类型: theme_buyer/user/where/when/why/what, dimension, emotion, scenario, consumer_persona, overall';
COMMENT ON COLUMN product_dimension_summaries.category IS '具体分类名称，如维度名、情感类型名等';
COMMENT ON COLUMN product_dimension_summaries.key_points IS '核心要点JSON数组';
COMMENT ON COLUMN product_dimension_summaries.persona_data IS '消费者原型专用，存储5W组合数据';
