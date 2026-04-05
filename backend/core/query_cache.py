from typing import Dict, Any, Optional, Tuple
import pandas as pd
import hashlib
import json
from loguru import logger
from datetime import datetime, timedelta


class QueryCache:
    """
    In-memory cache for query results to avoid re-processing.
    Uses LRU eviction with time-based expiration.
    """

    def __init__(self, max_size: int = 50, ttl_minutes: int = 30):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._max_size = max_size
        self._ttl = timedelta(minutes=ttl_minutes)
        self._hits = 0
        self._misses = 0

    def _make_key(
        self, session_id: str, question: str, intent_data: Dict[str, Any]
    ) -> str:
        """Generate a cache key from session, question, and intent."""
        key_data = f"{session_id}:{question.lower().strip()}:{json.dumps(intent_data, sort_keys=True)}"
        return hashlib.sha256(key_data.encode()).hexdigest()[:32]

    def get(
        self, session_id: str, question: str, intent_data: Dict[str, Any]
    ) -> Optional[Tuple[pd.DataFrame, str]]:
        """Get cached result if available and not expired."""
        key = self._make_key(session_id, question, intent_data)

        if key in self._cache:
            entry = self._cache[key]
            cached_time = entry.get("timestamp")

            # Check expiration
            if cached_time and datetime.now() - cached_time < self._ttl:
                self._hits += 1
                logger.info(f"Cache HIT for query: {question[:30]}...")
                return entry["result_df"], entry["status_msg"]
            else:
                # Expired - remove
                del self._cache[key]

        self._misses += 1
        return None

    def set(
        self,
        session_id: str,
        question: str,
        intent_data: Dict[str, Any],
        result_df: pd.DataFrame,
        status_msg: str,
    ):
        """Store result in cache with LRU eviction."""
        key = self._make_key(session_id, question, intent_data)

        # LRU eviction - remove oldest if full
        if len(self._cache) >= self._max_size:
            oldest_key = min(
                self._cache.keys(),
                key=lambda k: self._cache[k].get("timestamp", datetime.min),
            )
            del self._cache[oldest_key]
            logger.info(f"Cache eviction: removed oldest entry")

        self._cache[key] = {
            "result_df": result_df,
            "status_msg": status_msg,
            "timestamp": datetime.now(),
            "question": question[:50],
        }
        logger.info(f"Cache SET for query: {question[:30]}...")

    def clear_session(self, session_id: str):
        """Clear all cached entries for a session."""
        keys_to_remove = [
            k
            for k, v in self._cache.items()
            if session_id in str(v.get("question", ""))
        ]
        for key in keys_to_remove:
            del self._cache[key]

    def clear(self):
        """Clear entire cache."""
        self._cache.clear()
        logger.info("Cache cleared")

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.1f}%",
        }


# Global cache instance
query_cache = QueryCache(max_size=50, ttl_minutes=30)
