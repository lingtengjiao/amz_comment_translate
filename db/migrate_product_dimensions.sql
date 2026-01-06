-- 产品维度表迁移脚本
-- Product Dimensions Table Migration
-- 用于存储 AI 学习到的产品专属评价维度

-- 创建 product_dimensions 表
CREATE TABLE IF NOT EXISTS product_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_ai_generated BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以加速按产品 ID 查询
CREATE INDEX IF NOT EXISTS idx_product_dimensions_product_id ON product_dimensions(product_id);

-- 创建唯一索引，防止同一产品下的维度名称重复
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_dimensions_unique_name 
ON product_dimensions(product_id, name);

-- 添加注释
COMMENT ON TABLE product_dimensions IS '产品评价维度表 - 存储 AI 学习到的产品专属评价维度';
COMMENT ON COLUMN product_dimensions.id IS '唯一标识符';
COMMENT ON COLUMN product_dimensions.product_id IS '关联的产品 ID';
COMMENT ON COLUMN product_dimensions.name IS '维度名称，如：电池续航、外观设计';
COMMENT ON COLUMN product_dimensions.description IS '维度定义，用于指导 AI 归类';
COMMENT ON COLUMN product_dimensions.is_ai_generated IS '是否由 AI 自动生成';
COMMENT ON COLUMN product_dimensions.created_at IS '创建时间';
COMMENT ON COLUMN product_dimensions.updated_at IS '更新时间';

-- 可选：创建更新时间触发器
CREATE OR REPLACE FUNCTION update_product_dimensions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_dimensions_updated_at ON product_dimensions;
CREATE TRIGGER trigger_product_dimensions_updated_at
    BEFORE UPDATE ON product_dimensions
    FOR EACH ROW
    EXECUTE FUNCTION update_product_dimensions_updated_at();

