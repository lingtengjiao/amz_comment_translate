"""
Database Session Management

This module provides:
- Async SQLAlchemy engine and session factory
- Dependency injection for FastAPI routes
- Database initialization
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


# Create async engine with connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models"""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency to get database session.
    
    Yields an async session and handles commit/rollback automatically.
    Usage in FastAPI:
        @router.get("/")
        async def endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    Initialize database tables.
    
    Creates all tables defined in SQLAlchemy models.
    Safe to call multiple times (tables won't be recreated if they exist).
    """
    # Import all models to register them with Base
    from app.models import Product, Review, Task  # noqa
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
