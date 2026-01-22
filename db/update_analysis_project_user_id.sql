-- 更新分析项目的 user_id
-- 使用方式：将 YOUR_USER_ID 替换为实际的用户 UUID

-- 示例：为项目 5dc8f9a0-e82e-4554-9459-1d12f4b8acee 关联用户
-- UPDATE analysis_projects 
-- SET user_id = 'YOUR_USER_ID'::uuid
-- WHERE id = '5dc8f9a0-e82e-4554-9459-1d12f4b8acee'::uuid
--   AND user_id IS NULL;  -- 只更新 user_id 为 NULL 的项目

-- 批量更新：将所有 user_id 为 NULL 的项目关联到指定用户
-- UPDATE analysis_projects 
-- SET user_id = 'YOUR_USER_ID'::uuid
-- WHERE user_id IS NULL;

-- 查看所有没有 user_id 的项目
SELECT 
    id,
    title,
    analysis_type,
    status,
    user_id,
    created_at
FROM analysis_projects
WHERE user_id IS NULL
ORDER BY created_at DESC
LIMIT 20;
