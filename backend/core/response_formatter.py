import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple, Optional
from loguru import logger
from dataclasses import dataclass
import json


def clean_value(v: Any) -> Any:
    """Clean NaN/None values for display"""
    if v is None:
        return "Not available"
    if isinstance(v, float):
        if np.isnan(v) or np.isinf(v):
            return "Not available"
    if isinstance(v, str):
        if v.lower() in ["nan", "none", "null", "undefined"]:
            return "Not available"
    return v


def sanitize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN/inf values in DataFrame with None for JSON serialization"""
    df = df.copy()
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].apply(
                lambda x: (
                    "Not available"
                    if (
                        pd.isna(x)
                        or (isinstance(x, str) and x.lower() in ["nan", "none", "null"])
                    )
                    else x
                )
            )
        else:
            df[col] = df[col].apply(
                lambda x: None if (pd.isna(x) or np.isinf(x)) else x
            )
    return df


@dataclass
class StructuredResponse:
    """Structured response from the query engine"""

    summary: str
    key_insights: List[str]
    data_table: List[Dict[str, Any]]
    data_columns: List[str]
    chart_config: Dict[str, Any]
    explanation: str
    query_metadata: Dict[str, Any]


def format_structured_response(
    df: pd.DataFrame,
    query: str,
    intent_data: Dict[str, Any],
    profile: Dict[str, Any],
    status_message: str = "",
) -> StructuredResponse:
    """
    Format a structured response with:
    - Summary of what was computed
    - Key insights extracted from data
    - Data table for display
    - Chart configuration
    - Natural language explanation
    """
    summary = ""
    key_insights = []
    explanation = ""
    chart_config = {"type": "none", "data": []}
    query_metadata = {
        "intent": intent_data.get("intent", "unknown"),
        "action": intent_data.get("action", "unknown"),
        "target_column": intent_data.get("target_col"),
        "group_by": intent_data.get("group_col"),
    }

    # Build summary based on intent
    action = intent_data.get("action", "")
    target = intent_data.get("target_col", "")
    group_col = intent_data.get("group_col")

    if intent_data.get("intent") == "summary":
        summary = f"Dataset overview: {len(df)} rows, {len(df.columns)} columns"
        # Extract key insights from numeric columns
        numeric_cols = profile.get("numeric_cols", [])
        for col in numeric_cols[:3]:
            if col in df.columns:
                mean_val = df[col].mean()
                max_val = df[col].max()
                min_val = df[col].min()
                key_insights.append(
                    f"{col}: range {min_val:.2f} - {max_val:.2f}, mean {mean_val:.2f}"
                )

    elif intent_data.get("intent") == "aggregation":
        if action == "average":
            val = df[target].mean() if target in df.columns else 0
            summary = f"Average {target}: {val:,.2f}"
            key_insights.append(f"Mean value across all records")
            explanation = f"The average {target} is {val:,.2f}. This represents the central tendency of the data."
        elif action == "sum":
            val = df[target].sum() if target in df.columns else 0
            summary = f"Total {target}: {val:,.2f}"
            key_insights.append(f"Sum across all {len(df)} records")
            explanation = f"The total sum of {target} is {val:,.2f}."
        elif action == "count":
            val = df[target].count() if target in df.columns else 0
            summary = f"Count: {val:,} records"
            key_insights.append(f"Total non-null records")
            explanation = f"Found {val:,} records with valid {target} values."

    elif intent_data.get("intent") == "ranking":
        if action in ["top", "max"]:
            top_val = df[target].max() if target in df.columns else 0
            summary = f"Top value in {target}: {top_val:,.2f}"
            key_insights.append(f"Maximum value: {top_val:,.2f}")
            explanation = (
                f"The highest {target} value in the dataset is {top_val:,.2f}."
            )
        elif action in ["bottom", "min"]:
            bottom_val = df[target].min() if target in df.columns else 0
            summary = f"Minimum {target}: {bottom_val:,.2f}"
            key_insights.append(f"Minimum value: {bottom_val:,.2f}")
            explanation = (
                f"The lowest {target} value in the dataset is {bottom_val:,.2f}."
            )
        else:
            summary = f"Showing top {len(df)} records by {target}"
            if target in df.columns:
                max_val = df[target].max()
                min_val = df[target].min()
                key_insights.append(f"Range: {min_val:,.2f} to {max_val:,.2f}")

    elif intent_data.get("intent") == "grouped_aggregation":
        if group_col:
            summary = f"Aggregated by {group_col}"
            # Get top performers
            if target in df.columns:
                grouped = (
                    df.groupby(group_col)[target].mean().sort_values(ascending=False)
                )
                if len(grouped) > 0:
                    top_cat = grouped.index[0]
                    top_val = grouped.iloc[0]
                    key_insights.append(
                        f"Top {group_col}: {top_cat} ({target}: {top_val:,.2f})"
                    )
                    explanation = f"Among all {group_col} categories, {top_cat} has the highest average {target} at {top_val:,.2f}."

    elif intent_data.get("intent") == "comparison":
        if group_col and target:
            unique_vals = df[group_col].unique()
            if len(unique_vals) >= 2:
                val_a = str(unique_vals[0])
                val_b = str(unique_vals[-1])
                mean_a = df[df[group_col] == val_a][target].mean()
                mean_b = df[df[group_col] == val_b][target].mean()
                diff = mean_b - mean_a
                pct = (diff / mean_a * 100) if mean_a != 0 else 0
                summary = f"Comparison: {val_a} vs {val_b}"
                key_insights.append(f"{val_a}: {mean_a:,.2f} | {val_b}: {mean_b:,.2f}")
                key_insights.append(f"Difference: {diff:,.2f} ({pct:+.1f}%)")
                direction = "higher" if diff > 0 else "lower"
                explanation = f"{val_b} is {abs(pct):.1f}% {direction} than {val_a} ({diff:+,.2f} absolute difference)."

    else:
        summary = status_message or f"Showing {len(df)} results"

    # Build data table
    data_table = []
    data_columns = []
    if not df.empty:
        data_columns = df.columns.tolist()
        # Limit to reasonable number of rows
        display_df = df.head(20)
        # Clean NaN values before converting to dict
        display_df = (
            display_df.fillna("")
            .replace("nan", "Not available")
            .replace("NaN", "Not available")
            .replace("None", "Not available")
            .replace(np.nan, "Not available")
        )
        data_table = display_df.to_dict(orient="records")

    # Build chart config
    if len(data_table) >= 2:
        # Try to find label and value columns
        numeric_cols = [c for c in data_columns if pd.api.types.is_numeric_dtype(df[c])]
        non_numeric_cols = [
            c for c in data_columns if not pd.api.types.is_numeric_dtype(df[c])
        ]

        if numeric_cols:
            value_col = numeric_cols[0]
            label_col = non_numeric_cols[0] if non_numeric_cols else None

            if label_col:
                chart_data = []
                for _, row in df.head(10).iterrows():
                    try:
                        val = float(row[value_col])
                        name = str(row[label_col])[:20]
                        chart_data.append({"name": name, "value": round(val, 2)})
                    except:
                        continue
                if len(chart_data) >= 2:
                    chart_config = {"type": "bar", "data": chart_data}
            elif len(numeric_cols) == 1:
                # Single numeric column - show as histogram-like
                values = df[value_col].dropna().head(20).tolist()
                if len(values) >= 2:
                    chart_config = {
                        "type": "bar",
                        "data": [
                            {"name": f"#{i + 1}", "value": round(v, 2)}
                            for i, v in enumerate(values)
                        ],
                    }

    return StructuredResponse(
        summary=summary,
        key_insights=key_insights,
        data_table=data_table,
        data_columns=data_columns,
        chart_config=chart_config,
        explanation=explanation,
        query_metadata=query_metadata,
    )


def compute_statistics(df: pd.DataFrame, column: str) -> Dict[str, Any]:
    """Compute comprehensive statistics for a column"""
    if column not in df.columns:
        return {}

    col_data = df[column].dropna()

    stats = {
        "count": len(col_data),
        "missing": df[column].isna().sum(),
    }

    if pd.api.types.is_numeric_dtype(col_data):
        stats.update(
            {
                "mean": float(col_data.mean()),
                "median": float(col_data.median()),
                "std": float(col_data.std()),
                "min": float(col_data.min()),
                "max": float(col_data.max()),
                "q25": float(col_data.quantile(0.25)),
                "q75": float(col_data.quantile(0.75)),
            }
        )
        # Skewness
        if len(col_data) > 2:
            stats["skewness"] = float(col_data.skew())
    else:
        # Categorical stats
        vc = col_data.value_counts()
        stats.update(
            {
                "unique": int(col_data.nunique()),
                "top_value": str(vc.index[0]) if len(vc) > 0 else None,
                "top_count": int(vc.iloc[0]) if len(vc) > 0 else 0,
            }
        )

    return stats


def generate_data_summary(df: pd.DataFrame, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Generate comprehensive data summary"""
    summary = {
        "row_count": len(df),
        "column_count": len(df.columns),
        "numeric_columns": profile.get("numeric_cols", []),
        "categorical_columns": profile.get("categorical_cols", []),
        "datetime_columns": profile.get("datetime_cols", []),
    }

    # Add key statistics for numeric columns
    numeric_cols = profile.get("numeric_cols", [])
    if numeric_cols:
        key_stats = {}
        for col in numeric_cols[:5]:
            if col in df.columns:
                key_stats[col] = {
                    "mean": round(float(df[col].mean()), 2),
                    "min": round(float(df[col].min()), 2),
                    "max": round(float(df[col].max()), 2),
                }
        summary["key_statistics"] = key_stats

    return summary


def validate_query_result(
    df: pd.DataFrame, intent_data: Dict[str, Any]
) -> Tuple[bool, str]:
    """Validate that query result is meaningful"""
    if df.empty:
        return False, "No data returned from query"

    # Check if all values are null
    if df.isna().all().all():
        return False, "All values are null"

    # Check for single value (might indicate error)
    if len(df) == 1 and intent_data.get("action") in ["top", "list"]:
        return False, "Only one result returned"

    return True, "Valid result"
