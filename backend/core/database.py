import sqlite3
import os
import json
from loguru import logger
from contextlib import contextmanager
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "insightai.db")


def init_db():
    logger.info(f"Initializing SQLite persistent database at {DB_PATH}")
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Sessions metadata table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            filename TEXT,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Queries and history table (with follow-ups persistence)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS queries (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            role TEXT,
            content TEXT,
            follow_ups TEXT,
            is_saved BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
        """)

        # Lazy Migration: check if follow_ups exists in existing databases
        cursor.execute("PRAGMA table_info(queries)")
        columns = [row[1] for row in cursor.fetchall()]
        if "follow_ups" not in columns:
            logger.info(
                "Migrating database: Adding 'follow_ups' column to queries table."
            )
            cursor.execute("ALTER TABLE queries ADD COLUMN follow_ups TEXT")

        # Session settings table (for cleaning mode, reports, etc.)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS session_settings (
            session_id TEXT,
            key TEXT,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, key),
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
        """)

        conn.commit()


def cleanup_old_sessions(max_sessions: int = 10):
    """Keep only the most recent sessions, delete older ones."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Get all sessions ordered by creation time (newest first)
        cursor.execute("SELECT id FROM sessions ORDER BY created_at DESC")
        all_sessions = [row[0] for row in cursor.fetchall()]

        if len(all_sessions) > max_sessions:
            # Sessions to delete
            sessions_to_delete = all_sessions[max_sessions:]

            for session_id in sessions_to_delete:
                _perform_session_cleanup(cursor, session_id)

            conn.commit()
            logger.info(f"Cleaned up {len(sessions_to_delete)} old sessions")


def _perform_session_cleanup(cursor, session_id: str):
    """Internal helper to delete all data related to a session."""
    logger.info(f"Cleaning up session data: {session_id}")

    # 1. Delete associated data table
    try:
        cursor.execute(f'DROP TABLE IF EXISTS "df_{session_id}"')
    except Exception as e:
        logger.warning(f"Failed to drop table df_{session_id}: {e}")

    # 2. Delete queries
    cursor.execute("DELETE FROM queries WHERE session_id = ?", (session_id,))

    # 3. Delete session settings
    cursor.execute("DELETE FROM session_settings WHERE session_id = ?", (session_id,))

    # 4. Delete session itself
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def delete_session(session_id: str) -> bool:
    """Delete a specific session and all its data."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Check if session exists
            cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
            if not cursor.fetchone():
                return False

            _perform_session_cleanup(cursor, session_id)
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Failed to delete session {session_id}: {e}")
        return False


def bulk_delete_sessions(session_ids: list[str]) -> dict:
    """Delete multiple sessions in a single transaction (all or nothing)."""
    results = {"deleted": [], "failed": [], "not_found": []}
    if not session_ids:
        return results

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Start transaction - validate all sessions exist first
            for session_id in session_ids:
                cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
                if not cursor.fetchone():
                    results["not_found"].append(session_id)

            # Get sessions to delete (exclude not found)
            to_delete = [sid for sid in session_ids if sid not in results["not_found"]]

            if not to_delete:
                return results

            # Delete all in single transaction
            for session_id in to_delete:
                try:
                    _perform_session_cleanup(cursor, session_id)
                    results["deleted"].append(session_id)
                except Exception as e:
                    logger.error(f"Failed to cleanup session {session_id}: {e}")
                    results["failed"].append(session_id)

            # Only commit if no failures
            if not results["failed"]:
                conn.commit()
                logger.info(
                    f"Bulk delete completed successfully. Deleted: {results['deleted']}"
                )
            else:
                conn.rollback()
                logger.error(
                    f"Bulk delete rolled back due to failures: {results['failed']}"
                )

            return results
    except Exception as e:
        logger.error(f"Bulk delete transaction failed: {e}")
        return results


def rename_session(session_id: str, new_name: str) -> bool:
    """Update the filename/display name of a session."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE sessions SET filename = ? WHERE id = ?", (new_name, session_id)
            )
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error(f"Failed to rename session {session_id}: {e}")
        return False


def clear_session_history(session_id: str) -> bool:
    """Delete all chat queries for a session but keep the data and settings."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM queries WHERE session_id = ?", (session_id,))
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Failed to clear history for session {session_id}: {e}")
        return False


def duplicate_session(session_id: str, new_id: str) -> bool:
    """Clone a session including metadata, settings, and data table."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 1. Get original session info
            cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            session_row = cursor.fetchone()
            if not session_row:
                return False

            # 2. Insert new session (with (Copy) suffix if needed, but usually handled by caller)
            cursor.execute(
                "INSERT INTO sessions (id, filename, metadata, created_at) VALUES (?, ?, ?, ?)",
                (
                    new_id,
                    f"{session_row['filename']} (Copy)",
                    session_row["metadata"],
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )

            # 3. Clone settings
            cursor.execute(
                "INSERT INTO session_settings (session_id, key, value) SELECT ?, key, value FROM session_settings WHERE session_id = ?",
                (new_id, session_id),
            )

            # 4. Clone data table (Pandas is easiest here or direct SQL)
            # Using direct SQL for speed
            cursor.execute(
                f'CREATE TABLE "df_{new_id}" AS SELECT * FROM "df_{session_id}"'
            )

            conn.commit()
            logger.info(f"Successfully duplicated session {session_id} to {new_id}")
            return True
    except Exception as e:
        logger.error(f"Failed to duplicate session {session_id}: {e}")
        return False


@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# Initialize upon import
init_db()
