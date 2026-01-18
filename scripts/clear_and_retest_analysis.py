#!/usr/bin/env python3
"""
清空产品的学习维度和主题数据，并重新触发分析

用法：
    python scripts/clear_and_retest_analysis.py B09MDQNJ36
"""
import sys
import os
import asyncio
import httpx

# 添加项目根目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, select, delete, and_
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.product import Product
from app.models.product_dimension import ProductDimension
from app.models.product_context_label import ProductContextLabel
from app.models.review_insight import ReviewInsight
from app.models.review_theme_highlight import ReviewThemeHighlight
from app.models.review import Review

def clear_product_analysis_data(asin: str):
    """清空产品的学习维度和主题数据"""
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        # 1. 获取产品
        product_result = db.execute(
            select(Product).where(Product.asin == asin)
        )
        product = product_result.scalar_one_or_none()
        
        if not product:
            print(f"❌ 产品 {asin} 不存在")
            return False
        
        product_id = product.id
        print(f"✅ 找到产品: {asin} (ID: {product_id})")
        
        # 2. 获取所有评论 ID
        reviews_result = db.execute(
            select(Review.id).where(
                and_(
                    Review.product_id == product_id,
                    Review.is_deleted == False
                )
            )
        )
        review_ids = [r[0] for r in reviews_result.all()]
        print(f"📊 找到 {len(review_ids)} 条评论")
        
        # 3. 删除维度数据
        dim_count = db.execute(
            delete(ProductDimension).where(ProductDimension.product_id == product_id)
        ).rowcount
        print(f"🗑️  删除 {dim_count} 个维度")
        
        # 4. 删除 5W 标签数据
        label_count = db.execute(
            delete(ProductContextLabel).where(ProductContextLabel.product_id == product_id)
        ).rowcount
        print(f"🗑️  删除 {label_count} 个 5W 标签")
        
        # 5. 删除洞察数据
        if review_ids:
            insight_count = db.execute(
                delete(ReviewInsight).where(ReviewInsight.review_id.in_(review_ids))
            ).rowcount
            print(f"🗑️  删除 {insight_count} 条洞察")
        else:
            insight_count = 0
        
        # 6. 删除主题高亮数据
        if review_ids:
            theme_count = db.execute(
                delete(ReviewThemeHighlight).where(ReviewThemeHighlight.review_id.in_(review_ids))
            ).rowcount
            print(f"🗑️  删除 {theme_count} 条主题高亮")
        else:
            theme_count = 0
        
        db.commit()
        
        print(f"\n✅ 清空完成！")
        print(f"   - 维度: {dim_count} 个")
        print(f"   - 5W标签: {label_count} 个")
        print(f"   - 洞察: {insight_count} 条")
        print(f"   - 主题: {theme_count} 条")
        
        return True
        
    except Exception as e:
        db.rollback()
        print(f"❌ 清空数据失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


async def trigger_analysis(asin: str):
    """触发重新分析"""
    url = f"http://localhost:8000/api/v1/products/{asin}/start-analysis"
    
    print(f"\n🚀 触发重新分析: {url}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url)
            response.raise_for_status()
            result = response.json()
            
            print(f"✅ 分析任务已启动")
            print(f"   - 任务ID: {result.get('task_id', 'N/A')}")
            print(f"   - 状态: {result.get('status', 'N/A')}")
            print(f"   - 消息: {result.get('message', 'N/A')}")
            
            return True
            
        except httpx.HTTPError as e:
            print(f"❌ API 调用失败: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"   响应: {e.response.text}")
            return False
        except Exception as e:
            print(f"❌ 触发分析失败: {e}")
            import traceback
            traceback.print_exc()
            return False


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/clear_and_retest_analysis.py <ASIN>")
        print("示例: python scripts/clear_and_retest_analysis.py B09MDQNJ36")
        sys.exit(1)
    
    asin = sys.argv[1].upper()
    
    print(f"📦 产品 ASIN: {asin}")
    print("=" * 60)
    
    # 步骤1: 清空数据
    print("\n步骤 1: 清空学习维度和主题数据")
    print("-" * 60)
    success = clear_product_analysis_data(asin)
    
    if not success:
        print("\n❌ 清空数据失败，终止操作")
        sys.exit(1)
    
    # 步骤2: 触发重新分析
    print("\n步骤 2: 触发重新分析")
    print("-" * 60)
    asyncio.run(trigger_analysis(asin))
    
    print("\n" + "=" * 60)
    print("✅ 操作完成！")
    print("\n💡 提示:")
    print("   - 分析任务在后台运行，可能需要几分钟")
    print("   - 可以在前端页面查看进度")
    print("   - 或查看 Celery worker 日志")


if __name__ == "__main__":
    main()
