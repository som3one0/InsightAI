import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from loguru import logger


# =============================================================================
# 1. QUESTION GENERATOR - Auto-generate meaningful questions from dataset
# =============================================================================


def generate_questions(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generate 20-50 meaningful questions based on dataset structure.

    Each question is a dict with:
    - question: human-readable question text
    - type: insight category (top_values, aggregation, grouping, distribution, comparison, outlier, trend)
    - action: pandas operation to perform
    - target_col: column to analyze
    - group_col: column to group by (optional)
    - limit: number of results (optional)
    """
    questions: List[Dict[str, Any]] = []
    numeric_cols = profile.get("numeric_cols", [])
    categorical_cols = profile.get("categorical_cols", [])
    datetime_cols = profile.get("datetime_cols", [])
    columns = profile.get("columns", [])

    # --- Top Values ---
    for col in numeric_cols[:5]:
        questions.append(
            {
                "question": f"Top 10 values in {col}",
                "type": "top_values",
                "action": "top",
                "target_col": col,
                "limit": 10,
            }
        )

    # --- Bottom Values ---
    for col in numeric_cols[:3]:
        questions.append(
            {
                "question": f"Bottom 10 values in {col}",
                "type": "top_values",
                "action": "bottom",
                "target_col": col,
                "limit": 10,
            }
        )

    # --- Aggregations (mean, sum, min, max, median) ---
    for col in numeric_cols[:5]:
        questions.extend(
            [
                {
                    "question": f"Average {col}",
                    "type": "aggregation",
                    "action": "mean",
                    "target_col": col,
                },
                {
                    "question": f"Total {col}",
                    "type": "aggregation",
                    "action": "sum",
                    "target_col": col,
                },
                {
                    "question": f"Median {col}",
                    "type": "aggregation",
                    "action": "median",
                    "target_col": col,
                },
                {
                    "question": f"Minimum {col}",
                    "type": "aggregation",
                    "action": "min",
                    "target_col": col,
                },
                {
                    "question": f"Maximum {col}",
                    "type": "aggregation",
                    "action": "max",
                    "target_col": col,
                },
            ]
        )

    # --- Grouped counts ---
    for col in categorical_cols[:4]:
        unique = profile.get("column_types", {}).get(col, "")
        questions.append(
            {
                "question": f"Count per {col}",
                "type": "grouping",
                "action": "count_by",
                "target_col": col,
                "limit": 10,
            }
        )

    # --- Grouped averages ---
    for cat_col in categorical_cols[:3]:
        for num_col in numeric_cols[:2]:
            questions.append(
                {
                    "question": f"Average {num_col} by {cat_col}",
                    "type": "grouping",
                    "action": "mean_by",
                    "target_col": num_col,
                    "group_col": cat_col,
                    "limit": 10,
                }
            )

    # --- Grouped sums ---
    for cat_col in categorical_cols[:2]:
        for num_col in numeric_cols[:2]:
            questions.append(
                {
                    "question": f"Total {num_col} by {cat_col}",
                    "type": "grouping",
                    "action": "sum_by",
                    "target_col": num_col,
                    "group_col": cat_col,
                    "limit": 10,
                }
            )

    # --- Distribution ---
    for col in numeric_cols[:4]:
        questions.append(
            {
                "question": f"Distribution of {col}",
                "type": "distribution",
                "action": "histogram",
                "target_col": col,
                "limit": 12,
            }
        )

    # --- Category distribution ---
    for col in categorical_cols[:3]:
        questions.append(
            {
                "question": f"Distribution of {col}",
                "type": "distribution",
                "action": "value_counts",
                "target_col": col,
                "limit": 10,
            }
        )

    # --- Outliers ---
    for col in numeric_cols[:3]:
        questions.append(
            {
                "question": f"Outliers in {col}",
                "type": "outlier",
                "action": "outliers",
                "target_col": col,
                "limit": 10,
            }
        )

    # --- Comparison (best category) ---
    for cat_col in categorical_cols[:2]:
        for num_col in numeric_cols[:2]:
            questions.append(
                {
                    "question": f"Which {cat_col} has highest average {num_col}?",
                    "type": "comparison",
                    "action": "best_group",
                    "target_col": num_col,
                    "group_col": cat_col,
                    "limit": 10,
                }
            )

    # --- Trend (if datetime exists) ---
    for time_col in datetime_cols[:1]:
        for num_col in numeric_cols[:3]:
            questions.append(
                {
                    "question": f"{num_col} trend over {time_col}",
                    "type": "trend",
                    "action": "trend",
                    "target_col": num_col,
                    "group_col": time_col,
                    "limit": 20,
                }
            )

    # --- Correlation hint ---
    if len(numeric_cols) >= 2:
        col_a = numeric_cols[0]
        col_b = numeric_cols[1]
        questions.append(
            {
                "question": f"Relationship between {col_a} and {col_b}",
                "type": "comparison",
                "action": "scatter_top",
                "target_col": col_b,
                "group_col": col_a,
                "limit": 20,
            }
        )

    # Deduplicate by question text
    seen = set()
    unique_questions = []
    for q in questions:
        if q["question"] not in seen:
            seen.add(q["question"])
            unique_questions.append(q)

    return unique_questions


# =============================================================================
# 2. INSIGHT EXECUTOR - Execute questions using Pandas (no LLM)
# =============================================================================


def _detect_chart_type_for_result(
    label_col: Optional[str],
    value_col: str,
    action: str,
) -> str:
    """Detect chart type for an insight result."""
    if action in ("trend",):
        return "line"
    if action == "histogram":
        return "histogram"
    if label_col is None:
        return "histogram"
    # Time column -> line
    if label_col:
        time_kw = frozenset(
            [
                "ep",
                "episode",
                "time",
                "date",
                "year",
                "season",
                "month",
                "week",
                "day",
                "quarter",
                "period",
            ]
        )
        if any(k in label_col.lower() for k in time_kw):
            return "line"
    return "bar"


def _build_chart_data(
    df: pd.DataFrame,
    label_col: Optional[str],
    value_col: str,
    max_rows: int = 10,
) -> List[Dict[str, Any]]:
    """Build chart-ready data from result DataFrame."""
    rows = []
    for _, row in df.iterrows():
        try:
            val = row[value_col]
            if pd.isna(val):
                continue
            val = float(val)
        except (ValueError, TypeError):
            continue

        if label_col:
            label = row[label_col]
            if pd.isna(label):
                continue
            label = str(label).strip()
            if len(label) > 20:
                label = label[:17] + "..."
        else:
            label = str(len(rows) + 1)

        rows.append({"name": label, "value": round(val, 4)})
        if len(rows) >= max_rows:
            break
    return rows


def execute_question(
    df: pd.DataFrame, question_def: Dict[str, Any], profile: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Execute a single question using Pandas. Returns insight result dict.

    Returns:
    {
        "question": str,
        "type": str,
        "result_table": [{"col1": val, "col2": val}, ...],
        "result_columns": [str],
        "chart_data": [{"name": str, "value": float}],
        "chart_type": "bar" | "line" | "histogram" | "none",
        "summary_value": str,  # single-line summary for aggregations
    }
    """
    action = question_def.get("action", "list")
    target_col = question_def.get("target_col")
    group_col = question_def.get("group_col")
    limit = question_def.get("limit", 10)
    q_type = question_def.get("type", "unknown")
    question_text = question_def.get("question", "")

    try:
        # --- Single aggregations ---
        if action in ("mean", "sum", "median", "min", "max") and not group_col:
            if target_col not in df.columns:
                return _empty_insight(question_text, q_type)
            val = getattr(df[target_col], action)()
            if pd.isna(val):
                return _empty_insight(question_text, q_type)
            val = float(val)
            result_df = pd.DataFrame({"Metric": [target_col], "Value": [round(val, 4)]})
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": [],
                "chart_type": "none",
                "summary_value": f"{action.title()} of {target_col}: {val:,.4g}",
            }

        # --- Top / Bottom ---
        if action in ("top", "bottom") and target_col in df.columns:
            ascending = action == "bottom"
            result_df = (
                df.nsmallest(limit, target_col)
                if ascending
                else df.nlargest(limit, target_col)
            )
            # Keep only target col + first non-numeric col as label
            non_num = [
                c
                for c in result_df.columns
                if not pd.api.types.is_numeric_dtype(result_df[c])
            ]
            if non_num:
                result_df = result_df[[non_num[0], target_col]]
            else:
                result_df = result_df[[target_col]]
            chart_label = result_df.columns[0] if len(result_df.columns) > 1 else None
            chart_data = _build_chart_data(result_df, chart_label, target_col, limit)
            chart_type = _detect_chart_type_for_result(chart_label, target_col, action)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": chart_type,
                "summary_value": None,
            }

        # --- Count by category ---
        if action == "count_by" and target_col in df.columns:
            counts = df[target_col].value_counts().head(limit).reset_index()
            counts.columns = [target_col, "count"]
            chart_data = _build_chart_data(counts, target_col, "count", limit)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": counts.fillna("").to_dict(orient="records"),
                "result_columns": counts.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": None,
            }

        # --- Mean by group ---
        if (
            action == "mean_by"
            and group_col
            and target_col in df.columns
            and group_col in df.columns
        ):
            result_df = df.groupby(group_col)[target_col].mean().reset_index()
            result_df = result_df.sort_values(by=target_col, ascending=False).head(
                limit
            )
            result_df.columns = [group_col, f"avg_{target_col}"]
            chart_data = _build_chart_data(
                result_df, group_col, f"avg_{target_col}", limit
            )
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": None,
            }

        # --- Sum by group ---
        if (
            action == "sum_by"
            and group_col
            and target_col in df.columns
            and group_col in df.columns
        ):
            result_df = df.groupby(group_col)[target_col].sum().reset_index()
            result_df = result_df.sort_values(by=target_col, ascending=False).head(
                limit
            )
            result_df.columns = [group_col, f"total_{target_col}"]
            chart_data = _build_chart_data(
                result_df, group_col, f"total_{target_col}", limit
            )
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": None,
            }

        # --- Histogram / Distribution (numeric) ---
        if action == "histogram" and target_col in df.columns:
            series = df[target_col].dropna()
            if series.empty:
                return _empty_insight(question_text, q_type)
            n_bins = min(12, max(5, int(np.sqrt(len(series)))))
            counts, bin_edges = np.histogram(series, bins=n_bins)
            labels = [
                f"{bin_edges[i]:.2g}–{bin_edges[i + 1]:.2g}" for i in range(len(counts))
            ]
            result_df = pd.DataFrame({"Range": labels, "count": counts.tolist()})
            chart_data = _build_chart_data(result_df, "Range", "count", 12)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "histogram",
                "summary_value": f"Mean: {series.mean():.4g}, Std: {series.std():.4g}",
            }

        # --- Value counts (categorical distribution) ---
        if action == "value_counts" and target_col in df.columns:
            counts = df[target_col].value_counts().head(limit).reset_index()
            counts.columns = [target_col, "count"]
            chart_data = _build_chart_data(counts, target_col, "count", limit)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": counts.fillna("").to_dict(orient="records"),
                "result_columns": counts.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": None,
            }

        # --- Outliers (IQR method) ---
        if action == "outliers" and target_col in df.columns:
            series = df[target_col].dropna()
            if series.empty:
                return _empty_insight(question_text, q_type)
            Q1 = series.quantile(0.25)
            Q3 = series.quantile(0.75)
            IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR
            upper = Q3 + 1.5 * IQR
            outliers = df[(df[target_col] < lower) | (df[target_col] > upper)]
            if outliers.empty:
                return {
                    "question": question_text,
                    "type": q_type,
                    "result_table": [],
                    "result_columns": [],
                    "chart_data": [],
                    "chart_type": "none",
                    "summary_value": "No outliers detected",
                }
            non_num = [
                c
                for c in outliers.columns
                if not pd.api.types.is_numeric_dtype(outliers[c])
            ]
            if non_num:
                result_df = outliers[[non_num[0], target_col]].head(limit)
            else:
                result_df = outliers[[target_col]].head(limit)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": [],
                "chart_type": "none",
                "summary_value": f"{len(outliers)} outliers found (outside {lower:.4g}–{upper:.4g})",
            }

        # --- Best group ---
        if (
            action == "best_group"
            and group_col
            and target_col in df.columns
            and group_col in df.columns
        ):
            result_df = df.groupby(group_col)[target_col].mean().reset_index()
            result_df = result_df.sort_values(by=target_col, ascending=False).head(
                limit
            )
            result_df.columns = [group_col, f"avg_{target_col}"]
            best = result_df.iloc[0]
            chart_data = _build_chart_data(
                result_df, group_col, f"avg_{target_col}", limit
            )
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": f"Best: {best[group_col]} ({best[f'avg_{target_col}']:.4g})",
            }

        # --- Trend over time ---
        if (
            action == "trend"
            and group_col
            and target_col in df.columns
            and group_col in df.columns
        ):
            df_sorted = df.sort_values(by=group_col)
            result_df = df_sorted[[group_col, target_col]].dropna().head(limit)
            chart_data = _build_chart_data(result_df, group_col, target_col, limit)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "line",
                "summary_value": None,
            }

        # --- Scatter top (relationship) ---
        if (
            action == "scatter_top"
            and group_col
            and target_col in df.columns
            and group_col in df.columns
        ):
            result_df = df[[group_col, target_col]].dropna().head(limit)
            chart_data = _build_chart_data(result_df, group_col, target_col, limit)
            return {
                "question": question_text,
                "type": q_type,
                "result_table": result_df.fillna("").to_dict(orient="records"),
                "result_columns": result_df.columns.tolist(),
                "chart_data": chart_data,
                "chart_type": "bar",
                "summary_value": None,
            }

        return _empty_insight(question_text, q_type)

    except Exception as e:
        logger.warning(f"Insight execution failed for '{question_text}': {e}")
        return _empty_insight(question_text, q_type)


