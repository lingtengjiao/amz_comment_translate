#!/usr/bin/env python3
"""
市场洞察功能 API 测试脚本

用于测试前后端联调，验证：
1. 创建市场洞察项目
2. 创建对比分析项目
3. API 响应格式
4. 数据验证
"""
import asyncio
import sys
import os
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "backend"))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import get_db
from app.services.analysis_service import AnalysisService
from app.models.product import Product
from app.models.analysis import AnalysisProject, AnalysisType
from sqlalchemy import select
from uuid import UUID
import json


async def test_create_market_insight_project():
    """测试创建市场洞察项目"""
    print("\n" + "="*60)
    print("测试 1: 创建市场洞察项目")
    print("="*60)
    
    # 创建数据库会话
    from app.core.config import settings
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True
    )
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as db:
        service = AnalysisService(db)
        
        # 获取前3个产品用于测试
        result = await db.execute(select(Product).limit(3))
        products = result.scalars().all()
        
        if len(products) < 2:
            print("❌ 错误: 数据库中至少需要 2 个产品才能测试")
            return False
        
        product_ids = [p.id for p in products[:3]]
        print(f"✓ 找到 {len(product_ids)} 个产品用于测试")
        for i, p in enumerate(products[:3], 1):
            print(f"  产品 {i}: {p.asin} - {p.title[:50] if p.title else 'N/A'}")
        
        try:
            # 创建市场洞察项目
            project = await service.create_market_insight_project(
                title="测试市场洞察分析",
                product_ids=product_ids,
                description="这是一个测试项目，用于验证市场洞察功能",
                role_labels=["产品1", "产品2", "产品3"]
            )
            
            print(f"\n✓ 项目创建成功!")
            print(f"  项目ID: {project.id}")
            print(f"  项目标题: {project.title}")
            print(f"  分析类型: {project.analysis_type}")
            print(f"  状态: {project.status}")
            print(f"  产品数量: {len(project.items)}")
            
            # 验证分析类型
            if project.analysis_type != AnalysisType.MARKET_INSIGHT.value:
                print(f"❌ 错误: 分析类型不正确，期望 'market_insight'，实际 '{project.analysis_type}'")
                return False
            
            print(f"\n✓ 分析类型验证通过")
            
            # 清理测试数据
            await db.delete(project)
            await db.commit()
            print(f"✓ 测试数据已清理")
            
            return True
            
        except Exception as e:
            print(f"❌ 错误: {e}")
            import traceback
            traceback.print_exc()
            return False


async def test_create_comparison_project():
    """测试创建对比分析项目"""
    print("\n" + "="*60)
    print("测试 2: 创建对比分析项目")
    print("="*60)
    
    from app.core.config import settings
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True
    )
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as db:
        service = AnalysisService(db)
        
        # 获取前2个产品用于测试
        result = await db.execute(select(Product).limit(2))
        products = result.scalars().all()
        
        if len(products) < 2:
            print("❌ 错误: 数据库中至少需要 2 个产品才能测试")
            return False
        
        product_ids = [p.id for p in products[:2]]
        print(f"✓ 找到 {len(product_ids)} 个产品用于测试")
        
        try:
            # 创建对比分析项目
            project = await service.create_comparison_project(
                title="测试对比分析",
                product_ids=product_ids,
                description="这是一个测试项目，用于验证对比分析功能"
            )
            
            print(f"\n✓ 项目创建成功!")
            print(f"  项目ID: {project.id}")
            print(f"  分析类型: {project.analysis_type}")
            print(f"  状态: {project.status}")
            
            # 验证分析类型
            if project.analysis_type != AnalysisType.COMPARISON.value:
                print(f"❌ 错误: 分析类型不正确，期望 'comparison'，实际 '{project.analysis_type}'")
                return False
            
            print(f"\n✓ 分析类型验证通过")
            
            # 清理测试数据
            await db.delete(project)
            await db.commit()
            print(f"✓ 测试数据已清理")
            
            return True
            
        except Exception as e:
            print(f"❌ 错误: {e}")
            import traceback
            traceback.print_exc()
            return False


