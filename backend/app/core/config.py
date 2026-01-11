"""
Application Configuration using Pydantic Settings
"""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    APP_NAME: str = "VOC-Master"
    DEBUG: bool = False
    SECRET_KEY: str = "change-this-in-production"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://vocmaster:vocmaster123@localhost:5432/vocmaster"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Qwen API Configuration
    QWEN_API_KEY: Optional[str] = None
    QWEN_API_BASE: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL: str = "qwen-plus"  # 默认模型（翻译、洞察提取等）
    QWEN_ANALYSIS_MODEL: str = "qwen3-max"  # 对比分析专用模型（更强推理能力）
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()

