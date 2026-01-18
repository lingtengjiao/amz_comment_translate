-- 迁移脚本：为 analysis_projects 表添加 user_id 字段
-- 用于追踪项目创建者，实现"我的市场洞察"过滤

-- 添加 user_id 列
ALTER TABLE analysis_projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_analysis_projects_user_id ON analysis_projects(user_id);

-- 添加注释
COMMENT ON COLUMN analysis_projects.user_id IS '创建者用户ID，用于我的市场洞察过滤';
