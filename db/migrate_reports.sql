-- =====================================================
-- Product Reports Table Migration
-- 产品分析报告持久化存储表
-- =====================================================
-- 功能：
-- 1. 存储 AI 生成的 Markdown 报告内容
-- 2. 保存结构化分析数据（用于前端可视化）
-- 3. 支持历史报告回溯和版本对比
-- =====================================================

-- 确保 uuid-ossp 扩展存在
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建报告表
CREATE TABLE IF NOT EXISTS product_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- 核心内容
    title VARCHAR(255),              -- 报告标题 (如 "2024Q1 深度分析报告")
    content TEXT NOT NULL,           -- 完整的 Markdown 报告内容
    
    -- 结构化数据 (用于前端可视化图表)
    -- 存入: { 
    --   "total_reviews": 150,
    --   "context_stats": { "who": "老年人(45), ...", ... },
    --   "insight_stats": { "weakness": "...", "strength": "..." },
    --   "top_who": [{"name": "老年人", "count": 45}, ...],
    --   "top_weaknesses": [{"dimension": "电池续航", "count": 25, "quotes": [...]}, ...]
    -- }
    analysis_data JSONB DEFAULT '{}',
    
    -- 元数据
    report_type VARCHAR(50) DEFAULT 'comprehensive', -- comprehensive/marketing/research
    status VARCHAR(20) DEFAULT 'completed',          -- creating, completed, failed
    error_message TEXT,                              -- 如果失败，记录错误信息
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_product_id ON product_reports(product_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON product_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type ON product_reports(report_type);

-- 注释
COMMENT ON TABLE product_reports IS '产品分析报告存储表，持久化 AI 生成的深度报告';
COMMENT ON COLUMN product_reports.content IS 'AI 生成的 Markdown 格式报告内容';
COMMENT ON COLUMN product_reports.analysis_data IS '结构化分析数据快照，用于前端可视化展示';
COMMENT ON COLUMN product_reports.report_type IS '报告类型：comprehensive(综合)/marketing(营销)/research(研发)';

-- 完成提示
SELECT 'Product reports table migration completed successfully' AS status;

