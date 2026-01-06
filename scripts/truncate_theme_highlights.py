#!/usr/bin/env python3
"""
清空 review_theme_highlights 表
用于迁移到 5W 模型后清理旧数据
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "backend"))

from sqlalchemy import text
from app.db.session import engine


async def truncate_table():
    """清空 review_theme_highlights 表"""
    try:
        async with engine.begin() as conn:
            # 执行 TRUNCATE 命令
            await conn.execute(text("TRUNCATE TABLE review_theme_highlights"))
            print("✅ 成功清空 review_theme_highlights 表")
            print("   现在可以重新分析评论，使用新的 5W 模型提取主题")
    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(truncate_table())