async def test_product_count_validation():
    """测试产品数量验证"""
    print("\n" + "="*60)
    print("测试 3: 产品数量验证")
    print("="*60)
    
    from app.core.config import settings
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True
    )
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as db:
        service = AnalysisService(db)
        
        # 获取产品
        result = await db.execute(select(Product).limit(12))
        products = result.scalars().all()
        
        if len(products) < 6:
            print("⚠️  警告: 数据库中产品数量不足，跳过部分测试")
            return True
        
        test_cases = [
            ("对比分析 - 1个产品", "comparison", 1, False),
            ("对比分析 - 5个产品", "comparison", 5, True),
            ("对比分析 - 6个产品", "comparison", 6, False),
            ("市场洞察 - 1个产品", "market_insight", 1, False),
            ("市场洞察 - 10个产品", "market_insight", 10, True),
            ("市场洞察 - 11个产品", "market_insight", 11, False),
        ]
        
        all_passed = True
        for test_name, analysis_type, count, should_succeed in test_cases:
            if count > len(products):
                print(f"⚠️  跳过 {test_name}: 产品数量不足")
                continue
            
            product_ids = [p.id for p in products[:count]]
            
            try:
                if analysis_type == "market_insight":
                    project = await service.create_market_insight_project(
                        title=f"测试-{test_name}",
                        product_ids=product_ids
                    )
                else:
                    project = await service.create_comparison_project(
                        title=f"测试-{test_name}",
                        product_ids=product_ids
                    )
                
                if should_succeed:
                    print(f"✓ {test_name}: 通过")
                    await db.delete(project)
                    await db.commit()
                else:
                    print(f"❌ {test_name}: 应该失败但成功了")
                    all_passed = False
                    await db.delete(project)
                    await db.commit()
                    
            except ValueError as e:
                if should_succeed:
                    print(f"❌ {test_name}: 应该成功但失败了 - {e}")
                    all_passed = False
                else:
                    print(f"✓ {test_name}: 正确拒绝 - {e}")
            except Exception as e:
                print(f"❌ {test_name}: 意外错误 - {e}")
                all_passed = False
        
        return all_passed


async def test_analysis_type_routing():
    """测试分析类型路由"""
    print("\n" + "="*60)
    print("测试 4: 分析类型路由")
    print("="*60)
    
    from app.core.config import settings
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True
    )
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as db:
        service = AnalysisService(db)
        
        result = await db.execute(select(Product).limit(3))
        products = result.scalars().all()
        
        if len(products) < 2:
            print("❌ 错误: 数据库中至少需要 2 个产品才能测试")
            return False
        
        product_ids = [p.id for p in products[:3]]
        
        # 测试市场洞察路由
        try:
            project1 = await service.create_market_insight_project(
                title="路由测试-市场洞察",
                product_ids=product_ids
            )
            
            # 测试 run_analysis 路由
            # 注意：这里只测试路由逻辑，不实际运行分析（因为需要AI调用）
            project = await service.get_project(project1.id)
            if project.analysis_type == AnalysisType.MARKET_INSIGHT.value:
                print("✓ 市场洞察路由正确")
            else:
                print(f"❌ 市场洞察路由错误: {project.analysis_type}")
                return False
            
            await db.delete(project1)
            await db.commit()
            
        except Exception as e:
            print(f"❌ 路由测试失败: {e}")
            import traceback
            traceback.print_exc()
            return False
        
        return True


async def main():
    """运行所有测试"""
    print("\n" + "="*60)
    print("市场洞察功能 API 测试")
    print("="*60)
    
    tests = [
        ("创建市场洞察项目", test_create_market_insight_project),
        ("创建对比分析项目", test_create_comparison_project),
        ("产品数量验证", test_product_count_validation),
        ("分析类型路由", test_analysis_type_routing),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n❌ {test_name} 测试异常: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False))
    
    # 汇总结果
    print("\n" + "="*60)
    print("测试结果汇总")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ 通过" if result else "❌ 失败"
        print(f"{status}: {test_name}")
    
    print(f"\n总计: {passed}/{total} 测试通过")
    
    if passed == total:
        print("\n🎉 所有测试通过!")
        return 0
    else:
        print(f"\n⚠️  有 {total - passed} 个测试失败")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
