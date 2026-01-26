"""
数据透视AI洞察生成服务
"""
import json
import logging
from typing import Dict, Any, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_
from openai import OpenAI

from app.models.product import Product
from app.models.product_pivot_insight import ProductPivotInsight
from app.models.review import Review
from app.services.translation import translation_service
from app.services.pivot_insight_prompts import generate_pivot_insight_prompt
from app.core.config import settings

logger = logging.getLogger(__name__)


class PivotInsightService:
    """数据透视AI洞察服务"""
    
    def __init__(self, db: Session):
        self.db = db
        # 使用 translation_service 的 client，如果没有则创建新的
        if translation_service.client:
            self.client = translation_service.client
        else:
            self.client = OpenAI(
                api_key=settings.QWEN_API_KEY,
                base_url=settings.QWEN_API_BASE,
                timeout=120.0,
            )
        self.model = settings.QWEN_MODEL
    
    def generate_all_insights(self, product_id: UUID) -> Dict[str, Any]:
        """生成所有数据透视洞察"""
        try:
            product = self.db.query(Product).filter(Product.id == product_id).first()
            if not product:
                return {"success": False, "error": "产品不存在"}
            
            # 获取产品的所有评论
            reviews = self.db.query(Review).filter(
                Review.product_id == product_id
            ).all()
            
            if not reviews or len(reviews) < 5:
                return {"success": False, "error": "评论数量不足，至少需要5条评论"}
            
            results = {
                "product_id": str(product_id),
                "total_reviews": len(reviews),
                "generated_insights": []
            }
            
            # 1. 生成人群洞察
            audience_insights = self._generate_audience_insights(product, reviews)
            results["generated_insights"].extend(audience_insights)
            
            # 2. 生成需求洞察
            demand_insights = self._generate_demand_insights(product, reviews)
            results["generated_insights"].extend(demand_insights)
            
            # 3. 生成产品洞察
            product_insights = self._generate_product_insights(product, reviews)
            results["generated_insights"].extend(product_insights)
            
            # 4. 生成场景洞察
            scenario_insights = self._generate_scenario_insights(product, reviews)
            results["generated_insights"].extend(scenario_insights)
            
            # 5. 生成品牌洞察
            brand_insights = self._generate_brand_insights(product, reviews)
            results["generated_insights"].extend(brand_insights)
            
            # 6. 从dimension_summaries迁移数据（如果存在）
            self._migrate_dimension_summaries(product)
            
            results["success"] = True
            results["total_generated"] = len(results["generated_insights"])
            
            return results
            
        except Exception as e:
            logger.error(f"生成数据透视洞察失败: {str(e)}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def _generate_audience_insights(self, product: Product, reviews: List[Review]) -> List[Dict]:
        """生成人群洞察"""
        insights = []
        
        try:
            # 1.1 决策链路分析 (buyer -> user)
            buyer_user_data = self._analyze_decision_flow(reviews)
            if buyer_user_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="audience",
                    sub_type="decision_flow",
                    insight_data=self._generate_ai_interpretation(
                        "decision_flow",
                        buyer_user_data,
                        len(reviews)
                    ),
                    raw_data=buyer_user_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 1.2 人群-卖点匹配分析
            buyer_strength_data = self._analyze_audience_strength(reviews)
            if buyer_strength_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="audience",
                    sub_type="audience_strength",
                    insight_data=self._generate_ai_interpretation(
                        "audience_strength",
                        buyer_strength_data,
                        len(reviews)
                    ),
                    raw_data=buyer_strength_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 1.3 决策逻辑链 (buyer × user × motivation)
            buyer_user_motivation_data = self._analyze_decision_logic_chain(reviews)
            if buyer_user_motivation_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="audience",
                    sub_type="decision_logic_chain",
                    insight_data=self._generate_ai_interpretation(
                        "decision_logic_chain",
                        buyer_user_motivation_data,
                        len(reviews)
                    ),
                    raw_data=buyer_user_motivation_data
                )
                if insight:
                    insights.append(insight.to_dict())
                    
        except Exception as e:
            logger.error(f"生成人群洞察失败: {str(e)}")
        
        return insights
    
    def _generate_demand_insights(self, product: Product, reviews: List[Review]) -> List[Dict]:
        """生成需求洞察"""
        insights = []
        
        try:
            # 2.1 需求满足度矩阵 (motivation × sentiment)
            motivation_sentiment_data = self._analyze_demand_satisfaction(reviews)
            if motivation_sentiment_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="demand",
                    sub_type="demand_satisfaction",
                    insight_data=self._generate_ai_interpretation(
                        "demand_satisfaction",
                        motivation_sentiment_data,
                        len(reviews)
                    ),
                    raw_data=motivation_sentiment_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 2.2 刚需场景分析 (motivation × location)
            motivation_location_data = self._analyze_motivation_location(reviews)
            if motivation_location_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="demand",
                    sub_type="motivation_location",
                    insight_data=self._generate_ai_interpretation(
                        "motivation_location",
                        motivation_location_data,
                        len(reviews)
                    ),
                    raw_data=motivation_location_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 2.3 心智匹配分析 (motivation × emotion)
            motivation_emotion_data = self._analyze_motivation_emotion(reviews)
            if motivation_emotion_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="demand",
                    sub_type="motivation_emotion",
                    insight_data=self._generate_ai_interpretation(
                        "motivation_emotion",
                        motivation_emotion_data,
                        len(reviews)
                    ),
                    raw_data=motivation_emotion_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 2.4 研发优先级 (motivation × weakness × suggestion)
            motivation_weakness_suggestion_data = self._analyze_motivation_weakness_suggestion(reviews)
            if motivation_weakness_suggestion_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="demand",
                    sub_type="rnd_priority",
                    insight_data=self._generate_ai_interpretation(
                        "rnd_priority",
                        motivation_weakness_suggestion_data,
                        len(reviews)
                    ),
                    raw_data=motivation_weakness_suggestion_data
                )
                if insight:
                    insights.append(insight.to_dict())
                    
        except Exception as e:
            logger.error(f"生成需求洞察失败: {str(e)}")
        
        return insights
    
    def _generate_product_insights(self, product: Product, reviews: List[Review]) -> List[Dict]:
        """生成产品洞察"""
        insights = []
        
        try:
            # 3.1 致命缺陷识别 (weakness × sentiment)
            weakness_sentiment_data = self._analyze_critical_weakness(reviews)
            if weakness_sentiment_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="critical_weakness",
                    insight_data=self._generate_ai_interpretation(
                        "critical_weakness",
                        weakness_sentiment_data,
                        len(reviews)
                    ),
                    raw_data=weakness_sentiment_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 3.2 优劣势对比
            strength_weakness_data = self._analyze_strength_weakness(reviews)
            if strength_weakness_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="strength_weakness",
                    insight_data=self._generate_ai_interpretation(
                        "strength_weakness",
                        strength_weakness_data,
                        len(reviews)
                    ),
                    raw_data=strength_weakness_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 3.3 优势情感分析 (strength × emotion)
            strength_emotion_data = self._analyze_strength_emotion(reviews)
            if strength_emotion_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="strength_emotion",
                    insight_data=self._generate_ai_interpretation(
                        "strength_emotion",
                        strength_emotion_data,
                        len(reviews)
                    ),
                    raw_data=strength_emotion_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 3.4 场景化改进建议 (location × suggestion)
            location_suggestion_data = self._analyze_improvement_priority(reviews)
            if location_suggestion_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="improvement_priority",
                    insight_data=self._generate_ai_interpretation(
                        "improvement_priority",
                        location_suggestion_data,
                        len(reviews)
                    ),
                    raw_data=location_suggestion_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 3.5 动机分层优化 (motivation × suggestion)
            motivation_suggestion_data = self._analyze_motivation_suggestion(reviews)
            if motivation_suggestion_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="motivation_suggestion",
                    insight_data=self._generate_ai_interpretation(
                        "motivation_suggestion",
                        motivation_suggestion_data,
                        len(reviews)
                    ),
                    raw_data=motivation_suggestion_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 3.6 维度冲突分析 (strength × suggestion)
            negative_optimization_data = self._analyze_negative_optimization(reviews)
            if negative_optimization_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="product",
                    sub_type="negative_optimization",
                    insight_data=self._generate_ai_interpretation(
                        "negative_optimization",
                        negative_optimization_data,
                        len(reviews)
                    ),
                    raw_data=negative_optimization_data
                )
                if insight:
                    insights.append(insight.to_dict())
                    
        except Exception as e:
            logger.error(f"生成产品洞察失败: {str(e)}")
        
        return insights
    
    def _generate_scenario_insights(self, product: Product, reviews: List[Review]) -> List[Dict]:
        """生成场景洞察"""
        insights = []
        
        try:
            # 4.1 场景分布分析 (where × when)
            scenario_distribution = self._analyze_scenario_distribution(reviews)
            if scenario_distribution:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="scenario",
                    sub_type="scenario_distribution",
                    insight_data=self._generate_ai_interpretation(
                        "scenario_distribution",
                        scenario_distribution,
                        len(reviews)
                    ),
                    raw_data=scenario_distribution
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 4.2 场景-情感关联 (scenario × emotion)
            scenario_sentiment = self._analyze_scenario_sentiment(reviews)
            if scenario_sentiment:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="scenario",
                    sub_type="scenario_sentiment",
                    insight_data=self._generate_ai_interpretation(
                        "scenario_sentiment",
                        scenario_sentiment,
                        len(reviews)
                    ),
                    raw_data=scenario_sentiment
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 4.3 真实生活瞬间 (location × time × scenario)
            life_moment_data = self._analyze_life_moment(reviews)
            if life_moment_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="scenario",
                    sub_type="life_moment",
                    insight_data=self._generate_ai_interpretation(
                        "life_moment",
                        life_moment_data,
                        len(reviews)
                    ),
                    raw_data=life_moment_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 4.4 环境冲突分析 (emotion × dimension × location)
            environment_conflict_data = self._analyze_environment_conflict(reviews)
            if environment_conflict_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="scenario",
                    sub_type="environment_conflict",
                    insight_data=self._generate_ai_interpretation(
                        "environment_conflict",
                        environment_conflict_data,
                        len(reviews)
                    ),
                    raw_data=environment_conflict_data
                )
                if insight:
                    insights.append(insight.to_dict())
                    
        except Exception as e:
            logger.error(f"生成场景洞察失败: {str(e)}")
        
        return insights
    
    def _generate_brand_insights(self, product: Product, reviews: List[Review]) -> List[Dict]:
        """生成品牌洞察"""
        insights = []
        
        try:
            # 5.1 品牌记忆点 (strength × scenario × emotion)
            brand_memory_data = self._analyze_brand_memory(reviews)
            if brand_memory_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="brand",
                    sub_type="brand_memory",
                    insight_data=self._generate_ai_interpretation(
                        "brand_memory",
                        brand_memory_data,
                        len(reviews)
                    ),
                    raw_data=brand_memory_data
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 5.2 推荐意愿分析 (rating × helpful_votes)
            recommendation_willingness = self._analyze_recommendation_willingness(reviews)
            if recommendation_willingness:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="brand",
                    sub_type="recommendation_willingness",
                    insight_data=self._generate_ai_interpretation(
                        "recommendation_willingness",
                        recommendation_willingness,
                        len(reviews)
                    ),
                    raw_data=recommendation_willingness
                )
                if insight:
                    insights.append(insight.to_dict())
            
            # 5.3 品牌核心心智 (strength统计)
            brand_mind_data = self._analyze_brand_mind(reviews)
            if brand_mind_data:
                insight = self._save_insight(
                    product_id=product.id,
                    insight_type="brand",
                    sub_type="brand_mind",
                    insight_data=self._generate_ai_interpretation(
                        "brand_mind",
                        brand_mind_data,
                        len(reviews)
                    ),
                    raw_data=brand_mind_data
                )
                if insight:
                    insights.append(insight.to_dict())
                    
        except Exception as e:
            logger.error(f"生成品牌洞察失败: {str(e)}")
        
        return insights
    
    def _analyze_decision_flow(self, reviews: List[Review]) -> Optional[Dict]:
        """分析决策链路 (buyer -> user)"""
        from app.models.theme_highlight import ReviewThemeHighlight
        
        buyer_user_pairs = {}
        total = 0
        
        # 查询所有评论的标签
        review_ids = [r.id for r in reviews]
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids)
        ).all()
        
        # 按评论ID组织标签
        labels_by_review = {}
        for th in theme_highlights:
            if th.review_id not in labels_by_review:
                labels_by_review[th.review_id] = {"buyer": [], "user": []}
            if th.theme_type == "buyer":
                labels_by_review[th.review_id]["buyer"].append(th.label_name)
            elif th.theme_type == "user":
                labels_by_review[th.review_id]["user"].append(th.label_name)
        
        # 统计 buyer-user 配对
        for review_id, labels in labels_by_review.items():
            buyers = labels.get("buyer", [])
            users = labels.get("user", [])
            
            if buyers and users:
                for buyer in buyers:
                    for user in users:
                        key = f"{buyer}→{user}"
                        buyer_user_pairs[key] = buyer_user_pairs.get(key, 0) + 1
                        total += 1
        
        if not buyer_user_pairs:
            return None
        
        pairs = [
            {"buyer": k.split("→")[0], "user": k.split("→")[1], "count": v, "percent": round(v / total * 100, 1)}
            for k, v in sorted(buyer_user_pairs.items(), key=lambda x: x[1], reverse=True)
        ]
        
        return {
            "buyerUserPairs": pairs,
            "totalReviews": len(reviews),
            "totalRelations": total
        }
    
    def _analyze_audience_strength(self, reviews: List[Review]) -> Optional[Dict]:
        """分析人群-卖点匹配"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        buyer_strength_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有评论的标签和洞察
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids)
        ).all()
        
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "strength"
        ).all()
        
        # 按评论ID组织数据
        buyers_by_review = {}
        strengths_by_review = {}
        
        for th in theme_highlights:
            if th.theme_type == "buyer":
                if th.review_id not in buyers_by_review:
                    buyers_by_review[th.review_id] = []
                buyers_by_review[th.review_id].append(th.label_name)
        
        for insight in insights:
            if insight.review_id not in strengths_by_review:
                strengths_by_review[insight.review_id] = []
            strengths_by_review[insight.review_id].append(insight.dimension or "其他")
        
        # 构建 buyer-strength 映射
        for review_id in review_ids:
            buyers = buyers_by_review.get(review_id, [])
            strengths = strengths_by_review.get(review_id, [])
            
            for buyer in buyers:
                if buyer not in buyer_strength_map:
                    buyer_strength_map[buyer] = {}
                for strength in strengths:
                    buyer_strength_map[buyer][strength] = buyer_strength_map[buyer].get(strength, 0) + 1
        
        if not buyer_strength_map:
            return None
        
        return {"buyerStrengthMap": buyer_strength_map}
    
    def _analyze_demand_satisfaction(self, reviews: List[Review]) -> Optional[Dict]:
        """分析需求满足度"""
        from app.models.theme_highlight import ReviewThemeHighlight
        
        motivation_sentiment = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有评论的动机标签
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "why"
        ).all()
        
        # 按评论ID组织动机数据
        motivations_by_review = {}
        for th in theme_highlights:
            if th.review_id not in motivations_by_review:
                motivations_by_review[th.review_id] = []
            motivations_by_review[th.review_id].append(th.label_name)
        
        # 统计动机-情感关系
        for review in reviews:
            motivations = motivations_by_review.get(review.id, [])
            sentiment = review.sentiment or "neutral"
            
            for motivation in motivations:
                if motivation not in motivation_sentiment:
                    motivation_sentiment[motivation] = {"positive": 0, "neutral": 0, "negative": 0, "total": 0}
                motivation_sentiment[motivation][sentiment] += 1
                motivation_sentiment[motivation]["total"] += 1
        
        if not motivation_sentiment:
            return None
        
        data = [
            {
                "motivation": k,
                "positive": v["positive"],
                "neutral": v["neutral"],
                "negative": v["negative"],
                "total": v["total"]
            }
            for k, v in sorted(motivation_sentiment.items(), key=lambda x: x[1]["total"], reverse=True)
        ]
        
        return {"motivationSentiment": data}
    
    def _analyze_critical_weakness(self, reviews: List[Review]) -> Optional[Dict]:
        """分析致命缺陷"""
        from app.models.insight import ReviewInsight
        
        weakness_sentiment = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有劣势洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "weakness"
        ).all()
        
        # 按维度组织劣势数据
        weaknesses_by_review = {}
        for insight in insights:
            if insight.review_id not in weaknesses_by_review:
                weaknesses_by_review[insight.review_id] = []
            weaknesses_by_review[insight.review_id].append(insight.dimension or "其他")
        
        # 统计劣势-情感关系
        for review in reviews:
            weaknesses = weaknesses_by_review.get(review.id, [])
            sentiment = review.sentiment or "neutral"
            
            for weakness in weaknesses:
                if weakness not in weakness_sentiment:
                    weakness_sentiment[weakness] = {"positive": 0, "neutral": 0, "negative": 0, "total": 0}
                weakness_sentiment[weakness][sentiment] += 1
                weakness_sentiment[weakness]["total"] += 1
        
        if not weakness_sentiment:
            return None
        
        data = [
            {
                "weakness": k,
                "negative": v["negative"],
                "total": v["total"],
                "negativePercent": round(v["negative"] / v["total"] * 100, 1) if v["total"] > 0 else 0
            }
            for k, v in sorted(weakness_sentiment.items(), key=lambda x: x[1]["negative"], reverse=True)
        ]
        
        return {"weaknessSentiment": data}
    
    def _analyze_strength_weakness(self, reviews: List[Review]) -> Optional[Dict]:
        """分析优劣势对比"""
        from app.models.insight import ReviewInsight
        
        dimension_data = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有优势和劣势洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["strength", "weakness"])
        ).all()
        
        # 统计各维度的优劣势
        for insight in insights:
            dim = insight.dimension or "其他"
            if dim not in dimension_data:
                dimension_data[dim] = {"strengths": 0, "weaknesses": 0}
            
            if insight.insight_type == "strength":
                dimension_data[dim]["strengths"] += 1
            elif insight.insight_type == "weakness":
                dimension_data[dim]["weaknesses"] += 1
        
        if not dimension_data:
            return None
        
        return {"dimensionComparison": dimension_data}
    
    def _analyze_improvement_priority(self, reviews: List[Review]) -> Optional[Dict]:
        """分析改进优先级"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        location_suggestion = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有地点标签和改进建议
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "where"
        ).all()
        
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "suggestion"
        ).all()
        
        # 按评论ID组织数据
        locations_by_review = {}
        suggestions_by_review = {}
        
        for th in theme_highlights:
            if th.review_id not in locations_by_review:
                locations_by_review[th.review_id] = []
            locations_by_review[th.review_id].append(th.label_name)
        
        for insight in insights:
            if insight.review_id not in suggestions_by_review:
                suggestions_by_review[insight.review_id] = []
            # 使用 analysis 字段作为建议内容
            if insight.analysis:
                suggestions_by_review[insight.review_id].append(insight.analysis)
        
        # 构建 location-suggestion 映射
        for review_id in review_ids:
            locations = locations_by_review.get(review_id, [])
            suggestions = suggestions_by_review.get(review_id, [])
            
            for location in locations:
                if location not in location_suggestion:
                    location_suggestion[location] = {}
                for suggestion in suggestions:
                    if suggestion:
                        location_suggestion[location][suggestion] = location_suggestion[location].get(suggestion, 0) + 1
        
        if not location_suggestion:
            return None
        
        return {"locationSuggestion": location_suggestion}
    
    def _analyze_scenario_distribution(self, reviews: List[Review]) -> Optional[Dict]:
        """分析场景分布 (where × when)"""
        from app.models.theme_highlight import ReviewThemeHighlight
        
        scenario_matrix = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有地点和时间标签
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type.in_(["where", "when"])
        ).all()
        
        # 按评论ID组织数据
        locations_by_review = {}
        times_by_review = {}
        
        for th in theme_highlights:
            if th.theme_type == "where":
                if th.review_id not in locations_by_review:
                    locations_by_review[th.review_id] = []
                locations_by_review[th.review_id].append(th.label_name)
            elif th.theme_type == "when":
                if th.review_id not in times_by_review:
                    times_by_review[th.review_id] = []
                times_by_review[th.review_id].append(th.label_name)
        
        # 构建场景矩阵
        for review_id in review_ids:
            locations = locations_by_review.get(review_id, [])
            times = times_by_review.get(review_id, [])
            
            for location in locations:
                if location not in scenario_matrix:
                    scenario_matrix[location] = {}
                for time in times:
                    scenario_matrix[location][time] = scenario_matrix[location].get(time, 0) + 1
        
        if not scenario_matrix:
            return None
        
        return {"scenarioMatrix": scenario_matrix}
    
    def _analyze_scenario_sentiment(self, reviews: List[Review]) -> Optional[Dict]:
        """分析场景-情感关联（场景×情感）"""
        from app.models.insight import ReviewInsight
        
        scenario_emotion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有场景和情感洞察（从insights表）
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["scenario", "emotion"])
        ).all()
        
        # 按评论ID组织数据
        scenarios_by_review = {}
        emotions_by_review = {}
        
        for insight in insights:
            if insight.insight_type == "scenario":
                if insight.review_id not in scenarios_by_review:
                    scenarios_by_review[insight.review_id] = []
                if insight.dimension:
                    scenarios_by_review[insight.review_id].append(insight.dimension)
            elif insight.insight_type == "emotion":
                if insight.review_id not in emotions_by_review:
                    emotions_by_review[insight.review_id] = []
                if insight.dimension:
                    emotions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建场景×情感矩阵
        for review_id in review_ids:
            scenarios = scenarios_by_review.get(review_id, [])
            emotions = emotions_by_review.get(review_id, [])
            
            for scenario in scenarios:
                if scenario not in scenario_emotion_map:
                    scenario_emotion_map[scenario] = {}
                for emotion in emotions:
                    scenario_emotion_map[scenario][emotion] = scenario_emotion_map[scenario].get(emotion, 0) + 1
        
        if not scenario_emotion_map:
            return None
        
        # 收集所有场景和情感
        all_scenarios = list(scenario_emotion_map.keys())
        all_emotions = set()
        for emotions_dict in scenario_emotion_map.values():
            all_emotions.update(emotions_dict.keys())
        all_emotions = list(all_emotions)
        
        # 构建矩阵数据
        matrix = {}
        for scenario in all_scenarios:
            matrix[scenario] = {}
            for emotion in all_emotions:
                matrix[scenario][emotion] = scenario_emotion_map[scenario].get(emotion, 0)
        
        return {
            "scenarioEmotionMatrix": matrix,
            "scenarios": all_scenarios,
            "emotions": all_emotions
        }
    
    def _analyze_brand_mind(self, reviews: List[Review]) -> Optional[Dict]:
        """分析品牌核心心智（优势维度统计）"""
        from app.models.insight import ReviewInsight
        
        strength_counts = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有优势洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "strength"
        ).all()
        
        # 统计各优势维度的提及次数
        for insight in insights:
            dim = insight.dimension or "其他"
            strength_counts[dim] = strength_counts.get(dim, 0) + 1
        
        if not strength_counts:
            return None
        
        # 按提及次数排序
        strength_list = [
            {"dimension": k, "count": v}
            for k, v in sorted(strength_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        return {
            "strengthDistribution": strength_list,
            "totalStrengths": sum(strength_counts.values())
        }
    
    def _analyze_motivation_location(self, reviews: List[Review]) -> Optional[Dict]:
        """分析动机×地点（刚需场景）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        
        motivation_location_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询动机和地点标签
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type.in_(["why", "where"])
        ).all()
        
        # 按评论ID组织数据
        motivations_by_review = {}
        locations_by_review = {}
        
        for th in theme_highlights:
            if th.theme_type == "why":
                if th.review_id not in motivations_by_review:
                    motivations_by_review[th.review_id] = []
                motivations_by_review[th.review_id].append(th.label_name)
            elif th.theme_type == "where":
                if th.review_id not in locations_by_review:
                    locations_by_review[th.review_id] = []
                locations_by_review[th.review_id].append(th.label_name)
        
        # 构建动机×地点矩阵
        for review_id in review_ids:
            motivations = motivations_by_review.get(review_id, [])
            locations = locations_by_review.get(review_id, [])
            
            for motivation in motivations:
                if motivation not in motivation_location_map:
                    motivation_location_map[motivation] = {}
                for location in locations:
                    motivation_location_map[motivation][location] = motivation_location_map[motivation].get(location, 0) + 1
        
        if not motivation_location_map:
            return None
        
        # 收集所有动机和地点
        all_motivations = list(motivation_location_map.keys())
        all_locations = set()
        for locations_dict in motivation_location_map.values():
            all_locations.update(locations_dict.keys())
        all_locations = list(all_locations)
        
        # 构建矩阵数据（与前端格式一致）
        motivation_location_data = []
        for motivation in all_motivations:
            location_scores = {}
            for location in all_locations:
                count = motivation_location_map[motivation].get(location, 0)
                if count > 0:
                    # 计算平均评分
                    rating_sum = 0
                    rating_count = 0
                    for review in reviews:
                        has_motivation = review.id in motivations_by_review and motivation in motivations_by_review.get(review.id, [])
                        has_location = review.id in locations_by_review and location in locations_by_review.get(review.id, [])
                        if has_motivation and has_location and review.rating:
                            rating_sum += review.rating
                            rating_count += 1
                    
                    location_scores[location] = {
                        "count": count,
                        "avgRating": round(rating_sum / rating_count, 2) if rating_count > 0 else 0
                    }
            
            if location_scores:
                motivation_location_data.append({
                    "motivation": motivation,
                    "locationScores": location_scores
                })
        
        return {
            "motivations": all_motivations,
            "locations": all_locations,
            "motivationLocationMap": motivation_location_map,
            "motivationLocationData": motivation_location_data
        }
    
    def _analyze_motivation_emotion(self, reviews: List[Review]) -> Optional[Dict]:
        """分析动机×情感（心智匹配）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        motivation_emotion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询动机标签（theme_highlights）
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "why"
        ).all()
        
        # 查询情感洞察（insights表）
        emotion_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "emotion"
        ).all()
        
        # 按评论ID组织数据
        motivations_by_review = {}
        emotions_by_review = {}
        
        for th in theme_highlights:
            if th.review_id not in motivations_by_review:
                motivations_by_review[th.review_id] = []
            motivations_by_review[th.review_id].append(th.label_name)
        
        for insight in emotion_insights:
            if insight.review_id not in emotions_by_review:
                emotions_by_review[insight.review_id] = []
            if insight.dimension:
                emotions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建动机×情感矩阵
        for review_id in review_ids:
            motivations = motivations_by_review.get(review_id, [])
            emotions = emotions_by_review.get(review_id, [])
            
            for motivation in motivations:
                if motivation not in motivation_emotion_map:
                    motivation_emotion_map[motivation] = {}
                for emotion in emotions:
                    motivation_emotion_map[motivation][emotion] = motivation_emotion_map[motivation].get(emotion, 0) + 1
        
        if not motivation_emotion_map:
            return None
        
        # 收集所有动机和情感
        all_motivations = list(motivation_emotion_map.keys())
        all_emotions = set()
        for emotions_dict in motivation_emotion_map.values():
            all_emotions.update(emotions_dict.keys())
        all_emotions = list(all_emotions)
        
        # 构建前端格式数据
        motivation_emotion = []
        for motivation in all_motivations:
            emotion_counts = {}
            for emotion in all_emotions:
                count = motivation_emotion_map[motivation].get(emotion, 0)
                if count > 0:
                    emotion_counts[emotion] = count
            
            if emotion_counts:
                motivation_emotion.append({
                    "motivation": motivation,
                    "emotions": emotion_counts,
                    "total": sum(emotion_counts.values())
                })
        
        return {
            "motivations": all_motivations,
            "emotions": all_emotions,
            "motivationEmotionMap": motivation_emotion_map,
            "motivationEmotion": motivation_emotion
        }
    
    def _analyze_motivation_weakness_suggestion(self, reviews: List[Review]) -> Optional[Dict]:
        """分析动机×劣势×建议（3D：研发优先级）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        motivation_weakness_suggestion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询动机标签
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "why"
        ).all()
        
        # 查询劣势和建议洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["weakness", "suggestion"])
        ).all()
        
        # 按评论ID组织数据
        motivations_by_review = {}
        weaknesses_by_review = {}
        suggestions_by_review = {}
        
        for th in theme_highlights:
            if th.review_id not in motivations_by_review:
                motivations_by_review[th.review_id] = []
            motivations_by_review[th.review_id].append(th.label_name)
        
        for insight in insights:
            if insight.insight_type == "weakness":
                if insight.review_id not in weaknesses_by_review:
                    weaknesses_by_review[insight.review_id] = []
                if insight.dimension:
                    weaknesses_by_review[insight.review_id].append(insight.dimension)
            elif insight.insight_type == "suggestion":
                if insight.review_id not in suggestions_by_review:
                    suggestions_by_review[insight.review_id] = []
                if insight.dimension:
                    suggestions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建3D矩阵
        for review_id in review_ids:
            motivations = motivations_by_review.get(review_id, [])
            weaknesses = weaknesses_by_review.get(review_id, [])
            suggestions = suggestions_by_review.get(review_id, [])
            
            for motivation in motivations:
                if motivation not in motivation_weakness_suggestion_map:
                    motivation_weakness_suggestion_map[motivation] = {}
                for weakness in weaknesses:
                    if weakness not in motivation_weakness_suggestion_map[motivation]:
                        motivation_weakness_suggestion_map[motivation][weakness] = {}
                    for suggestion in suggestions:
                        motivation_weakness_suggestion_map[motivation][weakness][suggestion] = \
                            motivation_weakness_suggestion_map[motivation][weakness].get(suggestion, 0) + 1
        
        if not motivation_weakness_suggestion_map:
            return None
        
        # 收集所有维度
        all_motivations = list(motivation_weakness_suggestion_map.keys())
        all_weaknesses = set()
        all_suggestions = set()
        
        for weakness_dict in motivation_weakness_suggestion_map.values():
            all_weaknesses.update(weakness_dict.keys())
            for suggestion_dict in weakness_dict.values():
                all_suggestions.update(suggestion_dict.keys())
        
        all_weaknesses = list(all_weaknesses)
        all_suggestions = list(all_suggestions)
        
        # 构建slices格式（与前端一致）
        slices = []
        for motivation in all_motivations:
            motivation_data = motivation_weakness_suggestion_map[motivation]
            
            # 构建2D矩阵（劣势×建议）
            matrix_data = []
            for weakness in all_weaknesses:
                row = []
                weakness_data = motivation_data.get(weakness, {})
                for suggestion in all_suggestions:
                    row.append(weakness_data.get(suggestion, 0))
                matrix_data.append(row)
            
            count = sum(sum(row) for row in matrix_data)
            
            if count > 0:
                slices.append({
                    "layerLabel": motivation,
                    "rows": all_weaknesses,
                    "columns": all_suggestions,
                    "data": matrix_data,
                    "count": count
                })
        
        slices.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "motivations": all_motivations,
            "weaknesses": all_weaknesses,
            "suggestions": all_suggestions,
            "slices": slices
        }
    
    def _analyze_strength_emotion(self, reviews: List[Review]) -> Optional[Dict]:
        """分析优势×情感（品牌溢价）"""
        from app.models.insight import ReviewInsight
        
        strength_emotion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询优势洞察
        strength_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "strength"
        ).all()
        
        # 查询情感洞察
        emotion_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "emotion"
        ).all()
        
        # 按评论ID组织数据
        strengths_by_review = {}
        emotions_by_review = {}
        
        for insight in strength_insights:
            if insight.review_id not in strengths_by_review:
                strengths_by_review[insight.review_id] = []
            if insight.dimension:
                strengths_by_review[insight.review_id].append(insight.dimension)
        
        for insight in emotion_insights:
            if insight.review_id not in emotions_by_review:
                emotions_by_review[insight.review_id] = []
            if insight.dimension:
                emotions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建优势×情感矩阵
        for review_id in review_ids:
            strengths = strengths_by_review.get(review_id, [])
            emotions = emotions_by_review.get(review_id, [])
            
            for strength in strengths:
                if strength not in strength_emotion_map:
                    strength_emotion_map[strength] = {}
                for emotion in emotions:
                    strength_emotion_map[strength][emotion] = strength_emotion_map[strength].get(emotion, 0) + 1
        
        if not strength_emotion_map:
            return None
        
        # 收集所有优势和情感
        all_strengths = list(strength_emotion_map.keys())
        all_emotions = set()
        for emotions_dict in strength_emotion_map.values():
            all_emotions.update(emotions_dict.keys())
        all_emotions = list(all_emotions)
        
        # 构建前端格式数据
        strength_emotion = []
        for strength in all_strengths:
            emotion_counts = {}
            for emotion in all_emotions:
                count = strength_emotion_map[strength].get(emotion, 0)
                if count > 0:
                    emotion_counts[emotion] = count
            
            if emotion_counts:
                strength_emotion.append({
                    "strength": strength,
                    "emotions": emotion_counts,
                    "total": sum(emotion_counts.values())
                })
        
        return {
            "strengths": all_strengths,
            "emotions": all_emotions,
            "strengthEmotionMap": strength_emotion_map,
            "strengthEmotion": strength_emotion
        }
    
    def _analyze_motivation_suggestion(self, reviews: List[Review]) -> Optional[Dict]:
        """分析动机×建议（用户分层优化）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        motivation_suggestion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询动机标签
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "why"
        ).all()
        
        # 查询建议洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "suggestion"
        ).all()
        
        # 按评论ID组织数据
        motivations_by_review = {}
        suggestions_by_review = {}
        
        for th in theme_highlights:
            if th.review_id not in motivations_by_review:
                motivations_by_review[th.review_id] = []
            motivations_by_review[th.review_id].append(th.label_name)
        
        for insight in insights:
            if insight.review_id not in suggestions_by_review:
                suggestions_by_review[insight.review_id] = []
            if insight.dimension:
                suggestions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建动机×建议矩阵
        for review_id in review_ids:
            motivations = motivations_by_review.get(review_id, [])
            suggestions = suggestions_by_review.get(review_id, [])
            
            for motivation in motivations:
                if motivation not in motivation_suggestion_map:
                    motivation_suggestion_map[motivation] = {}
                for suggestion in suggestions:
                    motivation_suggestion_map[motivation][suggestion] = \
                        motivation_suggestion_map[motivation].get(suggestion, 0) + 1
        
        if not motivation_suggestion_map:
            return None
        
        # 收集所有动机和建议
        all_motivations = list(motivation_suggestion_map.keys())
        all_suggestions = set()
        for suggestions_dict in motivation_suggestion_map.values():
            all_suggestions.update(suggestions_dict.keys())
        all_suggestions = list(all_suggestions)
        
        # 构建前端格式数据
        motivation_suggestion = []
        for motivation in all_motivations:
            suggestion_counts = {}
            for suggestion in all_suggestions:
                count = motivation_suggestion_map[motivation].get(suggestion, 0)
                if count > 0:
                    suggestion_counts[suggestion] = count
            
            if suggestion_counts:
                motivation_suggestion.append({
                    "motivation": motivation,
                    "suggestions": suggestion_counts,
                    "total": sum(suggestion_counts.values())
                })
        
        return {
            "motivations": all_motivations,
            "suggestions": all_suggestions,
            "motivationSuggestionMap": motivation_suggestion_map,
            "motivationSuggestion": motivation_suggestion
        }
    
    def _analyze_negative_optimization(self, reviews: List[Review]) -> Optional[Dict]:
        """分析优势×建议冲突（维度冲突分析）"""
        from app.models.insight import ReviewInsight
        
        dimension_data = {}
        review_ids = [r.id for r in reviews]
        
        # 查询所有优势和建议洞察
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["strength", "suggestion"])
        ).all()
        
        # 统计各维度的优势和建议数量
        for insight in insights:
            dim = insight.dimension or "其他"
            if dim not in dimension_data:
                dimension_data[dim] = {"strengthCount": 0, "suggestionCount": 0}
            
            if insight.insight_type == "strength":
                dimension_data[dim]["strengthCount"] += 1
            elif insight.insight_type == "suggestion":
                dimension_data[dim]["suggestionCount"] += 1
        
        if not dimension_data:
            return None
        
        # 计算冲突率
        dimension_analysis = []
        for dim, counts in dimension_data.items():
            strength_count = counts["strengthCount"]
            suggestion_count = counts["suggestionCount"]
            total = strength_count + suggestion_count
            
            if total > 0:
                conflict_rate = round(min(strength_count, suggestion_count) / total * 100, 1)
                dimension_analysis.append({
                    "dimension": dim,
                    "strengthCount": strength_count,
                    "suggestionCount": suggestion_count,
                    "total": total,
                    "conflictRate": conflict_rate
                })
        
        # 按冲突率排序
        dimension_analysis.sort(key=lambda x: x["conflictRate"], reverse=True)
        
        return {
            "dimensions": [d["dimension"] for d in dimension_analysis],
            "dimensionAnalysis": dimension_analysis
        }
    
    def _analyze_life_moment(self, reviews: List[Review]) -> Optional[Dict]:
        """分析地点×时机×场景（3D：真实生活瞬间）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        from app.models.insight import ReviewInsight
        
        location_time_scenario_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询地点和时机标签（theme_highlights）
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type.in_(["where", "when"])
        ).all()
        
        # 查询场景洞察（insights表）
        scenario_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "scenario"
        ).all()
        
        # 按评论ID组织数据
        locations_by_review = {}
        times_by_review = {}
        scenarios_by_review = {}
        
        for th in theme_highlights:
            if th.theme_type == "where":
                if th.review_id not in locations_by_review:
                    locations_by_review[th.review_id] = []
                locations_by_review[th.review_id].append(th.label_name)
            elif th.theme_type == "when":
                if th.review_id not in times_by_review:
                    times_by_review[th.review_id] = []
                times_by_review[th.review_id].append(th.label_name)
        
        for insight in scenario_insights:
            if insight.review_id not in scenarios_by_review:
                scenarios_by_review[insight.review_id] = []
            if insight.dimension:
                scenarios_by_review[insight.review_id].append(insight.dimension)
        
        # 构建3D矩阵
        for review_id in review_ids:
            locations = locations_by_review.get(review_id, [])
            times = times_by_review.get(review_id, [])
            scenarios = scenarios_by_review.get(review_id, [])
            
            for location in locations:
                if location not in location_time_scenario_map:
                    location_time_scenario_map[location] = {}
                for time in times:
                    if time not in location_time_scenario_map[location]:
                        location_time_scenario_map[location][time] = {}
                    for scenario in scenarios:
                        location_time_scenario_map[location][time][scenario] = \
                            location_time_scenario_map[location][time].get(scenario, 0) + 1
        
        if not location_time_scenario_map:
            return None
        
        # 收集所有维度
        all_locations = list(location_time_scenario_map.keys())
        all_times = set()
        all_scenarios = set()
        
        for time_dict in location_time_scenario_map.values():
            all_times.update(time_dict.keys())
            for scenario_dict in time_dict.values():
                all_scenarios.update(scenario_dict.keys())
        
        all_times = list(all_times)
        all_scenarios = list(all_scenarios)
        
        # 构建slices格式（按地点分层）
        slices = []
        for location in all_locations:
            location_data = location_time_scenario_map[location]
            
            # 构建2D矩阵（时机×场景）
            matrix_data = []
            for time in all_times:
                row = []
                time_data = location_data.get(time, {})
                for scenario in all_scenarios:
                    row.append(time_data.get(scenario, 0))
                matrix_data.append(row)
            
            count = sum(sum(row) for row in matrix_data)
            
            if count > 0:
                slices.append({
                    "layerLabel": location,
                    "rows": all_times,
                    "columns": all_scenarios,
                    "data": matrix_data,
                    "count": count
                })
        
        slices.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "locations": all_locations,
            "times": all_times,
            "scenarios": all_scenarios,
            "slices": slices
        }
    
    def _analyze_environment_conflict(self, reviews: List[Review]) -> Optional[Dict]:
        """分析情感×维度×地点（3D：环境冲突）"""
        from app.models.insight import ReviewInsight
        from app.models.theme_highlight import ReviewThemeHighlight
        
        emotion_dimension_location_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询情感洞察（insights表）
        emotion_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type == "emotion"
        ).all()
        
        # 查询优势和劣势洞察（用于维度）
        dimension_insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["strength", "weakness"])
        ).all()
        
        # 查询地点标签（theme_highlights）
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type == "where"
        ).all()
        
        # 按评论ID组织数据
        emotions_by_review = {}
        dimensions_by_review = {}
        locations_by_review = {}
        
        for insight in emotion_insights:
            if insight.review_id not in emotions_by_review:
                emotions_by_review[insight.review_id] = []
            if insight.dimension:
                emotions_by_review[insight.review_id].append(insight.dimension)
        
        for insight in dimension_insights:
            if insight.review_id not in dimensions_by_review:
                dimensions_by_review[insight.review_id] = []
            if insight.dimension:
                dimensions_by_review[insight.review_id].append(insight.dimension)
        
        for th in theme_highlights:
            if th.review_id not in locations_by_review:
                locations_by_review[th.review_id] = []
            locations_by_review[th.review_id].append(th.label_name)
        
        # 构建3D矩阵
        for review_id in review_ids:
            emotions = emotions_by_review.get(review_id, [])
            dimensions = dimensions_by_review.get(review_id, [])
            locations = locations_by_review.get(review_id, [])
            
            for emotion in emotions:
                if emotion not in emotion_dimension_location_map:
                    emotion_dimension_location_map[emotion] = {}
                for dimension in dimensions:
                    if dimension not in emotion_dimension_location_map[emotion]:
                        emotion_dimension_location_map[emotion][dimension] = {}
                    for location in locations:
                        emotion_dimension_location_map[emotion][dimension][location] = \
                            emotion_dimension_location_map[emotion][dimension].get(location, 0) + 1
        
        if not emotion_dimension_location_map:
            return None
        
        # 收集所有维度
        all_emotions = list(emotion_dimension_location_map.keys())
        all_dimensions = set()
        all_locations = set()
        
        for dimension_dict in emotion_dimension_location_map.values():
            all_dimensions.update(dimension_dict.keys())
            for location_dict in dimension_dict.values():
                all_locations.update(location_dict.keys())
        
        all_dimensions = list(all_dimensions)
        all_locations = list(all_locations)
        
        # 构建slices格式（按情感分层）
        slices = []
        for emotion in all_emotions:
            emotion_data = emotion_dimension_location_map[emotion]
            
            # 构建2D矩阵（维度×地点）
            matrix_data = []
            for dimension in all_dimensions:
                row = []
                dimension_data = emotion_data.get(dimension, {})
                for location in all_locations:
                    row.append(dimension_data.get(location, 0))
                matrix_data.append(row)
            
            count = sum(sum(row) for row in matrix_data)
            
            if count > 0:
                slices.append({
                    "layerLabel": emotion,
                    "rows": all_dimensions,
                    "columns": all_locations,
                    "data": matrix_data,
                    "count": count
                })
        
        slices.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "emotions": all_emotions,
            "dimensions": all_dimensions,
            "locations": all_locations,
            "slices": slices
        }
    
    def _analyze_brand_memory(self, reviews: List[Review]) -> Optional[Dict]:
        """分析优势×场景×情感（3D：品牌记忆点）"""
        from app.models.insight import ReviewInsight
        
        strength_scenario_emotion_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询优势、场景、情感洞察（都在insights表）
        insights = self.db.query(ReviewInsight).filter(
            ReviewInsight.review_id.in_(review_ids),
            ReviewInsight.insight_type.in_(["strength", "scenario", "emotion"])
        ).all()
        
        # 按评论ID组织数据
        strengths_by_review = {}
        scenarios_by_review = {}
        emotions_by_review = {}
        
        for insight in insights:
            if insight.insight_type == "strength":
                if insight.review_id not in strengths_by_review:
                    strengths_by_review[insight.review_id] = []
                if insight.dimension:
                    strengths_by_review[insight.review_id].append(insight.dimension)
            elif insight.insight_type == "scenario":
                if insight.review_id not in scenarios_by_review:
                    scenarios_by_review[insight.review_id] = []
                if insight.dimension:
                    scenarios_by_review[insight.review_id].append(insight.dimension)
            elif insight.insight_type == "emotion":
                if insight.review_id not in emotions_by_review:
                    emotions_by_review[insight.review_id] = []
                if insight.dimension:
                    emotions_by_review[insight.review_id].append(insight.dimension)
        
        # 构建3D矩阵
        for review_id in review_ids:
            strengths = strengths_by_review.get(review_id, [])
            scenarios = scenarios_by_review.get(review_id, [])
            emotions = emotions_by_review.get(review_id, [])
            
            for strength in strengths:
                if strength not in strength_scenario_emotion_map:
                    strength_scenario_emotion_map[strength] = {}
                for scenario in scenarios:
                    if scenario not in strength_scenario_emotion_map[strength]:
                        strength_scenario_emotion_map[strength][scenario] = {}
                    for emotion in emotions:
                        strength_scenario_emotion_map[strength][scenario][emotion] = \
                            strength_scenario_emotion_map[strength][scenario].get(emotion, 0) + 1
        
        if not strength_scenario_emotion_map:
            return None
        
        # 收集所有维度
        all_strengths = list(strength_scenario_emotion_map.keys())
        all_scenarios = set()
        all_emotions = set()
        
        for scenario_dict in strength_scenario_emotion_map.values():
            all_scenarios.update(scenario_dict.keys())
            for emotion_dict in scenario_dict.values():
                all_emotions.update(emotion_dict.keys())
        
        all_scenarios = list(all_scenarios)
        all_emotions = list(all_emotions)
        
        # 构建slices格式（按优势分层）
        slices = []
        for strength in all_strengths:
            strength_data = strength_scenario_emotion_map[strength]
            
            # 构建2D矩阵（场景×情感）
            matrix_data = []
            for scenario in all_scenarios:
                row = []
                scenario_data = strength_data.get(scenario, {})
                for emotion in all_emotions:
                    row.append(scenario_data.get(emotion, 0))
                matrix_data.append(row)
            
            count = sum(sum(row) for row in matrix_data)
            
            if count > 0:
                slices.append({
                    "layerLabel": strength,
                    "rows": all_scenarios,
                    "columns": all_emotions,
                    "data": matrix_data,
                    "count": count
                })
        
        slices.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "strengths": all_strengths,
            "scenarios": all_scenarios,
            "emotions": all_emotions,
            "slices": slices
        }
    
    def _analyze_decision_logic_chain(self, reviews: List[Review]) -> Optional[Dict]:
        """分析购买者×使用者×动机（3D：决策逻辑链）"""
        from app.models.theme_highlight import ReviewThemeHighlight
        
        buyer_user_motivation_map = {}
        review_ids = [r.id for r in reviews]
        
        # 查询购买者、使用者、动机标签（都在theme_highlights表）
        theme_highlights = self.db.query(ReviewThemeHighlight).filter(
            ReviewThemeHighlight.review_id.in_(review_ids),
            ReviewThemeHighlight.theme_type.in_(["buyer", "user", "why"])
        ).all()
        
        # 按评论ID组织数据
        buyers_by_review = {}
        users_by_review = {}
        motivations_by_review = {}
        
        for th in theme_highlights:
            if th.theme_type == "buyer":
                if th.review_id not in buyers_by_review:
                    buyers_by_review[th.review_id] = []
                buyers_by_review[th.review_id].append(th.label_name)
            elif th.theme_type == "user":
                if th.review_id not in users_by_review:
                    users_by_review[th.review_id] = []
                users_by_review[th.review_id].append(th.label_name)
            elif th.theme_type == "why":
                if th.review_id not in motivations_by_review:
                    motivations_by_review[th.review_id] = []
                motivations_by_review[th.review_id].append(th.label_name)
        
        # 构建3D矩阵
        for review_id in review_ids:
            buyers = buyers_by_review.get(review_id, [])
            users = users_by_review.get(review_id, [])
            motivations = motivations_by_review.get(review_id, [])
            
            for buyer in buyers:
                if buyer not in buyer_user_motivation_map:
                    buyer_user_motivation_map[buyer] = {}
                for user in users:
                    if user not in buyer_user_motivation_map[buyer]:
                        buyer_user_motivation_map[buyer][user] = {}
                    for motivation in motivations:
                        buyer_user_motivation_map[buyer][user][motivation] = \
                            buyer_user_motivation_map[buyer][user].get(motivation, 0) + 1
        
        if not buyer_user_motivation_map:
            return None
        
        # 收集所有维度
        all_buyers = list(buyer_user_motivation_map.keys())
        all_users = set()
        all_motivations = set()
        
        for user_dict in buyer_user_motivation_map.values():
            all_users.update(user_dict.keys())
            for motivation_dict in user_dict.values():
                all_motivations.update(motivation_dict.keys())
        
        all_users = list(all_users)
        all_motivations = list(all_motivations)
        
        # 构建slices格式（按购买者分层）
        slices = []
        for buyer in all_buyers:
            buyer_data = buyer_user_motivation_map[buyer]
            
            # 构建2D矩阵（使用者×动机）
            matrix_data = []
            for user in all_users:
                row = []
                user_data = buyer_data.get(user, {})
                for motivation in all_motivations:
                    row.append(user_data.get(motivation, 0))
                matrix_data.append(row)
            
            count = sum(sum(row) for row in matrix_data)
            
            if count > 0:
                slices.append({
                    "layerLabel": buyer,
                    "rows": all_users,
                    "columns": all_motivations,
                    "data": matrix_data,
                    "count": count
                })
        
        slices.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "buyers": all_buyers,
            "users": all_users,
            "motivations": all_motivations,
            "slices": slices
        }
    
    def _analyze_recommendation_willingness(self, reviews: List[Review]) -> Optional[Dict]:
        """分析推荐意愿"""
        rating_distribution = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        high_engagement = []  # 高参与度评论 (helpful_votes > 0)
        total_helpful_votes = 0
        
        for review in reviews:
            rating = review.rating or 3
            if rating in rating_distribution:
                rating_distribution[rating] += 1
            
            helpful_votes = review.helpful_votes or 0
            total_helpful_votes += helpful_votes
            
            if helpful_votes > 0:
                high_engagement.append({
                    "rating": rating,
                    "helpful_votes": helpful_votes,
                    "sentiment": review.sentiment or "neutral"
                })
        
        if not reviews:
            return None
        
        # 计算平均评分
        total_reviews = len(reviews)
        avg_rating = sum(k * v for k, v in rating_distribution.items()) / total_reviews if total_reviews > 0 else 0
        
        # 计算推荐率 (4-5星)
        recommendation_rate = (rating_distribution[5] + rating_distribution[4]) / total_reviews * 100 if total_reviews > 0 else 0
        
        return {
            "ratingDistribution": rating_distribution,
            "avgRating": round(avg_rating, 2),
            "recommendationRate": round(recommendation_rate, 1),
            "totalReviews": total_reviews,
            "highEngagement": sorted(high_engagement, key=lambda x: x["helpful_votes"], reverse=True)[:10],
            "totalHelpfulVotes": total_helpful_votes
        }
    
    def _generate_ai_interpretation(
        self, 
        sub_type: str, 
        data: Dict, 
        total_reviews: int = 0
    ) -> Dict[str, Any]:
        """使用标准化的AI prompt生成洞察解读"""
        try:
            # 使用标准化的prompt模板
            prompt = generate_pivot_insight_prompt(
                sub_type=sub_type,
                data=data,
                total_reviews=total_reviews
            )
            
            # 调用 OpenAI API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system", 
                        "content": "你是一个专业的产品分析专家，擅长从用户评论的交叉分析中提炼商业洞察。请用简洁、专业的语言输出分析结果，必须返回有效的JSON格式。"
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1500  # 增加token限制以支持更详细的输出
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 尝试提取JSON（可能包含markdown代码块）
            import re
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', result_text, re.DOTALL)
            if json_match:
                result_text = json_match.group(1)
            else:
                # 尝试直接查找JSON对象
                json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
                if json_match:
                    result_text = json_match.group(0)
            
            # 解析AI响应
            try:
                interpretation = json.loads(result_text)
                
                # 验证必需字段
                if "keyFindings" not in interpretation:
                    interpretation["keyFindings"] = []
                if "recommendations" not in interpretation:
                    interpretation["recommendations"] = []
                if "severity" not in interpretation:
                    interpretation["severity"] = "info"
                if "dataSupport" not in interpretation:
                    interpretation["dataSupport"] = f"基于{total_reviews}条评论分析"
                
                # 确保severity值有效
                valid_severities = ["info", "success", "warning", "error", "critical", "normal"]
                if interpretation["severity"] not in valid_severities:
                    interpretation["severity"] = "info"
                
                return interpretation
            except json.JSONDecodeError as e:
                # 如果AI返回的不是标准JSON，使用默认结构
                logger.warning(f"AI返回的不是标准JSON (sub_type={sub_type}): {result_text[:200]}, error: {str(e)}")
                return {
                    "keyFindings": [result_text[:200]] if result_text else [f"{sub_type}数据已收集，待AI分析"],
                    "dataSupport": f"基于{total_reviews}条评论分析",
                    "recommendations": ["根据数据优化产品和营销策略"],
                    "severity": "info"
                }
                
        except Exception as e:
            logger.error(f"AI解读生成失败 (sub_type={sub_type}): {str(e)}", exc_info=True)
            return {
                "keyFindings": [f"{sub_type}数据已收集，AI分析失败"],
                "dataSupport": f"基于{total_reviews}条评论分析",
                "recommendations": ["建议查看原始数据"],
                "severity": "info"
            }
    
    def _save_insight(
        self,
        product_id: UUID,
        insight_type: str,
        sub_type: str,
        insight_data: Dict,
        raw_data: Dict,
        confidence: Optional[float] = None
    ) -> Optional[ProductPivotInsight]:
        """保存洞察到数据库"""
        try:
            # 查找或创建
            insight = self.db.query(ProductPivotInsight).filter(
                and_(
                    ProductPivotInsight.product_id == product_id,
                    ProductPivotInsight.insight_type == insight_type,
                    ProductPivotInsight.sub_type == sub_type
                )
            ).first()
            
            if insight:
                # 更新现有记录
                insight.insight_data = insight_data
                insight.raw_data = raw_data
                insight.confidence = confidence
                insight.generation_status = 'completed'
            else:
                # 创建新记录
                insight = ProductPivotInsight(
                    product_id=product_id,
                    insight_type=insight_type,
                    sub_type=sub_type,
                    insight_data=insight_data,
                    raw_data=raw_data,
                    confidence=confidence,
                    generation_status='completed'
                )
                self.db.add(insight)
            
            self.db.commit()
            self.db.refresh(insight)
            return insight
            
        except Exception as e:
            logger.error(f"保存洞察失败: {str(e)}")
            self.db.rollback()
            return None
    
    def _migrate_dimension_summaries(self, product: Product):
        """从dimension_summaries迁移数据到pivot_insights"""
        try:
            if not hasattr(product, 'dimension_summaries'):
                return
            
            for summary in product.dimension_summaries:
                self._save_insight(
                    product_id=product.id,
                    insight_type="dimension_summary",
                    sub_type=summary.summary_type,
                    insight_data={
                        "summary": summary.summary,
                        "keyPoints": summary.key_points
                    },
                    raw_data={},
                    confidence=float(summary.confidence) if summary.confidence else None
                )
                
        except Exception as e:
            logger.error(f"迁移dimension_summaries失败: {str(e)}")
    
    def get_insights(self, product_id: UUID) -> List[Dict]:
        """获取产品的所有洞察"""
        insights = self.db.query(ProductPivotInsight).filter(
            ProductPivotInsight.product_id == product_id
        ).all()
        
        return [insight.to_dict() for insight in insights]
    
    def get_insight_by_type(
        self,
        product_id: UUID,
        insight_type: str,
        sub_type: Optional[str] = None
    ) -> Optional[Dict]:
        """获取指定类型的洞察"""
        query = self.db.query(ProductPivotInsight).filter(
            and_(
                ProductPivotInsight.product_id == product_id,
                ProductPivotInsight.insight_type == insight_type
            )
        )
        
        if sub_type:
            query = query.filter(ProductPivotInsight.sub_type == sub_type)
        
        insight = query.first()
        return insight.to_dict() if insight else None
