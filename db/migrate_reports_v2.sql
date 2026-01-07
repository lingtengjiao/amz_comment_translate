-- =====================================================
-- Migration: 报告系统升级 v2 - 四位一体决策中台
-- =====================================================
-- 此迁移脚本用于升级 product_reports 表，支持：
-- 1. 新增报告类型索引
-- 2. 确保 report_type 字段支持四种类型
-- =====================================================

-- 1. 添加报告类型字段索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_reports_report_type ON product_reports(report_type);

-- 2. 添加组合索引（产品+类型，用于快速筛选）
CREATE INDEX IF NOT EXISTS idx_reports_product_type ON product_reports(product_id, report_type);

-- 3. 添加时间+类型组合索引（用于历史报告排序）
CREATE INDEX IF NOT EXISTS idx_reports_type_created ON product_reports(report_type, created_at DESC);

-- 4. 确保 content 字段可以存储大量 JSON 数据（TEXT 类型通常不需要修改）
-- PostgreSQL 的 TEXT 类型支持最大 1GB 数据

-- 5. 确保 analysis_data 字段是 JSONB 类型（支持 JSON 索引）
-- 如果之前是 JSON 类型，可以用以下命令转换（谨慎使用，可能导致数据丢失）
-- ALTER TABLE product_reports ALTER COLUMN analysis_data TYPE JSONB USING analysis_data::JSONB;

-- 6. 添加 JSONB 索引（用于查询 analysis_data 中的特定字段）
CREATE INDEX IF NOT EXISTS idx_reports_analysis_data ON product_reports USING GIN (analysis_data);

-- =====================================================
-- 完成！
-- 支持的报告类型：
-- - comprehensive: CEO/综合战略版
-- - operations: CMO/运营市场版
-- - product: CPO/产品研发版
-- - supply_chain: 供应链/质检版
-- =====================================================

