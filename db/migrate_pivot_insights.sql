-- 数据透视洞察表
-- 存储数据透视板块的AI解读数据，整合product_dimension_summaries功能
CREATE TABLE IF NOT EXISTS product_pivot_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- 洞察类型：audience(人群), demand(需求), product(产品), scenario(场景), brand(品牌)
    -- 或者 dimension_summary(维度总结，兼容原product_dimension_summaries)
    insight_type VARCHAR(50) NOT NULL,
    
    -- 子类型：例如 decision_flow(决策链路), strength_mapping(人群-卖点匹配) 等
    sub_type VARCHAR(100),
    
    -- 维度名称（用于dimension_summary类型）
    dimension VARCHAR(100),
    
    -- 总结类型（用于dimension_summary类型，兼容原表）
    -- 例如：consumer_persona, overall, strengths, weaknesses, suggestions
    summary_type VARCHAR(50),
    
    -- AI生成的洞察内容（JSON格式）
    -- 结构：{ keyFindings: [], dataSupport: [], recommendations: [], severity: 'normal'|'warning'|'critical' }
    insight_data JSONB NOT NULL DEFAULT '{}',
    
    -- 原始数据（用于重新生成）
    raw_data JSONB DEFAULT '{}',
    
    -- 置信度分数 (0-1)
    confidence DECIMAL(3,2),
    
    -- 生成状态
    generation_status VARCHAR(20) DEFAULT 'pending',
    
    -- 错误信息
    error_message TEXT,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 索引
    CONSTRAINT unique_product_insight UNIQUE (product_id, insight_type, sub_type, dimension, summary_type)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pivot_insights_product ON product_pivot_insights(product_id);
CREATE INDEX IF NOT EXISTS idx_pivot_insights_type ON product_pivot_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_pivot_insights_status ON product_pivot_insights(generation_status);

-- 从 product_dimension_summaries 迁移数据
-- 检查表是否存在
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_dimension_summaries') THEN
        INSERT INTO product_pivot_insights (
            product_id,
            insight_type,
            dimension,
            summary_type,
            insight_data,
            confidence,
            generation_status,
            created_at,
            updated_at
        )
        SELECT 
            pds.product_id,
            'dimension_summary' as insight_type,
            pds.dimension,
            pds.summary_type,
            jsonb_build_object(
                'summary', pds.summary,
                'keyPoints', pds.key_points
            ) as insight_data,
            pds.confidence,
            'completed' as generation_status,
            pds.created_at,
            pds.updated_at
        FROM product_dimension_summaries pds
        ON CONFLICT (product_id, insight_type, sub_type, dimension, summary_type) 
        DO UPDATE SET
            insight_data = EXCLUDED.insight_data,
            confidence = EXCLUDED.confidence,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
END $$;

COMMENT ON TABLE product_pivot_insights IS '产品数据透视AI洞察表';
COMMENT ON COLUMN product_pivot_insights.insight_type IS '洞察类型：audience/demand/product/scenario/brand/dimension_summary';
COMMENT ON COLUMN product_pivot_insights.sub_type IS '子类型：decision_flow/strength_mapping等';
COMMENT ON COLUMN product_pivot_insights.insight_data IS 'AI生成的洞察内容JSON';
COMMENT ON COLUMN product_pivot_insights.raw_data IS '用于重新生成的原始数据';
