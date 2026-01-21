"""
Rufus API Router - Endpoints for Amazon Rufus AI conversation data

[UPDATED 2026-01-21] 
Added support for:
- Multiple page types (homepage, keyword_search, product_detail)
- Session-based conversation grouping
- AI summary generation
"""
import logging
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, distinct, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.schemas import (
    RufusConversationRequest,
    RufusConversationResponse,
    RufusConversationDetail,
    RufusConversationListResponse,
    RufusSessionListResponse,
    RufusSessionGroup,
    RufusSessionSummary,
    RufusSessionDetailResponse,
    RufusSummaryRequest,
    RufusSummaryResponse,
    RufusSessionUpdateRequest,
    RufusDeleteResponse,
    RufusConversationUpdateRequest,
)
from app.models.rufus_conversation import RufusConversation
from app.models.rufus_summary import RufusSummary, SummaryType
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
    
    [UPDATED] Now supports:
    - Multiple page types (homepage, keyword_search, product_detail)
    - Session-based grouping
    - Product context (title, bullet points)
    
    Returns the saved conversation ID.
    """
    try:
        # Convert bullet_points list to JSON string if provided
        bullet_points_json = None
        if request.bullet_points:
            bullet_points_json = json.dumps(request.bullet_points)
        
        # Create conversation record with new fields
        conversation = RufusConversation(
            asin=request.asin,
            marketplace=request.marketplace,
            question=request.question,
            answer=request.answer,
            question_type=request.question_type,
            question_index=request.question_index,
            conversation_id=request.conversation_id,
            raw_html=request.raw_html,
            user_id=current_user.id if current_user else None,
            # New fields
            page_type=request.page_type,
            keyword=request.keyword,
            product_title=request.product_title,
            bullet_points=bullet_points_json,
            product_image=request.product_image,
            session_id=request.session_id,
        )
        
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        
        logger.info(f"[Rufus] Saved conversation: page_type={request.page_type}, "
                   f"asin={request.asin}, type={request.question_type}, "
                   f"session={request.session_id}")
        
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
                    user_id=c.user_id,
                    # New fields
                    page_type=c.page_type,
                    keyword=c.keyword,
                    product_title=c.product_title,
                    bullet_points=c.bullet_points,
                    product_image=c.product_image,
                    session_id=c.session_id,
                    ai_summary=c.ai_summary,
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


@router.patch("/conversation/{conversation_id}", response_model=RufusConversationDetail)
async def update_rufus_conversation(
    conversation_id: UUID,
    request: RufusConversationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a single Rufus conversation.
    
    Allows editing question and answer of a conversation.
    """
    try:
        query = select(RufusConversation).where(
            RufusConversation.id == conversation_id
        )
        
        if current_user:
            query = query.where(RufusConversation.user_id == current_user.id)
        
        result = await db.execute(query)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )
        
        # Update fields
        if request.question is not None:
            conversation.question = request.question
        if request.answer is not None:
            conversation.answer = request.answer
        if request.question_type is not None:
            conversation.question_type = request.question_type
        
        await db.commit()
        await db.refresh(conversation)
        
        logger.info(f"[Rufus] Updated conversation {conversation_id}")
        
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
            user_id=conversation.user_id,
            page_type=conversation.page_type,
            keyword=conversation.keyword,
            product_title=conversation.product_title,
            bullet_points=conversation.bullet_points,
            product_image=conversation.product_image,
            session_id=conversation.session_id,
            ai_summary=None,  # Not used anymore
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error updating conversation {conversation_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update conversation: {str(e)}"
        )


