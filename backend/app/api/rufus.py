"""
Rufus API Router - Endpoints for Amazon Rufus AI conversation data
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.schemas import (
    RufusConversationRequest,
    RufusConversationResponse,
    RufusConversationDetail,
    RufusConversationListResponse,
)
from app.models.rufus_conversation import RufusConversation
from app.models.user import User
from app.services.auth_service import get_current_user, get_optional_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rufus", tags=["Rufus"])


@router.post("/conversation", response_model=RufusConversationResponse)
async def save_rufus_conversation(
    request: RufusConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Save a Rufus AI conversation from Chrome extension.
    
    This endpoint:
    1. Receives conversation data (question + answer)
    2. Associates with the current user (if logged in)
    3. Saves to database for analysis
    
    Returns the saved conversation ID.
    """
    try:
        # Create conversation record
        conversation = RufusConversation(
            asin=request.asin,
            marketplace=request.marketplace,
            question=request.question,
            answer=request.answer,
            question_type=request.question_type,
            question_index=request.question_index,
            conversation_id=request.conversation_id,
            raw_html=request.raw_html,
            user_id=current_user.id if current_user else None
        )
        
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        
        logger.info(f"[Rufus] Saved conversation for ASIN {request.asin}, type: {request.question_type}")
        
        return RufusConversationResponse(
            success=True,
            message="Conversation saved successfully",
            conversation_id=conversation.id,
            asin=request.asin
        )
        
    except Exception as e:
        logger.error(f"[Rufus] Error saving conversation: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save conversation: {str(e)}"
        )


@router.get("/conversations/{asin}", response_model=RufusConversationListResponse)
async def get_rufus_conversations(
    asin: str,
    question_type: Optional[str] = Query(None, description="Filter by question type"),
    limit: int = Query(50, ge=1, le=100, description="Maximum results"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get Rufus conversations for a specific product.
    
    Optionally filter by question type and limit results.
    """
    try:
        # Build query
        query = select(RufusConversation).where(RufusConversation.asin == asin)
        
        if question_type:
            query = query.where(RufusConversation.question_type == question_type)
        
        # If user is logged in, prioritize their conversations
        if current_user:
            query = query.order_by(
                (RufusConversation.user_id == current_user.id).desc(),
                RufusConversation.created_at.desc()
            )
        else:
            query = query.order_by(RufusConversation.created_at.desc())
        
        query = query.limit(limit)
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        # Get total count
        count_query = select(func.count()).select_from(RufusConversation).where(
            RufusConversation.asin == asin
        )
        if question_type:
            count_query = count_query.where(RufusConversation.question_type == question_type)
        
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0
        
        return RufusConversationListResponse(
            success=True,
            conversations=[
                RufusConversationDetail(
                    id=c.id,
                    asin=c.asin,
                    marketplace=c.marketplace,
                    question=c.question,
                    answer=c.answer,
                    question_type=c.question_type,
                    question_index=c.question_index,
                    conversation_id=c.conversation_id,
                    created_at=c.created_at,
                    user_id=c.user_id
                )
                for c in conversations
            ],
            total=total
        )
        
    except Exception as e:
        logger.error(f"[Rufus] Error fetching conversations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversations: {str(e)}"
        )


@router.get("/conversation/{conversation_id}", response_model=RufusConversationDetail)
async def get_rufus_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a specific Rufus conversation by ID.
    """
    try:
        result = await db.execute(
            select(RufusConversation).where(RufusConversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )
        
        return RufusConversationDetail(
            id=conversation.id,
            asin=conversation.asin,
            marketplace=conversation.marketplace,
            question=conversation.question,
            answer=conversation.answer,
            question_type=conversation.question_type,
            question_index=conversation.question_index,
            conversation_id=conversation.conversation_id,
            created_at=conversation.created_at,
            user_id=conversation.user_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error fetching conversation {conversation_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversation: {str(e)}"
        )
