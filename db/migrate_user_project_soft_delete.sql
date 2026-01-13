-- 迁移脚本：为 user_projects 表添加逻辑删除字段
-- 用于实现"删除后释放回洞察广场"功能

-- 添加 is_deleted 字段
ALTER TABLE user_projects 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 添加 deleted_at 字段
ALTER TABLE user_projects 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 为 is_deleted 创建索引，优化查询性能
CREATE INDEX IF NOT EXISTS idx_user_projects_is_deleted 
ON user_projects(is_deleted);

-- 创建复合索引，用于常见查询
CREATE INDEX IF NOT EXISTS idx_user_projects_user_deleted 
ON user_projects(user_id, is_deleted);

-- 添加注释
COMMENT ON COLUMN user_projects.is_deleted IS '是否已删除（逻辑删除）';
COMMENT ON COLUMN user_projects.deleted_at IS '删除时间';

-- 验证迁移结果
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_projects' 
AND column_name IN ('is_deleted', 'deleted_at');