@router.delete("/conversation/{conversation_id}", response_model=RufusDeleteResponse)
async def delete_rufus_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a single Rufus conversation.
    """
    try:
        query = select(RufusConversation).where(
            RufusConversation.id == conversation_id
        )
        
        if current_user:
            query = query.where(RufusConversation.user_id == current_user.id)
        
        result = await db.execute(query)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )
        
        await db.delete(conversation)
        await db.commit()
        
        logger.info(f"[Rufus] Deleted conversation {conversation_id}")
        
        return RufusDeleteResponse(
            success=True,
            message="Conversation deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error deleting conversation {conversation_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete conversation: {str(e)}"
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
            user_id=conversation.user_id,
            # New fields
            page_type=conversation.page_type,
            keyword=conversation.keyword,
            product_title=conversation.product_title,
            bullet_points=conversation.bullet_points,
            product_image=conversation.product_image,
            session_id=conversation.session_id,
            ai_summary=conversation.ai_summary,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error fetching conversation {conversation_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversation: {str(e)}"
        )


# ============== NEW: Session-based API endpoints ==============

@router.get("/sessions", response_model=RufusSessionListResponse)
async def get_rufus_sessions(
    page_type: Optional[str] = Query(None, description="Filter by page type"),
    limit: int = Query(50, ge=1, le=200, description="Maximum sessions per group"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get Rufus conversation sessions grouped by page type.
    
    [UPDATED] 分组逻辑：
    - product_detail: 按 ASIN 分组（同一 ASIN 的对话合并）
    - keyword_search: 按 keyword 分组（同一关键词的对话合并，不显示 ASIN）
    - homepage: 按 session_id 分组
    """
    try:
        groups_dict = {}
        
        # ============ 产品调研：按 ASIN 分组 ============
        product_query = select(
            RufusConversation.asin,
            RufusConversation.product_title,
            RufusConversation.product_image,
            RufusConversation.marketplace,
            func.count(RufusConversation.id).label('conversation_count'),
            func.min(RufusConversation.created_at).label('first_message_at'),
            func.max(RufusConversation.created_at).label('last_message_at'),
        ).where(
            RufusConversation.page_type == 'product_detail',
            RufusConversation.asin.isnot(None),
            RufusConversation.asin != ''
        ).group_by(
            RufusConversation.asin,
            RufusConversation.product_title,
            RufusConversation.product_image,
            RufusConversation.marketplace,
        )
        
        if current_user:
            product_query = product_query.where(RufusConversation.user_id == current_user.id)
        
        product_query = product_query.order_by(desc('last_message_at')).limit(limit)
        
        product_result = await db.execute(product_query)
        product_rows = product_result.fetchall()
        
        # Batch query summaries for product sessions
        product_asins = [row.asin for row in product_rows]
        product_session_group_ids = [f"asin_{asin}" for asin in product_asins]
        product_summaries_query = select(RufusSummary).where(
            RufusSummary.summary_type == SummaryType.SESSION_GROUP.value,
            RufusSummary.session_group_id.in_(product_session_group_ids)
        )
        if current_user:
            product_summaries_query = product_summaries_query.where(
                RufusSummary.user_id == current_user.id
            )
        product_summaries_result = await db.execute(product_summaries_query)
        product_summaries = {s.session_group_id: s for s in product_summaries_result.scalars().all()}
        
        groups_dict['product_detail'] = [
            RufusSessionSummary(
                session_id=f"asin_{row.asin}",  # 使用 asin 作为虚拟 session_id
                page_type='product_detail',
                asin=row.asin,
                keyword=None,
                product_title=row.product_title,
                product_image=row.product_image,
                marketplace=row.marketplace or "US",
                conversation_count=row.conversation_count,
                has_summary=f"asin_{row.asin}" in product_summaries,
                first_message_at=row.first_message_at,
                last_message_at=row.last_message_at,
            )
            for row in product_rows
        ]
        
        # ============ 关键词调研：按 keyword 分组 ============
        keyword_query = select(
            RufusConversation.keyword,
            RufusConversation.marketplace,
            func.count(RufusConversation.id).label('conversation_count'),
            func.min(RufusConversation.created_at).label('first_message_at'),
            func.max(RufusConversation.created_at).label('last_message_at'),
        ).where(
            RufusConversation.page_type == 'keyword_search',
            RufusConversation.keyword.isnot(None),
            RufusConversation.keyword != ''
        ).group_by(
            RufusConversation.keyword,
            RufusConversation.marketplace,
        )
        
        if current_user:
            keyword_query = keyword_query.where(RufusConversation.user_id == current_user.id)
        
        keyword_query = keyword_query.order_by(desc('last_message_at')).limit(limit)
        
        keyword_result = await db.execute(keyword_query)
        keyword_rows = keyword_result.fetchall()
        
        # Batch query summaries for keyword sessions
        keyword_keywords = [row.keyword for row in keyword_rows]
        keyword_session_group_ids = [f"keyword_{kw}" for kw in keyword_keywords]
        keyword_summaries_query = select(RufusSummary).where(
            RufusSummary.summary_type == SummaryType.SESSION_GROUP.value,
            RufusSummary.session_group_id.in_(keyword_session_group_ids)
        )
        if current_user:
            keyword_summaries_query = keyword_summaries_query.where(
                RufusSummary.user_id == current_user.id
            )
        keyword_summaries_result = await db.execute(keyword_summaries_query)
        keyword_summaries = {s.session_group_id: s for s in keyword_summaries_result.scalars().all()}
        
        groups_dict['keyword_search'] = [
            RufusSessionSummary(
                session_id=f"keyword_{row.keyword}",  # 使用 keyword 作为虚拟 session_id
                page_type='keyword_search',
                asin=None,  # 关键词调研不显示 ASIN
                keyword=row.keyword,
                product_title=None,
                marketplace=row.marketplace or "US",
                conversation_count=row.conversation_count,
                has_summary=f"keyword_{row.keyword}" in keyword_summaries,
                first_message_at=row.first_message_at,
                last_message_at=row.last_message_at,
            )
            for row in keyword_rows
        ]
        
        # ============ 首页调研：按 session_id 分组 ============
        homepage_query = select(
            RufusConversation.session_id,
            RufusConversation.marketplace,
            func.count(RufusConversation.id).label('conversation_count'),
            func.min(RufusConversation.created_at).label('first_message_at'),
            func.max(RufusConversation.created_at).label('last_message_at'),
        ).where(
            RufusConversation.page_type == 'homepage',
            RufusConversation.session_id.isnot(None)
        ).group_by(
            RufusConversation.session_id,
            RufusConversation.marketplace,
        )
        
        if current_user:
            homepage_query = homepage_query.where(RufusConversation.user_id == current_user.id)
        
        homepage_query = homepage_query.order_by(desc('last_message_at')).limit(limit)
        
        homepage_result = await db.execute(homepage_query)
        homepage_rows = homepage_result.fetchall()
        
        # Batch query summaries for homepage sessions
        homepage_session_ids = [row.session_id for row in homepage_rows]
        homepage_session_group_ids = [f"session_{sid}" for sid in homepage_session_ids]
        homepage_summaries_query = select(RufusSummary).where(
            RufusSummary.summary_type == SummaryType.SESSION_GROUP.value,
            RufusSummary.session_group_id.in_(homepage_session_group_ids)
        )
        if current_user:
            homepage_summaries_query = homepage_summaries_query.where(
                RufusSummary.user_id == current_user.id
            )
        homepage_summaries_result = await db.execute(homepage_summaries_query)
        homepage_summaries = {s.session_group_id: s for s in homepage_summaries_result.scalars().all()}
        
        groups_dict['homepage'] = [
            RufusSessionSummary(
                session_id=row.session_id,
                page_type='homepage',
                asin=None,
                keyword=None,
                product_title=None,
                marketplace=row.marketplace or "US",
                conversation_count=row.conversation_count,
                has_summary=f"session_{row.session_id}" in homepage_summaries,
                first_message_at=row.first_message_at,
                last_message_at=row.last_message_at,
            )
            for row in homepage_rows
        ]
        
        # Build response groups
        groups = []
        for pt in ['homepage', 'keyword_search', 'product_detail']:
            if pt in groups_dict or not page_type:
                sessions = groups_dict.get(pt, [])
                groups.append(RufusSessionGroup(
                    page_type=pt,
                    sessions=sessions,
                    total=len(sessions),
                ))
        
        total_sessions = sum(len(g.sessions) for g in groups)
        
        return RufusSessionListResponse(
            success=True,
            groups=groups,
            total_sessions=total_sessions,
        )
        
    except Exception as e:
        logger.error(f"[Rufus] Error fetching sessions: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch sessions: {str(e)}"
        )


