-- 任务心跳机制迁移脚本
-- 添加心跳相关字段，用于检测卡住的任务并自动恢复

-- 1. 添加心跳时间字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE;
COMMENT ON COLUMN tasks.last_heartbeat IS '最后一次心跳时间，Worker 处理时定期更新';

-- 2. 添加 Celery 任务 ID 字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS celery_task_id VARCHAR(100);
COMMENT ON COLUMN tasks.celery_task_id IS 'Celery 任务 ID，用于追踪和取消任务';

-- 3. 添加重试次数字段
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
COMMENT ON COLUMN tasks.retry_count IS '重试次数';

-- 4. 创建心跳超时索引（用于快速查询卡住的任务）
CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat ON tasks (status, last_heartbeat) 
WHERE status = 'processing';

-- 5. 更新任务状态约束（添加 timeout 状态）
-- PostgreSQL 不支持直接修改 CHECK 约束，需要先删除再添加
-- 如果有 CHECK 约束的话，这里可以跳过

SELECT 'Migration completed: task heartbeat fields added' AS result;

