-- 毛利计算功能数据库迁移脚本
-- Migration for Profit Calculator Feature

-- ============================================================
-- 1. 产品毛利表 - 存储用户录入的产品信息
-- ============================================================
CREATE TABLE IF NOT EXISTS profit_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    -- 产品尺寸
    length_cm DECIMAL(10, 2) NOT NULL,  -- 长度（厘米）
    width_cm DECIMAL(10, 2) NOT NULL,   -- 宽度（厘米）
    height_cm DECIMAL(10, 2) NOT NULL,  -- 高度（厘米）
    weight_g DECIMAL(10, 2) NOT NULL,   -- 重量（克）
    -- 价格和成本
    selling_price_usd DECIMAL(10, 2) NOT NULL,  -- 预期售价（美元）
    total_cost_cny DECIMAL(10, 2) NOT NULL,     -- 总成本（人民币）
    -- 可选字段
    category VARCHAR(100),              -- 产品类目（用于佣金计算）
    notes TEXT,                         -- 备注
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_profit_products_user_id ON profit_products(user_id);
CREATE INDEX IF NOT EXISTS idx_profit_products_created_at ON profit_products(created_at);

-- ============================================================
-- 2. FBA配送费率表 - 按尺寸分段存储费率
-- ============================================================
CREATE TABLE IF NOT EXISTS fba_fee_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL表示系统默认规则
    size_tier VARCHAR(50) NOT NULL,     -- 尺寸分段名称：Small Standard, Large Standard, etc.
    weight_min_oz DECIMAL(10, 2),       -- 最小重量（盎司）
    weight_max_oz DECIMAL(10, 2),       -- 最大重量（盎司）
    fee_usd DECIMAL(10, 2) NOT NULL,    -- FBA费用（美元）
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fba_fee_rules_user_id ON fba_fee_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_fba_fee_rules_size_tier ON fba_fee_rules(size_tier);

-- ============================================================
-- 3. 亚马逊佣金比例表 - 按品类存储佣金比例
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_fee_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL表示系统默认规则
    category VARCHAR(100) NOT NULL,         -- 产品类目
    fee_percentage DECIMAL(5, 2) NOT NULL,  -- 佣金比例（百分比，如15.00表示15%）
    min_fee_usd DECIMAL(10, 2) DEFAULT 0,   -- 最低佣金（美元）
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_fee_rules_user_id ON referral_fee_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_fee_rules_category ON referral_fee_rules(category);

-- ============================================================
-- 4. 头程运费费率表 - 普海/美森/空运
-- ============================================================
CREATE TABLE IF NOT EXISTS shipping_fee_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL表示系统默认规则
    shipping_type VARCHAR(20) NOT NULL,     -- 运输方式：sea_standard（普海）, sea_express（美森）, air（空运）
    rate_per_unit DECIMAL(10, 2) NOT NULL,  -- 单位费率
    unit_type VARCHAR(20) NOT NULL,         -- 计费单位：cbm（立方米）, kg（公斤）
    description VARCHAR(200),               -- 描述
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_fee_rules_user_id ON shipping_fee_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_shipping_fee_rules_shipping_type ON shipping_fee_rules(shipping_type);

-- ============================================================
-- 5. 汇率配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL表示系统默认规则
    currency_pair VARCHAR(10) NOT NULL,     -- 货币对：USD_CNY
    rate DECIMAL(10, 4) NOT NULL,           -- 汇率
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_user_id ON exchange_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_pair ON exchange_rates(currency_pair);

-- ============================================================
-- 6. 其他费用规则表 - 关税、配置金等
-- ============================================================
CREATE TABLE IF NOT EXISTS other_cost_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL表示系统默认规则
    rule_name VARCHAR(100) NOT NULL,        -- 规则名称：tariff（关税）, handling_fee（配置金）等
    rule_type VARCHAR(20) NOT NULL,         -- 规则类型：percentage（百分比）, fixed（固定金额）
    value DECIMAL(10, 4) NOT NULL,          -- 值：百分比或固定金额
    base_field VARCHAR(50),                 -- 基准字段（百分比类型时使用）：cost, selling_price等
    description VARCHAR(200),               -- 描述
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_other_cost_rules_user_id ON other_cost_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_other_cost_rules_rule_name ON other_cost_rules(rule_name);

-- ============================================================
-- 添加更新时间触发器
-- ============================================================
DROP TRIGGER IF EXISTS update_profit_products_updated_at ON profit_products;
CREATE TRIGGER update_profit_products_updated_at
    BEFORE UPDATE ON profit_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fba_fee_rules_updated_at ON fba_fee_rules;