@router.get("/session/{session_id}", response_model=RufusSessionDetailResponse)
async def get_rufus_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get detailed conversation flow for a specific session.
    
    [UPDATED] 支持虚拟 session_id：
    - asin_XXXXX: 获取该 ASIN 的所有对话
    - keyword_XXXXX: 获取该关键词的所有对话
    - 普通 session_id: 原有逻辑
    """
    try:
        # 解析虚拟 session_id
        if session_id.startswith('asin_'):
            # 按 ASIN 获取对话
            asin = session_id[5:]  # 去掉 "asin_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.asin == asin,
                RufusConversation.page_type == 'product_detail'
            )
        elif session_id.startswith('keyword_'):
            # 按关键词获取对话
            keyword = session_id[8:]  # 去掉 "keyword_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.keyword == keyword,
                RufusConversation.page_type == 'keyword_search'
            )
        else:
            # 普通 session_id
            query = select(RufusConversation).where(
                RufusConversation.session_id == session_id
            )
        
        # 添加用户过滤
        if current_user:
            query = query.where(RufusConversation.user_id == current_user.id)
        
        query = query.order_by(RufusConversation.created_at)
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        if not conversations:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
        
        # Get session info from first conversation
        first_conv = conversations[0]
        
        # Build conversation details
        conv_details = []
        for conv in conversations:
            conv_details.append(RufusConversationDetail(
                id=conv.id,
                asin=conv.asin,
                marketplace=conv.marketplace,
                question=conv.question,
                answer=conv.answer,
                question_type=conv.question_type,
                question_index=conv.question_index,
                conversation_id=conv.conversation_id,
                created_at=conv.created_at,
                user_id=conv.user_id,
                page_type=conv.page_type,
                keyword=conv.keyword,
                product_title=conv.product_title,
                bullet_points=conv.bullet_points,
                product_image=conv.product_image,
                session_id=conv.session_id,
                ai_summary=conv.ai_summary,
            ))
        
        # Get AI summary from rufus_summaries table (session_group type)
        # Determine session_group_id based on page_type
        page_type = first_conv.page_type
        if page_type == "product_detail" and first_conv.asin:
            session_group_id = f"asin_{first_conv.asin}"
        elif page_type == "keyword_search" and first_conv.keyword:
            session_group_id = f"keyword_{first_conv.keyword}"
        else:
            session_group_id = f"session_{session_id}"
        
        # Query session group summary
        summary_query = select(RufusSummary).where(
            RufusSummary.summary_type == SummaryType.SESSION_GROUP.value,
            RufusSummary.session_group_id == session_group_id
        )
        if current_user:
            summary_query = summary_query.where(
                RufusSummary.user_id == current_user.id
            )
        
        summary_result = await db.execute(summary_query)
        summary_obj = summary_result.scalar_one_or_none()
        ai_summary = summary_obj.summary_text if summary_obj else None
        
        # 根据类型返回不同的信息
        if session_id.startswith('keyword_'):
            # 关键词调研不返回 ASIN
            return RufusSessionDetailResponse(
                success=True,
                session_id=session_id,
                page_type=first_conv.page_type,
                asin=None,
                keyword=first_conv.keyword,
                product_title=None,
                marketplace=first_conv.marketplace,
                conversations=conv_details,
                ai_summary=ai_summary,
            )
        else:
            # 获取产品图片（从任意对话中获取）
            product_image = None
            for conv in conversations:
                if conv.product_image:
                    product_image = conv.product_image
                    break
            
            return RufusSessionDetailResponse(
                success=True,
                session_id=session_id,
                page_type=first_conv.page_type,
                asin=first_conv.asin,
                keyword=first_conv.keyword,
                product_title=first_conv.product_title,
                product_image=product_image,
                marketplace=first_conv.marketplace,
                conversations=conv_details,
                ai_summary=ai_summary,
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error fetching session {session_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch session: {str(e)}"
        )


@router.post("/session/{session_id}/summary", response_model=RufusSummaryResponse)
async def generate_rufus_summary(
    session_id: str,
    request: RufusSummaryRequest = RufusSummaryRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate AI summary for a Rufus conversation session.
    
    This endpoint:
    1. Fetches all conversations in the session
    2. Calls AI to generate a summary
    3. Stores the summary in the database
    
    Use force_regenerate=true to regenerate an existing summary.
    """
    try:
        # Get all conversations in this session
        query = select(RufusConversation).where(
            RufusConversation.session_id == session_id
        ).order_by(RufusConversation.created_at)
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        if not conversations:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
        
        # Check if session group summary already exists
        # Determine session_group_id based on page_type
        first_conv = conversations[0]
        page_type = first_conv.page_type
        
        if page_type == "product_detail" and first_conv.asin:
            session_group_id = f"asin_{first_conv.asin}"
        elif page_type == "keyword_search" and first_conv.keyword:
            session_group_id = f"keyword_{first_conv.keyword}"
        else:
            session_group_id = f"session_{session_id}"
        
        # Check for existing session group summary
        existing_summary_query = select(RufusSummary).where(
            RufusSummary.summary_type == SummaryType.SESSION_GROUP.value,
            RufusSummary.session_group_id == session_group_id
        )
        if current_user:
            existing_summary_query = existing_summary_query.where(
                RufusSummary.user_id == current_user.id
            )
        
        existing_summary_result = await db.execute(existing_summary_query)
        existing_summary_obj = existing_summary_result.scalar_one_or_none()
        
        if existing_summary_obj and not request.force_regenerate:
            return RufusSummaryResponse(
                success=True,
                session_id=session_id,
                summary=existing_summary_obj.summary_text,
                message="Summary already exists"
            )
        
        # Build conversation context for AI
        conv_texts = []
        for conv in conversations:
            conv_texts.append(f"Q: {conv.question}\nA: {conv.answer}")
        
        context = "\n\n".join(conv_texts)
        
        # Get context info
        product_title = first_conv.product_title or ""
        keyword = first_conv.keyword or ""
        
        # Generate summary using AI service
        try:
            from app.services.ai_service import AIService
            ai_service = AIService()
            
            # Build prompt based on page type
            if page_type == "homepage":
                prompt = f"""请分析以下与亚马逊AI助手Rufus的对话记录，生成一份简洁的中文总结报告。

对话记录：
{context}

请从以下几个角度进行总结（200-300字）：
1. 用户关注的主要话题或问题
2. Rufus给出的关键信息或建议
3. 潜在的用户需求或购买意向"""
            
            elif page_type == "keyword_search":
                prompt = f"""请分析以下关于搜索关键词「{keyword}」的Rufus对话记录，生成一份简洁的中文总结报告。

对话记录：
{context}

请从以下几个角度进行总结（200-300字）：
1. 用户对该品类的关注点
2. Rufus提供的产品推荐或建议
3. 用户的具体需求或偏好"""
            
            else:  # product_detail
                prompt = f"""请分析以下关于产品「{product_title}」的Rufus对话记录，生成一份简洁的中文总结报告。

对话记录：
{context}

请从以下几个角度进行总结（200-300字）：
1. 用户对产品的主要疑问
2. 产品的优势和不足（基于Rufus回答）
3. 潜在的改进建议或用户痛点"""
            
            summary = await ai_service.generate_text(prompt, max_tokens=500)
            
        except Exception as ai_error:
            logger.error(f"[Rufus] AI service error: {ai_error}")
            # Fallback: generate simple summary
            summary = f"该会话包含 {len(conversations)} 条对话记录。"
            if page_type == "keyword_search":
                summary += f" 搜索关键词：{keyword}。"
            elif page_type == "product_detail" and product_title:
                summary += f" 产品：{product_title}。"
        
        # Store summary in rufus_summaries table (session_group type)
        if existing_summary_obj:
            # Update existing summary
            existing_summary_obj.summary_text = summary
            from datetime import datetime, timezone
            existing_summary_obj.updated_at = datetime.now(timezone.utc)
        else:
            # Create new summary
            new_summary = RufusSummary(
                summary_type=SummaryType.SESSION_GROUP.value,
                session_group_id=session_group_id,
                page_type=page_type,
                summary_text=summary,
                user_id=current_user.id if current_user else None
            )
            db.add(new_summary)
        
        await db.commit()
        
        logger.info(f"[Rufus] Generated session group summary for {session_group_id}")
        
        return RufusSummaryResponse(
            success=True,
            session_id=session_id,
            summary=summary,
            message="Summary generated successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error generating summary for session {session_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate summary: {str(e)}"
        )


