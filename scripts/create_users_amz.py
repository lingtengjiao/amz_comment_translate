#!/usr/bin/env python3
"""
创建 10 个 @amz.com 用户账号
"""
import uuid
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 10 个用户，密码: Amz2024!
users = [
    ('user1@amz.com', 'User 1', 'Amz2024!'),
    ('user2@amz.com', 'User 2', 'Amz2024!'),
    ('user3@amz.com', 'User 3', 'Amz2024!'),
    ('user4@amz.com', 'User 4', 'Amz2024!'),
    ('user5@amz.com', 'User 5', 'Amz2024!'),
    ('user6@amz.com', 'User 6', 'Amz2024!'),
    ('user7@amz.com', 'User 7', 'Amz2024!'),
    ('user8@amz.com', 'User 8', 'Amz2024!'),
    ('user9@amz.com', 'User 9', 'Amz2024!'),
    ('user10@amz.com', 'User 10', 'Amz2024!'),
]

print('-- 创建 10 个用户账号 (@amz.com)')
print('-- 生成时间: 2026-01-16')
print()
print('INSERT INTO users (id, email, name, password_hash, is_active, is_admin, created_at, updated_at)')
print('VALUES')

values = []
for email, name, password in users:
    password_hash = pwd_context.hash(password)
    user_id = uuid.uuid4()
    values.append(f"    ('{user_id}', '{email}', '{name}', '{password_hash}', true, false, NOW(), NOW())")

print(',\n'.join(values))
print('ON CONFLICT (email) DO UPDATE SET')
print('    password_hash = EXCLUDED.password_hash,')
print('    updated_at = NOW();')
print()
print('-- 账号列表:')
for i, (email, name, password) in enumerate(users, 1):
    print(f'-- {i:2d}. {email:20s} / {password}')
