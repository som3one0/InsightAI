from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Response
from fastapi.responses import JSONResponse
from loguru import logger
import pandas as pd
import io
import uuid
import os
import json
import numpy as np
import math
import time
import re
import zipfile
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from core.config import settings
from core.schemas import (
    UploadResponse,
    FileUploadMetadata,
    LLMResponse,
    HealthResponse,
    AskRequest,
    CompareRequest,
    BulkDeleteRequest,
    RenameSessionRequest,
)
from core.llm_processor import (
    check_safety,
    auto_insights_with_kimi,
    generate_explanation,
    detect_reasoning_mode,
)
from core.query_engine import (
    detect_intent,
    process_query,
    dataset_profile,
    run_advanced_auto_insights,
    extract_chart_data,
    generate_column_stats,
    compare_query,
    generate_starter_questions,
    generate_chart_config,
    generate_multiple_charts,
)
from core.query_cache import query_cache
from core.response_formatter import (
    format_structured_response,
    validate_query_result,
)
from core.insight_engine import generate_auto_insights
from core.data_cleaner import (
    clean_data,
    get_cleaning_report as get_cleaning_report_data,
    ProcessedData,
)
from core.data_science_engine import generate_data_scientist_insights
from core.database import (
    get_db_connection,
    cleanup_old_sessions,
    delete_session,
    bulk_delete_sessions,
    rename_session,
    duplicate_session,
    clear_session_history,
)
from core.ai_auto_analysis import get_ai_analyzer
import time

