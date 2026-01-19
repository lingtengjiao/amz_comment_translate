"""
VOC-Master FastAPI Application Entry Point

This is the main entry point for the FastAPI backend service.
It configures:
- CORS middleware for Chrome extension communication
- Database initialization
- API routes for reviews, products, and tasks
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import init_db
from app.api.reviews import router as reviews_router
from app.api.reviews import products_router, tasks_router, system_router
from app.api.analysis import router as analysis_router
from app.api.auth import router as auth_router
from app.api.user_projects import router as user_projects_router
from app.api.keepa import router as keepa_router
from app.api.analytics import router as analytics_router
from app.api.rufus import router as rufus_router
from app.api.keyword_collections import router as keyword_collections_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup: Initialize database
    logger.info("Starting VOC-Master backend...")
    await init_db()
    logger.info("Database initialized successfully")
    yield
    # Shutdown: Cleanup if needed
    logger.info("Shutting down VOC-Master backend...")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="""
## Amazon VOC (Voice of Customer) Immersive Insight System

A powerful system for collecting, translating, and analyzing Amazon product reviews.

### Features:
- **Review Collection**: Chrome extension collects reviews from Amazon pages
- **AI Translation**: Qwen LLM translates reviews with e-commerce context
- **Sentiment Analysis**: Automatic sentiment detection (positive/neutral/negative)
- **Data Export**: Export reviews to Excel/CSV

### API Endpoints:
- `POST /api/v1/reviews/ingest` - Receive reviews from Chrome extension
- `GET /api/v1/reviews/{asin}` - Get reviews for a product
- `GET /api/v1/reviews/{asin}/export` - Export reviews as Excel/CSV
- `GET /api/v1/products` - List all products with statistics
- `GET /api/v1/products/{asin}/stats` - Get detailed product statistics
- `GET /api/v1/tasks/{task_id}` - Check translation task status
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS - Allow Chrome extension and frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "chrome-extension://*",  # Chrome extensions
        "*"  # For development - restrict in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoints
@app.get("/", tags=["Health"])
async def root():
    """Root endpoint - API information"""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for Docker"""
    return {"status": "healthy"}


# Include API routers
app.include_router(auth_router, prefix="/api/v1")  # 认证接口
app.include_router(user_projects_router, prefix="/api/v1")  # 用户项目接口
app.include_router(reviews_router, prefix="/api/v1")
app.include_router(products_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(system_router, prefix="/api/v1")  # Worker 健康检查
app.include_router(keepa_router, prefix="/api/v1")  # Keepa 时序数据接口
app.include_router(analytics_router, prefix="/api/v1")  # 用户行为分析接口
app.include_router(rufus_router, prefix="/api/v1")  # Rufus AI 对话接口
app.include_router(keyword_collections_router, prefix="/api/v1")  # 关键词产品库接口


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return {
        "error": "Internal server error",
        "detail": str(exc) if settings.DEBUG else "An unexpected error occurred"
    }
