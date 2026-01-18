-- =============================================================
-- Migration: Project Level Learning (项目级维度/标签学习模块)
-- Description: 创建项目级维度、标签及其与产品级的映射关系表
-- Date: 2026-01-17
-- =============================================================

-- 1. 创建项目级维度表
-- 存储市场洞察项目的统一维度定义（聚合自多个产品）
CREATE TABLE IF NOT EXISTS project_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 关联的分析项目（必须是 market_insight 类型）
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    
    -- 维度名称，如 "便携性能"、"续航表现"
    name VARCHAR(100) NOT NULL,
    
    -- 维度定义，用于指导 AI 归类
    description TEXT,
    
    -- 维度类型：product(产品维度), scenario(场景维度), emotion(情绪维度)
    dimension_type VARCHAR(20) NOT NULL DEFAULT 'product',
    
    -- 是否由 AI 自动生成
    is_ai_generated BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建项目级5W标签表
-- 存储市场洞察项目的统一5W标签定义（聚合自多个产品）
CREATE TABLE IF NOT EXISTS project_context_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 关联的分析项目（必须是 market_insight 类型）
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    
    -- 5W 类型：buyer/user/where/when/why/what
    type VARCHAR(20) NOT NULL,
    
    -- 标签名称，如 "老年群体"、"儿童用户"
    name VARCHAR(100) NOT NULL,
    
    -- 标签定义/描述
    description TEXT,
    
    -- 是否由 AI 自动生成
    is_ai_generated BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建维度映射表
-- 建立项目级维度与产品级维度的映射关系（1:N）
CREATE TABLE IF NOT EXISTS project_dimension_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 项目级维度 ID
    project_dimension_id UUID NOT NULL REFERENCES project_dimensions(id) ON DELETE CASCADE,
    
    -- 产品级维度 ID
    product_dimension_id UUID NOT NULL REFERENCES product_dimensions(id) ON DELETE CASCADE,
    
    -- 产品 ID（冗余字段，便于查询）
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 唯一约束：同一项目维度下，一个产品维度只能映射一次
    UNIQUE(project_dimension_id, product_dimension_id)
);

-- 4. 创建标签映射表
-- 建立项目级标签与产品级标签的映射关系（1:N）
CREATE TABLE IF NOT EXISTS project_label_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 项目级标签 ID
    project_label_id UUID NOT NULL REFERENCES project_context_labels(id) ON DELETE CASCADE,
    
    -- 产品级标签 ID
    product_label_id UUID NOT NULL REFERENCES product_context_labels(id) ON DELETE CASCADE,
    
    -- 产品 ID（冗余字段，便于查询）
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 唯一约束：同一项目标签下，一个产品标签只能映射一次
    UNIQUE(project_label_id, product_label_id)
);

-- =============================================================
-- 创建索引以优化查询性能
-- =============================================================

-- 项目级维度表索引
CREATE INDEX IF NOT EXISTS idx_project_dimensions_project 
    ON project_dimensions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_dimensions_type 
    ON project_dimensions(dimension_type);

-- 项目级标签表索引
CREATE INDEX IF NOT EXISTS idx_project_labels_project 
    ON project_context_labels(project_id);
CREATE INDEX IF NOT EXISTS idx_project_labels_type 
    ON project_context_labels(type);

-- 维度映射表索引
CREATE INDEX IF NOT EXISTS idx_dim_mapping_project_dim 
    ON project_dimension_mappings(project_dimension_id);
CREATE INDEX IF NOT EXISTS idx_dim_mapping_product_dim 
    ON project_dimension_mappings(product_dimension_id);
CREATE INDEX IF NOT EXISTS idx_dim_mapping_product 
    ON project_dimension_mappings(product_id);

-- 标签映射表索引
CREATE INDEX IF NOT EXISTS idx_label_mapping_project_label 
    ON project_label_mappings(project_label_id);
CREATE INDEX IF NOT EXISTS idx_label_mapping_product_label 
    ON project_label_mappings(product_label_id);
CREATE INDEX IF NOT EXISTS idx_label_mapping_product 
    ON project_label_mappings(product_id);

-- =============================================================
-- 添加注释
-- =============================================================

COMMENT ON TABLE project_dimensions IS '项目级维度表 - 存储市场洞察项目的统一维度定义（聚合自多个产品）';
COMMENT ON TABLE project_context_labels IS '项目级5W标签表 - 存储市场洞察项目的统一5W标签定义（聚合自多个产品）';
COMMENT ON TABLE project_dimension_mappings IS '维度映射表 - 建立项目级维度与产品级维度的映射关系';
COMMENT ON TABLE project_label_mappings IS '标签映射表 - 建立项目级标签与产品级标签的映射关系';

COMMENT ON COLUMN project_dimensions.dimension_type IS '维度类型: product(产品维度), scenario(场景维度), emotion(情绪维度)';
COMMENT ON COLUMN project_context_labels.type IS '5W类型: buyer/user/where/when/why/what';

COMMENT ON COLUMN project_dimension_mappings.product_id IS '产品ID（冗余字段，便于按产品查询映射关系）';
COMMENT ON COLUMN project_label_mappings.product_id IS '产品ID（冗余字段，便于按产品查询映射关系）';

-- =============================================================
-- 验证迁移
-- =============================================================
DO $$
BEGIN
    -- 检查 project_dimensions 表
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'project_dimensions'
    ) THEN
        RAISE NOTICE 'Migration successful: project_dimensions table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: project_dimensions table not found';
    END IF;
    
    -- 检查 project_context_labels 表
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'project_context_labels'
    ) THEN
        RAISE NOTICE 'Migration successful: project_context_labels table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: project_context_labels table not found';
    END IF;
    
    -- 检查 project_dimension_mappings 表
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'project_dimension_mappings'
    ) THEN
        RAISE NOTICE 'Migration successful: project_dimension_mappings table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: project_dimension_mappings table not found';
    END IF;
    
    -- 检查 project_label_mappings 表
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'project_label_mappings'
    ) THEN
        RAISE NOTICE 'Migration successful: project_label_mappings table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: project_label_mappings table not found';
    END IF;
    
    RAISE NOTICE 'All 4 tables for project-level learning created successfully!';
END $$;
