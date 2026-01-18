"""
Analytics Service - 用户行为分析服务

提供：
1. 事件记录和查询
2. 会话管理
3. 统计数据聚合
4. 用户留存率计算
"""
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.analytics import UserEvent, UserSession, DailyStat
from app.models.user import User
from app.models.user_project import UserProject
from app.models.task import Task, TaskStatus
from app.models.product import Product
from app.models.report import ProductReport
from app.models.analysis import AnalysisProject

logger = logging.getLogger(__name__)


class AnalyticsService:
    """用户行为分析服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ==========================================
    # 事件记录
    # ==========================================
    
    async def record_event(
        self,
        user_id: Optional[UUID],
        event_type: str,
        event_name: str,
        event_data: Optional[Dict[str, Any]] = None,
        page_path: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> UserEvent:
        """记录用户事件"""
        event = UserEvent(
            user_id=user_id,
            event_type=event_type,
            event_name=event_name,
            event_data=event_data,
            page_path=page_path,
            session_id=session_id
        )
        self.db.add(event)
        await self.db.flush()
        return event
    
    async def record_events_batch(
        self,
        events: List[Dict[str, Any]]
    ) -> int:
        """批量记录事件"""
        event_objects = []
        for event_data in events:
            event = UserEvent(
                user_id=event_data.get("user_id"),
                event_type=event_data.get("event_type"),
                event_name=event_data.get("event_name"),
                event_data=event_data.get("event_data"),
                page_path=event_data.get("page_path"),
                session_id=event_data.get("session_id")
            )
            event_objects.append(event)
        
        self.db.add_all(event_objects)
        await self.db.flush()
        return len(event_objects)
    
    # ==========================================
    # 会话管理
    # ==========================================
    
    async def start_session(
        self,
        user_id: UUID,
        session_id: str,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> UserSession:
        """开始新会话"""
        session = UserSession(
            user_id=user_id,
            session_id=session_id,
            user_agent=user_agent,
            ip_address=ip_address
        )
        self.db.add(session)
        await self.db.flush()
        return session
    
    async def update_session_heartbeat(
        self,
        session_id: str,
        page_views: Optional[int] = None
    ) -> Optional[UserSession]:
        """更新会话心跳"""
        stmt = select(UserSession).where(UserSession.session_id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()
        
        if session:
            if page_views is not None:
                session.page_views = page_views
            await self.db.flush()
        
        return session
    
    async def end_session(
        self,
        session_id: str
    ) -> Optional[UserSession]:
        """结束会话"""
        stmt = select(UserSession).where(UserSession.session_id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()
        
        if session and not session.ended_at:
            session.ended_at = datetime.now(timezone.utc)
            if session.started_at:
                duration = (session.ended_at - session.started_at).total_seconds()
                session.duration_seconds = int(duration)
            await self.db.flush()
        
        return session
    
    # ==========================================
    # 统计数据查询
    # ==========================================
    
    async def get_dashboard_overview(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """获取仪表盘概览数据"""
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=days)
        today = now.date()
        yesterday = today - timedelta(days=1)
        
        # 总用户数
        total_users_stmt = select(func.count(User.id))
        total_users_result = await self.db.execute(total_users_stmt)
        total_users = total_users_result.scalar() or 0
        
        # 今日新增用户
        new_users_today_stmt = select(func.count(User.id)).where(
            func.date(User.created_at) == today
        )
        new_users_today_result = await self.db.execute(new_users_today_stmt)
        new_users_today = new_users_today_result.scalar() or 0
        
        # 昨日新增用户（用于计算环比）
        new_users_yesterday_stmt = select(func.count(User.id)).where(
            func.date(User.created_at) == yesterday
        )
        new_users_yesterday_result = await self.db.execute(new_users_yesterday_stmt)
        new_users_yesterday = new_users_yesterday_result.scalar() or 0
        
        # 活跃用户数（7天内登录）
        active_users_7d_stmt = select(func.count(distinct(User.id))).where(
            and_(
                User.last_login_at.isnot(None),
                User.last_login_at >= start_date
            )
        )
        active_users_7d_result = await self.db.execute(active_users_7d_stmt)
        active_users_7d = active_users_7d_result.scalar() or 0
        
        # 活跃用户数（30天内登录）
        active_users_30d_stmt = select(func.count(distinct(User.id))).where(
            and_(
                User.last_login_at.isnot(None),
                User.last_login_at >= (now - timedelta(days=30))
            )
        )
        active_users_30d_result = await self.db.execute(active_users_30d_stmt)
        active_users_30d = active_users_30d_result.scalar() or 0
        
        # 总产品数
        total_products_stmt = select(func.count(Product.id))
        total_products_result = await self.db.execute(total_products_stmt)
        total_products = total_products_result.scalar() or 0
        
        # 今日新增产品
        new_products_today_stmt = select(func.count(UserProject.id)).where(
            and_(
                func.date(UserProject.created_at) == today,
                UserProject.is_deleted == False
            )
        )
        new_products_today_result = await self.db.execute(new_products_today_stmt)
        new_products_today = new_products_today_result.scalar() or 0
        
        # 任务统计
        total_tasks_stmt = select(func.count(Task.id))
        total_tasks_result = await self.db.execute(total_tasks_stmt)
        total_tasks = total_tasks_result.scalar() or 0
        
        completed_tasks_stmt = select(func.count(Task.id)).where(
            Task.status == TaskStatus.COMPLETED.value
        )
        completed_tasks_result = await self.db.execute(completed_tasks_stmt)
        completed_tasks = completed_tasks_result.scalar() or 0
        
        task_completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        # 报告统计
        total_reports_stmt = select(func.count(ProductReport.id))
        total_reports_result = await self.db.execute(total_reports_stmt)
        total_reports = total_reports_result.scalar() or 0
        
        # 计算环比（今日 vs 昨日）
        new_users_growth_rate = 0
        if new_users_yesterday > 0:
            new_users_growth_rate = ((new_users_today - new_users_yesterday) / new_users_yesterday) * 100
        
        return {
            "users": {
                "total": total_users,
                "new_today": new_users_today,
                "new_yesterday": new_users_yesterday,
                "growth_rate": round(new_users_growth_rate, 2),
                "active_7d": active_users_7d,
                "active_30d": active_users_30d
            },
            "products": {
                "total": total_products,
                "new_today": new_products_today
            },
            "tasks": {
                "total": total_tasks,
                "completed": completed_tasks,
                "completion_rate": round(task_completion_rate, 2)
            },
            "reports": {
                "total": total_reports
            }
        }
    
    async def get_user_growth_trend(
        self,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """获取用户增长趋势（按天）"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days - 1)
        
        # 按日期统计新增用户数
        stmt = (
            select(
                func.date(User.created_at).label("date"),
                func.count(User.id).label("count")
            )
            .where(
                func.date(User.created_at) >= start_date,
                func.date(User.created_at) <= end_date
            )
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at))
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        # 构建完整日期列表（填充缺失日期）
        date_dict = {row.date: row.count for row in rows}
        trend_data = []
        current_date = start_date
        
        while current_date <= end_date:
            count = date_dict.get(current_date, 0)
            trend_data.append({
                "date": current_date.isoformat(),
                "count": count
            })
            current_date += timedelta(days=1)
        
        return trend_data
    
    async def get_active_users_stat(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """获取活跃用户统计"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days - 1)
        
        # 按日期统计活跃用户数（有登录记录）
        stmt = (
            select(
                func.date(User.last_login_at).label("date"),
                func.count(distinct(User.id)).label("count")
            )
            .where(
                and_(
                    User.last_login_at.isnot(None),
                    func.date(User.last_login_at) >= start_date,
                    func.date(User.last_login_at) <= end_date
                )
            )
            .group_by(func.date(User.last_login_at))
            .order_by(func.date(User.last_login_at))
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        # 构建完整日期列表
        date_dict = {row.date: row.count for row in rows}
        trend_data = []
        current_date = start_date
        
        while current_date <= end_date:
            count = date_dict.get(current_date, 0)
            trend_data.append({
                "date": current_date.isoformat(),
                "count": count
            })
            current_date += timedelta(days=1)
        
        return {
            "daily_active_users": trend_data,
            "total_active_users": sum(row.count for row in rows)
        }
    
    async def get_feature_usage_stat(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """获取功能使用统计"""
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # 统计各功能事件数量
        stmt = (
            select(
                UserEvent.event_name,
                func.count(UserEvent.id).label("count")
            )
            .where(
                and_(
                    UserEvent.created_at >= start_date,
                    UserEvent.event_type == "feature_use"
                )
            )
            .group_by(UserEvent.event_name)
            .order_by(desc(func.count(UserEvent.id)))
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        feature_stats = [
            {
                "feature": row.event_name,
                "count": row.count
            }
            for row in rows
        ]
        
        # 从现有数据表统计
        # 添加产品
        products_added = await self.db.execute(
            select(func.count(UserProject.id)).where(
                and_(
                    UserProject.created_at >= start_date,
                    UserProject.is_deleted == False
                )
            )
        )
        products_added_count = products_added.scalar() or 0
        
        # 完成任务
        tasks_completed = await self.db.execute(
            select(func.count(Task.id)).where(
                and_(
                    Task.created_at >= start_date,
                    Task.status == TaskStatus.COMPLETED.value
                )
            )
        )
        tasks_completed_count = tasks_completed.scalar() or 0
        
        # 生成报告
        reports_generated = await self.db.execute(
            select(func.count(ProductReport.id)).where(
                ProductReport.created_at >= start_date
            )
        )
        reports_generated_count = reports_generated.scalar() or 0
        
        # 创建对比分析
        analysis_created = await self.db.execute(
            select(func.count(AnalysisProject.id)).where(
                AnalysisProject.created_at >= start_date
            )
        )
        analysis_created_count = analysis_created.scalar() or 0
        
        return {
            "feature_events": feature_stats,
            "products_added": products_added_count,
            "tasks_completed": tasks_completed_count,
            "reports_generated": reports_generated_count,
            "analysis_created": analysis_created_count
        }
    
    async def get_user_retention(
        self,
        cohort_days: int = 7
    ) -> Dict[str, Any]:
        """计算用户留存率（队列分析）"""
        # 简化版留存率：计算注册后7天内的活跃率
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=30)
        
        # 获取注册用户及其首次登录时间
        stmt = (
            select(
                User.id,
                User.created_at,
                func.min(User.last_login_at).label("first_login")
            )
            .where(User.created_at >= start_date)
            .group_by(User.id, User.created_at)
        )
        
        result = await self.db.execute(stmt)
        users = result.all()
        
        # 计算留存率
        retention_data = {
            "day_1": 0,
            "day_3": 0,
            "day_7": 0,
            "day_14": 0,
            "day_30": 0
        }
        
        total_users = len(users)
        if total_users == 0:
            return {
                "retention_rates": retention_data,
                "total_users": 0
            }
        
        for user in users:
            if user.first_login:
                days_since_registration = (user.first_login - user.created_at).days
                if days_since_registration >= 1:
                    retention_data["day_1"] += 1
                if days_since_registration >= 3:
                    retention_data["day_3"] += 1
                if days_since_registration >= 7:
                    retention_data["day_7"] += 1
                if days_since_registration >= 14:
                    retention_data["day_14"] += 1
                if days_since_registration >= 30:
                    retention_data["day_30"] += 1
        
        # 转换为百分比
        for key in retention_data:
            retention_data[key] = round((retention_data[key] / total_users) * 100, 2)
        
        return {
            "retention_rates": retention_data,
            "total_users": total_users
        }
    
    async def get_recent_events(
        self,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """获取最近事件流"""
        stmt = (
            select(UserEvent)
            .order_by(desc(UserEvent.created_at))
            .limit(limit)
        )
        
        result = await self.db.execute(stmt)
        events = result.scalars().all()
        
        return [event.to_dict() for event in events]
