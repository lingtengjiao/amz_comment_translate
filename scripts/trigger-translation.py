#!/usr/bin/env python3
"""
Script to trigger translation for all products with pending reviews.

Usage:
    python3 scripts/trigger-translation.py
    python3 scripts/trigger-translation.py --asin B08XXXXXXX  # For specific product
"""
import sys
import os
import asyncio
import argparse
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.product import Product
from app.models.review import Review, TranslationStatus
from app.models.task import Task, TaskType
from app.worker import task_process_reviews
from app.core.config import settings


async def trigger_translation_for_product(asin: str = None):
    """Trigger translation for a specific product or all products."""
    # Create async database connection
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        if asin:
            # Get specific product
            result = await db.execute(
                select(Product).where(Product.asin == asin)
            )
            products = [result.scalar_one_or_none()]
            if not products[0]:
                print(f"❌ Product with ASIN {asin} not found")
                return
        else:
            # Get all products with pending reviews
            result = await db.execute(
                select(Product).distinct()
                .join(Review)
                .where(Review.translation_status == TranslationStatus.PENDING.value)
            )
            products = result.scalars().all()
        
        if not products:
            print("✅ No products with pending reviews found")
            return
        
        print(f"📦 Found {len(products)} product(s) with pending reviews\n")
        
        for product in products:
            # Count pending reviews
            pending_result = await db.execute(
                select(func.count(Review.id)).where(
                    and_(
                        Review.product_id == product.id,
                        Review.translation_status == TranslationStatus.PENDING.value
                    )
                )
            )
            pending_count = pending_result.scalar() or 0
            
            if pending_count == 0:
                print(f"⏭️  {product.asin}: No pending reviews, skipping")
                continue
            
            # Create translation task
            task = Task(
                product_id=product.id,
                task_type=TaskType.TRANSLATION.value,
                status="pending",
                total_items=pending_count
            )
            db.add(task)
            await db.commit()
            await db.refresh(task)
            
            # Dispatch to Celery
            task_process_reviews.delay(str(product.id), str(task.id))
            
            print(f"✅ {product.asin}: Triggered translation for {pending_count} reviews (Task: {task.id})")
        
        print(f"\n🎉 Translation tasks dispatched for {len(products)} product(s)")
    
    await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Trigger translation for pending reviews")
    parser.add_argument("--asin", type=str, help="Specific product ASIN to translate")
    args = parser.parse_args()
    
    print("🚀 Starting translation trigger...")
    print(f"📡 API Key: {'✅ Configured' if settings.QWEN_API_KEY else '❌ Not configured'}")
    print(f"🌐 API Base: {settings.QWEN_API_BASE}")
    print(f"🤖 Model: {settings.QWEN_MODEL}\n")
    
    asyncio.run(trigger_translation_for_product(args.asin))


if __name__ == "__main__":
    main()

