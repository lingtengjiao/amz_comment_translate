-- 分享链接表迁移脚本
-- 用于存储分享链接信息，支持将页面分享给未登录用户查看

-- 创建分享链接表
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 分享令牌（12位 URL 安全字符串，唯一索引）
    token VARCHAR(20) NOT NULL UNIQUE,
    
    -- 资源类型：review_reader, report, analysis_project, rufus_session
    resource_type VARCHAR(50) NOT NULL,
    
    -- 资源 ID（报告/分析项目/Rufus 会话的 UUID）
    resource_id UUID,
    
    -- ASIN（用于评论详情页和报告）
    asin VARCHAR(20),
    
    -- 创建者用户 ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 分享标题（用于显示）
    title VARCHAR(255),
    
    -- 过期时间（NULL 表示永久有效）
    expires_at TIMESTAMPTZ,
    
    -- 访问次数统计
    view_count INTEGER NOT NULL DEFAULT 0,
    
    -- 是否有效（可以手动撤销）
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_resource_type ON share_links(resource_type);
CREATE INDEX IF NOT EXISTS idx_share_links_resource_id ON share_links(resource_id);
CREATE INDEX IF NOT EXISTS idx_share_links_asin ON share_links(asin);
CREATE INDEX IF NOT EXISTS idx_share_links_user_id ON share_links(user_id);
CREATE INDEX IF NOT EXISTS idx_share_links_is_active ON share_links(is_active);

-- 添加注释
COMMENT ON TABLE share_links IS '分享链接表，用于存储页面分享信息';
COMMENT ON COLUMN share_links.token IS '分享令牌（12位 URL 安全字符串）';
COMMENT ON COLUMN share_links.resource_type IS '资源类型：review_reader/report/analysis_project/rufus_session';
COMMENT ON COLUMN share_links.resource_id IS '资源 UUID（报告/分析项目/会话 ID）';
COMMENT ON COLUMN share_links.asin IS 'Amazon ASIN（用于评论详情和报告）';
COMMENT ON COLUMN share_links.expires_at IS '过期时间（NULL 表示永久有效）';
COMMENT ON COLUMN share_links.view_count IS '访问次数统计';
COMMENT ON COLUMN share_links.is_active IS '是否有效（可手动撤销）';
