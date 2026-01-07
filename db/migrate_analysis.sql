-- =============================================================
-- Migration: Analysis Projects (对比分析模块)
-- Description: 创建分析项目相关表，支持竞品对比和迭代验证
-- =============================================================

-- 1. 创建分析项目表
-- 存储分析项目的基本信息（如"竞品对比A vs B"）
CREATE TABLE IF NOT EXISTS analysis_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 分析类型：目前主要是 'comparison'
    -- 可选值: 'comparison' (对比分析), 'overall' (整体分析)
    analysis_type VARCHAR(50) DEFAULT 'comparison',
    
    -- 状态流转: pending -> processing -> completed/failed
    status VARCHAR(50) DEFAULT 'pending',
    
    -- AI 生成的分析结论 (JSON格式)
    -- 结构示例: {"winner": "Product A", "matrix": [...], "conclusion": "..."}
    result_content JSONB,
    
    -- 对比时的原始聚合数据快照
    -- 结构示例: {"product_A": {...stats...}, "product_B": {...stats...}}
    -- 存下来的目的是：即使产品后续有了新评论，这份历史报告的数据基准不变
    raw_data_snapshot JSONB,
    
    -- 错误信息（如果失败）
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 2. 创建分析项目明细表
-- 存储这个项目里包含了哪些产品（多对多关联的实体化）
CREATE TABLE IF NOT EXISTS analysis_project_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 关联的分析项目
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    
    -- 关联的产品
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- 产品角色标签
    -- 例如: 'target' (本品), 'competitor' (竞品), 'gen1' (一代), 'gen2' (二代)
    role_label VARCHAR(50),
    
    -- 显示顺序（用于前端排序）
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引以优化查询性能
-- 按创建时间倒序查询项目列表
CREATE INDEX IF NOT EXISTS idx_analysis_project_created 
    ON analysis_projects(created_at DESC);

-- 按状态筛选项目
CREATE INDEX IF NOT EXISTS idx_analysis_project_status 
    ON analysis_projects(status);

-- 按类型筛选项目
CREATE INDEX IF NOT EXISTS idx_analysis_project_type 
    ON analysis_projects(analysis_type);

-- 按项目ID查询明细
CREATE INDEX IF NOT EXISTS idx_analysis_item_project 
    ON analysis_project_items(project_id);

-- 按产品ID查询关联的分析项目
CREATE INDEX IF NOT EXISTS idx_analysis_item_product 
    ON analysis_project_items(product_id);

-- 4. 添加注释
COMMENT ON TABLE analysis_projects IS '分析项目表 - 用于组织竞品对比、迭代验证等分析任务';
COMMENT ON TABLE analysis_project_items IS '分析项目明细表 - 存储项目包含的产品及其角色';

COMMENT ON COLUMN analysis_projects.analysis_type IS '分析类型: comparison(对比分析), overall(整体分析)';
COMMENT ON COLUMN analysis_projects.status IS '状态: pending, processing, completed, failed';
COMMENT ON COLUMN analysis_projects.result_content IS 'AI 生成的分析结论 (JSON格式)';
COMMENT ON COLUMN analysis_projects.raw_data_snapshot IS '原始聚合数据快照，用于保证历史报告数据基准不变';

COMMENT ON COLUMN analysis_project_items.role_label IS '产品角色: target(本品), competitor(竞品), gen1(一代), gen2(二代)';
COMMENT ON COLUMN analysis_project_items.display_order IS '显示顺序，用于前端排序';

-- =============================================================
-- 验证迁移
-- =============================================================
DO $$
BEGIN
    -- 检查表是否创建成功
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'analysis_projects'
    ) THEN
        RAISE NOTICE 'Migration successful: analysis_projects table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: analysis_projects table not found';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'analysis_project_items'
    ) THEN
        RAISE NOTICE 'Migration successful: analysis_project_items table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: analysis_project_items table not found';
    END IF;
END $$;