router = APIRouter()


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...), cleaning_mode: str = Form("balanced")
):
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        logger.warning(f"Rejected invalid file format: {file.filename}")
        raise HTTPException(status_code=400, detail="Invalid file format.")

    # Validate cleaning mode
    if cleaning_mode not in ["conservative", "balanced", "aggressive"]:
        cleaning_mode = "balanced"

    # Check file size (50MB limit)
    file_size = 0
    if hasattr(file, "size") and file.size is not None:
        file_size = file.size
        if file_size > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=400, detail="File too large. Maximum size is 50MB."
            )
    # Note: If no size attribute, we'll check after reading (fallback for old clients)

    session_id = str(uuid.uuid4())

    try:
        logger.info(
            f"Processing upload: {file.filename} ({file_size / 1024 / 1024:.1f}MB) -> Session: {session_id}"
        )

        contents = await file.read()

        # Fallback size check if not checked earlier
        if not hasattr(file, "size"):
            file_size = len(contents)
            if file_size > 50 * 1024 * 1024:
                raise HTTPException(
                    status_code=400, detail="File too large. Maximum size is 50MB."
                )

        # Handle large CSV files with chunked reading
        if file.filename.endswith(".csv"):
            if file_size > 10 * 1024 * 1024:  # > 10MB
                logger.info("Large CSV detected, using chunked reading")
                # For very large files, read in chunks and sample
                temp_df = pd.read_csv(
                    io.BytesIO(contents), nrows=10000
                )  # Sample first 10k rows
                df = temp_df
                logger.warning(
                    f"Large file truncated to {len(df)} rows for performance"
                )
            else:
                df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        # Limit dataframe size for performance
        MAX_ROWS = 100000
        if len(df) > MAX_ROWS:
            logger.warning(
                f"Dataset too large ({len(df)} rows), truncating to {MAX_ROWS} rows"
            )
            df = df.head(MAX_ROWS)

        # === SELF-CLEANING DATA ENGINE ===
        logger.info(f"Starting data cleaning (mode: {cleaning_mode})...")
        processed_data = clean_data(df, mode=cleaning_mode)
        df = processed_data.df  # Use cleaned data

        # Get cleaning report for UI
        cleaning_report = get_cleaning_report_data(processed_data)

        # Profiling on CLEANED data
        profile = dataset_profile(df)

        # 5. Generate per-column stats for Data Explorer on CLEANED data
        column_stats = generate_column_stats(df)

        # Add column_stats to profile for storage
        profile_with_stats = {**profile, "column_stats": column_stats}

        # Write CLEANED data to SQLite
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sessions (id, filename, metadata) VALUES (?, ?, ?)",
                (
                    session_id,
                    file.filename,
                    json.dumps(profile_with_stats, cls=NumpyEncoder),
                ),
            )
            df.to_sql(f"df_{session_id}", con=conn, if_exists="replace", index=False)

            # Also store cleaning report
            cursor.execute(
                "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)",
                (
                    session_id,
                    "cleaning_report",
                    json.dumps(cleaning_report, cls=NumpyEncoder),
                ),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)",
                (session_id, "cleaning_mode", cleaning_mode),
            )
            conn.commit()

        # 4. Advanced Insights (Anomalies, Dominance, etc.) on CLEANED data
        insights_data = run_advanced_auto_insights(df)

        # 5. Generate per-column stats for Data Explorer on CLEANED data
        column_stats = generate_column_stats(df)

        # 6. Natural Language Auto Summary using LLM on CLEANED data
        head_csv = df.head(10).to_csv(index=False)
        auto_summary = await auto_insights_with_kimi(head_csv, profile["summary"])

        # Clean up old sessions (keep only 5 most recent)
        cleanup_old_sessions(5)

        return UploadResponse(
            message="Data cleaned, transformed, and analyzed successfully",
            session_id=session_id,
            metadata=FileUploadMetadata(
                columns=profile["columns"],
                total_rows=profile["total_rows"],
                column_stats=column_stats,
                numeric_cols=profile.get("numeric_cols", []),
                categorical_cols=profile.get("categorical_cols", []),
                datetime_cols=profile.get("datetime_cols", []),
            ),
            insights=auto_summary,
        )

    except Exception as e:
        logger.exception(f"Upload processing failed for {file.filename}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


@router.get("/insights/{session_id}")
async def get_insights(session_id: str):
    """Deep Data Scientist analysis for the Insights Panel using CLEANED data."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")

            profile = json.loads(row["metadata"])
            df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)

            # Get cleaning report
            cursor.execute(
                "SELECT value FROM session_settings WHERE session_id = ? AND key = ?",
                (session_id, "cleaning_report"),
            )
            cleaning_row = cursor.fetchone()
            cleaning_report = (
                json.loads(cleaning_row["value"]) if cleaning_row else None
            )

        # Generate insights using CLEANED data
        insights_list = generate_data_scientist_insights(df, profile)

        return {
            "status": "success",
            "insights": insights_list,
            "data_quality": cleaning_report,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Insight generation failed: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to calculate deep insights."
        )


@router.post("/ask", response_model=LLMResponse)
async def ask_question(request: AskRequest):
    start_time = time.time()

    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question required")

    # Validate session_id format
    try:
        uuid.UUID(request.session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id format")

    # Load session data
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT metadata FROM sessions WHERE id = ?", (request.session_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invalid session_id")

        profile = json.loads(row["metadata"])

        # Load CLEANED dataset from database
        df = pd.read_sql(f'SELECT * FROM "df_{request.session_id}"', con=conn)

        # Ensure numeric columns are properly typed (fix for NaN issues in NL chat)
        for col in df.columns:
            if df[col].dtype == object:
                # Try converting to numeric
                numeric_converted = pd.to_numeric(
                    df[col].str.replace(",", "").str.replace("%", ""), errors="coerce"
                )
                # Only convert if more than 50% successfully convert
                if numeric_converted.notna().sum() > len(df) * 0.5:
                    df[col] = numeric_converted
            else:
                # For non-object columns, still try to ensure they're proper numeric types
                # especially important for data loaded from SQLite
                if pd.api.types.is_numeric_dtype(df[col]):
                    # Convert to numeric to handle any string values that slipped through
                    df[col] = pd.to_numeric(df[col], errors="coerce")

        # Load historical context (Last 5 turns for memory)
        cursor.execute(
            "SELECT role, content FROM queries WHERE session_id = ? ORDER BY created_at DESC LIMIT 10",
            (request.session_id,),
        )
        raw_history = cursor.fetchall()[::-1]  # Ascending order

    history = [
        {
            "q": r["content"],
            "a": raw_history[i + 1]["content"]
            if i + 1 < len(raw_history) and raw_history[i + 1]["role"] == "assistant"
            else "",
        }
        for i, r in enumerate(raw_history)
        if r["role"] == "user"
    ]

    # Safety check
    is_safe = await check_safety(request.question)
    if not is_safe:
        raise HTTPException(status_code=400, detail="Safety flag triggered.")

    try:
        # === BACKEND PIPELINE ===

        # Step 0: AI Auto-Analysis - Pre-process query context
        ai_analyzer = get_ai_analyzer()
        query_context = ai_analyzer.analyze_context(
            request.session_id, request.question, profile, history
        )
        logger.info(
            f"AI Context: complexity={query_context['complexity']}, confidence={query_context['confidence_score']:.2f}"
        )

        # Step 1: Intent Detection with Memory
        intent_data = detect_intent(request.question, profile, history)

        # Step 1.5: Check cache first (skip processing if cached)
        cached_result = query_cache.get(
            request.session_id, request.question, intent_data
        )

        if cached_result:
            result_df, status_msg = cached_result
            logger.info(f"Using cached result for: {request.question[:30]}...")
        else:
            # Step 2: Query Engine - ALL calculations happen HERE (NOT in LLM)
            result_df, status_msg = process_query(df, intent_data, profile)

            # Cache the result
            query_cache.set(
                request.session_id, request.question, intent_data, result_df, status_msg
            )

        # Step 3: Validate query result (ground truth check)
        is_valid, validation_msg = validate_query_result(result_df, intent_data)
        if not is_valid:
            logger.warning(f"Query validation warning: {validation_msg}")
            # If validation fails but we have some data, continue with a warning
            if result_df.empty or result_df.isna().all().all():
                # Fallback: return a meaningful error with suggestions
                raise ValueError(
                    f"Could not process query: {validation_msg}. Try asking about specific columns in your data."
                )

        # Step 4: Generate structured response from data
        structured_response = format_structured_response(
            result_df, request.question, intent_data, profile, status_msg
        )

        # Step 5: Chart Generation - Smart Selection (NOT LLM)
        # Use generate_chart_config for structured chart config
        chart_config = generate_chart_config(
            result_df, intent_data, profile, request.question
        )

        # Generate multiple charts if appropriate
        multiple_charts = generate_multiple_charts(
            result_df, intent_data, profile, request.question
        )

        # Step 6: Detect if user wants explanation
        reasoning_mode = detect_reasoning_mode(request.question)

        # Step 7: LLM for explanation ONLY (NOT for calculations)
        # Only call LLM if we have actual data to show
        if not result_df.empty and len(result_df) > 0:
            # Format as a clean table for LLM instead of raw CSV
            # Take first 15 rows and format nicely
            result_table = result_df.head(15).to_markdown(index=False)
            llm_result = await generate_explanation(
                result_table, request.question, history, reasoning_mode
            )
            # Combine backend computation + LLM explanation
            final_answer = structured_response.explanation or llm_result.get(
                "answer", ""
            )
            follow_ups = llm_result.get("follow_up_questions", [])
        else:
            # No data returned - use structured response explanation or fallback
            final_answer = (
                structured_response.explanation
                or "I couldn't find data matching your query. Try rephrasing or asking about specific columns."
            )
            follow_ups = [
                "What columns are available?",
                "Show me the top 10 rows.",
                "Summarize the dataset",
            ]

        # Build enhanced response with structured data
        response_data = {
            "summary": structured_response.summary,
            "key_insights": structured_response.key_insights,
            "data_source": "computed",  # Confirms this is from backend, not LLM
            "backend_calculations": True,
        }

        # Adaptive learning from interaction
        ai_analyzer.adaptive_learner.learn_from_interaction(
            request.question,
            True,
            query_context,  # Assume success for now
        )

        # Update context processor metrics
        ai_analyzer.context_processor.update_metrics(
            request.session_id, "ask_query", time.time() - start_time
        )

        # Update context processor metrics
        ai_analyzer.context_processor.update_metrics(
            request.session_id, "ask_query", time.time() - start_time
        )

        # Persistence
        with get_db_connection() as conn:
            cursor = conn.cursor()
            id_user = str(uuid.uuid4())
            id_assistant = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO queries (id, session_id, role, content) VALUES (?, ?, ?, ?)",
                (id_user, request.session_id, "user", request.question),
            )
            # Store JSON follow-ups in the new column
            cursor.execute(
                "INSERT INTO queries (id, session_id, role, content, follow_ups) VALUES (?, ?, ?, ?, ?)",
                (
                    id_assistant,
                    request.session_id,
                    "assistant",
                    final_answer,
                    json.dumps(follow_ups),
                ),
            )
            conn.commit()

        # Build chart data in expected format for backward compatibility
        chart_data = chart_config["data"] if chart_config.get("data") else []

        # Clean result table of NaN values
        result_table_clean = (
            result_df.fillna("")
            .replace("nan", "Not available")
            .replace("NaN", "Not available")
            .replace("None", "Not available")
            .replace({np.nan: "Not available"})
        )
        result_table_list = (
            result_table_clean.to_dict(orient="records") if not result_df.empty else []
        )

        # Step 8: AI Auto-Analysis - Post-process results for enhanced insights
        result_data = {
            "result_table": result_table_list,
            "chart_data": chart_data,
            "chart_config": chart_config,
        }
        enhanced_result = ai_analyzer.post_process_insights(result_data, query_context)

        # Add AI recommendations to response
        if enhanced_result.get("recommendations"):
            # Append recommendations to follow-up questions
            for rec in enhanced_result["recommendations"]:
                if rec.get("type") == "visualization":
                    follow_ups.append("View as chart")

        # Sanitize final answer to remove NaN values
        def sanitize_text(text: str) -> str:
            if not text:
                return text
            text = (
                text.replace("nan", "Not available")
                .replace("NaN", "Not available")
                .replace("None", "Not available")
            )
            # Handle float('nan') representation
            import re

            text = re.sub(r"\bnan\b", "Not available", text, flags=re.IGNORECASE)
            return text

        final_answer = sanitize_text(final_answer)

        # Get follow-up questions (use fallback if llm_result wasn't called)
        follow_ups = (
            follow_ups
            if "follow_ups" in locals()
            else [
                "What columns are available?",
                "Show me the top 10 rows.",
                "Summarize the dataset",
            ]
        )

        return LLMResponse(
            id=id_assistant,
            answer=final_answer,
            chart_suggestion=chart_config.get("type", "none"),
            chart_data=chart_data,
            charts=multiple_charts if len(multiple_charts) > 1 else None,
            chart_config=chart_config if chart_config.get("type") != "none" else None,
            follow_up_questions=follow_ups,
            result_table=result_table_list,
            result_columns=result_df.columns.tolist() if not result_df.empty else [],
            reasoning_mode=reasoning_mode,
            data_source="computed",
            backend_calculations=True,
            ai_enhanced=enhanced_result.get("ai_enhanced", False),
            ai_insights=enhanced_result.get("insights_added", []),
            ai_recommendations=enhanced_result.get("recommendations", []),
        )

    except Exception as e:
        import traceback

        logger.error(f"Computation error: {e}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        error_type = type(e).__name__

        # Context-aware error messages with recovery hints
        error_messages = {
            "KeyError": "I couldn't find a specific column in your data. Try asking about available columns first.",
            "ValueError": "There's an issue with the data format. Try rephrasing your question.",
            "AttributeError": "There's a problem processing that column. Try asking about a different column.",
            "DatabaseError": "There's an issue reading your data. Try refreshing the page.",
            "TimeoutError": "The analysis took too long. Try asking about a smaller subset of data.",
        }

        default_msg = f"I ran into an issue processing that query: {str(e)}. Try rephrasing or asking about specific columns."
        error_msg = error_messages.get(error_type, default_msg)

        # Get available columns for suggestions
        try:
            available_cols = profile.get("numeric_cols", [])[:3] if profile else []
            if available_cols:
                error_msg += f" For example: 'Show top 10 {available_cols[0]}'"
        except:
            pass

        return LLMResponse(
            answer=error_msg,
            chart_suggestion="none",
            chart_data=[],
            follow_up_questions=[
                "What columns are available?",
                "Show me the top 10 rows.",
                "Summarize the dataset",
            ],
            result_table=[],
            result_columns=[],
            data_source="error",
            backend_calculations=False,
        )


@router.get("/explore/{session_id}")
async def explore_data(
    session_id: str,
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    sort_by: str = "",
    sort_order: str = "asc",
    filter_col: str = "",
    filter_val: str = "",
    filter_min: str = "",
    filter_max: str = "",
):
    """Paginated, searchable, sortable, filterable data explorer endpoint."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Session not found")

            df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)

        total_rows = len(df)

        # Global search across all columns
        if search:
            mask = pd.Series(False, index=df.index)
            for col in df.columns:
                mask = mask | df[col].astype(str).str.contains(
                    search, case=False, na=False
                )
            df = df[mask]

        # Filter by categorical column value
        if filter_col and filter_val and filter_col in df.columns:
            df = df[df[filter_col].astype(str) == filter_val]

        # Filter by numeric range
        if filter_col and (filter_min or filter_max) and filter_col in df.columns:
            if pd.api.types.is_numeric_dtype(df[filter_col]):
                if filter_min:
                    try:
                        df = df[df[filter_col] >= float(filter_min)]
                    except ValueError:
                        pass
                if filter_max:
                    try:
                        df = df[df[filter_col] <= float(filter_max)]
                    except ValueError:
                        pass

        filtered_count = len(df)

        # Sorting
        if sort_by and sort_by in df.columns:
            ascending = sort_order.lower() == "asc"
            df = df.sort_values(by=sort_by, ascending=ascending)

        # Pagination
        start = (page - 1) * page_size
        end = start + page_size
        page_df = df.iloc[start:end]

        # Convert to records, handle NaN
        records = page_df.fillna("").to_dict(orient="records")

        return {
            "columns": df.columns.tolist(),
            "rows": records,
            "total": total_rows,
            "filtered": filtered_count,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (filtered_count + page_size - 1) // page_size),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Explore data failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch data.")


@router.get("/explore/{session_id}/values")
async def get_column_values(session_id: str, column: str):
    """Returns unique values for a specific column (for filter dropdowns)."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Session not found")

            df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)

        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found.")

        unique_vals = df[column].dropna().unique().tolist()
        is_numeric = bool(pd.api.types.is_numeric_dtype(df[column]))

        result = {
            "column": column,
            "is_numeric": is_numeric,
            "values": [str(v) for v in sorted(unique_vals, key=str)[:200]],
        }

        if is_numeric:
            result["min"] = float(df[column].min())
            result["max"] = float(df[column].max())

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Column values fetch failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch column values.")


@router.post("/compare")
async def compare_groups(request: CompareRequest):
    """Compares two groups/categories across all numeric columns."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT metadata FROM sessions WHERE id = ?", (request.session_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")

            profile = json.loads(row["metadata"])
            df = pd.read_sql(f'SELECT * FROM "df_{request.session_id}"', con=conn)

        comparison_data, status_msg = compare_query(
            df, request.group_col, request.group_a, request.group_b, profile
        )

        if not comparison_data:
            raise HTTPException(status_code=400, detail=status_msg)

        return {"status": "success", "comparison": comparison_data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Comparison failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to perform comparison.")


@router.get("/starter-questions/{session_id}")
async def get_starter_questions(session_id: str):
    """Generate context-aware starter questions based on dataset structure."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")

            profile = json.loads(row["metadata"])

        # Get starter questions from profile
        starter_questions = profile.get("starter_questions", [])

        # Fallback: generate if not in profile
        if not starter_questions:
            df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)
            numeric_cols = profile.get("numeric_cols", [])
            categorical_cols = profile.get("categorical_cols", [])
            datetime_cols = profile.get("datetime_cols", [])
            starter_questions = generate_starter_questions(
                df, numeric_cols, categorical_cols, datetime_cols
            )

        return {"questions": starter_questions}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Starter questions failed: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to generate starter questions."
        )


@router.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(status="ok", api="InsightAI v2-Prod")


@router.get("/cache/stats")
def get_cache_stats():
    """Get query cache statistics."""
    stats = query_cache.get_stats()
    return {
        "cache_size": stats["size"],
        "max_size": stats["max_size"],
        "hits": stats["hits"],
        "misses": stats["misses"],
        "hit_rate": stats["hit_rate"],
    }


@router.post("/cache/clear")
def clear_cache():
    """Clear the query cache."""
    query_cache.clear()
    return {"status": "cleared", "message": "Query cache cleared successfully"}


@router.get("/export/{session_id}")
async def export_data(session_id: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=404,
                detail="Session expired or invalid. Please re-upload your file.",
            )

        df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)

    headers = {
        "Content-Disposition": f"attachment; filename=csv_data_export_{session_id}.csv"
    }
    return Response(
        content=df.to_csv(index=False), media_type="text/csv", headers=headers
    )


@router.get("/sessions")
async def list_sessions():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, filename, created_at FROM sessions ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        return {
            "sessions": [
                {
                    "id": r["id"],
                    "filename": r["filename"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, filename, metadata, created_at FROM sessions WHERE id = ?",
            (session_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get session settings including cleaning_mode
        cursor.execute(
            "SELECT key, value FROM session_settings WHERE session_id = ?",
            (session_id,),
        )
        settings = {s["key"]: s["value"] for s in cursor.fetchall()}

        # Get query history
        cursor.execute(
            "SELECT id, role, content, is_saved, created_at FROM queries WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        queries = cursor.fetchall()

        return {
            "session": {
                "id": row["id"],
                "filename": row["filename"],
                "metadata": json.loads(row["metadata"]),
                "created_at": row["created_at"],
                "cleaning_mode": settings.get("cleaning_mode", "balanced"),
            },
            "history": [
                {
                    "id": q["id"],
                    "role": q["role"],
                    "content": q["content"],
                    "is_saved": bool(q["is_saved"]),
                    "created_at": q["created_at"],
                }
                for q in queries
            ],
        }


@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(session_id: str):
    """Delete a specific session and all its data."""
    if delete_session(session_id):
        return {"status": "success", "message": "Session deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/sessions/bulk")
async def bulk_delete_sessions_endpoint(request: BulkDeleteRequest):
    """Delete multiple sessions and their data."""
    results = bulk_delete_sessions(request.session_ids)
    return {
        "status": "success",
        "results": results,
        "message": f"Successfully deleted {len(results['deleted'])} sessions",
    }


@router.patch("/sessions/{session_id}")
async def rename_session_endpoint(session_id: str, request: RenameSessionRequest):
    """Rename a specific session."""
    if rename_session(session_id, request.new_name):
        return {"status": "success", "message": "Session renamed successfully"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")


@router.post("/sessions/{session_id}/duplicate")
async def duplicate_session_endpoint(session_id: str):
    """Duplicate a specific session."""
    new_id = str(uuid.uuid4())
    if duplicate_session(session_id, new_id):
        return {
            "status": "success",
            "message": "Session duplicated successfully",
            "new_id": new_id,
        }
    else:
        raise HTTPException(status_code=404, detail="Original session not found")


@router.delete("/sessions/{session_id}/history")
async def clear_history_endpoint(session_id: str):
    """Clear chat history for a session but keep data."""
    if clear_session_history(session_id):
        return {"status": "success", "message": "History cleared successfully"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")


# Models for request validation
class ComparisonRequest(BaseModel):
    session_id: str
    group_col: str
    group_a: Any
    group_b: Any


class QueryRequest(BaseModel):
    session_id: str
    question: str


class SaveQueryRequest(BaseModel):
    query_id: str
    is_saved: bool


class HealthResponse(BaseModel):
    status: str
    api: str


class LLMResponse(BaseModel):
    id: Optional[str] = None
    answer: str
    chart_suggestion: str
    chart_data: List[Dict[str, Any]]
    charts: Optional[List[Dict[str, Any]]] = None
    chart_config: Optional[Dict[str, Any]] = None
    follow_up_questions: List[str]
    result_table: List[Dict[str, Any]]
    result_columns: List[str]
    reasoning_mode: bool = False
    data_source: str = "llm"
    backend_calculations: bool = False
    ai_enhanced: bool = False
    ai_insights: List[Any] = []
    ai_recommendations: List[Any] = []


@router.post("/queries/save")
async def save_query(request: SaveQueryRequest):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE queries SET is_saved = ? WHERE id = ?",
            (1 if request.is_saved else 0, request.query_id),
        )
        conn.commit()
        return {"status": "success"}


@router.get("/export/report/{session_id}")
async def export_report(session_id: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        filename = row["filename"]
        cursor.execute(
            "SELECT role, content FROM queries WHERE session_id = ? AND is_saved = 1 ORDER BY created_at ASC",
            (session_id,),
        )
        saved_queries = cursor.fetchall()

    markdown_report = f"# InsightAI Executive Report\n## Dataset: {filename}\n\nGenerated on {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n---\n\n"

    if not saved_queries:
        markdown_report += "*No saved queries were found for this session.*\n"

    for q in saved_queries:
        if q["role"] == "user":
            markdown_report += f"### Q: {q['content']}\n\n"
        else:
            # Clean up potential error blocks
            content = q["content"].replace("### ⚠️ Error", "")
            markdown_report += f"{content}\n\n---\n\n"

    headers = {
        "Content-Disposition": f"attachment; filename=InsightAI_Report_{filename}.md"
    }
    return Response(
        content=markdown_report, media_type="text/markdown", headers=headers
    )


@router.post("/insights/generate/{session_id}")
async def generate_ai_insights(session_id: str):
    """Auto-generate AI insights by running Pandas analysis on the dataset."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")

            profile = json.loads(row["metadata"])
            df = pd.read_sql(f'SELECT * FROM "df_{session_id}"', con=conn)

            # Ensure numeric columns are properly typed (fix for NaN issues)
            for col in df.columns:
                if df[col].dtype == object:
                    numeric_converted = pd.to_numeric(
                        df[col].str.replace(",", "").str.replace("%", ""),
                        errors="coerce",
                    )
                    if numeric_converted.notna().sum() > len(df) * 0.5:
                        df[col] = numeric_converted

        # Run Rule-based insights
        insights = generate_auto_insights(df, profile, max_insights=30)

        # Enhance with AI Auto-Analysis
        ai_analyzer = get_ai_analyzer()
        session_summary = ai_analyzer.get_session_summary(session_id)
        session_summary["session_id"] = session_id

        # Generate proactive suggestions and related insights using current state
        ai_suggestions = ai_analyzer.generate_proactive_suggestions(session_summary)

        return {
            "insights": insights,
            "total": len(insights),
            "ai_metadata": {
                "suggestions": ai_suggestions,
                "summary": session_summary,
                "enhanced": True,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI insights generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate insights.")


@router.get("/ai/suggestions/{session_id}")
async def get_ai_suggestions(session_id: str):
    """Generate proactive AI suggestions based on session context."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")

            profile = json.loads(row["metadata"])

        ai_analyzer = get_ai_analyzer()
        context = ai_analyzer.get_session_summary(session_id)
        context["session_id"] = session_id

        suggestions = ai_analyzer.generate_proactive_suggestions(context)

        return {"suggestions": suggestions}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI suggestions failed: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to generate AI suggestions."
        )


@router.get("/cleaning-report/{session_id}")
async def get_cleaning_report(session_id: str):
    """Get the data cleaning and transformation report."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM session_settings WHERE session_id = ? AND key = ?",
                (session_id, "cleaning_report"),
            )
            row = cursor.fetchone()
            if not row:
                return {
                    "status": "no_report",
                    "message": "No cleaning report available",
                }

            cleaning_report = json.loads(row["value"])

            # Also get cleaning mode
            cursor.execute(
                "SELECT value FROM session_settings WHERE session_id = ? AND key = ?",
                (session_id, "cleaning_mode"),
            )
            mode_row = cursor.fetchone()
            cleaning_mode = mode_row["value"] if mode_row else "balanced"

            return {
                "status": "success",
                "cleaning_mode": cleaning_mode,
                "quality_score": cleaning_report.get("quality_score"),
                "cleanliness": cleaning_report.get("cleanliness"),
                "transformations": cleaning_report.get("transformations"),
                "enrichment": cleaning_report.get("enrichment"),
                "actions_log": cleaning_report.get("actions_log", []),
                "new_features": cleaning_report.get("new_features", []),
                "recommendations": cleaning_report.get("recommendations", []),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get cleaning report: {e}")
        raise HTTPException(status_code=500, detail="Failed to get cleaning report.")


_SAMPLE_DATA_CACHE: Dict[str, Any] = {}


def _preprocess_sample_data(cleaning_mode: str):
    """Pre-process sample data for given cleaning mode. Results are cached in memory."""
    cache_key = f"sample_{cleaning_mode}"
    if cache_key in _SAMPLE_DATA_CACHE:
        return _SAMPLE_DATA_CACHE[cache_key]

    SAMPLE_DATA_PATH = os.path.join(
        os.path.dirname(__file__), "..", "sample_retail_sales.csv"
    )
    if not os.path.exists(SAMPLE_DATA_PATH):
        SAMPLE_DATA_PATH = os.path.join(
            os.path.dirname(__file__), "..", "..", "sample_retail_sales.csv"
        )

    df = pd.read_csv(SAMPLE_DATA_PATH)
    processed_data = clean_data(df, mode=cleaning_mode)
    cleaned_df = processed_data.df
    cleaning_report = get_cleaning_report_data(processed_data)
    profile = dataset_profile(cleaned_df)

    _SAMPLE_DATA_CACHE[cache_key] = (cleaned_df, profile, cleaning_report)
    return cleaned_df, profile, cleaning_report


@router.post("/sample-data")
async def load_sample_data(cleaning_mode: str = Form("balanced")):
    """Load built-in sample retail sales dataset with caching."""
    if cleaning_mode not in ["conservative", "balanced", "aggressive"]:
        cleaning_mode = "balanced"

    session_id = str(uuid.uuid4())

    try:
        logger.info(f"Loading sample data for session: {session_id}")

        cleaned_df, profile, cleaning_report = _preprocess_sample_data(cleaning_mode)

        # Add column_stats to profile for storage
        column_stats = generate_column_stats(cleaned_df)
        profile_with_stats = {**profile, "column_stats": column_stats}

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sessions (id, filename, metadata) VALUES (?, ?, ?)",
                (
                    session_id,
                    "sample_retail_sales.csv",
                    json.dumps(profile_with_stats, cls=NumpyEncoder),
                ),
            )
            cleaned_df.to_sql(
                f"df_{session_id}", con=conn, if_exists="replace", index=False
            )

            cursor.execute(
                "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)",
                (
                    session_id,
                    "cleaning_report",
                    json.dumps(cleaning_report, cls=NumpyEncoder),
                ),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)",
                (session_id, "cleaning_mode", cleaning_mode),
            )
            conn.commit()

        column_stats = generate_column_stats(cleaned_df)

        head_csv = cleaned_df.head(10).to_csv(index=False)
        try:
            auto_summary = await auto_insights_with_kimi(head_csv, profile["summary"])
        except Exception as e:
            logger.warning(f"Auto insights failed: {e}")
            auto_summary = "Sample retail sales data loaded successfully."

        cleanup_old_sessions(5)

        return UploadResponse(
            message="Sample data loaded and analyzed successfully",
            session_id=session_id,
            metadata=FileUploadMetadata(
                columns=profile["columns"],
                total_rows=profile["total_rows"],
                column_stats=column_stats,
                numeric_cols=profile.get("numeric_cols", []),
                categorical_cols=profile.get("categorical_cols", []),
                datetime_cols=profile.get("datetime_cols", []),
            ),
            insights=auto_summary,
        )

    except Exception as e:
        logger.exception(f"Sample data loading failed")
        raise HTTPException(
            status_code=500, detail=f"Failed to load sample data: {str(e)}"
        )


@router.get("/summary")
async def get_summary():
    """Aggregate global statistics across all sessions for the Dashboard."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, filename, metadata, created_at FROM sessions ORDER BY created_at DESC"
            )
            sessions_rows = cursor.fetchall()

            total_sessions = len(sessions_rows)
            total_rows = 0
            total_cols = 0
            quality_scores = []
            activity_data = []

            # Activity over last 7 days for chart
            now = datetime.now()
            days = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)][
                ::-1
            ]
            daily_activity = {d: 0 for d in days}

            for s in sessions_rows:
                meta = json.loads(s["metadata"])
                total_cols += len(meta.get("columns", []))

                # Activity tracking
                try:
                    c_date = datetime.strptime(
                        s["created_at"], "%Y-%m-%d %H:%M:%S"
                    ).strftime("%Y-%m-%d")
                    if c_date in daily_activity:
                        daily_activity[c_date] += 1
                except:
                    pass

                try:
                    # Optimized row count check
                    cursor.execute(f'SELECT COUNT(*) FROM "df_{s["id"]}"')
                    total_rows += cursor.fetchone()[0]
                except:
                    pass

                # Quality scores
                cursor.execute(
                    "SELECT value FROM session_settings WHERE session_id = ? AND key = 'cleaning_report'",
                    (s["id"],),
                )
                q_row = cursor.fetchone()
                if q_row:
                    rep = json.loads(q_row["value"])
                    if "quality_score" in rep:
                        quality_scores.append(rep["quality_score"])

            cursor.execute("SELECT COUNT(*) FROM queries WHERE is_saved = 1")
            total_insights = cursor.fetchone()[0]

            avg_quality = (
                sum(quality_scores) / len(quality_scores) if quality_scores else 0
            )

            return {
                "total_sessions": total_sessions,
                "total_rows": total_rows,
                "total_columns": total_cols,
                "total_insights": total_insights,
                "avg_quality": round(avg_quality, 1),
                "activity_chart": [
                    {"date": d, "count": daily_activity[d]} for d in days
                ],
                "recent_sessions": [
                    {
                        "id": r["id"],
                        "name": r["filename"],
                        "rows": json.loads(r["metadata"]).get("total_rows", 0),
                    }
                    for r in sessions_rows[:5]
                ],
            }
    except Exception as e:
        logger.error(f"Global summary failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to aggregate data.")


@router.get("/column-distribution/{session_id}/{column}")
async def get_column_distribution(session_id: str, column: str):
    """Returns a simple histogram distribution for sparklines."""
    try:
        with get_db_connection() as conn:
            df = pd.read_sql(f'SELECT "{column}" FROM "df_{session_id}"', con=conn)

        # Clean and target numeric data
        data = pd.to_numeric(df[column], errors="coerce").dropna()
        if data.empty:
            return {"distribution": []}

        # Create 15 bins
        counts, bins = np.histogram(data, bins=15)
        return {
            "distribution": [
                {"bin": float(bins[i]), "count": int(counts[i])}
                for i in range(len(counts))
            ]
        }
    except Exception as e:
        logger.error(f"Distribution calculation failed: {e}")
        return {"distribution": []}


@router.get("/export/bulk")
async def bulk_export():
    """Export all sessions zip."""
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, filename FROM sessions")
                sessions = cursor.fetchall()

                consolidated_report = "# InsightAI Consolidated Portfolio Export\n\n"

                for s in sessions:
                    sid, fname = s["id"], s["filename"]

                    # 1. Add CSV
                    df = pd.read_sql(f'SELECT * FROM "df_{sid}"', con=conn)
                    zip_file.writestr(f"{fname}_{sid[:8]}.csv", df.to_csv(index=False))

                    # 2. Append to report
                    consolidated_report += f"## Session: {fname}\n- ID: {sid}\n"
                    cursor.execute(
                        "SELECT content FROM queries WHERE session_id = ? AND role = 'assistant' AND is_saved = 1",
                        (sid,),
                    )
                    insights = cursor.fetchall()
                    for ins in insights:
                        consolidated_report += f"\n{ins['content']}\n"
                    consolidated_report += "\n---\n"

                zip_file.writestr("GLOBAL_REPORT.md", consolidated_report)

        zip_buffer.seek(0)
        headers = {
            "Content-Disposition": "attachment; filename=InsightAI_Full_Export.zip"
        }
        return Response(
            content=zip_buffer.getvalue(),
            media_type="application/x-zip-compressed",
            headers=headers,
        )

    except Exception as e:
        logger.error(f"Bulk export failed: {e}")
        raise HTTPException(status_code=500, detail="Export failed.")
