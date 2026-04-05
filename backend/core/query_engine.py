import pandas as pd
import re
import json
from typing import Dict, List, Any, Tuple, Optional
from loguru import logger
import numpy as np
from difflib import SequenceMatcher


# =============================================================================
# 1. DATASET PROFILING - Auto-detect column types and characteristics
# =============================================================================


def dataset_profile(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Enhanced dataset profiling that works with ANY CSV.
    Automatically detects:
    - Numeric columns (int, float)
    - Categorical columns (text, categories)
    - Date/time columns
    - ID-like columns (high cardinality)
    - Boolean columns
    """
    numeric_cols = []
    categorical_cols = []
    datetime_cols = []
    id_cols = []
    boolean_cols = []

    for col in df.columns:
        col_data = df[col]

        # Skip completely empty columns
        if col_data.isna().all():
            continue

        # Boolean detection
        if col_data.dtype == bool or set(col_data.dropna().unique()).issubset(
            {0, 1, True, False, "yes", "no", "true", "false", "Y", "N"}
        ):
            boolean_cols.append(col)
            continue

        # Date/time detection (try to parse object columns as dates)
        if col_data.dtype == object:
            try:
                parsed = pd.to_datetime(
                    col_data, infer_datetime_format=True, errors="coerce"
                )
                if (
                    parsed.notna().sum() > len(col_data) * 0.5
                ):  # 50% can be parsed as dates
                    datetime_cols.append(col)
                    continue
            except:
                pass

        # Numeric detection
        if pd.api.types.is_numeric_dtype(col_data):
            # Check if it's an ID column (sequential integers with high cardinality)
            if pd.api.types.is_integer_dtype(col_data):
                unique_ratio = col_data.nunique() / len(col_data)
                if unique_ratio > 0.9:  # 90% unique values = likely ID
                    id_cols.append(col)
                    continue
            numeric_cols.append(col)
            continue

        # Categorical detection
        if col_data.dtype == object or col_data.dtype.name == "category":
            unique_ratio = col_data.nunique() / len(col_data)
            if unique_ratio < 0.5:  # Less than 50% unique = categorical
                categorical_cols.append(col)
            else:
                # High cardinality text - might be ID or free text
                id_cols.append(col)

    # Generate summary
    summary_parts = []
    summary_parts.append(f"{len(df):,} rows × {len(df.columns)} columns")
    if numeric_cols:
        summary_parts.append(f"numeric: {', '.join(numeric_cols[:3])}")
    if categorical_cols:
        summary_parts.append(f"categories: {', '.join(categorical_cols[:3])}")
    if datetime_cols:
        summary_parts.append(f"dates: {', '.join(datetime_cols[:2])}")

    return {
        "columns": df.columns.tolist(),
        "total_rows": len(df),
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "datetime_cols": datetime_cols,
        "id_cols": id_cols,
        "boolean_cols": boolean_cols,
        "summary": " | ".join(summary_parts),
        "column_types": {col: str(df[col].dtype) for col in df.columns},
        "starter_questions": generate_starter_questions(
            df, numeric_cols, categorical_cols, datetime_cols
        ),
    }


# =============================================================================
# 1.5 STARTER QUESTIONS - Auto-generate context-aware suggestions
# =============================================================================


def generate_starter_questions(
    df: pd.DataFrame,
    numeric_cols: List[str],
    categorical_cols: List[str],
    datetime_cols: List[str],
) -> List[str]:
    """
    Generate context-aware starter questions based on dataset structure.
    Works with ANY dataset by analyzing column names and types.
    """
    questions = []

    # Top values for numeric columns
    for col in numeric_cols[:3]:
        questions.append(f"Show top 5 by {col}")

    # Average per category
    if categorical_cols and numeric_cols:
        questions.append(f"Average {numeric_cols[0]} by {categorical_cols[0]}")

    # Distribution of categorical columns
    for col in categorical_cols[:2]:
        questions.append(f"Show distribution of {col}")

    # Count questions
    if categorical_cols:
        questions.append(f"Count records by {categorical_cols[0]}")

    # Summary
    questions.append("Give me a summary of this dataset")

    # Trend if datetime exists
    if datetime_cols and numeric_cols:
        questions.append(f"Show {numeric_cols[0]} trend over {datetime_cols[0]}")

    # Min/Max
    if numeric_cols:
        col = numeric_cols[0]
        questions.append(f"What is the maximum {col}?")
        questions.append(f"What is the minimum {col}?")

    # Comparison if categorical with few unique values
    if categorical_cols:
        cat_col = categorical_cols[0]
        unique_count = df[cat_col].nunique()
        if 2 <= unique_count <= 10:
            questions.append(f"Compare {numeric_cols[0]} across different {cat_col}")

    return questions[:8]  # Return max 8 questions


# =============================================================================
# 2. COLUMN INTELLIGENCE - Map user language to actual columns
# =============================================================================

# Semantic keyword mapping for column discovery
SEMANTIC_KEYWORDS = {
    # Sales/Revenue keywords
    "sales": [
        "sale",
        "sales",
        "revenue",
        "amount",
        "price",
        "cost",
        "value",
        "total",
        "money",
        "dollar",
        "earning",
    ],
    # Quantity keywords
    "quantity": [
        "quantity",
        "qty",
        "count",
        "number",
        "num",
        "units",
        "items",
        "volume",
    ],
    # Time keywords
    "time": [
        "date",
        "time",
        "year",
        "month",
        "week",
        "day",
        "episode",
        "season",
        "period",
        "quarter",
    ],
    # Category keywords
    "category": [
        "category",
        "type",
        "class",
        "group",
        "region",
        "location",
        "country",
        "city",
        "state",
        "department",
        "segment",
    ],
    # Person/Org keywords
    "identity": [
        "name",
        "person",
        "user",
        "customer",
        "company",
        "org",
        "id",
        "code",
        "number",
    ],
    # Performance keywords
    "performance": [
        "score",
        "rating",
        "rank",
        "performance",
        "efficiency",
        "quality",
        "grade",
    ],
    # Size keywords
    "size": [
        "size",
        "length",
        "width",
        "height",
        "weight",
        "area",
        "volume",
        "dimension",
    ],
}


def semantic_column_match(
    user_term: str, columns: List[str], column_types: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Match user's natural language to actual column names using semantic similarity.
    Works with ANY dataset by using fuzzy matching and semantic keywords.
    """
    if not user_term or not columns:
        return None

    user_term_clean = user_term.lower().strip()

    # Direct exact match (case insensitive)
    for col in columns:
        if col.lower() == user_term_clean:
            return col

    # Partial match (column contains user term)
    for col in columns:
        if user_term_clean in col.lower():
            return col

    # User term contains column name
    for col in columns:
        if col.lower() in user_term_clean:
            return col

    # Semantic matching using keywords
    for col in columns:
        col_lower = col.lower().replace("_", " ")
        col_words = col_lower.split()

        # Check if user term matches any semantic keyword group
        for category, keywords in SEMANTIC_KEYWORDS.items():
            if user_term_clean in keywords:
                for keyword in keywords:
                    if keyword in col_lower:
                        return col

        # Direct word overlap
        user_words = user_term_clean.split()
        for user_word in user_words:
            for col_word in col_words:
                if user_word == col_word:
                    return col
                # Typo tolerance (allow 1-2 character differences)
                if abs(len(user_word) - len(col_word)) <= 2:
                    similarity = SequenceMatcher(None, user_word, col_word).ratio()
                    if similarity > 0.8:
                        return col

    # Semantic keyword matching
    for col in columns:
        col_lower = col.lower()
        # Check if column name contains semantic keywords
        for category, keywords in SEMANTIC_KEYWORDS.items():
            for keyword in keywords:
                if keyword in col_lower:
                    return col

    # Special handling for "askedFor" style columns (camelCase with number)
    # Try to match "asked" or "ask" to "askedFor"
    if "asked" in user_term_clean or "ask" in user_term_clean:
        for col in columns:
            if "asked" in col.lower():
                return col

    # Try to match individual words in the query to column names
    # This helps when user says "average askedFor" and column is "askedFor"
    for col in columns:
        # Check if column name or its components match any part of the query
        col_parts = col.lower().replace("_", "").replace("-", "")
        if col_parts in user_term_clean.replace(" ", "").replace("_", "").replace(
            "-", ""
        ):
            return col

    return None


def find_best_column(
    columns: List[str], col_type: str, column_types: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Find the best column for a given type (numeric, categorical, datetime).
    Used when user doesn't specify a column.
    """
    if not columns:
        return None

    if col_type == "numeric":
        # Prefer columns with value/sales/revenue in name
        for col in columns:
            col_lower = col.lower()
            if any(
                k in col_lower
                for k in [
                    "value",
                    "sales",
                    "revenue",
                    "amount",
                    "price",
                    "score",
                    "count",
                ]
            ):
                return col
        # Return first numeric column
        return columns[0] if columns else None

    elif col_type == "categorical":
        # Prefer columns with name/category/type in name
        for col in columns:
            col_lower = col.lower()
            if any(
                k in col_lower
                for k in ["name", "category", "type", "group", "region", "country"]
            ):
                return col
        # Return first categorical column
        return columns[0] if columns else None

    elif col_type == "datetime":
        # Prefer columns with date/time in name
        for col in columns:
            col_lower = col.lower()
            if any(
                k in col_lower
                for k in ["date", "time", "year", "month", "episode", "season"]
            ):
                return col
        # Return first datetime column
        return columns[0] if columns else None

    return columns[0] if columns else None


def generate_column_stats(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Generates per-column statistics for the Data Explorer."""
    stats = []
    for col in df.columns:
        col_data = df[col]
        stat: Dict[str, Any] = {
            "name": col,
            "unique": int(col_data.nunique()),
            "missing": int(col_data.isna().sum()),
        }
        if pd.api.types.is_numeric_dtype(col_data):
            stat["type"] = "Numeric"
            stat["min"] = float(col_data.min()) if not col_data.empty else None
            stat["max"] = float(col_data.max()) if not col_data.empty else None
            stat["mean"] = float(col_data.mean()) if not col_data.empty else None
            stat["std"] = float(col_data.std()) if not col_data.empty else None
        else:
            stat["type"] = "Categorical"
            value_counts = col_data.value_counts()
            stat["top_values"] = value_counts.head(5).to_dict()
        stats.append(stat)
    return stats


# =============================================================================
# 3. DYNAMIC QUERY ENGINE - Convert user queries to Pandas operations
# =============================================================================


def extract_number(query: str, default: int = 10) -> int:
    """Extract number from query (e.g., 'top 5' → 5)."""
    match = re.search(r"\b(\d+)\b", query)
    return int(match.group(1)) if match else default


def detect_query_action(query_clean: str) -> Tuple[str, int]:
    """
    Detect what action the user wants to perform.
    Returns (action, limit)
    """
    # Preview/Data patterns - highest priority for row previews
    if re.search(r"\b(rows?|data|sample|preview|record[s]?)\b", query_clean):
        limit = extract_number(query_clean, 10)
        return "preview", limit

    # Count patterns
    if re.search(r"\b(count|how many|number of|total)\b", query_clean):
        return "count", 1

    # Average patterns
    if re.search(r"\b(average|mean|avg)\b", query_clean):
        return "average", 1

    # Sum patterns
    if re.search(r"\b(sum|total|add up)\b", query_clean):
        return "sum", 1

    # Max patterns
    if re.search(r"\b(max|maximum|highest|largest|biggest|most)\b", query_clean):
        limit = extract_number(query_clean, 1)
        return "max", limit

    # Min patterns
    if re.search(r"\b(min|minimum|lowest|smallest|least)\b", query_clean):
        limit = extract_number(query_clean, 1)
        return "min", limit

    # Top patterns
    if re.search(r"\b(top|best|highest|largest)\b", query_clean):
        limit = extract_number(query_clean, 10)
        return "top", limit

    # Bottom patterns
    if re.search(r"\b(bottom|worst|lowest|smallest)\b", query_clean):
        limit = extract_number(query_clean, 10)
        return "bottom", limit

    # List/show patterns
    if re.search(r"\b(list|show|display|get|fetch)\b", query_clean):
        limit = extract_number(query_clean, 10)
        return "list", limit

    # Compare patterns
    if re.search(r"\b(compare|versus|vs|difference)\b", query_clean):
        return "compare", 1

    # Trend patterns
    if re.search(r"\b(trend|change|over time|growth|decline)\b", query_clean):
        return "trend", 1

    # Date-aware aggregation patterns
    if re.search(r"\b(daily|by day)\b", query_clean):
        return "aggregate_daily", 1
    if re.search(r"\b(weekly|by week)\b", query_clean):
        return "aggregate_weekly", 1
    if re.search(r"\b(monthly|by month)\b", query_clean):
        return "aggregate_monthly", 1
    if re.search(r"\b(quarterly|by quarter)\b", query_clean):
        return "aggregate_quarterly", 1
    if re.search(r"\b(yearly|annually|by year)\b", query_clean):
        return "aggregate_yearly", 1

    # Summary patterns
    if re.search(r"\b(summary|overview|describe)\b", query_clean):
        return "summary", 1

    # Default: list with limit
    return "list", extract_number(query_clean, 10)


def detect_group_by(
    query_clean: str, columns: List[str], categorical_cols: List[str]
) -> Optional[str]:
    """Detect if user wants to group by a specific column."""
    # Look for explicit group by mentions
    match = re.search(r"(?:by|per|for each|group by|in each)\s+(\w+)", query_clean)
    if match:
        group_term = match.group(1)
        return semantic_column_match(group_term, columns)

    # If no explicit group by, but user is asking about categories
    if re.search(
        r"\b(each|every|per|in each|by category|by type|by region)\b", query_clean
    ):
        if categorical_cols:
            return categorical_cols[0]

    return None


def detect_filter(query_clean: str, columns: List[str]) -> Optional[Dict[str, Any]]:
    """Detect if user wants to filter data."""
    # Look for filter patterns
    filter_patterns = [
        r"(?:where|filter|only|just)\s+(\w+)\s*(?:is|=|equals|==)\s*(\w+)",
        r"(\w+)\s*(?:is|=|equals|==)\s*(\w+)",
    ]

    for pattern in filter_patterns:
        match = re.search(pattern, query_clean)
        if match:
            col_term = match.group(1)
            filter_value = match.group(2)

            # Find matching column
            col = semantic_column_match(col_term, columns)
            if col:
                return {"column": col, "value": filter_value}

    return None


def detect_intent(
    query: str, metadata: Dict[str, Any], history: List[Dict[str, Any]] = []
) -> Dict[str, Any]:
    """
    Enhanced intent detection that works with ANY dataset.
    Dynamically maps user language to actual columns and operations.
    """
    query_clean = query.lower().strip()
    columns = metadata.get("columns", [])
    numeric_cols = metadata.get("numeric_cols", [])
    categorical_cols = metadata.get("categorical_cols", [])
    datetime_cols = metadata.get("datetime_cols", [])

    # Detect action and limit
    action, limit = detect_query_action(query_clean)

    # Detect target column (what metric to analyze)
    target_col = None
    # First try to find a column mentioned in the query using case-insensitive matching
    query_lower = query_clean
    for col in columns:
        col_lower = col.lower()
        # Check if column name (without underscores/hyphens) appears in query
        col_normalized = col_lower.replace("_", "").replace("-", "")
        query_normalized = query_lower.replace("_", " ").replace("-", " ")

        if col_lower in query_lower or col_normalized in query_normalized:
            target_col = col
            break
        # Also check if column parts are in the query
        col_parts = col_lower.split("_")
        if any(part in query_lower for part in col_parts if len(part) > 2):
            target_col = col
            break

    # If no explicit column found, use semantic matching
    if not target_col:
        # Look for metric-like terms
        metric_terms = [
            "sales",
            "revenue",
            "value",
            "amount",
            "price",
            "score",
            "count",
            "quantity",
        ]
        for term in metric_terms:
            if term in query_clean:
                target_col = semantic_column_match(term, columns)
                if target_col:
                    break

    # If still no column, auto-select best numeric column
    if not target_col and action in [
        "average",
        "sum",
        "max",
        "min",
        "top",
        "bottom",
        "count",
    ]:
        target_col = find_best_column(numeric_cols, "numeric")

    # Detect group by column
    group_col = detect_group_by(query_clean, columns, categorical_cols)

    # Detect filter
    filter_info = detect_filter(query_clean, columns)

    # Detect comparison
    group_a = None
    group_b = None
    if action == "compare":
        # Try to find the two groups being compared
        compare_match = re.search(
            r"(?:compare|versus|vs)\s+(\w+)\s+(?:and|vs|versus)\s+(\w+)", query_clean
        )
        if compare_match:
            group_a = compare_match.group(1)
            group_b = compare_match.group(2)

    # Detect correlation intent
    is_correlation = False
    correlation_patterns = [
        r"correlation",
        r"correlate",
        r"relationship\s+between",
        r"how\s+.*related",
        r"related\s+to",
        r"depend",
    ]
    for pattern in correlation_patterns:
        if re.search(pattern, query_clean):
            is_correlation = True
            break

    # Detect drill_down intent (clicking on chart elements)
    is_drill_down = False
    drill_down_patterns = [
        r"drill\s*down",
        r"show\s+me\s+the.*row",
        r"details\s+for",
        r"clicked",
        r"selected",
    ]
    for pattern in drill_down_patterns:
        if re.search(pattern, query_clean):
            is_drill_down = True
            break

    # Determine intent
    intent = "unknown"
    if is_drill_down:
        intent = "drill_down"
    elif is_correlation:
        intent = "correlation"
    elif target_col:
        if group_col:
            intent = "grouped_aggregation"
        elif action in ["average", "sum", "count"]:
            intent = "aggregation"
        elif action in ["top", "bottom", "list", "max", "min"]:
            intent = "ranking"
        elif action == "compare":
            intent = "comparison"
        elif action == "trend":
            intent = "trend"
        elif action == "summary":
            intent = "summary"
        elif action == "preview":
            intent = "preview"
        elif action.startswith("aggregate_"):
            intent = action
    elif action == "summary":
        intent = "summary"
        target_col = "all"  # Special marker for full summary
    elif action == "preview":
        intent = "preview"
    elif action.startswith("aggregate_"):
        intent = action

    # Build result
    result = {
        "intent": intent,
        "action": action,
        "target_col": target_col,
        "group_col": group_col,
        "group_a": group_a,
        "group_b": group_b,
        "limit": limit,
        "filter": filter_info,
        "auto_selected": target_col is not None
        and not any(col.lower() in query_clean for col in columns),
    }

    return result


# =============================================================================
# 4. QUERY PROCESSING - Execute queries dynamically
# =============================================================================


def process_query(
    df: pd.DataFrame, intent_data: Dict[str, Any], profile: Dict[str, Any]
) -> Tuple[pd.DataFrame, str]:
    """
    Process queries dynamically for ANY dataset.
    Handles all query types with intelligent fallbacks.
    """
    intent = intent_data.get("intent", "unknown")
    action = intent_data.get("action", "summary")
    target = intent_data.get("target_col")
    group_col = intent_data.get("group_col")
    group_a = intent_data.get("group_a")
    group_b = intent_data.get("group_b")
    limit = intent_data.get("limit", 10)
    filter_info = intent_data.get("filter")
    columns = profile.get("columns", [])
    numeric_cols = profile.get("numeric_cols", [])

    # Apply filter if present
    if filter_info:
        filter_col = filter_info.get("column")
        filter_value = filter_info.get("value")
        if filter_col and filter_col in df.columns:
            df = df[
                df[filter_col]
                .astype(str)
                .str.contains(filter_value, case=False, na=False)
            ]

    # Handle different intents
    try:
        # Preview - show raw data rows (highest priority)
        if intent == "preview":
            result = df.head(limit)
            return result, f"Showing {min(limit, len(df))} rows from your data"

        # Drill down - show specific row details
        if intent == "drill_down":
            # Try to find row by the value mentioned in the query
            # Extract value from intent_data or query
            query_text = intent_data.get("query", "")
            # For now, just return top rows with more detail
            result = df.head(limit * 2)
            return result, f"Showing details for selected items"

        # Summary - full dataset overview
        if intent == "summary":
            summary_data = []
            for col in numeric_cols[:5]:  # Top 5 numeric columns
                if col in df.columns:
                    summary_data.append(
                        {
                            "Column": col,
                            "Mean": f"{df[col].mean():.2f}",
                            "Median": f"{df[col].median():.2f}",
                            "Min": f"{df[col].min():.2f}",
                            "Max": f"{df[col].max():.2f}",
                            "Std": f"{df[col].std():.2f}",
                        }
                    )
            if summary_data:
                return pd.DataFrame(summary_data), "Dataset summary generated"
            return df.head(10), "Here's a sample of your data"

        # Aggregation (average, sum, count)
        elif intent == "aggregation":
            if not target or target not in df.columns:
                return df.head(
                    0
                ), f"Column not found. Available columns: {', '.join(columns[:5])}"

            if action == "average":
                val = df[target].mean()
                result = pd.DataFrame({"Metric": [target], "Value": [f"{val:.2f}"]})
                return result, f"Average {target}: {val:.2f}"
            elif action == "sum":
                val = df[target].sum()
                result = pd.DataFrame({"Metric": [target], "Value": [f"{val:.2f}"]})
                return result, f"Total {target}: {val:.2f}"
            elif action == "count":
                val = df[target].count()
                result = pd.DataFrame({"Metric": [target], "Count": [val]})
                return result, f"Count of {target}: {val}"

        # Ranking (top, bottom, max, min, list)
        elif intent == "ranking":
            if not target or target not in df.columns:
                # Auto-select best column
                target = find_best_column(numeric_cols, "numeric")
                if not target:
                    return df.head(limit), f"Here are the first {limit} rows"

            if action in ["top", "max"]:
                result = df.nlargest(limit, target)[[target]]
                return result, f"Top {limit} by {target}"
            elif action in ["bottom", "min"]:
                result = df.nsmallest(limit, target)[[target]]
                return result, f"Bottom {limit} by {target}"
            elif action == "list":
                # If grouped, show grouped results
                if group_col and group_col in df.columns:
                    result = df.groupby(group_col)[target].mean().reset_index()
                    result = result.sort_values(by=target, ascending=False).head(limit)
                    return result, f"Average {target} by {group_col}"
                else:
                    result = df.sort_values(by=target, ascending=False).head(limit)
                    return result, f"Top {limit} by {target}"

        # Grouped aggregation
        elif intent == "grouped_aggregation":
            if not target or target not in df.columns:
                return df.head(
                    0
                ), f"Column not found. Available: {', '.join(columns[:5])}"
            if not group_col or group_col not in df.columns:
                # Try to auto-detect group column
                group_col = find_best_column(
                    profile.get("categorical_cols", []), "categorical"
                )
                if not group_col:
                    return df.head(0), "Please specify which column to group by"

            if action == "average":
                result = df.groupby(group_col)[target].mean().reset_index()
                result = result.sort_values(by=target, ascending=False).head(limit)
                return result, f"Average {target} by {group_col}"
            elif action == "sum":
                result = df.groupby(group_col)[target].sum().reset_index()
                result = result.sort_values(by=target, ascending=False).head(limit)
                return result, f"Total {target} by {group_col}"
            elif action == "count":
                result = df.groupby(group_col)[target].count().reset_index()
                result = result.sort_values(by=target, ascending=False).head(limit)
                return result, f"Count of {target} by {group_col}"
            elif action in ["top", "list"]:
                result = df.groupby(group_col)[target].mean().reset_index()
                result = result.sort_values(by=target, ascending=False).head(limit)
                return result, f"Top {limit} {group_col} by {target}"

        # Comparison
        elif intent == "comparison":
            if not group_col or group_col not in df.columns:
                group_col = find_best_column(
                    profile.get("categorical_cols", []), "categorical"
                )
                if not group_col:
                    return df.head(0), "Please specify which column to compare"

            if not target or target not in df.columns:
                target = find_best_column(numeric_cols, "numeric")
                if not target:
                    return df.head(0), "No numeric column found for comparison"

            # Get unique values for comparison
            unique_vals = df[group_col].unique()
            if len(unique_vals) >= 2:
                val_a = str(unique_vals[0])
                val_b = str(unique_vals[1])

                data_a = df[df[group_col].astype(str) == val_a][target].mean()
                data_b = df[df[group_col].astype(str) == val_b][target].mean()

                result = pd.DataFrame(
                    {
                        group_col: [val_a, val_b],
                        target: [f"{data_a:.2f}", f"{data_b:.2f}"],
                    }
                )
                return result, f"Comparison of {target} between {val_a} and {val_b}"

        # Trend
        elif intent == "trend":
            if not target or target not in df.columns:
                target = find_best_column(numeric_cols, "numeric")
            if not target:
                return df.head(0), "No numeric column found for trend analysis"

            # Show simple trend by grouping by index or datetime
            datetime_cols = profile.get("datetime_cols", [])
            if datetime_cols:
                time_col = datetime_cols[0]
                df_sorted = df.sort_values(by=time_col)
                result = df_sorted[[time_col, target]].head(50)
                return result, f"Trend of {target} over {time_col}"
            else:
                # Use index as proxy for time
                df_with_idx = df.reset_index()
                result = df_with_idx[["index", target]].head(50)
                return result, f"Trend of {target}"

        # Correlation - show correlation matrix data
        elif intent == "correlation":
            if not target or target not in df.columns:
                target = find_best_column(numeric_cols, "numeric")
            if not target or len(numeric_cols) < 2:
                return df.head(0), "Need at least 2 numeric columns for correlation"

            # Get two numeric columns for correlation
            second_col = None
            for col in numeric_cols:
                if col != target:
                    second_col = col
                    break

            if not second_col:
                return df.head(0), "Need another numeric column for correlation"

            # Calculate correlation between the two columns
            valid_data = df[[target, second_col]].dropna()
            if len(valid_data) < 2:
                return df.head(0), "Not enough data points for correlation"

            corr_value = valid_data[target].corr(valid_data[second_col])
            result = pd.DataFrame(
                {
                    "Column": [target, second_col],
                    "Correlation": [f"{corr_value:.3f}", f"{corr_value:.3f}"],
                }
            )
            return (
                result,
                f"Correlation between {target} and {second_col}: {corr_value:.3f}",
            )

        # Drill down - show details for selected items
        elif intent == "drill_down":
            if not target or target not in df.columns:
                target = find_best_column(numeric_cols, "numeric")
                if not target:
                    target = columns[0] if columns else None
            if target:
                result = df.sort_values(by=target, ascending=False).head(10)
                return result, f"Showing top records by {target}"
            return df.head(10), "Showing details"

        # Date-aware aggregation
        elif intent.startswith("aggregate_"):
            if not target or target not in df.columns:
                target = find_best_column(numeric_cols, "numeric")
            if not target:
                return df.head(0), "No numeric column found for aggregation"

            datetime_cols = profile.get("datetime_cols", [])
            if not datetime_cols:
                return df.head(0), "No date column found for time-based aggregation"

            time_col = datetime_cols[0]

            try:
                df_temp = df.copy()
                df_temp[time_col] = pd.to_datetime(df_temp[time_col], errors="coerce")
                df_temp = df_temp.dropna(subset=[time_col])

                freq_map = {
                    "aggregate_daily": "D",
                    "aggregate_weekly": "W-MON",
                    "aggregate_monthly": "MS",
                    "aggregate_quarterly": "QS",
                    "aggregate_yearly": "YS",
                }
                freq = freq_map.get(intent, "D")
                period_label = {
                    "aggregate_daily": "day",
                    "aggregate_weekly": "week",
                    "aggregate_monthly": "month",
                    "aggregate_quarterly": "quarter",
                    "aggregate_yearly": "year",
                }.get(intent, "period")

                df_temp = df_temp.set_index(time_col)
                result = df_temp[target].resample(freq).sum().reset_index()
                result = result.head(24)
                return result, f"Aggregated {target} by {period_label}"
            except Exception as e:
                logger.warning(f"Date aggregation failed: {e}")
                return df.head(0), "Could not perform date aggregation"

        # Fallback
        return df.head(limit), f"Here's a sample of your data ({limit} rows)"

    except Exception as e:
        logger.error(f"Query processing error: {e}")
        return (
            df.head(0),
            "I couldn't process that query. Try asking about specific columns in your data.",
        )


# =============================================================================
# 5. CHART INTELLIGENCE - Smart chart type detection and data mapping
# =============================================================================


# Keywords that indicate time/sequential columns
_TIME_KEYWORDS = frozenset(
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
        "index",
        "seq",
        "num",
        "number",
        "order",
        "rank",
        "position",
    ]
)

# Keywords that indicate categorical label columns
_LABEL_KEYWORDS = frozenset(
    [
        "name",
        "title",
        "label",
        "category",
        "type",
        "class",
        "group",
        "region",
        "country",
        "city",
        "status",
        "segment",
        "department",
    ]
)


def _is_time_column(col_name: str) -> bool:
    """Check if a column name suggests time/sequential data."""
    name = col_name.lower().replace("_", " ").replace("-", " ")
    return any(kw in name for kw in _TIME_KEYWORDS)


def _is_label_column(col_name: str) -> bool:
    """Check if a column name suggests a categorical label."""
    name = col_name.lower().replace("_", " ").replace("-", " ")
    return any(kw in name for kw in _LABEL_KEYWORDS)


def _detect_chart_type(
    label_col: Optional[str],
    value_col: str,
    n_rows: int,
    intent: str,
) -> str:
    """
    Determine the best chart type based on data shape.

    Rules:
    - correlation intent    -> scatter
    - time/episode column    -> line
    - trend intent           -> line
    - ranking/grouped        -> bar (default)
    - single numeric col     -> histogram
    - 2+ cols                -> bar
    - preview intent         -> none (table only)
    """
    # Correlation always gets a scatter plot
    if intent == "correlation":
        return "scatter"

    # Preview intent - no chart, just table
    if intent == "preview":
        return "none"

    # Drill down intent - show details as table
    if intent == "drill_down":
        return "none"

    # Trend always gets a line chart
    if intent == "trend":
        return "line"

    # Time-based label column -> line
    if label_col and _is_time_column(label_col):
        return "line"

    # Ranking / grouped / comparison -> bar
    if intent in ("ranking", "grouped_aggregation", "comparison"):
        return "bar"

    # No label column, single numeric -> histogram
    if label_col is None:
        return "histogram"

    # Default: bar for categorical + numeric
    return "bar"


def _select_columns(df: pd.DataFrame) -> Tuple[Optional[str], Optional[str]]:
    """
    Pick the best label column and value column from a result DataFrame.

    Returns (label_col, value_col) — either may be None if not found.
    """
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    non_numeric_cols = [
        c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])
    ]

    # No numeric columns → can't chart
    if not numeric_cols:
        return None, None

    # Pick the best label column from non-numeric cols
    label_col = None
    if non_numeric_cols:
        # Prefer time columns first, then label-like, then first non-numeric
        for c in non_numeric_cols:
            if _is_time_column(c):
                label_col = c
                break
        if not label_col:
            for c in non_numeric_cols:
                if _is_label_column(c):
                    label_col = c
                    break
        if not label_col:
            label_col = non_numeric_cols[0]

    # Pick the best value column from numeric cols
    value_col = None
    # Prefer columns with count/sum/avg/total in the name
    for c in numeric_cols:
        cl = c.lower()
        if any(
            k in cl for k in ("count", "sum", "avg", "total", "value", "mean", "amount")
        ):
            value_col = c
            break
    if not value_col:
        value_col = numeric_cols[0]

    return label_col, value_col


