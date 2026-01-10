-- =============================================================================
-- 用户系统迁移脚本 (User System Migration)
-- 
-- 功能：
-- 1. 创建用户表 (users)
-- 2. 创建用户-产品关联表 (user_projects) - 实现"私有视图"层
-- 3. 创建分析锁表 (product_analysis_locks) - 防止重复分析
-- 
-- 执行方式：
--   docker exec -i postgres psql -U vocmaster -d vocmaster < db/migrate_user_system.sql
-- =============================================================================

-- 启用 UUID 扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. 用户表 (users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 基本信息
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url VARCHAR(500),
    
    -- 认证信息（可扩展）
    password_hash VARCHAR(255),  -- 可选，如果使用密码登录
    oauth_provider VARCHAR(50),  -- 如 'google', 'github' 等
    oauth_id VARCHAR(255),       -- OAuth 提供商的用户ID
    
    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);

COMMENT ON TABLE users IS '用户表 - 存储平台用户信息';
COMMENT ON COLUMN users.email IS '用户邮箱（唯一）';
COMMENT ON COLUMN users.oauth_provider IS 'OAuth 登录提供商（如 google, github）';


-- =============================================================================
-- 2. 用户-产品关联表 (user_projects)
-- 
-- 设计理念：用户不"拥有"数据，只"关注"或"引用"公共资产池中的产品
-- 这是实现"公共资产池 + 私有视图"架构的核心
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 关联字段
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- 个性化字段（用户对这个产品的私有设置）
    custom_alias VARCHAR(255),         -- 用户自定义别名（如"我的爆款1"）
    notes TEXT,                         -- 用户备注
    tags VARCHAR(500),                  -- 用户自定义标签（JSON数组）
    is_favorite BOOLEAN DEFAULT FALSE,  -- 是否收藏
    
    -- 统计字段（记录用户对该产品的贡献）
    reviews_contributed INT DEFAULT 0,  -- 该用户为此产品贡献的评论数
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_viewed_at TIMESTAMPTZ,         -- 最后查看时间
    
    -- 联合唯一约束：防止同一用户重复添加同一产品
    CONSTRAINT unique_user_product UNIQUE (user_id, product_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_product_id ON user_projects(product_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_favorite ON user_projects(user_id, is_favorite) WHERE is_favorite = TRUE;

COMMENT ON TABLE user_projects IS '用户-产品关联表 - 实现私有视图层，用户关注的产品列表';
COMMENT ON COLUMN user_projects.custom_alias IS '用户自定义别名';
COMMENT ON COLUMN user_projects.reviews_contributed IS '该用户为此产品贡献的评论数';


-- =============================================================================
-- 3. 分析锁表 (product_analysis_locks)
-- 
-- 设计理念：防止多用户同时触发同一产品的分析任务
-- 当用户 A 正在分析时，用户 B 的请求会转为"订阅者"模式等待结果
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_analysis_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 关联字段
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,  -- 分析类型：comprehensive, operations, product, supply_chain
    
    -- 锁状态
    status VARCHAR(20) DEFAULT 'processing',  -- processing, completed, failed, expired
    
    -- 触发信息
    triggered_by UUID REFERENCES users(id),   -- 谁触发的（可为空，表示系统自动触发）
    
    -- 缓存策略
    result_valid_until TIMESTAMPTZ,  -- 结果有效期（如 7 天后过期）
    last_review_count INT,           -- 分析时的评论数（用于判断是否需要增量分析）
    
    -- 关联的报告（分析完成后填充）
    report_id UUID,  -- 指向 product_reports 表
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Celery 任务信息
    celery_task_id VARCHAR(100)
);

-- 普通索引
CREATE INDEX IF NOT EXISTS idx_analysis_locks_product_id ON product_analysis_locks(product_id);
CREATE INDEX IF NOT EXISTS idx_analysis_locks_status ON product_analysis_locks(status);

-- 🔥 关键：部分唯一索引 - 确保同一产品同一类型同时只能有一个"处理中"的锁
-- 使用函数式索引实现 PostgreSQL 的部分唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_processing_lock 
ON product_analysis_locks (product_id, analysis_type) 
WHERE status = 'processing';

COMMENT ON TABLE product_analysis_locks IS '分析锁表 - 防止重复分析，实现 Check-Lock-Serve 模式';
COMMENT ON COLUMN product_analysis_locks.status IS '锁状态：processing=处理中, completed=完成, failed=失败, expired=过期';
COMMENT ON COLUMN product_analysis_locks.result_valid_until IS '结果有效期，超过此时间需要重新分析';
COMMENT ON COLUMN product_analysis_locks.last_review_count IS '分析时的评论数，用于判断增量';


-- =============================================================================
-- 4. 添加 reviews 表的 contributor 字段（可选）
-- 记录每条评论是由哪个用户贡献的
-- =============================================================================
DO $$
BEGIN
    -- 检查列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reviews' AND column_name = 'contributed_by'
    ) THEN
        ALTER TABLE reviews ADD COLUMN contributed_by UUID REFERENCES users(id);
        CREATE INDEX idx_reviews_contributed_by ON reviews(contributed_by);
        COMMENT ON COLUMN reviews.contributed_by IS '贡献此评论的用户ID';
    END IF;
END $$;


-- =============================================================================
-- 5. 为 product_reports 表添加缓存相关字段
-- =============================================================================
DO $$
BEGIN
    -- 添加 review_count_at_generation 字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_reports' AND column_name = 'review_count_at_generation'
    ) THEN
        ALTER TABLE product_reports ADD COLUMN review_count_at_generation INT;
        COMMENT ON COLUMN product_reports.review_count_at_generation IS '生成报告时的评论数量，用于增量分析判断';
    END IF;
    
    -- 添加 is_incremental 字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_reports' AND column_name = 'is_incremental'
    ) THEN
        ALTER TABLE product_reports ADD COLUMN is_incremental BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN product_reports.is_incremental IS '是否为增量分析生成的报告';
    END IF;
    
    -- 添加 base_report_id 字段（增量报告的基础报告）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_reports' AND column_name = 'base_report_id'
    ) THEN
        ALTER TABLE product_reports ADD COLUMN base_report_id UUID REFERENCES product_reports(id);
        COMMENT ON COLUMN product_reports.base_report_id IS '增量报告的基础报告ID';
    END IF;
END $$;


-- =============================================================================
-- 6. 创建更新时间触发器
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为新表添加触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_projects_updated_at ON user_projects;
CREATE TRIGGER update_user_projects_updated_at
    BEFORE UPDATE ON user_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 完成提示
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 用户系统迁移完成！';
    RAISE NOTICE '   - users 表已创建';
    RAISE NOTICE '   - user_projects 表已创建';
    RAISE NOTICE '   - product_analysis_locks 表已创建';
    RAISE NOTICE '   - reviews.contributed_by 列已添加';
    RAISE NOTICE '   - product_reports 缓存字段已添加';
END $$;
