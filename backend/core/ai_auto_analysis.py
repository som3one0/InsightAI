import asyncio
import time
from typing import Dict, List, Any, Optional, Callable
from loguru import logger
import json


class AdaptiveLearner:
    """Adaptive learning component for AI analysis."""

    def __init__(self):
        self.user_patterns: Dict[str, Dict[str, Any]] = {}
        self.effectiveness_scores: Dict[str, float] = {}

    def learn_from_interaction(
        self, query: str, success: bool, context: Dict[str, Any]
    ):
        """Update patterns based on successful queries."""
        pattern = query.lower().split()[0] if query.split() else "unknown"
        if pattern not in self.user_patterns:
            self.user_patterns[pattern] = {
                "success_count": 0,
                "total_count": 0,
                "contexts": [],
            }

        self.user_patterns[pattern]["total_count"] += 1
        if success:
            self.user_patterns[pattern]["success_count"] += 1
        self.user_patterns[pattern]["contexts"].append(context)

    def suggest_improvements(self, session_context: Dict[str, Any]) -> List[str]:
        """Provide adaptive suggestions based on learning."""
        suggestions = []
        top_patterns = sorted(
            self.user_patterns.items(),
            key=lambda x: x[1]["success_count"] / max(x[1]["total_count"], 1),
            reverse=True,
        )[:3]

        for pattern, data in top_patterns:
            if data["success_count"] > data["total_count"] * 0.7:
                suggestions.append(f"Try asking about '{pattern}' - high success rate")

        return suggestions


class ContextAwareProcessor:
    """Real-time context awareness for adaptive processing."""

    def __init__(self):
        self.session_metrics: Dict[str, List[Dict[str, Any]]] = {}

    def update_metrics(self, session_id: str, operation: str, duration: float):
        """Track performance patterns."""
        if session_id not in self.session_metrics:
            self.session_metrics[session_id] = []
        self.session_metrics[session_id].append(
            {"operation": operation, "duration": duration, "timestamp": time.time()}
        )

    def optimize_processing(
        self, session_id: str, operation_type: str
    ) -> Dict[str, Any]:
        """Adaptive processing based on history."""
        if session_id not in self.session_metrics:
            return {"optimization": "default"}

        recent_ops = [
            m
            for m in self.session_metrics[session_id][-10:]
            if m["operation"] == operation_type
        ]

        if recent_ops:
            avg_duration = sum(m["duration"] for m in recent_ops) / len(recent_ops)
            if avg_duration > 5.0:  # Slow operations
                return {"optimization": "simplified", "reason": "slow_history"}
            elif avg_duration < 0.5:  # Fast operations
                return {"optimization": "detailed", "reason": "fast_history"}

        return {"optimization": "balanced"}