def _empty_insight(question: str, q_type: str) -> Dict[str, Any]:
    return {
        "question": question,
        "type": q_type,
        "result_table": [],
        "result_columns": [],
        "chart_data": [],
        "chart_type": "none",
        "summary_value": None,
    }


# =============================================================================
# 3. AUTO INSIGHT GENERATOR - Orchestrate question gen + execution
# =============================================================================


def generate_auto_insights(
    df: pd.DataFrame, profile: Dict[str, Any], max_insights: int = 30
) -> List[Dict[str, Any]]:
    """
    Generate and execute auto insights for a dataset.

    1. Generate questions from profile
    2. Execute each using Pandas
    3. Filter out empty/useless results
    4. Return top insights (sorted by value)
    """
    questions = generate_questions(profile)
    logger.info(f"Generated {len(questions)} questions, executing...")

    insights = []
    for q_def in questions:
        result = execute_question(df, q_def, profile)
        # Skip empty results
        if not result["result_table"] and not result["summary_value"]:
            continue
        # Skip duplicates by checking result_table content
        result_hash = str(result["result_table"][:3])
        if any(str(i.get("result_table", [])[:3]) == result_hash for i in insights):
            continue
        insights.append(result)
        if len(insights) >= max_insights:
            break

    logger.success(f"Generated {len(insights)} valid insights")
    return insights
