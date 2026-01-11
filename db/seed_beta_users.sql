-- =============================================================================
-- 创建 10 个内测用户（每个用户随机密码）
-- 
-- 生成时间: 2026-01-11
-- =============================================================================

INSERT INTO users (id, email, name, password_hash, is_active, is_admin, created_at, updated_at)
VALUES 
    (
        uuid_generate_v4(),
        'beta1@lesong.com',
        'Beta User 1',
        '$2b$12$SIOEhxSKxA4a7762ly7ZCOgscHJieWe3YTfO.W9mC8RCX6kFGXM.G',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta2@lesong.com',
        'Beta User 2',
        '$2b$12$GKUDgeNluMmbeq14qEZz5ORuq6zndjOSh1jkUVkudwY1NSqDCtphC',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta3@lesong.com',
        'Beta User 3',
        '$2b$12$Pl0NFYMaQHhWm3UI6aN0qOmhe3vxp1zLJufUowv0MqC6cQIzc10ru',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta4@lesong.com',
        'Beta User 4',
        '$2b$12$wxQMrXzlQqpbeUMUrEx02ux9aAee8Vhq6NTCe4SfQ4F6S6HR6D566',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta5@lesong.com',
        'Beta User 5',
        '$2b$12$fMJ2wAskMfCM7IKrbjTrHua9rvJbly8Hd1onLvaKAwqYN1L3gvxvK',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta6@lesong.com',
        'Beta User 6',
        '$2b$12$v.WEDlcsIwBjPjDWXic4J.mGCCpotJZ0OB/Ko5APJv90J3fwkx1Qe',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta7@lesong.com',
        'Beta User 7',
        '$2b$12$n8AvqyR3ocVRq8HWoVqVge7UlOwLfuOajHb8MV/tVWKzeiG0dS73W',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta8@lesong.com',
        'Beta User 8',
        '$2b$12$o90IyfxLy8l91iVEiicoI.4B64Ox.Eg8w27B1PIkrYAY5Jw9vU7He',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta9@lesong.com',
        'Beta User 9',
        '$2b$12$4EFi.U2ksqF8mXj93XGlWO7uDS/W8axTrnWNvPTNiomgx..0d2ABK',
        true,
        false,
        NOW(),
        NOW()
    ),
    (
        uuid_generate_v4(),
        'beta10@lesong.com',
        'Beta User 10',
        '$2b$12$Ni0DQSv259Z8diES4brT6eDrbIL6fhJnljF.80oadjF77HC1tW8pO',
        true,
        false,
        NOW(),
        NOW()
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ 内测账号创建完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '账号 1: beta1@lesong.com       / j2#I34uqs!ur';
    RAISE NOTICE '账号 2: beta2@lesong.com       / #l@AW0trW1@Z';
    RAISE NOTICE '账号 3: beta3@lesong.com       / 0P@XhQd*7!mx';
    RAISE NOTICE '账号 4: beta4@lesong.com       / !6ep^AXDN$YR';
    RAISE NOTICE '账号 5: beta5@lesong.com       / @VqTm%0kN@A6';
    RAISE NOTICE '账号 6: beta6@lesong.com       / eG8AwUxBvl$i';
    RAISE NOTICE '账号 7: beta7@lesong.com       / faOym6z1Y#tt';
    RAISE NOTICE '账号 8: beta8@lesong.com       / OMe17@Imb14z';
    RAISE NOTICE '账号 9: beta9@lesong.com       / Mj4Q#6IuXeuc';
    RAISE NOTICE '账号10: beta10@lesong.com      / A9p1nQXEw&00';
    RAISE NOTICE '========================================';
    RAISE NOTICE '前端登录地址: http://115.191.30.209';
    RAISE NOTICE '========================================';
END $$;
