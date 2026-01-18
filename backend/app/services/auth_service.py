"""
认证服务 (Authentication Service)

提供：
1. 密码哈希和验证
2. JWT Token 生成和验证
3. 用户认证
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

# 密码哈希配置
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT 配置
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7  # Token 有效期 7 天


class AuthService:
    """认证服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ==========================================
    # 密码处理
    # ==========================================
    
    @staticmethod
    def hash_password(password: str) -> str:
        """生成密码哈希"""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """验证密码"""
        return pwd_context.verify(plain_password, hashed_password)
    
    # ==========================================
    # JWT Token 处理
    # ==========================================
    
    @staticmethod
    def create_access_token(user_id: str, email: str, expires_delta: Optional[timedelta] = None) -> str:
        """
        创建 JWT Access Token
        
        Args:
            user_id: 用户 ID
            email: 用户邮箱
            expires_delta: 过期时间
            
        Returns:
            JWT token 字符串
        """
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
        
        to_encode = {
            "sub": user_id,
            "email": email,
            "exp": expire,
            "iat": datetime.now(timezone.utc)
        }
        
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        """
        解码并验证 JWT Token
        
        Args:
            token: JWT token 字符串
            
        Returns:
            解码后的 payload，验证失败返回 None
        """
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError as e:
            logger.warning(f"JWT 验证失败: {e}")
            return None
    
    # ==========================================
    # 用户认证
    # ==========================================
    
    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """
        验证用户凭据
        
        Args:
            email: 用户邮箱
            password: 密码
            
        Returns:
            验证成功返回 User，失败返回 None
        """
        # 查找用户
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            logger.info(f"登录失败：用户不存在 - {email}")
            return None
        
        if not user.password_hash:
            logger.warning(f"登录失败：用户没有设置密码 - {email}")
            return None
        
        if not self.verify_password(password, user.password_hash):
            logger.info(f"登录失败：密码错误 - {email}")
            return None
        
        if not user.is_active:
            logger.info(f"登录失败：用户已禁用 - {email}")
            return None
        
        # 更新最后登录时间
        user.last_login_at = datetime.now(timezone.utc)
        await self.db.commit()
        
        logger.info(f"登录成功 - {email}")
        return user
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """根据 ID 获取用户"""
        try:
            uid = uuid.UUID(user_id)
        except ValueError:
            return None
        
        result = await self.db.execute(
            select(User).where(User.id == uid)
        )
        return result.scalar_one_or_none()
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()
    
    async def create_user(
        self,
        email: str,
        password: str,
        name: Optional[str] = None,
        is_admin: bool = False
    ) -> User:
        """
        创建新用户
        
        Args:
            email: 用户邮箱
            password: 密码
            name: 用户名
            is_admin: 是否管理员
            
        Returns:
            新创建的 User
        """
        user = User(
            email=email,
            password_hash=self.hash_password(password),
            name=name or email.split("@")[0],
            is_admin=is_admin,
            is_active=True
        )
        
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        
        logger.info(f"用户创建成功 - {email}")
        return user


# ==========================================
# FastAPI 依赖注入
# ==========================================

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.session import get_db

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    获取当前登录用户（可选）
    
    用于不强制登录的接口，未登录时返回 None
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = AuthService.decode_token(token)
    
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    service = AuthService(db)
    user = await service.get_user_by_id(user_id)
    
    return user


async def get_current_user_required(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    获取当前登录用户（必须）
    
    用于强制登录的接口，未登录时抛出 401
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证信息",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    token = credentials.credentials
    payload = AuthService.decode_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效或已过期",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    service = AuthService(db)
    user = await service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    return user


async def get_admin_user(
    user: User = Depends(get_current_user_required)
) -> User:
    """
    获取管理员用户
    
    用于管理员专用接口
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return user


# Alias for backward compatibility
get_optional_current_user = get_current_user