def _build_chart_rows(
    df: pd.DataFrame,
    label_col: Optional[str],
    value_col: str,
    max_rows: int = 10,
) -> List[Dict[str, Any]]:
    """
    Build clean chart data rows from a DataFrame.

    - Filters out nulls and non-numeric values
    - Truncates long labels
    - Limits to max_rows
    - Returns [{name: str, value: float}, ...]
    """
    rows: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        try:
            val = row[value_col]
            if pd.isna(val):
                continue
            val = float(val)
            if pd.isna(val):
                continue
        except (ValueError, TypeError):
            continue

        if label_col:
            label = row[label_col]
            if pd.isna(label):
                continue
            label = str(label).strip()
            if not label:
                continue
        else:
            label = str(len(rows) + 1)

        if len(label) > 20:
            label = label[:17] + "..."

        rows.append({"name": label, "value": round(val, 4)})

        if len(rows) >= max_rows:
            break

    return rows


def extract_chart_data(df: pd.DataFrame, intent_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Smart chart generator.

    1. Detect data shape
    2. Select best label + value columns
    3. Clean data (nulls, numeric, limit)
    4. Detect chart type (bar / line / histogram)
    5. Return {type, data} or {type: 'none', data: []}
    """
    # Fail-safe: need at least 2 rows
    if df.empty or len(df) < 2:
        return {"type": "none", "data": []}

    # Step 1: Select columns
    label_col, value_col = _select_columns(df)
    if value_col is None:
        return {"type": "none", "data": []}

    # Single-row aggregation with no label → no chart
    if len(df) == 1 and label_col is None:
        return {"type": "none", "data": []}

    # Step 2: Detect chart type
    intent = intent_data.get("intent", "")
    chart_type = _detect_chart_type(label_col, value_col, len(df), intent)

    # Step 3: Build clean data (limit 10 for bar/line, 12 for histogram)
    max_rows = 12 if chart_type == "histogram" else 10
    data = _build_chart_rows(df, label_col, value_col, max_rows=max_rows)

    # Fail-safe: need at least 2 data points
    if len(data) < 2:
        return {"type": "none", "data": []}

    return {"type": chart_type, "data": data}


def generate_chart_config(
    df: pd.DataFrame,
    intent_data: Dict[str, Any],
    profile: Dict[str, Any],
    query: str = "",
) -> Dict[str, Any]:
    """
    Generate structured chart configuration with premium settings.

    Returns:
    {
      type: "bar" | "line" | "pie" | "scatter",
      title: "",
      xAxis: "",
      yAxis: "",
      data: [],
      colors: ["#00E5FF", "#22D3EE"],
      showDataLabels: true
    }
    """
    chart_info = extract_chart_data(df, intent_data)

    if chart_info["type"] == "none" or not chart_info["data"]:
        return {
            "type": "none",
            "data": [],
            "title": "",
            "xAxis": "",
            "yAxis": "",
            "colors": [],
            "showDataLabels": False,
        }

    label_col, value_col = _select_columns(df)

    # Generate intelligent title
    action = intent_data.get("action", "list")
    target = intent_data.get("target_col", "")
    group_col = intent_data.get("group_col")

    title = ""
    if action == "top":
        limit = intent_data.get("limit", 10)
        title = f"Top {limit} {target}" if target else f"Top {limit} Results"
    elif action == "average":
        title = f"Average by {group_col}" if group_col else f"Average {target}"
    elif action == "sum":
        title = f"Total by {group_col}" if group_col else f"Total {target}"
    elif action == "trend":
        title = f"{target} Trend"
    elif action == "comparison":
        title = f"Comparison: {group_col}"
    else:
        title = f"{target} Analysis" if target else "Data Overview"

    # Determine colors based on chart type
    colors = ["#00E5FF", "#22D3EE", "#06B6D4", "#0891B2", "#0E7490"]
    if chart_info["type"] == "pie":
        colors = ["#00E5FF", "#22D3EE", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444"]
    elif chart_info["type"] == "line":
        colors = ["#00E5FF"]

    return {
        "type": chart_info["type"],
        "title": title,
        "xAxis": label_col or "Index",
        "yAxis": value_col or "Value",
        "data": chart_info["data"],
        "colors": colors,
        "showDataLabels": chart_info["type"] in ["bar", "pie"],
    }


def generate_multiple_charts(
    df: pd.DataFrame,
    intent_data: Dict[str, Any],
    profile: Dict[str, Any],
    query: str = "",
) -> List[Dict[str, Any]]:
    """
    Generate multiple charts if the query warrants it.
    Examples:
    - Trend analysis: line chart + bar chart
    - Comparison: bar chart + pie chart
    """
    charts = []

    # Always try to generate primary chart
    primary_chart = generate_chart_config(df, intent_data, profile, query)
    if primary_chart["type"] != "none":
        charts.append(primary_chart)

    # Check if we should generate additional charts
    intent = intent_data.get("intent", "")
    action = intent_data.get("action", "")

    # For grouped aggregations, also generate a pie chart for distribution
    if intent == "grouped_aggregation" and len(charts) > 0:
        group_col = intent_data.get("group_col")
        target_col = intent_data.get("target_col")

        if group_col and target_col:
            # Create a summary pie chart showing distribution
            try:
                grouped = df.groupby(group_col)[target_col].sum().reset_index()
                if len(grouped) <= 8:  # Only for reasonable number of categories
                    pie_data = []
                    for _, row in grouped.iterrows():
                        try:
                            val = float(row[target_col])
                            pie_data.append(
                                {
                                    "name": str(row[group_col])[:15],
                                    "value": round(val, 2),
                                }
                            )
                        except:
                            continue

                    if len(pie_data) >= 2:
                        charts.append(
                            {
                                "type": "pie",
                                "title": f"{target_col} Distribution",
                                "xAxis": group_col,
                                "yAxis": target_col,
                                "data": pie_data,
                                "colors": [
                                    "#00E5FF",
                                    "#22D3EE",
                                    "#8B5CF6",
                                    "#F59E0B",
                                    "#10B981",
                                    "#EF4444",
                                    "#EC4899",
                                    "#6366F1",
                                ],
                                "showDataLabels": True,
                            }
                        )
            except:
                pass

    return charts


# =============================================================================
# 6. AUTO INSIGHTS - Generate insights automatically
# =============================================================================


def run_advanced_auto_insights(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Computes statistical anomalies, dominance, and top performers natively."""
    insights = []

    # Dataset volume
    insights.append(
        {
            "type": "rows",
            "title": "Dataset Volume",
            "value": f"{len(df):,}",
            "explanation": "Total rows in your dataset.",
        }
    )

    # Column count
    insights.append(
        {
            "type": "info",
            "title": "Columns",
            "value": str(len(df.columns)),
            "explanation": f"Your dataset has {len(df.columns)} columns.",
        }
    )

    # Top numeric insights
    numeric_df = df.select_dtypes(include=["number"])
    for col in numeric_df.columns[:3]:  # Top 3 numeric columns
        if df[col].nunique() < 2:
            continue

        # Statistical significance - compare mean to median
        mean_val = df[col].mean()
        median_val = df[col].median()
        std_val = df[col].std()

        # Skewness detection
        if std_val > 0:
            skewness = (
                (mean_val - median_val) / std_val
            ) * 3  # Simplified skewness proxy
            if abs(skewness) > 1:
                insights.append(
                    {
                        "type": "stat",
                        "title": f"Distribution Skew in {col}",
                        "value": f"{'Right' if skewness > 0 else 'Left'} Skewed",
                        "explanation": f"Mean ({mean_val:.1f}) differs significantly from Median ({median_val:.1f}).",
                    }
                )

        # Anomaly detection
        avg_val = df[col].mean()
        z_scores = (df[col] - avg_val) / (df[col].std() + 1e-9)
        anomalies = df[np.abs(z_scores) > 3]
        if not anomalies.empty:
            insights.append(
                {
                    "type": "high",
                    "title": f"Anomaly in {col}",
                    "value": f"{len(anomalies)} Outliers",
                    "explanation": f"Found {len(anomalies)} unusual values in {col}.",
                }
            )

    # Categorical dominance
    cat_cols = df.select_dtypes(include=["object"])
    for cat in cat_cols.columns[:2]:  # Top 2 categorical columns
        if df[cat].nunique() > 1 and df[cat].nunique() < 20:
            value_counts = df[cat].value_counts()
            top_val = value_counts.index[0]
            top_pct = (value_counts.iloc[0] / len(df)) * 100
            if top_pct > 30:
                insights.append(
                    {
                        "type": "cat",
                        "title": f"{cat} Dominance",
                        "value": f"{top_pct:.1f}%",
                        "explanation": f"'{top_val}' appears in {top_pct:.1f}% of rows.",
                    }
                )

    return insights


# =============================================================================
# 7. DATA QUALITY - Analyze data quality
# =============================================================================


def data_quality_report(df: pd.DataFrame) -> Dict[str, Any]:
    """Comprehensive data quality analysis."""
    report = {
        "summary": {
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "overall_quality_score": 100,
        },
        "issues": [],
        "column_details": {},
    }

    quality_score = 100

    for col in df.columns:
        col_data = df[col]
        col_info = {
            "type": str(col_data.dtype),
            "missing_count": int(col_data.isna().sum()),
            "missing_percentage": float((col_data.isna().sum() / len(df)) * 100),
            "unique_count": int(col_data.nunique()),
            "issues": [],
        }

        # Missing values
        if col_info["missing_count"] > 0:
            severity = (
                "low"
                if col_info["missing_percentage"] < 5
                else "medium"
                if col_info["missing_percentage"] < 20
                else "high"
            )
            col_info["issues"].append(
                {
                    "type": "missing_values",
                    "severity": severity,
                    "message": f"{col_info['missing_count']} missing values ({col_info['missing_percentage']:.1f}%)",
                }
            )
            quality_score -= (
                5 if severity == "low" else 10 if severity == "medium" else 20
            )

        # Duplicates
        if len(df) > 1:
            duplicate_rows = df.duplicated().sum()
            if duplicate_rows > 0:
                report["issues"].append(
                    {
                        "type": "duplicate_rows",
                        "severity": "medium",
                        "column": col,
                        "message": f"{duplicate_rows} duplicate rows",
                    }
                )
                quality_score -= 5

        # Outliers
        if pd.api.types.is_numeric_dtype(col_data):
            Q1 = col_data.quantile(0.25)
            Q3 = col_data.quantile(0.75)
            IQR = Q3 - Q1
            outliers = ((col_data < Q1 - 1.5 * IQR) | (col_data > Q3 + 1.5 * IQR)).sum()
            if outliers > 0:
                col_info["issues"].append(
                    {
                        "type": "outliers",
                        "severity": "medium",
                        "message": f"{outliers} outliers detected",
                    }
                )
                quality_score -= 3

        report["column_details"][col] = col_info

    report["summary"]["overall_quality_score"] = max(0, quality_score)
    report["summary"]["assessment"] = (
        "excellent"
        if quality_score >= 90
        else "good"
        if quality_score >= 75
        else "fair"
        if quality_score >= 60
        else "poor"
    )

    return report


# =============================================================================
# 8. PREDICTION ENGINE - Simple trend prediction
# =============================================================================


def predict_query(
    df: pd.DataFrame, column: str, window: int = 3
) -> Tuple[Dict[str, Any], str]:
    """Simple prediction using rolling averages and trend projection."""
    if column not in df.columns:
        return {}, f"Column '{column}' not found."

    if not pd.api.types.is_numeric_dtype(df[column]):
        return {}, f"Column '{column}' must be numeric."

    series = df[column].dropna()
    if len(series) < window + 2:
        return {}, "Insufficient data for prediction."

    # Calculate trend
    recent = series.tail(10)
    x = np.arange(len(recent))
    slope, _ = np.polyfit(x, recent.values, 1)

    trend = "up" if slope > 0 else "down" if slope < 0 else "flat"
    predicted = float(recent.iloc[-1] + slope)

    return {
        "column": column,
        "current_value": float(series.iloc[-1]),
        "predicted_value": predicted,
        "trend_direction": trend,
        "confidence": "medium",
        "data_points": len(series),
    }, "Success"


# =============================================================================
# 9. COMPARISON ENGINE - Compare two groups
# =============================================================================


def compare_query(
    df: pd.DataFrame,
    group_col: str,
    group_a: str,
    group_b: str,
    profile: Dict[str, Any],
) -> Tuple[Dict[str, Any], str]:
    """Compare two groups across numeric columns."""
    if group_col not in df.columns:
        return {}, f"Column '{group_col}' not found."

    numeric_cols = profile.get("numeric_cols", [])
    if not numeric_cols:
        return {}, "No numeric columns for comparison."

    data_a = df[df[group_col].astype(str) == str(group_a)]
    data_b = df[df[group_col].astype(str) == str(group_b)]

    if data_a.empty:
        return {}, f"No data for '{group_a}'."
    if data_b.empty:
        return {}, f"No data for '{group_b}'."

    comparison = {
        "group_col": group_col,
        "group_a": {"name": group_a, "metrics": {}},
        "group_b": {"name": group_b, "metrics": {}},
        "comparison": {},
    }

    for col in numeric_cols:
        if col not in df.columns:
            continue
        a_val = data_a[col].mean()
        b_val = data_b[col].mean()
        if pd.isna(a_val) or pd.isna(b_val):
            continue

        diff = b_val - a_val
        pct = (diff / a_val * 100) if a_val != 0 else 0

        comparison["group_a"]["metrics"][col] = {"value": float(a_val)}
        comparison["group_b"]["metrics"][col] = {"value": float(b_val)}
        comparison["comparison"][col] = {
            "difference": float(diff),
            "percentage": float(pct),
            "better_group": "group_b" if b_val > a_val else "group_a",
        }

    return comparison, "Success"