class AIAutoAnalyzer:
    """
    AI Auto-Analysis Module that surrounds existing logic.
    Provides intelligent pre-processing, contextual analysis, and adaptive insights.
    """

    def __init__(self):
        self._query_patterns: Dict[str, int] = {}
        self._session_contexts: Dict[str, Dict[str, Any]] = {}
        self._analysis_cache: Dict[str, Any] = {}
        self._performance_metrics: List[Dict[str, Any]] = []
        self.adaptive_learner = AdaptiveLearner()
        self.context_processor = ContextAwareProcessor()

    def analyze_context(
        self,
        session_id: str,
        query: str,
        profile: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Pre-analysis of query to provide context-aware processing.
        Returns contextual metadata that guides the main processing pipeline.
        """
        start_time = time.time()

        context = {
            "session_id": session_id,
            "query": query,
            "complexity": "simple",
            "requires_comparison": False,
            "requires_trend": False,
            "requires_grouping": False,
            "confidence_score": 0.0,
            "suggested_approach": "direct",
            "context_from_history": [],
            "data_requirements": {},
            "estimated_result_size": "medium",
        }

        query_lower = query.lower()

        # Analyze complexity
        words = len(query.split())
        if words > 15:
            context["complexity"] = "complex"
        elif words > 8:
            context["complexity"] = "medium"

        # Detect required operations
        comparison_words = [
            "compare",
            "versus",
            "vs",
            "difference",
            "better",
            "worse",
            "higher",
            "lower",
        ]
        context["requires_comparison"] = any(
            word in query_lower for word in comparison_words
        )

        trend_words = [
            "trend",
            "over time",
            "growth",
            "decline",
            "change",
            "progression",
            "pattern",
        ]
        context["requires_trend"] = any(word in query_lower for word in trend_words)

        group_words = [
            "by",
            "per",
            "each",
            "group",
            "category",
            "average by",
            "total by",
        ]
        context["requires_grouping"] = any(word in query_lower for word in group_words)

        # Extract context from history
        if history:
            recent_queries = [h.get("q", "") for h in history[-3:]]
            context["context_from_history"] = recent_queries

            # Detect if user is exploring (multiple similar queries)
            if len(recent_queries) >= 2:
                if recent_queries[-1].split()[0] == recent_queries[-2].split()[0]:
                    context["suggested_approach"] = "exploration"

        # Determine data requirements
        numeric_cols = profile.get("numeric_cols", [])
        categorical_cols = profile.get("categorical_cols", [])

        if context["requires_grouping"] and not categorical_cols:
            context["data_requirements"]["needs_categorical"] = True
            context["confidence_score"] = 0.5
        elif context["requires_trend"] and not profile.get("datetime_cols"):
            context["data_requirements"]["needs_datetime"] = True
            context["confidence_score"] = 0.6
        else:
            context["confidence_score"] = 0.9

        # Estimate result size
        if "top" in query_lower or "bottom" in query_lower:
            import re

            match = re.search(r"\b(\d+)\b", query)
            num = int(match.group(1)) if match else 10
            context["estimated_result_size"] = "small" if num <= 5 else "medium"
        elif context["requires_grouping"]:
            context["estimated_result_size"] = "medium"

        # Track query pattern
        pattern_key = query_lower.split()[0] if query_lower.split() else "unknown"
        self._query_patterns[pattern_key] = self._query_patterns.get(pattern_key, 0) + 1

        # Store session context
        if session_id not in self._session_contexts:
            self._session_contexts[session_id] = {
                "query_count": 0,
                "topics": set(),
                "last_activity": time.time(),
            }

        self._session_contexts[session_id]["query_count"] += 1
        self._session_contexts[session_id]["last_activity"] = time.time()

        # Add to topics if complex
        if context["complexity"] == "complex":
            self._session_contexts[session_id]["topics"].add(pattern_key)

        # Track performance
        elapsed = time.time() - start_time
        self._performance_metrics.append(
            {
                "operation": "analyze_context",
                "elapsed_ms": elapsed * 1000,
                "timestamp": time.time(),
            }
        )

        logger.debug(f"AI Context analysis completed in {elapsed * 1000:.2f}ms")
        return context

    def post_process_insights(
        self,
        result_data: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Post-process results to add AI-enhanced insights and recommendations.
        """
        enhanced = {
            **result_data,
            "ai_enhanced": True,
            "insights_added": [],
            "recommendations": [],
            "related_queries": [],
        }

        # Add AI-generated insights based on data patterns
        if result_data.get("result_table"):
            table_data = result_data.get("result_table", [])

            # Detect data patterns
            if len(table_data) > 1:
                # Check for monotonic trends
                try:
                    values = [
                        row.get("value", row.get(list(row.values())[1], 0))
                        for row in table_data
                        if row
                    ]
                    if len(values) >= 3:
                        if all(
                            values[i] <= values[i + 1] for i in range(len(values) - 1)
                        ):
                            enhanced["insights_added"].append(
                                {
                                    "type": "trend_detected",
                                    "message": "Data shows consistent increasing pattern",
                                }
                            )
                        elif all(
                            values[i] >= values[i + 1] for i in range(len(values) - 1)
                        ):
                            enhanced["insights_added"].append(
                                {
                                    "type": "trend_detected",
                                    "message": "Data shows consistent decreasing pattern",
                                }
                            )
                except:
                    pass

            # Check for outliers
            try:
                numeric_values = [
                    float(v)
                    for row in table_data
                    for v in row.values()
                    if isinstance(v, (int, float))
                    or (
                        isinstance(v, str)
                        and v.replace(".", "").replace("-", "").isdigit()
                    )
                ]
                if len(numeric_values) > 3:
                    mean_val = sum(numeric_values) / len(numeric_values)
                    outlier_count = sum(
                        1
                        for v in numeric_values
                        if abs(v - mean_val)
                        > 2 * (max(numeric_values) - min(numeric_values))
                    )
                    if outlier_count > 0:
                        enhanced["insights_added"].append(
                            {
                                "type": "outlier_present",
                                "message": f"Detected {outlier_count} potential outliers in results",
                            }
                        )
            except:
                pass

        # Add recommendations based on context
        if context.get("requires_grouping") and not context.get("requires_trend"):
            enhanced["recommendations"].append(
                {
                    "type": "visualization",
                    "suggestion": "Consider viewing as bar chart for categorical comparison",
                }
            )

        if context.get("complexity") == "complex":
            enhanced["recommendations"].append(
                {
                    "type": "follow_up",
                    "suggestion": "Break down into smaller queries for deeper analysis",
                }
            )

        # Generate related queries
        session_id = context.get("session_id")
        if session_id and session_id in self._session_contexts:
            topics = list(self._session_contexts[session_id]["topics"])[:3]
            if topics:
                enhanced["related_queries"] = [
                    f"Analyze {topic} in more detail" for topic in topics
                ]

        return enhanced

    def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get summary of AI analysis for a session."""
        if session_id not in self._session_contexts:
            return {"status": "no_data"}

        context = self._session_contexts[session_id]
        return {
            "query_count": context["query_count"],
            "topics_explored": list(context["topics"]),
            "total_patterns_tracked": len(self._query_patterns),
            "top_patterns": sorted(
                self._query_patterns.items(), key=lambda x: x[1], reverse=True
            )[:5],
        }

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get AI analysis performance metrics."""
        if not self._performance_metrics:
            return {"status": "no_data"}

        recent = self._performance_metrics[-100:]
        avg_time = sum(m["elapsed_ms"] for m in recent) / len(recent)

        return {
            "total_analyses": len(self._performance_metrics),
            "average_time_ms": round(avg_time, 2),
            "recent_operations": len(recent),
        }

    def generate_proactive_suggestions(
        self, context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate context-aware proactive suggestions."""
        suggestions = []

        session_id = context.get("session_id")
        if session_id and session_id in self._session_contexts:
            session_data = self._session_contexts[session_id]
            query_count = session_data.get("query_count", 0)

            # Early session suggestions
            if query_count < 3:
                suggestions.extend(
                    [
                        {
                            "type": "exploration",
                            "title": "Explore Dataset Overview",
                            "description": "Get a summary of your data structure and key statistics",
                            "query": "Summarize the dataset",
                        },
                        {
                            "type": "visualization",
                            "title": "View Data Sample",
                            "description": "See the first few rows to understand your data",
                            "query": "Show me the top 10 rows",
                        },
                    ]
                )

            # Advanced suggestions based on patterns
            topics = list(session_data.get("topics", set()))
            if topics:
                suggestions.append(
                    {
                        "type": "deep_analysis",
                        "title": "Deep Dive Analysis",
                        "description": f"Explore {topics[0]} in more detail",
                        "query": f"Analyze {topics[0]} patterns",
                    }
                )

        # Adaptive suggestions from learning
        adaptive_sugs = self.adaptive_learner.suggest_improvements(context)
        for sug in adaptive_sugs:
            suggestions.append(
                {
                    "type": "adaptive",
                    "title": "Recommended Query",
                    "description": sug,
                    "query": sug.split("'")[1] if "'" in sug else sug,
                }
            )

        return suggestions[:5]  # Limit to 5 suggestions

    def clear_session_data(self, session_id: str):
        """Clear cached data for a session."""
        if session_id in self._session_contexts:
            del self._session_contexts[session_id]
        logger.info(f"Cleared AI analysis data for session {session_id[:8]}...")


# Global AI analyzer instance
ai_auto_analyzer = AIAutoAnalyzer()


def get_ai_analyzer() -> AIAutoAnalyzer:
    """Get the global AI analyzer instance."""
    return ai_auto_analyzer