@router.delete("/session/{session_id}", response_model=RufusDeleteResponse)
async def delete_rufus_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a Rufus conversation session.
    
    [UPDATED] 支持虚拟 session_id：
    - asin_XXXXX: 删除该 ASIN 的所有对话
    - keyword_XXXXX: 删除该关键词的所有对话
    - 普通 session_id: 删除该会话的所有对话
    """
    try:
        # 解析虚拟 session_id
        if session_id.startswith('asin_'):
            # 按 ASIN 删除对话
            asin = session_id[5:]  # 去掉 "asin_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.asin == asin,
                RufusConversation.page_type == 'product_detail',
                RufusConversation.user_id == current_user.id
            )
        elif session_id.startswith('keyword_'):
            # 按关键词删除对话
            keyword = session_id[8:]  # 去掉 "keyword_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.keyword == keyword,
                RufusConversation.page_type == 'keyword_search',
                RufusConversation.user_id == current_user.id
            )
        else:
            # 普通 session_id
            query = select(RufusConversation).where(
                RufusConversation.session_id == session_id,
                RufusConversation.user_id == current_user.id
            )
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        if not conversations:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
        
        # 删除所有对话
        deleted_count = len(conversations)
        for conv in conversations:
            await db.delete(conv)
        
        await db.commit()
        
        logger.info(f"[Rufus] Deleted session {session_id}: {deleted_count} conversations")
        
        return RufusDeleteResponse(
            success=True,
            message=f"Successfully deleted {deleted_count} conversation(s)",
            deleted_count=deleted_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error deleting session {session_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete session: {str(e)}"
        )


@router.patch("/session/{session_id}", response_model=RufusSessionDetailResponse)
async def update_rufus_session(
    session_id: str,
    request: RufusSessionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update session metadata (product_title, keyword, product_image).
    
    [UPDATED] 支持虚拟 session_id：
    - asin_XXXXX: 更新该 ASIN 的所有对话
    - keyword_XXXXX: 更新该关键词的所有对话
    - 普通 session_id: 更新该会话的所有对话
    """
    try:
        # 解析虚拟 session_id
        if session_id.startswith('asin_'):
            # 按 ASIN 更新对话
            asin = session_id[5:]  # 去掉 "asin_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.asin == asin,
                RufusConversation.page_type == 'product_detail',
                RufusConversation.user_id == current_user.id
            )
        elif session_id.startswith('keyword_'):
            # 按关键词更新对话
            keyword = session_id[8:]  # 去掉 "keyword_" 前缀
            query = select(RufusConversation).where(
                RufusConversation.keyword == keyword,
                RufusConversation.page_type == 'keyword_search',
                RufusConversation.user_id == current_user.id
            )
        else:
            # 普通 session_id
            query = select(RufusConversation).where(
                RufusConversation.session_id == session_id,
                RufusConversation.user_id == current_user.id
            )
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        if not conversations:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
        
        # 更新所有对话的元信息
        updated_count = 0
        for conv in conversations:
            if request.product_title is not None:
                conv.product_title = request.product_title
            if request.keyword is not None:
                conv.keyword = request.keyword
            if request.product_image is not None:
                conv.product_image = request.product_image
            updated_count += 1
        
        await db.commit()
        
        logger.info(f"[Rufus] Updated session {session_id}: {updated_count} conversations")
        
        # 返回更新后的会话详情
        first_conv = conversations[0]
        
        # 重新构建对话详情
        conv_details = []
        for conv in conversations:
            conv_details.append(RufusConversationDetail(
                id=conv.id,
                asin=conv.asin,
                marketplace=conv.marketplace,
                question=conv.question,
                answer=conv.answer,
                question_type=conv.question_type,
                question_index=conv.question_index,
                conversation_id=conv.conversation_id,
                created_at=conv.created_at,
                user_id=conv.user_id,
                page_type=conv.page_type,
                keyword=conv.keyword,
                product_title=conv.product_title,
                bullet_points=conv.bullet_points,
                product_image=conv.product_image,
                session_id=conv.session_id,
                ai_summary=conv.ai_summary,
            ))
        
        # 获取产品图片和AI总结
        product_image = None
        ai_summary = None
        for conv in conversations:
            if conv.product_image:
                product_image = conv.product_image
            if conv.ai_summary:
                ai_summary = conv.ai_summary
            if product_image and ai_summary:
                break
        
        return RufusSessionDetailResponse(
            success=True,
            session_id=session_id,
            page_type=first_conv.page_type,
            asin=first_conv.asin,
            keyword=first_conv.keyword,
            product_title=first_conv.product_title,
            product_image=product_image,
            marketplace=first_conv.marketplace,
            conversations=conv_details,
            ai_summary=ai_summary,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Rufus] Error updating session {session_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update session: {str(e)}"
        )