CREATE TRIGGER update_fba_fee_rules_updated_at
    BEFORE UPDATE ON fba_fee_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_referral_fee_rules_updated_at ON referral_fee_rules;
CREATE TRIGGER update_referral_fee_rules_updated_at
    BEFORE UPDATE ON referral_fee_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shipping_fee_rules_updated_at ON shipping_fee_rules;
CREATE TRIGGER update_shipping_fee_rules_updated_at
    BEFORE UPDATE ON shipping_fee_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_exchange_rates_updated_at ON exchange_rates;
CREATE TRIGGER update_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_other_cost_rules_updated_at ON other_cost_rules;
CREATE TRIGGER update_other_cost_rules_updated_at
    BEFORE UPDATE ON other_cost_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 插入默认系统规则数据
-- ============================================================

-- 默认FBA费率（2024/2025年标准 - 简化版本）
INSERT INTO fba_fee_rules (id, user_id, size_tier, weight_min_oz, weight_max_oz, fee_usd, is_active) VALUES
-- Small Standard Size
(uuid_generate_v4(), NULL, 'Small Standard', 0, 4, 3.22, TRUE),
(uuid_generate_v4(), NULL, 'Small Standard', 4, 8, 3.40, TRUE),
(uuid_generate_v4(), NULL, 'Small Standard', 8, 12, 3.58, TRUE),
(uuid_generate_v4(), NULL, 'Small Standard', 12, 16, 4.75, TRUE),
-- Large Standard Size
(uuid_generate_v4(), NULL, 'Large Standard', 0, 4, 3.86, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 4, 8, 4.08, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 8, 12, 4.24, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 12, 16, 4.75, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 16, 32, 5.40, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 32, 48, 5.95, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 48, 64, 6.50, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 64, 80, 7.05, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 80, 96, 7.60, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 96, 128, 8.15, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 128, 160, 8.70, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 160, 192, 9.25, TRUE),
(uuid_generate_v4(), NULL, 'Large Standard', 192, 320, 10.50, TRUE),
-- Large Bulky
(uuid_generate_v4(), NULL, 'Large Bulky', 0, 1120, 9.73, TRUE),
(uuid_generate_v4(), NULL, 'Large Bulky', 1120, 2240, 13.33, TRUE),
(uuid_generate_v4(), NULL, 'Large Bulky', 2240, 4480, 17.58, TRUE),
(uuid_generate_v4(), NULL, 'Large Bulky', 4480, 7168, 21.83, TRUE)
ON CONFLICT DO NOTHING;

-- 默认佣金比例（按常见品类）
INSERT INTO referral_fee_rules (id, user_id, category, fee_percentage, min_fee_usd, is_active) VALUES
(uuid_generate_v4(), NULL, '默认', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '服装与配饰', 17.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '电子产品', 8.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '电脑及配件', 8.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '家具', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '家居与厨房', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '珠宝首饰', 20.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '鞋类', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '运动用品', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '玩具', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '美妆个护', 8.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '宠物用品', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '汽车配件', 12.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '办公用品', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '户外用品', 15.00, 0.30, TRUE),
(uuid_generate_v4(), NULL, '工具与家装', 15.00, 0.30, TRUE)
ON CONFLICT DO NOTHING;

-- 默认头程运费费率
INSERT INTO shipping_fee_rules (id, user_id, shipping_type, rate_per_unit, unit_type, description, is_active) VALUES
(uuid_generate_v4(), NULL, 'sea_standard', 1200.00, 'cbm', '普通海运（元/立方米）', TRUE),
(uuid_generate_v4(), NULL, 'sea_express', 2000.00, 'cbm', '美森快船（元/立方米）', TRUE),
(uuid_generate_v4(), NULL, 'air', 50.00, 'kg', '空运（元/公斤）', TRUE)
ON CONFLICT DO NOTHING;

-- 默认汇率
INSERT INTO exchange_rates (id, user_id, currency_pair, rate, is_active) VALUES
(uuid_generate_v4(), NULL, 'USD_CNY', 7.20, TRUE)
ON CONFLICT DO NOTHING;

-- 默认其他费用规则
INSERT INTO other_cost_rules (id, user_id, rule_name, rule_type, value, base_field, description, is_active) VALUES
(uuid_generate_v4(), NULL, 'tariff', 'percentage', 0.00, 'cost', '关税比例（基于成本）', TRUE),
(uuid_generate_v4(), NULL, 'handling_fee', 'fixed', 0.36, NULL, '配置金/处理费（美元）', TRUE)
ON CONFLICT DO NOTHING;
