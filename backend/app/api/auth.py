"""
认证 API (Authentication API)

提供用户登录、注册、获取当前用户信息等接口
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import (
    AuthService,
    get_current_user,
    get_current_user_required
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==========================================
# 请求/响应模型
# ==========================================

class LoginRequest(BaseModel):
    """登录请求"""
    email: str
    password: str


class RegisterRequest(BaseModel):
    """注册请求"""
    email: EmailStr
    password: str
    name: Optional[str] = None


class TokenResponse(BaseModel):
    """Token 响应"""
    success: bool
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    """用户信息响应"""
    id: str
    email: str
    name: Optional[str]
    avatar_url: Optional[str]
    is_admin: bool
    created_at: str


class MessageResponse(BaseModel):
    """消息响应"""
    success: bool
    message: str


# ==========================================
# 接口
# ==========================================

@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录
    
    验证邮箱和密码，返回 JWT Token
    """
    service = AuthService(db)
    
    user = await service.authenticate_user(request.email, request.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误"
        )
    
    # 生成 Token
    access_token = AuthService.create_access_token(
        user_id=str(user.id),
        email=user.email
    )
    
    return TokenResponse(
        success=True,
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin
        }
    )


@router.post("/register", response_model=TokenResponse)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册
    
    创建新用户并返回 JWT Token
    """
    service = AuthService(db)
    
    # 检查邮箱是否已存在
    existing_user = await service.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册"
        )
    
    # 创建用户
    user = await service.create_user(
        email=request.email,
        password=request.password,
        name=request.name
    )
    
    # 生成 Token
    access_token = AuthService.create_access_token(
        user_id=str(user.id),
        email=user.email
    )
    
    return TokenResponse(
        success=True,
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin
        }
    )


@router.get("/me")
async def get_me(
    user: User = Depends(get_current_user_required)
):
    """
    获取当前用户信息
    
    需要 Bearer Token 认证
    """
    return {
        "success": True,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None
        }
    }


@router.post("/logout", response_model=MessageResponse)
async def logout(
    user: User = Depends(get_current_user_required)
):
    """
    用户登出
    
    由于使用 JWT，服务端无状态，只需前端清除 Token 即可
    这里主要用于记录日志
    """
    logger.info(f"用户登出 - {user.email}")
    
    return MessageResponse(
        success=True,
        message="登出成功"
    )


@router.get("/verify")
async def verify_token(
    user: Optional[User] = Depends(get_current_user)
):
    """
    验证 Token 是否有效
    
    用于前端检查登录状态
    """
    if user:
        return {
            "valid": True,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "is_admin": user.is_admin
            }
        }
    else:
        return {
            "valid": False,
            "user": None
        }


@router.put("/profile")
async def update_profile(
    name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户资料
    """
    if name is not None:
        user.name = name
    if avatar_url is not None:
        user.avatar_url = avatar_url
    
    await db.commit()
    
    return {
        "success": True,
        "message": "资料更新成功",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url
        }
    }


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    old_password: str,
    new_password: str,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    修改密码
    """
    # 验证旧密码
    if not AuthService.verify_password(old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误"
        )
    
    # 更新密码
    user.password_hash = AuthService.hash_password(new_password)
    await db.commit()
    
    logger.info(f"用户修改密码成功 - {user.email}")
    
    return MessageResponse(
        success=True,
        message="密码修改成功"
    )
