#!/usr/bin/env python3
"""
生成10个内测用户的SQL脚本（随机密码）
"""
import secrets
import string
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def generate_random_password(length=12):
    """生成随机密码"""
    # 确保包含大写、小写、数字和特殊字符
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(chars) for _ in range(length))
        # 验证密码强度
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            any(c in "!@#$%^&*" for c in password)):
            return password

# 生成10个用户及其随机密码
users = []
for i in range(1, 11):
    email = f"beta{i}@lesong.com"
    name = f"Beta User {i}"
    password = generate_random_password(12)
    password_hash = pwd_context.hash(password)
    users.append((email, name, password, password_hash))

# 输出SQL
print("-- " + "=" * 77)
print("-- 创建 10 个内测用户（每个用户随机密码）")
print("-- ")
print("-- 生成时间: 2026-01-11")
print("-- " + "=" * 77)
print()

print("INSERT INTO users (id, email, name, password_hash, is_active, is_admin, created_at, updated_at)")
print("VALUES ")

values = []
for email, name, password, password_hash in users:
    values.append(f"""    (
        uuid_generate_v4(),
        '{email}',
        '{name}',
        '{password_hash}',
        true,
        false,
        NOW(),
        NOW()
    )""")

print(",\n".join(values))

print("""ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW();
""")

print("DO $$")
print("BEGIN")
print("    RAISE NOTICE '========================================';")
print("    RAISE NOTICE '✅ 内测账号创建完成！';")
print("    RAISE NOTICE '========================================';")

for i, (email, name, password, _) in enumerate(users, 1):
    print(f"    RAISE NOTICE '账号{i:2d}: {email:22s} / {password}';")

print("    RAISE NOTICE '========================================';")
print("    RAISE NOTICE '前端登录地址: http://115.191.30.209';")
print("    RAISE NOTICE '========================================';")
print("END $$;")

# 同时输出账号密码到stderr（方便查看）
import sys
print("\n\n-- 账号密码列表 (请妥善保管):", file=sys.stderr)
print("-- " + "=" * 77, file=sys.stderr)
for i, (email, name, password, _) in enumerate(users, 1):
    print(f"-- {i:2d}. {email:22s} / {password}", file=sys.stderr)
print("-- " + "=" * 77, file=sys.stderr)
