-- =============================================================================
-- 创建测试用户
-- 
-- 账号1: admin1@example.com / 123456
-- 账号2: admin2@example.com / 123456
--
-- 密码使用 bcrypt 哈希
-- =============================================================================

-- 注意：以下哈希是 '123456' 的 bcrypt 哈希
-- 可以使用 Python 生成: from passlib.context import CryptContext; pwd_context = CryptContext(schemes=["bcrypt"]); print(pwd_context.hash("123456"))

INSERT INTO users (id, email, name, password_hash, is_active, is_admin, created_at, updated_at)
VALUES 
    (
        uuid_generate_v4(),
        'admin1@example.com',
        'Admin One',
        '$2b$12$jg4A8a22Qf4fDA224tk74u3kCK601bwaIZe0BHPgooVLUrRmNTVtm',  -- 123456
        true,
        true,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'admin2@example.com',
        'Admin Two',
        '$2b$12$jg4A8a22Qf4fDA224tk74u3kCK601bwaIZe0BHPgooVLUrRmNTVtm',  -- 123456
        true,
        true,
        NOW(),
        NOW()
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    is_admin = EXCLUDED.is_admin,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE '✅ 测试账号创建完成！';
    RAISE NOTICE '   账号1: admin1@example.com / 123456';
    RAISE NOTICE '   账号2: admin2@example.com / 123456';
END $$;
