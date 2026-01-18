-- 迁移脚本：创建用户行为分析相关表
-- 用于追踪用户行为、会话和每日统计数据

-- ==========================================
-- 1. user_events 表 - 用户事件表
-- ==========================================
CREATE TABLE IF NOT EXISTS user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    event_data JSONB,
    page_path VARCHAR(200),
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_event_type ON user_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_events_event_name ON user_events(event_name);
CREATE INDEX IF NOT EXISTS idx_user_events_session_id ON user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at);

-- 添加注释
COMMENT ON TABLE user_events IS '用户事件表 - 记录所有用户操作事件';
COMMENT ON COLUMN user_events.user_id IS '用户ID (可为空,支持匿名事件)';
COMMENT ON COLUMN user_events.event_type IS '事件类型: page_view/click/feature_use';
COMMENT ON COLUMN user_events.event_name IS '事件名称: home_visit/add_product/start_analysis';
COMMENT ON COLUMN user_events.event_data IS '附加数据 (JSON格式)';
COMMENT ON COLUMN user_events.page_path IS '页面路径';
COMMENT ON COLUMN user_events.session_id IS '会话ID';

-- ==========================================
-- 2. user_sessions 表 - 用户会话表
-- ==========================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    page_views INTEGER DEFAULT 0,
    user_agent VARCHAR(500),
    ip_address INET
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_started ON user_sessions(user_id, started_at);

-- 添加注释
COMMENT ON TABLE user_sessions IS '用户会话表 - 追踪用户访问会话';
COMMENT ON COLUMN user_sessions.session_id IS '会话标识 (唯一)';
COMMENT ON COLUMN user_sessions.duration_seconds IS '会话时长 (秒)';
COMMENT ON COLUMN user_sessions.page_views IS '页面浏览数';
COMMENT ON COLUMN user_sessions.user_agent IS '浏览器信息';

-- ==========================================
-- 3. daily_stats 表 - 每日统计表
-- ==========================================
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_date DATE UNIQUE NOT NULL,
    total_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    products_added INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    reports_generated INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_daily_stats_stat_date ON daily_stats(stat_date);

-- 添加注释
COMMENT ON TABLE daily_stats IS '每日统计表 - 聚合统计数据';
COMMENT ON COLUMN daily_stats.stat_date IS '统计日期 (唯一)';
COMMENT ON COLUMN daily_stats.total_users IS '累计用户数';
COMMENT ON COLUMN daily_stats.new_users IS '新增用户数';
COMMENT ON COLUMN daily_stats.active_users IS '活跃用户数';
COMMENT ON COLUMN daily_stats.products_added IS '新增产品数';
COMMENT ON COLUMN daily_stats.tasks_completed IS '完成任务数';
COMMENT ON COLUMN daily_stats.reports_generated IS '生成报告数';
COMMENT ON COLUMN daily_stats.page_views IS '页面浏览数';

-- 验证迁移结果
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('user_events', 'user_sessions', 'daily_stats')
ORDER BY table_name, ordinal_position;
