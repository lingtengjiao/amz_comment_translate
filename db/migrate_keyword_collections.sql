-- 关键词产品库迁移脚本
-- 新增表：keyword_collections 和 collection_products
-- 执行时间：2026-01-19

-- =============================================
-- 1. 创建 keyword_collections 表（关键词产品库）
-- =============================================
CREATE TABLE IF NOT EXISTS keyword_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword VARCHAR(500) NOT NULL,
    marketplace VARCHAR(20) DEFAULT 'US',
    product_count INTEGER DEFAULT 0,
    description TEXT,
    board_config JSONB,
    view_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_keyword_collections_user_id ON keyword_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_keyword_collections_keyword ON keyword_collections(keyword);

-- 添加注释
COMMENT ON TABLE keyword_collections IS '关键词产品库：存储用户在亚马逊搜索结果页采集的产品快照';
COMMENT ON COLUMN keyword_collections.keyword IS '搜索关键词';
COMMENT ON COLUMN keyword_collections.marketplace IS '亚马逊站点（US, UK, DE, FR, JP, AU）';
COMMENT ON COLUMN keyword_collections.product_count IS '产品数量';
COMMENT ON COLUMN keyword_collections.description IS '用户备注';
COMMENT ON COLUMN keyword_collections.board_config IS '画板配置（JSON 格式）：画板列表和产品映射';
COMMENT ON COLUMN keyword_collections.view_config IS '视图配置（JSON 格式）：颜色规则、年份区间、排名区间、价格区间、销量区间、品牌区间等';


-- =============================================
-- 2. 创建 collection_products 表（产品库明细）
-- =============================================
CREATE TABLE IF NOT EXISTS collection_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES keyword_collections(id) ON DELETE CASCADE,
    asin VARCHAR(20) NOT NULL,
    title VARCHAR(500),
    image_url VARCHAR(2000) NOT NULL,
    product_url VARCHAR(2000) NOT NULL,
    price VARCHAR(100),
    rating NUMERIC(3, 2),
    review_count INTEGER,
    sales_volume INTEGER,
    sales_volume_manual INTEGER,
    sales_volume_text VARCHAR(200),
    is_sponsored BOOLEAN DEFAULT FALSE,
    position INTEGER,
    major_category_rank INTEGER,
    minor_category_rank INTEGER,
    major_category_name VARCHAR(200),
    minor_category_name VARCHAR(200),
    year INTEGER,
    brand VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_collection_products_collection_id ON collection_products(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_asin ON collection_products(asin);
CREATE INDEX IF NOT EXISTS idx_collection_products_brand ON collection_products(brand);

-- 添加注释
COMMENT ON TABLE collection_products IS '产品库明细：存储产品的快照信息';
COMMENT ON COLUMN collection_products.asin IS '产品 ASIN';
COMMENT ON COLUMN collection_products.title IS '产品标题';
COMMENT ON COLUMN collection_products.image_url IS '产品图片 URL';
COMMENT ON COLUMN collection_products.product_url IS '产品链接 URL';
COMMENT ON COLUMN collection_products.price IS '价格（含货币符号）';
COMMENT ON COLUMN collection_products.rating IS '评分（0-5）';
COMMENT ON COLUMN collection_products.review_count IS '评论数';
COMMENT ON COLUMN collection_products.sales_volume IS '初步估算销售量';
COMMENT ON COLUMN collection_products.sales_volume_manual IS '补充数据的销售量（手动输入或导入）';
COMMENT ON COLUMN collection_products.sales_volume_text IS '销量原始文本（如 9K+ bought in past month）';
COMMENT ON COLUMN collection_products.is_sponsored IS '是否为广告产品';
COMMENT ON COLUMN collection_products.position IS '在搜索结果中的页面位置';
COMMENT ON COLUMN collection_products.major_category_rank IS '大类排名';
COMMENT ON COLUMN collection_products.minor_category_rank IS '小类排名';
COMMENT ON COLUMN collection_products.major_category_name IS '大类名称';
COMMENT ON COLUMN collection_products.minor_category_name IS '小类名称';
COMMENT ON COLUMN collection_products.year IS '产品上架年份';
COMMENT ON COLUMN collection_products.brand IS '产品品牌';


-- =============================================
-- 3. 验证表是否创建成功
-- =============================================
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN ('keyword_collections', 'collection_products')
ORDER BY table_name;
